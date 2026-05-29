# SOURCES

For each of the three data sources: what I researched, what I learned, what my sample data looks like and why, and what would break in a real deployment.

---

## 1. SAP Fuel & Procurement

### What I researched
SAP's primary export paths for material/fuel data: FAGLL03 (FI GL line items), MB52 (warehouse stock), ME2M (purchase orders by material), and MIGO (goods movement). Reviewed SAP Help documentation on IDoc types (MATMAS, ORDERS, WMMBID01), BAPI_MATERIAL_GETLIST, and the OData services exposed via SAP Gateway (API_MATERIAL_DOCUMENT_SRV).

Also reviewed the DEFRA GHG methodology for Scope 1 fuel combustion and how SAP's Sustainability Management module (SAP SM) structures its own carbon data — relevant because clients with SAP SM have already classified materials.

### What I learned
- FAGLL03 is the most universal export path. Every SAP installation has it. The column set is configurable but the core fields (Buchungsdatum, Werk, Material, Materialbezeichnung, Menge, Mengeneinheit) are stable.
- SAP's date format is configurable at system level — some systems export `DD.MM.YYYY` (German locale), others `MM/DD/YYYY` (US), others ISO. Our parser tries 8 date formats.
- Plant codes are 4-character strings (numeric like `1000` or alphanumeric like `DE01`). They're meaningless without a lookup table that the client must provide. This is one of the most common onboarding friction points.
- Units of measure in SAP (Mengeneinheit) include SAP-internal codes (`L`, `KG`, `M3`, `GAL`, `PC`) that differ from ISO units. `GAL` is US gallons in most SAP configs. Some configs use `GL` for gallons.
- Material descriptions can be in the SAP system language (German for European subsidiaries).
- Zero and negative quantities appear legitimately: reversals (negative) and zero-quantity informational postings.

### What my sample data looks like and why
Pipe-delimited, German column headers, mixing German and English descriptions (realistic for a UK company with a German parent). Plant codes from our lookup table. Diesel in litres, natural gas in M3, procurement items with no fuel classification. Reversal entries (negative quantities) included to exercise the parser's sign handling.

```
Buchungsdatum|Belegdatum|Werk|Werksbezeichnung|Material|Materialbezeichnung|Menge|Mengeneinheit|Belegart|Kostenstelle
01.03.2024|28.02.2024|1000|Acme London HQ|DIESEL001|Diesel Kraftstoff|5000.000|L|WA|COST-001
15.03.2024|14.03.2024|2000|Acme Manchester|NATGAS01|Erdgas (Natural Gas)|12000.000|M3|WA|COST-002
20.03.2024|20.03.2024|3000|Acme Frankfurt|PETROL01|Benzin Regular|3200.000|L|WA|COST-003
22.03.2024|22.03.2024|XXXX||DIESEL001|Diesel Kraftstoff|800.000|L|WA|COST-004
31.03.2024|31.03.2024|1000|Acme London HQ|DIESEL001|Diesel Kraftstoff|-200.000|L|WA|COST-001
```

Row 4 has an unknown plant code `XXXX` — exercises the `UNKNOWN_PLANT` warning. Row 5 is a negative reversal — exercises sign handling.

### What would break in a real deployment
- **Column variability:** FAGLL03 has ~80 configurable columns. A client's SAP admin may export different columns. We'd need a column-mapping configuration step during onboarding.
- **Encoding:** Some SAP systems export in Windows-1252 (Latin-1), not UTF-8. German umlauts (ä, ö, ü) will corrupt. Real parser needs encoding detection (chardet).
- **Large files:** A year of fuel data for a 50-site manufacturer is 20,000–100,000 rows. Synchronous parse will timeout. Needs Celery.
- **Material classification:** Our regex-based classifier is a best-effort heuristic. A material code `HEATOIL` might be heating oil (Scope 1) or hydraulic oil (not in scope). Needs a configurable material-to-category mapping table per tenant.
- **Multi-currency amounts:** We ingest quantity (Menge) not cost (Betrag), so currency doesn't affect the emission calculation. But if we ever want to add cost-intensity metrics, currency normalisation becomes necessary.

---

## 2. Utility / Electricity

### What I researched
UK utility portal export formats from British Gas Business, EDF Energy Business, Scottish Power, Opus Energy, and E.ON. Also reviewed the Green Button standard (ESPI XML, US), OFGEM's half-hourly data requirements for I&C customers, and the ECOES portal (used by UK Distribution Network Operators for meter data).

