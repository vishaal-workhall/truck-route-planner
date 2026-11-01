import { useEffect } from 'react';
import { ArrowsLeftRight } from '@phosphor-icons/react';
import type { PresetScenario, SamplingInterval, TruckType, WeatherMode } from '../types/routing';
import { TRUCK_OPTIONS } from '../utils/trucks';
import { Button, controlClass, Field, Segmented } from './ui/controls';

interface PlanViewProps {
  origin: string;
  destination: string;
  departureLocal: string;
  loadWeightLbs: number;
  samplingInterval: SamplingInterval;
  truckType: TruckType;
  weatherMode: WeatherMode;
  hubs: string[];
  presets: PresetScenario[];
  fieldErrors: Record<string, string[]>;
  busy: boolean;
  onOrigin: (value: string) => void;
  onDestination: (value: string) => void;
  onDeparture: (value: string) => void;
  onWeight: (value: number) => void;
  onSampling: (value: SamplingInterval) => void;
  onTruck: (value: TruckType) => void;
  onWeather: (value: WeatherMode) => void;
  onSwap: () => void;
  onSubmit: () => void;
  onApplyPreset: (preset: PresetScenario) => void;
}

const WEIGHTS = [
  { label: '24,000', value: 24000 },
  { label: '34,000', value: 34000 },
  { label: '42,000', value: 42000 },
  { label: '46,500', value: 46500 },
];

