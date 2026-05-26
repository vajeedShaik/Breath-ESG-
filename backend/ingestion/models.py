"""
Breathe ESG — Data Models
=========================
Key design decisions:
  - Multi-tenancy via Tenant FK on every data row (row-level isolation)
  - Scope 1/2/3 as enum on EmissionRecord, not inferred at query time
  - Source-of-truth tracked via IngestionBatch (what file, when, parser version)
  - All quantities stored normalised (kWh for energy, kg-CO2e for emissions, litres for fuel)
    plus the original raw value + unit so we can re-derive if factors change
  - Audit trail: every approval/edit written to AuditEvent, rows locked after approval
  - Flags: parser emits structured warnings (unit coercion, missing plant lookup, etc.)
"""

import uuid
from django.db import models
from django.contrib.auth.models import User


class Tenant(models.Model):
    """An enterprise client. All data is scoped to a tenant."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    slug = models.SlugField(unique=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name


class TenantMembership(models.Model):
    """Links a Django user to a tenant with a role."""
    ROLE_CHOICES = [
        ('analyst', 'Analyst'),
        ('admin', 'Admin'),
        ('auditor', 'Auditor (read-only)'),
    ]
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='memberships')
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='memberships')
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default='analyst')

    class Meta:
        unique_together = ('user', 'tenant')


# ---------------------------------------------------------------------------
# Ingestion batch — source-of-truth record for a single file/pull
# ---------------------------------------------------------------------------

class IngestionBatch(models.Model):
    """
    One import run = one batch. Tracks provenance: who uploaded what, when,
    which parser version processed it, and the raw file for re-processing.
    """
    SOURCE_CHOICES = [
        ('sap_fuel', 'SAP Fuel & Procurement'),
        ('utility', 'Utility / Electricity'),
        ('travel', 'Corporate Travel'),
    ]
    STATUS_CHOICES = [
        ('pending', 'Pending parse'),
        ('parsing', 'Parsing'),
        ('review', 'Awaiting review'),
        ('approved', 'Approved'),
        ('failed', 'Failed'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='batches')
    uploaded_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name='batches')
    source_type = models.CharField(max_length=20, choices=SOURCE_CHOICES)
    original_filename = models.CharField(max_length=512)
    file_content = models.TextField(blank=True)   # stored raw for re-parse
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    parser_version = models.CharField(max_length=20, default='1.0')
    row_count = models.IntegerField(default=0)
    error_count = models.IntegerField(default=0)
    warning_count = models.IntegerField(default=0)
    error_detail = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    parsed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.source_type} / {self.original_filename} ({self.status})"


# ---------------------------------------------------------------------------
# Core emission record
# ---------------------------------------------------------------------------

class EmissionRecord(models.Model):
    """
    Normalised emission data row. One row = one activity event or reading.
    
    Scope assignment:
      Scope 1 = direct combustion (SAP fuel: diesel, petrol, natural gas)
      Scope 2 = purchased electricity (utility bills)
      Scope 3 = business travel (flights, hotels, ground transport)
    
    Unit normalisation:
      quantity_normalised always in:
        - energy sources  → kWh
        - fuels           → litres (volume) or kg (solid)
        - electricity     → kWh
        - travel distance → km
      co2e_kg is nullable; populated when an emission factor is applied.
    """
    SCOPE_CHOICES = [
        ('1', 'Scope 1 — Direct'),
        ('2', 'Scope 2 — Electricity'),
        ('3', 'Scope 3 — Value chain'),
    ]
    STATUS_CHOICES = [
        ('pending', 'Pending review'),
        ('approved', 'Approved'),
        ('rejected', 'Rejected'),
        ('edited', 'Edited by analyst'),
    ]
    CATEGORY_CHOICES = [
        # Scope 1
        ('fuel_diesel', 'Diesel'),
        ('fuel_petrol', 'Petrol / Gasoline'),
        ('fuel_natural_gas', 'Natural gas'),
        ('fuel_lpg', 'LPG'),
        ('fuel_other', 'Other fuel'),
        # Scope 2
        ('electricity', 'Grid electricity'),
        # Scope 3 travel
        ('travel_flight_short', 'Flight — short haul (<3h)'),
        ('travel_flight_long', 'Flight — long haul (≥3h)'),
        ('travel_hotel', 'Hotel stay'),
        ('travel_car_rental', 'Car rental / ground'),
        ('travel_rail', 'Rail'),
        ('travel_other', 'Other travel'),
        # Scope 3 procurement
        ('procurement', 'Procurement / supply chain'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='records')
    batch = models.ForeignKey(IngestionBatch, on_delete=models.CASCADE, related_name='records')

    # Scope & category
    scope = models.CharField(max_length=1, choices=SCOPE_CHOICES)
    category = models.CharField(max_length=40, choices=CATEGORY_CHOICES)

    # When
    activity_date = models.DateField()
    period_start = models.DateField(null=True, blank=True)
    period_end = models.DateField(null=True, blank=True)

    # Where
    location = models.CharField(max_length=255, blank=True)   # plant code, address, airport pair
    country = models.CharField(max_length=2, blank=True)      # ISO 3166-1 alpha-2

    # What (raw — preserved exactly as received)
    raw_quantity = models.DecimalField(max_digits=18, decimal_places=4)
    raw_unit = models.CharField(max_length=50)
    raw_description = models.TextField(blank=True)

    # What (normalised — after unit conversion)
    quantity_normalised = models.DecimalField(max_digits=18, decimal_places=4)
    normalised_unit = models.CharField(max_length=20)     # 'kWh', 'litres', 'km', 'nights'
    conversion_factor = models.DecimalField(max_digits=12, decimal_places=6, default=1)

    # Emissions
    co2e_kg = models.DecimalField(max_digits=14, decimal_places=4, null=True, blank=True)
    emission_factor_used = models.CharField(max_length=100, blank=True)

    # Review
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='pending')
    reviewed_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, related_name='reviewed_records'
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    analyst_note = models.TextField(blank=True)

    # Source traceability
    source_row_id = models.CharField(max_length=100, blank=True)   # original row key in source file
    is_locked = models.BooleanField(default=False)                  # set True after batch approval

    # Quality flags (JSON list of {code, message, severity})
    flags = models.JSONField(default=list)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-activity_date', 'category']

    def __str__(self):
        return f"{self.get_scope_display()} / {self.category} / {self.activity_date}"


# ---------------------------------------------------------------------------
# Audit trail — immutable log
# ---------------------------------------------------------------------------

class AuditEvent(models.Model):
    """
    Append-only audit trail. Never updated, never deleted.
    Records every approval, edit, rejection, and lock.
    """
    EVENT_CHOICES = [
        ('batch_uploaded', 'Batch uploaded'),
        ('batch_parsed', 'Batch parsed'),
        ('batch_failed', 'Batch parse failed'),
        ('record_approved', 'Record approved'),
        ('record_rejected', 'Record rejected'),
        ('record_edited', 'Record edited'),
        ('batch_approved', 'Batch approved (all records locked)'),
        ('record_unlocked', 'Record unlocked for correction'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='audit_events')
    actor = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    event_type = models.CharField(max_length=30, choices=EVENT_CHOICES)
    batch = models.ForeignKey(IngestionBatch, on_delete=models.SET_NULL, null=True, blank=True)
    record = models.ForeignKey(EmissionRecord, on_delete=models.SET_NULL, null=True, blank=True)
    detail = models.JSONField(default=dict)   # before/after for edits, error messages, etc.
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']


# ---------------------------------------------------------------------------
# Plant / facility lookup (SAP plant codes → human names)
# ---------------------------------------------------------------------------

class PlantLookup(models.Model):
    """
    SAP uses 4-char plant codes (e.g. '1000', 'DE01'). This table maps them
    to real locations. Missing mappings produce a warning flag, not an error.
    """
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='plants')
    sap_plant_code = models.CharField(max_length=10)
    display_name = models.CharField(max_length=255)
    country = models.CharField(max_length=2, blank=True)
    region = models.CharField(max_length=100, blank=True)

    class Meta:
        unique_together = ('tenant', 'sap_plant_code')

    def __str__(self):
        return f"{self.sap_plant_code} → {self.display_name}"
