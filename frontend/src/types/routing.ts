export type RiskLevel = 'Low' | 'Moderate' | 'High' | 'Severe' | 'No Travel';

export type SamplingInterval = 10 | 25 | 50;

export type TruckType = 'dry_van' | 'reefer' | 'flatbed' | 'tanker' | 'doubles';

export type WeatherMode = 'auto' | 'live' | 'simulated';

export interface GeoLocation {
  name: string;
  lat: number;
  lng: number;
  source: string;
}

export interface RoadCondition {
  surface_state: string;
  risk_level: RiskLevel;
  advisory: string;
}

export interface CheckpointRisk {
  overall_risk: RiskLevel;
  risk_severity_weight: number;
  base_wind_risk: RiskLevel;
  effective_wind_risk: RiskLevel;
  rain_risk: RiskLevel;
  snow_risk: RiskLevel;
  load_rule_triggered: boolean;
  load_escalation_note: string | null;
  dominant_factor: string;
  road_condition: RoadCondition;
}

export interface CheckpointWeather {
  wind_mph: number;
  rain_in_hr: number;
  snow_in_hr: number;
  temperature_f: number;
  source: string;
}

export interface HourlyForecastSnap {
  h: number;
  wind_mph: number;
  rain_in_hr: number;
  snow_in_hr: number;
  temperature_f: number;
  risk: RiskLevel;
}

export interface RouteCheckpoint {
  index: number;
  mile: number;
  segment_miles: number;
  lat: number;
  lng: number;
  label: string;
  eta_iso: string;
  elapsed_minutes: number;
  elapsed_hours: number;
  weather: CheckpointWeather;
  risk: CheckpointRisk;
  hourly_forecast: HourlyForecastSnap[];
}

export interface KeyReason {
  type: 'positive' | 'warning' | 'critical' | 'info';
  text: string;
}

export interface RouteSafetySummary {
  overall_safety_score: number;
  overall_risk_level: RiskLevel;
  average_risk_score: number;
  component_scores: {
    weather_score: number;
    load_suitability_score: number;
    road_condition_score: number;
    efficiency_score: number;
  };
  risk_miles: {
    low_miles: number;
    moderate_miles: number;
    high_miles: number;
    severe_miles: number;
    no_travel_miles: number;
    severe_plus_no_travel_miles: number;
  };
  checkpoint_counts: {
    total: number;
    low: number;
    moderate: number;
    high: number;
    severe: number;
    no_travel: number;
  };
  peak_conditions: {
    max_wind_mph: number;
    max_rain_in_hr: number;
    max_snow_in_hr: number;
  };
  load_analysis: {
    load_weight_lbs: number;
    truck_type: TruckType;
    truck_type_label: string;
    suitability_status: string;
    escalation_checkpoints_count: number;
    escalation_miles: number;
    escalation_examples: string[];
    profile_note: string;
  };
  road_condition_summary: {
    predominant_hazard: string;
    affected_miles: number;
    surface_breakdown: Record<string, number>;
  };
  why_this_route: string;
  key_reasons: KeyReason[];
  comparison: {
    vs_recommended_minutes: number;
    vs_recommended_miles: number;
    vs_recommended_safety_score: number;
    vs_fastest_minutes: number;
    is_fastest: boolean;
    tradeoff_headline: string;
  };
}

export interface RouteOption {
  id: string;
  name: string;
  corridor_type: string;
  distance_miles: number;
  duration_minutes: number;
  geometry: [number, number][];
  source: string;
  rank: number;
  is_recommended: boolean;
  checkpoints: RouteCheckpoint[];
  safety: RouteSafetySummary;
}

export interface HeatmapNode {
  id: string;
  lat: number;
  lng: number;
  route_id: string | null;
  is_route_node: boolean;
  hourly: HourlyForecastSnap[];
}

export interface HeatmapCorridor {
  min_hour: number;
  max_hour: number;
  departure_iso: string;
  weather_source: string;
  nodes: HeatmapNode[];
}

export interface RoutePlanResponse {
  plan_id: string;
  query: {
    origin: GeoLocation;
    destination: GeoLocation;
    departure_time: string;
    load_weight_lbs: number;
    truck_type: TruckType;
    sampling_interval_miles: SamplingInterval;
    weather_mode_requested: WeatherMode;
  };
  data_sources: {
    routing: string;
    weather: string;
    is_simulated_weather: boolean;
    is_simulated_routing: boolean;
    transparency_note: string;
  };
  recommended_route_id: string;
  routes: RouteOption[];
  heatmap: HeatmapCorridor;
}

export interface PresetScenario {
  id: string;
  title: string;
  subtitle: string;
  origin: string;
  destination: string;
  load_weight_lbs: number;
  truck_type: TruckType;
  sampling_interval_miles: SamplingInterval;
  weather_mode: WeatherMode;
  highlight: string;
}

export interface RulesResponse {
  status: string;
  rules: {
    thresholds: {
      condition: string;
      low: string;
      moderate: string;
      high: string;
      severe: string;
      no_travel: string;
    }[];
    load_rules: string[];
    recommendation_priority: string[];
    risk_levels: RiskLevel[];
  };
  presets: PresetScenario[];
  hubs: string[];
}

export interface RoutePlanHistoryItem {
  id: string;
  origin_input: string;
  origin_resolved_name: string;
  destination_input: string;
  destination_resolved_name: string;
  departure_time: string;
  load_weight_lbs: number;
  truck_type: TruckType;
  sampling_interval_miles: SamplingInterval;
  weather_mode: WeatherMode;
  recommended_route_id: string;
  recommended_route_name: string;
  recommended_safety_score: number;
  recommended_risk_level: RiskLevel;
  routing_data_source: string;
  weather_data_source: string;
  created_at: string;
}
