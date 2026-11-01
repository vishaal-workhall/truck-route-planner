import math
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple
import requests
from django.conf import settings

# Curated US Freight Hubs for instant lookup & nearest-city checkpoint labeling
FREIGHT_HUBS: Dict[str, Dict[str, Any]] = {
    "chicago, il": {"name": "Chicago, IL", "lat": 41.8781, "lng": -87.6298},
    "denver, co": {"name": "Denver, CO", "lat": 39.7392, "lng": -104.9903},
    "salt lake city, ut": {"name": "Salt Lake City, UT", "lat": 40.7608, "lng": -111.8910},
    "dallas, tx": {"name": "Dallas, TX", "lat": 32.7767, "lng": -96.7970},
    "atlanta, ga": {"name": "Atlanta, GA", "lat": 33.7490, "lng": -84.3880},
    "buffalo, ny": {"name": "Buffalo, NY", "lat": 42.8864, "lng": -78.8784},
    "seattle, wa": {"name": "Seattle, WA", "lat": 47.6062, "lng": -122.3321},
    "minneapolis, mn": {"name": "Minneapolis, MN", "lat": 44.9778, "lng": -93.2650},
    "kansas city, mo": {"name": "Kansas City, MO", "lat": 39.0997, "lng": -94.5786},
    "omaha, ne": {"name": "Omaha, NE", "lat": 41.2565, "lng": -95.9345},
    "cheyenne, wy": {"name": "Cheyenne, WY", "lat": 41.1400, "lng": -104.8202},
    "laramie, wy": {"name": "Laramie, WY", "lat": 41.3114, "lng": -105.5911},
    "rock springs, wy": {"name": "Rock Springs, WY", "lat": 41.5875, "lng": -109.2029},
    "des moines, ia": {"name": "Des Moines, IA", "lat": 41.5868, "lng": -93.6250},
    "lincoln, ne": {"name": "Lincoln, NE", "lat": 40.8136, "lng": -96.7026},
    "north platte, ne": {"name": "North Platte, NE", "lat": 41.1239, "lng": -100.7654},
    "st. louis, mo": {"name": "St. Louis, MO", "lat": 38.6270, "lng": -90.1994},
    "indianapolis, in": {"name": "Indianapolis, IN", "lat": 39.7684, "lng": -86.1581},
    "columbus, oh": {"name": "Columbus, OH", "lat": 39.9612, "lng": -82.9988},
    "cleveland, oh": {"name": "Cleveland, OH", "lat": 41.4993, "lng": -81.6944},
    "toledo, oh": {"name": "Toledo, OH", "lat": 41.6528, "lng": -83.5379},
    "erie, pa": {"name": "Erie, PA", "lat": 42.1292, "lng": -80.0851},
    "pittsburgh, pa": {"name": "Pittsburgh, PA", "lat": 40.4406, "lng": -79.9959},
    "memphis, tn": {"name": "Memphis, TN", "lat": 35.1495, "lng": -90.0490},
    "nashville, tn": {"name": "Nashville, TN", "lat": 36.1627, "lng": -86.7816},
    "birmingham, al": {"name": "Birmingham, AL", "lat": 33.5186, "lng": -86.8104},
    "shreveport, la": {"name": "Shreveport, LA", "lat": 32.5252, "lng": -93.7502},
    "jackson, ms": {"name": "Jackson, MS", "lat": 32.2988, "lng": -90.1848},
    "little rock, ar": {"name": "Little Rock, AR", "lat": 34.7465, "lng": -92.2896},
    "oklahoma city, ok": {"name": "Oklahoma City, OK", "lat": 35.4676, "lng": -97.5164},
    "amarillo, tx": {"name": "Amarillo, TX", "lat": 35.2220, "lng": -101.8313},
    "albuquerque, nm": {"name": "Albuquerque, NM", "lat": 35.0844, "lng": -106.6504},
    "phoenix, az": {"name": "Phoenix, AZ", "lat": 33.4484, "lng": -112.0740},
    "las vegas, nv": {"name": "Las Vegas, NV", "lat": 36.1699, "lng": -115.1398},
    "los angeles, ca": {"name": "Los Angeles, CA", "lat": 34.0522, "lng": -118.2437},
    "sacramento, ca": {"name": "Sacramento, CA", "lat": 38.5816, "lng": -121.4944},
    "portland, or": {"name": "Portland, OR", "lat": 45.5152, "lng": -122.6784},
    "boise, id": {"name": "Boise, ID", "lat": 43.6150, "lng": -116.2023},
    "billings, mt": {"name": "Billings, MT", "lat": 45.7833, "lng": -108.5007},
    "fargo, nd": {"name": "Fargo, ND", "lat": 46.8772, "lng": -96.7898},
    "sioux falls, sd": {"name": "Sioux Falls, SD", "lat": 43.5446, "lng": -96.7311},
    "rapid city, sd": {"name": "Rapid City, SD", "lat": 44.0805, "lng": -103.2310},
    "salina, ks": {"name": "Salina, KS", "lat": 38.8403, "lng": -97.6114},
    "colby, ks": {"name": "Colby, KS", "lat": 39.3958, "lng": -101.0524},
    "grand junction, co": {"name": "Grand Junction, CO", "lat": 39.0639, "lng": -108.5506},
    "provo, ut": {"name": "Provo, UT", "lat": 40.2338, "lng": -111.6585},
    "fort collins, co": {"name": "Fort Collins, CO", "lat": 40.5853, "lng": -105.0844},
    "new york, ny": {"name": "New York, NY", "lat": 40.7128, "lng": -74.0060},
    "boston, ma": {"name": "Boston, MA", "lat": 42.3601, "lng": -71.0589},
    "houston, tx": {"name": "Houston, TX", "lat": 29.7604, "lng": -95.3698},
    "miami, fl": {"name": "Miami, FL", "lat": 25.7617, "lng": -80.1918},
}


