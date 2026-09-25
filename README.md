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
Browser (Next.js 16 on Firebase App Hosting)
   │  Firebase Auth (email/password, Google) · App Check (reCAPTCHA Enterprise)
   ▼
Cloud Functions (2nd gen, Node 22, asia-south1)
   ├─ Callable API: createAnalysis, generateProcurementSpecification, exportReport, reviews, admin…
   ├─ Firestore trigger: analysisJobs/{id} → 9-stage pipeline (idempotent job claim)
   ├─ Storage trigger: uploaded PDF/DOCX → validation (magic bytes) → text/table extraction
   └─ Scheduler: stale-analysis sweeper (timeouts, expired uploads)
   ▼
Cloud Firestore (org-isolated data, knowledge base, audit log) · Cloud Storage (private uploads, exports)
   ▼
Claude (Anthropic API) via Secret Manager: optional; deterministic fallback when unavailable
```

See [docs/architecture.md](docs/architecture.md), [docs/data-model.md](docs/data-model.md), [docs/ai-pipeline.md](docs/ai-pipeline.md), [docs/security.md](docs/security.md), [docs/deployment.md](docs/deployment.md) and [docs/demo.md](docs/demo.md).

## Tech stack

- **Web:** Next.js 16 (App Router, Turbopack), React 19, TypeScript (strict), Tailwind CSS 4, shadcn/ui (Base UI primitives), React Hook Form, Zod, React Flow (`@xyflow/react`), Lucide icons, Sonner.
- **Backend:** Firebase Authentication, Cloud Firestore, Cloud Storage, Cloud Functions v2 (`firebase-functions` 7), Firebase Admin SDK, App Check, App Hosting.
- **AI:** Anthropic TypeScript SDK with structured outputs (`messages.parse` + Zod), server-side refusal fallback, seven versioned prompts.
- **Documents and reports:** unpdf (PDF text), mammoth (DOCX text and tables), pdfkit (PDF reports), docx (Word reports).
- **Testing:** Vitest (unit, rules, integration), Testing Library (web), `@firebase/rules-unit-testing`, Playwright (E2E).

## Repository layout

```
shared/                 Domain types, constants and Zod schemas shared by web and functions
src/
  app/                  Routes: (marketing) public site · (auth) sign-in · (app) workspace · admin
  components/           ui/ (shadcn) · fiispec/ (badges, fields) · layout/ · brand/
  features/             analysis/ (forms, results tabs) · graph/ · auth/ · admin/
  lib/                  firebase client, typed callables, realtime hooks, formatting
functions/
  src/engine/           Pure pipeline: extraction, retrieval (BM25), scoring, graph, versions,
                        certification, gaps, evidence, spec generation, benchmark
  src/ai/               Provider abstraction, Claude client, versioned prompts
  src/analysis/ …       Callables and triggers (analysis, documents, workflow, reports, admin, orgs)
  src/seed/             Curated benchmark dataset (validated at load)
  scripts/              seed, grant-admin, run-benchmarks, render-sample-report
  tests/                unit/ · rules/ (Security Rules) · integration/ (emulator end-to-end)
