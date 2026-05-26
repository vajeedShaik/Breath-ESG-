"""
Breathe ESG — API Views
=======================
All endpoints are tenant-scoped. The tenant is resolved from the authenticated
user's TenantMembership. For this prototype a user belongs to exactly one tenant
(multi-tenant routing can be added later via subdomain or request header).
"""

import csv
import io
import json
from datetime import datetime
from decimal import Decimal
from django.http import HttpResponse
from django.utils import timezone
from rest_framework import generics, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Tenant, TenantMembership, IngestionBatch, EmissionRecord, AuditEvent, PlantLookup
from .serializers import (
    TenantSerializer, IngestionBatchSerializer,
    EmissionRecordSerializer, AuditEventSerializer,
)
from .parsers import parse_sap, parse_utility, parse_travel


def get_tenant(request):
    membership = TenantMembership.objects.filter(user=request.user).select_related('tenant').first()
    return membership.tenant if membership else None


def write_audit(tenant, actor, event_type, batch=None, record=None, detail=None):
    AuditEvent.objects.create(
        tenant=tenant, actor=actor, event_type=event_type,
        batch=batch, record=record, detail=detail or {},
    )


# ---------------------------------------------------------------------------
# Upload & ingest
# ---------------------------------------------------------------------------

PARSERS = {
    'sap_fuel': parse_sap,
    'utility': parse_utility,
    'travel': parse_travel,
}