def haversine_miles(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Compute great-circle distance in miles between two (lat, lng) points."""
    radius_earth_miles = 3958.7613
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lng2 - lng1)

    a = (
        math.sin(d_phi / 2.0) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2.0) ** 2
    )
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(max(0.0, 1.0 - a)))
    return radius_earth_miles * c


def nearest_hub_label(lat: float, lng: float) -> str:
    """Return a clean geographic reference label for a checkpoint coordinate."""
    best_name = ""
    best_dist = float("inf")
    for hub in FREIGHT_HUBS.values():
        d = haversine_miles(lat, lng, hub["lat"], hub["lng"])
        if d < best_dist:
            best_dist = d
            best_name = hub["name"]
    if best_dist <= 28.0:
        return f"Near {best_name}"
    if best_dist <= 85.0:
        return f"{best_dist:.0f} mi from {best_name}"
    return f"{abs(lat):.2f}{'N' if lat >= 0 else 'S'}, {abs(lng):.2f}{'E' if lng >= 0 else 'W'}"


def geocode_location(query: str) -> Dict[str, Any]:
    """
    Resolve an origin or destination string into {name, lat, lng, source}.
    1. Supports direct 'lat, lng' coordinates.
    2. Checks curated US freight hubs (instant, deterministic).
    3. Queries Open-Meteo Geocoding API for arbitrary cities.
    """
    cleaned = query.strip()
    if not cleaned:
        raise ValueError("Location cannot be empty.")

    # 1. Check direct coordinate pair "lat, lng"
    if "," in cleaned:
        parts = [p.strip() for p in cleaned.split(",")]
        if len(parts) == 2:
            try:
                lat_val = float(parts[0])
                lng_val = float(parts[1])
                if -90 <= lat_val <= 90 and -180 <= lng_val <= 180:
                    return {
                        "name": f"{lat_val:.3f}, {lng_val:.3f}",
                        "lat": lat_val,
                        "lng": lng_val,
                        "source": "coordinates",
                    }
            except ValueError:
                pass

    # 2. Check curated freight hubs (exact "city, st" or exact city name)
    lower_q = cleaned.lower()
    if lower_q in FREIGHT_HUBS:
        hub = FREIGHT_HUBS[lower_q]
        return {
            "name": hub["name"],
            "lat": hub["lat"],
            "lng": hub["lng"],
            "source": "freight_hub_directory",
        }

    for key, hub in FREIGHT_HUBS.items():
        city_only = key.split(",")[0].strip()
        if lower_q == city_only or lower_q.replace(" ", "") == key.replace(" ", ""):
            return {
                "name": hub["name"],
                "lat": hub["lat"],
                "lng": hub["lng"],
                "source": "freight_hub_directory",
            }

    # 3. Query Open-Meteo Geocoding API (any country, including India)
    search_term = cleaned.split(",")[0].strip()
    region_hint = cleaned.split(",")[1].strip() if "," in cleaned else ""
    country_codes = {
        "india": "IN",
        "usa": "US",
        "united states": "US",
    }
    country_code_hint = country_codes.get(region_hint.lower(), "")
    params: Dict[str, Any] = {
        "name": search_term,
        "count": 8,
        "language": "en",
        "format": "json",
    }
    if country_code_hint:
        params["countryCode"] = country_code_hint
    try:
        resp = requests.get(
            settings.OPEN_METEO_GEOCODE_URL,
            params=params,
            timeout=4.0,
        )
        if resp.status_code == 200:
            results = resp.json().get("results") or []
            if results:
                chosen = results[0]
                region_upper = region_hint.upper()
                if region_upper and not country_code_hint:
                    for candidate in results:
                        admin1 = (candidate.get("admin1") or "").upper()
                        if region_upper in admin1 or admin1.startswith(region_upper):
                            chosen = candidate
                            break
                admin1 = chosen.get("admin1", "")
                country_code = chosen.get("country_code", "")
                country_name = chosen.get("country", "")
                if admin1 and country_code and country_code != "US":
                    display_name = f"{chosen['name']}, {admin1}, {country_name or country_code}"
                elif admin1:
                    display_name = f"{chosen['name']}, {admin1}"
                else:
                    display_name = f"{chosen['name']}, {country_name or country_code}"
                return {
                    "name": display_name,
                    "lat": float(chosen["latitude"]),
                    "lng": float(chosen["longitude"]),
                    "source": "live_geocoding_api",
                }
    except requests.RequestException:
        pass

    raise ValueError(
        f"Could not resolve location '{query}'. Try a city such as 'Chicago, IL' or 'Denver, CO'."
    )


def _extract_osrm_corridor_name(osrm_route: Dict[str, Any], index: int, default_label: str) -> str:
    """Extract the highest-mileage highway references across OSRM leg steps."""
    legs = osrm_route.get("legs") or []
    ref_distances: Dict[str, float] = {}
    for leg in legs:
        for step in leg.get("steps") or []:
            ref = step.get("ref") or ""
            dist = float(step.get("distance") or 0.0)
            if ref and dist > 0:
                first_token = ref.replace("/", ";").split(";")[0].strip()
                if first_token:
                    ref_distances[first_token] = ref_distances.get(first_token, 0.0) + dist

    if ref_distances:
        top_refs = [
            k for k, _ in sorted(ref_distances.items(), key=lambda item: item[1], reverse=True)[:2]
        ]
        return f"Route {chr(65 + index)}: {' / '.join(top_refs)} ({default_label})"

    return f"Route {chr(65 + index)}: {default_label}"


# OSRM snaps each coordinate to the nearest road; beyond this the "route" starts somewhere else.
MAX_SNAP_METERS = 25_000


class NoDrivableRoute(ValueError):
    """The routing API is reachable but has no road route between the two places."""


def _query_osrm_Single(coords_str: str) -> List[Dict[str, Any]]:
    """
    Routes for `coords_str`, or [] when OSRM has no road route or had to snap the origin or
    destination more than MAX_SNAP_METERS away. Raises RequestException if OSRM is unavailable.
    """
    url = f"{settings.OSRM_BASE_URL}/route/v1/driving/{coords_str}"
    resp = requests.get(
        url,
        params={
            "alternatives": "3",
            "overview": "full",
            "geometries": "geojson",
            "steps": "true",
        },
        timeout=5.5,
    )
    try:
        payload = resp.json()
    except ValueError:
        payload = {}
    code = payload.get("code")
    if code in ("NoRoute", "NoSegment"):
        return []
    if resp.status_code != 200 or code != "Ok":
        raise requests.RequestException(f"OSRM returned HTTP {resp.status_code} ({code})")
    waypoints = payload.get("waypoints") or []
    if waypoints and max(
        float(waypoints[0].get("distance") or 0.0), float(waypoints[-1].get("distance") or 0.0)
    ) > MAX_SNAP_METERS:
        return []
    return payload.get("routes") or []


def _synthesize_corridor_geometry(
    origin: Dict[str, Any],
    destination: Dict[str, Any],
    lateral_offset_deg: float,
    num_points: int = 64,
) -> Tuple[List[List[float]], float, float]:
    """
    Create a realistic curved highway corridor polyline between origin and destination
    when offline or when generating distinct regional bypasses.
    Returns (coordinates_lat_lng, distance_miles, duration_minutes).
    """
    lat1, lng1 = origin["lat"], origin["lng"]
    lat2, lng2 = destination["lat"], destination["lng"]

    d_lat = lat2 - lat1
    d_lng = lng2 - lng1
    norm = math.hypot(d_lat, d_lng) or 1.0
    # Unit normal vector perpendicular to the direct corridor
    perp_lat = -d_lng / norm
    perp_lng = d_lat / norm

    coords: List[List[float]] = []
    total_miles = 0.0

    for i in range(num_points + 1):
        t = i / num_points
        # Smooth bell-shaped deflection peaking mid-route + subtle highway curvature harmonics
        arch = math.sin(math.pi * t)
        harmonic = 0.12 * math.sin(2.0 * math.pi * t)
        offset = lateral_offset_deg * (arch + harmonic)

        lat = lat1 + d_lat * t + perp_lat * offset
        lng = lng1 + d_lng * t + perp_lng * offset
        coords.append([round(lat, 5), round(lng, 5)])

        if i > 0:
            prev_lat, prev_lng = coords[i - 1]
            total_miles += haversine_miles(prev_lat, prev_lng, lat, lng)

    # Road network winding factor (~1.14x over smooth curve)
    road_miles = max(12.0, round(total_miles * 1.12, 1))
    # Heavy truck average highway speed (57-61 mph depending on corridor deflection)
    avg_truck_speed_mph = 60.5 - abs(lateral_offset_deg) * 1.4
    duration_minutes = round((road_miles / max(48.0, avg_truck_speed_mph)) * 60.0, 1)
    return coords, road_miles, duration_minutes


def _compass_side(d_lat: float, d_lng: float) -> str:
    """Name the dominant compass direction of a (lat, lng) offset vector."""
    if abs(d_lat) >= abs(d_lng):
        return "Northern" if d_lat > 0 else "Southern"
    return "Eastern" if d_lng > 0 else "Western"


def fetch_three_routes(
    origin: Dict[str, Any], destination: Dict[str, Any]
) -> Tuple[List[Dict[str, Any]], str]:
    """
    Generate 3 distinct truck route options between origin and destination.
    Uses live OSRM routing API first (including strategic North/South bypass waypoints
    when OSRM only returns 1-2 direct alternatives), and falls back cleanly to synthesized
    corridor geometry if external routing is unreachable.
    """
    raw_routes: List[Dict[str, Any]] = []
    routing_source = "live_osrm"

    lat1, lng1 = origin["lat"], origin["lng"]
    lat2, lng2 = destination["lat"], destination["lng"]
    direct_miles = haversine_miles(lat1, lng1, lat2, lng2)

    corridor_labels = ["Primary corridor", "Alternative corridor", "Second alternative"]

    try:
        # 1. Primary OSRM call requesting up to 3 alternatives
        direct_coords = f"{lng1},{lat1};{lng2},{lat2}"
        osrm_routes = _query_osrm_Single(direct_coords)
        if not osrm_routes:
            raise NoDrivableRoute(
                "No drivable road route connects these places. Check the origin and destination."
            )
        for idx, r in enumerate(osrm_routes[:3]):
            geojson_coords = r["geometry"]["coordinates"]
            lat_lng_coords = [[ round(pt[1], 5), round(pt[0], 5) ] for pt in geojson_coords]
            dist_miles = round(float(r["distance"]) * 0.000621371, 1)
            # Adjust passenger car duration by 1.12x for commercial heavy truck speed limits
            dur_minutes = round((float(r["duration"]) / 60.0) * 1.12, 1)
            raw_routes.append(
                {
                    "id": f"route_{idx + 1}",
                    "name": _extract_osrm_corridor_name(
                        r, idx, corridor_labels[idx % len(corridor_labels)]
                    ),
                    "corridor_type": corridor_labels[idx % len(corridor_labels)],
                    "distance_miles": max(1.0, dist_miles),
                    "duration_minutes": max(5.0, dur_minutes),
                    "geometry": lat_lng_coords,
                    "source": "live_osrm",
                }
            )

        # 2. If OSRM returned fewer than 3 routes, request North/South mid-corridor waypoint alternatives
        if len(raw_routes) < 3 and direct_miles > 25.0:
            d_lat = lat2 - lat1
            d_lng = lng2 - lng1
            norm = math.hypot(d_lat, d_lng) or 1.0
            perp_lat = -d_lng / norm
            perp_lng = d_lat / norm
            # Deflection proportional to corridor length (capped for realism)
            deflection_deg = min(2.2, max(0.35, norm * 0.16))

            bypass_configs = [
                (1.0, f"{_compass_side(perp_lat, perp_lng)} bypass"),
                (-1.0, f"{_compass_side(-perp_lat, -perp_lng)} bypass"),
                (1.65, f"Wide {_compass_side(perp_lat, perp_lng).lower()} detour"),
            ]

            for sign, bypass_label in bypass_configs:
                if len(raw_routes) >= 3:
                    break
                mid_lat = (lat1 + lat2) / 2.0 + perp_lat * deflection_deg * sign
                mid_lng = (lng1 + lng2) / 2.0 + perp_lng * deflection_deg * sign
                wp_coords = f"{lng1},{lat1};{mid_lng:.4f},{mid_lat:.4f};{lng2},{lat2}"
                try:
                    alt_list = _query_osrm_Single(wp_coords)
                except requests.RequestException:
                    continue
                if alt_list:
                    r = alt_list[0]
                    dist_miles = round(float(r["distance"]) * 0.000621371, 1)
                    # Check that it is meaningfully distinct from existing routes
                    if all(abs(dist_miles - existing["distance_miles"]) > 4.0 for existing in raw_routes):
                        idx = len(raw_routes)
                        geojson_coords = r["geometry"]["coordinates"]
                        lat_lng_coords = [
                            [round(pt[1], 5), round(pt[0], 5)] for pt in geojson_coords
                        ]
                        dur_minutes = round((float(r["duration"]) / 60.0) * 1.12, 1)
                        raw_routes.append(
                            {
                                "id": f"route_{idx + 1}",
                                "name": _extract_osrm_corridor_name(r, idx, bypass_label),
                                "corridor_type": bypass_label,
                                "distance_miles": max(1.0, dist_miles),
                                "duration_minutes": max(5.0, dur_minutes),
                                "geometry": lat_lng_coords,
                                "source": "live_osrm",
                            }
                        )
    except requests.RequestException:
        routing_source = "simulated_fallback"

    # 3. Ensure we always have 3 routes (fill any remaining slots with synthesized highway corridors)
    fallback_offsets = [0.0, 1.15, -1.25]
    while len(raw_routes) < 3:
        idx = len(raw_routes)
        offset = fallback_offsets[idx % len(fallback_offsets)]
        coords, dist_miles, dur_minutes = _synthesize_corridor_geometry(
            origin, destination, lateral_offset_deg=offset
        )
        if idx > 0 and raw_routes:
            # Ensure distinct distance/duration from Route 1
            base_dist = raw_routes[0]["distance_miles"]
            base_dur = raw_routes[0]["duration_minutes"]
            factor = 1.055 if idx == 1 else 1.09
            dist_miles = round(max(dist_miles, base_dist * factor), 1)
            dur_minutes = round(max(dur_minutes, base_dur * factor), 1)

        label = "Estimated corridor (no road data)"
        raw_routes.append(
            {
                "id": f"route_{idx + 1}",
                "name": f"Route {chr(65 + idx)}: {label}",
                "corridor_type": label,
                "distance_miles": dist_miles,
                "duration_minutes": dur_minutes,
                "geometry": coords,
                "source": "simulated_corridor" if routing_source != "live_osrm" else "hybrid_corridor",
            }
        )
        if routing_source == "live_osrm" and len(raw_routes) <= 3:
            routing_source = "live_osrm" if all(r["source"] == "live_osrm" for r in raw_routes) else "hybrid_osrm"

    # Downsample geometry for map rendering (~500 points keeps checkpoints on the road)
    for route in raw_routes:
        geom = route["geometry"]
        if len(geom) > 500:
            step = max(1, len(geom) // 500)
            sampled = geom[::step]
            if sampled[-1] != geom[-1]:
                sampled.append(geom[-1])
            route["geometry"] = sampled

    return raw_routes[:3], routing_source


# FMCSA property-carrying Hours-of-Service limits (single driver).
HOS_BREAK_AFTER_DRIVING_MIN = 8 * 60
HOS_BREAK_MIN = 30
HOS_MAX_DRIVING_MIN = 11 * 60
HOS_REST_MIN = 10 * 60


def hos_schedule(driving_minutes: float) -> Tuple[float, List[Dict[str, Any]]]:
    """
    Convert pure driving time into elapsed trip time for a single driver under FMCSA HOS:
    a 30-min break after 8 h of driving, and a 10-h rest after 11 h of driving.
    A stop is only taken when more driving remains after it.

    Returns (elapsed_minutes, stops) where each stop records the driving minute it starts at.
    """
    remaining = max(0.0, driving_minutes)
    elapsed = 0.0
    driven = 0.0
    since_break = 0.0
    since_rest = 0.0
    stops: List[Dict[str, Any]] = []
    while remaining > 1e-9:
        chunk = min(
            remaining,
            HOS_BREAK_AFTER_DRIVING_MIN - since_break,
            HOS_MAX_DRIVING_MIN - since_rest,
        )
        elapsed += chunk
        driven += chunk
        remaining -= chunk
        since_break += chunk
        since_rest += chunk
        if remaining <= 1e-9:
            break
        if since_rest >= HOS_MAX_DRIVING_MIN:
            kind, length = "10-hr rest", HOS_REST_MIN
            since_rest = 0.0
            since_break = 0.0
        else:
            kind, length = "30-min break", HOS_BREAK_MIN
            since_break = 0.0
        stops.append(
            {
                "kind": kind,
                "at_driving_minutes": round(driven, 1),
                "start_elapsed_minutes": round(elapsed, 1),
                "duration_minutes": length,
            }
        )
        elapsed += length
    return elapsed, stops


def hos_elapsed_minutes(driving_minutes: float) -> float:
    """Elapsed minutes from departure until the truck has driven `driving_minutes`."""
    return hos_schedule(driving_minutes)[0]


def apply_hos_to_route(route: Dict[str, Any]) -> None:
    """Store raw driving time and replace duration with HOS-compliant door-to-door time."""
    driving = float(route["duration_minutes"])
    elapsed, stops = hos_schedule(driving)
    distance = float(route["distance_miles"])
    for stop in stops:
        stop["mile"] = round(distance * stop["at_driving_minutes"] / max(driving, 1e-6), 1)
    route["driving_minutes"] = round(driving, 1)
    route["duration_minutes"] = round(elapsed, 1)
    route["hos_stops"] = stops


def sample_route_checkpoints(
    geometry: List[List[float]],
    total_distance_miles: float,
    driving_minutes: float,
    departure_time: datetime,
    interval_miles: int = 25,
) -> List[Dict[str, Any]]:
    """
    Sample checkpoints along the route polyline every `interval_miles` (10, 25, or 50 miles).
    Each checkpoint's ETA assumes constant speed along the route plus HOS breaks taken
    before reaching it, and carries the road miles it represents (half the gap to each neighbour).
    """
    if not geometry:
        return []

    # Compute cumulative geometric distances along polyline vertices
    cum_geom_miles: List[float] = [0.0]
    for i in range(1, len(geometry)):
        seg = haversine_miles(
            geometry[i - 1][0], geometry[i - 1][1], geometry[i][0], geometry[i][1]
        )
        cum_geom_miles.append(cum_geom_miles[-1] + seg)

    raw_geom_total = max(cum_geom_miles[-1], 0.001)
    scale_factor = total_distance_miles / raw_geom_total

    # Build target mileposts: 0, interval, 2*interval, ..., total_distance_miles
    mileposts: List[float] = []
    current_mile = 0.0
    step_miles = float(max(5, interval_miles))

    while current_mile < total_distance_miles:
        mileposts.append(round(current_mile, 1))
        current_mile += step_miles

    if not mileposts or abs(mileposts[-1] - total_distance_miles) > 2.0:
        mileposts.append(round(total_distance_miles, 1))
    else:
        mileposts[-1] = round(total_distance_miles, 1)

    checkpoints: List[Dict[str, Any]] = []
    num_posts = len(mileposts)

    for idx, target_mile in enumerate(mileposts):
        target_geom_mile = target_mile / scale_factor

        # Interpolate (lat, lng) along polyline
        lat, lng = geometry[-1][0], geometry[-1][1]
        for seg_idx in range(1, len(cum_geom_miles)):
            if cum_geom_miles[seg_idx] >= target_geom_mile:
                prev_m = cum_geom_miles[seg_idx - 1]
                next_m = cum_geom_miles[seg_idx]
                span = max(next_m - prev_m, 1e-6)
                ratio = max(0.0, min(1.0, (target_geom_mile - prev_m) / span))
                lat = geometry[seg_idx - 1][0] + ratio * (
                    geometry[seg_idx][0] - geometry[seg_idx - 1][0]
                )
                lng = geometry[seg_idx - 1][1] + ratio * (
                    geometry[seg_idx][1] - geometry[seg_idx - 1][1]
                )
                break

        progress_fraction = (
            target_mile / total_distance_miles if total_distance_miles > 0 else 0.0
        )
        elapsed_minutes = hos_elapsed_minutes(progress_fraction * driving_minutes)
        eta_dt = departure_time + timedelta(minutes=elapsed_minutes)

        # Compute attributable road miles for this checkpoint (Voronoi midpoint intervals)
        if num_posts == 1:
            segment_miles = total_distance_miles
        elif idx == 0:
            segment_miles = (mileposts[1] - mileposts[0]) / 2.0
        elif idx == num_posts - 1:
            segment_miles = (mileposts[-1] - mileposts[-2]) / 2.0
        else:
            segment_miles = (mileposts[idx + 1] - mileposts[idx - 1]) / 2.0

        checkpoints.append(
            {
                "index": idx,
                "mile": round(target_mile, 1),
                "segment_miles": round(max(0.0, segment_miles), 2),
                "lat": round(lat, 4),
                "lng": round(lng, 4),
                "label": (
                    "Origin Departure"
                    if idx == 0
                    else "Destination Arrival"
                    if idx == num_posts - 1
                    else nearest_hub_label(lat, lng)
                ),
                "eta_iso": eta_dt.isoformat(),
                "elapsed_minutes": round(elapsed_minutes, 1),
                "elapsed_hours": round(elapsed_minutes / 60.0, 2),
            }
        )

    return checkpoints
