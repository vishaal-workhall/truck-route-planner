import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import {
  Clock,
  CloudRain,
  CloudSnow,
  Compass,
  Fire,
  Pause,
  Play,
  ShieldWarning,
  Truck,
  Wind,
} from '@phosphor-icons/react';
import type {
  HeatmapCorridor,
  RiskLevel,
  RouteCheckpoint,
  RouteOption,
} from '../types/routing';
import {
  formatDuration,
  formatEtaTimestamp,
  RISK_COLOR_MAP,
} from '../utils/riskColors';

export type HeatmapMetric = 'risk' | 'wind' | 'rain' | 'snow';

interface CorridorMapProps {
  routes: RouteOption[];
  selectedRouteId: string;
  onSelectRoute: (routeId: string) => void;
  focusedCheckpoint: RouteCheckpoint | null;
  onSelectCheckpoint: (cp: RouteCheckpoint) => void;
  heatmap: HeatmapCorridor;
  forecastHour: number;
  onChangeForecastHour: (hour: number) => void;
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
      onChangeForecastHour((forecastHour + 1) % 49);
    }, 450);
    return () => window.clearInterval(timer);
  }, [isPlaying, forecastHour, onChangeForecastHour]);

  // Initialize Leaflet Map once
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [39.8283, -98.5795],
      zoom: 5,
      zoomControl: true,
      preferCanvas: true,
    });

    L.tileLayer(
      'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
      {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 18,
      }
    ).addTo(map);

    routeLayersRef.current = L.layerGroup().addTo(map);
    checkpointLayersRef.current = L.layerGroup().addTo(map);
    truckMarkerRef.current = L.layerGroup().addTo(map);
    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Render Canvas Weather Heatmap overlay on pan/zoom/hour/metric change
  useEffect(() => {
    const map = mapInstanceRef.current;
    const canvas = canvasOverlayRef.current;
    if (!map || !canvas) return;

    const drawHeatmap = () => {
      const size = map.getSize();
      if (canvas.width !== size.x || canvas.height !== size.y) {
        canvas.width = size.x;
        canvas.height = size.y;
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (!showHeatmap || !heatmap?.nodes?.length) return;

      const zoom = map.getZoom();
      const baseRadius = Math.max(38, Math.min(115, (zoom - 2) * 20));

      for (const node of heatmap.nodes) {
        const snap =
          node.hourly[Math.min(forecastHour, node.hourly.length - 1)] ||
          node.hourly[0];
        if (!snap) continue;

        let rgb: [number, number, number] = [16, 185, 129];
        let intensity = 0.16;

        if (heatmapMetric === 'risk') {
          const riskCfg = RISK_COLOR_MAP[snap.risk] || RISK_COLOR_MAP.Low;
          rgb = riskCfg.rgb;
          const weightMap: Record<RiskLevel, number> = {
            Low: 0.14,
            Moderate: 0.28,
            High: 0.42,
            Severe: 0.56,
            'No Travel': 0.72,
          };
          intensity = weightMap[snap.risk] ?? 0.18;
        } else if (heatmapMetric === 'wind') {
          const w = snap.wind_mph;
          intensity = Math.min(0.7, Math.max(0.12, (w - 10) / 60));
          rgb =
            w >= 55
              ? [236, 72, 153]
              : w >= 45
                ? [239, 68, 68]
                : w >= 35
                  ? [249, 115, 22]
                  : w >= 25
                    ? [234, 179, 8]
                    : [56, 189, 248];
        } else if (heatmapMetric === 'rain') {
          const r = snap.rain_in_hr;
          if (r < 0.02) continue;
          intensity = Math.min(0.72, Math.max(0.18, r / 0.9));
          rgb =
            r > 1.0
              ? [236, 72, 153]
              : r > 0.5
                ? [239, 68, 68]
                : r > 0.25
                  ? [59, 130, 246]
                  : [56, 189, 248];
        } else if (heatmapMetric === 'snow') {
          const s = snap.snow_in_hr;
          if (s < 0.05) continue;
          intensity = Math.min(0.75, Math.max(0.22, s / 2.6));
          rgb =
            s > 3.0
              ? [236, 72, 153]
              : s > 2.0
                ? [168, 85, 247]
                : s >= 0.5
                  ? [99, 102, 241]
                  : [147, 197, 253];
        }

        if (!node.is_route_node) {
          intensity *= 0.65;
        }

        const pt = map.latLngToContainerPoint([node.lat, node.lng]);
        const radius = node.is_route_node ? baseRadius : baseRadius * 1.35;

        if (
          pt.x < -radius ||
          pt.y < -radius ||
          pt.x > size.x + radius ||
          pt.y > size.y + radius
        ) {
          continue;
        }

        const grad = ctx.createRadialGradient(
          pt.x,
          pt.y,
          radius * 0.08,
          pt.x,
          pt.y,
          radius
        );
        grad.addColorStop(
          0,
          `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${intensity})`
        );
        grad.addColorStop(
          0.55,
          `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${intensity * 0.45})`
        );
        grad.addColorStop(1, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0)`);

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    drawHeatmap();
    map.on('move zoom resize', drawHeatmap);
    return () => {
      map.off('move zoom resize', drawHeatmap);
    };
  }, [heatmap, forecastHour, showHeatmap, heatmapMetric]);

  // Fit bounds when a new set of routes arrives
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !routes.length) return;

    const planKey = routes
      .map((r) => `${r.id}:${r.distance_miles}`)
      .join('|');
    if (fittedPlanKeyRef.current === planKey) return;
    fittedPlanKeyRef.current = planKey;

    const allPoints: [number, number][] = [];
    for (const r of routes) {
      for (const pt of r.geometry) {
        allPoints.push(pt);
      }
    }
    if (allPoints.length > 1) {
      const bounds = L.latLngBounds(allPoints);
      map.fitBounds(bounds, { padding: [42, 42], maxZoom: 9 });
    }
  }, [routes]);

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
      const isRec = route.is_recommended;
      const riskCfg =
        RISK_COLOR_MAP[route.safety.overall_risk_level] || RISK_COLOR_MAP.Low;

      const baseColor = isSelected
        ? isRec
          ? '#10b981'
          : riskCfg.hex
        : '#71717a';

      // Outer subtle casing for selected route
      if (isSelected) {
        L.polyline(route.geometry, {
          color: '#09090b',
          weight: 9,
          opacity: 0.85,
          lineCap: 'round',
        }).addTo(routeGroup);
      }

      const line = L.polyline(route.geometry, {
        color: baseColor,
        weight: isSelected ? 5.5 : 3.5,
        opacity: isSelected ? 0.96 : 0.55,
        dashArray: isSelected ? undefined : '6, 8',
        lineCap: 'round',
      });

      line.on('click', () => onSelectRoute(route.id));
      line.bindTooltip(
        `<div style="font-size:12px;font-weight:600;">${route.name}</div>
         <div style="font-size:11px;color:#a1a1aa;">Safety Score: ${route.safety.overall_safety_score}/100 | ${route.distance_miles.toFixed(0)} mi | ${formatDuration(route.duration_minutes)}</div>`,
        { sticky: true }
      );
      line.addTo(routeGroup);

      // Draw checkpoints: full detail for selected route, subtle dots for unselected routes
      for (const cp of route.checkpoints) {
        const snap = useSliderTimeForCheckpoints
          ? cp.hourly_forecast[
              Math.min(forecastHour, cp.hourly_forecast.length - 1)
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
            color: '#18181b',
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
          color: isOriginOrDest ? '#ffffff' : '#09090b',
          weight: isOriginOrDest ? 2.5 : 2,
        });

        const popupHtml = `
          <div style="min-width:225px;font-family:inherit;">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px;">
              <span style="font-size:11px;font-weight:700;text-transform:uppercase;color:#a1a1aa;">
                Mile ${cp.mile.toFixed(0)} - ${cp.label}
              </span>
              <span style="font-size:11px;font-weight:700;padding:2px 7px;border-radius:999px;background:${cpColor.hex}25;color:${cpColor.hex};border:1px solid ${cpColor.hex}66;">
                ${activeRisk}
              </span>
            </div>
            <div style="font-size:11px;color:#d4d4d8;margin-bottom:8px;">
              ${
                useSliderTimeForCheckpoints
                  ? `Forecast Slider: <strong>+${forecastHour}h from departure</strong>`
                  : `Truck ETA: <strong>${formatEtaTimestamp(cp.eta_iso)}</strong> (+${cp.elapsed_hours.toFixed(1)}h)`
              }
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;background:#09090b;padding:8px;border-radius:8px;border:1px solid #27272a;font-size:11px;">
              <div><span style="color:#71717a;">Wind:</span> <strong>${activeWind.toFixed(0)} mph</strong></div>
              <div><span style="color:#71717a;">Temp:</span> <strong>${activeTemp.toFixed(0)} F</strong></div>
              <div><span style="color:#71717a;">Rain:</span> <strong>${activeRain.toFixed(2)} in/h</strong></div>
              <div><span style="color:#71717a;">Snow:</span> <strong>${activeSnow.toFixed(2)} in/h</strong></div>
            </div>
            <div style="margin-top:7px;font-size:11px;color:#e4e4e7;">
              <span style="color:#71717a;">Road Surface:</span> ${cp.risk.road_condition.surface_state}
            </div>
            ${
              cp.risk.load_escalation_note
                ? `<div style="margin-top:6px;padding:5px 7px;border-radius:6px;background:rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.35);color:#fca5a5;font-size:10.5px;">
                     ${cp.risk.load_escalation_note}
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
    forecastHour,
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
      html: `<div style="display:flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:999px;background:#10b981;color:#09090b;border:2px solid #ffffff;box-shadow:0 0 14px rgba(16,185,129,0.75);font-weight:800;font-size:11px;">
        T
      </div>`,
      iconSize: [28, 28],
      iconAnchor: [14, 14],
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
    map.flyTo([focusedCheckpoint.lat, focusedCheckpoint.lng], 7, {
      duration: 0.65,
    });
  }, [focusedCheckpoint]);

  // Compute slider timestamp display
  const sliderTimestampLabel = (() => {
    if (!heatmap?.departure_iso) return `+${forecastHour}h`;
    const dt = new Date(
      new Date(heatmap.departure_iso).getTime() + forecastHour * 3600 * 1000
    );
    return dt.toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  })();

  return (
    <div className="flex flex-col rounded-2xl border border-zinc-800/90 bg-zinc-900/75 overflow-hidden shadow-xl">
      {/* Top Map Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800/80 px-4 py-3 bg-zinc-900/90">
        <div className="flex items-center gap-2.5">
          <Compass size={18} className="text-emerald-400" weight="duotone" />
          <span className="text-sm font-semibold text-zinc-100">
            Trip Corridor Map &amp; 48h Weather Heatmap
          </span>
          <span className="hidden sm:inline-flex items-center gap-1 rounded-full bg-zinc-800 px-2.5 py-0.5 text-xs font-mono text-zinc-300 border border-zinc-700/70">
            {selectedRoute?.checkpoints.length || 0} checkpoints sampled
          </span>
        </div>

        {/* Heatmap Layer Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowHeatmap((prev) => !prev)}
            className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition cursor-pointer border ${
              showHeatmap
                ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
                : 'bg-zinc-800/80 text-zinc-400 border-zinc-700 hover:text-zinc-200'
            }`}
          >
            <Fire size={14} weight="fill" />
            {showHeatmap ? 'Heatmap On' : 'Heatmap Off'}
          </button>

          {showHeatmap && (
            <div className="inline-flex rounded-lg bg-zinc-950 p-0.5 border border-zinc-800">
              {(
                [
                  { id: 'risk', label: 'Risk', icon: ShieldWarning },
                  { id: 'wind', label: 'Wind', icon: Wind },
                  { id: 'rain', label: 'Rain', icon: CloudRain },
                  { id: 'snow', label: 'Snow', icon: CloudSnow },
                ] as const
              ).map((item) => {
                const Icon = item.icon;
                const active = heatmapMetric === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setHeatmapMetric(item.id)}
                    className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition cursor-pointer ${
                      active
                        ? 'bg-zinc-800 text-zinc-100 shadow-xs'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <Icon size={13} />
                    {item.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Map Viewport + Canvas Heatmap Overlay */}
      <div className="relative h-[430px] sm:h-[490px] w-full">
        <div ref={mapContainerRef} className="h-full w-full z-0" />
        <canvas
          ref={canvasOverlayRef}
          className="pointer-events-none absolute inset-0 z-[400]"
        />

        {/* Floating Route Selector Pills on Map */}
        <div className="absolute top-3 left-14 right-3 z-[500] flex flex-wrap gap-2 pointer-events-none">
          {routes.map((route) => {
            const isSelected = route.id === selectedRouteId;
            const riskStyle =
              RISK_COLOR_MAP[route.safety.overall_risk_level] ||
              RISK_COLOR_MAP.Low;
            return (
              <button
                key={route.id}
                type="button"
                onClick={() => onSelectRoute(route.id)}
                className={`pointer-events-auto flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-medium transition backdrop-blur-md cursor-pointer border ${
                  isSelected
                    ? 'bg-zinc-900/95 text-zinc-100 border-emerald-500/60 shadow-lg'
                    : 'bg-zinc-950/80 text-zinc-300 border-zinc-800 hover:border-zinc-700'
                }`}
              >
                <span
                  className={`h-2.5 w-2.5 rounded-full ${riskStyle.dotClass}`}
                />
                <span className="font-semibold">{route.name}</span>
                <span className="font-mono text-zinc-300">
                  {route.safety.overall_safety_score}/100
                </span>
                {route.is_recommended && (
                  <span className="rounded-md bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-bold uppercase text-emerald-300 border border-emerald-500/30">
                    Best
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Floating Risk Legend */}
        <div className="absolute bottom-3 left-3 z-[500] flex flex-wrap items-center gap-2.5 rounded-xl bg-zinc-950/90 backdrop-blur-md border border-zinc-800/90 px-3 py-2 text-[11px]">
          <span className="font-semibold text-zinc-400 uppercase tracking-wider">
            Risk Scale:
          </span>
          {(
            ['Low', 'Moderate', 'High', 'Severe', 'No Travel'] as RiskLevel[]
          ).map((lvl) => (
            <span key={lvl} className="inline-flex items-center gap-1.5 text-zinc-200">
              <span
                className={`h-2.5 w-2.5 rounded-full ${RISK_COLOR_MAP[lvl].dotClass}`}
              />
              {lvl}
            </span>
          ))}
        </div>
      </div>

      {/* 0-48 Hour Forecast Slider Bar */}
      <div className="border-t border-zinc-800/90 bg-zinc-950/90 px-4 py-3.5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-2.5">
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => setIsPlaying((p) => !p)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold px-3 py-1.5 text-xs transition cursor-pointer"
            >
              {isPlaying ? (
                <>
                  <Pause size={14} weight="fill" />
                  Pause 48h Forecast
                </>
              ) : (
                <>
                  <Play size={14} weight="fill" />
                  Animate 0-48h Weather
                </>
              )}
            </button>
            <div className="flex items-center gap-2 text-xs text-zinc-300">
              <Clock size={15} className="text-emerald-400" />
              <span className="font-mono font-semibold text-zinc-100">
                +{forecastHour}h Forecast Window
              </span>
              <span className="text-zinc-400">({sliderTimestampLabel})</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-400">Checkpoint Dots:</span>
            <div className="inline-flex rounded-lg bg-zinc-900 p-0.5 border border-zinc-800 text-xs">
              <button
                type="button"
                onClick={() => onToggleSliderTimeMode(false)}
                className={`rounded-md px-2.5 py-1 font-medium transition cursor-pointer ${
                  !useSliderTimeForCheckpoints
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                At Truck ETA
              </button>
              <button
                type="button"
                onClick={() => onToggleSliderTimeMode(true)}
                className={`rounded-md px-2.5 py-1 font-medium transition cursor-pointer ${
                  useSliderTimeForCheckpoints
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                At Slider Hour (+{forecastHour}h)
              </button>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs font-mono text-zinc-400 w-10">0h</span>
          <input
            type="range"
            min={0}
            max={48}
            step={1}
            value={forecastHour}
            onChange={(e) => {
              setIsPlaying(false);
              onChangeForecastHour(Number(e.target.value));
            }}
            aria-label="0 to 48 hour weather forecast slider"
            className="w-full accent-emerald-500 cursor-pointer h-2 bg-zinc-800 rounded-lg"
          />
          <span className="text-xs font-mono text-zinc-400 w-10 text-right">
            +48h
          </span>
        </div>

        <div className="mt-2 flex flex-wrap items-center justify-between text-[11px] text-zinc-400">
          <span className="inline-flex items-center gap-1.5">
            <Truck size={13} className="text-emerald-400" />
            Selected Route Duration:{' '}
            <strong className="text-zinc-200 font-mono">
              {selectedRoute
                ? `${(selectedRoute.duration_minutes / 60).toFixed(1)} hrs`
                : '0 hrs'}
            </strong>
          </span>
          <span>
            Drag the 0-48h slider to inspect moving wind, rain, and snow cells
            along the trip corridor.
          </span>
        </div>
      </div>
    </div>
  );
}
