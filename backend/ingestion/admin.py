from django.contrib import admin
from .models import Tenant, TenantMembership, IngestionBatch, EmissionRecord, AuditEvent, PlantLookup


@admin.register(Tenant)
class TenantAdmin(admin.ModelAdmin):
    list_display = ['name', 'slug', 'created_at']
    search_fields = ['name', 'slug']


@admin.register(TenantMembership)
class TenantMembershipAdmin(admin.ModelAdmin):
    list_display = ['user', 'tenant', 'role']
    list_filter = ['role', 'tenant']


@admin.register(IngestionBatch)
class IngestionBatchAdmin(admin.ModelAdmin):
    list_display = ['original_filename', 'source_type', 'status', 'row_count', 'error_count', 'warning_count', 'uploaded_by', 'created_at']
    list_filter = ['source_type', 'status', 'tenant']
    search_fields = ['original_filename']
    readonly_fields = ['id', 'created_at', 'parsed_at']


@admin.register(EmissionRecord)
class EmissionRecordAdmin(admin.ModelAdmin):
    list_display = ['scope', 'category', 'activity_date', 'location', 'quantity_normalised', 'normalised_unit', 'co2e_kg', 'status', 'is_locked']
    list_filter = ['scope', 'category', 'status', 'is_locked', 'tenant']
    search_fields = ['location', 'raw_description', 'source_row_id']
    readonly_fields = ['id', 'created_at', 'updated_at', 'batch', 'source_row_id']


@admin.register(AuditEvent)
class AuditEventAdmin(admin.ModelAdmin):
    list_display = ['event_type', 'actor', 'tenant', 'created_at']
    list_filter = ['event_type', 'tenant']
    readonly_fields = ['id', 'created_at', 'tenant', 'actor', 'event_type', 'batch', 'record', 'detail']

    def has_add_permission(self, request):
        return False  # Audit log is append-only

    def has_delete_permission(self, request, obj=None):
        return False  # Never delete audit events


@admin.register(PlantLookup)
class PlantLookupAdmin(admin.ModelAdmin):
    list_display = ['sap_plant_code', 'display_name', 'country', 'region', 'tenant']
    list_filter = ['tenant', 'country']
    search_fields = ['sap_plant_code', 'display_name']
