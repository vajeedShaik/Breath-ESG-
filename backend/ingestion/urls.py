from django.urls import path
from . import views

urlpatterns = [
    path('ingest/', views.IngestView.as_view(), name='ingest'),
    path('batches/', views.BatchListView.as_view(), name='batch-list'),
    path('batches/<uuid:pk>/', views.BatchDetailView.as_view(), name='batch-detail'),
    path('batches/<uuid:pk>/approve/', views.BatchApproveView.as_view(), name='batch-approve'),
    path('records/', views.RecordListView.as_view(), name='record-list'),
    path('records/<uuid:pk>/', views.RecordDetailView.as_view(), name='record-detail'),
    path('records/<uuid:pk>/approve/', views.RecordApproveView.as_view(), name='record-approve'),
    path('records/<uuid:pk>/reject/', views.RecordRejectView.as_view(), name='record-reject'),
    path('dashboard/', views.dashboard_summary, name='dashboard'),
    path('audit/', views.AuditLogView.as_view(), name='audit-log'),
    path('export/', views.export_csv, name='export-csv'),
]
