import type { RiskLevel, RouteOption } from '../types/routing';

export interface RiskRun {
  risk: RiskLevel;
  points: [number, number][];
}

function haversineMiles(a: [number, number], b: [number, number]): number {
  const rad = Math.PI / 180;
  const dLat = (b[0] - a[0]) * rad;
  const dLng = (b[1] - a[1]) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLng / 2) ** 2;
  return 3958.76 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

const cumulativeCache = new WeakMap<RouteOption, number[]>();

/** Road miles from the start to each geometry vertex, scaled to the route's distance. Cached per route. */
function cumulativeMiles(route: RouteOption): number[] {
  const cached = cumulativeCache.get(route);
  if (cached) return cached;
  const geometry = route.geometry;
  const raw = [0];
  for (let i = 1; i < geometry.length; i++) {
    raw.push(raw[i - 1] + haversineMiles(geometry[i - 1], geometry[i]));
  }
  const scale = route.distance_miles / (raw[raw.length - 1] || 1);
  const miles = raw.map((m) => m * scale);
  cumulativeCache.set(route, miles);
  return miles;
}

/** Position on the route polyline at a given road mile. */
export function pointAtMile(route: RouteOption, mile: number): [number, number] {
  const geometry = route.geometry;
  const miles = cumulativeMiles(route);
  if (mile <= 0 || geometry.length < 2) return geometry[0];
  for (let i = 1; i < geometry.length; i++) {
    if (miles[i] >= mile) {
      const t = (mile - miles[i - 1]) / (miles[i] - miles[i - 1] || 1);
      return [
        geometry[i - 1][0] + t * (geometry[i][0] - geometry[i - 1][0]),
        geometry[i - 1][1] + t * (geometry[i][1] - geometry[i - 1][1]),
      ];
    }
  }
  return geometry[geometry.length - 1];
}

/**
 * Truck position `hours` after departure: driving at constant speed, standing still during
 * Hours-of-Service stops. Returns the road mile and whether the truck is stopped.
 */
export function truckMileAt(route: RouteOption, hours: number): { mile: number; stopped: boolean } {
  const driving = route.driving_minutes ?? route.duration_minutes;
  let minutes = Math.max(0, hours * 60);
  let stopped = false;
  for (const stop of route.hos_stops ?? []) {
    if (minutes <= stop.start_elapsed_minutes) break;
    const into = minutes - stop.start_elapsed_minutes;
    if (into < stop.duration_minutes) stopped = true;
    minutes -= Math.min(into, stop.duration_minutes);
  }
  const fraction = Math.min(1, minutes / (driving || 1));
  return { mile: fraction * route.distance_miles, stopped };
}

/**
 * Split a route polyline into runs coloured by the nearest checkpoint (by route mile), which is the
 * same half-way-to-neighbour attribution the backend uses to count risk miles.
 */
export function routeRiskRuns(
  route: RouteOption,
  riskAt: (checkpointIndex: number) => RiskLevel
): RiskRun[] {
  const geometry = route.geometry;
  const cps = route.checkpoints;
  if (geometry.length < 2 || !cps.length) return [];
  const miles = cumulativeMiles(route);

  const runs: RiskRun[] = [];
  let cpIdx = 0;
  for (let i = 0; i < geometry.length; i++) {
    const mile = miles[i];
    while (cpIdx < cps.length - 1 && mile > (cps[cpIdx].mile + cps[cpIdx + 1].mile) / 2) {
      cpIdx++;
    }
    const risk = riskAt(cpIdx);
    const last = runs[runs.length - 1];
    if (last && last.risk === risk) {
      last.points.push(geometry[i]);
    } else {
      // Start the new run at the previous vertex so runs join without gaps.
      runs.push({ risk, points: i > 0 ? [geometry[i - 1], geometry[i]] : [geometry[i]] });
    }
  }
  return runs;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