export function PlanView(props: PlanViewProps) {
  const truck = TRUCK_OPTIONS.find((item) => item.value === props.truckType);
  const holdRule = props.loadWeightLbs > 30000;
  const severeRule = props.loadWeightLbs > 40000;

  useEffect(() => {
    const fields: [string, string][] = [
      ['origin', 'origin-input'],
      ['destination', 'destination-input'],
      ['departure_time', 'departure-input'],
      ['load_weight_lbs', 'weight-input'],
    ];
    const match = fields.find(([key]) => props.fieldErrors[key]?.[0]);
    if (!match) return;
    document.getElementById(match[1])?.scrollIntoView({ block: 'center' });
  }, [props.fieldErrors]);

  return (
    <div className="view-enter grid items-start gap-4 lg:grid-cols-[minmax(0,640px)_minmax(260px,1fr)]">
      <form
        className="border border-line bg-white"
        onSubmit={(event) => {
          event.preventDefault();
          props.onSubmit();
        }}
      >
        <div className="border-b border-line px-4 py-3">
          <h2 className="text-sm font-semibold">Journey</h2>
        </div>
        <div className="space-y-3 px-4 py-4">
          <datalist id="freight-hub-suggestions">
            {props.hubs.map((hub) => (
              <option key={hub} value={hub} />
            ))}
          </datalist>
          <Field
            label="Origin"
            htmlFor="origin-input"
            error={props.fieldErrors.origin?.[0]}
            hint="City name, or a latitude, longitude pair."
          >
            <input
              id="origin-input"
              name="origin"
              type="text"
              list="freight-hub-suggestions"
              value={props.origin}
              onChange={(event) => props.onOrigin(event.target.value)}
              placeholder="Mumbai"
              aria-invalid={Boolean(props.fieldErrors.origin)}
              aria-describedby={
                props.fieldErrors.origin ? 'origin-input-error' : 'origin-input-hint'
              }
              className={controlClass}
            />
          </Field>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={props.onSwap}
              className="inline-flex min-h-10 cursor-pointer items-center gap-1.5 px-1 text-sm font-medium text-ink hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              <ArrowsLeftRight size={14} />
              Swap origin and destination
            </button>
          </div>
          <Field
            label="Destination"
            htmlFor="destination-input"
            error={props.fieldErrors.destination?.[0]}
          >
            <input
              id="destination-input"
              name="destination"
              type="text"
              list="freight-hub-suggestions"
              value={props.destination}
              onChange={(event) => props.onDestination(event.target.value)}
              placeholder="Delhi"
              aria-invalid={Boolean(props.fieldErrors.destination)}
              aria-describedby={
                props.fieldErrors.destination ? 'destination-input-error' : undefined
              }
              className={controlClass}
            />
          </Field>
          <Field
            label="Departure"
            htmlFor="departure-input"
            error={props.fieldErrors.departure_time?.[0]}
            hint="Your local time. Within the next 7 days, so the forecast covers the trip."
          >
            <input
              id="departure-input"
              name="departure_time"
              type="datetime-local"
              value={props.departureLocal}
              onChange={(event) => props.onDeparture(event.target.value)}
              aria-invalid={Boolean(props.fieldErrors.departure_time)}
              aria-describedby={
                props.fieldErrors.departure_time ? 'departure-input-error' : 'departure-input-hint'
              }
              className={`${controlClass} font-mono`}
            />
          </Field>
        </div>

        <div className="space-y-3 border-t border-line px-4 py-4">
          <h2 className="text-sm font-semibold">Truck and load</h2>
          <Field label="Truck type" htmlFor="truck-type-select" hint={truck?.note}>
            <select
              id="truck-type-select"
              name="truck_type"
              value={props.truckType}
              onChange={(event) => props.onTruck(event.target.value as TruckType)}
              aria-describedby="truck-type-select-hint"
              className={controlClass}
            >
              {TRUCK_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="Load weight (lb)"
            htmlFor="weight-input"
            error={props.fieldErrors.load_weight_lbs?.[0]}
          >
            <input
              id="weight-input"
              name="load_weight_lbs"
              type="number"
              min={1000}
              max={120000}
              step={500}
              value={props.loadWeightLbs}
              onChange={(event) => props.onWeight(Number(event.target.value))}
              aria-invalid={Boolean(props.fieldErrors.load_weight_lbs)}
              aria-describedby={
                props.fieldErrors.load_weight_lbs ? 'weight-input-error' : undefined
              }
              className={`${controlClass} font-mono`}
            />
          </Field>
          <div className="grid grid-cols-2 gap-px border border-line bg-line sm:grid-cols-4">
            {WEIGHTS.map((item) => {
              const active = props.loadWeightLbs === item.value;
              return (
                <button
                  key={item.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => props.onWeight(item.value)}
                  className={`min-h-10 cursor-pointer font-mono text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ink ${
                    active ? 'bg-ink text-white' : 'bg-white text-ink hover:bg-canvas'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
          <p className="text-xs leading-5 text-muted">
            {holdRule
              ? 'Above 30,000 lb, wind of 45-54 mph is classified No Travel.'
              : 'The 30,000 lb crosswind hold is not active at this weight.'}{' '}
            {severeRule
              ? 'Above 40,000 lb, wind of 35-44 mph is classified Severe.'
              : 'The 40,000 lb severe-wind rule is not active at this weight.'}
          </p>
        </div>

        <div className="space-y-4 border-t border-line px-4 py-4">
          <h2 className="text-sm font-semibold">Weather sampling</h2>
          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium" id="sampling-label">
              Checkpoint spacing
            </span>
            <Segmented
              label="Checkpoint spacing"
              value={props.samplingInterval}
              onChange={props.onSampling}
              options={[
                { value: 10 as SamplingInterval, label: '10 mi' },
                { value: 25 as SamplingInterval, label: '25 mi' },
                { value: 50 as SamplingInterval, label: '50 mi' },
              ]}
            />
            <p className="text-xs leading-5 text-muted">
              Weather is checked at every checkpoint at the truck&apos;s estimated arrival, including
              federal Hours-of-Service breaks.
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium">Weather source</span>
            <Segmented
              label="Weather source"
              value={props.weatherMode === 'simulated' ? 'simulated' : 'live'}
              onChange={props.onWeather}
              options={[
                { value: 'live' as WeatherMode, label: 'Live forecast' },
                { value: 'simulated' as WeatherMode, label: 'Storm scenario' },
              ]}
            />
            <p className="text-xs leading-5 text-muted">
              {props.weatherMode !== 'simulated'
                ? 'Open-Meteo hourly forecast at each checkpoint, at the hour the truck arrives.'
                : 'Places a simulated storm on the corridor to demonstrate the wind, rain, snow and load rules.'}
            </p>
          </div>
        </div>

        <div className="border-t border-line px-4 py-3">
          <Button type="submit" className="w-full" disabled={props.busy}>
            {props.busy ? 'Finding safe routes' : 'Find safe routes'}
          </Button>
        </div>
      </form>

      <aside className="border border-line bg-white" aria-labelledby="plan-context">
        <div className="border-b border-line px-4 py-3">
          <h2 id="plan-context" className="text-sm font-semibold">
            Before you run
          </h2>
        </div>
        <div className="space-y-3 px-4 py-4 text-sm">
          <p className="leading-6 text-muted">
            The planner returns three road routes and recommends one by, in order: fewest Severe and
            No-Travel miles, fewest High miles, lowest average risk, then shortest travel time.
          </p>
          <p className="leading-6">
            <span className="font-medium">{truck?.label}.</span>{' '}
            <span className="text-muted">{truck?.note}</span>
          </p>
        </div>
        {props.presets.length > 0 ? (
          <div className="border-t border-line">
            <p className="px-4 pt-3 text-xs text-muted">Replace this trip with a known corridor</p>
            <ul>
              {props.presets.map((preset) => (
                <li key={preset.id} className="border-b border-line last:border-b-0">
                  <button
                    type="button"
                    disabled={props.busy}
                    onClick={() => props.onApplyPreset(preset)}
                    className="flex w-full cursor-pointer flex-col gap-0.5 px-4 py-3 text-left hover:bg-faint focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ink disabled:opacity-50"
                  >
                    <span className="text-sm font-medium">{preset.title}</span>
                    <span className="text-xs text-muted">
                      {preset.origin} to {preset.destination}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </aside>
    </div>
  );
}
