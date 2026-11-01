# HaulGuard - Weather-Aware Truck Route Planner

A React + Django REST Framework app that helps a truck driver pick the safest of three routes given
the weather at each checkpoint **when the truck gets there**, the load weight, and travel time.

**Live app:** https://haulguard-kappa.vercel.app (the API runs on Render's free tier, so the first request after it has been idle can take ~50 s).

Stack: React 19 + TypeScript + Tailwind + Leaflet (frontend), Django 6 + DRF (backend).
External APIs (no keys needed): **OSRM** for routing, **Open-Meteo** for geocoding and hourly forecasts.

---

## How each requirement is met

| Requirement | Implementation |
| :--- | :--- |
| Origin, destination, departure, load weight | Plan form. Validated client- and server-side; departure must be within the next 7 days so the forecast covers the trip. |
| 3 route options from a routing API | OSRM alternatives. If OSRM returns fewer than 3, it is re-queried through waypoints on either side of the corridor. Only if that also fails is a corridor estimated, and it is labelled "Estimated corridor (no road data)". |
| Weather every 10 / 25 / 50 miles at the truck's ETA | Checkpoints are placed exactly every N road miles (no cap). Each checkpoint gets its own Open-Meteo hourly series, and the value at the hour nearest its ETA is used. |
| Risk from the rules | `backend/routes/services/risk_engine.py`. Wind, rain and snow are classified separately, the load rules are applied to wind, and the checkpoint takes the worst of the three. |
| Recommend the best route | Routes are sorted by: No-Travel miles, then Severe miles, then High miles, then mile-weighted average risk (within 0.1 of the best counts as equal), then travel time. |
| Map with routes, checkpoints, risk, ETAs, summaries | The recommended/selected route is drawn in its checkpoints' risk colours; checkpoint popups show ETA, weather and any load-rule escalation; route cards and the comparison table summarise each route. |
| Weather heatmap with 0-48 h slider | Interpolated weather field (Risk / Wind / Rain / Snow) over the corridor, re-rendered per forecast hour, with Play. |

---

## Rules and how they are interpreted

| Condition | Low | Moderate | High | Severe | No Travel |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Wind (mph) | < 25 | 25 - < 35 | 35 - < 45 | 45 - < 55 | >= 55 |
| Rain (in/hr) | < 0.10 | 0.10 - 0.25 | > 0.25 - 0.50 | > 0.50 - 1.00 | > 1.00 |
| Snow (in/hr) | < 0.5 | 0.5 - 1.0 | > 1.0 - 2.0 | > 2.0 - 3.0 | > 3.0 |

Load rules (applied to wind): >= 55 mph is No Travel for any load; 45-54 mph with > 30,000 lb is No Travel;
35-44 mph with > 40,000 lb is Severe.

Decisions where the brief is ambiguous:

- **Band edges.** Wind bands are half-open (`34.9` is Moderate, `35.0` is High), which fits the integer table and the ">= 55" No-Travel edge. Rain and snow bands include their upper bound (`0.25` is Moderate, `0.26` is High), which fits the strict "> 1.00" / "> 3.0" No-Travel edges. Weights are strictly greater than (`30,000 lb` does not trigger the 30,000 lb rule).
- **Wind = sustained 10 m wind speed.** Gusts are shown alongside but are not classified, because the table gives wind speed thresholds.
- **Rain = Open-Meteo `rain + showers`.** Open-Meteo reports convective downpours under `showers`; using `rain` alone would miss thunderstorms.
- **"Fewest Severe miles" counts No-Travel as worse than any amount of Severe.** A route with any No-Travel stretch can't legally be driven, so No-Travel miles are compared first, then Severe miles. If every route has No-Travel miles, the UI tells the driver to hold the load.
- **Average-risk ties.** Average risk is a mile-weighted 1-5 score. Routes within 0.1 of the best are treated as equal, so travel time decides. Otherwise a 0.02 edge from one breezy checkpoint would beat a route 14 hours faster, and the brief asks to balance risk and travel time.
- **Miles per checkpoint.** Each checkpoint represents the road from half-way to the previous checkpoint to half-way to the next, so risk miles always sum to the route length.

## ETA model

- Driving time is OSRM's duration x 1.12 (heavy trucks run slower than cars).
- **Hours of Service (FMCSA, single driver):** a 30-minute break after 8 h of driving and a 10-hour rest after 11 h of driving. Checkpoints after a stop are shifted by it, so a long trip's weather is read at the hours the truck is actually there. Travel time in the ranking includes these stops.
- Forecast window: hourly series start at the departure rounded to the hour and run for `max(48 h, trip length)`, so checkpoints on multi-day trips are never clamped to hour 48.

