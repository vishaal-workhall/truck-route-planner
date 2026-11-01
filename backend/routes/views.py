from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import RoutePlanQuery
from .serializers import RoutePlanHistorySerializer, RoutePlanRequestSerializer
from .services.risk_engine import (
    RISK_HIGH,
    RISK_LOW,
    RISK_MODERATE,
    RISK_NO_TRAVEL,
    RISK_SEVERE,
    rank_and_explain_routes,
)
from .services.routing_service import (
    FREIGHT_HUBS,
    fetch_three_routes,
    geocode_location,
    haversine_miles,
    sample_route_checkpoints,
)
from .services.weather_service import populate_routes_weather_and_heatmap


PRESET_SCENARIOS = [
    {
        "id": "high_plains_wind",
        "title": "High Plains Crosswind Alert",
        "subtitle": "I-80 vs I-70 Corridor - Heavy 42,000 lb Dry Van",
        "origin": "Omaha, NE",
        "destination": "Denver, CO",
        "load_weight_lbs": 42000,
        "truck_type": "dry_van",
        "sampling_interval_miles": 25,
        "weather_mode": "simulated",
        "highlight": "Tests >40,000 lb Severe and >30,000 lb No-Travel wind rules.",
    },
    {
        "id": "rockies_snow",
        "title": "Rocky Mountain Winter Squall",
        "subtitle": "Denver, CO to Salt Lake City, UT - 36,000 lb Reefer",
        "origin": "Denver, CO",
        "destination": "Salt Lake City, UT",
        "load_weight_lbs": 36000,
        "truck_type": "reefer",
        "sampling_interval_miles": 25,
        "weather_mode": "simulated",
        "highlight": "Compares mountain snow accumulation vs southern bypass.",
    },
    {
        "id": "midwest_live",
        "title": "Live Weather Dispatch (Open-Meteo + OSRM)",
        "subtitle": "Chicago, IL to Kansas City, MO - 38,000 lb Load",
        "origin": "Chicago, IL",
        "destination": "Kansas City, MO",
        "load_weight_lbs": 38000,
        "truck_type": "dry_van",
        "sampling_interval_miles": 25,
        "weather_mode": "live",
        "highlight": "Fetches real-time Open-Meteo 48h forecasts along OSRM routes.",
    },
    {
        "id": "southern_rain",
        "title": "Gulf Corridor Heavy Rain & Gusts",
        "subtitle": "Dallas, TX to Atlanta, GA - 44,500 lb Flatbed",
        "origin": "Dallas, TX",
        "destination": "Atlanta, GA",
        "load_weight_lbs": 44500,
        "truck_type": "flatbed",
        "sampling_interval_miles": 50,
        "weather_mode": "simulated",
        "highlight": "Long-haul 50-mile checkpoint sampling with moving rain squalls.",
    },
]


class HealthAndRulesAPIView(APIView):
    """
    GET /api/rules/
    Returns the deterministic weather & load threshold rules, preset freight corridors,
    and available city suggestions so the frontend can display transparent documentation.
    """

    def get(self, request):
        return Response(
            {
                "status": "ok",
                "rules": {
                    "thresholds": [
                        {
                            "condition": "Wind (mph)",
                            "low": "< 25 mph",
                            "moderate": "25-34 mph",
                            "high": "35-44 mph",
                            "severe": "45-54 mph",
                            "no_travel": ">= 55 mph",
                        },
                        {
                            "condition": "Rain (in/hr)",
                            "low": "< 0.10 in/hr",
                            "moderate": "0.10-0.25 in/hr",
                            "high": "0.25-0.50 in/hr",
                            "severe": "0.50-1.00 in/hr",
                            "no_travel": "> 1.00 in/hr",
                        },
                        {
                            "condition": "Snow (in/hr)",
                            "low": "< 0.5 in/hr",
                            "moderate": "0.5-1.0 in/hr",
                            "high": "1.0-2.0 in/hr",
                            "severe": "2.0-3.0 in/hr",
                            "no_travel": "> 3.0 in/hr",
                        },
                    ],
                    "load_rules": [
                        ">= 55 mph wind -> No Travel for any load weight",
                        "45-54 mph wind + > 30,000 lb load -> No Travel",
                        "35-44 mph wind + > 40,000 lb load -> Severe",
                    ],
                    "recommendation_priority": [
                        "1. Fewest No-Travel & Severe miles",
                        "2. Fewest High-risk miles",
                        "3. Lowest average checkpoint risk score",
                        "4. Shortest estimated travel time",
                    ],
                    "risk_levels": [
                        RISK_LOW,
                        RISK_MODERATE,
                        RISK_HIGH,
                        RISK_SEVERE,
                        RISK_NO_TRAVEL,
                    ],
                },
                "presets": PRESET_SCENARIOS,
                "hubs": [h["name"] for h in FREIGHT_HUBS.values()],
            }
        )


