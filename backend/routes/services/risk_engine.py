import re
from typing import Any, Dict, List, Optional, Tuple

# Canonical Risk Levels ordered by severity
RISK_LOW = "Low"
RISK_MODERATE = "Moderate"
RISK_HIGH = "High"
RISK_SEVERE = "Severe"
RISK_NO_TRAVEL = "No Travel"

RISK_SEVERITY_WEIGHT: Dict[str, int] = {
    RISK_LOW: 1,
    RISK_MODERATE: 2,
    RISK_HIGH: 3,
    RISK_SEVERE: 4,
    RISK_NO_TRAVEL: 5,
}

WEIGHT_TO_RISK_LEVEL: Dict[int, str] = {v: k for k, v in RISK_SEVERITY_WEIGHT.items()}

TRUCK_PROFILE_FACTORS: Dict[str, Dict[str, Any]] = {
    "dry_van": {
        "label": "53' Dry Van",
        "sail_area_factor": 1.0,
        "description": "High side-wall surface area increases crosswind sensitivity.",
    },
    "reefer": {
        "label": "53' Refrigerated Trailer",
        "sail_area_factor": 0.96,
        "description": "Heavy insulated box with high crosswind profile but lower center of gravity.",
    },
    "flatbed": {
        "label": "48' Flatbed",
        "sail_area_factor": 0.78,
        "description": "Lower side wind drag; exposed cargo requires tarping in heavy rain or snow.",
    },
    "tanker": {
        "label": "Liquid Bulk Tanker",
        "sail_area_factor": 0.88,
        "description": "Cylindrical profile reduces wind drag, but liquid surge increases braking risk on slick roads.",
    },
    "doubles": {
        "label": "Twin 28' Doubles",
        "sail_area_factor": 1.12,
        "description": "Articulated rear pup trailer is highly vulnerable to wind gusts and icy lane changes.",
    },
}


def format_minutes(minutes: float) -> str:
    """Human duration: 45 min, 3 h, 12 h 41 min."""
    total = int(round(abs(minutes)))
    hours, mins = divmod(total, 60)
    if hours == 0:
        return f"{mins} min"
    return f"{hours} h" if mins == 0 else f"{hours} h {mins} min"


def classify_wind_risk(wind_mph: float) -> str:
    """
    Classify base wind speed risk per assessment specification:
    - Low: < 25 mph
    - Moderate: 25-34 mph (25 <= wind < 35)
    - High: 35-44 mph (35 <= wind < 45)
    - Severe: 45-54 mph (45 <= wind < 55)
    - No Travel: >= 55 mph
    """
    if wind_mph >= 55.0:
        return RISK_NO_TRAVEL
    if wind_mph >= 45.0:
        return RISK_SEVERE
    if wind_mph >= 35.0:
        return RISK_HIGH
    if wind_mph >= 25.0:
        return RISK_MODERATE
    return RISK_LOW


def classify_rain_risk(rain_in_hr: float) -> str:
    """
    Classify rain precipitation rate (in/hr) per assessment specification:
    - Low: < 0.10 in/hr
    - Moderate: 0.10-0.25 in/hr
    - High: 0.25-0.50 in/hr
    - Severe: 0.50-1.00 in/hr
    - No Travel: > 1.00 in/hr
    """
    if rain_in_hr > 1.00:
        return RISK_NO_TRAVEL
    if rain_in_hr > 0.50:
        return RISK_SEVERE
    if rain_in_hr > 0.25:
        return RISK_HIGH
    if rain_in_hr >= 0.10:
        return RISK_MODERATE
    return RISK_LOW


def classify_snow_risk(snow_in_hr: float) -> str:
    """
    Classify snowfall rate (in/hr) per assessment specification:
    - Low: < 0.5 in/hr
    - Moderate: 0.5-1.0 in/hr
    - High: 1.0-2.0 in/hr
    - Severe: 2.0-3.0 in/hr
    - No Travel: > 3.0 in/hr
    """
    if snow_in_hr > 3.0:
        return RISK_NO_TRAVEL
    if snow_in_hr > 2.0:
        return RISK_SEVERE
    if snow_in_hr > 1.0:
        return RISK_HIGH
    if snow_in_hr >= 0.5:
        return RISK_MODERATE
    return RISK_LOW


