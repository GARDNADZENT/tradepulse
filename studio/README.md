# TradersPulse Site Studio — Multi-Site SaaS Control Plane

`studio/` is the standalone **Multi-Site Control Plane** (modeled on `dforge.site`) that provisions and governs unlimited white-label `TradersPulse` Deriv trading sites from a single deployment.

## Architecture Overview

1. **Control Plane (`studio/` — e.g. `studio.traderspulse.site`)**
   - Public SaaS Operator Sign-Up / Sign-In (Supabase Email/Password + Google OAuth) with strict Row-Level Security (`owner_id = auth.uid()`).
   - **Super-Admin Governance** (`role = 'super_admin'`): view all operators' sites, manage global pooled Deriv OAuth `app_id`, configure commission share %, and suspend/activate any site in real time.
   - **5-Tab Visual Site Configurator**: Branding & Theme, 13 Feature Tabs Switchboard, Deriv OAuth (Tier 1 Pooled Instant vs Tier 2 Custom `app_id`) & Affiliate Referral Link, `.xml` Bot Library Uploader, and Custom Domain + Auto-SSL (`/api/domains` Vercel REST API proxy).
   - **Live Embedded Preview**: Streams real-time edits via `postMessage` into the `TradersPulse` tenant runtime before publishing.

2. **Multi-Tenant Trading Runtime (`/` repo root — e.g. `app.traderspulse.site` + `*.yourdomain.com`)**
   - Resolves the active site at boot via `window.location.hostname` (`managed_sites.custom_domain`), `?site=<slug>`, or Studio `postMessage`.
   - Dynamically hydrates `--brand-primary`, brand name, logo/favicon, enabled 13 tabs, Deriv OAuth `app_id` & affiliate signup URL, social channels, custom XML bots, and suspension/maintenance gates—with 100% fallback to default `TradersPulse` when accessed directly.

---

## Step 1: Run Supabase Multi-Tenant Schema

Open the Supabase SQL Editor and run:

```sql
-- Execute /supabase/multi-tenant-studio.sql
```

To promote your account to **Super-Admin** after signing up:

```sql
update public.studio_profiles
set role = 'super_admin'
where email = 'your-email@domain.com';
```

---

## Step 2: Deploy Tenant Runtime (Root App) on Vercel

Create Vercel Project #1 pointing to the repository root (`/`):
- `SUPABASE_URL` = your Supabase project URL
- `SUPABASE_PUBLISHABLE_KEY` = your Supabase anon/publishable key
- `NEXT_PUBLIC_DERIV_APP_ID` = your fallback Deriv OAuth App ID

Copy its Vercel **Project ID** (`prj_...`) and production URL (e.g. `https://app.traderspulse.site`).

---

## Step 3: Deploy Site Studio (`studio/`) on Vercel

Create Vercel Project #2 from the same repo with **Root Directory = `studio`**:
- `SUPABASE_URL` = your Supabase project URL
- `SUPABASE_PUBLISHABLE_KEY` = your Supabase anon/publishable key
- `STUDIO_TENANT_RUNTIME_URL` = `https://app.traderspulse.site`
- `STUDIO_POOLED_DERIV_APP_ID` = your pooled Deriv OAuth App ID
- `STUDIO_BASE_DOMAIN` = `traderspulse.site`
- `VERCEL_API_TOKEN` = Vercel Access Token (for automatic custom domain + Let's Encrypt SSL attachment)
- `VERCEL_TENANT_PROJECT_ID` = Project ID (`prj_...`) of Vercel Project #1

---

## Local Development

From the repository root:

```bash
# Start Tenant Runtime on port 4003
pnpm run dev

# Start Site Studio Control Plane on port 4004
pnpm run studio:dev
```
