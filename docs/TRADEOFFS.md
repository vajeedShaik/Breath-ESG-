# Tradeoffs — Three Things I Deliberately Did Not Build

## 1. Emission Factor Management UI

**What it would be**: A CRUD interface for analysts to maintain emission factors per category, country, and year — so when DEFRA releases updated 2024 factors, they can update them without code changes.

**Why I skipped it**: The prototype uses hardcoded 2023 DEFRA factors. Building a factor management UI correctly requires versioning (historical records need to know which factor was current at the time), effective date logic (factors change annually, mid-year sometimes), and country-level variation. Getting this wrong is worse than not having it — silent factor changes on locked approved records would be an audit disaster.

**What I did instead**: Stored `emission_factor_used` as a string on every record ("DEFRA 2023 GHG Conversion Factors (simplified)") so an auditor knows what was applied. Factors are in a single dict in `parsers.py`, easy to find.

**What it would take to build properly**: 2-3 days minimum. DB table `EmissionFactor(category, country, year, value, source, effective_from, effective_to)`. Factor lookup at parse time. Recompute trigger when factors change. UI for managing entries.

## 2. Multi-File Format Auto-Detection Per Source

**What it would be**: Upload any SAP file — IDoc, flat file, OData snapshot, or custom extract — and have the ingestion layer detect the format and route to the right parser. Same for utility (Green Button XML vs portal CSV vs PDF OCR).

**Why I skipped it**: Auto-detection of binary/semi-structured formats is fragile. IDoc vs CSV vs XML can be distinguished reliably, but distinguishing "our client's SAP export" from "another client's SAP export with different column names" requires per-client configuration that belongs in a mapping layer we don't have yet.

**What I did instead**: One format per source type, clearly documented. The upload UI tells the analyst exactly what format is expected. The parser's header aliasing handles the most common German/English header variations.

**What it would take**: A parser registry with format detectors, per-client column mapping config stored in DB, a validation step before committing records, and a UI for operations to configure new client mappings. Scope: 1-2 weeks.

## 3. Background Job Processing

**What it would be**: File uploads enqueue a Celery task; the HTTP response returns immediately with a batch ID; the frontend polls for completion. Necessary for files with >10K rows, which SAP exports regularly produce.

**Why I skipped it**: Celery requires a message broker (Redis or RabbitMQ), adds infrastructure complexity, and makes local development harder. For the prototype, parsing happens synchronously in the HTTP request. A 5,000-row SAP file parses in under 2 seconds in benchmarks.

**The risk**: An enterprise client with a 50K-row quarterly SAP export would hit an HTTP timeout. The current code uses `bulk_create(batch_size=500)` which handles the DB side efficiently, but the parsing loop is synchronous.

**What it would take**: Celery + Redis, a task status polling endpoint (`/api/batches/<id>/status/`), and a frontend polling loop on the upload page. The batch model already has a `status` field designed for this — `pending -> parsing -> review` maps directly to Celery task states. Scope: 1 day of infrastructure setup.