def apply_load_wind_rules(
    wind_mph: float, load_weight_lbs: int
) -> Tuple[str, Optional[str]]:
    """
    Apply deterministic wind + load weight interaction rules per specification:
    1. >= 55 mph -> No Travel for any load
    2. 45-54 mph + > 30,000 lb -> No Travel
    3. 35-44 mph + > 40,000 lb -> Severe

    Returns (effective_wind_risk, escalation_note).
    """
    base_wind_risk = classify_wind_risk(wind_mph)

    if wind_mph >= 55.0:
        return RISK_NO_TRAVEL, None  # No Travel for every load, so not a load escalation

    if 45.0 <= wind_mph < 55.0 and load_weight_lbs > 30000:
        return (
            RISK_NO_TRAVEL,
            f"Wind {wind_mph:.0f} mph (45-54 mph band) with {load_weight_lbs:,} lb load (> 30,000 lb) escalates risk to No Travel.",
        )

    if 35.0 <= wind_mph < 45.0 and load_weight_lbs > 40000:
        return (
            RISK_SEVERE,
            f"Wind {wind_mph:.0f} mph (35-44 mph band) with {load_weight_lbs:,} lb load (> 40,000 lb) escalates risk from High to Severe.",
        )

    return base_wind_risk, None


def classify_road_condition(
    wind_mph: float,
    rain_in_hr: float,
    snow_in_hr: float,
    temperature_f: float,
) -> Dict[str, str]:
    """
    Derive road pavement & corridor surface condition from checkpoint meteorology.
    """
    if snow_in_hr > 2.0 or (temperature_f <= 28.0 and snow_in_hr >= 1.0):
        return {
            "surface_state": "Ice & Deep Snow Pack",
            "risk_level": RISK_SEVERE if snow_in_hr <= 3.0 else RISK_NO_TRAVEL,
            "advisory": "Chain law / severe traction loss risk; reduced stopping sight distance.",
        }
    if snow_in_hr >= 0.5 or (temperature_f <= 32.0 and rain_in_hr >= 0.10):
        return {
            "surface_state": "Slush / Black Ice Potential",
            "risk_level": RISK_HIGH if snow_in_hr > 1.0 or temperature_f <= 30.0 else RISK_MODERATE,
            "advisory": "Freezing surface moisture on bridge decks and shaded grades.",
        }
    if rain_in_hr > 0.50:
        return {
            "surface_state": "Standing Water / Hydroplane Risk",
            "risk_level": RISK_SEVERE if rain_in_hr <= 1.0 else RISK_NO_TRAVEL,
            "advisory": "Heavy downpour reduces visibility and increases braking distance by 40%+.",
        }
    if rain_in_hr >= 0.10:
        return {
            "surface_state": "Wet Pavement",
            "risk_level": RISK_MODERATE if rain_in_hr <= 0.25 else RISK_HIGH,
            "advisory": "Wet roadway surface; maintain increased following distance.",
        }
    if wind_mph >= 35.0:
        return {
            "surface_state": "Dry - High Crosswind Gust Corridor",
            "risk_level": RISK_HIGH if wind_mph < 45.0 else RISK_SEVERE,
            "advisory": "Dry pavement, but strong lateral gusts affect trailer lane stability.",
        }
    return {
        "surface_state": "Dry & Clear",
        "risk_level": RISK_LOW,
        "advisory": "Normal highway surface traction and visibility.",
    }