class IngestView(APIView):
    """POST /api/ingest/ — upload a file and trigger parsing."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        tenant = get_tenant(request)
        if not tenant:
            return Response({'detail': 'No tenant found for user'}, status=400)

        source_type = request.data.get('source_type')
        if source_type not in PARSERS:
            return Response({'detail': f'source_type must be one of {list(PARSERS)}'}, status=400)

        uploaded_file = request.FILES.get('file')
        if not uploaded_file:
            # Also accept raw JSON body (for travel)
            raw_content = request.data.get('content', '')
            filename = request.data.get('filename', 'paste.json')
        else:
            raw_content = uploaded_file.read().decode('utf-8', errors='replace')
            filename = uploaded_file.name

        if not raw_content.strip():
            return Response({'detail': 'No file content received'}, status=400)

        batch = IngestionBatch.objects.create(
            tenant=tenant,
            uploaded_by=request.user,
            source_type=source_type,
            original_filename=filename,
            file_content=raw_content,
            status='parsing',
        )
        write_audit(tenant, request.user, 'batch_uploaded', batch=batch,
                    detail={'filename': filename, 'source_type': source_type})

        try:
            parser = PARSERS[source_type]
            record_dicts, batch_warnings = parser(raw_content, tenant, batch)
        except Exception as e:
            batch.status = 'failed'
            batch.error_detail = str(e)
            batch.save()
            write_audit(tenant, request.user, 'batch_failed', batch=batch, detail={'error': str(e)})
            return Response({'detail': f'Parse error: {e}', 'batch_id': str(batch.id)}, status=422)

        # Bulk-create records
        to_create = []
        error_count = 0
        warning_count = 0

        for rd in record_dicts:
            flags = rd.pop('flags', [])
            errs = sum(1 for f in flags if f.get('severity') == 'error')
            warns = sum(1 for f in flags if f.get('severity') == 'warning')
            error_count += min(errs, 1)
            warning_count += min(warns, 1)
            to_create.append(EmissionRecord(
                tenant=tenant, batch=batch, flags=flags, **rd
            ))

        EmissionRecord.objects.bulk_create(to_create, batch_size=500)

        batch.status = 'review'
        batch.row_count = len(to_create)
        batch.error_count = error_count
        batch.warning_count = warning_count
        batch.parsed_at = timezone.now()
        batch.save()

        write_audit(tenant, request.user, 'batch_parsed', batch=batch,
                    detail={'rows': len(to_create), 'errors': error_count, 'warnings': warning_count})

        return Response(IngestionBatchSerializer(batch).data, status=201)


# ---------------------------------------------------------------------------
# Batches
# ---------------------------------------------------------------------------

class BatchListView(generics.ListAPIView):
    serializer_class = IngestionBatchSerializer

    def get_queryset(self):
        tenant = get_tenant(self.request)
        qs = IngestionBatch.objects.filter(tenant=tenant)
        source = self.request.query_params.get('source_type')
        if source:
            qs = qs.filter(source_type=source)
        return qs


class BatchDetailView(generics.RetrieveAPIView):
    serializer_class = IngestionBatchSerializer

    def get_queryset(self):
        return IngestionBatch.objects.filter(tenant=get_tenant(self.request))


class BatchApproveView(APIView):
    """POST /api/batches/<id>/approve/ — lock all records in a batch."""

    def post(self, request, pk):
        tenant = get_tenant(request)
        try:
            batch = IngestionBatch.objects.get(pk=pk, tenant=tenant)
        except IngestionBatch.DoesNotExist:
            return Response({'detail': 'Not found'}, status=404)

        count = EmissionRecord.objects.filter(batch=batch, status='pending').update(
            status='approved', reviewed_by=request.user, reviewed_at=timezone.now(), is_locked=True
        )
        batch.status = 'approved'
        batch.save()
        write_audit(tenant, request.user, 'batch_approved', batch=batch,
                    detail={'locked_rows': count})
        return Response({'locked': count, 'batch_status': 'approved'})


# ---------------------------------------------------------------------------
# Records (review queue)
# ---------------------------------------------------------------------------

class RecordListView(generics.ListAPIView):
    serializer_class = EmissionRecordSerializer

    def get_queryset(self):
        tenant = get_tenant(self.request)
        qs = EmissionRecord.objects.filter(tenant=tenant).select_related('batch')
        batch_id = self.request.query_params.get('batch')
        scope = self.request.query_params.get('scope')
        record_status = self.request.query_params.get('status')
        flagged = self.request.query_params.get('flagged')

        if batch_id:
            qs = qs.filter(batch_id=batch_id)
        if scope:
            qs = qs.filter(scope=scope)
        if record_status:
            qs = qs.filter(status=record_status)
        if flagged == '1':
            # Records with at least one warning or error flag
            qs = [r for r in qs if r.flags]
            return qs
        return qs


class RecordDetailView(generics.RetrieveUpdateAPIView):
    serializer_class = EmissionRecordSerializer

    def get_queryset(self):
        return EmissionRecord.objects.filter(tenant=get_tenant(self.request))

    def update(self, request, *args, **kwargs):
        record = self.get_object()
        if record.is_locked:
            return Response({'detail': 'Record is locked after approval'}, status=403)

        old_data = EmissionRecordSerializer(record).data
        response = super().update(request, *args, **kwargs)
        record.refresh_from_db()
        record.status = 'edited'
        record.save()

        write_audit(get_tenant(request), request.user, 'record_edited',
                    record=record,
                    detail={'before': old_data, 'after': EmissionRecordSerializer(record).data})
        return response


class RecordApproveView(APIView):
    def post(self, request, pk):
        tenant = get_tenant(request)
        try:
            record = EmissionRecord.objects.get(pk=pk, tenant=tenant)
        except EmissionRecord.DoesNotExist:
            return Response({'detail': 'Not found'}, status=404)

        if record.is_locked:
            return Response({'detail': 'Already locked'}, status=400)

        record.status = 'approved'
        record.reviewed_by = request.user
        record.reviewed_at = timezone.now()
        record.analyst_note = request.data.get('note', record.analyst_note)
        record.save()
        write_audit(tenant, request.user, 'record_approved', record=record)
        return Response(EmissionRecordSerializer(record).data)


class RecordRejectView(APIView):
    def post(self, request, pk):
        tenant = get_tenant(request)
        try:
            record = EmissionRecord.objects.get(pk=pk, tenant=tenant)
        except EmissionRecord.DoesNotExist:
            return Response({'detail': 'Not found'}, status=404)
        if record.is_locked:
            return Response({'detail': 'Record is locked'}, status=400)
        record.status = 'rejected'
        record.analyst_note = request.data.get('note', '')
        record.reviewed_by = request.user
        record.reviewed_at = timezone.now()
        record.save()
        write_audit(tenant, request.user, 'record_rejected', record=record,
                    detail={'note': record.analyst_note})
        return Response({'status': 'rejected'})


# ---------------------------------------------------------------------------
# Dashboard summary
# ---------------------------------------------------------------------------

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def dashboard_summary(request):
    tenant = get_tenant(request)
    if not tenant:
        return Response({'detail': 'No tenant'}, status=400)

    records = EmissionRecord.objects.filter(tenant=tenant)

    total_co2e = sum(
        float(r.co2e_kg) for r in records if r.co2e_kg
    )

    scope_breakdown = {}
    for scope in ['1', '2', '3']:
        scope_records = records.filter(scope=scope)
        scope_breakdown[scope] = {
            'count': scope_records.count(),
            'co2e_kg': float(sum(r.co2e_kg for r in scope_records if r.co2e_kg) or 0),
        }

    pending_count = records.filter(status='pending').count()
    flagged_count = sum(1 for r in records if r.flags)
    approved_count = records.filter(status='approved').count()

    recent_batches = IngestionBatch.objects.filter(tenant=tenant)[:5]

    return Response({
        'tenant': TenantSerializer(tenant).data,
        'total_co2e_kg': round(total_co2e, 2),
        'total_co2e_tonnes': round(total_co2e / 1000, 4),
        'total_records': records.count(),
        'pending_review': pending_count,
        'flagged': flagged_count,
        'approved': approved_count,
        'scope_breakdown': scope_breakdown,
        'recent_batches': IngestionBatchSerializer(recent_batches, many=True).data,
    })


# ---------------------------------------------------------------------------
# Audit log
# ---------------------------------------------------------------------------

class AuditLogView(generics.ListAPIView):
    serializer_class = AuditEventSerializer

    def get_queryset(self):
        return AuditEvent.objects.filter(tenant=get_tenant(self.request))


# ---------------------------------------------------------------------------
# Export (locked records → CSV for auditors)
# ---------------------------------------------------------------------------

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def export_csv(request):
    tenant = get_tenant(request)
    records = EmissionRecord.objects.filter(tenant=tenant, is_locked=True).select_related('batch')

    response = HttpResponse(content_type='text/csv')
    response['Content-Disposition'] = f'attachment; filename="breathe_esg_export_{datetime.now().strftime("%Y%m%d")}.csv"'

    writer = csv.writer(response)
    writer.writerow([
        'Record ID', 'Scope', 'Category', 'Activity Date', 'Location', 'Country',
        'Raw Quantity', 'Raw Unit', 'Normalised Quantity', 'Normalised Unit',
        'CO2e (kg)', 'Emission Factor Source', 'Status', 'Analyst Note',
        'Source File', 'Source Row', 'Approved At',
    ])

    for r in records:
        writer.writerow([
            str(r.id), r.scope, r.category, r.activity_date, r.location, r.country,
            r.raw_quantity, r.raw_unit, r.quantity_normalised, r.normalised_unit,
            r.co2e_kg, r.emission_factor_used, r.status, r.analyst_note,
            r.batch.original_filename, r.source_row_id,
            r.reviewed_at.isoformat() if r.reviewed_at else '',
        ])

    return response