class PlanRouteAPIView(APIView):
    """
    POST /api/routes/plan/
    Validates origin, destination, departure_time, load_weight_lbs, and sampling_interval_miles.
    Generates 3 routes, samples checkpoints at 10/25/50 miles, evaluates ETA weather & 0-48h
    corridor heatmap, computes the Explainable Route Safety Score, and persists the query.
    """

    def post(self, request):
        serializer = RoutePlanRequestSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                {
                    "error": "Invalid route planning parameters.",
                    "details": serializer.errors,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        validated = serializer.validated_data
        origin_str = validated["origin"]
        destination_str = validated["destination"]
        departure_time = validated.get("departure_time") or timezone.now()
        load_weight_lbs = validated["load_weight_lbs"]
        sampling_interval_miles = int(validated["sampling_interval_miles"])
        truck_type = validated.get("truck_type", "dry_van")
        weather_mode = validated.get("weather_mode", "auto")

        # 1. Geocode origin & destination
        try:
            origin_geo = geocode_location(origin_str)
        except ValueError as exc:
            return Response(
                {"error": str(exc), "details": {"origin": [str(exc)]}},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            destination_geo = geocode_location(destination_str)
        except ValueError as exc:
            return Response(
                {"error": str(exc), "details": {"destination": [str(exc)]}},
                status=status.HTTP_400_BAD_REQUEST,
            )

        crow_flies = haversine_miles(
            origin_geo["lat"],
            origin_geo["lng"],
            destination_geo["lat"],
            destination_geo["lng"],
        )
        if crow_flies < 5.0:
            msg = "Origin and destination are less than 5 miles apart. Please choose a longer freight corridor."
            return Response(
                {"error": msg, "details": {"destination": [msg]}},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # 2. Fetch 3 route options
        raw_routes, routing_source = fetch_three_routes(origin_geo, destination_geo)

        # 3. Sample checkpoints along each route every 10 / 25 / 50 miles
        for route in raw_routes:
            route["checkpoints"] = sample_route_checkpoints(
                geometry=route["geometry"],
                total_distance_miles=route["distance_miles"],
                total_duration_minutes=route["duration_minutes"],
                departure_time=departure_time,
                interval_miles=sampling_interval_miles,
            )

        # 4. Populate ETA weather + 0-48h forecast + corridor heatmap
        routes_with_weather, heatmap_corridor, weather_source = (
            populate_routes_weather_and_heatmap(
                routes=raw_routes,
                origin=origin_geo,
                destination=destination_geo,
                departure_time=departure_time,
                load_weight_lbs=load_weight_lbs,
                weather_mode=weather_mode,
            )
        )

        # 5. Score, rank, and generate plain-language "Why this route?" explanations
        ranked_routes = rank_and_explain_routes(
            routes=routes_with_weather,
            load_weight_lbs=load_weight_lbs,
            truck_type=truck_type,
        )

        recommended_route = ranked_routes[0]

        response_payload = {
            "query": {
                "origin": origin_geo,
                "destination": destination_geo,
                "departure_time": departure_time.isoformat(),
                "load_weight_lbs": load_weight_lbs,
                "truck_type": truck_type,
                "sampling_interval_miles": sampling_interval_miles,
                "weather_mode_requested": weather_mode,
            },
            "data_sources": {
                "routing": routing_source,
                "weather": weather_source,
                "is_simulated_weather": weather_source != "live_open_meteo",
                "is_simulated_routing": routing_source == "simulated_fallback",
                "transparency_note": (
                    "Routes generated via live OSRM road network; weather from live Open-Meteo 48h forecast API."
                    if routing_source != "simulated_fallback"
                    and weather_source == "live_open_meteo"
                    else "Routes from OSRM road network; weather uses deterministic Storm Corridor Simulation to demonstrate severe wind/snow/rain load thresholds."
                    if routing_source != "simulated_fallback"
                    else "Using deterministic highway corridor & synoptic storm simulation."
                ),
            },
            "recommended_route_id": recommended_route["id"],
            "routes": ranked_routes,
            "heatmap": heatmap_corridor,
        }

        # Persist trip plan in SQLite history
        saved_query = RoutePlanQuery.objects.create(
            origin_input=origin_str,
            origin_resolved_name=origin_geo["name"],
            origin_lat=origin_geo["lat"],
            origin_lng=origin_geo["lng"],
            destination_input=destination_str,
            destination_resolved_name=destination_geo["name"],
            destination_lat=destination_geo["lat"],
            destination_lng=destination_geo["lng"],
            departure_time=departure_time,
            load_weight_lbs=load_weight_lbs,
            truck_type=truck_type,
            sampling_interval_miles=sampling_interval_miles,
            weather_mode=weather_mode,
            recommended_route_id=recommended_route["id"],
            recommended_route_name=recommended_route["name"],
            recommended_safety_score=recommended_route["safety"]["overall_safety_score"],
            recommended_risk_level=recommended_route["safety"]["overall_risk_level"],
            routing_data_source=routing_source,
            weather_data_source=weather_source,
            response_payload=response_payload,
        )

        response_payload["plan_id"] = str(saved_query.id)
        return Response(response_payload, status=status.HTTP_200_OK)


class RoutePlanHistoryListAPIView(APIView):
    """
    GET /api/routes/history/
    Returns the 10 most recent route planning evaluations.
    """

    def get(self, request):
        recent = RoutePlanQuery.objects.all()[:10]
        serializer = RoutePlanHistorySerializer(recent, many=True)
        return Response({"history": serializer.data})


class RoutePlanHistoryDetailAPIView(APIView):
    """
    GET /api/routes/history/<uuid:pk>/
    Restores a previously computed route safety plan from the database.
    """

    def get(self, request, pk):
        item = get_object_or_404(RoutePlanQuery, pk=pk)
        payload = item.response_payload
        payload["plan_id"] = str(item.id)
        return Response(payload)
