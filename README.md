# Breathe ESG — Data Ingestion Prototype

A Django REST + React app that ingests emissions data from three source types (SAP fuel/procurement, utility electricity, corporate travel), normalises it, and surfaces a review dashboard for analyst sign-off before audit lock.

## Live Demo

- **App**: [deployed URL]
- **Login**: `analyst` / `demo1234`

## Architecture

```
SAP flat file ──┐
Utility CSV ────┼──> Django REST API ──> SQLite/Postgres ──> React Dashboard
Travel JSON ────┘         │                                        │
                    Parsers (3)                              Upload / Review
                    Unit normalise                           Batch history
                    Flag anomalies                           Audit log
                    CO2e compute                             CSV export
```

## Running Locally

**Backend:**
```bash
cd backend
pip install -r requirements.txt
python manage.py migrate
python seed_data.py
python manage.py runserver
```

**Frontend:**
```bash
cd frontend
npm install
VITE_API_URL=http://localhost:8000/api npm run dev
```

## Documentation

- [`MODEL.md`](docs/MODEL.md) — Data model, multi-tenancy, audit trail design
- [`DECISIONS.md`](docs/DECISIONS.md) — Every ambiguity resolved, with rationale
- [`TRADEOFFS.md`](docs/TRADEOFFS.md) — Three things deliberately not built
- [`SOURCES.md`](docs/SOURCES.md) — Real-world format research per source

## Sample Data for Demo

After seeding, use the Upload page with these sources:

**SAP (pipe-delimited):**
```
Buchungsdatum|Werk|Material|Materialbezeichnung|Menge|Mengeneinheit
01.03.2024|1000|DIESEL001|Diesel Kraftstoff|5000|L
15.03.2024|2000|NATGAS01|Erdgas Heizung|12000|M3
22.03.2024|DE01|PETROL01|Benzin Fahrzeuge|800|L
28.03.2024|XXXX|LPG001|Fluessiggas|1200|L
```

**Utility (CSV):**
```
Meter ID,Site,Period Start,Period End,Consumption,Unit
MTR-001,London HQ,2024-02-01,2024-02-29,48500,kWh
MTR-002,Manchester Plant,2024-02-01,2024-02-29,125000,kWh
```

**Travel (JSON):**
```json
{"trips":[{"traveller_name":"Alice Smith","segments":[
  {"type":"flight","origin":"LHR","destination":"JFK","departure_date":"2024-03-10","passengers":1},
  {"type":"hotel","hotel_name":"Marriott Times Square","city":"New York","check_in":"2024-03-10","nights":3}
]}]}
```
