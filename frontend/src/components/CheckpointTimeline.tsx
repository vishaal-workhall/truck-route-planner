import { memo, useState } from 'react';
import { Warning } from '@phosphor-icons/react';
import type { RouteCheckpoint, RouteOption } from '../types/routing';
import { formatEtaTimestamp, RISK_COLOR_MAP } from '../utils/riskColors';

interface CheckpointTimelineProps {
  route: RouteOption;
  samplingIntervalMiles: number;
  onSelectCheckpoint: (cp: RouteCheckpoint) => void;
  focusedCheckpointIndex: number | null;
}

export const CheckpointTimeline = memo(function CheckpointTimeline({
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
  const displayed = filterMode === 'hazards' ? hazardCheckpoints : checkpoints;

  return (
    <section className="border border-line bg-white" aria-labelledby="checkpoint-log">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div>
          <h2 id="checkpoint-log" className="text-sm font-semibold">
            Checkpoints on {route.name}
          </h2>
          <p className="mt-1 text-xs text-muted">
            Sampled every {samplingIntervalMiles} miles at the estimated arrival. Select a row to move the map.
          </p>
        </div>
        <div role="group" aria-label="Checkpoint filter" className="flex border border-line">
          <button
            type="button"
            aria-pressed={filterMode === 'all'}
            onClick={() => setFilterMode('all')}
            className={`min-h-10 cursor-pointer px-3 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ink ${
              filterMode === 'all' ? 'bg-ink text-white' : 'bg-white hover:bg-canvas'
            }`}
          >
            All ({checkpoints.length})
          </button>
          <button
            type="button"
            aria-pressed={filterMode === 'hazards'}
            onClick={() => setFilterMode('hazards')}
            className={`min-h-10 cursor-pointer border-l border-line px-3 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ink ${
              filterMode === 'hazards' ? 'bg-ink text-white' : 'bg-white hover:bg-canvas'
            }`}
          >
            Elevated ({hazardCheckpoints.length})
          </button>
        </div>
      </div>

      <div className="px-4 py-3">
        <div className="mb-1.5 flex justify-between text-xs text-muted">
          <span>Mile 0</span>
          <span>Mile {route.distance_miles.toFixed(0)}</span>
        </div>
        <div className="flex h-2 w-full" aria-hidden>
          {checkpoints.map((cp) => {
            const cfg = RISK_COLOR_MAP[cp.risk.overall_risk] || RISK_COLOR_MAP.Low;
            return (
              <button
                key={cp.index}
                type="button"
                tabIndex={-1}
                onClick={() => onSelectCheckpoint(cp)}
                title={`Mile ${cp.mile.toFixed(0)}, ${cp.label}: ${cp.risk.overall_risk}`}
                aria-label={`Mile ${cp.mile.toFixed(0)}, ${cp.risk.overall_risk}`}
                style={{ backgroundColor: cfg.hex }}
                className="h-full flex-1 cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
              />
            );
          })}
        </div>
      </div>

      {displayed.length === 0 ? (
        <p className="border-t border-line px-4 py-8 text-sm text-muted">
          No elevated checkpoints. All {checkpoints.length} points on this route are Low.
        </p>
      ) : (
        <div className="max-h-[460px] overflow-auto border-t border-line">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="sticky top-0 bg-faint text-xs text-muted">
              <tr className="border-b border-line">
                <th scope="col" className="px-4 py-2 font-medium">Mile</th>
                <th scope="col" className="px-3 py-2 font-medium">Risk</th>
                <th scope="col" className="px-3 py-2 font-medium">Arrival</th>
                <th scope="col" className="px-3 py-2 font-medium">Wind</th>
                <th scope="col" className="px-3 py-2 font-medium">Rain</th>
                <th scope="col" className="px-3 py-2 font-medium">Snow</th>
                <th scope="col" className="px-3 py-2 font-medium">Temp</th>
                <th scope="col" className="px-3 py-2 font-medium">Surface</th>
              </tr>
            </thead>
            <tbody>
              {displayed.map((cp) => {
                const cfg = RISK_COLOR_MAP[cp.risk.overall_risk] || RISK_COLOR_MAP.Low;
                const focused = focusedCheckpointIndex === cp.index;
                return (
                  <tr
                    key={cp.index}
                    tabIndex={0}
                    aria-current={focused ? 'true' : undefined}
                    onClick={() => onSelectCheckpoint(cp)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        onSelectCheckpoint(cp);
                      }
                    }}
                    className={`cursor-pointer border-b border-line align-top focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ink ${
                      focused ? 'bg-[#f4f7f6]' : 'hover:bg-faint'
                    }`}
                  >
                    <th scope="row" className="px-4 py-2.5 text-left font-mono text-xs font-medium">
                      {cp.mile.toFixed(0)}
                      <span className="mt-0.5 block font-sans text-xs font-normal text-muted">
                        {cp.label}
                      </span>
                    </th>
                    <td className="px-3 py-2.5">
                      <span
                        className={`inline-flex border px-1.5 py-0.5 text-[11px] font-medium ${cfg.badgeBg} ${cfg.badgeText} ${cfg.badgeBorder}`}
                      >
                        {cp.risk.overall_risk}
                      </span>
                      {cp.risk.load_escalation_note ? (
                        <span className="mt-1 flex items-start gap-1 text-xs leading-5 text-[#8E1B14]">
                          <Warning size={14} weight="fill" className="mt-0.5 shrink-0" />
                          {cp.risk.load_escalation_note}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2.5 text-xs">
                      {formatEtaTimestamp(cp.eta_iso)}
                      <span className="mt-0.5 block font-mono text-muted">
                        +{cp.elapsed_hours.toFixed(1)} h
                      </span>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs">{cp.weather.wind_mph.toFixed(0)} mph</td>
                    <td className="px-3 py-2.5 font-mono text-xs">{cp.weather.rain_in_hr.toFixed(2)} in/h</td>
                    <td className="px-3 py-2.5 font-mono text-xs">{cp.weather.snow_in_hr.toFixed(2)} in/h</td>
                    <td className="px-3 py-2.5 font-mono text-xs">{cp.weather.temperature_f.toFixed(0)} F</td>
                    <td className="px-3 py-2.5 text-xs">{cp.risk.road_condition.surface_state}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
});
