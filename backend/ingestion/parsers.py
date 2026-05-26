"""
Breathe ESG — Source Parsers
============================
Three parsers, one contract:
    parse(file_content: str, tenant, batch) -> (records: list[dict], warnings: list[dict])

Each parser returns dicts matching EmissionRecord fields, plus a 'flags' list.
The view layer bulk-creates the records. No parser touches the DB.

Design choice: parsers are pure functions (no ORM calls) so they're easy to unit-test
and can be re-run against the same raw content if emission factors change.
"""

import csv
import io
import json
import re
import logging
from datetime import datetime, date
from decimal import Decimal, InvalidOperation

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Shared utilities
# ---------------------------------------------------------------------------

def _decimal(val, default=None):
    """Safe Decimal coerce. Returns default on failure."""
    if val is None or str(val).strip() in ('', '-', 'N/A', 'n/a', 'NA'):
        return default
    try:
        return Decimal(str(val).replace(',', '').strip())
    except (InvalidOperation, ValueError):
        return default


def _parse_date(val):
    """Try multiple date formats common in SAP / utility exports."""
    if not val or str(val).strip() in ('', '0000-00-00'):
        return None
    val = str(val).strip()
    formats = [
        '%Y-%m-%d', '%d.%m.%Y', '%m/%d/%Y', '%d/%m/%Y',
        '%Y%m%d', '%d-%m-%Y', '%m-%d-%Y', '%Y-%m-%dT%H:%M:%S',
        '%Y-%m-%dT%H:%M:%SZ',
    ]
    for fmt in formats:
        try:
            return datetime.strptime(val, fmt).date()
        except ValueError:
            continue
    return None


# ---------------------------------------------------------------------------
# Unit normalisation tables
# ---------------------------------------------------------------------------

# Fuel volumes → litres
VOLUME_TO_LITRES = {
    'l': 1, 'ltr': 1, 'litre': 1, 'litres': 1, 'liter': 1, 'liters': 1,
    'gal': 3.78541, 'gallon': 3.78541, 'gallons': 3.78541,
    'usgal': 3.78541, 'ukgal': 4.54609,
    'ml': 0.001, 'cl': 0.01, 'dl': 0.1,
    'm3': 1000, 'cubic meter': 1000, 'cbm': 1000,
    'ft3': 28.3168, 'cf': 28.3168,
}

# Energy → kWh
ENERGY_TO_KWH = {
    'kwh': 1, 'kw/h': 1,
    'mwh': 1000, 'gwh': 1_000_000,
    'j': 2.778e-7, 'kj': 2.778e-4, 'mj': 0.2778, 'gj': 277.8,
    'btu': 2.931e-4, 'mmbtu': 293.1, 'therm': 29.3,
    'kcal': 0.001163,
}

# Natural gas units → m³ (then we convert to kWh via 10.55 kWh/m³)
GAS_TO_M3 = {
    'm3': 1, 'cubic meter': 1, 'cbm': 1,
    'ft3': 0.028317, 'cf': 0.028317, 'mcf': 28.317,
    'therm': 2.831,
}
GAS_KWH_PER_M3 = Decimal('10.55')   # UK HHCV average

# Distance → km
DISTANCE_TO_KM = {
    'km': 1, 'kilometer': 1, 'kilometre': 1,
    'mi': 1.60934, 'mile': 1.60934, 'miles': 1.60934,
    'nm': 1.852, 'nautical mile': 1.852,
}

def _normalise_fuel(qty, unit):
    """Returns (normalised_qty, normalised_unit, factor, notes)."""
    u = unit.lower().strip()
    # Check gas units BEFORE volume — m3/ft3 overlap with VOLUME_TO_LITRES
    if u in GAS_TO_M3:
        m3 = qty * Decimal(str(GAS_TO_M3[u]))
        kwh = m3 * GAS_KWH_PER_M3
        factor = Decimal(str(GAS_TO_M3[u])) * GAS_KWH_PER_M3
        return kwh, 'kWh', factor, [{'code': 'GAS_M3_TO_KWH', 'message': 'Natural gas converted via 10.55 kWh/m³ HHCV', 'severity': 'info'}]
    # Unknown unit — store raw, flag it
    return qty, unit, Decimal('1'), [{'code': 'UNKNOWN_UNIT', 'message': f'Unknown unit "{unit}" — stored raw', 'severity': 'warning'}]


