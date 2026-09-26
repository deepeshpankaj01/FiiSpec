# FiiSpec — AI Standards Intelligence for Procurement

**From Specification → Standards → Evidence → Procurement-Ready Decision**

FiiSpec is a standards-intelligence and procurement-assurance platform built for **Smart India Hackathon 2026, Problem Statement SIH26108**. It takes a product description, a pasted technical specification or an uploaded tender (PDF/DOCX) and returns an evidence-backed map of the applicable Indian Standards. The map includes:

- normative, test, safety, installation, terminology and related-product standards
- version and amendment status
- certification and regulatory context
- the gaps in the specification itself
- a draft procurement specification for human review

It is **not a chatbot** and not just a standards search box. It is a decision-support system with a multi-stage pipeline, a provenance-backed standards graph, deterministic rules, explicit evidence, and abstention when evidence is weak.

> **Prototype data notice.** FiiSpec ships with a *small curated benchmark dataset*: 62 standards, 66 relationships, 13 certification/regulatory rules, 23 product categories and 11 benchmark cases. It was compiled from public BIS, Ministry of Power, CEA and BEE sources on 2026-09-25. It does **not** represent complete BIS coverage. Every record is marked *unverified* until an administrator verifies it against the current official source.

---

## The problem

Writing a standards-compliant tender is hard for three reasons:
- A product standard depends on other standards: normative references, test methods, safety, installation codes and terminology.
- Standards are revised, amended, merged and withdrawn, yet tenders keep citing superseded editions.
- Specifications routinely omit parameters, tests, protection, installation scope, certification and acceptance criteria.

The result is non-comparable bids, disputes at acceptance, and tenders that exclude currently certified products.

## The solution

| Layer | What FiiSpec does |
|---|---|
| Understanding | Normalises the requirement (English, Hindi, Hinglish) into a validated structured specification with units converted (HP→kW, lpm→m³/h, °F→°C). |
| Standards Blueprint | Primary standard, then normative references, test methods, safety, installation, related standards, versions and amendments, certification, gaps, evidence and final specification. |
| Standards Graph | Interactive React Flow graph. Every edge records *why* it exists (official mapping, normative reference, or curated relationship marked for verification). |
| Version intelligence | Detects superseded, withdrawn, older-edition, undated, IEC-cited and not-indexed references. Says "current" only for records verified within 12 months. |
| Certification intelligence | Applicable / Potentially applicable / Manual verification / Not detected, from indexed rules. Never a legal determination. |
| Specification Readiness | A 0–100 score (60% parameter coverage, 40% quality) plus justified gaps: missing parameters, ambiguity, conflicts, missing tests, safety, installation or certification, outdated references, unitless numbers, acceptance criteria. |
| Evidence chain | Recommendation → Reason → Relationship → Source → Confidence → Action, tagged with one of four information classes (below). |
| Abstention | "FiiSpec could not establish sufficient evidence for a reliable recommendation." The analysis becomes *Review required* and a review task is created. |
| Output | A 10-section procurement specification draft (AI draft vs human-reviewed), PDF/DOCX reports, and copy to clipboard. |

The four information classes:
- **Verified official information**
- **Curated benchmark data**
- **AI-generated interpretation**
- **Human review required**

## Architecture

```
Browser (Next.js 16 on Vercel)
   │  Firebase Auth (email/password, Google) · App Check (reCAPTCHA Enterprise)
   ▼
Server API (Next.js route handlers on Vercel, bom1, Node runtime)
   ├─ POST /api/fn/{name}: 25 callables (createAnalysis, generateProcurementSpecification, exportReport, reviews, admin…)
   ├─ Background job (after the response): analysisJobs/{id} → 9-stage pipeline (idempotent job claim)
   ├─ PUT /api/analyses/{id}/document: PDF/DOCX ≤ 4 MB → validation (magic bytes) → text/table extraction
   └─ GET /api/cron/sweep: daily stale-analysis sweeper (timeouts, expired uploads)
   ▼
Cloud Firestore (asia-south1; org-isolated data, knowledge base, audit log)
   ▼
Claude (Anthropic API, key in a server-side environment variable): optional; deterministic fallback when unavailable
```

See [docs/architecture.md](docs/architecture.md), [docs/data-model.md](docs/data-model.md), [docs/ai-pipeline.md](docs/ai-pipeline.md), [docs/security.md](docs/security.md), [docs/deployment.md](docs/deployment.md) and [docs/demo.md](docs/demo.md).

## Tech stack

- **Web:** Next.js 16 (App Router, Turbopack), React 19, TypeScript (strict), Tailwind CSS 4, shadcn/ui (Base UI primitives), React Hook Form, Zod, React Flow (`@xyflow/react`), Lucide icons, Sonner.
- **Backend:** Firebase Authentication, Cloud Firestore, Firebase Admin SDK and App Check (Firebase Spark plan); server API as Next.js route handlers on Vercel (Hobby), with Vercel Cron.
- **AI:** Anthropic TypeScript SDK with structured outputs (`messages.parse` + Zod), server-side refusal fallback, seven versioned prompts.
- **Documents and reports:** unpdf (PDF text), mammoth (DOCX text and tables), pdfkit (PDF reports), docx (Word reports).
- **Testing:** Vitest (unit, rules, integration), Testing Library (web), `@firebase/rules-unit-testing`, Playwright (E2E).

