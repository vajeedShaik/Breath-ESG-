# Sources — Research Notes Per Data Source

## Source 1: SAP Fuel & Procurement

**What I researched**:
- SAP transaction FAGLL03 (General Ledger line item display) and MB52 (Warehouse stocks per storage location)
- SAP IDoc format (MATMAS, INVOIC, WMMBXY) — EDI-style hierarchical segments
- SAP OData v4 via the SAP Business Technology Platform (BTP)
- Standard export formats: flat file, pipe-delimited, tab-delimited

**What I learned**:
- SAP's flat file exports have no fixed schema. Column order and names depend on which transaction is used, which SAP version (ECC vs S/4HANA), and what the system admin has configured in their layout.
- German headers are common because SAP was built in Germany and many config tables still ship with German defaults: "Buchungsdatum" (posting date), "Werk" (plant), "Menge" (quantity), "Mengeneinheit" (unit of measure).
- Dates appear in DD.MM.YYYY in German-locale SAP, ISO in English.
- Unit codes are SAP-internal: "L" (litres), "M3" (cubic metres), "KG" (kilograms), "ST" (pieces/Stück), "PAL" (pallet). These must be mapped to physical units.
- Plant codes are 4-character alphanumeric and meaningless without a lookup table: "1000" might be a UK factory or a German warehouse depending on the client's configuration.

**What my sample data looks like and why**:
The sample uses pipe-delimited format with German headers (Buchungsdatum, Werk, Materialbezeichnung, Menge, Mengeneinheit). Fuel materials are named in German (Diesel Kraftstoff, Erdgas, Benzin) to reflect a mixed-language SAP environment. Plant codes include "1000" (mapped to London HQ), "2000" (Manchester Plant), "XXXX" (deliberately unmapped to trigger UNKNOWN_PLANT warning). Quantities include M3 for natural gas (realistic for gas meter readings), L for liquid fuels.

**What would break in real deployment**:
- Clients on custom SAP layouts may have 40+ columns with renamed or reordered headers
- SAP can export multiple company codes in one file with different plant code namespaces
- Reversal postings (negative quantities) need to be matched to their original document and excluded or netted — we flag them but don't net them
- The material classification regex is naive; real SAP material numbers (e.g. "000000000010012345") don't contain the fuel type — you'd need a Materials master data export to classify them

---

## Source 2: Utility / Electricity

**What I researched**:
- Green Button standard (ESPI XML, used by US utilities like PG&E, ConEd)
- EDI 867 (Product Activity Data, used for meter data exchange between utilities)
- UK utility portal exports: British Gas Business, EDF Energy, Centrica
- Half-hourly meter data (HH) vs monthly billing summaries

**What I learned**:
- UK/EU enterprise clients download a "billing history" CSV from their utility portal. Format varies by provider but common columns are: account/meter ID, billing period, consumption, unit (kWh or MWh), tariff code, cost.
- Billing periods don't align with calendar months. A bill might cover Feb 3 to Mar 4 — 29 days that span two reporting months.
- Large sites may have multiple meters (separate HV supply, process equipment, HVAC). Each meter appears as a separate row.
- Multi-site clients often have different utility providers per site, each with a different CSV format.
- Units vary: residential meters report kWh; industrial sites are often billed in MWh; some older exports use "units" (= kWh in UK context).

**What my sample data looks like and why**:
CSV with Meter ID, Site, Period Start/End, Consumption, Unit, Tariff, Cost. Three meters: London HQ (kWh, moderate consumption), Manchester Plant (kWh, higher consumption), Frankfurt Hub (MWh — triggering the MWh→kWh conversion AND the UNUSUAL_HIGH flag because 62,000 MWh = 62 million kWh, suspicious for a single meter — this is intentional to demonstrate the flag).

**What would break in real deployment**:
- PDF invoice parsing would require OCR and layout-specific extraction logic
- Half-hourly meter data creates 17,520 rows/meter/year — bulk ingestion and time-series aggregation become necessary
- Estimated vs actual readings must be distinguished (many bills show "E" or "A" status)
- Multi-site clients with 10 different utility providers each need a format mapping

---

## Source 3: Corporate Travel (Navan/Concur JSON)

**What I researched**:
- Concur Travel Extracts API (v3.0) — produces fixed-width or CSV extracts
- Navan (TripActions) Reporting API — returns JSON with trips and segments
- GBTA (Global Business Travel Association) data standards
- IATA airport codes and great-circle distance calculation

**What I learned**:
- Modern travel platforms (Navan, TravelPerk) expose clean JSON APIs. Legacy platforms (older Concur) produce fixed-width extracts that require character-position parsing.
- Trip segments are typed: air, car, hotel, rail. Each type needs different emission factor inputs (km for transport, nights for hotels).
- Flight distances are almost never provided by the booking platform — you get origin and destination airport codes. Distance must be derived from airport coordinates.
- Some bookings include passenger count, others assume 1. Group bookings may appear as a single trip with N passengers.
- Trips often span multiple days across multiple categories — a business trip to New York is one "trip" with a flight segment, hotel segment, and return flight segment.

**What my sample data looks like and why**:
JSON with a `trips` array, each trip having a `traveller_name`, `cost_centre`, and `segments` array. Segments include: LHR→JFK (long-haul, triggering the >1500km classification), CDG→LHR (short-haul), hotel with explicit nights, rail with explicit distance, car rental with km distance. One route pair (LHR→JFK) is in the known-distance table; a hypothetical unknown pair would trigger AIRPORT_DIST_ESTIMATED.

**What would break in real deployment**:
- The airport distance table covers ~20 routes. A global enterprise with diverse travel patterns needs a full IATA coordinates DB (~8000 airports) with haversine calculation.
- Concur's extract format is completely different — fixed-width fields, not JSON. It would need a separate parser.
- Personal travel mixed into corporate travel platforms (common for road warriors who book everything through Concur) needs to be filtered out by trip type or cost code.
- Rail travel often lacks distance — Eurostar shows city pairs but not km. Ground transport categories (taxi, ride-share) almost never provide distance.
