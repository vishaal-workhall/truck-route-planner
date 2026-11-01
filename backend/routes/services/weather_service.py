"""
Weather at every checkpoint's ETA, plus the 0-48 h corridor heatmap.

Time axis: every hourly series starts at the departure time rounded to the hour (`forecast_start`),
so index `h` means "departure + h hours". A checkpoint's weather is the series value at the hour
nearest its ETA. The series covers max(48 h, trip length) so long trips are never clamped.

Sources:
  - live:      Open-Meteo hourly forecast for every checkpoint and heatmap cell.
  - simulated: a deterministic storm scenario, a single field of (lat, lng, hour). Two routes passing
               the same place at the same hour see the same weather.
"""

import math
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone as dt_timezone
from typing import Any, Dict, List, Tuple

import requests
from django.conf import settings
from django.core.cache import cache

from .risk_engine import evaluate_checkpoint_risk

HEATMAP_HOURS = 48
OPEN_METEO_CHUNK_SIZE = 100
LIVE_CACHE_SECONDS = 15 * 60
HEATMAP_ROUTE_NODE_SPACING_MILES = 20.0
# Open-Meteo counts each location as one call (free tier: 600 per minute). Long trips at 10-mile
# spacing can exceed that, so samples are snapped to a coarser grid until a plan fits this budget.
LIVE_LOCATION_BUDGET = 550
SNAP_RESOLUTIONS_DEG = (0.01, 0.05, 0.1, 0.15, 0.2, 0.25)

Point = Tuple[float, float]
HourlySeries = List[Dict[str, float]]


class WeatherUnavailable(Exception):
    """Raised when the live forecast cannot be fetched."""


def _point_key(lat: float, lng: float, resolution: float = 0.01) -> Point:
    """Snap to a grid. 0.01 deg (~1 km) is finer than any forecast model, so nothing is lost."""
    return (
        round(round(lat / resolution) * resolution, 2),
        round(round(lng / resolution) * resolution, 2),
    )


def snap_resolution(points: List[Point], budget: int = LIVE_LOCATION_BUDGET) -> float:
    """Finest grid (at most 0.25 deg, about a global model's resolution) that fits the location budget."""
    for resolution in SNAP_RESOLUTIONS_DEG:
        if len({_point_key(lat, lng, resolution) for lat, lng in points}) <= budget:
            return resolution
    return SNAP_RESOLUTIONS_DEG[-1]


def forecast_window(departure_time: datetime, routes: List[Dict[str, Any]]) -> Tuple[datetime, int]:
    """Return (series start on the hour, number of hours) covering the slider and the longest trip."""
    departure_utc = departure_time.astimezone(dt_timezone.utc)
    start = (departure_utc + timedelta(minutes=30)).replace(minute=0, second=0, microsecond=0)
    longest_hours = max(
        (cp["elapsed_minutes"] / 60.0 for route in routes for cp in route["checkpoints"]), default=0.0
    )
    lead_hours = (departure_utc - start).total_seconds() / 3600.0
    hours = max(HEATMAP_HOURS, math.ceil(lead_hours + longest_hours) + 1)
    return start, hours


def eta_hour_index(departure_time: datetime, forecast_start: datetime, elapsed_hours: float) -> int:
    """Index into a series starting at `forecast_start` that is nearest to departure + elapsed."""
    lead_hours = (departure_time - forecast_start).total_seconds() / 3600.0
    return max(0, math.floor(lead_hours + elapsed_hours + 0.5))  # round half up


# --------------------------------------------------------------------------------------------
# Live forecast (Open-Meteo)
# --------------------------------------------------------------------------------------------


def _num(value: Any, default: float = 0.0) -> float:
    return float(value) if value is not None else default