def _normalise_energy(qty, unit):
    u = unit.lower().strip()
    if u in ENERGY_TO_KWH:
        factor = Decimal(str(ENERGY_TO_KWH[u]))
        return qty * factor, 'kWh', factor, []
    return qty, unit, Decimal('1'), [{'code': 'UNKNOWN_UNIT', 'message': f'Unknown energy unit "{unit}"', 'severity': 'warning'}]


# ---------------------------------------------------------------------------
# Emission factors (DEFRA 2023 simplified — real deployment would load from DB)
# ---------------------------------------------------------------------------

EMISSION_FACTORS_KG_CO2E = {
    'fuel_diesel':      Decimal('2.6391'),   # per litre
    'fuel_petrol':      Decimal('2.3110'),   # per litre
    'fuel_natural_gas': Decimal('0.2023'),   # per kWh
    'fuel_lpg':         Decimal('1.5551'),   # per litre
    'electricity':      Decimal('0.2070'),   # per kWh (UK grid 2023)
    'travel_flight_short':  Decimal('0.2553'),  # per km (economy, incl. RFI)
    'travel_flight_long':   Decimal('0.1951'),  # per km
    'travel_hotel':         Decimal('31.7'),    # per night (kg CO2e)
    'travel_car_rental':    Decimal('0.1700'),  # per km
    'travel_rail':          Decimal('0.0410'),  # per km
}

EMISSION_FACTOR_SOURCE = 'DEFRA 2023 GHG Conversion Factors (simplified)'


# ---------------------------------------------------------------------------
# Parser 1: SAP Fuel & Procurement
# ---------------------------------------------------------------------------
# Format choice: SAP flat-file / FAGLL03 export (pipe-delimited or tab-delimited CSV).
# This is what a finance team actually exports from SAP transaction FAGLL03 (GL line items)
# or MB52 (warehouse inventory). Columns vary by SAP config but the core fields are stable.
# German headers are handled via a header aliasing map.
#
# Scope: Fuel (diesel, petrol, natural gas, LPG) for Scope 1.
#        Procurement line items tagged as 'indirect' → Scope 3 (procurement category).
#        We ignore HR, payroll, and asset line items — not relevant to carbon.

SAP_HEADER_ALIASES = {
    # German → English
    'buchungsdatum': 'posting_date',
    'belegdatum': 'document_date',
    'werk': 'plant',
    'werksbezeichnung': 'plant_name',
    'material': 'material_code',
    'materialbezeichnung': 'material_description',
    'menge': 'quantity',
    'mengeneinheit': 'unit',
    'belegart': 'document_type',
    'buchungskreis': 'company_code',
    'kostenstelle': 'cost_centre',
    'text': 'description',
    'betrag': 'amount',
    'wahrung': 'currency',
    # Common English variants
    'posting date': 'posting_date',
    'document date': 'document_date',
    'plant': 'plant',
    'plant name': 'plant_name',
    'material number': 'material_code',
    'material description': 'material_description',
    'quantity': 'quantity',
    'base unit': 'unit',
    'unit of measure': 'unit',
    'document type': 'document_type',
    'company code': 'company_code',
    'cost center': 'cost_centre',
    'amount in local currency': 'amount',
    'currency': 'currency',
}

# SAP material codes / descriptions → our category + scope
# Real implementation would use a configurable lookup table per tenant
MATERIAL_CATEGORY_MAP = [
    (r'diesel|gasoil|gas oil',       'fuel_diesel',      '1'),
    (r'petrol|gasoline|benzin',       'fuel_petrol',      '1'),
    (r'natural.?gas|erdgas|lng|cng',  'fuel_natural_gas', '1'),
    (r'lpg|flüssiggas|butane|propane','fuel_lpg',         '1'),
    (r'electricity|strom|elektr',     'electricity',      '2'),
    (r'.*',                           'procurement',      '3'),   # fallback
]

def _classify_material(code: str, description: str):
    text = f"{code} {description}".lower()
    for pattern, category, scope in MATERIAL_CATEGORY_MAP:
        if re.search(pattern, text, re.I):
            return category, scope
    return 'procurement', '3'


