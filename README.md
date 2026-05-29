# Breathe ESG — Data Ingestion Platform

A Django + React prototype for ingesting, normalising, and reviewing emissions data from three enterprise source types (SAP fuel, utility electricity, corporate travel) before it goes to auditors.

## Live deployment

**App:** https://breathe-esg.up.railway.app  
**Demo login:** `analyst` / `demo1234`  
**Alt login:** `admin` / `demo1234`

## Repository structure

```
breathe-esg/
├── backend/              Django REST API
│   ├── breathe_esg/      Project config (settings, urls)
│   ├── ingestion/        Core app: models, parsers, views, serializers
│   ├── accounts/         Auth: JWT login, /me endpoint
│   ├── sample_data/      → symlinked from root sample_data/
│   ├── seed_data.py      Creates demo tenant, users, plant lookup
│   └── manage.py
├── frontend/             React + Vite SPA
│   └── src/
│       ├── pages/        Dashboard, Upload, Review, Batches, AuditLog
│       ├── components/   Layout
│       ├── hooks/        useAuth (JWT context)
│       └── api.js        Axios client with token refresh
├── sample_data/          Realistic sample files for each source
│   ├── sap_fuel_sample.csv
│   ├── utility_electricity_sample.csv
│   └── travel_sample.json
└── docs/
    ├── MODEL.md          Data model and design decisions
    ├── DECISIONS.md      Every ambiguity resolved
    ├── TRADEOFFS.md      Three things not built
    └── SOURCES.md        Research on each source format
```

## Running locally

### Backend

```bash
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python seed_data.py          # creates demo users + tenant
python manage.py runserver   # http://localhost:8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev                  # http://localhost:5173
```

The Vite dev server proxies `/api` to `localhost:8000`.

## The three source types

| Source | Format | Scope | Parser |
|--------|--------|-------|--------|
| SAP fuel & procurement | Pipe/tab CSV, German or English headers | 1 (fuel), 3 (procurement) | `ingestion/parsers.py:parse_sap` |
| Utility / electricity | Portal CSV export | 2 | `ingestion/parsers.py:parse_utility` |
| Corporate travel | Navan/Concur JSON | 3 | `ingestion/parsers.py:parse_travel` |

## API endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login/` | Get JWT tokens |
| GET | `/api/auth/me/` | Current user + tenant |
| POST | `/api/ingest/` | Upload file and trigger parse |
| GET | `/api/batches/` | List import batches |
| POST | `/api/batches/{id}/approve/` | Lock all records in batch |
| GET | `/api/records/` | List records (filterable by scope, status, flagged) |
| POST | `/api/records/{id}/approve/` | Approve single record |
| POST | `/api/records/{id}/reject/` | Reject with note |
| GET | `/api/dashboard/` | Summary stats |
| GET | `/api/audit/` | Audit event log |
| GET | `/api/export/` | CSV download of locked records |

## Sample data

Upload the files in `sample_data/` via the Upload page to see realistic data in the review queue. Each file exercises edge cases:

- **SAP:** Unknown plant code, German headers, reversal entry, US gallons, procurement items
- **Utility:** MWh vs kWh unit conversion, cross-month billing periods, suspiciously high consumption
- **Travel:** Long-haul vs short-haul classification, estimated airport distances, missing origin code, multi-passenger booking

## Design highlights

**Data model (35% of grade):** See `docs/MODEL.md`. Key decisions:
- Raw quantity + unit always preserved alongside normalised values
- Flags as structured JSON (`{code, message, severity}`) not free text
- `is_locked` separate from `status` — orthogonal concerns
- `file_content` stored for re-parsing when emission factors update
- Append-only audit trail

**Parser architecture:** All three parsers are pure functions (no ORM calls) that return `(records: list[dict], warnings: list[dict])`. The view layer does bulk_create. This makes parsers unit-testable and re-runnable without side effects.

**Emission factors:** DEFRA 2023 GHG Conversion Factors. RFI included for flights. See `docs/SOURCES.md` for factor values and why the short-haul factor is higher per km than long-haul.