def _request_open_meteo(points: List[Point], start: datetime, hours: int) -> List[HourlySeries]:
    end = start + timedelta(hours=hours)
    resp = requests.get(
        settings.OPEN_METEO_FORECAST_URL,
        params={
            "latitude": ",".join(f"{lat:.2f}" for lat, _ in points),
            "longitude": ",".join(f"{lng:.2f}" for _, lng in points),
            "hourly": "temperature_2m,wind_speed_10m,wind_gusts_10m,rain,showers,snowfall",
            "temperature_unit": "fahrenheit",
            "wind_speed_unit": "mph",
            "precipitation_unit": "inch",
            "timezone": "UTC",
            "start_hour": start.strftime("%Y-%m-%dT%H:%M"),
            "end_hour": end.strftime("%Y-%m-%dT%H:%M"),
        },
        timeout=8.0,
    )
    if resp.status_code == 429:
        raise WeatherUnavailable("weather provider rate limit reached, wait a minute.")
    if resp.status_code != 200:
        raise WeatherUnavailable(f"Open-Meteo returned HTTP {resp.status_code}.")
    payload = resp.json()
    locations = payload if isinstance(payload, list) else [payload]
    if len(locations) != len(points):
        raise WeatherUnavailable("Open-Meteo returned an unexpected number of locations.")

    series_list: List[HourlySeries] = []
    for location in locations:
        hourly = location.get("hourly") or {}
        times = hourly.get("time") or []
        if len(times) < hours + 1:
            raise WeatherUnavailable("Open-Meteo forecast does not cover the trip window.")
        series: HourlySeries = []
        for i in range(hours + 1):
            # Open-Meteo splits liquid precipitation into large-scale `rain` and convective `showers`.
            rain = _num(hourly["rain"][i]) + _num(hourly["showers"][i])
            series.append(
                {
                    "wind_mph": round(_num(hourly["wind_speed_10m"][i]), 1),
                    "gust_mph": round(_num(hourly["wind_gusts_10m"][i]), 1),
                    "rain_in_hr": round(rain, 2),
                    "snow_in_hr": round(_num(hourly["snowfall"][i]), 2),
                    "temperature_f": round(_num(hourly["temperature_2m"][i], 50.0), 1),
                }
            )
        series_list.append(series)
    return series_list


def fetch_live_series(points: List[Point], start: datetime, hours: int) -> Dict[Point, HourlySeries]:
    """Hourly forecast for each distinct point, from `start` for `hours` hours, cached briefly."""
    unique = list(dict.fromkeys(points))
    stamp = start.strftime("%Y%m%dT%H")
    result: Dict[Point, HourlySeries] = {}
    missing: List[Point] = []
    for point in unique:
        cached = cache.get(f"om:{point[0]}:{point[1]}:{stamp}:{hours}")
        if cached is not None:
            result[point] = cached
        else:
            missing.append(point)

    chunks = [
        missing[i : i + OPEN_METEO_CHUNK_SIZE]
        for i in range(0, len(missing), OPEN_METEO_CHUNK_SIZE)
    ]
    try:
        with ThreadPoolExecutor(max_workers=4) as pool:
            fetched = list(pool.map(lambda chunk: _request_open_meteo(chunk, start, hours), chunks))
    except requests.RequestException as exc:
        raise WeatherUnavailable(f"Open-Meteo request failed: {exc.__class__.__name__}.") from exc

    for chunk, chunk_series in zip(chunks, fetched):
        for point, series in zip(chunk, chunk_series):
            result[point] = series
            cache.set(f"om:{point[0]}:{point[1]}:{stamp}:{hours}", series, LIVE_CACHE_SECONDS)
    return result


# --------------------------------------------------------------------------------------------
# Simulated storm scenario
# --------------------------------------------------------------------------------------------


@dataclass(frozen=True)
class StormCell:
    lat: float
    lng: float
    hour: float  # forecast hour at which the cell is centred on (lat, lng)
    peak: float  # 0..1 intensity at the centre
    sigma_deg: float
    drift_lng_per_hour: float = 0.18
    drift_lat_per_hour: float = 0.04

    def intensity(self, lat: float, lng: float, hour: float) -> float:
        dt = hour - self.hour
        centre_lat = self.lat + self.drift_lat_per_hour * dt
        centre_lng = self.lng + self.drift_lng_per_hour * dt
        dy = lat - centre_lat
        dx = (lng - centre_lng) * math.cos(math.radians(lat))
        return self.peak * math.exp(-(dx * dx + dy * dy) / (2.0 * self.sigma_deg ** 2))


