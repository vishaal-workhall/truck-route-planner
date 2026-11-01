import hashlib
import math
from datetime import datetime, timedelta
from typing import Any, Dict, List, Tuple
import requests
from django.conf import settings
from .risk_engine import evaluate_checkpoint_risk


def _deterministic_seed(lat: float, lng: float, salt: str = "") -> float:
    """Return a deterministic float in [0, 1) for a coordinate + salt."""
    digest = hashlib.sha256(f"{lat:.3f}:{lng:.3f}:{salt}".encode("utf-8")).hexdigest()
    return int(digest[:8], 16) / 0xFFFFFFFF


def _simulate_corridor_weather_at_hour(
    lat: float,
    lng: float,
    route_index: int,
    progress_ratio: float,
    hour_offset: float,
    origin_lat: float,
    origin_lng: float,
    dest_lat: float,
    dest_lng: float,
) -> Dict[str, float]:
    """
    Generate realistic, deterministic synoptic weather across the trip corridor and 0-48h window.
    Models moving frontal systems (crosswind jet streaks, rain squalls, or mountain snow bands)
    so that different route corridors and forecast hours exhibit meaningful, realistic differences.
    """
    mid_lat = (origin_lat + dest_lat) / 2.0
    mid_lng = (origin_lng + dest_lng) / 2.0
    corridor_span = math.hypot(dest_lat - origin_lat, dest_lng - origin_lng) or 1.0

    # Storm front tracks eastward and slightly northward over the 48-hour forecast window
    storm_drift_lng = (hour_offset - 5.0) * 0.085
    storm_drift_lat = math.sin(hour_offset / 9.0) * 0.28

    # Primary storm cell positioned near the northern/direct corridor mid-section
    cell1_lat = mid_lat + 0.42 + storm_drift_lat
    cell1_lng = mid_lng - 0.15 + storm_drift_lng
    dist_cell1 = math.hypot(lat - cell1_lat, lng - cell1_lng) / max(1.8, corridor_span * 0.36)
    intensity1 = math.exp(-(dist_cell1 ** 2) * 2.3)

    # Secondary squall line affecting extreme detour or late forecast window
    cell2_lat = mid_lat - 0.85 - storm_drift_lat * 0.6
    cell2_lng = mid_lng + 0.45 + storm_drift_lng * 0.7
    dist_cell2 = math.hypot(lat - cell2_lat, lng - cell2_lng) / max(1.6, corridor_span * 0.32)
    intensity2 = math.exp(-(dist_cell2 ** 2) * 2.6)

    # Route-specific corridor exposure modulation:
    # - route_index == 0 (Direct Primary Corridor): Crosses the storm core (45-53 mph wind / heavy precip -> Severe / No Travel for >30k lb)
    # - route_index == 1 (Safe Regional Bypass): Skirts south/around the front (18-31 mph wind -> Low / Moderate, 0 Severe/No-Travel miles)
    # - route_index == 2 (Secondary Alternative): Grazes the outer gale band (35-43 mph wind -> High risk, or Severe when load > 40,000 lb)
    if route_index == 0:
        corridor_bell = math.exp(-((progress_ratio - 0.52) ** 2) / 0.045)
        combined_storm = (0.22 + 0.78 * corridor_bell) * (0.55 + 0.45 * intensity1)
    elif route_index == 1:
        corridor_bell = math.exp(-((progress_ratio - 0.58) ** 2) / 0.08)
        combined_storm = (0.10 + 0.26 * corridor_bell) * (0.65 + 0.35 * intensity2)
    else:
        corridor_bell = math.exp(-((progress_ratio - 0.44) ** 2) / 0.055)
        combined_storm = (0.18 + 0.54 * corridor_bell) * (0.60 + 0.40 * max(intensity1, intensity2))

    local_ripple = 0.93 + 0.14 * _deterministic_seed(lat, lng, f"r{route_index}")
    synoptic_wave = 0.90 + 0.15 * math.sin((hour_offset + progress_ratio * 10.0) * math.pi / 16.0)

    combined_storm = min(1.05, combined_storm * local_ripple * synoptic_wave)

    # Base temperature determined by latitude & elevation proxy (Rockies/Plains vs South)
    is_high_elevation = -112.5 <= lng <= -103.5 and 37.5 <= lat <= 45.5
    base_temp_f = 68.0 - (lat - 30.0) * 2.1 - (11.0 if is_high_elevation else 0.0)
    diurnal_temp = -5.0 * math.cos(((hour_offset % 24) - 14.0) * math.pi / 12.0)
    temperature_f = round(base_temp_f + diurnal_temp - combined_storm * 8.0, 1)

    # Wind speed (mph): High Plains / Wyoming / Great Lakes corridors experience strong gusts
    is_wind_belt = (-108.0 <= lng <= -96.0 and 38.0 <= lat <= 46.0) or lat >= 41.0
    wind_base = 16.0 if is_wind_belt else 12.0
    wind_mph = round(
        max(6.0, min(62.0, wind_base + combined_storm * (36.0 if is_wind_belt else 27.0))),
        1,
    )

    # Precipitation partitioned into snow vs rain based on freezing temperature threshold
    precip_intensity = max(0.0, combined_storm - 0.26)
    if temperature_f <= 34.0:
        snow_in_hr = round(min(3.4, precip_intensity * 2.45), 2)
        rain_in_hr = round(min(0.12, precip_intensity * 0.08), 2) if temperature_f > 30.0 else 0.0
    else:
        snow_in_hr = 0.0
        rain_in_hr = round(min(1.18, precip_intensity * 0.82), 2)

    return {
        "wind_mph": wind_mph,
        "rain_in_hr": rain_in_hr,
        "snow_in_hr": snow_in_hr,
        "temperature_f": temperature_f,
    }