def evaluate_checkpoint_risk(
    wind_mph: float,
    rain_in_hr: float,
    snow_in_hr: float,
    load_weight_lbs: int,
    temperature_f: float = 52.0,
) -> Dict[str, Any]:
    """
    Evaluate all weather, load-rule, and road-surface risks at a single route checkpoint.
    """
    base_wind_risk = classify_wind_risk(wind_mph)
    effective_wind_risk, load_escalation_note = apply_load_wind_rules(
        wind_mph, load_weight_lbs
    )
    rain_risk = classify_rain_risk(rain_in_hr)
    snow_risk = classify_snow_risk(snow_in_hr)
    road_condition = classify_road_condition(
        wind_mph=wind_mph,
        rain_in_hr=rain_in_hr,
        snow_in_hr=snow_in_hr,
        temperature_f=temperature_f,
    )

    # Determine dominant risk driver
    component_risks = {
        "wind": effective_wind_risk,
        "rain": rain_risk,
        "snow": snow_risk,
    }
    overall_weight = max(RISK_SEVERITY_WEIGHT[r] for r in component_risks.values())
    overall_risk = WEIGHT_TO_RISK_LEVEL[overall_weight]

    dominant_factors: List[str] = []
    if RISK_SEVERITY_WEIGHT[effective_wind_risk] == overall_weight and overall_weight > 1:
        if load_escalation_note:
            dominant_factors.append(f"Wind + Load ({wind_mph:.0f} mph @ {load_weight_lbs:,} lbs)")
        else:
            dominant_factors.append(f"Wind ({wind_mph:.0f} mph)")
    if RISK_SEVERITY_WEIGHT[rain_risk] == overall_weight and overall_weight > 1:
        dominant_factors.append(f"Rain ({rain_in_hr:.2f} in/hr)")
    if RISK_SEVERITY_WEIGHT[snow_risk] == overall_weight and overall_weight > 1:
        dominant_factors.append(f"Snow ({snow_in_hr:.2f} in/hr)")

    if not dominant_factors:
        dominant_factors.append("Calm Conditions")

    return {
        "overall_risk": overall_risk,
        "risk_severity_weight": overall_weight,
        "base_wind_risk": base_wind_risk,
        "effective_wind_risk": effective_wind_risk,
        "rain_risk": rain_risk,
        "snow_risk": snow_risk,
        "load_rule_triggered": load_escalation_note is not None,
        "load_escalation_note": load_escalation_note,
        "dominant_factor": ", ".join(dominant_factors),
        "road_condition": road_condition,
    }


