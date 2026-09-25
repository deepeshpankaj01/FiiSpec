# Security

## Identity and authorisation
- **Firebase Authentication:** email/password and Google.
- **Custom claims:** `role` (ADMIN, PROCUREMENT_OFFICER, REVIEWER, ORGANIZATION_USER) and `orgId` are set only by Cloud Functions (`orgs/index.ts`, `scripts/grant-admin.ts`). Client-supplied role values are never trusted: clients cannot write profiles or memberships at all.
- **Server-side permission matrix** (`functions/src/lib/auth.ts`, unit-tested):

| Action | Admin | Procurement officer | Reviewer | Organization user |
|---|---|---|---|---|
| Create / re-run analysis, generate specification, export, request review, feedback | ✓ | ✓ | ✓ | ✓ |
| Edit / approve specification, resolve gaps, decide reviews | ✓ | ✓ | ✓ | — |
| Manage members and join code | ✓ | ✓ | — | — |
| Knowledge base, ingestion, benchmarks, audit logs, system health | ✓ | — | — | — |

- **Reviewer independence:** a member cannot approve a review they requested.
- **Approval gate:** specifications cannot be approved while placeholders remain.

## Firestore Security Rules (`firebase/firestore.rules`)
- **Deny by default.** There is no `allow … if true` anywhere, and clients cannot write any collection: every mutation is a callable that validates input, enforces role and organisation, and writes an audit entry.
- **Organisation isolation:** analyses, results, graph, gaps, evidence, specifications, exports, review tasks and audit entries are readable only when `resource.data.orgId == token.orgId`. List queries must be scoped to the caller's organisation.
- **Admins** may read analysis metadata and results for support, but **never** `inputs/*` (raw tender text).
- **Knowledge base:** readable by signed-in users only when `lifecycle == PUBLISHED`; drafts and archives are visible to admins only.
- **Join codes** are readable only by procurement officers of that organisation.
- **Server-only collections** (`rateLimits`, `joinCodes`, `analysisJobs`) are closed to every client.

## Storage Security Rules (`firebase/storage.rules`)
An upload is accepted only when all of these hold:
- the caller belongs to the organisation in the path
- the analysis record (read via cross-service `firestore.get`) belongs to that organisation, was created by the caller, and is `AWAITING_UPLOAD`
- the object path equals the path the server issued
- the content type is PDF or DOCX, and the size is between 1 byte and 15 MB
- **no object exists yet** (`resource == null`), so overwrites are impossible

The tests showed the Storage emulator evaluates re-uploads under `create`, so this explicit check is required.

- **Exports** are readable by organisation members and writable only by functions.
- **Every other path** is denied.

After upload, the processing function checks the object against the analysis record, validates **magic bytes** against the declared type, and deletes invalid files.

## Secrets and App Check
- The Claude API key is a Cloud Secret Manager secret (`ANTHROPIC_API_KEY`), bound only to the functions that need it. Firebase web config values are public identifiers.
- **App Check (reCAPTCHA Enterprise)** is initialised in the web app when a site key is configured. Callable functions enforce it when `ENFORCE_APP_CHECK=true` (`functions/.env.<projectId>`).

## Abuse and input handling
- **Rate limits:** per user, fixed-window, in `rateLimits` (for example 30 analyses per hour, 600 searches per hour, 10 join attempts per hour).
- **Validation:** every callable validates with the shared Zod schemas. Null fields (how the callable protocol encodes `undefined`) are treated as absent.
- **Untrusted text:** user text is wrapped as data in AI prompts. AI output is schema-validated twice and grounded (quotes and ids must exist).
- **Redirects:** after sign-in, only same-origin relative redirects are allowed.
- **Security headers:** `X-Frame-Options: DENY`, `nosniff`, a strict referrer policy, a permissions policy, and HSTS in production.

## Privacy and logging
- **Minimal profile:** only name, email, organisation, role and preferences are stored.
- **Logs:** structured logs contain identifiers, codes, sizes and durations — never document or specification text.
- **Audit log:** append-only. Clients cannot write or delete entries, and knowledge-base records are archived rather than deleted.

## Verification
- `npm run test:rules` runs 26 Security Rules tests against the emulators:
  - unauthenticated access
  - cross-organisation reads and list queries
  - admin access to inputs
  - forged role writes
  - client writes to knowledge-base, analysis and audit data
  - server-only collections
  - upload type, size, path, ownership and state
  - overwrites
  - export privacy
- `npm run test:integration` repeats key checks through the real callables and triggers: cross-organisation denial, admin-only callables, reviewer independence, and direct-write denial.
