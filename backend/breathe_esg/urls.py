from django.contrib import admin
from django.urls import path, include, re_path
from django.views.generic import TemplateView
from django.conf import settings
import os

# Point templates to the built frontend
settings.TEMPLATES[0]['DIRS'] = [os.path.join(settings.BASE_DIR, 'frontend_build')]

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include('ingestion.urls')),
    path('api/auth/', include('accounts.urls')),
    # SPA catch-all — must be last
    re_path(r'^(?!api/).*$', TemplateView.as_view(template_name='index.html'), name='frontend'),
]
