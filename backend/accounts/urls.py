from django.urls import path
from . import views
from rest_framework_simplejwt.views import TokenRefreshView

urlpatterns = [
    path('login/', views.login_view, name='login'),
    path('me/', views.me, name='me'),
    path('token/refresh/', TokenRefreshView.as_view(), name='token-refresh'),
]
