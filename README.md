# HaulGuard - Weather-Aware Truck Route Safety Planner

A full-stack web application built with **React (TypeScript, Tailwind CSS, Leaflet)** and **Django REST Framework** that helps commercial truck drivers and fleet dispatchers evaluate and compare route options based on **checkpoint ETA weather forecasts, cargo load weight, crosswind stability rules, road surface conditions, and travel time**.

---

## Key Features

1. **3-Corridor Route Generation & Checkpoint Sampling**
   - Generates **3 distinct route alternatives** between any origin and destination using live **OSRM road network routing** (with automatic northern/southern regional bypass synthesis when only a single interstate corridor exists).
   - Samples checkpoints along each route polyline every **10, 25, or 50 miles** using exact Haversine segment interpolation and computes the truck's **Estimated Arrival Time (ETA)** at each milepost.

2. **Deterministic Weather & Load-Weight Risk Rules**
   Every checkpoint is evaluated against the meteorological thresholds below at the truck's arrival time:

   | Condition | Low | Moderate | High | Severe | No Travel |
   | :--- | :--- | :--- | :--- | :--- | :--- |
   | **Wind (mph)** | `< 25 mph` | `25-34 mph` | `35-44 mph` | `45-54 mph` | `>= 55 mph` |
   | **Rain (in/hr)** | `< 0.10 in/hr` | `0.10-0.25 in/hr` | `0.25-0.50 in/hr` | `0.50-1.00 in/hr` | `> 1.00 in/hr` |
   | **Snow (in/hr)** | `< 0.5 in/hr` | `0.5-1.0 in/hr` | `1.0-2.0 in/hr` | `2.0-3.0 in/hr` | `> 3.0 in/hr` |

   **Load-Weight & Crosswind Escalation Rules:**
   - `>= 55 mph` wind -> **No Travel** for any load weight
   - `45-54 mph` wind + `> 30,000 lb` load -> Escalates to **No Travel**
   - `35-44 mph` wind + `> 40,000 lb` load -> Escalates from High to **Severe**

3. **Explainable Route Safety Score (0-100) & "Why this route?" Analysis**
   Computed deterministically on the Django backend (`backend/routes/services/risk_engine.py`):
   - **Weather Risk Sub-Score (45% weight):** Weighted by the proportion of corridor mileage in Low, Moderate, High, Severe, and No-Travel weather cells.
   - **Load & Weight Suitability Sub-Score (25% weight):** Evaluates trailer sail-area profile (`53' Dry Van`, `Reefer`, `Flatbed`, `Tanker`, `Doubles`) and load weight against peak crosswinds and triggered load-escalation checkpoints.
   - **Road Surface Condition Sub-Score (20% weight):** Derives pavement traction hazards (`Dry & Clear`, `Wet Pavement`, `Standing Water / Hydroplane Risk`, `Slush / Black Ice Potential`, `Ice & Deep Snow Pack`, `High Crosswind Gust Corridor`).
   - **Schedule Efficiency Sub-Score (10% weight):** Measures travel time trade-offs relative to the fastest route.
   - **Recommendation Ranking Priority:**
     1. Fewest **No-Travel** & **Severe** miles
     2. Fewest **High** risk miles
     3. Lowest **average checkpoint risk score**
     4. Shortest **estimated travel time**

4. **Interactive Corridor Map & 0-48 Hour Weather Heatmap**
   - Displays all 3 route polylines, color-coded checkpoints, and interactive telemetry popups.
   - Custom **HTML5 Canvas Weather Heatmap** overlay supporting 4 telemetry layers (`Combined Risk`, `Wind Speed`, `Rain Rate`, `Snow Rate`) and a **0-48 Hour Forecast Slider** with Play/Pause animation to inspect moving weather fronts along the trip corridor.
   - Transparently badges **Live API Data** (`OSRM + Open-Meteo 48h Forecast`) vs **Storm Corridor Simulation** (deterministic frontal storm cells designed to stress-test the `>30,000 lb` and `>40,000 lb` rules on demand).

---

## Project Architecture

```text
truck-route-planner/
├── backend/
│   ├── config/                  # Django project settings & root URL configuration
│   ├── routes/
│   │   ├── models.py            # RoutePlanQuery model for persisting dispatch evaluations
│   │   ├── serializers.py       # DRF input validation & history serializers
│   │   ├── views.py             # REST API views (/api/rules/, /api/routes/plan/, /api/routes/history/)
│   │   ├── tests.py             # Unit & API tests for risk thresholds, load rules, and ranking
│   │   └── services/
│   │       ├── risk_engine.py   # Deterministic weather thresholds, load rules & Safety Score (0-100)
│   │       ├── routing_service.py # Geocoding, 3-route OSRM generation & Haversine checkpoint sampler
│   │       └── weather_service.py # Open-Meteo 48h batch forecast & corridor storm simulation
│   ├── manage.py
│   └── requirements.txt
└── frontend/
    ├── src/
    │   ├── components/
    │   │   ├── CorridorMap.tsx          # Leaflet map + Canvas 0-48h weather heatmap + forecast slider
    │   │   ├── RouteComparisonPanel.tsx # Safety Score breakdown, "Why this route?" & trade-off table
    │   │   ├── CheckpointTimeline.tsx   # Mile-by-mile ETA weather ribbon & filterable checkpoint cards
    │   │   └── RulesModal.tsx           # Threshold matrix & saved database history viewer
    │   ├── services/api.ts              # Typed API client & validation error handling
    │   ├── types/routing.ts             # Shared TypeScript interfaces
    │   └── utils/riskColors.ts          # Semantic risk color tokens & formatters
    ├── package.json
    └── vite.config.ts
```

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

## REST API Endpoints

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/rules/` | Returns the deterministic weather/load threshold matrix, quick freight corridor presets, and supported freight hubs. |
| `POST` | `/api/routes/plan/` | Validates trip inputs, generates 3 routes, samples checkpoints every `10/25/50` miles, computes ETA weather + 0-48h heatmap, and returns ranked routes with Explainable Route Safety Scores. |
| `GET` | `/api/routes/history/` | Returns the 10 most recent route safety evaluations persisted in SQLite. |
| `GET` | `/api/routes/history/<uuid>/` | Restores a saved route safety plan payload by ID. |