Reviewed DEFRA's Scope 2 methodology: the difference between location-based (grid average) and market-based (supplier-specific) emission factors, and the GHG Protocol Scope 2 Guidance (2015).

### What I learned
- UK utility portal CSVs are not standardised. Each supplier has a different column layout. Common denominators: a meter identifier, a period, a consumption figure, and a unit.
- Units vary: kWh is universal, but some portals export MWh for large sites, and some use "units" (= kWh for electricity, ambiguous for gas).
- Billing periods are 28–35 days. Never exactly a calendar month. A March invoice may cover 03 Feb – 02 Mar. Month-based aggregation requires period overlap logic.
- Half-hourly meters (HH meters, mandatory for I&C customers above 100kW) produce 48 readings per day — a year of data is 17,520 rows per meter. We handle daily/monthly summaries only; HH data needs aggregation first.
- Tariff structures (TOU: Time of Use, flat rate, standing charge) don't affect the CO₂e calculation but are useful for cost intensity analysis.
- A large site may have 10–50 meters. Our location field stores `{site}/{meter_id}`.

### What my sample data looks like and why
Monthly summary CSV mimicking a British Gas Business portal export. Three meters across two sites. One row with MWh instead of kWh to exercise unit conversion. One row with a very high consumption value to trigger the `UNUSUAL_HIGH` flag. Billing periods that don't align with calendar months.

```csv
Meter ID,Site,Period Start,Period End,Consumption,Unit,Tariff,Cost,Currency
MTR-001,London HQ,2024-02-01,2024-02-29,48500,kWh,TOU-Peak,5820.00,GBP
MTR-001,London HQ,2024-03-01,2024-03-31,51200,kWh,TOU-Peak,6144.00,GBP
MTR-002,Manchester Plant,2024-01-28,2024-02-26,124.5,MWh,Flat,14940.00,GBP
MTR-003,Manchester Plant,2024-02-27,2024-03-27,118.2,MWh,Flat,14184.00,GBP
MTR-004,Frankfurt Warehouse,2024-02-01,2024-02-29,1250000,kWh,Industrial,87500.00,EUR
```

Row 5 has 1.25M kWh — plausible for a large cold storage warehouse but triggers the `UNUSUAL_HIGH` flag for analyst review.

### What would break in a real deployment
- **Per-supplier column mapping:** Every UK utility has different column names. Need a supplier detection step (by filename pattern or header fingerprint) followed by a supplier-specific mapping.
- **Half-hourly data:** HH CSV exports are very large and need aggregation to daily/monthly before our parser can handle them.
- **Gas vs electricity:** A meter may supply gas (then units are m³ or kWh thermal, Scope 1) or electricity (Scope 2). Without the fuel type in the export, we default to electricity. Gas meters from utility portals are misclassified as Scope 2 in our current implementation.
- **Market-based Scope 2:** We use the UK grid average factor (0.207 kg/kWh). A client with a renewable PPA may legitimately claim 0 kg/kWh for market-based accounting. This needs a configurable `market_factor` field per meter.
- **Smart meter API:** SMETS2 meters support DCC API access. The real-time ingestion path for large estate managers is API pull, not CSV download. This was the mode we chose not to build.

---

## 3. Corporate Travel (Navan / Concur)

### What I researched
Navan's (formerly TripActions) reporting API documentation (trips endpoint, segment types, available fields). Concur's Travel Itinerary API and SAP Concur Expense export format. Also reviewed DEFRA's Scope 3 Category 6 (business travel) methodology, ICAO's carbon calculator methodology, and the myclimate flight emission calculator's distance-vs-EF curves.

Researched airport distance databases: OpenFlights (open source, 7,000+ airports with lat/lon), OurAirports (public domain), and the ICAO WATS dataset.

### What I learned
- Navan exports a `trips` array where each trip has a `segments` array. Segments are typed (air, hotel, car, rail). This is the cleanest structure.
- Concur's XML export is more complex; the JSON reporting API output is nearly identical to Navan's structure with minor field name differences.
- Flight `distance_km` is sometimes provided, often not. When not provided, you need to compute it from origin/destination IATA codes. The haversine formula on airport coordinates gives great-circle distance; real flight distance is ~10–15% longer due to routing.
- DEFRA distinguishes 6 flight categories: domestic, short-haul economy/business/first, long-haul economy/business/first. We simplify to short/long, economy only. Business class is ~2x the emission factor.
- Radiative Forcing Index (RFI): DEFRA's flight factors include RFI (×1.891 for long-haul) to account for the non-CO₂ warming effects of aviation at altitude (contrails, NOx). Our factors include RFI; many calculators don't, leading to significant underestimates.
- Car rental: we don't know the vehicle type (petrol/diesel/electric, size class). Using an average petrol medium car factor (0.17 kg/km) is the only practical option without additional data.
- Hotel: DEFRA's average factor (31.7 kg CO₂e/night) is a blunt instrument. The actual range is ~10 kg (budget, warm climate) to ~60 kg (5-star, cold climate). Without property-level data (which doesn't exist in public datasets), this is unavoidable.