def score_and_summarize_route(
    route_data: Dict[str, Any],
    load_weight_lbs: int,
    truck_type: str,
    fastest_duration_minutes: float,
) -> Dict[str, Any]:
    """
    Aggregate checkpoint risks across a route, calculate mileage in each risk band,
    and compute the deterministic, explainable Route Safety Score (0-100).
    """
    checkpoints: List[Dict[str, Any]] = route_data["checkpoints"]
    total_distance_miles: float = max(route_data["distance_miles"], 1.0)
    duration_minutes: float = max(route_data["duration_minutes"], 1.0)

    miles_by_risk: Dict[str, float] = {
        RISK_LOW: 0.0,
        RISK_MODERATE: 0.0,
        RISK_HIGH: 0.0,
        RISK_SEVERE: 0.0,
        RISK_NO_TRAVEL: 0.0,
    }
    counts_by_risk: Dict[str, int] = {
        RISK_LOW: 0,
        RISK_MODERATE: 0,
        RISK_HIGH: 0,
        RISK_SEVERE: 0,
        RISK_NO_TRAVEL: 0,
    }

    weighted_risk_sum = 0.0
    load_escalation_count = 0
    load_no_travel_count = 0
    load_escalation_miles = 0.0
    load_escalation_examples: List[str] = []

    peak_wind_mph = 0.0
    peak_rain_in_hr = 0.0
    peak_snow_in_hr = 0.0

    road_hazard_miles = 0.0
    surface_state_counts: Dict[str, int] = {}

    for cp in checkpoints:
        seg_miles = float(cp.get("segment_miles", 0.0))
        risk = cp["risk"]["overall_risk"]
        weight = cp["risk"]["risk_severity_weight"]

        miles_by_risk[risk] += seg_miles
        counts_by_risk[risk] += 1
        weighted_risk_sum += weight * seg_miles

        wind = float(cp["weather"]["wind_mph"])
        rain = float(cp["weather"]["rain_in_hr"])
        snow = float(cp["weather"]["snow_in_hr"])

        peak_wind_mph = max(peak_wind_mph, wind)
        peak_rain_in_hr = max(peak_rain_in_hr, rain)
        peak_snow_in_hr = max(peak_snow_in_hr, snow)

        if cp["risk"]["load_rule_triggered"]:
            if cp["risk"]["effective_wind_risk"] == RISK_NO_TRAVEL:
                load_no_travel_count += 1
            load_escalation_count += 1
            load_escalation_miles += seg_miles
            if len(load_escalation_examples) < 2 and cp["risk"]["load_escalation_note"]:
                loc = cp.get("label", f"Mile {cp['mile']:.0f}")
                load_escalation_examples.append(
                    f"{loc} (mi {cp['mile']:.0f}): {cp['risk']['load_escalation_note']}"
                )

        surface_state = cp["risk"]["road_condition"]["surface_state"]
        surface_state_counts[surface_state] = surface_state_counts.get(surface_state, 0) + 1
        surface_risk = cp["risk"]["road_condition"]["risk_level"]
        if surface_risk in (RISK_MODERATE, RISK_HIGH, RISK_SEVERE, RISK_NO_TRAVEL):
            road_hazard_miles += seg_miles * (
                0.35 if surface_risk == RISK_MODERATE else 0.75 if surface_risk == RISK_HIGH else 1.0
            )

    average_risk_score = round(weighted_risk_sum / total_distance_miles, 2)

    low_miles = round(miles_by_risk[RISK_LOW], 1)
    moderate_miles = round(miles_by_risk[RISK_MODERATE], 1)
    high_miles = round(miles_by_risk[RISK_HIGH], 1)
    severe_miles = round(miles_by_risk[RISK_SEVERE], 1)
    no_travel_miles = round(miles_by_risk[RISK_NO_TRAVEL], 1)

    # 1. Weather Sub-Score (0-100, 45% weight)
    weather_penalty_ratio = (
        0.0 * miles_by_risk[RISK_LOW]
        + 18.0 * miles_by_risk[RISK_MODERATE]
        + 52.0 * miles_by_risk[RISK_HIGH]
        + 85.0 * miles_by_risk[RISK_SEVERE]
        + 100.0 * miles_by_risk[RISK_NO_TRAVEL]
    ) / total_distance_miles
    peak_weather_penalty = 0.0
    if no_travel_miles > 0:
        peak_weather_penalty = 35.0
    elif severe_miles > 0:
        peak_weather_penalty = min(22.0, 8.0 + (severe_miles / total_distance_miles) * 35.0)
    elif high_miles > 0:
        peak_weather_penalty = min(12.0, 4.0 + (high_miles / total_distance_miles) * 20.0)

    weather_score = max(0, min(100, round(100.0 - weather_penalty_ratio - peak_weather_penalty)))

    # 2. Load & Weight Suitability Sub-Score (0-100, 25% weight)
    truck_profile = TRUCK_PROFILE_FACTORS.get(truck_type, TRUCK_PROFILE_FACTORS["dry_van"])
    sail_factor = float(truck_profile["sail_area_factor"])
    weight_ratio = min(1.25, max(0.5, load_weight_lbs / 40000.0))

    load_penalty = 0.0
    if peak_wind_mph >= 55.0:
        load_penalty += 75.0
    elif peak_wind_mph >= 45.0:
        load_penalty += 55.0 if load_weight_lbs > 30000 else 30.0
    elif peak_wind_mph >= 35.0:
        load_penalty += 38.0 if load_weight_lbs > 40000 else 18.0
    elif peak_wind_mph >= 25.0:
        load_penalty += 8.0 * weight_ratio

    load_penalty += (load_escalation_miles / total_distance_miles) * 65.0
    load_penalty *= sail_factor
    load_suitability_score = max(0, min(100, round(100.0 - load_penalty)))

    # 3. Road Condition Sub-Score (0-100, 20% weight)
    road_penalty = (road_hazard_miles / total_distance_miles) * 85.0
    if peak_snow_in_hr > 2.0 or peak_rain_in_hr > 0.75:
        road_penalty += 18.0
    road_condition_score = max(0, min(100, round(100.0 - road_penalty)))

    # 4. Schedule / Travel Time Efficiency Sub-Score (0-100, 10% weight)
    extra_time_pct = max(
        0.0, ((duration_minutes - fastest_duration_minutes) / max(fastest_duration_minutes, 1.0)) * 100.0
    )
    efficiency_score = max(25, min(100, round(100.0 - extra_time_pct * 2.2)))

    # Overall Safety Score (0-100)
    raw_overall = (
        0.45 * weather_score
        + 0.25 * load_suitability_score
        + 0.20 * road_condition_score
        + 0.10 * efficiency_score
    )

    # Enforce deterministic safety ceilings so severe/no-travel corridors cannot score high
    if no_travel_miles > 0:
        overall_safety_score = min(int(round(raw_overall)), 24)
        overall_risk_level = RISK_NO_TRAVEL
    elif severe_miles > 0:
        overall_safety_score = min(int(round(raw_overall)), 54)
        overall_risk_level = RISK_SEVERE
    elif high_miles > 0:
        overall_safety_score = min(int(round(raw_overall)), 76)
        overall_risk_level = RISK_HIGH
    elif moderate_miles > 0:
        overall_safety_score = max(68, min(int(round(raw_overall)), 91))
        overall_risk_level = RISK_MODERATE
    else:
        overall_safety_score = max(88, min(int(round(raw_overall)), 99))
        overall_risk_level = RISK_LOW

    # Determine dominant road surface summary
    predominant_surface = "Dry & Clear"
    for candidate in [
        "Ice & Deep Snow Pack",
        "Standing Water / Hydroplane Risk",
        "Slush / Black Ice Potential",
        "Dry - High Crosswind Gust Corridor",
        "Wet Pavement",
    ]:
        if surface_state_counts.get(candidate, 0) > 0:
            predominant_surface = candidate
            break

    # Determine load suitability status label
    if load_no_travel_count > 0:
        load_suitability_status = "Unsafe for Load (>30,000 lb Wind Rule Triggered)"
    elif no_travel_miles > 0:
        load_suitability_status = "Do Not Dispatch (No-Travel Conditions)"
    elif severe_miles > 0 and load_escalation_count > 0:
        load_suitability_status = "High Rollover Risk (>40,000 lb Wind Escalation)"
    elif load_suitability_score >= 82:
        load_suitability_status = f"Well-Suited for {load_weight_lbs:,} lb {truck_profile['label']}"
    elif load_suitability_score >= 60:
        load_suitability_status = f"Caution Advised for {load_weight_lbs:,} lb {truck_profile['label']}"
    else:
        load_suitability_status = f"Not Recommended for {load_weight_lbs:,} lb Load"

    return {
        "overall_safety_score": overall_safety_score,
        "overall_risk_level": overall_risk_level,
        "average_risk_score": average_risk_score,
        "component_scores": {
            "weather_score": weather_score,
            "load_suitability_score": load_suitability_score,
            "road_condition_score": road_condition_score,
            "efficiency_score": efficiency_score,
        },
        "risk_miles": {
            "low_miles": low_miles,
            "moderate_miles": moderate_miles,
            "high_miles": high_miles,
            "severe_miles": severe_miles,
            "no_travel_miles": no_travel_miles,
            "severe_plus_no_travel_miles": round(severe_miles + no_travel_miles, 1),
        },
        "checkpoint_counts": {
            "total": len(checkpoints),
            "low": counts_by_risk[RISK_LOW],
            "moderate": counts_by_risk[RISK_MODERATE],
            "high": counts_by_risk[RISK_HIGH],
            "severe": counts_by_risk[RISK_SEVERE],
            "no_travel": counts_by_risk[RISK_NO_TRAVEL],
        },
        "peak_conditions": {
            "max_wind_mph": round(peak_wind_mph, 1),
            "max_rain_in_hr": round(peak_rain_in_hr, 2),
            "max_snow_in_hr": round(peak_snow_in_hr, 2),
        },
        "load_analysis": {
            "load_weight_lbs": load_weight_lbs,
            "truck_type": truck_type,
            "truck_type_label": truck_profile["label"],
            "suitability_status": load_suitability_status,
            "escalation_checkpoints_count": load_escalation_count,
            "escalation_miles": round(load_escalation_miles, 1),
            "escalation_examples": load_escalation_examples,
            "profile_note": truck_profile["description"],
        },
        "road_condition_summary": {
            "predominant_hazard": predominant_surface,
            "affected_miles": round(road_hazard_miles, 1),
            "surface_breakdown": surface_state_counts,
        },
    }


