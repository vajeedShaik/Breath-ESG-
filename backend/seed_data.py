"""
Seed script: creates demo tenant, users, plant lookups, and sample ingestion files
so the app can be demoed immediately after deployment.
"""
import os, sys, django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'breathe_esg.settings')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
django.setup()

from django.contrib.auth.models import User
from ingestion.models import Tenant, TenantMembership, PlantLookup

# Create tenant
tenant, _ = Tenant.objects.get_or_create(name='Acme Manufacturing Ltd', slug='acme')
print(f"Tenant: {tenant}")

# Create users
analyst, _ = User.objects.get_or_create(username='analyst')
analyst.set_password('demo1234')
analyst.first_name = 'Sarah'
analyst.last_name = 'Chen'
analyst.save()
TenantMembership.objects.get_or_create(user=analyst, tenant=tenant, defaults={'role': 'analyst'})

admin_user, _ = User.objects.get_or_create(username='admin')
admin_user.set_password('demo1234')
admin_user.first_name = 'James'
admin_user.last_name = 'Park'
admin_user.is_staff = True
admin_user.save()
TenantMembership.objects.get_or_create(user=admin_user, tenant=tenant, defaults={'role': 'admin'})

# Plant lookup table
plants = [
    ('1000', 'Acme London HQ',       'GB', 'South East England'),
    ('2000', 'Acme Manchester Plant', 'GB', 'North West England'),
    ('3000', 'Acme Frankfurt Hub',    'DE', 'Hesse'),
    ('DE01', 'Acme Berlin Office',    'DE', 'Berlin'),
    ('US10', 'Acme New York Office',  'US', 'New York'),
    ('IN01', 'Acme Mumbai Office',    'IN', 'Maharashtra'),
]
for code, name, country, region in plants:
    PlantLookup.objects.get_or_create(
        tenant=tenant, sap_plant_code=code,
        defaults={'display_name': name, 'country': country, 'region': region}
    )
    print(f"  Plant {code}: {name}")

print("\n✅ Seed complete.")
print("  Login: analyst / demo1234")
print("  Login: admin   / demo1234")

# Create Django superuser for /admin access
if not User.objects.filter(is_superuser=True).exists():
    su = User.objects.create_superuser('superadmin', 'admin@breatheesg.com', 'admin1234')
    print("Superuser created: superadmin / admin1234")
else:
    print("Superuser already exists")
