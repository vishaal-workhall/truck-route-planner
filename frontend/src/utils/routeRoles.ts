import type { RouteOption } from '../types/routing';

export type RouteRole = 'safest' | 'fastest' | 'balanced';

export const ROLE_COLOR: Record<RouteRole, string> = {
  safest: '#6D28D9',
  fastest: '#1E3A5F',
  balanced: '#5C6B7A',
};

export function routeChips(route: RouteOption, routes: RouteOption[]): RouteRole[] {
  const chips: RouteRole[] = [];
  if (route.is_recommended) chips.push('safest');
  if (route.safety.comparison.is_fastest) chips.push('fastest');

  const claimed = new Set(
    routes
      .filter((item) => item.is_recommended || item.safety.comparison.is_fastest)
      .map((item) => item.id)
  );
  const unclaimed = routes.filter((item) => !claimed.has(item.id));
  if (unclaimed.length === 1 && unclaimed[0]?.id === route.id) {
    chips.push('balanced');
  } else if (unclaimed.length > 1 && chips.length === 0) {
    const lead = [...unclaimed].sort(
      (a, b) => b.safety.overall_safety_score - a.safety.overall_safety_score
    )[0];
    if (lead?.id === route.id) chips.push('balanced');
  }
  return chips;
}

export function routeStroke(route: RouteOption, routes: RouteOption[]): string {
  if (route.is_recommended) return ROLE_COLOR.safest;
  const rest = routes
    .filter((item) => !item.is_recommended)
    .sort((a, b) => a.duration_minutes - b.duration_minutes);
  const index = rest.findIndex((item) => item.id === route.id);
  if (index <= 0) return ROLE_COLOR.fastest;
  return ROLE_COLOR.balanced;
}

export const ROLE_LABEL: Record<RouteRole, string> = {
  safest: 'Recommended',
  fastest: 'Fastest',
  balanced: 'Balanced',
};