## Weather sources

- **Live forecast (default).** Open-Meteo hourly forecast for every checkpoint plus a grid of cells between the routes (for the heatmap), fetched in parallel batches and cached for 15 minutes. Open-Meteo counts each location as a call (600 per minute on the free tier), so very long trips at 10-mile spacing snap samples to a grid of at most 0.25 deg until a plan needs <= 550 locations. If the forecast can't be fetched, the API returns `503` with a clear message. It never falls back to fake data silently.
- **Storm scenario.** Live weather is often calm, so this mode demonstrates the rules. A storm cell is placed on the primary corridor's midpoint at the time the truck reaches it, a weaker gale band on the last alternative, and both drift east-north-east. Weather depends only on place and time, so two routes passing the same point at the same hour see the same weather. It is labelled "Storm scenario" everywhere it appears.

## Route Safety Score (0-100)

A secondary, explanatory number shown on each route. **It does not decide the recommendation;** the ranking above does.
It blends weather exposure (45%), load/wind suitability (25%), road surface (20%) and time efficiency (10%), and is capped by the worst risk on the route.

---

## Project Architecture

```text
truck-route-planner/
├── backend/
│   ├── config/                    # Django settings (gzip responses, CORS) and root URLs
│   └── routes/
│       ├── serializers.py         # Input validation (interval, weight, departure window)
│       ├── views.py               # /api/rules/, /api/routes/plan/, /api/routes/history/
│       ├── tests.py               # Rule boundaries, ranking, HOS, sampling, ETA/forecast alignment, API
│       └── services/
│           ├── risk_engine.py     # Thresholds, load rules, ranking, explanations
│           ├── routing_service.py # Geocoding, OSRM routes, HOS schedule, checkpoint sampling
│           └── weather_service.py # Forecast window, Open-Meteo fetch, storm scenario, heatmap
└── frontend/src/
    ├── components/
    │   ├── CorridorMap.tsx            # Leaflet map, risk-coloured route, heatmap pane, 0-48 h slider
    │   ├── RouteComparisonPanel.tsx   # Route cards, "Why we recommend", comparison table
    │   ├── CheckpointTimeline.tsx     # Mile-by-mile checkpoint table
    │   ├── PlanView.tsx / BoardView.tsx / RulesView.tsx
    │   └── shell/, ui/                # App shell and form controls
    └── utils/
        ├── heatmapField.ts            # Inverse-distance weather field, threshold bands
        └── routeRiskSegments.ts       # Splits a route into risk-coloured runs
```

### Heatmap performance

The heatmap canvas lives in a Leaflet pane under the route lines, so it pans with the map at no cost.
It is redrawn only when a pan or zoom settles, or when the hour or metric changes. Each redraw interpolates
node values on a 5 px grid (with spatial bucketing, so a cell only visits nearby nodes), classifies them
into the rule bands, and upscales with smoothing.

---

## Quick Start Instructions

### 1. Backend Setup (Django REST Framework)

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Copy environment template (works out of the box with zero API keys required)
cp .env.example .env

# Run database migrations
python manage.py migrate

# Run the backend test suite
python manage.py test

# Start the Django API server on http://127.0.0.1:8000
python manage.py runserver 8000
```

### 2. Frontend Setup (React + Vite + TypeScript)

```bash
cd frontend
npm install

# Start the Vite dev server on http://localhost:5173
npm run dev
```

Open `http://localhost:5173` in your browser. Vite proxies `/api/*` requests directly to `http://127.0.0.1:8000`.

---

## Deployment (free tier)

**Backend: Render.** `render.yaml` is a Render Blueprint: gunicorn, debug off, a generated secret key, migrations on start.
In Render: *New -> Blueprint ->* this repo. `CORS_ALLOWED_ORIGINS` in `render.yaml` must list the frontend URL.
The free instance sleeps after 15 minutes idle (first request then takes ~50 s), and its SQLite plan history resets on restart.

**Frontend: Vercel.** Import the repo with root directory `frontend` (Vite preset) and set
`VITE_API_BASE_URL=https://<your-render-service>.onrender.com/api`.

---

## REST API Endpoints

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/rules/` | Returns the deterministic weather/load threshold matrix, quick freight corridor presets, and supported freight hubs. |
| `POST` | `/api/routes/plan/` | Validates trip inputs, generates 3 routes, samples checkpoints every `10/25/50` miles, computes ETA weather + 0-48h heatmap, and returns ranked routes with Explainable Route Safety Scores. |
| `GET` | `/api/routes/history/` | Returns the 10 most recent route safety evaluations persisted in SQLite. |
| `GET` | `/api/routes/history/<uuid>/` | Restores a saved route safety plan payload by ID. |
