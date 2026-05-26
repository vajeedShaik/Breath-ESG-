# Data Model — Breathe ESG Prototype

## Overview

The core design question: where does the "source of truth" live, and how do you trace any approved CO2e figure back to the exact byte in the original file?

This model answers that with three layers:
1. **IngestionBatch** — provenance record per file import
2. **EmissionRecord** — one normalised row per activity event
3. **AuditEvent** — append-only action log

## Multi-tenancy

Every data table carries a `tenant` FK. All queries filter by the authenticated user's `TenantMembership`. No shared data between tenants.

I chose **row-level tenancy over schema-per-tenant** for the prototype:
- Simpler to deploy (single DB, single migration set)
- Django ORM handles filtering naturally

Downside: a miscoded query could leak cross-tenant data. Mitigation: every view resolves tenant from the authenticated user, not from a forgeable request parameter. In production: a custom manager that auto-applies tenant scoping.

## Scope 1 / 2 / 3

| Scope | Definition | Sources |
|-------|-----------|---------|
| 1 | Direct combustion | SAP fuel: diesel, petrol, natural gas, LPG |
| 2 | Purchased electricity | Utility portal CSV |
| 3 | Value chain | Corporate travel; SAP procurement fallback |

Scope is a stored field on EmissionRecord, not derived at query time. If classification logic changes, old records keep their original scope unless explicitly re-parsed. This is intentional — it prevents silent re-classification of historical approved data.

## Unit Normalisation

Raw values are preserved exactly (`raw_quantity`, `raw_unit`). Normalised values stored separately (`quantity_normalised`, `normalised_unit`, `conversion_factor`).

Normalised units:
- Fuel volume: litres (diesel, petrol, LPG)
- Natural gas: kWh (via 10.55 kWh/m3 HHCV)
- Electricity: kWh
- Travel: km (per-passenger for flights), nights (hotels)

Note: natural gas must be checked before volume units in the normalisation function — m3 appears in both VOLUME_TO_LITRES (as 1000 L) and GAS_TO_M3 (for kWh conversion). Without explicit ordering, gas would be incorrectly stored as litres.

## Source-of-Truth Tracking

IngestionBatch records: filename, uploader, parse time, parser version, row/error/warning counts, and the full raw file content. This allows re-parsing against updated parsers or emission factors without needing the original file re-uploaded.

Each EmissionRecord carries `source_row_id` (position in original file) and `batch` FK, so any approved figure can be traced back to its origin.

## Audit Trail

AuditEvent is append-only. Edit events store full before/after serialisation in `detail` JSON, enabling field-level diff reconstruction. Records are never updated or deleted from this table.

## Quality Flags

Each EmissionRecord has a `flags` JSON array with structured entries:
```json
{"code": "UNKNOWN_PLANT", "message": "...", "severity": "warning"}
```

Flags persist even after analyst approval. This was deliberate: removing flags on approval would hide the fact that the data had an issue from the auditor. The analyst's approval note explains why they accepted it despite the flag.

## Entity Relationships

```
Tenant
  |-- TenantMembership --> User
  |-- PlantLookup (SAP plant code -> display name, country)
  |-- IngestionBatch
  |     `-- EmissionRecord (many, scoped to batch)
  `-- AuditEvent (references Batch and/or Record, actor is User)
```