def build_storm_scenario(
    routes: List[Dict[str, Any]], departure_time: datetime, forecast_start: datetime
) -> List[StormCell]:
    """
    Place a storm so the rules can be demonstrated on any trip: a strong cell centred on the
    primary corridor's midpoint when the truck reaches it, and a weaker gale band on the last
    alternative. Cells drift east-north-east, so ETA and the slider both matter.
    """
    lead = (departure_time - forecast_start).total_seconds() / 3600.0
    first = routes[0]["checkpoints"]
    span_deg = math.hypot(
        first[-1]["lat"] - first[0]["lat"],
        (first[-1]["lng"] - first[0]["lng"]) * math.cos(math.radians(first[0]["lat"])),
    )
    sigma = min(1.4, max(0.45, span_deg * 0.12))

    def anchor(route: Dict[str, Any], fraction: float) -> Dict[str, Any]:
        cps = route["checkpoints"]
        return cps[min(len(cps) - 1, int(round(fraction * (len(cps) - 1))))]

    core = anchor(routes[0], 0.5)
    cells = [
        StormCell(core["lat"], core["lng"], lead + core["elapsed_hours"], 1.0, sigma),
    ]
    if len(routes) > 1:
        band = anchor(routes[-1], 0.4)
        cells.append(StormCell(band["lat"], band["lng"], lead + band["elapsed_hours"], 0.66, sigma * 0.8))
    return cells


def simulate_weather(cells: List[StormCell], lat: float, lng: float, hour: float) -> Dict[str, float]:
    """Deterministic weather from storm intensity at one place and forecast hour."""
    intensity = max((cell.intensity(lat, lng, hour) for cell in cells), default=0.0)

    wind_mph = 9.0 + 50.0 * intensity  # 1.0 -> 59 mph (No Travel), 0.52 -> 35 mph (High)
    precip_in_hr = max(0.0, intensity - 0.25) * 1.4  # liquid-equivalent rate

    mountains = -112.5 <= lng <= -104.5 and 36.0 <= lat <= 46.0
    temperature_f = (
        72.0
        - 1.5 * max(0.0, abs(lat) - 25.0)
        - (14.0 if mountains else 0.0)
        - 6.0 * intensity
        - 5.0 * math.cos(((hour % 24) - 14.0) * math.pi / 12.0)
    )
    if temperature_f <= 32.0:
        rain_in_hr, snow_in_hr = 0.0, precip_in_hr * 3.0
    else:
        rain_in_hr, snow_in_hr = precip_in_hr, 0.0

    return {
        "wind_mph": round(wind_mph, 1),
        "gust_mph": round(wind_mph * 1.35, 1),
        "rain_in_hr": round(rain_in_hr, 2),
        "snow_in_hr": round(snow_in_hr, 2),
        "temperature_f": round(temperature_f, 1),
    }


def simulated_series(cells: List[StormCell], points: List[Point], hours: int) -> Dict[Point, HourlySeries]:
    return {
        point: [simulate_weather(cells, point[0], point[1], float(h)) for h in range(hours + 1)]
        for point in dict.fromkeys(points)
    }


# --------------------------------------------------------------------------------------------
# Assembly
# --------------------------------------------------------------------------------------------


def _ambient_grid(routes: List[Dict[str, Any]]) -> List[Point]:
    """Regular grid over the routes' bounding box so the heatmap fills the corridor between routes."""
    lats = [pt[0] for route in routes for pt in route["geometry"]]
    lngs = [pt[1] for route in routes for pt in route["geometry"]]
    margin = 0.8
    lat_min, lat_max = min(lats) - margin, max(lats) + margin
    lng_min, lng_max = min(lngs) - margin, max(lngs) + margin
    width = (lng_max - lng_min) * math.cos(math.radians((lat_min + lat_max) / 2.0))
    height = lat_max - lat_min
    cols, rows = (7, 4) if width >= height else (4, 7)
    return [
        _point_key(
            lat_min + height * (r + 0.5) / rows,
            lng_min + (lng_max - lng_min) * (c + 0.5) / cols,
        )
        for r in range(rows)
        for c in range(cols)
    ]


