# Architecture

## Overview

```
User
 ↓
Next.js 16 web app (Firebase App Hosting)
 ↓  Firebase Authentication (ID token with custom claims: role, orgId) · App Check
Cloud Functions v2 (asia-south1, Node 22)
 ↓
Cloud Firestore · Cloud Storage
 ↓
Claude (Anthropic API, key in Secret Manager) — optional
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
  - Every mutation goes through a typed callable wrapper (`src/lib/firebase/callables.ts`).
- **Lazy loading:** the graph (React Flow) is loaded only when the Graph tab opens, and its data (`graph/current`) is fetched only then. Evidence is loaded when a panel or the Evidence tab is opened.

### Cloud Functions (`functions/src/`)
| Module | Responsibility |
|---|---|
| `engine/` | Pure pipeline logic (no Firebase), unit-tested and reused by benchmarks |
| `ai/` | Provider interface, Claude client (structured outputs), versioned prompts, call recording |
| `analysis/` | `createAnalysis`, the job queue trigger `onAnalysisJobCreated`, `retryAnalysis`, the `sweepStaleAnalyses` scheduler |
| `documents/` | Storage trigger `onInputDocumentUploaded`: validation, PDF/DOCX extraction |
| `workflow/` | Gap status, reviews, feedback, specification generate/save/approve |
| `reports/` | Report model, PDF (pdfkit) and DOCX (docx) renderers, `exportReport` |
| `standards/` | Knowledge-base repository (validated, cached) and `searchStandards` |
| `orgs/` | Profiles, organisations, join codes, member roles (custom claims) |
| `admin/` | Knowledge-base CRUD, verification, lifecycle, controlled ingestion, benchmarks, feedback |
| `lib/` | Admin SDK, auth/permission helpers, audit log, rate limiting, metrics, structured logging, errors |

Heavy libraries (pdfjs, mammoth, pdfkit, docx, the Anthropic SDK) are imported lazily inside handlers. This keeps function discovery and cold starts fast.

## Analysis lifecycle

1. **`createAnalysis` (callable).**
   - Validates the request (Zod), the role, the organisation and the rate limit.
   - Writes `analyses/{id}` and `analyses/{id}/inputs/primary`.
   - Text input: enqueues `analysisJobs/{jobId}` straight away.
   - Documents: returns an upload path, and the status stays `AWAITING_UPLOAD`.
2. **Document upload (documents only).**
   - The browser uploads to `organizations/{orgId}/analyses/{id}/input/{file}`. Storage rules require that path, the creator, PDF/DOCX, ≤15 MB and no overwrite.
   - `onInputDocumentUploaded` checks the object against the analysis record, verifies magic bytes and extracts text (plus DOCX tables).
   - It then stores the text and enqueues a job. Invalid files are deleted and the analysis fails with a user-friendly error.
3. **`onAnalysisJobCreated`.**
   - Claims the job in a transaction (idempotent under at-least-once delivery).
   - Runs `engine/pipeline.ts` and writes every stage's state into `analyses/{id}.stages`. This is what the progress UI renders, so progress is never simulated.
4. **Persistence.** `results/current` (blueprint), `graph/current`, `gaps/*`, `evidence/*`, analysis summary, audit entries and daily metrics. If FiiSpec abstained, a `reviewTasks` document is created.
5. **Follow-up callables:**
   - gap resolution (readiness is recomputed)
   - review requests and decisions
   - specification generation, editing and approval
   - PDF/DOCX export (stored under `exports/` and returned to the browser)
6. **`sweepStaleAnalyses` (every 10 min).** Marks analyses stuck processing for more than 12 minutes as `PROCESSING_TIMEOUT`, and uploads never completed within 24 hours as `UPLOAD_EXPIRED`.

## Why Firestore triggers + a job collection

- **Retries:** each attempt is a separate `analysisJobs` document, so retries are explicit and auditable.
- **Progress:** the browser only waits for the callable that creates the job, then watches progress through Firestore.
- **Scaling:** document processing and the analysis pipeline scale independently.

## Observability

- **Structured logs** (`lib/log.ts`) carry only identifiers, codes, sizes and durations, never document text.
- **Daily counters** in `opsMetrics/{YYYY-MM-DD}` record analyses started/completed/review/failed, AI requests and failures, AI latency, pipeline latency, documents, specifications and exports. They appear on the admin System Health page.
- **Per-analysis trace** (`results/current.trace`): pipeline version, AI mode and model, prompt versions, every AI call (ok, latency, error), stage durations, and a knowledge-base snapshot with counts. It is visible under "How this analysis was produced".
