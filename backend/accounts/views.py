from django.contrib.auth.models import User
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken
from ingestion.models import TenantMembership, Tenant


@api_view(['POST'])
@permission_classes([AllowAny])
def login_view(request):
    from django.contrib.auth import authenticate
    username = request.data.get('username')
    password = request.data.get('password')
    user = authenticate(username=username, password=password)
    if not user:
        return Response({'detail': 'Invalid credentials'}, status=401)
    refresh = RefreshToken.for_user(user)
    membership = TenantMembership.objects.filter(user=user).select_related('tenant').first()
    return Response({
        'access': str(refresh.access_token),
        'refresh': str(refresh),
        'user': {
            'id': user.id,
            'username': user.username,
            'name': user.get_full_name() or user.username,
            'email': user.email,
        },
        'tenant': {
            'id': str(membership.tenant.id),
            'name': membership.tenant.name,
            'role': membership.role,
        } if membership else None,
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def me(request):
    membership = TenantMembership.objects.filter(user=request.user).select_related('tenant').first()
    return Response({
        'user': {
            'id': request.user.id,
            'username': request.user.username,
            'name': request.user.get_full_name() or request.user.username,
        },
        'tenant': {
            'id': str(membership.tenant.id),
            'name': membership.tenant.name,
            'role': membership.role,
        } if membership else None,
    })
