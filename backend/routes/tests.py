from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient

from .services.risk_engine import (
    RISK_HIGH,
    RISK_LOW,
    RISK_MODERATE,
    RISK_NO_TRAVEL,
    RISK_SEVERE,
    apply_load_wind_rules,
    classify_rain_risk,
    classify_snow_risk,
    classify_wind_risk,
    evaluate_checkpoint_risk,
    rank_and_explain_routes,
)


class WeatherAndLoadRiskRulesTests(TestCase):
    """Verify exact compliance with the PDF's weather thresholds and load weight rules."""

    def test_wind_thresholds(self):
        self.assertEqual(classify_wind_risk(15.0), RISK_LOW)
        self.assertEqual(classify_wind_risk(24.9), RISK_LOW)
        self.assertEqual(classify_wind_risk(25.0), RISK_MODERATE)
        self.assertEqual(classify_wind_risk(34.0), RISK_MODERATE)
        self.assertEqual(classify_wind_risk(35.0), RISK_HIGH)
        self.assertEqual(classify_wind_risk(44.0), RISK_HIGH)
        self.assertEqual(classify_wind_risk(45.0), RISK_SEVERE)
        self.assertEqual(classify_wind_risk(54.0), RISK_SEVERE)
        self.assertEqual(classify_wind_risk(55.0), RISK_NO_TRAVEL)
        self.assertEqual(classify_wind_risk(62.0), RISK_NO_TRAVEL)

    def test_rain_thresholds(self):
        self.assertEqual(classify_rain_risk(0.05), RISK_LOW)
        self.assertEqual(classify_rain_risk(0.10), RISK_MODERATE)
        self.assertEqual(classify_rain_risk(0.25), RISK_MODERATE)
        self.assertEqual(classify_rain_risk(0.30), RISK_HIGH)
        self.assertEqual(classify_rain_risk(0.50), RISK_HIGH)
        self.assertEqual(classify_rain_risk(0.75), RISK_SEVERE)
        self.assertEqual(classify_rain_risk(1.00), RISK_SEVERE)
        self.assertEqual(classify_rain_risk(1.05), RISK_NO_TRAVEL)

    def test_snow_thresholds(self):
        self.assertEqual(classify_snow_risk(0.2), RISK_LOW)
        self.assertEqual(classify_snow_risk(0.5), RISK_MODERATE)
        self.assertEqual(classify_snow_risk(1.0), RISK_MODERATE)
        self.assertEqual(classify_snow_risk(1.5), RISK_HIGH)
        self.assertEqual(classify_snow_risk(2.0), RISK_HIGH)
        self.assertEqual(classify_snow_risk(2.5), RISK_SEVERE)
        self.assertEqual(classify_snow_risk(3.0), RISK_SEVERE)
        self.assertEqual(classify_snow_risk(3.2), RISK_NO_TRAVEL)

    def test_load_wind_escalation_rules(self):
        # Rule 1: >= 55 mph -> No Travel for any load
        risk, note = apply_load_wind_rules(56.0, 12000)
        self.assertEqual(risk, RISK_NO_TRAVEL)
        self.assertIsNotNone(note)

        # Rule 2: 45-54 mph + > 30,000 lb -> No Travel
        risk_heavy, note_heavy = apply_load_wind_rules(48.0, 32000)
        self.assertEqual(risk_heavy, RISK_NO_TRAVEL)
        self.assertIsNotNone(note_heavy)

        # 45-54 mph with <= 30,000 lb stays Severe
        risk_light, note_light = apply_load_wind_rules(48.0, 28000)
        self.assertEqual(risk_light, RISK_SEVERE)
        self.assertIsNone(note_light)

        # Rule 3: 35-44 mph + > 40,000 lb -> Severe
        risk_42k, note_42k = apply_load_wind_rules(38.0, 42000)
        self.assertEqual(risk_42k, RISK_SEVERE)
        self.assertIsNotNone(note_42k)

        # 35-44 mph with <= 40,000 lb stays High
        risk_38k, note_38k = apply_load_wind_rules(38.0, 38000)
        self.assertEqual(risk_38k, RISK_HIGH)
        self.assertIsNone(note_38k)


