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

  const cumulative = [0];
  for (let i = 1; i < geometry.length; i++) {
    cumulative.push(cumulative[i - 1] + haversineMiles(geometry[i - 1], geometry[i]));
  }
  const scale = route.distance_miles / (cumulative[cumulative.length - 1] || 1);

  const runs: RiskRun[] = [];
  let cpIdx = 0;
  for (let i = 0; i < geometry.length; i++) {
    const mile = cumulative[i] * scale;
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
