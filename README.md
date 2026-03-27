# CaseMate PI v2 Prototype

Local-first prototype for the new CaseMate PI platform.

This build is intentionally set up for **zero cloud cost** during testing.
Use fake/anonymized data only until HIPAA cloud infrastructure is ready.

## Getting Started

Install dependencies:

```bash
npm install
```

Run local dev server:

```bash
npm run dev -- --hostname 0.0.0.0 --port 3000
```

Open:

- Desktop: [http://localhost:3000](http://localhost:3000)
- Mobile on same Wi-Fi: `http://YOUR_COMPUTER_LOCAL_IP:3000`

Example:

```txt
http://192.168.1.42:3000
```

To find your local IP on macOS:

```bash
ipconfig getifaddr en0
```

If `en0` is empty, try:

```bash
ipconfig getifaddr en1
```

## Current Module Pages

- `/dashboard`
- `/patients`
- `/patients/[id]` (patient file with encounter history/workspace)
- `/contacts`
- `/appointments`
- `/billing`
- `/settings`

Macro setup for SOAP lives in `/settings` under `SOAP Macro Setup` and feeds patient file encounter macros.

## Validation Commands

Lint:

```bash
npm run lint
```

Production build (Webpack mode):

```bash
npm run build -- --webpack
```

## No-Cloud Test Strategy

1. Build and test locally with sample data.
2. Test layout and behavior on:
- iPhone + iPad Safari
- Android phone + tablet Chrome
3. Validate key flows:
- patient intake
- attorney/contact linking
- appointments
- encounter SOAP drafting
- charge capture view
4. Only after flow quality is accepted, move to HIPAA cloud for PHI.

## Future Companion App Strategy

- Keep backend API-first.
- Keep validation, auth rules, and workflow logic in shared services.
- Build native app later without redoing core data model.

## Important PHI Note

Do not store real PHI in local testing mode.

Before production PHI usage:

1. Sign BAA with cloud provider.
2. Use HIPAA-eligible services only.
3. Enforce RBAC + MFA.
4. Encrypt data in transit and at rest.
5. Enable audit logs + backups + restore testing.

## Supabase Cloud Sync (Quick Start)

This repo now supports lightweight cloud sync for all `casemate.*` local state keys.

### 1) Create table/policies in Supabase

Open **SQL Editor** and run:

```sql
-- File included in this repo:
-- /supabase/app_snapshots.sql
```

### 2) Add env vars locally

Create `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
NEXT_PUBLIC_CASEMATE_WORKSPACE_ID=main-office
# Optional if you want a custom table name:
# NEXT_PUBLIC_CASEMATE_SNAPSHOT_TABLE=app_snapshots
```

### 3) Run app

```bash
npm run dev -- --hostname 0.0.0.0 --port 3000
```

Startup behavior:

- If cloud snapshot exists, app pulls it down first.
- If cloud snapshot does not exist, app pushes your current local data.
- App autosaves to Supabase every 10 seconds and on tab hide/unload.

## Deploying Live (GoDaddy Domain + Vercel + Supabase)

1. Push this repo to GitHub.
2. Import project in [Vercel](https://vercel.com/).
3. Add the same env vars in Vercel Project Settings.
4. Deploy.
5. In Vercel, add domain `mynotegoat.com` and `www.mynotegoat.com`.
6. In GoDaddy DNS, point records to Vercel as instructed by Vercel UI.
7. Wait for DNS propagation, then test from phone/tablet.

This is the fastest production path for this Next.js app.