## Repository layout

```
shared/                 Domain types, constants and Zod schemas shared by web and server
src/
  app/                  Routes: (marketing) public site · (auth) sign-in · (app) workspace · admin · api/ (server API routes)
  components/           ui/ (shadcn) · fiispec/ (badges, fields) · layout/ · brand/
  features/             analysis/ (forms, results tabs) · graph/ · auth/ · admin/
  lib/                  firebase client, typed callables, realtime hooks, formatting
server/                 Server API library, imported by src/app/api via @server/* (no separate install or build)
  src/engine/           Pure pipeline: extraction, retrieval (BM25), scoring, graph, versions,
                        certification, gaps, evidence, spec generation, benchmark
  src/ai/               Provider abstraction, Claude client, versioned prompts
  src/analysis/ …       Callables and background jobs (analysis, documents, workflow, reports, admin, orgs)
  src/http/             HTTP handlers: token verification, callable protocol, document upload, cron
  src/seed/             Curated benchmark dataset (validated at load)
  scripts/              seed, grant-admin, run-benchmarks, render-sample-report
  tests/                unit/ · rules/ (Security Rules) · integration/ (emulator end-to-end)
firebase/               firestore.rules · firestore.indexes.json
vercel.json             Vercel region (bom1) and daily cron
e2e/                    Playwright judge-demo flow
docs/                   Architecture, data model, AI pipeline, security, deployment, demo
```

## Firebase setup

1. Create a Firebase project on the free **Spark** plan (only Authentication and Firestore are used).
2. Enable **Authentication** with the Email/Password and Google providers.
3. Create **Cloud Firestore** (production mode, `asia-south1`).
4. Register a **Web app** and copy its config into the Vercel project's environment variables (production) or `.env.local`.
5. **Admin credentials:** generate a service-account key (Project settings → Service accounts) and set it as `FIREBASE_SERVICE_ACCOUNT_KEY` on Vercel.
6. **App Check:** register the web app with reCAPTCHA Enterprise, set `NEXT_PUBLIC_RECAPTCHA_ENTERPRISE_SITE_KEY`, then set `ENFORCE_APP_CHECK=true` on the server.
7. **AI key (optional):** set `ANTHROPIC_API_KEY` on the server. Without it, FiiSpec runs in deterministic-only mode and labels every analysis accordingly.

## Environment variables

