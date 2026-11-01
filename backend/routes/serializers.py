from datetime import timedelta
from django.utils import timezone
from rest_framework import serializers
from .models import RoutePlanQuery


class RoutePlanRequestSerializer(serializers.Serializer):
    origin = serializers.CharField(
        max_length=255,
        required=True,
        error_messages={
            "required": "Origin city or coordinate is required.",
            "blank": "Please enter a valid origin city (e.g., Chicago, IL).",
        },
    )
    destination = serializers.CharField(
        max_length=255,
        required=True,
        error_messages={
            "required": "Destination city or coordinate is required.",
            "blank": "Please enter a valid destination city (e.g., Denver, CO).",
        },
    )
    departure_time = serializers.DateTimeField(
        required=False,
        default=timezone.now,
    )
    load_weight_lbs = serializers.IntegerField(
        min_value=1000,
        max_value=120000,
        default=42000,
        error_messages={
            "min_value": "Load weight must be at least 1,000 lbs.",
            "max_value": "Load weight cannot exceed 120,000 lbs (oversize permit limit).",
            "invalid": "Load weight must be a whole number in pounds.",
        },
    )
    sampling_interval_miles = serializers.ChoiceField(
        choices=[10, 25, 50],
        default=25,
        error_messages={
            "invalid_choice": "Sampling interval must be 10, 25, or 50 miles.",
        },
    )
    truck_type = serializers.ChoiceField(
        choices=["dry_van", "reefer", "flatbed", "tanker", "doubles"],
        default="dry_van",
    )
    weather_mode = serializers.ChoiceField(
        choices=["live", "simulated", "auto"],  # "auto" kept for older clients; treated as live
        default="live",
    )

    MAX_DEPARTURE_LEAD = timedelta(days=7)
    DEPARTURE_GRACE = timedelta(hours=1)

    def validate_departure_time(self, value):
        now = timezone.now()
        if value < now - self.DEPARTURE_GRACE:
            raise serializers.ValidationError("Departure time cannot be in the past.")
        if value > now + self.MAX_DEPARTURE_LEAD:
            raise serializers.ValidationError(
                "Departure must be within the next 7 days so the forecast covers the trip."
            )
        return value

    def validate(self, attrs):
        origin_clean = attrs["origin"].strip().lower()
        dest_clean = attrs["destination"].strip().lower()
        if origin_clean == dest_clean:
            raise serializers.ValidationError(
                {
                    "destination": "Origin and destination must be two different locations."
                }
            )
        return attrs


class RoutePlanHistorySerializer(serializers.ModelSerializer):
    class Meta:
        model = RoutePlanQuery
        fields = [
            "id",
            "origin_input",
            "origin_resolved_name",
            "destination_input",
            "destination_resolved_name",
            "departure_time",
            "load_weight_lbs",
            "truck_type",
            "sampling_interval_miles",
            "weather_mode",
            "recommended_route_id",
            "recommended_route_name",
            "recommended_safety_score",
            "recommended_risk_level",
            "routing_data_source",
            "weather_data_source",
            "created_at",
        ]
