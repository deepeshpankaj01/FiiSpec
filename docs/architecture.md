# Architecture

## Overview

```
User
 ↓
Next.js 16 web app (Vercel, bom1)
 ↓  Firebase Authentication (ID token with custom claims: role, orgId) · App Check
Server API (Next.js route handlers on Vercel, bom1, Node runtime)
 ↓
Cloud Firestore (asia-south1)
 ↓
Claude (Anthropic API, key in a server-side environment variable) — optional
 ↓
Results rendered live in the browser (Firestore realtime listeners)
```

## Components

### Web app (`src/`)
- **Public site** (`(marketing)`): server-rendered landing, How It Works and About pages.
- **Auth pages** (`(auth)`): sign-in, registration, password reset. Google sign-in is supported.
- **Workspace** (`(app)`): an authenticated client shell (`AppShell`) guards sign-in and organisation membership. It holds dashboard, new analysis, results, history, standards explorer, reviews, reports, settings and the admin console.
- **Data access:**
  - Reads go directly to Firestore through realtime hooks (`src/lib/firebase/hooks.ts`), with Security Rules as the enforcement layer.
  - Every mutation goes through a typed callable wrapper (`src/lib/firebase/callables.ts`), which calls `POST /api/fn/{name}` with the user's ID token and turns errors into `FirebaseError('functions/<code>')`.
- **Lazy loading:** the graph (React Flow) is loaded only when the Graph tab opens, and its data (`graph/current`) is fetched only then. Evidence is loaded when a panel or the Evidence tab is opened.

### Server API (`server/src/`)
A plain TypeScript library imported by the Next.js route handlers in `src/app/api/` (path alias `@server/*`). Its dependencies are in the root `package.json`; there is no separate install or build step. The routes run on the Node runtime with `maxDuration` 300 s:

| Route | Purpose |
|---|---|
| `POST /api/fn/[name]` | All 25 callables (registry `CALLABLES` in `server/src/index.ts`). Body `{ data }`, `Authorization: Bearer <Firebase ID token>` (verified with the Admin SDK), plus `X-Firebase-AppCheck` when `ENFORCE_APP_CHECK=true`. Returns `{ result }` or `{ error: { code, message } }` with an HTTP status. |
| `PUT /api/analyses/[id]/document` | Raw PDF/DOCX upload (Content-Type = file type, ≤ 4 MB) |
| `GET /api/cron/sweep` | Stale-analysis sweeper, run daily by Vercel Cron with `Authorization: Bearer $CRON_SECRET` |

| Module | Responsibility |
|---|---|
| `engine/` | Pure pipeline logic (no Firebase), unit-tested and reused by benchmarks |
| `ai/` | Provider interface, Claude client (structured outputs), versioned prompts, call recording |
| `analysis/` | `createAnalysis`, the job queue (`enqueueAnalysisJob`, `processAnalysisJob`), `retryAnalysis`, the `sweepStaleAnalyses` sweeper |
| `documents/` | `acceptUploadedDocument`: upload checks, validation, PDF/DOCX extraction |
| `http/` | `handlers.ts`: ID-token and App Check verification, callable protocol, document upload, cron secret |
| `workflow/` | Gap status, reviews, feedback, specification generate/save/approve |
| `reports/` | Report model, PDF (pdfkit) and DOCX (docx) renderers, `exportReport` |
| `standards/` | Knowledge-base repository (validated, cached) and `searchStandards` |
| `orgs/` | Profiles, organisations, join codes, member roles (custom claims) |
| `admin/` | Knowledge-base CRUD, verification, lifecycle, controlled ingestion, benchmarks, feedback |
| `lib/` | Admin SDK, `runtime.ts` (`onCall`, `HttpsError`, `CallableRequest`, `runInBackground`), auth/permission helpers, audit log, rate limiting, metrics, structured logging, errors |

Heavy libraries (pdfjs, mammoth, pdfkit, docx, the Anthropic SDK) are imported lazily inside handlers. This keeps cold starts fast.

## Analysis lifecycle

1. **`createAnalysis` (callable).**
   - Validates the request (Zod), the role, the organisation and the rate limit.
   - Writes `analyses/{id}` and `analyses/{id}/inputs/primary`.
   - Text input: enqueues `analysisJobs/{jobId}` straight away.
   - Documents: returns `uploadPath: "/api/analyses/{id}/document"`, and the status stays `AWAITING_UPLOAD`.
2. **Document upload (documents only).**
   - The browser sends the raw file to `PUT /api/analyses/{id}/document`. The route requires the createAnalysis permission, the same organisation, the analysis creator, status `AWAITING_UPLOAD` (claimed in a transaction, so a second upload is rejected), the declared content type and ≤ 4 MB.
   - In the background it verifies magic bytes and extracts text (plus DOCX tables).
   - It then stores the text, tables and metadata (including a SHA-256 content hash) in `inputs/primary` and enqueues a job. The original file is not retained. Invalid files fail the analysis with a user-friendly error.
3. **`processAnalysisJob` (background).**
   - Runs in the background of the request that enqueued the job, after the response is sent (Next.js `after()`, installed with `setBackgroundScheduler`).
   - Claims the job in a transaction, so a duplicate run is a no-op.
   - Runs `engine/pipeline.ts` and writes every stage's state into `analyses/{id}.stages`. This is what the progress UI renders, so progress is never simulated.
   - A deadline (`PIPELINE_DEADLINE_MS`, default 250 s) marks the run `PROCESSING_TIMEOUT` before Vercel's 300 s limit.
4. **Persistence.** `results/current` (blueprint), `graph/current`, `gaps/*`, `evidence/*`, analysis summary, audit entries and daily metrics. If FiiSpec abstained, a `reviewTasks` document is created.
5. **Follow-up callables:**
   - gap resolution (readiness is recomputed)
   - review requests and decisions
   - specification generation, editing and approval
   - PDF/DOCX export (returned to the browser as base64; only an `exports/` record is kept)
6. **`sweepStaleAnalyses` (daily, Vercel Cron → `GET /api/cron/sweep`).** Marks analyses queued or processing with no progress for more than 10 minutes as `PROCESSING_TIMEOUT`, and uploads never completed within 24 hours as `UPLOAD_EXPIRED`. `retryAnalysis` accepts a stale run immediately, without waiting for the sweep.

## Why a job collection + background execution

- **Retries:** each attempt is a separate `analysisJobs` document, so retries are explicit and auditable.
- **Progress:** the browser only waits for the call that creates the job; the pipeline runs after the response (`after()`), and the browser watches progress through Firestore.
- **Idempotency:** the transactional claim makes a duplicate run of the same job a no-op.
- **Bounded runs:** the pipeline's own deadline ends a run with a recorded `PROCESSING_TIMEOUT` before the platform kills it.
- **Safety net:** a run that dies anyway stops making progress. After 10 minutes the user can retry it, and the daily sweep marks it failed.

## Observability

- **Structured logs** (`lib/log.ts`) are JSON lines on stdout (Vercel logs) and carry only identifiers, codes, sizes and durations, never document text.
- **Daily counters** in `opsMetrics/{YYYY-MM-DD}` record analyses started/completed/review/failed, AI requests and failures, AI latency, pipeline latency, documents, specifications and exports. They appear on the admin System Health page.
- **Per-analysis trace** (`results/current.trace`): pipeline version, AI mode and model, prompt versions, every AI call (ok, latency, error), stage durations, and a knowledge-base snapshot with counts. It is visible under "How this analysis was produced".
