import { ClockCounterClockwise, Scales, ShieldCheck, X } from '@phosphor-icons/react';
import type { RoutePlanHistoryItem, RulesResponse } from '../types/routing';
import { formatEtaTimestamp, RISK_COLOR_MAP } from '../utils/riskColors';

interface RulesModalProps {
  isOpen: boolean;
  onClose: () => void;
  rulesData: RulesResponse | null;
  history: RoutePlanHistoryItem[];
  onLoadHistoryItem: (planId: string) => void;
}

export function RulesModal({
  isOpen,
  onClose,
  rulesData,
  history,
  onLoadHistoryItem,
}: RulesModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4">
      <div className="relative w-full max-w-4xl max-h-[88vh] overflow-y-auto rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-4 mb-5">
          <div className="flex items-center gap-2.5">
            <ShieldCheck size={22} className="text-emerald-400" weight="duotone" />
            <h2 className="text-lg font-bold text-zinc-100">
              Deterministic Weather Risk Rules &amp; Recent Dispatch History
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-zinc-800 p-1.5 text-zinc-300 hover:bg-zinc-700 hover:text-white cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Weather Thresholds Matrix */}
        <div className="space-y-5">
          <div>
            <h3 className="text-sm font-bold text-zinc-200 mb-2">
              1. Checkpoint Weather Classification Thresholds
            </h3>
            <div className="overflow-x-auto rounded-xl border border-zinc-800">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-zinc-950 text-zinc-300 border-b border-zinc-800">
                    <th className="py-2.5 px-3">Condition</th>
                    <th className="py-2.5 px-3 text-emerald-400">Low</th>
                    <th className="py-2.5 px-3 text-yellow-300">Moderate</th>
                    <th className="py-2.5 px-3 text-orange-400">High</th>
                    <th className="py-2.5 px-3 text-red-400">Severe</th>
                    <th className="py-2.5 px-3 text-pink-400">No Travel</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/80 font-mono">
                  {(rulesData?.rules.thresholds || []).map((row) => (
                    <tr key={row.condition} className="bg-zinc-900/50">
                      <td className="py-2.5 px-3 font-sans font-semibold text-zinc-200">
                        {row.condition}
                      </td>
                      <td className="py-2.5 px-3 text-zinc-300">{row.low}</td>
                      <td className="py-2.5 px-3 text-zinc-300">
                        {row.moderate}
                      </td>
                      <td className="py-2.5 px-3 text-zinc-300">{row.high}</td>
                      <td className="py-2.5 px-3 text-zinc-300">{row.severe}</td>
                      <td className="py-2.5 px-3 text-zinc-300">
                        {row.no_travel}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5 mb-2">
                <Scales size={15} />
                Load Weight &amp; Crosswind Rules
              </h4>
              <ul className="space-y-1.5 text-xs text-zinc-300 font-mono">
                {(rulesData?.rules.load_rules || []).map((rule) => (
                  <li key={rule} className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                    {rule}
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-400 mb-2">
                Route Recommendation Ranking Priority
              </h4>
              <ul className="space-y-1.5 text-xs text-zinc-300">
                {(rulesData?.rules.recommendation_priority || []).map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
          </div>

          {/* Saved Dispatch History */}
          <div>
            <h3 className="text-sm font-bold text-zinc-200 flex items-center gap-2 mb-2.5">
              <ClockCounterClockwise size={17} className="text-emerald-400" />
              Recent Route Evaluations (Database Log)
            </h3>
            {history.length === 0 ? (
              <p className="text-xs text-zinc-400">
                No saved route plans yet. Run a route calculation to log it.
              </p>
            ) : (
              <div className="space-y-2">
                {history.map((item) => {
                  const cfg =
                    RISK_COLOR_MAP[item.recommended_risk_level] ||
                    RISK_COLOR_MAP.Low;
                  return (
                    <div
                      key={item.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-950/70 px-3.5 py-2.5 text-xs"
                    >
                      <div>
                        <span className="font-semibold text-zinc-100">
                          {item.origin_resolved_name} -&gt;{' '}
                          {item.destination_resolved_name}
                        </span>
                        <span className="ml-2 font-mono text-zinc-400">
                          ({item.load_weight_lbs.toLocaleString()} lbs |{' '}
                          {item.sampling_interval_miles} mi sampling)
                        </span>
                        <div className="text-[11px] text-zinc-400 mt-0.5">
                          Recommended: {item.recommended_route_name} | Departure:{' '}
                          {formatEtaTimestamp(item.departure_time)}
                        </div>
                      </div>
                      <div className="flex items-center gap-2.5">
                        <span
                          className={`rounded-full px-2.5 py-0.5 font-mono font-bold border ${cfg.badgeBg} ${cfg.badgeText} ${cfg.badgeBorder}`}
                        >
                          Score {item.recommended_safety_score}/100 (
                          {item.recommended_risk_level})
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            onLoadHistoryItem(item.id);
                            onClose();
                          }}
                          className="rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 px-2.5 py-1 font-medium cursor-pointer"
                        >
                          Load Plan
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