def parse_sap(file_content: str, tenant, batch):
    """
    Parse SAP flat-file export (pipe or tab delimited, optional German headers).
    Returns list of record dicts + list of batch-level warnings.
    """
    records = []
    batch_warnings = []

    # Detect delimiter
    first_line = file_content.split('\n')[0] if file_content else ''
    delimiter = '|' if first_line.count('|') > first_line.count('\t') else '\t'
    if first_line.count(',') > first_line.count(delimiter):
        delimiter = ','

    reader = csv.DictReader(io.StringIO(file_content), delimiter=delimiter)

    # Normalise headers
    raw_headers = reader.fieldnames or []
    header_map = {h: SAP_HEADER_ALIASES.get(h.lower().strip(), h.lower().strip()) for h in raw_headers}

    # Load plant lookup for this tenant
    from ingestion.models import PlantLookup
    plant_lookup = {p.sap_plant_code: p for p in PlantLookup.objects.filter(tenant=tenant)}

    for row_num, raw_row in enumerate(reader, start=2):
        row = {header_map.get(k, k.lower().strip()): v for k, v in raw_row.items()}
        flags = []

        # Date
        activity_date = _parse_date(row.get('posting_date') or row.get('document_date'))
        if not activity_date:
            flags.append({'code': 'MISSING_DATE', 'message': 'No parseable posting date', 'severity': 'error'})
            activity_date = date.today()

        # Quantity
        raw_qty = _decimal(row.get('quantity'))
        if raw_qty is None:
            flags.append({'code': 'MISSING_QTY', 'message': 'Missing or unparseable quantity', 'severity': 'error'})
            raw_qty = Decimal('0')

        raw_unit = str(row.get('unit', '') or '').strip()
        if not raw_unit:
            flags.append({'code': 'MISSING_UNIT', 'message': 'No unit of measure', 'severity': 'warning'})
            raw_unit = 'UNKNOWN'

        # Plant
        plant_code = str(row.get('plant', '') or '').strip()
        plant_obj = plant_lookup.get(plant_code)
        location = plant_obj.display_name if plant_obj else plant_code
        country = plant_obj.country if plant_obj else ''
        if plant_code and not plant_obj:
            flags.append({'code': 'UNKNOWN_PLANT', 'message': f'Plant code "{plant_code}" not in lookup table', 'severity': 'warning'})

        # Classify
        mat_code = str(row.get('material_code', '') or '')
        mat_desc = str(row.get('material_description', row.get('description', '')) or '')
        category, scope = _classify_material(mat_code, mat_desc)

        # Skip zero / negative quantities for fuel (likely reversals)
        if raw_qty <= 0:
            flags.append({'code': 'NON_POSITIVE_QTY', 'message': 'Zero or negative quantity — possible reversal', 'severity': 'warning'})

        # Normalise
        norm_qty, norm_unit, conv_factor, unit_flags = _normalise_fuel(abs(raw_qty), raw_unit)
        flags.extend(unit_flags)

        # Emission factor
        ef = EMISSION_FACTORS_KG_CO2E.get(category)
        co2e = (norm_qty * ef).quantize(Decimal('0.0001')) if ef else None

        records.append({
            'scope': scope,
            'category': category,
            'activity_date': activity_date,
            'location': location,
            'country': country,
            'raw_quantity': raw_qty,
            'raw_unit': raw_unit,
            'raw_description': mat_desc[:500],
            'quantity_normalised': norm_qty,
            'normalised_unit': norm_unit,
            'conversion_factor': conv_factor,
            'co2e_kg': co2e,
            'emission_factor_used': EMISSION_FACTOR_SOURCE if co2e else '',
            'source_row_id': f"row_{row_num}",
            'flags': flags,
        })

    return records, batch_warnings


# ---------------------------------------------------------------------------
# Parser 2: Utility / Electricity (CSV portal export)
# ---------------------------------------------------------------------------
# Format choice: CSV portal export — the most universal format utilities provide.
# Green Button (ESPI XML) is cleaner but rare outside the US. PDF bills require OCR.
# CSV covers what UK/EU facilities teams actually download from their portal.
#
# Columns we handle: meter_id, period_start, period_end, consumption, unit, tariff, cost
# Billing periods do NOT align with calendar months — we store period_start/end explicitly
# and use period_start as activity_date.

