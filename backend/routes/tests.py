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
