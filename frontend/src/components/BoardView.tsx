import { ArrowRight } from '@phosphor-icons/react';
import type {
  PresetScenario,
  RoutePlanHistoryItem,
  RoutePlanResponse,
} from '../types/routing';
import { formatEtaTimestamp, RISK_COLOR_MAP } from '../utils/riskColors';
import { truckLabel } from '../utils/trucks';
import { Button } from './ui/controls';

interface BoardViewProps {
  history: RoutePlanHistoryItem[];
  historyReady: boolean;
  rulesReady: boolean;
  presets: PresetScenario[];
  activePlan: RoutePlanResponse | null;
  onApplyPreset: (preset: PresetScenario) => void;
  onOpenHistory: (planId: string) => void;
  onOpenActive: () => void;
  busy: boolean;
}

export function BoardView({
  history,
  historyReady,
  rulesReady,
  presets,
  activePlan,
  onApplyPreset,
  onOpenHistory,
  onOpenActive,
  busy,
}: BoardViewProps) {
  const scores = history.map((item) => item.recommended_safety_score);
  const mean =
    scores.length > 0
      ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length)
      : null;
  const lowCount = history.filter((item) => item.recommended_risk_level === 'Low').length;
  const latest = history[0];

  const stats = [
    {
      label: 'Plans on file',
      value: historyReady ? String(history.length) : 'n/a',
      note: historyReady ? 'Saved route evaluations' : 'Loading history',
    },
    {
      label: 'Mean recommended score',
      value: mean === null ? 'n/a' : String(mean),
      note: mean === null ? 'Appears after the first plan' : 'Across saved plans',
    },
    {
      label: 'Low-risk recommendations',
      value: historyReady ? String(lowCount) : 'n/a',
      note: 'Plans whose recommended route is Low',
    },
    {
      label: 'Latest departure',
      value: latest ? formatEtaTimestamp(latest.departure_time) : 'n/a',
      note: latest ? latest.recommended_route_name : 'No departure logged',
    },
  ];

  return (
    <div className="view-enter space-y-4">
      <section aria-label="Overview" className="grid grid-cols-2 gap-px border border-line bg-line lg:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="bg-white px-4 py-3">
            <p className="text-xs text-muted">{stat.label}</p>
            <p className="mt-1 font-mono text-xl font-medium text-ink">{stat.value}</p>
            <p className="mt-0.5 text-xs text-muted">{stat.note}</p>
          </div>
        ))}
      </section>

      {activePlan ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border border-line bg-white px-4 py-3">
          <div className="min-w-0">
            <p className="text-xs text-muted">Open comparison</p>
            <p className="truncate text-sm font-medium">
              {activePlan.query.origin.name} to {activePlan.query.destination.name}
            </p>
          </div>
          <Button variant="secondary" onClick={onOpenActive}>
            View routes
            <ArrowRight size={14} />
          </Button>
        </div>
      ) : null}

      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(280px,0.9fr)]">
        <section className="min-w-0 border border-line bg-white" aria-labelledby="recent-plans">
          <div className="border-b border-line px-4 py-3">
            <h2 id="recent-plans" className="text-sm font-semibold">
              Recent plans
            </h2>
          </div>
          {!historyReady ? (
            <div className="animate-pulse" aria-label="Loading recent plans">
              {[0, 1, 2, 3].map((row) => (
                <div key={row} className="h-14 border-b border-line bg-faint last:border-b-0" />
              ))}
            </div>
          ) : history.length === 0 ? (
            <div className="px-4 py-8">
              <p className="text-sm font-medium">No plans yet</p>
              <p className="mt-1 max-w-md text-sm text-muted">
                Use Plan a journey in the header, or run one of the corridors on the right.
                Each evaluation is saved here.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead>
                  <tr className="border-b border-line text-xs text-muted">
                    <th scope="col" className="px-4 py-2 font-medium">Corridor</th>
                    <th scope="col" className="px-3 py-2 font-medium">Load</th>
                    <th scope="col" className="px-3 py-2 font-medium">Recommended</th>
                    <th scope="col" className="px-3 py-2 font-medium">Score</th>
                    <th scope="col" className="px-3 py-2 font-medium">When</th>
                    <th scope="col" className="px-3 py-2 font-medium">
                      <span className="sr-only">Open</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((item) => {
                    const risk =
                      RISK_COLOR_MAP[item.recommended_risk_level] || RISK_COLOR_MAP.Low;
                    return (
                      <tr key={item.id} className="border-b border-line last:border-b-0">
                        <td className="px-4 py-2.5 font-medium">
                          {item.origin_resolved_name} to {item.destination_resolved_name}
                        </td>
                        <td className="px-3 py-2.5 text-xs">
                          <span className="whitespace-nowrap">{truckLabel(item.truck_type)}</span>
                          <span className="mt-0.5 block whitespace-nowrap font-mono text-muted">
                            {item.load_weight_lbs.toLocaleString()} lb
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="block">{item.recommended_route_name}</span>
                          <span
                            className={`mt-1 inline-flex border px-1.5 py-0.5 text-[11px] font-medium ${risk.badgeBg} ${risk.badgeText} ${risk.badgeBorder}`}
                          >
                            {item.recommended_risk_level}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 font-mono">{item.recommended_safety_score}</td>
                        <td className="px-3 py-2.5 text-xs text-muted">
                          {formatEtaTimestamp(item.created_at)}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <button
                            type="button"
                            disabled={busy}
                            aria-label={`Open ${item.origin_resolved_name} to ${item.destination_resolved_name}`}
                            onClick={() => onOpenHistory(item.id)}
                            className="min-h-10 cursor-pointer px-2 text-sm font-medium text-ink underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-50"
                          >
                            Open
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="min-w-0 border border-line bg-white" aria-labelledby="corridors">
          <div className="border-b border-line px-4 py-3">
            <h2 id="corridors" className="text-sm font-semibold">
              Known corridors
            </h2>
            <p className="mt-1 text-xs text-muted">
              Presets from the rules service. Running one fills the planner and scores three routes.
            </p>
          </div>
          {!rulesReady ? (
            <p className="px-4 py-6 text-sm text-muted">Loading corridors.</p>
          ) : presets.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted">
              Corridors are unavailable. You can still enter an origin and destination in Plan.
            </p>
          ) : (
            <ul>
              {presets.map((preset) => (
                <li
                  key={preset.id}
                  className="flex items-start justify-between gap-3 border-b border-line px-4 py-3 last:border-b-0"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{preset.title}</p>
                    <p className="mt-0.5 text-xs text-muted">
                      {preset.origin} to {preset.destination}
                    </p>
                    <p className="mt-1 font-mono text-xs text-muted">
                      {truckLabel(preset.truck_type)} / {preset.load_weight_lbs.toLocaleString()} lb
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onApplyPreset(preset)}
                    className="min-h-10 shrink-0 cursor-pointer border border-line bg-white px-2.5 text-sm font-medium hover:bg-canvas focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-50"
                  >
                    Use corridor
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