UTILITY_HEADER_ALIASES = {
    'meter id': 'meter_id', 'meter number': 'meter_id', 'account': 'meter_id',
    'period start': 'period_start', 'from': 'period_start', 'start date': 'period_start',
    'period end': 'period_end', 'to': 'period_end', 'end date': 'period_end',
    'consumption': 'consumption', 'usage': 'consumption', 'kwh': 'consumption',
    'units consumed': 'consumption', 'energy consumed': 'consumption',
    'unit': 'unit', 'units': 'unit', 'uom': 'unit', 'unit of measure': 'unit',
    'tariff': 'tariff', 'tariff code': 'tariff', 'rate': 'tariff',
    'cost': 'cost', 'amount': 'cost', 'charge': 'cost', 'total': 'cost',
    'currency': 'currency',
    'site': 'site', 'location': 'site', 'premises': 'site', 'facility': 'site',
}


def parse_utility(file_content: str, tenant, batch):
    records = []
    batch_warnings = []

    first_line = file_content.split('\n')[0] if file_content else ''
    delimiter = ',' if first_line.count(',') >= first_line.count(';') else ';'

    reader = csv.DictReader(io.StringIO(file_content), delimiter=delimiter)
    raw_headers = reader.fieldnames or []
    header_map = {h: UTILITY_HEADER_ALIASES.get(h.lower().strip(), h.lower().strip()) for h in raw_headers}

    for row_num, raw_row in enumerate(reader, start=2):
        row = {header_map.get(k, k.lower().strip()): v for k, v in raw_row.items()}
        flags = []

        period_start = _parse_date(row.get('period_start'))
        period_end = _parse_date(row.get('period_end'))
        activity_date = period_start or date.today()

        if not period_start:
            flags.append({'code': 'MISSING_PERIOD_START', 'message': 'No billing period start date', 'severity': 'warning'})
        if not period_end:
            flags.append({'code': 'MISSING_PERIOD_END', 'message': 'No billing period end date', 'severity': 'warning'})

        raw_qty = _decimal(row.get('consumption'))
        if raw_qty is None:
            flags.append({'code': 'MISSING_CONSUMPTION', 'message': 'Missing consumption value', 'severity': 'error'})
            raw_qty = Decimal('0')

        raw_unit = str(row.get('unit', 'kWh') or 'kWh').strip()
        norm_qty, norm_unit, conv_factor, unit_flags = _normalise_energy(raw_qty, raw_unit)
        flags.extend(unit_flags)

        # Sanity check: >1M kWh in a single period is suspicious for most sites
        if norm_qty > 1_000_000:
            flags.append({'code': 'UNUSUAL_HIGH', 'message': f'Consumption {norm_qty} kWh seems very high — verify meter', 'severity': 'warning'})

        site = str(row.get('site', '') or '').strip()
        meter_id = str(row.get('meter_id', '') or '').strip()
        location = f"{site} / {meter_id}".strip(' /') or 'Unknown site'

        ef = EMISSION_FACTORS_KG_CO2E.get('electricity')
        co2e = (norm_qty * ef).quantize(Decimal('0.0001')) if ef and norm_qty > 0 else None

        records.append({
            'scope': '2',
            'category': 'electricity',
            'activity_date': activity_date,
            'period_start': period_start,
            'period_end': period_end,
            'location': location,
            'country': '',
            'raw_quantity': raw_qty,
            'raw_unit': raw_unit,
            'raw_description': f"Meter: {meter_id} | Tariff: {row.get('tariff', '')}",
            'quantity_normalised': norm_qty,
            'normalised_unit': norm_unit,
            'conversion_factor': conv_factor,
            'co2e_kg': co2e,
            'emission_factor_used': EMISSION_FACTOR_SOURCE if co2e else '',
            'source_row_id': f"row_{row_num}",
            'flags': flags,
        })

    return records, batch_warnings


# ---------------------------------------------------------------------------
# Parser 3: Corporate Travel (Navan / Concur JSON export)
# ---------------------------------------------------------------------------
# Format choice: JSON export from Navan (formerly TripActions).
# Navan's reporting API returns a trips array; Concur's is nearly identical.
# We handle the common structure: trip with segments (flight, hotel, car, rail).
#
# Key challenge: flight distances are rarely provided — we get origin/destination
# airport codes. We use a hardcoded great-circle distance lookup for the most common
# routes; real deployment would use an airport coordinates DB.
# Short-haul = <3h flight time (proxy: <1000km); long-haul = ≥1000km.

