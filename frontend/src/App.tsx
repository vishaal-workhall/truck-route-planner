import { useCallback, useEffect, useState } from 'react';
import {
  ArrowsLeftRight,
  Broadcast,
  CalendarBlank,
  ClockCounterClockwise,
  Flask,
  Lightning,
  MapPin,
  NavigationArrow,
  Scales,
  ShieldCheck,
  Sparkle,
  Truck,
  WarningCircle,
} from '@phosphor-icons/react';
import { CheckpointTimeline } from './components/CheckpointTimeline';
import { CorridorMap } from './components/CorridorMap';
import { RouteComparisonPanel } from './components/RouteComparisonPanel';
import { RulesModal } from './components/RulesModal';
import {
  ApiValidationError,
  fetchRouteHistory,
  fetchRoutePlanById,
  fetchRulesAndPresets,
  planTruckRoutes,
} from './services/api';
import type {
  PresetScenario,
  RouteCheckpoint,
  RoutePlanHistoryItem,
  RoutePlanResponse,
  RulesResponse,
  SamplingInterval,
  TruckType,
  WeatherMode,
} from './types/routing';

function getDefaultDepartureLocal(): string {
  const now = new Date();
  now.setMinutes(0, 0, 0);
  const tzOffsetMs = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - tzOffsetMs).toISOString().slice(0, 16);
}