| Where | Variable | Purpose |
|---|---|---|
| Web (`.env.local` / Vercel) | `NEXT_PUBLIC_FIREBASE_API_KEY`, `…_AUTH_DOMAIN`, `…_PROJECT_ID`, `…_STORAGE_BUCKET`, `…_APP_ID`, `…_MESSAGING_SENDER_ID` | Firebase web config (public identifiers) |
| Web | `NEXT_PUBLIC_USE_EMULATORS` | `true` for local development against the emulator suite (the server's Admin SDK follows it) |
| Web | `NEXT_PUBLIC_RECAPTCHA_ENTERPRISE_SITE_KEY` | App Check site key (public) |
| Server (`.env.local` / Vercel; never `NEXT_PUBLIC_`) | `FIREBASE_SERVICE_ACCOUNT_KEY` | Service-account JSON (raw or base64) for the Admin SDK; not needed with the emulators |
| Server | `ANTHROPIC_API_KEY` | Claude API key (optional; unset or `not-configured` = deterministic-only) |
| Server | `AI_MODEL` | Claude model id (default `claude-opus-5`) |
| Server | `ENFORCE_APP_CHECK` | `true` to reject API requests without a valid App Check token |
| Server | `CRON_SECRET` | Bearer secret for `/api/cron/sweep` (sent by Vercel Cron) |
| Server | `PIPELINE_DEADLINE_MS` | Optional pipeline deadline (default 250000) |

Copy `.env.example` to `.env.local` for local development. No secret ever reaches the browser.

## Local development

Prerequisites: Node.js 22+ (24 works), Firebase CLI 15+, and Java 11+ for the Firestore emulator. If Java is not installed, place a portable JRE in `.tools/` (e.g. `.tools/jdk-21…-jre`); `scripts/with-java.mjs` finds it automatically.

```bash
npm install            # one install for web and server
cp .env.example .env.local   # emulator configuration; optional: add ANTHROPIC_API_KEY
npm run emulators      # terminal 1: Auth and Firestore emulators (UI on :4000)
npm run seed           # once: loads the knowledge base and demo users into the emulator
npm run dev            # terminal 2: web app and API on http://localhost:3000
```

To run the stale-analysis sweeper locally, set `CRON_SECRET` in `.env.local` (and in your shell) and call `curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/sweep`.

Demo accounts (emulator only, password `FiiSpec#2026`):
- `officer@fiispec.demo`: Procurement Officer
- `reviewer@fiispec.demo`: Reviewer
- `user@fiispec.demo`: Organization User
- `admin@fiispec.demo`: Administrator

The demo organisation's join code is `DEMO-2026`.

## Testing

```bash
npm run lint             # ESLint (Next.js + TypeScript rules)
npm run typecheck        # Next typegen + tsc for web and server
npm run test             # web unit tests + server unit tests (engine, AI-safety, permissions, data honesty, HTTP layer)
npm run test:rules       # Firestore Security Rules (emulator)
npm run test:integration # end-to-end backend flow through the real HTTP handlers (Auth + Firestore emulators)
npm run test:e2e         # Playwright judge demo flow (requires emulators + seed + dev server)
npm run build            # production build
npm run benchmarks       # run the pipeline over the benchmark cases (deterministic)
```

## Deployment

Firebase (Spark: Auth + Firestore in `asia-south1`) holds the data; Vercel hosts the web app and API.

```bash
firebase deploy --only firestore --project production   # rules and indexes (alias in .firebaserc)
export GOOGLE_APPLICATION_CREDENTIALS=.secrets/firebase-admin.json GCLOUD_PROJECT=<id>
npm run seed:production                               # knowledge base
npm run grant-admin -- --email you@example.gov.in       # first administrator
vercel --prod                                           # web app + API, after setting the environment variables
```

Then add the Vercel domain to Firebase Authentication's authorised domains. The full checklist, including environment variables, App Check and the cron secret, is in [docs/deployment.md](docs/deployment.md).

## Security

- Roles and organisation membership live only in server-set custom claims.
- Firestore rules deny by default; clients never write directly (every mutation is a validated, audited API call).
- Organisations are isolated. Admins can read analysis metadata for support but never raw tender inputs.
- Uploads are accepted only from the analysis creator, in the same organisation, while it awaits its document, with the declared type and ≤ 4 MB, once only; they are then validated by magic bytes, and the original file is not kept.
- Per-user rate limits, App Check, secrets in server-side environment variables (never `NEXT_PUBLIC_`), structured logs without document content, and an append-only audit log.

See [docs/security.md](docs/security.md).

## Data strategy

- **Controlled ingestion.** An admin stages → validates → reviews → publishes batches. Each batch records its source, URL, retrieval date, version and SHA-256 content hash.
- **Verification is a human act.** It records verifier and date. Any edit resets the record to *unverified*.
- **Nothing important is hard-deleted.** Records are archived, and every change is audit-logged.
- **Scope texts are curated summaries**, never copies of restricted standard text.
- **Ready for authorised data.** The architecture supports future authorised BIS data integration without code changes.

## AI architecture

- AI is **one input**, never the decision-maker.
- **Seven versioned prompts:** extraction, relevance, relationship explanation, version reasoning, certification condition, gap analysis and drafting.
- **Structured outputs are always re-validated** with Zod.
- **Hard guards:**
  - Standards not supplied by the retriever are discarded.
  - Categories outside the taxonomy are ignored.
  - Parameters and quotes must appear verbatim in the input.
  - AI can never raise a certification classification or mark a version current.
  - Drafts citing unrecommended standards are rejected.
- **Graceful degradation:** if AI is unavailable, the pipeline completes deterministically and says so.

See [docs/ai-pipeline.md](docs/ai-pipeline.md).

## Honest limitations

- **Small dataset.** The curated benchmark dataset is small, and all records are unverified until checked by an administrator.
- **Optimistic benchmark metrics.** The metrics reflect agreement with 11 hand-written cases that were developed alongside the engine; they are not accuracy claims.
- **Hindi needs AI.** Hindi (Devanagari) understanding requires the AI stage; without it FiiSpec abstains, by design.
- **Retrieval scale.** Retrieval is in-memory BM25 over curated metadata, which is suitable for thousands of records. Vector search is the documented upgrade path.
- **No OCR yet.** Scanned PDFs are rejected with guidance.
- **Latin-only PDFs.** PDF export uses standard fonts, so non-Latin quotes are marked in the PDF; the DOCX export preserves them.
- **4 MB uploads.** Vercel caps function request bodies at 4.5 MB, so documents are limited to 4 MB.
- **Original documents are not retained.** Only the extracted text, tables and metadata (including a SHA-256 hash) are stored; to change a document, start a new analysis.
- **Daily sweeper.** The Vercel Hobby plan allows only daily cron jobs, so stuck analyses are marked failed once a day. A run with no progress for 10 minutes can be retried immediately.
- **~250 s per analysis run.** Long AI runs on large documents may time out; retry, or use a smaller document or deterministic mode.
- **Spark plan quotas.** The Firestore free tier (50K reads / 20K writes per day) is enough for demos, not for production scale.

---

*FiiSpec is a decision-support tool. Final procurement and regulatory decisions require appropriate human verification against current official requirements.*