# Major airport pair distances in km (great-circle, not actual flight path)
# Real deployment: full IATA airport DB with lat/lon + haversine
AIRPORT_DISTANCES_KM = {
    frozenset(['LHR', 'CDG']): 344,
    frozenset(['LHR', 'JFK']): 5541,
    frozenset(['LHR', 'SIN']): 10841,
    frozenset(['LHR', 'DXB']): 5488,
    frozenset(['LHR', 'BOM']): 7190,
    frozenset(['LHR', 'HKG']): 9640,
    frozenset(['LHR', 'LAX']): 8757,
    frozenset(['LHR', 'ORD']): 6349,
    frozenset(['LHR', 'FRA']): 634,
    frozenset(['CDG', 'JFK']): 5837,
    frozenset(['CDG', 'SIN']): 10726,
    frozenset(['FRA', 'JFK']): 6200,
    frozenset(['FRA', 'SIN']): 10365,
    frozenset(['JFK', 'LAX']): 3983,
    frozenset(['BOM', 'DXB']): 1927,
    frozenset(['BOM', 'SIN']): 4152,
    frozenset(['DEL', 'LHR']): 6700,
    frozenset(['DEL', 'SIN']): 4150,
    frozenset(['SYD', 'SIN']): 6308,
    frozenset(['SYD', 'LHR']): 16993,
    frozenset(['NRT', 'SIN']): 5316,
    frozenset(['NRT', 'LHR']): 9553,
}
SHORT_HAUL_KM_THRESHOLD = 1500   # DEFRA definition


def _flight_distance_km(origin: str, dest: str):
    """Returns (distance_km, flags)."""
    key = frozenset([origin.upper(), dest.upper()])
    km = AIRPORT_DISTANCES_KM.get(key)
    flags = []
    if km is None:
        # Rough fallback: if same continent (guess by first char) assume short, else long
        km = 800 if origin[0] == dest[0] else 5000
        flags.append({
            'code': 'AIRPORT_DIST_ESTIMATED',
            'message': f'Distance for {origin}-{dest} estimated ({km} km) — no exact data',
            'severity': 'warning',
        })
    return Decimal(str(km)), flags


TRAVEL_SEGMENT_TYPES = {
    'air': 'travel_flight_short',     # overridden by distance
    'flight': 'travel_flight_short',
    'hotel': 'travel_hotel',
    'car': 'travel_car_rental',
    'rail': 'travel_rail',
    'train': 'travel_rail',
    'taxi': 'travel_car_rental',
    'other': 'travel_other',
}


