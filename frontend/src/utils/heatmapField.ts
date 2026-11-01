import type { HourlyForecastSnap, RiskLevel } from '../types/routing';
import { RISK_COLOR_MAP } from './riskColors';

export type HeatmapMetric = 'risk' | 'wind' | 'rain' | 'snow';

export interface Band {
  /** Inclusive lower bound of the band in metric units. */
  min: number;
  label: string;
  rgb: [number, number, number];
  alpha: number;
}

const RISK_ORDER: RiskLevel[] = ['Low', 'Moderate', 'High', 'Severe', 'No Travel'];
const LIGHT_PRECIP: [number, number, number] = [56, 132, 199];
const ALPHA: Record<RiskLevel, number> = {
  Low: 0.1,
  Moderate: 0.26,
  High: 0.42,
  Severe: 0.5,
  'No Travel': 0.58,
};

function band(level: RiskLevel, min: number, label: string, alpha = ALPHA[level]): Band {
  return { min, label, rgb: RISK_COLOR_MAP[level].rgb, alpha };
}

const NONE: Band = { min: -Infinity, label: '', rgb: LIGHT_PRECIP, alpha: 0 };

/** Bands follow the assessment thresholds, so map colour = risk class of that value. */
export const METRIC_BANDS: Record<HeatmapMetric, Band[]> = {
  // Risk is interpolated as 0..4, so band edges sit half-way between classes.
  risk: [
    band('Low', -Infinity, 'Low'),
    band('Moderate', 0.5, 'Moderate'),
    band('High', 1.5, 'High'),
    band('Severe', 2.5, 'Severe'),
    band('No Travel', 3.5, 'No Travel'),
  ],
  wind: [
    band('Low', -Infinity, '<25 mph', 0),
    band('Moderate', 25, '25-34'),
    band('High', 35, '35-44'),
    band('Severe', 45, '45-54'),
    band('No Travel', 55, '≥55'),
  ],
  rain: [
    NONE,
    { min: 0.01, label: '<0.10 in/h', rgb: LIGHT_PRECIP, alpha: 0.16 },
    band('Moderate', 0.1, '0.10-0.25'),
    band('High', 0.25, '0.25-0.50'),
    band('Severe', 0.5, '0.50-1.00'),
    band('No Travel', 1.0, '>1.00'),
  ],
  snow: [
    NONE,
    { min: 0.05, label: '<0.5 in/h', rgb: LIGHT_PRECIP, alpha: 0.16 },
    band('Moderate', 0.5, '0.5-1.0'),
    band('High', 1.0, '1.0-2.0'),
    band('Severe', 2.0, '2.0-3.0'),
    band('No Travel', 3.0, '>3.0'),
  ],
};

export function metricValue(snap: HourlyForecastSnap, metric: HeatmapMetric): number {
  switch (metric) {
    case 'risk':
      return RISK_ORDER.indexOf(snap.risk);
    case 'wind':
      return snap.wind_mph;
    case 'rain':
      return snap.rain_in_hr;
    case 'snow':
      return snap.snow_in_hr;
  }
}

function bandFor(bands: Band[], value: number): Band {
  let chosen = bands[0];
  for (const band of bands) {
    if (value >= band.min) chosen = band;
  }
  return chosen;
}

export interface FieldPoint {
  x: number;
  y: number;
  value: number;
}

const CELL_PX = 5;
let scratch: HTMLCanvasElement | null = null;

/**
 * Paint a continuous weather field: inverse-distance interpolation of node values on a coarse grid,
 * classified into threshold bands, faded out away from data, then upscaled with smoothing.
 */
export function drawField(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  points: FieldPoint[],
  bands: Band[],
  radiusPx: number
): void {
  ctx.clearRect(0, 0, width, height);
  if (!points.length) return;

  const gw = Math.ceil(width / CELL_PX);
  const gh = Math.ceil(height / CELL_PX);
  scratch ??= document.createElement('canvas');
  scratch.width = gw;
  scratch.height = gh;
  const sctx = scratch.getContext('2d');
  if (!sctx) return;
  const image = sctx.createImageData(gw, gh);
  const data = image.data;

  const cutoff = radiusPx * 2.2;
  const cutoff2 = cutoff * cutoff;
  const soften2 = (radiusPx * 0.35) ** 2;

  // Bucket points by cutoff-sized tiles so each cell only visits nearby points.
  const bw = Math.ceil(width / cutoff) + 1;
  const bh = Math.ceil(height / cutoff) + 1;
  const buckets: FieldPoint[][] = Array.from({ length: bw * bh }, () => []);
  for (const p of points) {
    const bx = Math.min(bw - 1, Math.max(0, Math.floor(p.x / cutoff)));
    const by = Math.min(bh - 1, Math.max(0, Math.floor(p.y / cutoff)));
    buckets[by * bw + bx].push(p);
  }

  for (let gy = 0; gy < gh; gy++) {
    const cy = (gy + 0.5) * CELL_PX;
    const by = Math.floor(cy / cutoff);
    for (let gx = 0; gx < gw; gx++) {
      const cx = (gx + 0.5) * CELL_PX;
      const bx = Math.floor(cx / cutoff);
      let num = 0;
      let den = 0;
      let nearest2 = Infinity;
      for (let ny = Math.max(0, by - 1); ny <= Math.min(bh - 1, by + 1); ny++) {
        for (let nx = Math.max(0, bx - 1); nx <= Math.min(bw - 1, bx + 1); nx++) {
          for (const p of buckets[ny * bw + nx]) {
            const dx = p.x - cx;
            const dy = p.y - cy;
            const d2 = dx * dx + dy * dy;
            if (d2 > cutoff2) continue;
            const w = 1 / (d2 + soften2);
            num += w * p.value;
            den += w;
            if (d2 < nearest2) nearest2 = d2;
          }
        }
      }
      if (den === 0) continue;
      const band = bandFor(bands, num / den);
      if (band.alpha === 0) continue;
      const nearest = Math.sqrt(nearest2);
      const t = Math.min(1, Math.max(0, (nearest - radiusPx) / (cutoff - radiusPx)));
      const fade = 1 - t * t * (3 - 2 * t);
      const o = (gy * gw + gx) * 4;
      data[o] = band.rgb[0];
      data[o + 1] = band.rgb[1];
      data[o + 2] = band.rgb[2];
      data[o + 3] = Math.round(255 * band.alpha * fade);
    }
  }

  sctx.putImageData(image, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  // Soften band edges; browsers without canvas filters just draw the smoothed upscale.
  ctx.filter = `blur(${CELL_PX * 1.4}px)`;
  ctx.drawImage(scratch, 0, 0, gw * CELL_PX, gh * CELL_PX);
  ctx.filter = 'none';
}
