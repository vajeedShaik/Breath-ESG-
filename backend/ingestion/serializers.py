from rest_framework import serializers
from .models import Tenant, IngestionBatch, EmissionRecord, AuditEvent, PlantLookup


class TenantSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tenant
        fields = ['id', 'name', 'slug']


class IngestionBatchSerializer(serializers.ModelSerializer):
    uploaded_by_name = serializers.SerializerMethodField()
    source_type_display = serializers.CharField(source='get_source_type_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)

    class Meta:
        model = IngestionBatch
        fields = [
            'id', 'source_type', 'source_type_display', 'original_filename',
            'status', 'status_display', 'row_count', 'error_count', 'warning_count',
            'error_detail', 'uploaded_by_name', 'created_at', 'parsed_at', 'parser_version',
        ]

    def get_uploaded_by_name(self, obj):
        if obj.uploaded_by:
            return obj.uploaded_by.get_full_name() or obj.uploaded_by.username
        return None


class EmissionRecordSerializer(serializers.ModelSerializer):
    scope_display = serializers.CharField(source='get_scope_display', read_only=True)
    category_display = serializers.CharField(source='get_category_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    batch_filename = serializers.CharField(source='batch.original_filename', read_only=True)
    flag_count = serializers.SerializerMethodField()
    has_errors = serializers.SerializerMethodField()

    class Meta:
        model = EmissionRecord
        fields = [
            'id', 'scope', 'scope_display', 'category', 'category_display',
            'activity_date', 'period_start', 'period_end',
            'location', 'country',
            'raw_quantity', 'raw_unit', 'raw_description',
            'quantity_normalised', 'normalised_unit', 'conversion_factor',
            'co2e_kg', 'emission_factor_used',
            'status', 'status_display', 'analyst_note', 'is_locked',
            'source_row_id', 'flags', 'flag_count', 'has_errors',
            'batch', 'batch_filename',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'batch', 'source_row_id', 'is_locked', 'created_at']

    def get_flag_count(self, obj):
        return len(obj.flags)

    def get_has_errors(self, obj):
        return any(f.get('severity') == 'error' for f in obj.flags)


class AuditEventSerializer(serializers.ModelSerializer):
    actor_name = serializers.SerializerMethodField()
    event_type_display = serializers.CharField(source='get_event_type_display', read_only=True)

    class Meta:
        model = AuditEvent
        fields = ['id', 'event_type', 'event_type_display', 'actor_name', 'detail', 'created_at']

    def get_actor_name(self, obj):
        if obj.actor:
            return obj.actor.get_full_name() or obj.actor.username
        return 'System'