def parse_travel(file_content: str, tenant, batch):
    """
    Parse Navan/Concur JSON export.
    Expected shape: {"trips": [...]} or [...]
    Each trip has a "segments" array or flat fields for single-segment trips.
    """
    records = []
    batch_warnings = []

    try:
        data = json.loads(file_content)
    except json.JSONDecodeError as e:
        return [], [{'code': 'INVALID_JSON', 'message': str(e), 'severity': 'error'}]

    trips = data if isinstance(data, list) else data.get('trips', data.get('data', []))

    for trip_num, trip in enumerate(trips):
        segments = trip.get('segments', [trip])   # fallback: treat trip itself as one segment

        for seg_num, seg in enumerate(segments):
            flags = []

            seg_type_raw = str(seg.get('type', seg.get('segment_type', seg.get('category', 'other')))).lower()
            category = TRAVEL_SEGMENT_TYPES.get(seg_type_raw, 'travel_other')

            # Date
            date_raw = seg.get('departure_date') or seg.get('check_in') or seg.get('date') or trip.get('start_date')
            activity_date = _parse_date(date_raw) or date.today()
            if not _parse_date(date_raw):
                flags.append({'code': 'MISSING_DATE', 'message': 'No segment date found', 'severity': 'warning'})

            traveller = seg.get('traveller_name') or seg.get('employee_name') or trip.get('traveller_name', '')
            cost_centre = seg.get('cost_centre') or seg.get('cost_center') or trip.get('cost_centre', '')

            if category in ('travel_flight_short', 'travel_flight_long'):
                origin = str(seg.get('origin') or seg.get('from') or '').strip().upper()[:3]
                dest = str(seg.get('destination') or seg.get('to') or '').strip().upper()[:3]
                pax = int(seg.get('passengers', seg.get('pax', 1)) or 1)

                if not origin or not dest:
                    flags.append({'code': 'MISSING_AIRPORTS', 'message': 'Origin or destination airport missing', 'severity': 'error'})
                    origin, dest = 'UNK', 'UNK'

                distance_km, dist_flags = _flight_distance_km(origin, dest)
                flags.extend(dist_flags)

                # Classify haul
                if distance_km < SHORT_HAUL_KM_THRESHOLD:
                    category = 'travel_flight_short'
                else:
                    category = 'travel_flight_long'

                total_km = distance_km * pax
                ef = EMISSION_FACTORS_KG_CO2E[category]
                co2e = (total_km * ef).quantize(Decimal('0.0001'))

                records.append({
                    'scope': '3',
                    'category': category,
                    'activity_date': activity_date,
                    'location': f"{origin}→{dest}",
                    'country': '',
                    'raw_quantity': distance_km,
                    'raw_unit': 'km',
                    'raw_description': f"Flight {origin}→{dest} x{pax} pax | {traveller} | CC:{cost_centre}",
                    'quantity_normalised': total_km,
                    'normalised_unit': 'km',
                    'conversion_factor': Decimal(str(pax)),
                    'co2e_kg': co2e,
                    'emission_factor_used': EMISSION_FACTOR_SOURCE,
                    'source_row_id': f"trip_{trip_num}_seg_{seg_num}",
                    'flags': flags,
                })

            elif category == 'travel_hotel':
                nights_raw = seg.get('nights') or seg.get('duration_nights') or 1
                try:
                    nights = int(nights_raw)
                except (ValueError, TypeError):
                    nights = 1
                    flags.append({'code': 'MISSING_NIGHTS', 'message': 'Night count defaulted to 1', 'severity': 'info'})

                ef = EMISSION_FACTORS_KG_CO2E['travel_hotel']
                co2e = (Decimal(str(nights)) * ef).quantize(Decimal('0.0001'))
                hotel_name = seg.get('hotel_name') or seg.get('property') or 'Unknown hotel'
                city = seg.get('city') or seg.get('destination') or ''

                records.append({
                    'scope': '3',
                    'category': 'travel_hotel',
                    'activity_date': activity_date,
                    'location': f"{hotel_name}, {city}".strip(', '),
                    'country': str(seg.get('country', '') or '')[:2].upper(),
                    'raw_quantity': Decimal(str(nights)),
                    'raw_unit': 'nights',
                    'raw_description': f"Hotel: {hotel_name} | {traveller} | CC:{cost_centre}",
                    'quantity_normalised': Decimal(str(nights)),
                    'normalised_unit': 'nights',
                    'conversion_factor': Decimal('1'),
                    'co2e_kg': co2e,
                    'emission_factor_used': EMISSION_FACTOR_SOURCE,
                    'source_row_id': f"trip_{trip_num}_seg_{seg_num}",
                    'flags': flags,
                })

            else:
                # Ground transport (car, rail, taxi)
                distance_raw = seg.get('distance') or seg.get('distance_km') or seg.get('miles')
                unit_raw = str(seg.get('distance_unit', 'km') or 'km').lower()
                distance = _decimal(distance_raw, Decimal('50'))   # 50km default if missing

                if distance_raw is None:
                    flags.append({'code': 'MISSING_DISTANCE', 'message': 'Distance not provided, defaulted to 50km', 'severity': 'warning'})

                if unit_raw in DISTANCE_TO_KM:
                    dist_km = distance * Decimal(str(DISTANCE_TO_KM[unit_raw]))
                else:
                    dist_km = distance

                ef = EMISSION_FACTORS_KG_CO2E.get(category, EMISSION_FACTORS_KG_CO2E['travel_car_rental'])
                co2e = (dist_km * ef).quantize(Decimal('0.0001'))

                records.append({
                    'scope': '3',
                    'category': category,
                    'activity_date': activity_date,
                    'location': str(seg.get('destination') or seg.get('city') or ''),
                    'country': '',
                    'raw_quantity': distance,
                    'raw_unit': unit_raw,
                    'raw_description': f"{seg_type_raw.title()} | {traveller} | CC:{cost_centre}",
                    'quantity_normalised': dist_km,
                    'normalised_unit': 'km',
                    'conversion_factor': Decimal(str(DISTANCE_TO_KM.get(unit_raw, 1))),
                    'co2e_kg': co2e,
                    'emission_factor_used': EMISSION_FACTOR_SOURCE,
                    'source_row_id': f"trip_{trip_num}_seg_{seg_num}",
                    'flags': flags,
                })

    return records, batch_warnings
