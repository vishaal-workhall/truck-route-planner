import { useState } from 'react';
import {
  CloudRain,
  CloudSnow,
  Funnel,
  MapPin,
  Thermometer,
  Warning,
  Wind,
} from '@phosphor-icons/react';
import type { RouteCheckpoint, RouteOption } from '../types/routing';
import { formatEtaTimestamp, RISK_COLOR_MAP } from '../utils/riskColors';

interface CheckpointTimelineProps {
  route: RouteOption;
  samplingIntervalMiles: number;
  onSelectCheckpoint: (cp: RouteCheckpoint) => void;
  focusedCheckpointIndex: number | null;
}

export function CheckpointTimeline({
  route,
  samplingIntervalMiles,
  onSelectCheckpoint,
  focusedCheckpointIndex,
}: CheckpointTimelineProps) {
  const [filterMode, setFilterMode] = useState<'all' | 'hazards'>('all');

  const checkpoints = route.checkpoints || [];
  const hazardCheckpoints = checkpoints.filter((cp) =>
    ['Moderate', 'High', 'Severe', 'No Travel'].includes(cp.risk.overall_risk)
  );
  const displayedCheckpoints =
    filterMode === 'hazards' ? hazardCheckpoints : checkpoints;

  return (
    <div className="rounded-2xl border border-zinc-800/90 bg-zinc-900/75 p-5 shadow-xl">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h3 className="text-base font-bold text-zinc-100 flex items-center gap-2">
            <MapPin size={18} className="text-emerald-400" weight="duotone" />
            Checkpoint ETA Weather &amp; Risk Log ({route.name})
          </h3>
          <p className="text-xs text-zinc-400 mt-0.5">
            Sampled every {samplingIntervalMiles} miles using the truck&apos;s
            estimated arrival time (ETA) at each milepost. Click any checkpoint
            to focus on the map.
          </p>
        </div>

        <div className="inline-flex items-center rounded-xl bg-zinc-950 p-1 border border-zinc-800 text-xs">
          <button
            type="button"
            onClick={() => setFilterMode('all')}
            className={`rounded-lg px-3 py-1.5 font-medium transition cursor-pointer ${
              filterMode === 'all'
                ? 'bg-zinc-800 text-zinc-100'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            All Checkpoints ({checkpoints.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterMode('hazards')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-medium transition cursor-pointer ${
              filterMode === 'hazards'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Funnel size={13} />
            Elevated Risk Only ({hazardCheckpoints.length})
          </button>
        </div>
      </div>

      {/* Visual Corridor Milepost Risk Strip */}
      <div className="mb-4 rounded-xl bg-zinc-950/90 p-3 border border-zinc-800/90">
        <div className="flex items-center justify-between text-[11px] text-zinc-400 mb-1.5 font-mono">
          <span>Origin (Mile 0)</span>
          <span>Corridor Risk Ribbon (Click any segment)</span>
          <span>Destination (Mile {route.distance_miles.toFixed(0)})</span>
        </div>
        <div className="flex h-3.5 w-full overflow-hidden rounded-lg bg-zinc-900 p-0.5 gap-0.5">
          {checkpoints.map((cp) => {
            const cfg =
              RISK_COLOR_MAP[cp.risk.overall_risk] || RISK_COLOR_MAP.Low;
            return (
              <button
                key={cp.index}
                type="button"
                onClick={() => onSelectCheckpoint(cp)}
                title={`Mile ${cp.mile.toFixed(0)} (${cp.label}): ${cp.risk.overall_risk} - Wind ${cp.weather.wind_mph} mph`}
                style={{ backgroundColor: cfg.hex }}
                className="flex-1 h-full first:rounded-l-md last:rounded-r-md opacity-90 hover:opacity-100 transition cursor-pointer"
              />
            );
          })}
        </div>
      </div>

      {/* Checkpoint Telemetry Cards Grid */}
      {displayedCheckpoints.length === 0 ? (
        <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/60 p-8 text-center text-sm text-zinc-400">
          No elevated weather risk checkpoints on this route. All{' '}
          {checkpoints.length} checkpoints are classified as Low risk.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 max-h-[420px] overflow-y-auto pr-1">
          {displayedCheckpoints.map((cp) => {
            const cfg =
              RISK_COLOR_MAP[cp.risk.overall_risk] || RISK_COLOR_MAP.Low;
            const isFocused = focusedCheckpointIndex === cp.index;

            return (
              <button
                key={cp.index}
                type="button"
                onClick={() => onSelectCheckpoint(cp)}
                className={`text-left rounded-xl p-3.5 border transition cursor-pointer ${
                  isFocused
                    ? 'bg-zinc-800/90 border-emerald-500/60 ring-1 ring-emerald-500/30'
                    : 'bg-zinc-950/70 border-zinc-800/90 hover:border-zinc-700 hover:bg-zinc-900'
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className="font-mono text-xs font-bold text-zinc-200">
                    Mile {cp.mile.toFixed(0)} - {cp.label}
                  </span>
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold border ${cfg.badgeBg} ${cfg.badgeText} ${cfg.badgeBorder}`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${cfg.dotClass}`} />
                    {cp.risk.overall_risk}
                  </span>
                </div>

                <div className="text-[11px] text-zinc-400 mb-2.5 flex items-center justify-between">
                  <span>ETA: {formatEtaTimestamp(cp.eta_iso)}</span>
                  <span className="font-mono">+{cp.elapsed_hours.toFixed(1)}h</span>
                </div>

                <div className="grid grid-cols-4 gap-1.5 rounded-lg bg-zinc-900/90 p-2 border border-zinc-800/70 text-[11px] font-mono">
                  <div title="Wind Speed (mph)">
                    <span className="text-zinc-400 flex items-center gap-1">
                      <Wind size={11} className="text-sky-400" />
                      Wind
                    </span>
                    <strong className="text-zinc-100">
                      {cp.weather.wind_mph.toFixed(0)}mph
                    </strong>
                  </div>
                  <div title="Rain Rate (in/hr)">
                    <span className="text-zinc-400 flex items-center gap-1">
                      <CloudRain size={11} className="text-blue-400" />
                      Rain
                    </span>
                    <strong className="text-zinc-100">
                      {cp.weather.rain_in_hr.toFixed(2)}&quot;
                    </strong>
                  </div>
                  <div title="Snowfall Rate (in/hr)">
                    <span className="text-zinc-400 flex items-center gap-1">
                      <CloudSnow size={11} className="text-indigo-300" />
                      Snow
                    </span>
                    <strong className="text-zinc-100">
                      {cp.weather.snow_in_hr.toFixed(2)}&quot;
                    </strong>
                  </div>
                  <div title="Surface Air Temp (F)">
                    <span className="text-zinc-400 flex items-center gap-1">
                      <Thermometer size={11} className="text-amber-400" />
                      Temp
                    </span>
                    <strong className="text-zinc-100">
                      {cp.weather.temperature_f.toFixed(0)}F
                    </strong>
                  </div>
                </div>

                <div className="mt-2 flex items-center justify-between text-[11px] text-zinc-300">
                  <span>
                    Surface:{' '}
                    <strong className="text-zinc-200">
                      {cp.risk.road_condition.surface_state}
                    </strong>
                  </span>
                </div>

                {cp.risk.load_escalation_note && (
                  <div className="mt-2 flex items-start gap-1.5 rounded-lg bg-red-500/15 border border-red-500/35 px-2.5 py-1.5 text-[11px] text-red-200">
                    <Warning
                      size={14}
                      weight="fill"
                      className="text-red-400 shrink-0 mt-0.5"
                    />
                    <span>{cp.risk.load_escalation_note}</span>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
