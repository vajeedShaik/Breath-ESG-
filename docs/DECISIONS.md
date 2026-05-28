# DECISIONS

Every ambiguity I resolved, why, and what I'd ask the PM.

---

## SAP: Which export format?

**Chose:** SAP flat-file CSV/pipe-delimited, as produced by transactions FAGLL03 (GL line items) or MB52 (warehouse stock).

**Why not IDoc:** IDocs are XML/EDI structured messages designed for system-to-system integration. They're the right format for a real-time integration but require SAP BASIS access to configure an IDoc port and a receiver system. No enterprise client's sustainability team has access to that — they have access to a SAP GUI and a "Download" button.

**Why not OData/BAPI:** OData requires the SAP Gateway component to be enabled and a dedicated service activated. BAPIs require RFC connectivity and credentials that IT won't hand out for a carbon tool. Both are right for production; both are too much friction for onboarding.

**Why not XLSX:** SAP can export to Excel but the column structure varies wildly by transaction. CSV/pipe-delimited from FAGLL03 is more stable because it's the finance team's standard FI export — we can rely on Buchungsdatum, Werk, Material, Menge, Mengeneinheit being present.

**Subset handled:** Fuel and direct procurement materials only. We ignore FI postings for payroll (wage postings), asset acquisitions (APC), and inter-company transfers. The material description regex is the entry point for classification — a real deployment would use a configurable material group → scope mapping table per tenant.

**German headers:** Handled via a bidirectional alias map. SAP system language determines whether headers are German or English — we normalise both. The most common German columns are covered; anything unrecognised is passed through as-is.

---

## Utility: Which ingestion mode?

**Chose:** CSV portal export.

**Why not PDF bills:** PDFs require OCR. Even with Tesseract or a cloud vision API, table extraction from PDF utility bills is fragile — layout varies by supplier, multi-page bills require page stitching, and hand-annotated bills (common in facilities teams) fail silently. OCR adds a dependency and a failure mode we'd spend half the project debugging.

**Why not Green Button (ESPI XML):** Green Button is a US standard. UK and EU utilities don't offer it. For a UK-first client this would exclude most data sources.

**Why not direct API:** Most UK utilities (British Gas, EDF, Scottish Power) don't offer a standard API for SME customers. Large enterprise accounts sometimes get EDI feeds but that's a six-month procurement process. The facilities manager downloads CSV from a portal.

**Billing period handling:** Utility billing periods are 28–35 days and don't align with calendar months. We store `period_start` and `period_end` explicitly and use `period_start` as `activity_date`. This means month-aggregation queries must use period overlap logic, not a simple date equality. I've left that for the analyst's BI tool rather than building it into the prototype.

---

## Travel: Which format?

**Chose:** Navan (formerly TripActions) JSON export. Concur's export is structurally identical.

**Why JSON over CSV:** Navan's API and reporting exports are JSON. Corporate travel data is naturally hierarchical — a trip has multiple segments of different types. A flat CSV either loses the trip grouping or duplicates trip-level fields on every row. JSON preserves the structure.

**Flight distance calculation:** Navan sometimes provides `distance_km` but often doesn't. We maintain a hardcoded lookup table of 20 common route pairs. For unknown routes we use a heuristic (same first IATA letter = same continent = 800km estimate, otherwise 5000km). This is flagged as `AIRPORT_DIST_ESTIMATED` with `warning` severity so analysts see it. A real deployment would use the OpenFlights or OurAirports dataset (public domain) with haversine calculation.

**Hotel emission factor:** We use DEFRA's average hotel night factor (31.7 kg CO₂e/night) with no location or star-rating adjustment. Hotel emission intensity varies 3x between budget and luxury properties in different countries. This is a known limitation flagged in SOURCES.md.

**Short vs long haul threshold:** 1,500km following DEFRA's own definition. Below 1,500km = short haul EF (0.2553 kg/km), above = long haul (0.1951 kg/km). The crossover is counterintuitive (short haul is higher per km) because of the radiative forcing index and the disproportionate impact of takeoff fuel burn on short routes.

---

## Authentication

**Chose:** JWT via djangorestframework-simplejwt, 8-hour access tokens with 7-day refresh.

**Why not session auth:** The frontend is a separate SPA. Session auth requires cookies and CSRF tokens, which adds complexity to the Axios interceptor. JWT is stateless and works cleanly across origins during development.

**Why not OAuth/SSO:** Scope. The assignment asks for a prototype. SSO (Okta, Azure AD) is the right answer for enterprise deployment but adds two days of integration work. A note in TRADEOFFS.md.

---

## Multi-tenancy isolation

**Chose:** Tenant FK on every model, filtered in every queryset.

**What I'd ask the PM:** "Do we need row-level security at the DB layer, or is application-layer filtering acceptable?" For a SOC2-bound product, Postgres RLS is the right answer. For a prototype, application filtering is fine — but it means a bug in a view could potentially leak cross-tenant data. I've accepted this tradeoff.

---

## Emission factors

**Chose:** Hardcoded DEFRA 2023 GHG Conversion Factors, stored in the parsers module.

**What I'd change:** A real deployment needs a `EmissionFactor` table with version, effective date, scope, category, unit, and factor value. This allows: historical re-computation when factors are updated, client-specific factors (e.g. market-based electricity factors for a client with a PPA), and traceability to the published source. The current approach bakes the factor into the parser — changing it requires a code deploy, not a data update.

**What I'd ask the PM:** "Do clients need market-based Scope 2 accounting, or is location-based sufficient?" Market-based requires the client to provide their supplier-specific emission factor or EAC certificates. Location-based (grid average) is what we do now. This is a material difference for clients with renewable PPAs.

---

## Deployment

**Chose:** Railway for backend (Python/Django), Netlify for frontend (React static).

Railway supports SQLite for prototypes (persistent volume), has a one-command deploy from GitHub, and free tier covers the demo. Netlify handles the React build with zero config.

**What I'd change for production:** Postgres on Railway or Supabase (replace SQLite), Redis for task queue (Celery for async parsing of large files), S3 for file storage, and proper secrets management.
