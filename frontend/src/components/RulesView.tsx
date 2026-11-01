import type { RulesResponse } from '../types/routing';

interface RulesViewProps {
  rulesData: RulesResponse | null;
  status: 'loading' | 'ready' | 'unavailable';
}

export function RulesView({ rulesData, status }: RulesViewProps) {
  if (status === 'loading') {
    return (
      <div className="view-enter animate-pulse space-y-3" aria-label="Loading risk rules">
        <div className="h-40 border border-line bg-white" />
        <div className="h-28 border border-line bg-white" />
      </div>
    );
  }

  if (status === 'unavailable' || !rulesData) {
    return (
      <div className="view-enter border border-line bg-white px-4 py-8">
        <p className="text-sm font-medium">Rules are unavailable</p>
        <p className="mt-1 max-w-lg text-sm text-muted">
          The rules service did not respond. Route planning still accepts an origin, destination, truck, and weight.
        </p>
      </div>
    );
  }

  return (
    <div className="view-enter space-y-4">
      <section className="border border-line bg-white" aria-labelledby="thresholds">
        <div className="border-b border-line px-4 py-3">
          <h2 id="thresholds" className="text-sm font-semibold">
            Weather classification
          </h2>
          <p className="mt-1 text-xs text-muted">
            A checkpoint takes the most severe condition across wind, rain, and snow, then applies load rules.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs text-muted">
                <th scope="col" className="px-4 py-2 font-medium">Condition</th>
                <th scope="col" className="px-3 py-2 font-medium text-[#0E5132]">Low</th>
                <th scope="col" className="px-3 py-2 font-medium text-[#7A4D05]">Moderate</th>
                <th scope="col" className="px-3 py-2 font-medium text-[#9A3412]">High</th>
                <th scope="col" className="px-3 py-2 font-medium text-[#8E1B14]">Severe</th>
                <th scope="col" className="px-3 py-2 font-medium text-[#9F1239]">No travel</th>
              </tr>
            </thead>
            <tbody>
              {rulesData.rules.thresholds.map((row) => (
                <tr key={row.condition} className="border-b border-line last:border-b-0">
                  <th scope="row" className="px-4 py-2.5 text-left text-sm font-medium">
                    {row.condition}
                  </th>
                  <td className="px-3 py-2.5 font-mono text-xs">{row.low}</td>
                  <td className="px-3 py-2.5 font-mono text-xs">{row.moderate}</td>
                  <td className="px-3 py-2.5 font-mono text-xs">{row.high}</td>
                  <td className="px-3 py-2.5 font-mono text-xs">{row.severe}</td>
                  <td className="px-3 py-2.5 font-mono text-xs">{row.no_travel}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="border border-line bg-white" aria-labelledby="load-rules">
          <div className="border-b border-line px-4 py-3">
            <h2 id="load-rules" className="text-sm font-semibold">
              Weight and crosswind
            </h2>
          </div>
          <ul className="space-y-2 px-4 py-4 text-sm leading-6">
            {rulesData.rules.load_rules.map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ul>
        </section>
        <section className="border border-line bg-white" aria-labelledby="rank-rules">
          <div className="border-b border-line px-4 py-3">
            <h2 id="rank-rules" className="text-sm font-semibold">
              How a route is recommended
            </h2>
          </div>
          <ol className="list-decimal space-y-2 px-8 py-4 text-sm leading-6">
            {rulesData.rules.recommendation_priority.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
}