class RouteRecommendationAndSafetyScoreTests(TestCase):
    """Verify deterministic route ranking and Explainable Route Safety Score calculation."""

    def _make_mock_route(
        self,
        route_id: str,
        name: str,
        duration_minutes: float,
        checkpoint_winds: list,
        load_weight_lbs: int,
    ):
        checkpoints = []
        seg_miles = 50.0
        for idx, wind in enumerate(checkpoint_winds):
            risk = evaluate_checkpoint_risk(
                wind_mph=wind,
                rain_in_hr=0.0,
                snow_in_hr=0.0,
                load_weight_lbs=load_weight_lbs,
                temperature_f=50.0,
            )
            checkpoints.append(
                {
                    "index": idx,
                    "mile": idx * seg_miles,
                    "segment_miles": seg_miles,
                    "lat": 40.0,
                    "lng": -100.0 - idx * 0.5,
                    "label": f"Checkpoint {idx}",
                    "eta_iso": "2026-11-01T16:00:00Z",
                    "elapsed_minutes": idx * 45.0,
                    "elapsed_hours": idx * 0.75,
                    "weather": {
                        "wind_mph": wind,
                        "rain_in_hr": 0.0,
                        "snow_in_hr": 0.0,
                        "temperature_f": 50.0,
                    },
                    "risk": risk,
                }
            )
        return {
            "id": route_id,
            "name": name,
            "corridor_type": name,
            "distance_miles": len(checkpoint_winds) * seg_miles,
            "duration_minutes": duration_minutes,
            "checkpoints": checkpoints,
        }

    def test_prefers_fewer_severe_miles_over_shorter_time(self):
        load_lbs = 44000
        # Route A is faster (240 min) but has 38 mph wind -> Severe for 44,000 lb load
        route_fast_risky = self._make_mock_route(
            "route_fast", "Fast Crosswind Route", 240.0, [20.0, 39.0, 41.0, 22.0], load_lbs
        )
        # Route B is 30 min slower (270 min) but has only Low/Moderate winds
        route_safe = self._make_mock_route(
            "route_safe", "Southern Safe Bypass", 270.0, [18.0, 26.0, 28.0, 19.0], load_lbs
        )
        # Route C has 50 mph wind -> No Travel for >30,000 lb
        route_no_travel = self._make_mock_route(
            "route_nt", "Northern Storm Route", 230.0, [22.0, 50.0, 48.0, 25.0], load_lbs
        )

        ranked = rank_and_explain_routes(
            [route_fast_risky, route_safe, route_no_travel],
            load_weight_lbs=load_lbs,
            truck_type="dry_van",
        )

        self.assertEqual(ranked[0]["id"], "route_safe")
        self.assertTrue(ranked[0]["is_recommended"])
        self.assertEqual(ranked[1]["id"], "route_fast")
        self.assertEqual(ranked[2]["id"], "route_nt")
        self.assertGreater(
            ranked[0]["safety"]["overall_safety_score"],
            ranked[1]["safety"]["overall_safety_score"],
        )
        self.assertIn("Route Safety Score", ranked[0]["safety"]["why_this_route"])


