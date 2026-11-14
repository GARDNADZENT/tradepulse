# Nexora Studio — foundation

This is a new Next.js workspace alongside the existing TradersPulse runtime and Studio. It does not replace the deployed Studio automatically or import its sites as source-code projects. Configure `NEXT_PUBLIC_LEGACY_STUDIO_URL` to keep the existing trading-site control plane accessible. Existing tenant sites and their database are unchanged. The new workspace supports multiple separate projects per account; the existing trading-site operator limit remains unchanged.

## What is implemented

- Supabase email/password authentication (sessions are held in memory; refreshing requires login).
- Owner-scoped PostgreSQL projects, source revisions and deployment records using Prisma. Each API authenticates the access token with Supabase and scopes project queries by the verified user ID.
- Real OpenAI chat-completions integration for generating or editing three static source files. AI produces a **proposal**, which can be reviewed and explicitly applied. Stale proposals cannot overwrite a changed draft.
- Manual editing of HTML, CSS and JavaScript as proposed revisions, a version list, and an opaque-origin sandboxed iframe preview. Preview network, forms and external assets are blocked. No generated code is executed on the Nexora server.
- A Vercel REST deployment integration for explicitly approved static files, with actual provider status checks. A submitted deployment is **not** labeled published until Vercel reports `READY`. Deleting a local project does not delete or unpublish its Vercel deployments.

## Not yet implemented / production limitations

This is a foundation, not the full requested AI developer platform. It cannot build or run backend code, databases, login or payments inside generated sites. It does not include visual drag-and-drop editing, multi-page file trees, auto-save, image generation, sandboxed build workers, source export, custom domains, automatic rollback, deployment logs, billing, usage quotas or teams. The assistant only sees the three files of the **applied** revision, not other conversations, legacy trading sites or unsaved edits. It cannot directly edit TradersPulse code. These need separate isolated build infrastructure, a full file model, secret management and review before use.

Do not expose this foundation to untrusted public users yet: production rate limits/quotas, abuse controls for AI and hosting, audit logging, secure tenant isolation verification, a reviewed deployment policy and real end-to-end tests are still needed. The existing TradersPulse Studio's public-read site table also needs a separate tenant-privacy migration. Existing deployed site permissions are not changed by this app.

## Configure

1. Install dependencies in `nexora/` using `npm ci`. Copy `.env.example` to `.env.local` and set the values in a secure deployment environment; do not commit credentials.
2. Configure a Supabase project and public anon key. Set `DATABASE_URL` to a **server-only** PostgreSQL connection whose role owns or may bypass RLS for these tables. Browser clients must not be given that URL. Tables enable RLS without public policies; Prisma calls are server-side and explicitly owner-scoped.
3. Apply `prisma/migrations/20261013000000_init/migration.sql` to the configured database using your migration system, and generate Prisma client (`npx prisma generate`). Review the SQL for your infrastructure before applying it. Never point the new migration blindly at production.
4. Set `OPENAI_API_KEY` and optionally `OPENAI_MODEL` on the server for AI. Requests send the user's prompt and applied source files to OpenAI; do not put secrets in website source files.
5. Set server-only `VERCEL_API_TOKEN` and optionally `VERCEL_TEAM_ID` for static deployment. No provider credential is sent to generated sites. Publish creates a Vercel project/deployment for each Nexora project and may incur provider charges. No automatic cleanup is implemented.
6. Run `npm run dev` inside `nexora` (port 4005). Deploy this directory as a separate Next.js project and route the Studio domain to it only after authentication, database and integrations are verified. The legacy Studio must remain separately deployed for the TradersPulse link.

The workspace is fully empty without configured services; it does not fabricate projects, AI responses or deployment statuses.