### What my sample data looks like and why
JSON with the Navan trips array structure. Mix of domestic (LHR-MAN), short-haul (LHR-CDG, LHR-FRA), and long-haul (LHR-JFK, LHR-BOM) flights. Hotel stays. A car rental with explicit distance. A rail trip. One segment with a missing airport code to exercise the error flag. One route not in our lookup table to exercise the estimated-distance warning.

```json
{
  "trips": [
    {
      "traveller_name": "Alice Smith",
      "cost_centre": "CC-ENG-001",
      "start_date": "2024-03-10",
      "segments": [
        {"type": "flight", "origin": "LHR", "destination": "JFK", "departure_date": "2024-03-10", "passengers": 1},
        {"type": "hotel", "hotel_name": "Marriott Times Square", "city": "New York", "country": "US", "check_in": "2024-03-10", "nights": 3},
        {"type": "flight", "origin": "JFK", "destination": "LHR", "departure_date": "2024-03-13", "passengers": 1}
      ]
    },
    {
      "traveller_name": "Bob Patel",
      "cost_centre": "CC-FIN-002",
      "start_date": "2024-03-15",
      "segments": [
        {"type": "flight", "origin": "LHR", "destination": "CDG", "departure_date": "2024-03-15", "passengers": 1},
        {"type": "hotel", "hotel_name": "Novotel Paris Centre", "city": "Paris", "country": "FR", "check_in": "2024-03-15", "nights": 1},
        {"type": "flight", "origin": "CDG", "destination": "LHR", "departure_date": "2024-03-16", "passengers": 1}
      ]
    },
    {
      "traveller_name": "Carol Zhang",
      "cost_centre": "CC-SLS-003",
      "start_date": "2024-03-20",
      "segments": [
        {"type": "flight", "origin": "BOM", "destination": "SIN", "departure_date": "2024-03-20", "passengers": 2},
        {"type": "car", "destination": "Singapore CBD", "distance": 45, "distance_unit": "km", "date": "2024-03-21"},
        {"type": "hotel", "hotel_name": "Marina Bay Sands", "city": "Singapore", "country": "SG", "check_in": "2024-03-20", "nights": 2}
      ]
    },
    {
      "traveller_name": "Dave Wilson",
      "cost_centre": "CC-OPS-004",
      "start_date": "2024-03-25",
      "segments": [
        {"type": "rail", "destination": "Manchester", "distance": 300, "distance_unit": "km", "date": "2024-03-25"},
        {"type": "flight", "origin": "", "destination": "EDI", "departure_date": "2024-03-26"}
      ]
    }
  ]
}
```

Dave Wilson's last flight has an empty origin — exercises the `MISSING_AIRPORTS` error flag. BOM→SIN is in our lookup table; the parser finds the exact distance. Carol's trip has 2 passengers on the same booking.

### What would break in a real deployment
- **API pagination:** Navan's API paginates at 100 trips. A year of travel for a 500-person company is 5,000–20,000 trips across 50–200 pages. Needs cursor-based pagination handling and retry logic.
- **Business class / first class:** Our EF assumes economy. A client where senior management flies business class will be significantly underestimated. Need the cabin class field from the booking.
- **Hotel property-level factors:** DEFRA average is the only publicly available option. Cornell's Hotel Sustainability Benchmarking Index has property-level data but requires a commercial license.
- **Personal vs business travel:** Some Concur exports include personal bookings made on corporate cards. Need the `is_business` flag or cost centre presence to filter.
- **Multi-currency costs:** We ingest travel data for carbon, not cost, so this doesn't affect our calculation. But if we ever add cost intensity metrics, currency normalisation is needed.
- **Duplicate detection:** If an analyst uploads the same travel export twice (e.g. a re-export after a correction), we'll create duplicate records. A production system needs deduplication by (tenant, source_type, date range, traveller, segment hash).