def _hour_snapshot(item: Dict[str, float], hour: int, load_weight_lbs: int) -> Dict[str, Any]:
    risk = evaluate_checkpoint_risk(
        wind_mph=item["wind_mph"],
        rain_in_hr=item["rain_in_hr"],
        snow_in_hr=item["snow_in_hr"],
        load_weight_lbs=load_weight_lbs,
        temperature_f=item["temperature_f"],
    )["overall_risk"]
    return {
        "h": hour,
        "wind_mph": item["wind_mph"],
        "rain_in_hr": item["rain_in_hr"],
        "snow_in_hr": item["snow_in_hr"],
        "temperature_f": item["temperature_f"],
        "risk": risk,
    }


def populate_routes_weather_and_heatmap(
    routes: List[Dict[str, Any]],
    departure_time: datetime,
    load_weight_lbs: int,
    weather_mode: str,
) -> Tuple[List[Dict[str, Any]], Dict[str, Any], str]:
    """
    Attach to every checkpoint the weather and risk at its ETA (`weather`, `risk`) and its
    0-48 h hourly snapshots (`hourly_forecast`), and build the corridor heatmap.
    Raises WeatherUnavailable if live weather was requested and cannot be fetched.
    """
    departure_utc = departure_time.astimezone(dt_timezone.utc)
    start, hours = forecast_window(departure_utc, routes)
    raw_points = [(cp["lat"], cp["lng"]) for route in routes for cp in route["checkpoints"]]
    resolution = 0.01 if weather_mode == "simulated" else snap_resolution(raw_points)

    def key(lat: float, lng: float) -> Point:
        return _point_key(lat, lng, resolution)

    grid = [key(lat, lng) for lat, lng in _ambient_grid(routes)]
    checkpoint_points = [key(lat, lng) for lat, lng in raw_points]

    if weather_mode == "simulated":
        source = "simulated_storm_scenario"
        cells = build_storm_scenario(routes, departure_utc, start)
        series_by_point = simulated_series(cells, checkpoint_points + grid, hours)
    else:
        source = "live_open_meteo"
        series_by_point = fetch_live_series(checkpoint_points + grid, start, hours)

    snapshot_cache: Dict[Point, List[Dict[str, Any]]] = {}

    def snapshots(point: Point) -> List[Dict[str, Any]]:
        if point not in snapshot_cache:
            series = series_by_point[point]
            snapshot_cache[point] = [
                _hour_snapshot(series[h], h, load_weight_lbs) for h in range(HEATMAP_HOURS + 1)
            ]
        return snapshot_cache[point]

    heat_nodes: List[Dict[str, Any]] = []
    for route in routes:
        last_node_mile = -math.inf
        for cp in route["checkpoints"]:
            point = key(cp["lat"], cp["lng"])
            series = series_by_point[point]
            idx = min(hours, eta_hour_index(departure_utc, start, cp["elapsed_minutes"] / 60.0))
            at_eta = series[idx]
            cp["weather"] = {**at_eta, "forecast_hour": idx, "source": source}
            cp["risk"] = evaluate_checkpoint_risk(
                wind_mph=at_eta["wind_mph"],
                rain_in_hr=at_eta["rain_in_hr"],
                snow_in_hr=at_eta["snow_in_hr"],
                load_weight_lbs=load_weight_lbs,
                temperature_f=at_eta["temperature_f"],
            )
            cp["hourly_forecast"] = snapshots(point)

            if cp["mile"] - last_node_mile >= HEATMAP_ROUTE_NODE_SPACING_MILES:
                last_node_mile = cp["mile"]
                heat_nodes.append(
                    {"lat": cp["lat"], "lng": cp["lng"], "is_route_node": True, "hourly": snapshots(point)}
                )

    for lat, lng in dict.fromkeys(grid):
        heat_nodes.append(
            {"lat": lat, "lng": lng, "is_route_node": False, "hourly": snapshots((lat, lng))}
        )

    heatmap = {
        "min_hour": 0,
        "max_hour": HEATMAP_HOURS,
        "forecast_start_iso": start.isoformat(),
        "weather_source": source,
        "sample_grid_deg": resolution,
        "nodes": heat_nodes,
    }
    return routes, heatmap, source
