# DATA MODEL

## Overview

The data model has five core tables. Every data row is scoped to a **Tenant** — this is the unit of multi-tenancy. A `TenantMembership` links Django users to tenants with roles (analyst, admin, auditor). All queries filter by tenant first.

---

## Tables

### Tenant
The enterprise client. All other tables FK to this.
- `id` UUID PK
- `name` string
- `slug` unique slug (for future subdomain routing)

### TenantMembership
Links a user to a tenant. One user can belong to multiple tenants (future), but the current prototype routes to the first membership.
- `user` FK → Django User
- `tenant` FK → Tenant
- `role` enum: analyst | admin | auditor

### IngestionBatch
One batch = one import run (one file upload or API pull). This is the **source-of-truth** record.
- `id` UUID PK
- `tenant` FK
- `uploaded_by` FK → User (nullable, SET_NULL on delete)
- `source_type` enum: sap_fuel | utility | travel
- `original_filename` — preserved exactly as received
- `file_content` TextField — raw bytes stored for re-parse if emission factors change
- `status` enum: pending → parsing → review → approved | failed
- `parser_version` — so we know which parser logic produced the records
- `row_count`, `error_count`, `warning_count` — summary stats
- `error_detail` — batch-level parse failure message
- `created_at`, `parsed_at`

**Why store raw file content?** Emission factors change. DEFRA publishes new GHG conversion factors annually. If we need to re-derive CO₂e from the original activity data without asking the client to re-upload, we can re-run the parser against `file_content`.

### EmissionRecord
One normalised activity row. The core entity.

**Scope assignment** (hardcoded by source type + material category):
- Scope 1: SAP fuel combustion records (diesel, petrol, natural gas, LPG)
- Scope 2: Utility electricity consumption
- Scope 3: Corporate travel (flights, hotels, ground transport) and SAP procurement

**Quantity fields — two tiers:**

| Field | Purpose |
|---|---|
| `raw_quantity` + `raw_unit` | Exactly as received — never modified |
| `quantity_normalised` + `normalised_unit` | After unit conversion (kWh, litres, km, nights) |
| `conversion_factor` | The multiplier used, so the normalisation is auditable |

**Why keep raw?** The original value + unit is the audit evidence. An auditor needs to trace from the CO₂e figure back to the source document. If we only store the normalised value, that chain is broken.

**Emissions:**
- `co2e_kg` — computed at ingest using static DEFRA 2023 factors; nullable (some procurement rows have no factor)
- `emission_factor_used` — string describing the factor source and version

**Review lifecycle:**
- `status`: pending → approved | rejected | edited
- `reviewed_by`, `reviewed_at` — who approved/rejected and when
- `analyst_note` — free-text comment for auditor
- `is_locked` — set True after batch-level approval; prevents further edits

**Source traceability:**
- `batch` FK — which import produced this row
- `source_row_id` — original row identifier in source file (e.g. `row_42`)
- `flags` JSONField — structured list of `{code, message, severity}` objects

**Flag severities:**
- `error` — data is probably wrong or missing (missing date, unknown unit)
- `warning` — data is usable but needs analyst attention (estimated airport distance, unknown plant code)
- `info` — normalisation note (natural gas converted via 10.55 kWh/m³)

### AuditEvent
Append-only audit trail. Never updated or deleted.
- `id` UUID PK
- `tenant`, `actor` FK
- `event_type` enum (batch_uploaded, batch_parsed, record_approved, record_edited, etc.)
- `batch`, `record` nullable FKs — link the event to the object it describes
- `detail` JSONField — before/after values for edits, error messages, row counts

### PlantLookup
SAP plant codes (e.g. `1000`, `DE01`) mapped to human-readable names and countries. Missing lookups produce a `UNKNOWN_PLANT` warning flag, not an error — we preserve the raw code.

---

## Design decisions

**UUID PKs everywhere** — avoids sequential ID leakage across tenants and is safe to expose in URLs.

**Multi-tenancy as FK, not schema separation** — simpler to operate for a prototype. Schema-per-tenant (Postgres schemas) is the right call at scale but adds significant migration and connection-pool complexity.

**Scope 1/2/3 stored on the record, not computed at query time** — the classification logic lives in the parser and the result is persisted. This means the scope label is stable even if we change the classification rules later (old records keep their original scope). A re-classification would be a new batch, not a migration.

**Flags as JSONField, not a separate table** — flags are generated at parse time and don't change after that (unless the record is re-parsed). A separate `RecordFlag` table would be cleaner for querying but adds a join to every record fetch. Given the read pattern (load all flags for a record in the review UI), JSONField is the right tradeoff at prototype scale.

**`is_locked` as a boolean, not a status** — status tracks the review workflow (pending → approved → edited). `is_locked` tracks whether the record is frozen for audit. They're orthogonal: an approved record can be unlocked for correction (audit event written), while a rejected record is still locked if it was locked before rejection.

**`file_content` as TextField, not FileField** — avoids S3/media storage configuration for the prototype. In production this would be a FileField pointing to S3 with server-side encryption.