class RoutePlannerAPITests(TestCase):
    """End-to-end API tests for route planning, validation, and history persistence."""

    def setUp(self):
        self.client = APIClient()

    def test_plan_route_simulated_success_and_persistence(self):
        url = reverse("plan-route")
        payload = {
            "origin": "Omaha, NE",
            "destination": "Denver, CO",
            "load_weight_lbs": 42000,
            "sampling_interval_miles": 25,
            "truck_type": "dry_van",
            "weather_mode": "simulated",
        }
        response = self.client.post(url, payload, format="json")
        self.assertEqual(response.status_code, 200)
        data = response.json()

        self.assertEqual(len(data["routes"]), 3)
        self.assertIn("recommended_route_id", data)
        self.assertIn("heatmap", data)
        self.assertEqual(data["heatmap"]["max_hour"], 48)

        # Verify history endpoint recorded the query
        history_resp = self.client.get(reverse("route-history"))
        self.assertEqual(history_resp.status_code, 200)
        self.assertEqual(len(history_resp.json()["history"]), 1)

    def test_validation_rejects_same_origin_and_destination(self):
        url = reverse("plan-route")
        response = self.client.post(
            url,
            {
                "origin": "Chicago, IL",
                "destination": "Chicago, IL",
                "load_weight_lbs": 35000,
                "sampling_interval_miles": 25,
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("destination", response.json()["details"])

    def test_validation_rejects_invalid_sampling_interval(self):
        url = reverse("plan-route")
        response = self.client.post(
            url,
            {
                "origin": "Chicago, IL",
                "destination": "Denver, CO",
                "load_weight_lbs": 35000,
                "sampling_interval_miles": 15,
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("sampling_interval_miles", response.json()["details"])


# ---------------------------------------------------------------------------------------------
# Boundary, ETA, sampling and weather-alignment tests
# ---------------------------------------------------------------------------------------------

from datetime import datetime, timedelta, timezone as dt_timezone
from unittest import mock

from django.core.cache import cache

from .services import weather_service
from .services.routing_service import (
    hos_schedule,
    nearest_hub_label,
    sample_route_checkpoints,
)
from .services.weather_service import (
    WeatherUnavailable,
    eta_hour_index,
    forecast_window,
    populate_routes_weather_and_heatmap,
)


def _straight_route(route_id, lat, lng_start, lng_end, miles, driving_minutes, interval, departure):
    geometry = [[lat, lng_start + (lng_end - lng_start) * i / 50] for i in range(51)]
    return {
        "id": route_id,
        "name": route_id,
        "distance_miles": miles,
        "duration_minutes": driving_minutes,
        "driving_minutes": driving_minutes,
        "geometry": geometry,
        "checkpoints": sample_route_checkpoints(geometry, miles, driving_minutes, departure, interval),
    }


class RuleBoundaryTests(TestCase):
    def test_fractional_values_between_published_bands(self):
        self.assertEqual(classify_wind_risk(24.99), RISK_LOW)
        self.assertEqual(classify_wind_risk(34.9), RISK_MODERATE)
        self.assertEqual(classify_wind_risk(44.9), RISK_HIGH)
        self.assertEqual(classify_wind_risk(54.9), RISK_SEVERE)
        self.assertEqual(classify_rain_risk(0.099), RISK_LOW)
        self.assertEqual(classify_rain_risk(0.26), RISK_HIGH)
        self.assertEqual(classify_rain_risk(0.51), RISK_SEVERE)
        self.assertEqual(classify_snow_risk(0.49), RISK_LOW)
        self.assertEqual(classify_snow_risk(1.01), RISK_HIGH)
        self.assertEqual(classify_snow_risk(2.01), RISK_SEVERE)

    def test_load_rules_use_strictly_greater_than_weight(self):
        self.assertEqual(apply_load_wind_rules(45.0, 30000)[0], RISK_SEVERE)
        self.assertEqual(apply_load_wind_rules(45.0, 30001)[0], RISK_NO_TRAVEL)
        self.assertEqual(apply_load_wind_rules(54.9, 30001)[0], RISK_NO_TRAVEL)
        self.assertEqual(apply_load_wind_rules(35.0, 40000)[0], RISK_HIGH)
        self.assertEqual(apply_load_wind_rules(35.0, 40001)[0], RISK_SEVERE)
        self.assertEqual(apply_load_wind_rules(44.9, 80000)[0], RISK_SEVERE)
        self.assertEqual(apply_load_wind_rules(34.9, 80000)[0], RISK_MODERATE)
        self.assertEqual(apply_load_wind_rules(55.0, 1000)[0], RISK_NO_TRAVEL)

    def test_checkpoint_risk_is_worst_condition(self):
        risk = evaluate_checkpoint_risk(10.0, 0.0, 1.5, 20000)
        self.assertEqual(risk["overall_risk"], RISK_HIGH)
        risk = evaluate_checkpoint_risk(38.0, 0.6, 0.0, 42000)
        self.assertEqual(risk["overall_risk"], RISK_SEVERE)
        self.assertTrue(risk["load_rule_triggered"])


class RankingTieBreakTests(RouteRecommendationAndSafetyScoreTests):
    def test_no_travel_ranks_behind_any_amount_of_severe(self):
        severe = self._make_mock_route("severe", "S", 300.0, [46.0, 46.0, 46.0, 10.0], 20000)
        no_travel = self._make_mock_route("nt", "N", 200.0, [56.0, 10.0, 10.0, 10.0], 20000)
        ranked = rank_and_explain_routes([no_travel, severe], 20000, "dry_van")
        self.assertEqual(ranked[0]["id"], "severe")

    def test_high_miles_then_average_risk_then_time(self):
        high = self._make_mock_route("high", "H", 200.0, [36.0, 10.0, 10.0, 10.0], 20000)
        moderate = self._make_mock_route("mod", "M", 260.0, [30.0, 30.0, 30.0, 30.0], 20000)
        ranked = rank_and_explain_routes([high, moderate], 20000, "dry_van")
        self.assertEqual(ranked[0]["id"], "mod")

        calm_slow = self._make_mock_route("slow", "S", 260.0, [10.0, 10.0, 10.0, 10.0], 20000)
        breezy_fast = self._make_mock_route("fast", "F", 200.0, [10.0, 26.0, 10.0, 10.0], 20000)
        ranked = rank_and_explain_routes([breezy_fast, calm_slow], 20000, "dry_van")
        self.assertEqual(ranked[0]["id"], "slow")

        a = self._make_mock_route("a", "A", 260.0, [10.0, 10.0, 10.0, 10.0], 20000)
        b = self._make_mock_route("b", "B", 240.0, [10.0, 10.0, 10.0, 10.0], 20000)
        ranked = rank_and_explain_routes([a, b], 20000, "dry_van")
        self.assertEqual(ranked[0]["id"], "b")


class HoursOfServiceTests(TestCase):
    def test_no_stop_when_trip_ends_at_a_limit(self):
        self.assertEqual(hos_schedule(420)[0], 420)
        self.assertEqual(hos_schedule(480), (480, []))

    def test_break_after_eight_hours_and_rest_after_eleven(self):
        elapsed, stops = hos_schedule(9 * 60)
        self.assertEqual(elapsed, 9 * 60 + 30)
        self.assertEqual([s["kind"] for s in stops], ["30-min break"])

        elapsed, stops = hos_schedule(12 * 60)
        self.assertEqual(elapsed, 12 * 60 + 30 + 600)
        self.assertEqual([s["kind"] for s in stops], ["30-min break", "10-hr rest"])
        self.assertEqual(stops[1]["at_driving_minutes"], 11 * 60)


class CheckpointSamplingTests(TestCase):
    departure = datetime(2026, 11, 2, 15, 0, tzinfo=dt_timezone.utc)

    def test_every_interval_with_no_cap_and_full_mileage(self):
        route = _straight_route("r", 40.0, -100.0, -80.0, 1000.0, 1000.0, 10, self.departure)
        cps = route["checkpoints"]
        self.assertEqual(len(cps), 101)
        self.assertEqual([cp["mile"] for cp in cps[:3]], [0.0, 10.0, 20.0])
        self.assertAlmostEqual(sum(cp["segment_miles"] for cp in cps), 1000.0, places=1)

    def test_eta_includes_hos_stops(self):
        route = _straight_route("r", 40.0, -100.0, -90.0, 600.0, 600.0, 50, self.departure)
        cps = route["checkpoints"]
        at_500 = next(cp for cp in cps if cp["mile"] == 500.0)
        self.assertEqual(at_500["elapsed_minutes"], 530.0)  # 8 h driving + 30-min break + 20 min
        eta = datetime.fromisoformat(at_500["eta_iso"])
        self.assertEqual(eta, self.departure + timedelta(minutes=530))

    def test_label_uses_correct_hemisphere(self):
        self.assertEqual(nearest_hub_label(19.0, 72.8), "19.00N, 72.80E")
        self.assertEqual(nearest_hub_label(-33.9, -70.6), "33.90S, 70.60W")


class WeatherTimeAlignmentTests(TestCase):
    departure = datetime(2026, 11, 2, 17, 40, tzinfo=dt_timezone.utc)

    def setUp(self):
        cache.clear()

    def test_window_starts_at_departure_and_covers_long_trips(self):
        short = _straight_route("r", 40.0, -100.0, -99.0, 60.0, 60.0, 25, self.departure)
        start, hours = forecast_window(self.departure, [short])
        self.assertEqual(start, datetime(2026, 11, 2, 18, 0, tzinfo=dt_timezone.utc))
        self.assertEqual(hours, 48)

        long = _straight_route("r", 40.0, -120.0, -75.0, 2800.0, 2800.0, 50, self.departure)
        start, hours = forecast_window(self.departure, [long])
        self.assertGreaterEqual(start + timedelta(hours=hours),
                                datetime.fromisoformat(long["checkpoints"][-1]["eta_iso"]))

    def test_eta_index_is_relative_to_series_start(self):
        start = datetime(2026, 11, 2, 18, 0, tzinfo=dt_timezone.utc)
        self.assertEqual(eta_hour_index(self.departure, start, 0.0), 0)
        self.assertEqual(eta_hour_index(self.departure, start, 2.0), 2)
        self.assertEqual(eta_hour_index(self.departure, start, 2.4), 2)
        self.assertEqual(eta_hour_index(self.departure, start, 2.9), 3)  # 20:34 -> 21:00

    def test_live_weather_is_read_at_each_checkpoints_eta(self):
        """Fake Open-Meteo returns wind == hours since series start, so wind reveals the hour used."""
        captured = {}

        def fake_get(url, params, timeout):
            captured.update(params)
            n_points = len(params["latitude"].split(","))
            start = datetime.fromisoformat(params["start_hour"])
            end = datetime.fromisoformat(params["end_hour"])
            n = int((end - start).total_seconds() // 3600) + 1
            hourly = {
                "time": [str(i) for i in range(n)],
                "wind_speed_10m": [float(i) for i in range(n)],
                "wind_gusts_10m": [float(i) for i in range(n)],
                "rain": [0.0] * n,
                "showers": [0.0] * n,
                "snowfall": [0.0] * n,
                "temperature_2m": [50.0] * n,
            }
            response = mock.Mock(status_code=200)
            response.json.return_value = [{"hourly": hourly} for _ in range(n_points)]
            return response

        route = _straight_route("r", 40.0, -100.0, -94.0, 330.0, 330.0, 10, self.departure)
        with mock.patch.object(weather_service.requests, "get", side_effect=fake_get):
            populate_routes_weather_and_heatmap([route], self.departure, 35000, "live")

        self.assertEqual(captured["start_hour"], "2026-11-02T18:00")
        for cp in route["checkpoints"]:
            expected_hour = round(-20 / 60 + cp["elapsed_hours"])
            self.assertEqual(cp["weather"]["wind_mph"], float(expected_hour), cp["mile"])

    def test_rain_includes_convective_showers(self):
        def fake_get(url, params, timeout):
            n_points = len(params["latitude"].split(","))
            n = 49
            hourly = {
                "time": ["t"] * n,
                "wind_speed_10m": [5.0] * n,
                "wind_gusts_10m": [5.0] * n,
                "rain": [0.05] * n,
                "showers": [0.30] * n,
                "snowfall": [0.0] * n,
                "temperature_2m": [60.0] * n,
            }
            response = mock.Mock(status_code=200)
            response.json.return_value = [{"hourly": hourly} for _ in range(n_points)]
            return response

        route = _straight_route("r", 40.0, -100.0, -99.0, 60.0, 60.0, 25, self.departure)
        with mock.patch.object(weather_service.requests, "get", side_effect=fake_get):
            populate_routes_weather_and_heatmap([route], self.departure, 20000, "live")
        self.assertEqual(route["checkpoints"][0]["weather"]["rain_in_hr"], 0.35)
        self.assertEqual(route["checkpoints"][0]["risk"]["overall_risk"], RISK_HIGH)

    def test_simulated_weather_depends_only_on_place_and_time(self):
        a = _straight_route("a", 41.0, -96.0, -105.0, 540.0, 540.0, 25, self.departure)
        b = _straight_route("b", 41.0, -96.0, -105.0, 540.0, 540.0, 25, self.departure)
        b["id"] = "b"
        populate_routes_weather_and_heatmap([a, b], self.departure, 42000, "simulated")
        for cp_a, cp_b in zip(a["checkpoints"], b["checkpoints"]):
            self.assertEqual(cp_a["weather"], cp_b["weather"])
        self.assertEqual(a["checkpoints"][len(a["checkpoints"]) // 2]["risk"]["overall_risk"], RISK_NO_TRAVEL)


class PlanValidationTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.payload = {
            "origin": "Omaha, NE",
            "destination": "Denver, CO",
            "load_weight_lbs": 35000,
            "sampling_interval_miles": 25,
        }

    def test_rejects_departure_in_the_past_or_beyond_forecast(self):
        for when in (timedelta(hours=-3), timedelta(days=8)):
            payload = {**self.payload, "departure_time": (datetime.now(dt_timezone.utc) + when).isoformat()}
            response = self.client.post(reverse("plan-route"), payload, format="json")
            self.assertEqual(response.status_code, 400)
            self.assertIn("departure_time", response.json()["details"])

    def test_live_weather_failure_returns_503_not_fake_weather(self):
        departure = datetime.now(dt_timezone.utc)
        routes = [
            _straight_route(f"route_{i}", 41.0 + i * 0.5, -96.0, -105.0, 540.0, 540.0, 25, departure)
            for i in range(3)
        ]
        with mock.patch("routes.views.fetch_three_routes", return_value=(routes, "live_osrm")), \
                mock.patch.object(weather_service, "fetch_live_series", side_effect=WeatherUnavailable("down.")):
            response = self.client.post(reverse("plan-route"), {**self.payload, "weather_mode": "live"}, format="json")
        self.assertEqual(response.status_code, 503)


class LiveLocationBudgetTests(TestCase):
    def test_short_trips_keep_full_resolution_and_long_trips_fit_the_budget(self):
        from .services.weather_service import LIVE_LOCATION_BUDGET, _point_key, snap_resolution

        short = [(40.0, -100.0 + i * 0.15) for i in range(60)]
        self.assertEqual(snap_resolution(short), 0.01)

        departure = datetime(2026, 11, 2, 15, 0, tzinfo=dt_timezone.utc)
        # Worst case: three fully separate coast-to-coast routes at 10-mile spacing.
        routes = [
            _straight_route(f"r{i}", 36.0 + i * 0.6, -118.0, -74.0, 2800.0, 2800.0, 10, departure)
            for i in range(3)
        ]
        points = [(cp["lat"], cp["lng"]) for r in routes for cp in r["checkpoints"]]
        self.assertGreater(len(points), 800)
        resolution = snap_resolution(points)
        self.assertLessEqual(resolution, 0.25)
        self.assertLessEqual(len({_point_key(a, b, resolution) for a, b in points}), LIVE_LOCATION_BUDGET)
        self.assertEqual(resolution, 0.25)
