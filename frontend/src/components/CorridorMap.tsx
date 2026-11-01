import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { Pause, Play } from '@phosphor-icons/react';
import type {
  HeatmapCorridor,
  RiskLevel,
  RouteCheckpoint,
  RouteOption,
} from '../types/routing';
import {
  drawField,
  METRIC_BANDS,
  metricValue,
  type HeatmapMetric,
} from '../utils/heatmapField';
import {
  formatDuration,
  formatEtaTimestamp,
  RISK_COLOR_MAP,
} from '../utils/riskColors';
import { ROLE_LABEL, routeChips, routeStroke } from '../utils/routeRoles';
import { escapeHtml, routeRiskRuns } from '../utils/routeRiskSegments';

const METRIC_LEGEND_TITLE: Record<HeatmapMetric, string> = {
  risk: 'Risk',
  wind: 'Wind mph',
  rain: 'Rain in/h',
  snow: 'Snow in/h',
};

/**
 * Leaflet's canvas renderer can run an animation-frame redraw after map.remove() has destroyed
 * its context (seen on React remounts), throwing on clearRect/save. Skip redraws once it is gone.
 */
const SafeCanvas = L.Canvas.extend({
  _redraw(this: { _ctx?: CanvasRenderingContext2D; _redrawRequest: number | null }) {
    if (!this._ctx) {
      this._redrawRequest = null;
      return;
    }
    (L.Canvas.prototype as unknown as { _redraw: () => void })._redraw.call(this);
  },
});

/** Canvas is padded beyond the viewport so short pans don't reveal blank edges before redraw. */
const HEATMAP_PAD = 0.25;

interface CorridorMapProps {
  routes: RouteOption[];
  selectedRouteId: string;
  onSelectRoute: (routeId: string) => void;
  focusedCheckpoint: RouteCheckpoint | null;
  onSelectCheckpoint: (cp: RouteCheckpoint) => void;
  heatmap: HeatmapCorridor;
  forecastHour: number;
  onChangeForecastHour: (hour: number | ((prev: number) => number)) => void;
  useSliderTimeForCheckpoints: boolean;
  onToggleSliderTimeMode: (useSlider: boolean) => void;
}