# Average risk within this of the best route counts as a tie (1-5 scale), so a negligible
# risk edge cannot outweigh a much shorter trip; travel time then decides.
AVG_RISK_TOLERANCE = 0.1

# How a route compares on ranking criterion i when it wins / loses on it.
CRITERION_BETTER: Dict[int, str] = {
    0: "fewer No-Travel miles",
    1: "fewer Severe miles",
    2: "fewer High-risk miles",
    3: "lower average weather risk",
}
CRITERION_WORSE: Dict[int, str] = {
    0: "more No-Travel miles",
    1: "more Severe miles",
    2: "more High-risk miles",
    3: "higher average weather risk",
}


def _rank_key(route: Dict[str, Any], best_avg: float) -> Tuple[float, float, float, int, float]:
    """Assessment priority: No-Travel, Severe, High miles, average risk (with tolerance), time."""
    miles = route["safety"]["risk_miles"]
    return (
        round(miles["no_travel_miles"], 1),
        round(miles["severe_miles"], 1),
        round(miles["high_miles"], 1),
        int((route["safety"]["average_risk_score"] - best_avg) / AVG_RISK_TOLERANCE + 1e-9),
        round(route["duration_minutes"], 1),
    )


def rank_and_explain_routes(
    routes: List[Dict[str, Any]],
    load_weight_lbs: int,
    truck_type: str,
) -> List[Dict[str, Any]]:
    """
    Rank routes strictly following the assessment's recommendation priority:
      1. Fewest No-Travel miles & Severe miles
      2. Fewest High miles
      3. Lowest average risk
      4. Shortest travel time

    Then enrich every route with:
      - `is_recommended` boolean & `rank` (1, 2, 3)
      - `why_this_route` plain-language narrative
      - `key_reasons` bullet points
      - `comparison` vs recommended and vs fastest route
    """
    if not routes:
        return []

    fastest_duration = min(r["duration_minutes"] for r in routes)

    for route in routes:
        safety_summary = score_and_summarize_route(
            route_data=route,
            load_weight_lbs=load_weight_lbs,
            truck_type=truck_type,
            fastest_duration_minutes=fastest_duration,
        )
        route["safety"] = safety_summary

    best_avg = min(r["safety"]["average_risk_score"] for r in routes)
    sorted_routes = sorted(routes, key=lambda r: _rank_key(r, best_avg))

    # Keep the explanatory Safety Score consistent with the rank order.
    for idx, route in enumerate(sorted_routes):
        route["rank"] = idx + 1
        route["is_recommended"] = idx == 0
        # Letter routes by rank so "Route A" is always the recommendation.
        route["name"] = re.sub(r"^Route [A-Z]", f"Route {chr(65 + idx)}", route["name"])
        if idx > 0:
            prev_score = sorted_routes[idx - 1]["safety"]["overall_safety_score"]
            if route["safety"]["overall_safety_score"] >= prev_score:
                route["safety"]["overall_safety_score"] = max(0, prev_score - 3)

    recommended = sorted_routes[0]
    runner_up = sorted_routes[1] if len(sorted_routes) > 1 else None
    fastest = min(sorted_routes, key=lambda r: r["duration_minutes"])

    def deciding(better: Dict[str, Any], worse: Dict[str, Any]) -> Optional[int]:
        """Index of the first ranking criterion on which `better` beats `worse` (None if tied)."""
        for i, (a, b) in enumerate(zip(_rank_key(better, best_avg), _rank_key(worse, best_avg))):
            if a != b:
                return i
        return None

    def comparison_sentence(better: Dict[str, Any], worse: Dict[str, Any]) -> str:
        i = deciding(better, worse)
        bm, wm = better["safety"]["risk_miles"], worse["safety"]["risk_miles"]
        if i == 0:
            return f"{bm['no_travel_miles']:.0f} No-Travel miles vs {wm['no_travel_miles']:.0f} on {worse['name']}."
        if i == 1:
            return f"{bm['severe_miles']:.0f} Severe miles vs {wm['severe_miles']:.0f} on {worse['name']}."
        if i == 2:
            return f"{bm['high_miles']:.0f} High-risk miles vs {wm['high_miles']:.0f} on {worse['name']}."
        if i == 3:
            return (
                f"Average risk {better['safety']['average_risk_score']}/5 vs "
                f"{worse['safety']['average_risk_score']}/5 on {worse['name']}."
            )
        if i == 4:
            gap = format_minutes(worse["duration_minutes"] - better["duration_minutes"])
            return f"Weather risk is about the same as {worse['name']}, and it is {gap} faster."
        return f"It ties with {worse['name']} on every criterion."

    for route in sorted_routes:
        rm = route["safety"]["risk_miles"]
        peaks = route["safety"]["peak_conditions"]
        load_info = route["safety"]["load_analysis"]
        road_info = route["safety"]["road_condition_summary"]

        time_diff_vs_fastest = round(route["duration_minutes"] - fastest["duration_minutes"])
        time_diff_vs_rec = round(route["duration_minutes"] - recommended["duration_minutes"])
        dist_diff_vs_rec = round(route["distance_miles"] - recommended["distance_miles"], 1)
        score_diff_vs_rec = (
            route["safety"]["overall_safety_score"]
            - recommended["safety"]["overall_safety_score"]
        )
        is_fastest = route["id"] == fastest["id"]

        if is_fastest:
            time_note = "It is also the fastest of the three options."
        elif time_diff_vs_fastest <= 5:
            time_note = f"It is within {format_minutes(time_diff_vs_fastest)} of the fastest option."
        else:
            gains = CRITERION_BETTER.get(deciding(route, fastest), "lower weather risk")
            time_note = (
                f"It takes {format_minutes(time_diff_vs_fastest)} longer than {fastest['name']} "
                f"in exchange for {gains}."
            )

        key_reasons: List[Dict[str, str]] = []

        if route["is_recommended"]:
            if rm["no_travel_miles"] == 0 and rm["severe_miles"] == 0:
                key_reasons.append(
                    {
                        "type": "positive",
                        "text": f"No No-Travel or Severe weather across the {route['distance_miles']:.0f}-mile route.",
                    }
                )
            elif rm["no_travel_miles"] > 0:
                key_reasons.append(
                    {
                        "type": "critical",
                        "text": f"Still crosses {rm['no_travel_miles']:.0f} No-Travel miles: every option does. Consider a later departure.",
                    }
                )
            else:
                key_reasons.append(
                    {
                        "type": "warning",
                        "text": f"Crosses {rm['severe_miles']:.0f} Severe miles; every option has Severe or No-Travel weather.",
                    }
                )
            if runner_up is not None:
                key_reasons.append(
                    {"type": "positive", "text": f"Ranked first: {comparison_sentence(route, runner_up)}"}
                )
            if load_info["escalation_checkpoints_count"] == 0:
                key_reasons.append(
                    {
                        "type": "positive",
                        "text": f"No checkpoint where your {load_weight_lbs:,} lb load raises the wind risk (peak wind {peaks['max_wind_mph']:.0f} mph).",
                    }
                )
            else:
                key_reasons.append(
                    {
                        "type": "warning",
                        "text": f"{load_info['escalation_checkpoints_count']} checkpoint(s) where your {load_weight_lbs:,} lb load raises the wind risk.",
                    }
                )
            key_reasons.append(
                {"type": "positive" if time_diff_vs_fastest <= 5 else "info", "text": time_note}
            )

            why_this_route = (
                f"{route['name']} is recommended (Safety Score {route['safety']['overall_safety_score']}/100, "
                f"average checkpoint risk {route['safety']['average_risk_score']}/5)."
                + (f" {comparison_sentence(route, runner_up)}" if runner_up is not None else "")
                + f" {time_note}"
            )
            headline = (
                "Recommended: best balance of safety and travel time"
                if time_diff_vs_fastest <= 5
                else f"Recommended: +{format_minutes(time_diff_vs_fastest)} vs fastest for "
                f"{CRITERION_BETTER.get(deciding(route, fastest), 'lower weather risk')}"
            )
        else:
            if rm["no_travel_miles"] > 0:
                key_reasons.append(
                    {
                        "type": "critical",
                        "text": f"Contains {rm['no_travel_miles']:.0f} miles of No-Travel conditions (peak wind {peaks['max_wind_mph']:.0f} mph, rain {peaks['max_rain_in_hr']:.2f} in/hr, snow {peaks['max_snow_in_hr']:.2f} in/hr).",
                    }
                )
            if rm["severe_miles"] > 0:
                key_reasons.append(
                    {
                        "type": "critical",
                        "text": f"Exposes the truck to {rm['severe_miles']:.0f} miles of Severe weather.",
                    }
                )
            if rm["high_miles"] > 0:
                key_reasons.append(
                    {
                        "type": "warning",
                        "text": f"Includes {rm['high_miles']:.0f} miles of High weather risk ({road_info['predominant_hazard']}).",
                    }
                )
            if load_info["escalation_examples"]:
                key_reasons.append({"type": "critical", "text": load_info["escalation_examples"][0]})

            loses_on = deciding(recommended, route)
            if loses_on == 4 or loses_on is None:
                verdict = (
                    f"Its weather risk is about the same as {recommended['name']}, "
                    f"but it is {format_minutes(time_diff_vs_rec)} slower."
                )
                headline = f"Similar risk, +{format_minutes(time_diff_vs_rec)} slower"
            else:
                worse_on = CRITERION_WORSE[loses_on]
                if time_diff_vs_rec < 0:
                    verdict = (
                        f"It is {format_minutes(time_diff_vs_rec)} faster than {recommended['name']}, "
                        f"but has {worse_on}, which ranks first."
                    )
                    headline = f"{format_minutes(time_diff_vs_rec)} faster, but {worse_on}"
                else:
                    verdict = (
                        f"It is slower (+{format_minutes(time_diff_vs_rec)}) and has {worse_on} "
                        f"than {recommended['name']}."
                    )
                    headline = f"+{format_minutes(time_diff_vs_rec)} slower and {worse_on}"
            key_reasons.append({"type": "info" if time_diff_vs_rec < 0 else "warning", "text": verdict})

            why_this_route = (
                f"Ranked #{route['rank']} ({route['safety']['overall_safety_score']}/100). "
                f"This route has {rm['no_travel_miles']:.0f} No-Travel, {rm['severe_miles']:.0f} Severe and "
                f"{rm['high_miles']:.0f} High-risk miles (average risk {route['safety']['average_risk_score']}/5 vs "
                f"{recommended['safety']['average_risk_score']}/5 on {recommended['name']}). {verdict}"
            )

        route["safety"]["why_this_route"] = why_this_route
        route["safety"]["key_reasons"] = key_reasons
        route["safety"]["comparison"] = {
            "vs_recommended_minutes": time_diff_vs_rec,
            "vs_recommended_miles": dist_diff_vs_rec,
            "vs_recommended_safety_score": score_diff_vs_rec,
            "vs_fastest_minutes": time_diff_vs_fastest,
            "is_fastest": is_fastest,
            "tradeoff_headline": headline,
        }

    return sorted_routes