firebase/               firestore.rules · storage.rules · firestore.indexes.json
e2e/                    Playwright judge-demo flow
docs/                   Architecture, data model, AI pipeline, security, deployment, demo
```

## Firebase setup

1. Create a Firebase project on the **Blaze** plan (needed for Cloud Functions, Secret Manager and the scheduler).
2. Enable **Authentication** with the Email/Password and Google providers.
3. Create **Cloud Firestore** (production mode) and **Cloud Storage** (default bucket).
4. Register a **Web app** and copy its config into `apphosting.yaml` (production) or `.env.local`.
5. **App Check:** register the web app with reCAPTCHA Enterprise, set `NEXT_PUBLIC_RECAPTCHA_ENTERPRISE_SITE_KEY`, then set `ENFORCE_APP_CHECK=true` in `functions/.env.<projectId>`.
6. **AI key (optional):** `firebase functions:secrets:set ANTHROPIC_API_KEY`. Without it, FiiSpec runs in deterministic-only mode and labels every analysis accordingly.

## Environment variables

| Where | Variable | Purpose |
|---|---|---|
| Web (`.env.local` / `apphosting.yaml`) | `NEXT_PUBLIC_FIREBASE_API_KEY`, `…_AUTH_DOMAIN`, `…_PROJECT_ID`, `…_STORAGE_BUCKET`, `…_APP_ID`, `…_MESSAGING_SENDER_ID` | Firebase web config (public identifiers) |
| Web | `NEXT_PUBLIC_FUNCTIONS_REGION` | Callable region (default `asia-south1`) |
| Web | `NEXT_PUBLIC_USE_EMULATORS` | `true` for local development against the emulator suite |
| Web | `NEXT_PUBLIC_RECAPTCHA_ENTERPRISE_SITE_KEY` | App Check site key (public) |
| Functions (`functions/.env`) | `AI_MODEL` | Claude model id (default `claude-opus-5`) |
| Functions | `ENFORCE_APP_CHECK` | `true` to reject callable requests without a valid App Check token |
| Functions secret | `ANTHROPIC_API_KEY` | Claude API key (Secret Manager; local: `functions/.secret.local`) |

Copy `.env.example` to `.env.local` for local development. No secret ever reaches the browser.

## Local development

Prerequisites: Node.js 22+ (24 works), Firebase CLI 15+, and Java 11+ for the Firestore and Storage emulators. If Java is not installed, place a portable JRE in `.tools/` (e.g. `.tools/jdk-21…-jre`); `scripts/with-java.mjs` finds it automatically.

```bash
npm install && npm --prefix functions install
cp .env.example .env.local                                   # emulator configuration
cp functions/.secret.local.example functions/.secret.local   # optional: add ANTHROPIC_API_KEY
npm run emulators      # terminal 1: builds functions, starts Auth, Firestore, Storage, Functions (UI on :4000)
npm run seed           # once: loads the knowledge base and demo users into the emulator
npm run dev            # terminal 2: http://localhost:3000
```

Demo accounts (emulator only, password `FiiSpec#2026`):
- `officer@fiispec.demo`: Procurement Officer
- `reviewer@fiispec.demo`: Reviewer
- `user@fiispec.demo`: Organization User
- `admin@fiispec.demo`: Administrator

The demo organisation's join code is `DEMO-2026`.

## Testing

```bash
npm run lint             # ESLint (Next.js + TypeScript rules)
npm run typecheck        # Next typegen + tsc for web and functions
npm run test             # web unit tests + functions unit tests (engine, AI-safety, permissions, data honesty)
npm run test:rules       # Firestore + Storage Security Rules (emulator)
npm run test:integration # end-to-end backend flow on the full emulator suite
npm run test:e2e         # Playwright judge demo flow (requires emulators + seed + dev server)
npm run build            # production build
npm run benchmarks       # run the pipeline over the benchmark cases (deterministic)
```

## Deployment

```bash
firebase use --add                                   # select your project
firebase functions:secrets:set ANTHROPIC_API_KEY     # optional
firebase deploy --only firestore,storage,functions   # rules, indexes, functions
GCLOUD_PROJECT=<id> npm --prefix functions run seed -- --kb-only   # knowledge base (ADC credentials)
npm --prefix functions run grant-admin -- --email you@example.gov.in
firebase apphosting:backends:create                  # connect the GitHub repo; App Hosting builds on push
```

The full checklist, including App Check, CORS-free exports and the Storage→Firestore rules permission, is in [docs/deployment.md](docs/deployment.md).

## Security

- Roles and organisation membership live only in server-set custom claims.
- Firestore and Storage rules deny by default; clients never write directly (every mutation is a validated, audited callable).
- Organisations are isolated. Admins can read analysis metadata for support but never raw tender inputs.
- Uploads are restricted to the declared path, creator, type and size, with no overwrite; they are then validated by magic bytes.
- Per-user rate limits, App Check, secrets in Secret Manager, structured logs without document content, and an append-only audit log.

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
- **No scheduler in local testing.** The stale-analysis sweeper needs Cloud Scheduler, so it does not run in the local emulator (no Pub/Sub emulator).

---

*FiiSpec is a decision-support tool. Final procurement and regulatory decisions require appropriate human verification against current official requirements.*
