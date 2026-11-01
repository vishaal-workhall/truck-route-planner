import uuid
from django.db import models


class RoutePlanQuery(models.Model):
    """
    Stores a completed truck route safety evaluation request and its computed summary.
    Allows drivers and dispatchers to audit past route decisions or quickly reload recent trips.
    """

    TRUCK_TYPES = [
        ("dry_van", "53' Dry Van (High Wind Profile)"),
        ("reefer", "53' Refrigerated Trailer"),
        ("flatbed", "48' Flatbed"),
        ("tanker", "Liquid Bulk Tanker"),
        ("doubles", "Twin 28' Doubles"),
    ]

    SAMPLING_INTERVAL_CHOICES = [
        (10, "Every 10 miles"),
        (25, "Every 25 miles"),
        (50, "Every 50 miles"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    origin_input = models.CharField(max_length=255)
    origin_resolved_name = models.CharField(max_length=255)
    origin_lat = models.FloatField()
    origin_lng = models.FloatField()

    destination_input = models.CharField(max_length=255)
    destination_resolved_name = models.CharField(max_length=255)
    destination_lat = models.FloatField()
    destination_lng = models.FloatField()

    departure_time = models.DateTimeField()
    load_weight_lbs = models.PositiveIntegerField()
    truck_type = models.CharField(
        max_length=32, choices=TRUCK_TYPES, default="dry_van"
    )
    sampling_interval_miles = models.PositiveIntegerField(
        choices=SAMPLING_INTERVAL_CHOICES, default=25
    )
    weather_mode = models.CharField(max_length=32, default="auto")

    recommended_route_id = models.CharField(max_length=64)
    recommended_route_name = models.CharField(max_length=255)
    recommended_safety_score = models.IntegerField()
    recommended_risk_level = models.CharField(max_length=32)
    routing_data_source = models.CharField(max_length=64, default="live")
    weather_data_source = models.CharField(max_length=64, default="live")

    response_payload = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["-created_at"]),
        ]

    def __str__(self) -> str:
        return (
            f"{self.origin_resolved_name} -> {self.destination_resolved_name} "
            f"({self.load_weight_lbs:,} lbs, Score: {self.recommended_safety_score})"
        )
