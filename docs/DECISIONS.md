# Decisions — Breathe ESG Prototype

## SAP Format: Pipe-Delimited Flat File

**What I researched**: SAP exposes data via IDoc (EDI format), OData v4 (REST), BAPIs (function calls), and flat-file exports from transactions like FAGLL03 (GL line items) and MB52 (warehouse stock).

**What I chose**: Pipe-delimited flat file from FAGLL03/MB52. Justification:
- This is what sustainability teams actually get. SAP system admins export this to email/SharePoint because OData requires an integration project. BAPIs require developer access. IDocs are for system-to-system EDI flows.
- The format is messy in a realistic way: German headers in some SAP configs, dates in DD.MM.YYYY, unit codes like "L", "M3", "KG" that need mapping.
- Handling it doesn't require SAP API credentials or a middleware layer.

**What I ignored**: IDoc parsing (requires EDI middleware), OData (requires SAP Fiori/BTP setup per client), HR and asset line items (not relevant to carbon), cost element splits (too complex for prototype).

**What I'd ask the PM**: "Does the client have a dedicated SAP Basis team who could set up an OData service, or are they on a legacy ECC system where flat-file export is the only realistic option? Also — are their fuel purchases captured in Materials Management (MB52) or as GL postings (FAGLL03)? The column structure differs."

## Utility Format: CSV Portal Export

**What I researched**: Utilities provide data via Green Button (ESPI XML, common in US), EDI 867 (meter data), PDF invoices, and web portal CSV exports.

**What I chose**: CSV portal export. Justification:
- Green Button is US-specific and rare in UK/EU. Most enterprise clients in the UK use British Gas, EDF, or Centrica portals that offer a "Download billing history" CSV button.
- PDF parsing requires OCR which adds significant complexity and error surface for a prototype.
- CSV lets me show realistic challenges: billing periods that cross month boundaries, mixed kWh/MWh units across meters, the UNUSUAL_HIGH flag for values that look like unit errors.

**Billing period alignment**: I store `period_start` and `period_end` explicitly and use `period_start` as `activity_date`. This means a Feb 1–Mar 7 billing period is not arbitrarily split — the analyst can see the exact coverage and flag it for calendar-period allocation if needed.

**What I'd ask the PM**: "Do all their sites use the same utility provider? If they have 20 providers each with a different CSV format, we need a mapping layer per provider. Also, do they have smart meters with half-hourly data, or monthly billing summaries?"

## Travel Format: Navan/Concur JSON

**What I researched**: Concur Expense exports via their Extracts API (fixed-width or CSV); Navan (formerly TripActions) offers a Reporting API returning JSON; SAP Concur also has a TripIt integration.

**What I chose**: JSON export matching Navan's trips-and-segments structure. Justification:
- Navan's JSON is cleaner than Concur's fixed-width extract and more representative of how modern travel platforms expose data.
- The segment-based model (flight + hotel + car within one trip) maps naturally to our category system.
- JSON handles nested structures without delimiter ambiguity.

**Flight distance calculation**: Airport codes are given but distances often aren't. I built a lookup table for the ~20 most common business routes and a fallback estimator (same first letter = short-haul 800km, different = 5000km). This is flagged as `AIRPORT_DIST_ESTIMATED`. Real deployment would use a full IATA airport lat/lon database with haversine calculation.

**What I'd ask the PM**: "Is the client on Navan or Concur specifically? If Concur, their extract format is very different — fixed-width, not JSON. Also, do they want employee-level data or just aggregate by cost centre?"

## Emission Factor Source

Used DEFRA 2023 GHG Conversion Factors (simplified subset). These are publicly available and widely accepted for UK-based reporting. In production, factors should be stored in a versioned DB table keyed by (category, country, year) so historical records can be recomputed if factors are updated.

## Authentication: JWT, not session

Chose JWT so the React SPA can talk to the Django API without cookie-based auth complexity. Access tokens expire in 8 hours; refresh tokens in 7 days. In production, refresh tokens should be stored in httpOnly cookies rather than localStorage.

## Deployment: SQLite for prototype, structured for Postgres

SQLite works for a demo with low concurrency. The schema has no SQLite-specific features — switching to Postgres is a one-line settings change. In production, Postgres is required for concurrent writes and for row-level security.

## Ambiguities I resolved

| Ambiguity | Decision | Rationale |
|-----------|----------|-----------|
| What to do with zero/negative quantities in SAP | Flag with REVERSAL warning, store with absolute value | SAP reversals (credit memos) appear as negatives; they represent real activity |
| Missing plant code | Store raw code, warn, don't fail | Better to import with a warning than to drop the row silently |
| Billing period crossing reporting period boundary | Store period_start/end, don't split | Splitting requires allocation logic that analysts should decide |
| Hotel nights when not provided in travel data | Default to 1 with INFO flag | Better than dropping the segment |
| Unknown airport pair distance | Estimate with WARNING flag | A flagged estimate is more useful than a null value |
