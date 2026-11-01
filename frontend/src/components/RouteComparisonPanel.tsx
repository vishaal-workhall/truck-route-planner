import { memo } from 'react';
import {
  CheckCircle,
  Clock,
  CloudRain,
  Info,
  Path,
  Scales,
  Truck,
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
import { ROLE_LABEL, routeChips, routeStroke } from '../utils/routeRoles';

interface RouteSelectionProps {
  routes: RouteOption[];
  selectedRouteId: string;
  onSelectRoute: (routeId: string) => void;
}

function hosSummary(route: RouteOption): string {
  const stops = route.hos_stops ?? [];
  if (!stops.length || route.driving_minutes == null) return '';
  const breaks = stops.filter((stop) => stop.kind === '30-min break').length;
  const rests = stops.length - breaks;
  const parts = [
    breaks ? `${breaks} × 30-min break` : '',
    rests ? `${rests} × 10-hr rest` : '',
  ].filter(Boolean);
  return ` Includes ${parts.join(' and ')} under FMCSA Hours of Service (${formatDuration(route.driving_minutes)} driving).`;
}

const CHIP_CLASS = {
  safest: 'border-[#D8CCF5] bg-[#F1ECFC] text-[#4C1D95]',
  fastest: 'border-[#C5D4E6] bg-[#E7EEF6] text-[#1E3A5F]',
  balanced: 'border-line bg-canvas text-ink',
} as const;

export const RouteStrip = memo(function RouteStrip({
  routes,
  selectedRouteId,
  onSelectRoute,
}: RouteSelectionProps) {
  return (
    <div className="grid grid-cols-1 border-t border-line lg:grid-cols-3">
      {routes.map((route) => {
        const selected = route.id === selectedRouteId;
        const chips = routeChips(route, routes);
        const risk =
          RISK_COLOR_MAP[route.safety.overall_risk_level] || RISK_COLOR_MAP.Low;
        const miles = route.safety.risk_miles;
        const parts = [
          { key: 'low', value: miles.low_miles, color: RISK_COLOR_MAP.Low.hex },
          { key: 'mod', value: miles.moderate_miles, color: RISK_COLOR_MAP.Moderate.hex },
          { key: 'high', value: miles.high_miles, color: RISK_COLOR_MAP.High.hex },
          { key: 'severe', value: miles.severe_miles, color: RISK_COLOR_MAP.Severe.hex },
          { key: 'hold', value: miles.no_travel_miles, color: RISK_COLOR_MAP['No Travel'].hex },
        ].filter((part) => part.value > 0);
        const partTotal = parts.reduce((sum, part) => sum + part.value, 0) || 1;

        return (
          <button
            key={route.id}
            type="button"
            aria-pressed={selected}
            onClick={() => onSelectRoute(route.id)}
            className={`relative cursor-pointer border-b border-line px-4 py-3 text-left transition-colors duration-150 last:border-b-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ink lg:border-r lg:border-b-0 lg:last:border-r-0 ${
              selected ? 'bg-[#f4f7f6]' : 'bg-white hover:bg-faint'
            }`}
          >
            <span
              className="absolute inset-y-0 left-0 w-[3px]"
              style={{ backgroundColor: routeStroke(route, routes) }}
              aria-hidden
            />
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-wrap items-center gap-1.5">
                {chips.map((chip) => (
                  <span
                    key={chip}
                    className={`border px-1.5 py-0.5 text-[11px] font-medium ${CHIP_CLASS[chip]}`}
                  >
                    {ROLE_LABEL[chip]}
                  </span>
                ))}
                <span
                  className={`border px-1.5 py-0.5 text-[11px] font-medium ${risk.badgeBg} ${risk.badgeText} ${risk.badgeBorder}`}
                >
                  {route.safety.overall_risk_level}
                </span>
                {selected ? (
                  <span className="text-[11px] font-medium text-ink">Selected</span>
                ) : null}
              </div>
              <p className="font-mono text-2xl font-medium leading-none">
                {route.safety.overall_safety_score}
                <span className="text-xs font-normal text-muted">/100</span>
              </p>
            </div>
            <h3 className="mt-2 text-sm font-semibold leading-5">{route.name}</h3>
            <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted">
              {route.safety.comparison.tradeoff_headline}
            </p>
            <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
              <div>
                <dt className="text-muted">Time</dt>
                <dd className="font-mono font-medium">
                  {formatDuration(route.duration_minutes)}
                </dd>
              </div>
              <div>
                <dt className="text-muted">Distance</dt>
                <dd className="font-mono font-medium">{route.distance_miles.toFixed(0)} mi</dd>
              </div>
              <div>
                <dt className="text-muted">Severe + No-Travel</dt>
                <dd
                  className={`font-mono font-medium ${
                    route.safety.risk_miles.severe_plus_no_travel_miles > 0
                      ? 'text-[#8E1B14]'
                      : 'text-[#0E5132]'
                  }`}
                >
                  {route.safety.risk_miles.severe_plus_no_travel_miles.toFixed(0)} mi
                </dd>
              </div>
            </dl>
            <div className="mt-3 flex h-1.5 w-full" aria-hidden>
              {parts.map((part) => (
                <span
                  key={part.key}
                  style={{
                    width: `${(part.value / partTotal) * 100}%`,
                    backgroundColor: part.color,
                  }}
                />
              ))}
            </div>
          </button>
        );
      })}
    </div>
  );
});

export const RouteInsight = memo(function RouteInsight({
  routes,
  selectedRouteId,
  onSelectRoute,
}: RouteSelectionProps) {
  const selected = routes.find((route) => route.id === selectedRouteId) || routes[0];
  const recommended = routes.find((route) => route.is_recommended);
  if (!selected) return null;

  const score = getScoreColorClasses(selected.safety.overall_safety_score);
  const safety = selected.safety;
  const explainingRecommendation = selected.is_recommended;
  const insights = [
    {
      icon: Wind,
      title: 'Weather exposure',
      figure: `${safety.component_scores.weather_score}/100`,
      detail: `Peak wind ${safety.peak_conditions.max_wind_mph.toFixed(0)} mph, rain ${safety.peak_conditions.max_rain_in_hr.toFixed(2)} in/h, snow ${safety.peak_conditions.max_snow_in_hr.toFixed(2)} in/h.`,
    },
    {
      icon: Path,
      title: 'Road suitability',
      figure: `${safety.component_scores.road_condition_score}/100`,
      detail: `${safety.road_condition_summary.predominant_hazard}. ${safety.road_condition_summary.affected_miles} mi of traction exposure.`,
    },
    {
      icon: Scales,
      title: 'Vehicle weight restrictions',
      figure: `${safety.load_analysis.escalation_miles} mi`,
      detail: `${safety.load_analysis.suitability_status}. ${safety.load_analysis.escalation_checkpoints_count} checkpoints escalated for this weight.`,
    },
    {
      icon: Truck,
      title: 'Cargo considerations',
      figure: safety.load_analysis.truck_type_label,
      detail: safety.load_analysis.profile_note,
    },
    {
      icon: Clock,
      title: 'Travel-time trade-offs',
      figure: formatDuration(selected.duration_minutes),
      detail: `${
        safety.comparison.is_fastest
          ? `Fastest option in this set, ${selected.distance_miles.toFixed(0)} miles.`
          : `${safety.comparison.vs_fastest_minutes} min longer than the fastest option, across ${selected.distance_miles.toFixed(0)} miles.`
      }${hosSummary(selected)}`,
    },
  ];

  return (
    <section className="border border-line bg-white" aria-labelledby="why-route">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line px-4 py-4">
        <div className="max-w-3xl">
          <h2 id="why-route" className="text-base font-semibold">
            {explainingRecommendation ? 'Why we recommend this route' : 'Why this route'}
          </h2>
          {!explainingRecommendation && recommended ? (
            <p className="mt-1 text-xs text-muted">
              Recommended route: {recommended.name}.{' '}
              <button
                type="button"
                onClick={() => onSelectRoute(recommended.id)}
                className="cursor-pointer font-medium text-ink underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
              >
                Show it
              </button>
            </p>
          ) : null}
          <p className="mt-2 text-sm leading-6">{safety.why_this_route}</p>
        </div>
        <div className={`border px-3 py-2 ${score.bg} ${score.ring}`}>
          <p className="text-xs text-muted">Safety score</p>
          <p className={`font-mono text-3xl font-medium leading-none ${score.text}`}>
            {safety.overall_safety_score}
          </p>
          <p className={`mt-1 text-xs font-medium ${score.text}`}>{score.label}</p>
        </div>
      </div>

      {recommended && recommended.safety.risk_miles.no_travel_miles > 0 ? (
        <div
          role="alert"
          className="flex items-start gap-2 border-b border-[#E7B3C4] bg-[#FBE7EE] px-4 py-3 text-sm leading-6 text-[#9F1239]"
        >
          <WarningOctagon size={18} weight="fill" className="mt-0.5 shrink-0" />
          <span>
            <strong className="font-semibold">Hold the load.</strong> Every route crosses No-Travel
            conditions at the truck&apos;s arrival time. The recommendation is the least exposed option,
            not a safe one. Try a later departure.
          </span>
        </div>
      ) : null}

      <ul>
        {insights.map((insight) => {
          const Icon = insight.icon;
          return (
            <li
              key={insight.title}
              className="grid grid-cols-1 gap-1 border-b border-line px-4 py-3 sm:grid-cols-[220px_minmax(0,1fr)_auto] sm:items-center sm:gap-4"
            >
              <p className="flex items-center gap-2 text-sm font-medium">
                <Icon size={16} className="text-muted" />
                {insight.title}
              </p>
              <p className="text-sm leading-6 text-muted">{insight.detail}</p>
              <p className="font-mono text-sm font-medium sm:text-right">{insight.figure}</p>
            </li>
          );
        })}
      </ul>

      <div className="border-b border-line px-4 py-3">
        <h3 className="text-sm font-semibold">Factors behind the score</h3>
      </div>
      <ul>
        {safety.key_reasons.map((reason, index) => {
          const icon =
            reason.type === 'positive' ? (
              <CheckCircle size={16} weight="fill" className="mt-0.5 shrink-0 text-[#146C43]" />
            ) : reason.type === 'critical' ? (
              <WarningOctagon size={16} weight="fill" className="mt-0.5 shrink-0 text-[#9F1239]" />
            ) : reason.type === 'warning' ? (
              <Warning size={16} weight="fill" className="mt-0.5 shrink-0 text-[#A16207]" />
            ) : (
              <Info size={16} className="mt-0.5 shrink-0 text-[#1E3A5F]" />
            );
          return (
            <li
              key={`${reason.type}-${index}`}
              className="flex items-start gap-2 border-b border-line px-4 py-3 text-sm leading-6 last:border-b-0"
            >
              {icon}
              <span>{reason.text}</span>
            </li>
          );
        })}
      </ul>

      <div className="border-t border-line px-4 py-3">
        <h3 className="text-sm font-semibold">Compare the set</h3>
        <p className="mt-1 text-xs text-muted">
          Ordered by fewest no-travel and severe miles, then high-risk miles, then average risk (within
          0.1 counts as equal), then travel time.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[880px] text-left text-xs">
          <caption className="sr-only">Safety and travel time for each route</caption>
          <thead>
            <tr className="border-y border-line text-muted">
              <th scope="col" className="px-4 py-2 font-medium">Route</th>
              <th scope="col" className="px-3 py-2 font-medium">Score</th>
              <th scope="col" className="px-3 py-2 font-medium">No travel</th>
              <th scope="col" className="px-3 py-2 font-medium">Severe</th>
              <th scope="col" className="px-3 py-2 font-medium">High</th>
              <th scope="col" className="px-3 py-2 font-medium">Avg risk</th>
              <th scope="col" className="px-3 py-2 font-medium">Peak weather</th>
              <th scope="col" className="px-3 py-2 font-medium">Time</th>
              <th scope="col" className="px-3 py-2 font-medium">Load</th>
            </tr>
          </thead>
          <tbody>
            {routes.map((route) => {
              const active = route.id === selectedRouteId;
              const tone = getScoreColorClasses(route.safety.overall_safety_score);
              return (
                <tr
                  key={route.id}
                  tabIndex={0}
                  aria-current={active ? 'true' : undefined}
                  onClick={() => onSelectRoute(route.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      onSelectRoute(route.id);
                    }
                  }}
                  className={`cursor-pointer border-b border-line last:border-b-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ink ${
                    active ? 'bg-[#f4f7f6]' : 'hover:bg-faint'
                  }`}
                >
                  <th scope="row" className="px-4 py-2.5 text-left font-medium">
                    {route.name}
                    {active ? <span className="ml-2 font-normal text-muted">Selected</span> : null}
                  </th>
                  <td className={`whitespace-nowrap px-3 py-2.5 font-mono font-medium ${tone.text}`}>
                    {route.safety.overall_safety_score}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 font-mono">
                    {route.safety.risk_miles.no_travel_miles} mi
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 font-mono">{route.safety.risk_miles.severe_miles} mi</td>
                  <td className="whitespace-nowrap px-3 py-2.5 font-mono">{route.safety.risk_miles.high_miles} mi</td>
                  <td className="whitespace-nowrap px-3 py-2.5 font-mono">
                    {route.safety.average_risk_score.toFixed(2)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 font-mono">
                    <span className="mr-2 inline-flex items-center gap-1">
                      <Wind size={12} />
                      {route.safety.peak_conditions.max_wind_mph.toFixed(0)} mph
                    </span>
                    <span className="mr-2 inline-flex items-center gap-1">
                      <CloudRain size={12} />
                      {route.safety.peak_conditions.max_rain_in_hr.toFixed(2)} in/h
                    </span>
                    <span className="inline-flex items-center gap-1">
                      {route.safety.peak_conditions.max_snow_in_hr.toFixed(2)} in/h snow
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 font-mono">
                    {formatDuration(route.duration_minutes)}
                    <span className="mt-0.5 block text-muted">
                      {route.distance_miles.toFixed(0)} mi
                      {route.safety.comparison.is_fastest
                        ? ', fastest'
                        : `, +${route.safety.comparison.vs_fastest_minutes} min`}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">{route.safety.load_analysis.suitability_status}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
});
