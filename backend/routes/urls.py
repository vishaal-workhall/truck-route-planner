from django.urls import path
from .views import (
    HealthAndRulesAPIView,
    PlaceSearchAPIView,
    PlanRouteAPIView,
    RoutePlanHistoryDetailAPIView,
    RoutePlanHistoryListAPIView,
)

urlpatterns = [
    path("rules/", HealthAndRulesAPIView.as_view(), name="rules-and-presets"),
    path("places/", PlaceSearchAPIView.as_view(), name="place-search"),
    path("routes/plan/", PlanRouteAPIView.as_view(), name="plan-route"),
    path("routes/history/", RoutePlanHistoryListAPIView.as_view(), name="route-history"),
    path(
        "routes/history/<uuid:pk>/",
        RoutePlanHistoryDetailAPIView.as_view(),
        name="route-history-detail",
    ),
]
