import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { BoardView } from './components/BoardView';
import { CheckpointTimeline } from './components/CheckpointTimeline';
import { PlanView } from './components/PlanView';
import { RouteInsight, RouteStrip } from './components/RouteComparisonPanel';
import { RulesView } from './components/RulesView';
import { AppShell, type AppView } from './components/shell/AppShell';
import { Button } from './components/ui/controls';

const CorridorMap = lazy(() =>
  import('./components/CorridorMap').then((mod) => ({ default: mod.CorridorMap }))
);
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

const TITLES: Record<AppView, string> = {
  board: 'Dispatch',
  plan: 'Plan a journey',
  review: 'Route comparison',
  rules: 'Risk rules',
};

export function App() {
  const [view, setView] = useState<AppView>('plan');
  const [origin, setOrigin] = useState<string>('Chicago, IL');
  const [destination, setDestination] = useState<string>('Denver, CO');
  const [departureLocal, setDepartureLocal] = useState<string>(getDefaultDepartureLocal);
  const [loadWeightLbs, setLoadWeightLbs] = useState<number>(42000);
  const [samplingInterval, setSamplingInterval] = useState<SamplingInterval>(25);
  const [truckType, setTruckType] = useState<TruckType>('dry_van');
  const [weatherMode, setWeatherMode] = useState<WeatherMode>('live');

  const [rulesData, setRulesData] = useState<RulesResponse | null>(null);
  const [rulesStatus, setRulesStatus] = useState<'loading' | 'ready' | 'unavailable'>('loading');
  const [history, setHistory] = useState<RoutePlanHistoryItem[]>([]);
  const [historyReady, setHistoryReady] = useState(false);
  const [planResult, setPlanResult] = useState<RoutePlanResponse | null>(null);
  const [selectedRouteId, setSelectedRouteId] = useState<string>('');
  const [focusedCheckpoint, setFocusedCheckpoint] = useState<RouteCheckpoint | null>(null);

  const [forecastHour, setForecastHour] = useState<number>(0);
  const [useSliderTimeForCheckpoints, setUseSliderTimeForCheckpoints] = useState<boolean>(false);

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  const selectRoute = useCallback((id: string) => {
    setSelectedRouteId(id);
    setFocusedCheckpoint(null);
  }, []);

  const clearFieldError = useCallback((field: string) => {
    setFieldErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }, []);

  const refreshHistory = useCallback(async () => {
    const items = await fetchRouteHistory().catch(() => []);
    setHistory(items);
    setHistoryReady(true);
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
      const interval = overrideParams?.sampling_interval_miles ?? samplingInterval;
      const truck = overrideParams?.truck_type ?? truckType;
      const mode = overrideParams?.weather_mode ?? weatherMode;

      const localErrors: Record<string, string[]> = {};
      if (!o) localErrors.origin = ['Origin is required.'];
      if (!d) localErrors.destination = ['Destination is required.'];
      if (o && d && o.toLowerCase() === d.toLowerCase()) {
        localErrors.destination = ['Origin and destination must be different.'];
      }
      if (!weight || weight < 1000 || weight > 120000) {
        localErrors.load_weight_lbs = ['Enter a load weight between 1,000 and 120,000 lb.'];
      }
      const departureMs = departureLocal ? new Date(departureLocal).getTime() : Date.now();
      if (Number.isNaN(departureMs)) {
        localErrors.departure_time = ['Enter a valid departure date and time.'];
      } else if (departureMs < Date.now() - 3600_000) {
        localErrors.departure_time = ['Departure time cannot be in the past.'];
      } else if (departureMs > Date.now() + 7 * 24 * 3600_000) {
        localErrors.departure_time = ['Departure must be within the next 7 days so the forecast covers the trip.'];
      }

      if (Object.keys(localErrors).length > 0) {
        setFieldErrors(localErrors);
        setErrorMsg('Fix the highlighted fields before planning.');
        setView('plan');
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
        setForecastHour(0);
        setView('review');
        refreshHistory();
      } catch (err) {
        if (err instanceof ApiValidationError) {
          setErrorMsg(err.message);
          setFieldErrors(err.details);
        } else if (err instanceof Error) {
          setErrorMsg(err.message);
        } else {
          setErrorMsg('The route plan could not be completed.');
        }
        setView('plan');
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

  useEffect(() => {
    let active = true;
    fetchRulesAndPresets()
      .then((data) => {
        if (!active) return;
        setRulesData(data);
        setRulesStatus('ready');
      })
      .catch(() => {
        if (active) setRulesStatus('unavailable');
      });
    fetchRouteHistory()
      .catch(() => [])
      .then((items) => {
        if (!active) return;
        setHistory(items);
        setHistoryReady(true);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    document.title = `${TITLES[view]} - HaulGuard`;
    window.scrollTo({ top: 0 });
  }, [view]);

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
      setFocusedCheckpoint(null);
      setView('review');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'The saved plan could not be opened.');
    } finally {
      setIsLoading(false);
    }
  };

  const activeRoute =
    planResult?.routes.find((route) => route.id === selectedRouteId) || planResult?.routes[0];

  const subtitle =
    view === 'review' && planResult
      ? `${planResult.query.origin.name} to ${planResult.query.destination.name}`
      : view === 'plan'
        ? 'Origin, truck, and load. Preferences stay out of the way.'
        : view === 'rules'
          ? 'Thresholds the scorer uses for every checkpoint.'
          : 'Recent evaluations, and the next trip.';

  const sourceNote = planResult
    ? planResult.data_sources.is_simulated_weather
      ? 'Storm scenario'
      : 'Live forecast'
    : null;

  return (
    <AppShell
      view={view}
      onNavigate={setView}
      canReview={Boolean(planResult)}
      title={TITLES[view]}
      subtitle={subtitle}
      loading={isLoading}
      alert={errorMsg}
      actions={
        <>
          {sourceNote ? (
            <span
              className="hidden text-xs text-muted md:inline"
              title={planResult?.data_sources.transparency_note}
            >
              {sourceNote}
              {planResult?.data_sources.routing === 'live_osrm' ? ' / OSRM routing' : ' / Partly estimated routes'}
            </span>
          ) : null}
          {view === 'board' ? (
            <Button onClick={() => setView('plan')}>Plan a journey</Button>
          ) : null}
          {view === 'review' && planResult ? (
            <Button variant="secondary" onClick={() => setView('plan')}>
              Edit journey
            </Button>
          ) : null}
          {view === 'plan' && planResult ? (
            <Button variant="secondary" onClick={() => setView('review')}>
              View routes
            </Button>
          ) : null}
        </>
      }
    >
      {view === 'board' ? (
        <BoardView
          history={history}
          historyReady={historyReady}
          rulesReady={rulesStatus !== 'loading'}
          presets={rulesData?.presets ?? []}
          activePlan={planResult}
          busy={isLoading}
          onApplyPreset={handleApplyPreset}
          onOpenHistory={handleLoadHistoryItem}
          onOpenActive={() => setView('review')}
        />
      ) : null}

      {view === 'plan' ? (
        <PlanView
          origin={origin}
          destination={destination}
          departureLocal={departureLocal}
          loadWeightLbs={loadWeightLbs}
          samplingInterval={samplingInterval}
          truckType={truckType}
          weatherMode={weatherMode}
          hubs={rulesData?.hubs ?? []}
          presets={rulesData?.presets ?? []}
          fieldErrors={fieldErrors}
          busy={isLoading}
          onOrigin={(value) => {
            setOrigin(value);
            clearFieldError('origin');
          }}
          onDestination={(value) => {
            setDestination(value);
            clearFieldError('destination');
          }}
          onDeparture={(value) => {
            setDepartureLocal(value);
            clearFieldError('departure_time');
          }}
          onWeight={(value) => {
            setLoadWeightLbs(value);
            clearFieldError('load_weight_lbs');
          }}
          onSampling={setSamplingInterval}
          onTruck={setTruckType}
          onWeather={setWeatherMode}
          onSwap={() => {
            setOrigin(destination);
            setDestination(origin);
          }}
          onSubmit={() => executeRoutePlan()}
          onApplyPreset={handleApplyPreset}
        />
      ) : null}

      {view === 'review' && planResult ? (
        <div className="view-enter space-y-4">
          <section className="isolate border border-line bg-white">
            <Suspense
              fallback={
                <div className="h-[min(58vh,600px)] min-h-[340px] animate-pulse bg-faint" />
              }
            >
              <CorridorMap
                routes={planResult.routes}
                selectedRouteId={selectedRouteId}
                onSelectRoute={selectRoute}
                focusedCheckpoint={focusedCheckpoint}
                onSelectCheckpoint={setFocusedCheckpoint}
                heatmap={planResult.heatmap}
                forecastHour={forecastHour}
                onChangeForecastHour={setForecastHour}
                useSliderTimeForCheckpoints={useSliderTimeForCheckpoints}
                onToggleSliderTimeMode={setUseSliderTimeForCheckpoints}
              />
            </Suspense>
            <RouteStrip
              routes={planResult.routes}
              selectedRouteId={selectedRouteId}
onSelectRoute={selectRoute}
            />
          </section>
          <RouteInsight
            routes={planResult.routes}
            selectedRouteId={selectedRouteId}
            onSelectRoute={selectRoute}
          />
          {activeRoute ? (
            <CheckpointTimeline
              route={activeRoute}
              samplingIntervalMiles={planResult.query.sampling_interval_miles}
              onSelectCheckpoint={setFocusedCheckpoint}
              focusedCheckpointIndex={focusedCheckpoint?.index ?? null}
            />
          ) : null}
        </div>
      ) : null}

      {view === 'review' && !planResult ? (
        <div className="view-enter border border-line bg-white px-4 py-8">
          <p className="text-sm font-medium">No route to compare</p>
          <p className="mt-1 text-sm text-muted">Plan a journey to score three corridors.</p>
          <Button className="mt-4" onClick={() => setView('plan')}>
            Plan a journey
          </Button>
        </div>
      ) : null}

      {view === 'rules' ? <RulesView rulesData={rulesData} status={rulesStatus} /> : null}
    </AppShell>
  );
}

export default App;
