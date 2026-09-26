# Security

## Identity and authorisation
- **Firebase Authentication:** email/password and Google. The server API verifies the caller's ID token (`Authorization: Bearer`) with the Admin SDK `verifyIdToken` on every request.
- **Custom claims:** `role` (ADMIN, PROCUREMENT_OFFICER, REVIEWER, ORGANIZATION_USER) and `orgId` are set only by the server API (`server/src/orgs/index.ts`, `server/scripts/grant-admin.ts`). Client-supplied role values are never trusted: clients cannot write profiles or memberships at all.
- **Server-side permission matrix** (`server/src/lib/auth.ts`, unit-tested):

| Action | Admin | Procurement officer | Reviewer | Organization user |
|---|---|---|---|---|
| Create / re-run analysis, generate specification, export, request review, feedback | ✓ | ✓ | ✓ | ✓ |
| Edit / approve specification, resolve gaps, decide reviews | ✓ | ✓ | ✓ | — |
| Manage members and join code | ✓ | ✓ | — | — |
| Knowledge base, ingestion, benchmarks, audit logs, system health | ✓ | — | — | — |

- **Reviewer independence:** a member cannot approve a review they requested.
- **Approval gate:** specifications cannot be approved while placeholders remain.

## Firestore Security Rules (`firebase/firestore.rules`)
- **Deny by default.** There is no `allow … if true` anywhere, and clients cannot write any collection: every mutation is a server API call that validates input, enforces role and organisation, and writes an audit entry.
- **Organisation isolation:** analyses, results, graph, gaps, evidence, specifications, exports, review tasks and audit entries are readable only when `resource.data.orgId == token.orgId`. List queries must be scoped to the caller's organisation.
- **Admins** may read analysis metadata and results for support, but **never** `inputs/*` (raw tender text).
- **Knowledge base:** readable by signed-in users only when `lifecycle == PUBLISHED`; drafts and archives are visible to admins only.
- **Join codes** are readable only by procurement officers of that organisation.
- **Server-only collections** (`rateLimits`, `joinCodes`, `analysisJobs`) are closed to every client.

## Document upload (`PUT /api/analyses/{id}/document`)
No Cloud Storage is used: documents go to a server route, which accepts an upload only when all of these hold:
- the caller has a valid ID token and the permission to create analyses
- the analysis belongs to the caller's organisation, was created by the caller, and is `AWAITING_UPLOAD`
- the status is claimed in a Firestore transaction, so **a second upload for the same analysis is rejected**
- the content type matches the one declared when the analysis was created (PDF or DOCX)
- the size is between 1 byte and 4 MB (Vercel caps function request bodies at 4.5 MB)

After acceptance, the server validates **magic bytes** against the declared type and extracts the text. **The original file is not retained**: only the extracted text, tables and metadata (including a SHA-256 content hash) are stored, in the organisation-only `inputs/primary` document.

- **Exports** are returned directly to the browser; only an export record (format, file name, size, who, when) is stored.

## Secrets and App Check
- Secrets (`ANTHROPIC_API_KEY`, the Admin SDK key `FIREBASE_SERVICE_ACCOUNT_KEY`, `CRON_SECRET`) are server-side environment variables on Vercel (encrypted, never `NEXT_PUBLIC_`). Firebase web config values are public identifiers.
- **Cron:** `GET /api/cron/sweep` rejects any request without `Authorization: Bearer $CRON_SECRET`.
- **App Check (reCAPTCHA Enterprise)** is initialised in the web app when a site key is configured. The server API enforces it when `ENFORCE_APP_CHECK=true`: every request must carry an `X-Firebase-AppCheck` token, verified with the Admin SDK.

## Abuse and input handling
- **Rate limits:** per user, fixed-window, in `rateLimits` (for example 30 analyses per hour, 600 searches per hour, 10 join attempts per hour).
- **Validation:** every callable validates with the shared Zod schemas. Null fields (how the callable protocol encodes `undefined`) are treated as absent.
- **Untrusted text:** user text is wrapped as data in AI prompts. AI output is schema-validated twice and grounded (quotes and ids must exist).
- **Redirects:** after sign-in, only same-origin relative redirects are allowed.
- **Security headers:** `X-Frame-Options: DENY`, `nosniff`, a strict referrer policy, a permissions policy, and HSTS in production.

## Privacy and logging
- **Minimal profile:** only name, email, organisation, role and preferences are stored.
- **Logs:** structured JSON logs (stdout, collected by Vercel) contain identifiers, codes, sizes and durations — never document or specification text.
- **Audit log:** append-only. Clients cannot write or delete entries, and knowledge-base records are archived rather than deleted.

## Verification
- `npm run test:rules` runs 18 Firestore Security Rules tests against the emulator:
  - unauthenticated access
  - cross-organisation reads and list queries
  - admin access to inputs
  - forged role writes
  - client writes to knowledge-base, analysis and audit data
  - server-only collections
  - profile, join-code, feedback and system-configuration access
- `server/tests/unit/http.test.ts` covers ID-token authentication, error mapping, the upload size guard and the cron secret.
- `npm run test:integration` repeats key checks through the real HTTP handlers, with emulator ID tokens: cross-organisation denial, admin-only callables, reviewer independence, upload checks, and direct-write denial.
