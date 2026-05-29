# TRADEOFFS

Three things I deliberately did not build, and why.

---

## 1. Async task queue (Celery + Redis)

**What it is:** Running file parsing in a background worker instead of synchronously in the HTTP request handler.

**Why I didn't build it:** It adds significant infrastructure (Redis, Celery worker process, beat scheduler) and deployment complexity. For the prototype's file sizes — a typical SAP export is a few hundred to a few thousand rows — synchronous parsing in Django's request/response cycle is fast enough (under a second). The UX shows a loading state during the POST and redirects on completion.

**Why it matters in production:** An enterprise SAP export for a full year can be 50,000–200,000 rows. Parsing that synchronously would hit Gunicorn's worker timeout (30s default). The right architecture is: (1) upload returns immediately with a batch ID, (2) a Celery task does the parsing, (3) the frontend polls `GET /api/batches/{id}/` until status changes from `parsing` to `review`. The model and batch status enum already support this — `status: parsing` is the placeholder. Adding Celery is a deployment decision, not a model redesign.

---

## 2. Emission factor management UI

**What it is:** A UI for admins to view, update, and version emission factors — without a code deploy.

**Why I didn't build it:** The factors are currently hardcoded in `parsers.py`. Building a factors management UI requires: an `EmissionFactor` DB table with versioning, an admin CRUD interface, logic to re-derive `co2e_kg` on all locked records when a factor is updated, and an audit trail for factor changes. That's a feature in itself.

**Why it matters in production:** DEFRA publishes new factors every June. A carbon platform that requires a code deploy to update emission factors is operationally broken. Analysts need to be able to apply new factors, see which records used old factors, and trigger a re-computation. The `emission_factor_used` field on `EmissionRecord` is designed to make this traceable — it stores the factor source and version as a string. The model is ready for the feature; I just didn't build the UI.

---

## 3. SSO / enterprise authentication (Okta, Azure AD, Google Workspace)

**What it is:** Delegating authentication to the client's identity provider instead of managing usernames and passwords.

**Why I didn't build it:** django-allauth with SAML2 or OIDC is a two-day integration requiring a test IdP, redirect URI configuration, and careful session management. The assignment asks for a working prototype in four days.

**Why it matters in production:** No enterprise will give their sustainability team credentials to a third-party app. They will require SSO via their existing IdP (usually Azure AD for large corporates, Okta for tech companies, Google Workspace for SMEs). Without SSO, onboarding is blocked at the IT security review. The JWT auth we have is the right internal mechanism — it just needs to be issued by the IdP's OIDC callback rather than a username/password login. The `TenantMembership` model supports this: the Django user would be created on first SSO login and linked to the tenant.