export function CorridorMap({
  routes,
  selectedRouteId,
  onSelectRoute,
  focusedCheckpoint,
  onSelectCheckpoint,
  heatmap,
  forecastHour,
  onChangeForecastHour,
  useSliderTimeForCheckpoints,
  onToggleSliderTimeMode,
}: CorridorMapProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const routeLayersRef = useRef<L.LayerGroup | null>(null);
  const checkpointLayersRef = useRef<L.LayerGroup | null>(null);
  const truckMarkerRef = useRef<L.LayerGroup | null>(null);
  const canvasOverlayRef = useRef<HTMLCanvasElement | null>(null);
  const fittedPlanKeyRef = useRef<string>('');

  const [showHeatmap, setShowHeatmap] = useState<boolean>(true);
  const [heatmapMetric, setHeatmapMetric] = useState<HeatmapMetric>('risk');
  const [isPlaying, setIsPlaying] = useState<boolean>(false);

  const selectedRoute =
    routes.find((r) => r.id === selectedRouteId) || routes[0];

  // Auto-advance 0-48h forecast slider when playing
  useEffect(() => {
    if (!isPlaying) return;
    const timer = window.setInterval(() => {
      onChangeForecastHour((prev) => (prev + 1) % 49);
    }, 450);
    return () => window.clearInterval(timer);
  }, [isPlaying, onChangeForecastHour]);

  // Initialize Leaflet Map once
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [39.5, -98.5],
      zoom: 4,
      zoomControl: false,
      preferCanvas: true,
      renderer: new SafeCanvas() as L.Renderer,
    });

    L.control.zoom({ position: 'topright' }).addTo(map);

    const tileOptions = { maxZoom: 16, attribution: 'Tiles &copy; Esri' };
    L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',
      tileOptions
    ).addTo(map);
    L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}',
      { maxZoom: 16 }
    ).addTo(map);

    // Heatmap lives in its own pane under the route lines, so it pans with the map for free
    // and is hidden by Leaflet during zoom animation (leaflet-zoom-hide).
    const heatPane = map.createPane('heatmap');
    heatPane.style.zIndex = '350';
    heatPane.style.pointerEvents = 'none';
    const canvas = L.DomUtil.create('canvas', 'leaflet-zoom-hide', heatPane);
    canvasOverlayRef.current = canvas;

    routeLayersRef.current = L.layerGroup().addTo(map);
    checkpointLayersRef.current = L.layerGroup().addTo(map);
    truckMarkerRef.current = L.layerGroup().addTo(map);
    mapInstanceRef.current = map;
    const sizeTimer = window.setTimeout(() => map.invalidateSize(), 200);

    return () => {
      window.clearTimeout(sizeTimer);
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Weather field: redrawn on hour/metric change and when a pan or zoom settles, never per frame.
  useEffect(() => {
    const map = mapInstanceRef.current;
    const canvas = canvasOverlayRef.current;
    if (!map || !canvas) return;

    const nodes = heatmap?.nodes ?? [];
    let radiusKm = 60;
    if (nodes.length) {
      const lats = nodes.map((n) => n.lat);
      const lngs = nodes.map((n) => n.lng);
      const spanKm =
        Math.hypot(
          Math.max(...lats) - Math.min(...lats),
          (Math.max(...lngs) - Math.min(...lngs)) * Math.cos((lats[0] * Math.PI) / 180)
        ) * 111;
      radiusKm = Math.min(160, Math.max(40, spanKm / 9));
    }

    const draw = () => {
      const size = map.getSize();
      const padX = Math.round(size.x * HEATMAP_PAD);
      const padY = Math.round(size.y * HEATMAP_PAD);
      const width = size.x + padX * 2;
      const height = size.y + padY * 2;
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      const origin = map.containerPointToLayerPoint([-padX, -padY]);
      L.DomUtil.setPosition(canvas, origin);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      if (!showHeatmap || !nodes.length) {
        ctx.clearRect(0, 0, width, height);
        return;
      }

      const centre = map.getCenter();
      const a = map.latLngToContainerPoint(centre);
      const b = map.latLngToContainerPoint([centre.lat + radiusKm / 111, centre.lng]);
      const radiusPx = Math.max(10, Math.abs(a.y - b.y));

      const points = [];
      for (const node of nodes) {
        const snap = node.hourly[Math.min(forecastHour, node.hourly.length - 1)];
        if (!snap) continue;
        const pt = map.latLngToContainerPoint([node.lat, node.lng]);
        const x = pt.x + padX;
        const y = pt.y + padY;
        if (x < -radiusPx * 3 || y < -radiusPx * 3 || x > width + radiusPx * 3 || y > height + radiusPx * 3) {
          continue;
        }
        points.push({ x, y, value: metricValue(snap, heatmapMetric) });
      }
      drawField(ctx, width, height, points, METRIC_BANDS[heatmapMetric], radiusPx);
    };

    draw();
    map.on('moveend zoomend resize', draw);
    return () => {
      map.off('moveend zoomend resize', draw);
    };
  }, [heatmap, forecastHour, showHeatmap, heatmapMetric]);

  // Fit the camera to the trip once the map has a real size.
  // The first fit often runs before layout, which leaves a world view.
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !routes.length) return;

    const planKey = routes
      .map((r) => `${r.id}:${r.distance_miles}`)
      .join('|');

    const fit = () => {
      const allPoints: [number, number][] = [];
      for (const r of routes) {
        for (const pt of r.geometry) {
          allPoints.push(pt);
        }
      }
      if (allPoints.length < 2) return;
      map.invalidateSize();
      map.fitBounds(L.latLngBounds(allPoints), { padding: [42, 42], maxZoom: 9 });
    };

    if (fittedPlanKeyRef.current !== planKey) {
      fittedPlanKeyRef.current = planKey;
      fit();
    }
    const timer = window.setTimeout(fit, 250);
    return () => window.clearTimeout(timer);
  }, [routes]);

  const checkpointForecastHour = useSliderTimeForCheckpoints ? forecastHour : 0;

  // Render all 3 route polylines & checkpoints
  useEffect(() => {
    const map = mapInstanceRef.current;
    const routeGroup = routeLayersRef.current;
    const cpGroup = checkpointLayersRef.current;
    if (!map || !routeGroup || !cpGroup) return;

    routeGroup.clearLayers();
    cpGroup.clearLayers();

    // Draw unselected routes first so the selected route renders on top
    const orderedRoutes = [...routes].sort((a, b) =>
      a.id === selectedRouteId ? 1 : b.id === selectedRouteId ? -1 : 0
    );

    for (const route of orderedRoutes) {
      const isSelected = route.id === selectedRouteId;
      const baseColor = routeStroke(route, routes);

      if (isSelected) {
        L.polyline(route.geometry, {
          color: '#ffffff',
          weight: 10,
          opacity: 1,
          lineCap: 'round',
        }).addTo(routeGroup);
      }

      const tooltip = `<div style="font-size:12px;font-weight:600;">${escapeHtml(route.name)}</div>
         <div style="font-size:11px;color:#4d5966;">Safety score ${route.safety.overall_safety_score}/100 | ${route.distance_miles.toFixed(0)} mi | ${formatDuration(route.duration_minutes)}</div>`;

      if (isSelected) {
        // Selected route is drawn in its checkpoints' risk colours, so risk reads straight off the map.
        const riskAt = (index: number): RiskLevel => {
          const cp = route.checkpoints[index];
          if (!useSliderTimeForCheckpoints) return cp.risk.overall_risk;
          const snap = cp.hourly_forecast[Math.min(checkpointForecastHour, cp.hourly_forecast.length - 1)];
          return snap?.risk ?? cp.risk.overall_risk;
        };
        for (const run of routeRiskRuns(route, riskAt)) {
          const segment = L.polyline(run.points, {
            color: RISK_COLOR_MAP[run.risk].hex,
            weight: 6,
            opacity: 1,
            lineCap: 'round',
          });
          segment.bindTooltip(tooltip, { sticky: true });
          segment.addTo(routeGroup);
        }
      } else {
        const line = L.polyline(route.geometry, {
          color: baseColor,
          weight: 3.5,
          opacity: 0.8,
          dashArray: '7 8',
          lineCap: 'round',
        });
        line.on('click', () => onSelectRoute(route.id));
        line.bindTooltip(tooltip, { sticky: true });
        line.addTo(routeGroup);
      }

      // Draw checkpoints: full detail for selected route, subtle dots for unselected routes
      for (const cp of route.checkpoints) {
        const snap = useSliderTimeForCheckpoints
          ? cp.hourly_forecast[
              Math.min(checkpointForecastHour, cp.hourly_forecast.length - 1)
            ]
          : null;

        const activeRisk: RiskLevel = snap ? snap.risk : cp.risk.overall_risk;
        const activeWind = snap ? snap.wind_mph : cp.weather.wind_mph;
        const activeRain = snap ? snap.rain_in_hr : cp.weather.rain_in_hr;
        const activeSnow = snap ? snap.snow_in_hr : cp.weather.snow_in_hr;
        const activeTemp = snap ? snap.temperature_f : cp.weather.temperature_f;

        const cpColor = RISK_COLOR_MAP[activeRisk] || RISK_COLOR_MAP.Low;
        const isOriginOrDest =
          cp.index === 0 || cp.index === route.checkpoints.length - 1;

        if (!isSelected && !isOriginOrDest) {
          const miniDot = L.circleMarker([cp.lat, cp.lng], {
            radius: 3.5,
            fillColor: cpColor.hex,
            fillOpacity: 0.55,
            color: '#ffffff',
            weight: 1,
          });
          miniDot.on('click', () => {
            onSelectRoute(route.id);
            onSelectCheckpoint(cp);
          });
          miniDot.addTo(cpGroup);
          continue;
        }

        const markerRadius = isOriginOrDest
          ? 8.5
          : activeRisk === 'No Travel' || activeRisk === 'Severe'
            ? 7.5
            : 6.0;

        const marker = L.circleMarker([cp.lat, cp.lng], {
          radius: markerRadius,
          fillColor: cpColor.hex,
          fillOpacity: 0.95,
          color: '#ffffff',
          weight: isOriginOrDest ? 2.5 : 2,
        });

        const popupHtml = `
          <div style="min-width:225px;font-family:inherit;">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px;">
              <span style="font-size:12px;font-weight:600;color:#17202b;">
                Mile ${cp.mile.toFixed(0)}, ${escapeHtml(cp.label)}
              </span>
              <span style="font-size:11px;font-weight:600;padding:2px 6px;background:${cpColor.hex}22;color:${cpColor.hex};border:1px solid ${cpColor.hex}55;">
                ${activeRisk}
              </span>
            </div>
            <div style="font-size:12px;color:#4d5966;margin-bottom:8px;">
              ${
                useSliderTimeForCheckpoints
                  ? `Forecast hour <strong style="color:#17202b;">+${checkpointForecastHour}h</strong>`
                  : `Arrival <strong style="color:#17202b;">${formatEtaTimestamp(cp.eta_iso)}</strong> (+${cp.elapsed_hours.toFixed(1)}h)`
              }
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;background:#f7f8f9;padding:8px;border:1px solid #e1e4e8;font-size:12px;color:#17202b;">
              <div><span style="color:#4d5966;">Wind</span> <strong>${activeWind.toFixed(0)} mph</strong>${
                !snap && cp.weather.gust_mph ? ` <span style="color:#4d5966;">(gust ${cp.weather.gust_mph.toFixed(0)})</span>` : ''
              }</div>
              <div><span style="color:#4d5966;">Temp</span> <strong>${activeTemp.toFixed(0)} F</strong></div>
              <div><span style="color:#4d5966;">Rain</span> <strong>${activeRain.toFixed(2)} in/h</strong></div>
              <div><span style="color:#4d5966;">Snow</span> <strong>${activeSnow.toFixed(2)} in/h</strong></div>
            </div>
            <div style="margin-top:7px;font-size:12px;color:#17202b;">
              <span style="color:#4d5966;">Surface</span> ${cp.risk.road_condition.surface_state}
            </div>
            ${
              cp.risk.load_escalation_note
                ? `<div style="margin-top:6px;padding:6px 8px;background:#fde8e6;border:1px solid #f0b8b2;color:#6f1d18;font-size:12px;">
                     ${escapeHtml(cp.risk.load_escalation_note)}
                   </div>`
                : ''
            }
          </div>
        `;

        marker.bindPopup(popupHtml);
        marker.on('click', () => onSelectCheckpoint(cp));
        marker.addTo(cpGroup);
      }
    }
  }, [
    routes,
    selectedRouteId,
    checkpointForecastHour,
    useSliderTimeForCheckpoints,
    onSelectRoute,
    onSelectCheckpoint,
  ]);

  // Render simulated truck position along the active route at `forecastHour`
  useEffect(() => {
    const truckGroup = truckMarkerRef.current;
    if (!truckGroup || !selectedRoute) return;
    truckGroup.clearLayers();

    const totalHours = Math.max(selectedRoute.duration_minutes / 60, 0.2);
    if (forecastHour > totalHours + 0.5) return;

    const cps = selectedRoute.checkpoints;
    if (!cps.length) return;

    let chosenCp = cps[0];
    for (const cp of cps) {
      if (cp.elapsed_hours <= forecastHour) {
        chosenCp = cp;
      } else {
        break;
      }
    }

    const truckIcon = L.divIcon({
      className: 'custom-truck-marker',
      html: `<div style="width:14px;height:14px;background:#17202b;border:2px solid #ffffff;box-shadow:0 0 0 1px #17202b;"></div>`,
      iconSize: [14, 14],
      iconAnchor: [7, 7],
    });

    const marker = L.marker([chosenCp.lat, chosenCp.lng], {
      icon: truckIcon,
      zIndexOffset: 900,
    });
    marker.bindTooltip(
      `Truck Position at +${forecastHour}h (Mile ${chosenCp.mile.toFixed(0)} - ${chosenCp.label})`,
      { direction: 'top', offset: [0, -12] }
    );
    marker.addTo(truckGroup);
  }, [selectedRoute, forecastHour]);

  // Pan to focused checkpoint when clicked in timeline
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !focusedCheckpoint) return;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    map.flyTo([focusedCheckpoint.lat, focusedCheckpoint.lng], 7, {
      duration: reduceMotion ? 0 : 0.6,
    });
  }, [focusedCheckpoint]);

  // Compute slider timestamp display
  const sliderTimestampLabel = (() => {
    const startIso = heatmap?.forecast_start_iso ?? heatmap?.departure_iso;
    if (!startIso) return `+${forecastHour}h`;
    const dt = new Date(new Date(startIso).getTime() + forecastHour * 3600 * 1000);
    return dt.toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  })();

  return (
    <div className="flex flex-col bg-white">
      <div id="corridor-map" className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-2.5">
        <div className="min-w-0">
          <p className="text-sm font-semibold">Corridor map</p>
          <p className="text-xs text-muted">
            {selectedRoute?.checkpoints.length || 0} checkpoints. Forecast{' '}
            <span className="font-mono text-ink">+{forecastHour}h</span>
            <span className="hidden sm:inline">, {sliderTimestampLabel}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            aria-pressed={showHeatmap}
            onClick={() => setShowHeatmap((prev) => !prev)}
            className={`min-h-10 cursor-pointer border px-2.5 text-xs font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ${
              showHeatmap
                ? 'border-ink bg-ink text-white'
                : 'border-line bg-white text-ink hover:bg-canvas'
            }`}
          >
            {showHeatmap ? 'Heatmap on' : 'Heatmap off'}
          </button>
          {showHeatmap ? (
            <div role="group" aria-label="Heatmap metric" className="flex border border-line">
              {(
                [
                  { id: 'risk', label: 'Risk' },
                  { id: 'wind', label: 'Wind' },
                  { id: 'rain', label: 'Rain' },
                  { id: 'snow', label: 'Snow' },
                ] as const
              ).map((item) => {
                const active = heatmapMetric === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setHeatmapMetric(item.id)}
                    className={`min-h-10 cursor-pointer px-2.5 text-xs font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ink ${
                      active ? 'bg-canvas text-ink' : 'text-muted hover:text-ink'
                    }`}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-line px-4 py-2">
        {routes.map((route) => {
          const isSelected = route.id === selectedRouteId;
          const chips = routeChips(route, routes);
          return (
            <button
              key={route.id}
              type="button"
              aria-pressed={isSelected}
              onClick={() => onSelectRoute(route.id)}
              className={`inline-flex min-h-10 max-w-full cursor-pointer items-center gap-2 border px-2.5 text-left text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ${
                isSelected ? 'border-ink bg-faint' : 'border-line bg-white hover:bg-canvas'
              }`}
            >
              <span
                className="h-2.5 w-2.5 shrink-0"
                style={{ backgroundColor: routeStroke(route, routes) }}
                aria-hidden
              />
              <span className="truncate font-medium">{route.name}</span>
              <span className="font-mono">{route.safety.overall_safety_score}</span>
              {chips[0] ? <span className="text-muted">{ROLE_LABEL[chips[0]]}</span> : null}
            </button>
          );
        })}
      </div>

      <div className="relative h-[min(58vh,600px)] min-h-[340px] w-full">
        <div ref={mapContainerRef} className="z-0 h-full w-full" />

        <div className="absolute bottom-3 left-3 z-[500] flex max-w-[calc(100%-5rem)] flex-col gap-1 border border-line bg-white px-2.5 py-1.5 text-xs">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="text-muted">
              {showHeatmap && heatmapMetric !== 'risk' ? 'Route risk' : 'Risk'}
            </span>
            {(['Low', 'Moderate', 'High', 'Severe', 'No Travel'] as RiskLevel[]).map((level) => (
              <span key={level} className="inline-flex items-center gap-1.5">
                <span className={`h-2 w-2 ${RISK_COLOR_MAP[level].dotClass}`} aria-hidden />
                {level}
              </span>
            ))}
          </div>
          {showHeatmap && heatmapMetric !== 'risk' ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="text-muted">{METRIC_LEGEND_TITLE[heatmapMetric]}</span>
              {METRIC_BANDS[heatmapMetric]
                .filter((band) => band.label)
                .map((band) => (
                  <span key={band.label} className="inline-flex items-center gap-1.5 font-mono">
                    <span
                      className="h-2 w-3"
                      style={{ backgroundColor: `rgb(${band.rgb.join(',')})`, opacity: band.alpha ? 0.85 : 0.25 }}
                      aria-hidden
                    />
                    {band.label}
                  </span>
                ))}
            </div>
          ) : null}
        </div>
      </div>

      <div className="border-t border-line px-4 py-3">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setIsPlaying((playing) => !playing)}
              className="inline-flex min-h-10 cursor-pointer items-center gap-1.5 border border-line bg-white px-2.5 text-xs font-medium hover:bg-canvas focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              {isPlaying ? <Pause size={14} weight="fill" /> : <Play size={14} weight="fill" />}
              {isPlaying ? 'Pause' : 'Play forecast'}
            </button>
            <p className="font-mono text-xs">
              +{forecastHour}h
              <span className="ml-2 font-sans text-muted">{sliderTimestampLabel}</span>
            </p>
          </div>
          <div
            role="group"
            aria-label="Checkpoint time"
            className="flex border border-line text-xs"
          >
            <button
              type="button"
              aria-pressed={!useSliderTimeForCheckpoints}
              onClick={() => onToggleSliderTimeMode(false)}
              className={`min-h-10 cursor-pointer px-2.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ink ${
                !useSliderTimeForCheckpoints ? 'bg-ink text-white' : 'bg-white hover:bg-canvas'
              }`}
            >
              At arrival
            </button>
            <button
              type="button"
              aria-pressed={useSliderTimeForCheckpoints}
              onClick={() => onToggleSliderTimeMode(true)}
              className={`min-h-10 cursor-pointer border-l border-line px-2.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ink ${
                useSliderTimeForCheckpoints ? 'bg-ink text-white' : 'bg-white hover:bg-canvas'
              }`}
            >
              At +{forecastHour}h
            </button>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="w-8 font-mono text-xs text-muted">0h</span>
          <input
            type="range"
            min={0}
            max={48}
            step={1}
            value={forecastHour}
            onChange={(event) => {
              setIsPlaying(false);
              onChangeForecastHour(Number(event.target.value));
            }}
            aria-label="Forecast hour, 0 to 48"
            className="h-2 w-full cursor-pointer accent-ink"
          />
          <span className="w-10 text-right font-mono text-xs text-muted">48h</span>
        </div>
        <p className="mt-2 text-xs leading-5 text-muted">
          The heatmap shows conditions at{' '}
          <span className="font-mono text-ink">+{forecastHour}h</span>.{' '}
          {useSliderTimeForCheckpoints
            ? 'The route and checkpoints show the same hour.'
            : 'The route and checkpoints show conditions when the truck reaches each one.'}{' '}
          Trip time{' '}
          <span className="font-mono text-ink">
            {selectedRoute ? formatDuration(selectedRoute.duration_minutes) : '-'}
          </span>
          {selectedRoute?.hos_stops?.length
            ? `, including ${selectedRoute.hos_stops.length} HOS stop${selectedRoute.hos_stops.length > 1 ? 's' : ''}`
            : ''}
          .
        </p>
      </div>
    </div>
  );
}
