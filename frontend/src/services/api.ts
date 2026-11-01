import type {
  RoutePlanHistoryItem,
  RoutePlanResponse,
  RulesResponse,
  SamplingInterval,
  TruckType,
  WeatherMode,
} from '../types/routing';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

export interface PlanRoutePayload {
  origin: string;
  destination: string;
  departure_time: string;
  load_weight_lbs: number;
  sampling_interval_miles: SamplingInterval;
  truck_type: TruckType;
  weather_mode: WeatherMode;
}

export class ApiValidationError extends Error {
  details: Record<string, string[]>;

  constructor(message: string, details: Record<string, string[]> = {}) {
    super(message);
    this.name = 'ApiValidationError';
    this.details = details;
  }
}

export async function fetchRulesAndPresets(): Promise<RulesResponse> {
  const res = await fetch(`${API_BASE}/rules/`);
  if (!res.ok) {
    throw new Error(`Failed to load risk rules (HTTP ${res.status})`);
  }
  return res.json();
}

export async function planTruckRoutes(
  payload: PlanRoutePayload
): Promise<RoutePlanResponse> {
  const res = await fetch(`${API_BASE}/routes/plan/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiValidationError(
      data.error || 'Could not compute route safety plan.',
      data.details || {}
    );
  }
  return data as RoutePlanResponse;
}

export async function fetchRouteHistory(): Promise<RoutePlanHistoryItem[]> {
  const res = await fetch(`${API_BASE}/routes/history/`);
  if (!res.ok) {
    return [];
  }
  const data = await res.json();
  return data.history || [];
}

export async function fetchRoutePlanById(
  planId: string
): Promise<RoutePlanResponse> {
  const res = await fetch(`${API_BASE}/routes/history/${planId}/`);
  if (!res.ok) {
    throw new Error('Could not load saved route plan.');
  }
  return res.json();
}
