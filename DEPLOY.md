# Deployment Guide — Railway (Recommended)

## One-service deployment (Django serves React build)

The frontend is pre-built into `backend/frontend_build/`. Django serves the API at `/api/*`
and the React SPA at all other routes.

### Steps

1. Push to GitHub (private repo, share with saurav/rahul/shivang @breatheesg.com)

2. Create a Railway project, connect the GitHub repo

3. Set the root directory to `backend/`

4. Add these environment variables in Railway:
   ```
   SECRET_KEY=<generate with: python -c "import secrets; print(secrets.token_urlsafe(50))">
   DEBUG=False
   ALLOWED_HOSTS=your-app.up.railway.app
   ```

5. Railway auto-detects the `Procfile`:
   ```
   web: gunicorn breathe_esg.wsgi --workers 2 --bind 0.0.0.0:$PORT --timeout 60
   ```

6. Add a release command in Railway settings:
   ```
   python manage.py migrate && python seed_data.py
   ```

7. Deploy. Visit `https://your-app.up.railway.app` — login with `analyst / demo1234`

## Alternative: Render

- Create a Web Service, root dir = `backend/`
- Build command: `pip install -r requirements.txt`
- Start command: `gunicorn breathe_esg.wsgi --workers 2 --bind 0.0.0.0:$PORT`
- Same env vars as above
- Add a one-time `python manage.py migrate && python seed_data.py` via Render Shell

## Upgrading to Postgres (production-ready)

In Railway, add a Postgres plugin. Then update settings.py:
```python
import dj_database_url
DATABASES = {'default': dj_database_url.config(conn_max_age=600)}
```
Add `dj-database-url` to requirements.txt.