export function App() {
  const [origin, setOrigin] = useState<string>('Omaha, NE');
  const [destination, setDestination] = useState<string>('Denver, CO');
  const [departureLocal, setDepartureLocal] = useState<string>(
    getDefaultDepartureLocal
  );
  const [loadWeightLbs, setLoadWeightLbs] = useState<number>(42000);
  const [samplingInterval, setSamplingInterval] =
    useState<SamplingInterval>(25);
  const [truckType, setTruckType] = useState<TruckType>('dry_van');
  const [weatherMode, setWeatherMode] = useState<WeatherMode>('simulated');

  const [rulesData, setRulesData] = useState<RulesResponse | null>(null);
  const [history, setHistory] = useState<RoutePlanHistoryItem[]>([]);
  const [planResult, setPlanResult] = useState<RoutePlanResponse | null>(null);
  const [selectedRouteId, setSelectedRouteId] = useState<string>('');
  const [focusedCheckpoint, setFocusedCheckpoint] =
    useState<RouteCheckpoint | null>(null);

  const [forecastHour, setForecastHour] = useState<number>(4);
  const [useSliderTimeForCheckpoints, setUseSliderTimeForCheckpoints] =
    useState<boolean>(false);

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [isRulesModalOpen, setIsRulesModalOpen] = useState<boolean>(false);

  const refreshHistory = useCallback(async () => {
    const items = await fetchRouteHistory().catch(() => []);
    setHistory(items);
  }, []);

  const executeRoutePlan = useCallback(
    async (overrideParams?: {
      origin?: string;
      destination?: string;
      load_weight_lbs?: number;
      sampling_interval_miles?: SamplingInterval;
      truck_type?: TruckType;
      weather_mode?: WeatherMode;
    }) => {
      setIsLoading(true);
      setErrorMsg(null);
      setFieldErrors({});

      const o = (overrideParams?.origin ?? origin).trim();
      const d = (overrideParams?.destination ?? destination).trim();
      const weight = overrideParams?.load_weight_lbs ?? loadWeightLbs;
      const interval =
        overrideParams?.sampling_interval_miles ?? samplingInterval;
      const truck = overrideParams?.truck_type ?? truckType;
      const mode = overrideParams?.weather_mode ?? weatherMode;

      // Client-side validation
      const localErrors: Record<string, string[]> = {};
      if (!o) localErrors.origin = ['Origin city is required.'];
      if (!d) localErrors.destination = ['Destination city is required.'];
      if (o && d && o.toLowerCase() === d.toLowerCase()) {
        localErrors.destination = [
          'Origin and destination must be different locations.',
        ];
      }
      if (!weight || weight < 1000 || weight > 120000) {
        localErrors.load_weight_lbs = [
          'Enter a valid load weight between 1,000 and 120,000 lbs.',
        ];
      }

      if (Object.keys(localErrors).length > 0) {
        setFieldErrors(localErrors);
        setErrorMsg('Please fix the highlighted input fields before planning.');
        setIsLoading(false);
        return;
      }

      try {
        const isoDeparture = departureLocal
          ? new Date(departureLocal).toISOString()
          : new Date().toISOString();

        const result = await planTruckRoutes({
          origin: o,
          destination: d,
          departure_time: isoDeparture,
          load_weight_lbs: weight,
          sampling_interval_miles: interval,
          truck_type: truck,
          weather_mode: mode,
        });

        setPlanResult(result);
        setSelectedRouteId(result.recommended_route_id);
        setFocusedCheckpoint(null);
        refreshHistory();
      } catch (err) {
        if (err instanceof ApiValidationError) {
          setErrorMsg(err.message);
          setFieldErrors(err.details);
        } else if (err instanceof Error) {
          setErrorMsg(err.message);
        } else {
          setErrorMsg('Unexpected error while computing route safety plan.');
        }
      } finally {
        setIsLoading(false);
      }
    },
    [
      origin,
      destination,
      departureLocal,
      loadWeightLbs,
      samplingInterval,
      truckType,
      weatherMode,
      refreshHistory,
    ]
  );

  // Load rules, presets, and run initial scenario on mount
  useEffect(() => {
    fetchRulesAndPresets()
      .then((data) => setRulesData(data))
      .catch(() => null);
    executeRoutePlan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleApplyPreset = (preset: PresetScenario) => {
    setOrigin(preset.origin);
    setDestination(preset.destination);
    setLoadWeightLbs(preset.load_weight_lbs);
    setSamplingInterval(preset.sampling_interval_miles);
    setTruckType(preset.truck_type);
    setWeatherMode(preset.weather_mode);

    executeRoutePlan({
      origin: preset.origin,
      destination: preset.destination,
      load_weight_lbs: preset.load_weight_lbs,
      sampling_interval_miles: preset.sampling_interval_miles,
      truck_type: preset.truck_type,
      weather_mode: preset.weather_mode,
    });
  };

  const handleLoadHistoryItem = async (planId: string) => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const saved = await fetchRoutePlanById(planId);
      setPlanResult(saved);
      setSelectedRouteId(saved.recommended_route_id);
      setOrigin(saved.query.origin.name);
      setDestination(saved.query.destination.name);
      setLoadWeightLbs(saved.query.load_weight_lbs);
      setSamplingInterval(saved.query.sampling_interval_miles);
      setTruckType(saved.query.truck_type);
      setWeatherMode(saved.query.weather_mode_requested);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Failed to load saved plan.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const activeRoute =
    planResult?.routes.find((r) => r.id === selectedRouteId) ||
    planResult?.routes[0];

  return (
    <div className="min-h-[100dvh] bg-zinc-950 text-zinc-100 flex flex-col">
      {/* Top Operational Navigation Bar */}
      <header className="sticky top-0 z-40 h-16 border-b border-zinc-800/90 bg-zinc-950/90 backdrop-blur-md">
        <div className="max-w-[1440px] mx-auto h-full px-4 sm:px-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-400">
              <Truck size={20} weight="duotone" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-base tracking-tight text-zinc-100">
                  HaulGuard
                </span>
                <span className="hidden sm:inline-block rounded-md bg-zinc-800/90 px-2 py-0.5 text-[11px] font-mono text-zinc-300 border border-zinc-700/70">
                  Truck Route Safety Planner
                </span>
              </div>
              <p className="text-[11px] text-zinc-400 hidden md:block">
                Weather-aware freight routing, load-weight crosswind rules &amp;
                explainable safety scoring
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {planResult && (
              <div
                title={planResult.data_sources.transparency_note}
                className={`hidden lg:inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border ${
                  planResult.data_sources.is_simulated_weather
                    ? 'bg-amber-500/10 text-amber-300 border-amber-500/35'
                    : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/35'
                }`}
              >
                {planResult.data_sources.is_simulated_weather ? (
                  <>
                    <Flask size={14} weight="duotone" />
                    <span>
                      Routing:{' '}
                      {planResult.data_sources.routing === 'live_osrm'
                        ? 'Live OSRM'
                        : 'OSRM Hybrid'}{' '}
                      | Weather: Storm Corridor Simulation
                    </span>
                  </>
                ) : (
                  <>
                    <Broadcast size={14} weight="duotone" />
                    <span>Live OSRM Routing + Live Open-Meteo 48h API</span>
                  </>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={() => setIsRulesModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-800 px-3.5 py-2 text-xs font-semibold transition cursor-pointer"
            >
              <ShieldCheck
                size={16}
                className="text-emerald-400"
                weight="duotone"
              />
              <span>Risk Rules &amp; History ({history.length})</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="max-w-[1440px] w-full mx-auto px-4 sm:px-6 py-5 space-y-5 flex-1">
        {/* Preset Dispatch Scenarios Bar */}
        {rulesData?.presets && rulesData.presets.length > 0 && (
          <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/50 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-300 px-2">
                <Sparkle
                  size={14}
                  className="text-emerald-400"
                  weight="fill"
                />
                Quick Freight Corridors:
              </span>
              {rulesData.presets.map((preset) => {
                const isCurrent =
                  origin.toLowerCase() === preset.origin.toLowerCase() &&
                  destination.toLowerCase() ===
                    preset.destination.toLowerCase() &&
                  loadWeightLbs === preset.load_weight_lbs;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handleApplyPreset(preset)}
                    className={`rounded-xl px-3 py-1.5 text-left text-xs transition cursor-pointer border ${
                      isCurrent
                        ? 'bg-emerald-500/15 text-emerald-200 border-emerald-500/50'
                        : 'bg-zinc-950/80 text-zinc-300 border-zinc-800 hover:border-zinc-700 hover:text-white'
                    }`}
                  >
                    <div className="font-semibold">{preset.title}</div>
                    <div className="text-[10px] text-zinc-400">
                      {preset.origin} -&gt; {preset.destination} (
                      {(preset.load_weight_lbs / 1000).toFixed(1)}k lbs)
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Main Grid: Left Dispatch Controls (4 cols) + Right Map (8 cols) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Left Column: Trip & Load Configuration Form */}
          <section className="lg:col-span-4 rounded-2xl border border-zinc-800/90 bg-zinc-900/75 p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3">
              <div>
                <h1 className="text-base font-bold text-zinc-100 flex items-center gap-2">
                  <NavigationArrow
                    size={18}
                    className="text-emerald-400"
                    weight="duotone"
                  />
                  Dispatch Parameters
                </h1>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Configure origin, destination, departure time, and load weight
                </p>
              </div>
            </div>

            {errorMsg && (
              <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-200 flex items-start gap-2">
                <WarningCircle
                  size={16}
                  weight="fill"
                  className="text-red-400 shrink-0 mt-0.5"
                />
                <span>{errorMsg}</span>
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                executeRoutePlan();
              }}
              className="space-y-4"
            >
              <datalist id="freight-hub-suggestions">
                {(rulesData?.hubs || []).map((hub) => (
                  <option key={hub} value={hub} />
                ))}
              </datalist>

              {/* Origin & Destination with Swap */}
              <div className="space-y-3">
                <div>
                  <label
                    htmlFor="origin-input"
                    className="block text-xs font-semibold text-zinc-200 mb-1.5"
                  >
                    Origin City or Coordinates
                  </label>
                  <div className="relative">
                    <MapPin
                      size={16}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-400"
                    />
                    <input
                      id="origin-input"
                      type="text"
                      list="freight-hub-suggestions"
                      value={origin}
                      onChange={(e) => setOrigin(e.target.value)}
                      placeholder="e.g., Omaha, NE or Chicago, IL"
                      className="w-full rounded-xl border border-zinc-700/90 bg-zinc-950 pl-9 pr-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-emerald-500 focus:outline-hidden"
                    />
                  </div>
                  {fieldErrors.origin && (
                    <p className="text-xs text-red-400 mt-1">
                      {fieldErrors.origin[0]}
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-zinc-400">
                    Supports any US city or lat, lng pair
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const temp = origin;
                      setOrigin(destination);
                      setDestination(temp);
                    }}
                    className="inline-flex items-center gap-1 rounded-lg bg-zinc-800/90 hover:bg-zinc-700 text-zinc-200 px-2.5 py-1 text-xs font-medium transition cursor-pointer border border-zinc-700"
                  >
                    <ArrowsLeftRight size={13} />
                    Swap
                  </button>
                </div>

                <div>
                  <label
                    htmlFor="destination-input"
                    className="block text-xs font-semibold text-zinc-200 mb-1.5"
                  >
                    Destination City or Coordinates
                  </label>
                  <div className="relative">
                    <MapPin
                      size={16}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-sky-400"
                    />
                    <input
                      id="destination-input"
                      type="text"
                      list="freight-hub-suggestions"
                      value={destination}
                      onChange={(e) => setDestination(e.target.value)}
                      placeholder="e.g., Denver, CO or Salt Lake City, UT"
                      className="w-full rounded-xl border border-zinc-700/90 bg-zinc-950 pl-9 pr-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-emerald-500 focus:outline-hidden"
                    />
                  </div>
                  {fieldErrors.destination && (
                    <p className="text-xs text-red-400 mt-1">
                      {fieldErrors.destination[0]}
                    </p>
                  )}
                </div>
              </div>

              {/* Departure Date & Time */}
              <div>
                <label
                  htmlFor="departure-input"
                  className="block text-xs font-semibold text-zinc-200 mb-1.5"
                >
                  Departure Date &amp; Time
                </label>
                <div className="relative">
                  <CalendarBlank
                    size={16}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"
                  />
                  <input
                    id="departure-input"
                    type="datetime-local"
                    value={departureLocal}
                    onChange={(e) => setDepartureLocal(e.target.value)}
                    className="w-full rounded-xl border border-zinc-700/90 bg-zinc-950 pl-9 pr-3 py-2 text-sm font-mono text-zinc-100 focus:border-emerald-500 focus:outline-hidden"
                  />
                </div>
              </div>

              {/* Load Weight (lbs) + Active Threshold Badges */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label
                    htmlFor="weight-input"
                    className="text-xs font-semibold text-zinc-200 flex items-center gap-1.5"
                  >
                    <Scales size={15} className="text-amber-400" />
                    Cargo / Load Weight (lbs)
                  </label>
                  <span className="font-mono text-xs font-bold text-emerald-400">
                    {loadWeightLbs.toLocaleString()} lbs
                  </span>
                </div>
                <input
                  id="weight-input"
                  type="number"
                  min={1000}
                  max={120000}
                  step={500}
                  value={loadWeightLbs}
                  onChange={(e) => setLoadWeightLbs(Number(e.target.value))}
                  className="w-full rounded-xl border border-zinc-700/90 bg-zinc-950 px-3 py-2 text-sm font-mono text-zinc-100 focus:border-emerald-500 focus:outline-hidden"
                />
                {fieldErrors.load_weight_lbs && (
                  <p className="text-xs text-red-400 mt-1">
                    {fieldErrors.load_weight_lbs[0]}
                  </p>
                )}

                {/* Quick Weight Buttons */}
                <div className="grid grid-cols-4 gap-1.5 mt-2">
                  {[
                    { label: '24k Light', val: 24000 },
                    { label: '34k Med', val: 34000 },
                    { label: '42k Heavy', val: 42000 },
                    { label: '46.5k Max', val: 46500 },
                  ].map((item) => (
                    <button
                      key={item.val}
                      type="button"
                      onClick={() => setLoadWeightLbs(item.val)}
                      className={`rounded-lg py-1 text-[11px] font-mono transition cursor-pointer border ${
                        loadWeightLbs === item.val
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 font-bold'
                          : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:text-zinc-200'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>

                {/* Live Load Rule Activation Indicator */}
                <div className="mt-2.5 rounded-xl bg-zinc-950/90 border border-zinc-800/90 p-2.5 text-[11px] space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-400">
                      45-54 mph Wind + &gt;30,000 lb -&gt; No Travel:
                    </span>
                    <span
                      className={`font-mono font-bold ${
                        loadWeightLbs > 30000
                          ? 'text-amber-300'
                          : 'text-zinc-500'
                      }`}
                    >
                      {loadWeightLbs > 30000 ? 'ACTIVE' : 'INACTIVE'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-400">
                      35-44 mph Wind + &gt;40,000 lb -&gt; Severe:
                    </span>
                    <span
                      className={`font-mono font-bold ${
                        loadWeightLbs > 40000
                          ? 'text-orange-300'
                          : 'text-zinc-500'
                      }`}
                    >
                      {loadWeightLbs > 40000 ? 'ACTIVE' : 'INACTIVE'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Trailer Configuration & Checkpoint Sampling Interval */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="truck-type-select"
                    className="block text-xs font-semibold text-zinc-200 mb-1.5"
                  >
                    Trailer Profile
                  </label>
                  <select
                    id="truck-type-select"
                    value={truckType}
                    onChange={(e) => setTruckType(e.target.value as TruckType)}
                    className="w-full rounded-xl border border-zinc-700/90 bg-zinc-950 px-3 py-2 text-xs text-zinc-100 focus:border-emerald-500 focus:outline-hidden"
                  >
                    <option value="dry_van">53&apos; Dry Van</option>
                    <option value="reefer">53&apos; Refrigerated</option>
                    <option value="flatbed">48&apos; Flatbed</option>
                    <option value="tanker">Liquid Bulk Tanker</option>
                    <option value="doubles">Twin 28&apos; Doubles</option>
                  </select>
                </div>

                <div>
                  <span className="block text-xs font-semibold text-zinc-200 mb-1.5">
                    Checkpoint Sampling
                  </span>
                  <div className="grid grid-cols-3 gap-1 rounded-xl bg-zinc-950 p-1 border border-zinc-800">
                    {([10, 25, 50] as SamplingInterval[]).map((interval) => (
                      <button
                        key={interval}
                        type="button"
                        onClick={() => setSamplingInterval(interval)}
                        className={`rounded-lg py-1.5 text-xs font-mono font-semibold transition cursor-pointer ${
                          samplingInterval === interval
                            ? 'bg-emerald-500 text-zinc-950 font-bold'
                            : 'text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        {interval} mi
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Weather Data Source Mode Selector */}
              <div>
                <span className="block text-xs font-semibold text-zinc-200 mb-1.5">
                  Weather Telemetry Source
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setWeatherMode('simulated')}
                    className={`rounded-xl px-3 py-2 text-left text-xs border transition cursor-pointer ${
                      weatherMode === 'simulated'
                        ? 'bg-amber-500/15 text-amber-200 border-amber-500/45'
                        : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:text-zinc-200'
                    }`}
                  >
                    <div className="font-semibold flex items-center gap-1.5">
                      <Flask size={14} />
                      Storm Corridor Sim
                    </div>
                    <div className="text-[10px] opacity-80">
                      Active wind/snow cells to test risk rules
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setWeatherMode('live')}
                    className={`rounded-xl px-3 py-2 text-left text-xs border transition cursor-pointer ${
                      weatherMode === 'live'
                        ? 'bg-emerald-500/15 text-emerald-200 border-emerald-500/45'
                        : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:text-zinc-200'
                    }`}
                  >
                    <div className="font-semibold flex items-center gap-1.5">
                      <Broadcast size={14} />
                      Live Open-Meteo API
                    </div>
                    <div className="text-[10px] opacity-80">
                      Real-time 48h NOAA/NWS forecast
                    </div>
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 active:scale-[0.99] disabled:opacity-60 text-zinc-950 font-bold py-3 px-4 text-sm transition cursor-pointer shadow-lg shadow-emerald-500/15"
              >
                <Lightning size={18} weight="fill" />
                {isLoading ? 'Evaluating 3 Corridors...' : 'Analyze Route Safety'}
              </button>
            </form>
          </section>

          {/* Right Column: Interactive Map + 0-48h Weather Heatmap */}
          <section className="lg:col-span-8">
            {isLoading && !planResult ? (
              <div className="h-[580px] rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 flex flex-col justify-between animate-pulse">
                <div className="h-6 w-64 rounded bg-zinc-800" />
                <div className="flex-1 my-4 rounded-xl bg-zinc-800/60 flex items-center justify-center text-sm text-zinc-400">
                  Sampling highway checkpoints and computing 0-48h weather risk...
                </div>
                <div className="h-12 w-full rounded bg-zinc-800" />
              </div>
            ) : planResult ? (
              <CorridorMap
                routes={planResult.routes}
                selectedRouteId={selectedRouteId}
                onSelectRoute={setSelectedRouteId}
                focusedCheckpoint={focusedCheckpoint}
                onSelectCheckpoint={setFocusedCheckpoint}
                heatmap={planResult.heatmap}
                forecastHour={forecastHour}
                onChangeForecastHour={setForecastHour}
                useSliderTimeForCheckpoints={useSliderTimeForCheckpoints}
                onToggleSliderTimeMode={setUseSliderTimeForCheckpoints}
              />
            ) : (
              <div className="h-[520px] rounded-2xl border border-zinc-800 bg-zinc-900/50 p-8 flex flex-col items-center justify-center text-center">
                <Truck size={40} className="text-zinc-600 mb-3" />
                <h2 className="text-base font-bold text-zinc-200">
                  Ready to Plan Your Freight Corridor
                </h2>
                <p className="text-xs text-zinc-400 max-w-md mt-1">
                  Enter an origin, destination, departure time, and load weight
                  on the left to generate 3 route alternatives and evaluate
                  weather safety.
                </p>
              </div>
            )}
          </section>
        </div>

        {/* Route Safety Score Breakdown, "Why this route?", and Trade-Off Comparison */}
        {planResult && (
          <RouteComparisonPanel
            routes={planResult.routes}
            selectedRouteId={selectedRouteId}
            onSelectRoute={(id) => {
              setSelectedRouteId(id);
              setFocusedCheckpoint(null);
            }}
          />
        )}

        {/* Mile-by-Mile Checkpoint ETA Weather Timeline */}
        {planResult && activeRoute && (
          <CheckpointTimeline
            route={activeRoute}
            samplingIntervalMiles={planResult.query.sampling_interval_miles}
            onSelectCheckpoint={setFocusedCheckpoint}
            focusedCheckpointIndex={focusedCheckpoint?.index ?? null}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-900 bg-zinc-950 py-4 px-4 sm:px-6 text-xs text-zinc-500">
        <div className="max-w-[1440px] mx-auto flex flex-wrap items-center justify-between gap-2">
          <span>
            HaulGuard Truck Route Safety Planner - Built with React, TypeScript,
            Leaflet &amp; Django REST Framework
          </span>
          <button
            type="button"
            onClick={() => setIsRulesModalOpen(true)}
            className="inline-flex items-center gap-1 text-zinc-400 hover:text-emerald-400 cursor-pointer"
          >
            <ClockCounterClockwise size={14} />
            View Risk Threshold Matrix &amp; Saved Queries
          </button>
        </div>
      </footer>

      <RulesModal
        isOpen={isRulesModalOpen}
        onClose={() => setIsRulesModalOpen(false)}
        rulesData={rulesData}
        history={history}
        onLoadHistoryItem={handleLoadHistoryItem}
      />
    </div>
  );
}

export default App;