def _fetch_open_meteo_batch(
    sampled_points: List[Tuple[float, float]]
) -> List[Dict[str, Any]]:
    """
    Query Open-Meteo Forecast API for a batch of (lat, lng) coordinates.
    Returns hourly arrays for temperature_2m (F), wind_speed_10m / wind_gusts_10m (mph),
    rain (inch), snowfall (inch) for 48 hours.
    """
    if not sampled_points:
        return []

    lats = ",".join(f"{pt[0]:.3f}" for pt in sampled_points)
    lngs = ",".join(f"{pt[1]:.3f}" for pt in sampled_points)

    resp = requests.get(
        settings.OPEN_METEO_FORECAST_URL,
        params={
            "latitude": lats,
            "longitude": lngs,
            "hourly": "temperature_2m,wind_speed_10m,wind_gusts_10m,rain,snowfall",
            "temperature_unit": "fahrenheit",
            "wind_speed_unit": "mph",
            "precipitation_unit": "inch",
            "forecast_days": 3,
            "timezone": "UTC",
        },
        timeout=5.0,
    )
    if resp.status_code != 200:
        raise ValueError(f"Open-Meteo returned HTTP {resp.status_code}")

    data = resp.json()
    if isinstance(data, list):
        return data
    return [data]


def populate_routes_weather_and_heatmap(
    routes: List[Dict[str, Any]],
    origin: Dict[str, Any],
    destination: Dict[str, Any],
    departure_time: datetime,
    load_weight_lbs: int,
    weather_mode: str = "auto",
) -> Tuple[List[Dict[str, Any]], Dict[str, Any], str]:
    """
    Populate every checkpoint across all 3 routes with:
      1. Weather at the truck's exact ETA (`weather`)
      2. Deterministic risk evaluation at ETA (`risk`)
      3. Compact 0-48h forecast timeline (`forecast_48h`, sampled every 3 hours for slider interactivity)
    And generate the corridor-wide 0-48h weather heatmap dataset.
    """
    effective_mode = weather_mode or settings.DEFAULT_WEATHER_MODE or "auto"
    actual_weather_source = "simulated_corridor_scenario"

    # Attempt live Open-Meteo fetch when weather_mode is "live" or "auto"
    live_lookup: Dict[Tuple[int, int], Dict[str, Any]] = {}
    if effective_mode in ("live", "auto"):
        try:
            # Sample up to 8 representative points per route (24 points total) in a single batched HTTP call
            query_coords: List[Tuple[float, float]] = []
            query_keys: List[Tuple[int, int]] = []
            for r_idx, route in enumerate(routes):
                cps = route["checkpoints"]
                step = max(1, len(cps) // 7)
                for c_idx in range(0, len(cps), step):
                    query_coords.append((cps[c_idx]["lat"], cps[c_idx]["lng"]))
                    query_keys.append((r_idx, c_idx))
                if (r_idx, len(cps) - 1) not in query_keys:
                    query_coords.append((cps[-1]["lat"], cps[-1]["lng"]))
                    query_keys.append((r_idx, len(cps) - 1))

            meteo_results = _fetch_open_meteo_batch(query_coords)
            if len(meteo_results) == len(query_keys):
                for key, item in zip(query_keys, meteo_results):
                    hourly = item.get("hourly") or {}
                    if hourly.get("wind_speed_10m"):
                        live_lookup[key] = hourly
                if live_lookup:
                    actual_weather_source = "live_open_meteo"
        except Exception:
            actual_weather_source = "simulated_corridor_scenario"

    # If live weather is completely calm across all routes AND mode is "scenario", we use simulated storm
    if effective_mode == "simulated":
        actual_weather_source = "simulated_corridor_scenario"
        live_lookup = {}

    forecast_hours_step = 1  # Support every hour 0..48 for the heatmap slider

    for r_idx, route in enumerate(routes):
        cps = route["checkpoints"]
        num_cps = max(len(cps), 1)
        known_indices = sorted(k[1] for k in live_lookup.keys() if k[0] == r_idx)

        for c_idx, cp in enumerate(cps):
            progress_ratio = c_idx / max(num_cps - 1, 1)
            eta_hour_offset = max(0.0, min(48.0, float(cp["elapsed_hours"])))
            eta_hour_idx = min(48, max(0, int(round(eta_hour_offset))))

            hourly_series: List[Dict[str, Any]] = []

            if actual_weather_source == "live_open_meteo" and known_indices:
                # Find nearest fetched checkpoint hourly data on this route
                nearest_c_idx = min(known_indices, key=lambda k: abs(k - c_idx))
                hourly_data = live_lookup[(r_idx, nearest_c_idx)]
                winds = hourly_data.get("wind_speed_10m") or []
                gusts = hourly_data.get("wind_gusts_10m") or winds
                rains = hourly_data.get("rain") or []
                snows = hourly_data.get("snowfall") or []
                temps = hourly_data.get("temperature_2m") or []

                for h in range(0, 49, forecast_hours_step):
                    idx_h = min(h, len(winds) - 1) if winds else 0
                    # Blend sustained wind and gusts (trucks are sensitive to wind gusts)
                    sustained = float(winds[idx_h]) if winds else 10.0
                    gust = float(gusts[idx_h]) if gusts and idx_h < len(gusts) else sustained
                    effective_wind = round(max(sustained, sustained * 0.45 + gust * 0.55), 1)
                    rain_val = round(float(rains[idx_h]) if idx_h < len(rains) else 0.0, 2)
                    snow_val = round(float(snows[idx_h]) if idx_h < len(snows) else 0.0, 2)
                    temp_val = round(float(temps[idx_h]) if idx_h < len(temps) else 55.0, 1)

                    hourly_series.append(
                        {
                            "hour_offset": h,
                            "wind_mph": effective_wind,
                            "rain_in_hr": rain_val,
                            "snow_in_hr": snow_val,
                            "temperature_f": temp_val,
                        }
                    )
            else:
                for h in range(0, 49, forecast_hours_step):
                    sim = _simulate_corridor_weather_at_hour(
                        lat=cp["lat"],
                        lng=cp["lng"],
                        route_index=r_idx,
                        progress_ratio=progress_ratio,
                        hour_offset=float(h),
                        origin_lat=origin["lat"],
                        origin_lng=origin["lng"],
                        dest_lat=destination["lat"],
                        dest_lng=destination["lng"],
                    )
                    hourly_series.append(
                        {
                            "hour_offset": h,
                            **sim,
                        }
                    )

            eta_weather = hourly_series[eta_hour_idx]
            eta_risk = evaluate_checkpoint_risk(
                wind_mph=eta_weather["wind_mph"],
                rain_in_hr=eta_weather["rain_in_hr"],
                snow_in_hr=eta_weather["snow_in_hr"],
                load_weight_lbs=load_weight_lbs,
                temperature_f=eta_weather["temperature_f"],
            )

            cp["weather"] = {
                "wind_mph": eta_weather["wind_mph"],
                "rain_in_hr": eta_weather["rain_in_hr"],
                "snow_in_hr": eta_weather["snow_in_hr"],
                "temperature_f": eta_weather["temperature_f"],
                "source": actual_weather_source,
            }
            cp["risk"] = eta_risk

            # Attach 0-48h hourly risk & weather snapshots so the frontend 0-48h slider updates
            # both the corridor heatmap AND checkpoint risk states instantaneously!
            cp["hourly_forecast"] = [
                {
                    "h": item["hour_offset"],
                    "wind_mph": item["wind_mph"],
                    "rain_in_hr": item["rain_in_hr"],
                    "snow_in_hr": item["snow_in_hr"],
                    "temperature_f": item["temperature_f"],
                    "risk": evaluate_checkpoint_risk(
                        wind_mph=item["wind_mph"],
                        rain_in_hr=item["rain_in_hr"],
                        snow_in_hr=item["snow_in_hr"],
                        load_weight_lbs=load_weight_lbs,
                        temperature_f=item["temperature_f"],
                    )["overall_risk"],
                }
                for item in hourly_series
            ]

    # Build ambient corridor weather grid points around the routes for a rich 0-48h heatmap
    heatmap_corridor = _build_corridor_heatmap_grid(
        routes=routes,
        origin=origin,
        destination=destination,
        load_weight_lbs=load_weight_lbs,
        weather_source=actual_weather_source,
    )

    return routes, heatmap_corridor, actual_weather_source


def _build_corridor_heatmap_grid(
    routes: List[Dict[str, Any]],
    origin: Dict[str, Any],
    destination: Dict[str, Any],
    load_weight_lbs: int,
    weather_source: str,
) -> Dict[str, Any]:
    """
    Build a spatial weather corridor grid covering all 3 routes plus surrounding buffer zones
    across 0-48 hours so the interactive 0-48h forecast slider renders a smooth heatmap.
    """
    nodes: List[Dict[str, Any]] = []

    # Include checkpoint nodes from all 3 routes + lateral corridor buffer nodes
    for r_idx, route in enumerate(routes):
        cps = route["checkpoints"]
        for c_idx, cp in enumerate(cps):
            nodes.append(
                {
                    "id": f"r{r_idx}_c{c_idx}",
                    "lat": cp["lat"],
                    "lng": cp["lng"],
                    "route_id": route["id"],
                    "is_route_node": True,
                    "hourly": cp["hourly_forecast"],
                }
            )

    # Add off-route corridor ambient weather cells so the heatmap fills the regional corridor
    lat_min = min(origin["lat"], destination["lat"]) - 1.2
    lat_max = max(origin["lat"], destination["lat"]) + 1.2
    lng_min = min(origin["lng"], destination["lng"]) - 1.5
    lng_max = max(origin["lng"], destination["lng"]) + 1.5

    grid_rows = 4
    grid_cols = 6
    for r in range(grid_rows):
        for c in range(grid_cols):
            g_lat = round(lat_min + (lat_max - lat_min) * (r + 0.5) / grid_rows, 4)
            g_lng = round(lng_min + (lng_max - lng_min) * (c + 0.5) / grid_cols, 4)
            progress = c / max(grid_cols - 1, 1)

            hourly_ambient: List[Dict[str, Any]] = []
            for h in range(0, 49):
                sim = _simulate_corridor_weather_at_hour(
                    lat=g_lat,
                    lng=g_lng,
                    route_index=r % 3,
                    progress_ratio=progress,
                    hour_offset=float(h),
                    origin_lat=origin["lat"],
                    origin_lng=origin["lng"],
                    dest_lat=destination["lat"],
                    dest_lng=destination["lng"],
                )
                risk_eval = evaluate_checkpoint_risk(
                    wind_mph=sim["wind_mph"],
                    rain_in_hr=sim["rain_in_hr"],
                    snow_in_hr=sim["snow_in_hr"],
                    load_weight_lbs=load_weight_lbs,
                    temperature_f=sim["temperature_f"],
                )
                hourly_ambient.append(
                    {
                        "h": h,
                        "wind_mph": sim["wind_mph"],
                        "rain_in_hr": sim["rain_in_hr"],
                        "snow_in_hr": sim["snow_in_hr"],
                        "temperature_f": sim["temperature_f"],
                        "risk": risk_eval["overall_risk"],
                    }
                )
            nodes.append(
                {
                    "id": f"ambient_{r}_{c}",
                    "lat": g_lat,
                    "lng": g_lng,
                    "route_id": None,
                    "is_route_node": False,
                    "hourly": hourly_ambient,
                }
            )

    return {
        "min_hour": 0,
        "max_hour": 48,
        "departure_iso": departure_time_iso(routes),
        "weather_source": weather_source,
        "nodes": nodes,
    }


def departure_time_iso(routes: List[Dict[str, Any]]) -> str:
    if routes and routes[0].get("checkpoints"):
        return routes[0]["checkpoints"][0]["eta_iso"]
    return datetime.utcnow().isoformat()
