import {
  CheckCircle,
  Clock,
  CloudRain,
  CloudSnow,
  Gauge,
  Info,
  Path,
  Scales,
  ShieldCheck,
  Trophy,
  Warning,
  WarningOctagon,
  Wind,
} from '@phosphor-icons/react';
import type { RouteOption } from '../types/routing';
import {
  formatDuration,
  getScoreColorClasses,
  RISK_COLOR_MAP,
} from '../utils/riskColors';

interface RouteComparisonPanelProps {
  routes: RouteOption[];
  selectedRouteId: string;
  onSelectRoute: (routeId: string) => void;
}

export function RouteComparisonPanel({
  routes,
  selectedRouteId,
  onSelectRoute,
}: RouteComparisonPanelProps) {
  const selectedRoute =
    routes.find((r) => r.id === selectedRouteId) || routes[0];

  if (!selectedRoute) return null;

  const scoreColors = getScoreColorClasses(
    selectedRoute.safety.overall_safety_score
  );
  const riskColors =
    RISK_COLOR_MAP[selectedRoute.safety.overall_risk_level] ||
    RISK_COLOR_MAP.Low;

  return (
    <div className="space-y-5">
      {/* 3 Route Selector Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {routes.map((route) => {
          const isSelected = route.id === selectedRouteId;
          const sColor = getScoreColorClasses(
            route.safety.overall_safety_score
          );
          const rBadge =
            RISK_COLOR_MAP[route.safety.overall_risk_level] ||
            RISK_COLOR_MAP.Low;

          return (
            <button
              key={route.id}
              type="button"
              onClick={() => onSelectRoute(route.id)}
              className={`text-left rounded-2xl p-4 transition border cursor-pointer flex flex-col justify-between ${
                isSelected
                  ? 'bg-zinc-900 border-emerald-500/70 shadow-lg ring-1 ring-emerald-500/30'
                  : 'bg-zinc-900/55 border-zinc-800/90 hover:border-zinc-700 hover:bg-zinc-900/80'
              }`}
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-2.5">
                  <div className="flex items-center gap-2">
                    {route.is_recommended ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-xs font-bold text-emerald-300 border border-emerald-500/40">
                        <Trophy size={13} weight="fill" />
                        Recommended
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-zinc-800 px-2.5 py-0.5 text-xs font-medium text-zinc-300 border border-zinc-700">
                        Rank #{route.rank} Option
                      </span>
                    )}
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold border ${rBadge.badgeBg} ${rBadge.badgeText} ${rBadge.badgeBorder}`}
                    >
                      {route.safety.overall_risk_level} Risk
                    </span>
                  </div>

                  <div
                    className={`flex items-baseline gap-0.5 rounded-xl px-2.5 py-1 border ${sColor.bg} ${sColor.ring}`}
                  >
                    <span className={`font-mono text-lg font-bold ${sColor.text}`}>
                      {route.safety.overall_safety_score}
                    </span>
                    <span className="text-[11px] font-mono text-zinc-400">
                      /100
                    </span>
                  </div>
                </div>

                <h3 className="text-base font-bold text-zinc-100 leading-snug">
                  {route.name}
                </h3>
                <p className="text-xs text-zinc-400 mt-1">
                  {route.safety.comparison.tradeoff_headline}
                </p>
              </div>

              <div className="mt-4 pt-3 border-t border-zinc-800/80 grid grid-cols-3 gap-2 text-xs">
                <div>
                  <span className="text-zinc-400 block">Travel Time</span>
                  <span className="font-mono font-semibold text-zinc-100">
                    {formatDuration(route.duration_minutes)}
                  </span>
                </div>
                <div>
                  <span className="text-zinc-400 block">Distance</span>
                  <span className="font-mono font-semibold text-zinc-100">
                    {route.distance_miles.toFixed(0)} mi
                  </span>
                </div>
                <div>
                  <span className="text-zinc-400 block">Severe/No-Trvl</span>
                  <span
                    className={`font-mono font-semibold ${
                      route.safety.risk_miles.severe_plus_no_travel_miles > 0
                        ? 'text-red-400'
                        : 'text-emerald-400'
                    }`}
                  >
                    {route.safety.risk_miles.severe_plus_no_travel_miles.toFixed(
                      0
                    )}{' '}
                    mi
                  </span>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Explainable Route Safety Score & "Why this route?" Deep-Dive */}
      <div className="rounded-2xl border border-zinc-800/90 bg-zinc-900/75 p-5 shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 border-b border-zinc-800/80">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <ShieldCheck
                size={22}
                weight="duotone"
                className="text-emerald-400"
              />
              <h2 className="text-lg font-bold text-zinc-100">
                Explainable Route Safety Score: {selectedRoute.name}
              </h2>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-0.5 text-xs font-semibold border ${riskColors.badgeBg} ${riskColors.badgeText} ${riskColors.badgeBorder}`}
              >
                <span className={`h-2 w-2 rounded-full ${riskColors.dotClass}`} />
                {selectedRoute.safety.overall_risk_level} Corridor Risk
              </span>
            </div>
            <p className="text-xs text-zinc-400">
              Deterministic backend scoring combining ETA checkpoint meteorology
              (45%), load-weight wind rules (25%), road surface traction (20%),
              and schedule efficiency (10%).
            </p>
          </div>

          <div
            className={`flex items-center gap-3 rounded-2xl px-4 py-2.5 border ${scoreColors.bg} ${scoreColors.ring}`}
          >
            <div>
              <div className="text-[11px] uppercase tracking-wider font-semibold text-zinc-400">
                Safety Score
              </div>
              <div className={`text-xs font-semibold ${scoreColors.text}`}>
                {scoreColors.label}
              </div>
            </div>
            <div className={`font-mono text-3xl font-extrabold ${scoreColors.text}`}>
              {selectedRoute.safety.overall_safety_score}
              <span className="text-sm font-normal text-zinc-400">/100</span>
            </div>
          </div>
        </div>

        {/* 4 Component Sub-Scores */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3.5 my-5">
          <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-3.5">
            <div className="flex items-center justify-between text-xs text-zinc-400 mb-1">
              <span className="inline-flex items-center gap-1.5 font-medium text-zinc-300">
                <Wind size={15} className="text-sky-400" />
                Weather Risk (45%)
              </span>
              <span className="font-mono font-bold text-zinc-100 text-sm">
                {selectedRoute.safety.component_scores.weather_score}/100
              </span>
            </div>
            <p className="text-xs text-zinc-400 mt-1">
              Peak Wind:{' '}
              <strong className="text-zinc-200 font-mono">
                {selectedRoute.safety.peak_conditions.max_wind_mph} mph
              </strong>{' '}
              | Rain:{' '}
              <strong className="text-zinc-200 font-mono">
                {selectedRoute.safety.peak_conditions.max_rain_in_hr} in/h
              </strong>{' '}
              | Snow:{' '}
              <strong className="text-zinc-200 font-mono">
                {selectedRoute.safety.peak_conditions.max_snow_in_hr} in/h
              </strong>
            </p>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-3.5">
            <div className="flex items-center justify-between text-xs text-zinc-400 mb-1">
              <span className="inline-flex items-center gap-1.5 font-medium text-zinc-300">
                <Scales size={15} className="text-amber-400" />
                Load Suitability (25%)
              </span>
              <span className="font-mono font-bold text-zinc-100 text-sm">
                {selectedRoute.safety.component_scores.load_suitability_score}/100
              </span>
            </div>
            <p className="text-xs text-zinc-300 font-medium mt-1">
              {selectedRoute.safety.load_analysis.suitability_status}
            </p>
            <p className="text-[11px] text-zinc-400 mt-0.5">
              {selectedRoute.safety.load_analysis.escalation_checkpoints_count}{' '}
              checkpoint(s) triggered wind+load escalation (
              {selectedRoute.safety.load_analysis.escalation_miles} mi).
            </p>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-3.5">
            <div className="flex items-center justify-between text-xs text-zinc-400 mb-1">
              <span className="inline-flex items-center gap-1.5 font-medium text-zinc-300">
                <Path size={15} className="text-emerald-400" />
                Road Conditions (20%)
              </span>
              <span className="font-mono font-bold text-zinc-100 text-sm">
                {selectedRoute.safety.component_scores.road_condition_score}/100
              </span>
            </div>
            <p className="text-xs text-zinc-200 font-medium mt-1">
              {selectedRoute.safety.road_condition_summary.predominant_hazard}
            </p>
            <p className="text-[11px] text-zinc-400 mt-0.5">
              Weighted traction hazard exposure:{' '}
              <span className="font-mono text-zinc-300">
                {selectedRoute.safety.road_condition_summary.affected_miles} mi
              </span>
            </p>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-3.5">
            <div className="flex items-center justify-between text-xs text-zinc-400 mb-1">
              <span className="inline-flex items-center gap-1.5 font-medium text-zinc-300">
                <Clock size={15} className="text-purple-400" />
                Schedule Efficiency (10%)
              </span>
              <span className="font-mono font-bold text-zinc-100 text-sm">
                {selectedRoute.safety.component_scores.efficiency_score}/100
              </span>
            </div>
            <p className="text-xs text-zinc-200 font-medium mt-1">
              Est. Duration: {formatDuration(selectedRoute.duration_minutes)} (
              {selectedRoute.distance_miles.toFixed(0)} mi)
            </p>
            <p className="text-[11px] text-zinc-400 mt-0.5">
              {selectedRoute.safety.comparison.is_fastest
                ? 'Fastest available corridor'
                : `+${selectedRoute.safety.comparison.vs_fastest_minutes} min vs fastest option`}
            </p>
          </div>
        </div>

        {/* Dedicated "Why this route?" Section + Key Reasons */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-6 rounded-xl border border-emerald-500/30 bg-emerald-950/15 p-4">
            <div className="flex items-center gap-2 text-sm font-bold text-emerald-300 mb-2">
              <Info size={18} weight="fill" />
              Why this route?
            </div>
            <p className="text-sm text-zinc-200 leading-relaxed">
              {selectedRoute.safety.why_this_route}
            </p>
            <div className="mt-3 pt-3 border-t border-emerald-500/20 flex flex-wrap gap-3 text-xs text-zinc-300">
              <span>
                Avg Risk Score:{' '}
                <strong className="font-mono text-zinc-100">
                  {selectedRoute.safety.average_risk_score}/5.0
                </strong>
              </span>
              <span>
                No-Travel Miles:{' '}
                <strong className="font-mono text-zinc-100">
                  {selectedRoute.safety.risk_miles.no_travel_miles} mi
                </strong>
              </span>
              <span>
                Severe Miles:{' '}
                <strong className="font-mono text-zinc-100">
                  {selectedRoute.safety.risk_miles.severe_miles} mi
                </strong>
              </span>
              <span>
                High Miles:{' '}
                <strong className="font-mono text-zinc-100">
                  {selectedRoute.safety.risk_miles.high_miles} mi
                </strong>
              </span>
            </div>
          </div>

          <div className="lg:col-span-6 rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
            <div className="text-sm font-bold text-zinc-200 mb-2.5">
              Key Recommendation Factors
            </div>
            <ul className="space-y-2">
              {selectedRoute.safety.key_reasons.map((reason, idx) => {
                const icon =
                  reason.type === 'positive' ? (
                    <CheckCircle
                      size={16}
                      weight="fill"
                      className="text-emerald-400 shrink-0 mt-0.5"
                    />
                  ) : reason.type === 'critical' ? (
                    <WarningOctagon
                      size={16}
                      weight="fill"
                      className="text-red-400 shrink-0 mt-0.5"
                    />
                  ) : reason.type === 'warning' ? (
                    <Warning
                      size={16}
                      weight="fill"
                      className="text-amber-400 shrink-0 mt-0.5"
                    />
                  ) : (
                    <Info
                      size={16}
                      weight="fill"
                      className="text-sky-400 shrink-0 mt-0.5"
                    />
                  );
                return (
                  <li
                    key={idx}
                    className="flex items-start gap-2 text-xs text-zinc-200 leading-relaxed"
                  >
                    {icon}
                    <span>{reason.text}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>

        {/* Side-by-Side Alternative Routes Trade-Off Matrix */}
        <div className="mt-5 pt-4 border-t border-zinc-800/80">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-zinc-200 flex items-center gap-2">
              <Gauge size={17} className="text-emerald-400" />
              Alternative Routes Safety vs. Travel Time Trade-Off Comparison
            </h3>
            <span className="text-xs text-zinc-400">
              Ranked by: 1) Fewest Severe/No-Travel mi, 2) Fewest High mi, 3)
              Lowest Avg Risk, 4) Shortest Time
            </span>
          </div>

          <div className="overflow-x-auto rounded-xl border border-zinc-800">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-zinc-950/90 text-zinc-400 border-b border-zinc-800">
                  <th className="py-2.5 px-3 font-semibold">Route Corridor</th>
                  <th className="py-2.5 px-3 font-semibold">Safety Score</th>
                  <th className="py-2.5 px-3 font-semibold">No-Travel Mi</th>
                  <th className="py-2.5 px-3 font-semibold">Severe Mi</th>
                  <th className="py-2.5 px-3 font-semibold">High Mi</th>
                  <th className="py-2.5 px-3 font-semibold">Avg Risk</th>
                  <th className="py-2.5 px-3 font-semibold">Peak Weather</th>
                  <th className="py-2.5 px-3 font-semibold">Travel Time</th>
                  <th className="py-2.5 px-3 font-semibold">Load Suitability</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/70">
                {routes.map((r) => {
                  const active = r.id === selectedRouteId;
                  const sCol = getScoreColorClasses(
                    r.safety.overall_safety_score
                  );
                  return (
                    <tr
                      key={r.id}
                      onClick={() => onSelectRoute(r.id)}
                      className={`cursor-pointer transition ${
                        active
                          ? 'bg-emerald-500/10 text-zinc-100'
                          : 'bg-zinc-900/40 text-zinc-300 hover:bg-zinc-800/50'
                      }`}
                    >
                      <td className="py-2.5 px-3 font-semibold">
                        <div className="flex items-center gap-2">
                          <span>{r.name}</span>
                          {r.is_recommended && (
                            <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-bold text-emerald-300 border border-emerald-500/30">
                              #1 Best
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 font-mono font-bold">
                        <span className={sCol.text}>
                          {r.safety.overall_safety_score}/100
                        </span>{' '}
                        <span className="text-[11px] text-zinc-400 font-normal">
                          ({r.safety.overall_risk_level})
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-mono">
                        <span
                          className={
                            r.safety.risk_miles.no_travel_miles > 0
                              ? 'text-pink-400 font-bold'
                              : 'text-zinc-400'
                          }
                        >
                          {r.safety.risk_miles.no_travel_miles} mi
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-mono">
                        <span
                          className={
                            r.safety.risk_miles.severe_miles > 0
                              ? 'text-red-400 font-bold'
                              : 'text-zinc-400'
                          }
                        >
                          {r.safety.risk_miles.severe_miles} mi
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-mono">
                        <span
                          className={
                            r.safety.risk_miles.high_miles > 0
                              ? 'text-orange-300 font-semibold'
                              : 'text-zinc-400'
                          }
                        >
                          {r.safety.risk_miles.high_miles} mi
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-mono">
                        {r.safety.average_risk_score.toFixed(2)}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[11px]">
                        <span className="inline-flex items-center gap-1 mr-2">
                          <Wind size={12} className="text-sky-400" />
                          {r.safety.peak_conditions.max_wind_mph}mph
                        </span>
                        <span className="inline-flex items-center gap-1 mr-2">
                          <CloudRain size={12} className="text-blue-400" />
                          {r.safety.peak_conditions.max_rain_in_hr}"
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <CloudSnow size={12} className="text-indigo-300" />
                          {r.safety.peak_conditions.max_snow_in_hr}"
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-mono">
                        <div>{formatDuration(r.duration_minutes)}</div>
                        <div className="text-[10px] text-zinc-400">
                          {r.distance_miles.toFixed(0)} mi
                          {r.safety.comparison.vs_fastest_minutes > 0
                            ? ` (+${r.safety.comparison.vs_fastest_minutes}m)`
                            : ' (Fastest)'}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-[11px]">
                        {r.safety.load_analysis.suitability_status}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
