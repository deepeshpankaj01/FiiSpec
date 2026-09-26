# Data model (Cloud Firestore)

All domain types live in `shared/` (`analysis.ts`, `knowledge.ts`, `api.ts`, `constants.ts`) and are used by both the web app and the server API (`server/`). Timestamps are ISO-8601 strings, which are sortable, serialisable and identical on client and server.

## Tenancy and identity

| Path | Contents | Written by |
|---|---|---|
| `users/{uid}` | name, email, orgId, orgName, role, UI language, notification prefs, `claimsUpdatedAt` | server (`bootstrapProfile`, `updateProfile`, org callables) |
| `organizations/{orgId}` | name, type, memberCount | server |
| `organizations/{orgId}/members/{uid}` | displayName, email, role | server |
| `organizations/{orgId}/private/settings` | join code (officers only) | server |
| `joinCodes/{code}` | orgId (server-only lookup) | server |

Role and organisation are **custom claims** (`role`, `orgId`) set only by the server API. When a user's claims change, their `users/{uid}.claimsUpdatedAt` is bumped and the client refreshes its ID token.

## Analyses

| Path | Contents |
|---|---|
| `analyses/{id}` | orgId, createdBy, title, productName, inputMode, **status**, **currentStage**, **stages** (per-stage state, timings), **summary** (denormalised counts and readiness for lists and dashboards), error, reviewStatus, specStatus, aiMode, detectedLanguage, file (name, size, type; `storagePath` is only a logical identifier used as the audit target), isDemo, attempt, timestamps |
| `analyses/{id}/inputs/primary` | form fields, combined text, document metadata (pages, method, tables, warnings, SHA-256 content hash) — **organisation-only**; the original document is not retained |
| `analyses/{id}/results/current` | structured specification, recommendations (with score factors, reasons, relationship, version state, provenance class, evidence ids), version findings, certification findings, readiness, abstention, summary, trace |
| `analyses/{id}/graph/current` | nodes and edges (with provenance), loaded only by the Graph tab |
| `analyses/{id}/gaps/{gapId}` | one document per gap so reviewers can resolve or dismiss them individually |
| `analyses/{id}/evidence/{evidenceId}` | evidence items (kind, statement, excerpt, source, provenance class) |
| `analyses/{id}/specifications/{specId}` | versioned procurement specifications (sections, item origins, status `AI_DRAFT` / `HUMAN_REVIEWED`, approver) |
| `analyses/{id}/exports/{exportId}` | export records (format, file name, size, who, when); the file itself is returned to the browser, not stored |
| `analysisJobs/{jobId}` | processing attempts (server-only queue) |
| `reviewTasks/{taskId}` | top-level so reviewers can query their organisation's queue |

Every subcollection document carries `orgId`. This lets the Security Rules authorise reads with `resource.data.orgId` instead of an extra `get()` per read, and lets list queries be constrained to the caller's organisation.

**Why results are split into one "current" document plus subcollections:**
- The results page renders from **one read** (`results/current`), and the analysis list renders from the denormalised `summary`.
- The graph and evidence are larger and not needed on first paint, so they load lazily.
- Gaps change individually through review actions, so they are separate documents.

## Knowledge base

| Collection | Notes |
|---|---|
| `standards/{id}` | `StandardRecordSchema`: designation fields, title, sector, kind, curated scope, status, edition/year, IEC/ISO basis, supersedes/supersededBy, **versionHistory[]**, **amendments[]**, `amendmentDataStatus` (INDEXED / NOT_INDEXED), keywords, productTypes, source, evidenceReferences, dataOrigin, **verification** (status, verifiedBy, verifiedAt, note), lifecycle |
| `standardRelationships/{id}` | fromId, toId, type (NORMATIVE_REFERENCE, TEST_METHOD, SAFETY, INSTALLATION, TERMINOLOGY, RELATED_PRODUCT, RELATED_STANDARD), **provenance** (type, statement, source), contextNote, verification, lifecycle |
| `certificationRules/{id}` | scheme, authority, instrument (order name, S.O. number, date), standardIds, productCategories, condition terms and description, classification when matched, explanation, source, verification, lifecycle |
| `productCategories/{id}` | taxonomy with technical aliases, parent, sector, `requiresInstallation`, **parameter template** (what a specification should state, each with rationale and related standards) |
| `benchmarkCases/{id}` | input, expected primary and related standards, expected gap codes, abstention expectation, demo flag, last run metrics |
| `benchmarkRuns/{id}` | measured summaries and per-case results |
| `ingestionRecords/{id}` | source, URL, type, retrievedAt, version, SHA-256 content hash, record type, validated records, errors, counts, status (STAGED / PUBLISHED / REJECTED / INVALID), verification status, decision |

**Design decision: embedded versions and amendments.** Version history and amendments are *embedded arrays* on the standard rather than subcollections:
- They are small and bounded.
- They are always read with the standard, for timelines and version checks.
- They are updated atomically by admin callables.

This saves one read per standard during every analysis. SUPERSEDES and AMENDED_BY graph edges are derived from these fields, with `VERSION_RECORD` provenance.

**Validation.** Every record is validated with Zod at every boundary: seed import, admin edits, ingestion, and pipeline loading, where invalid records are skipped and logged.

## Operations and governance

| Collection | Purpose |
|---|---|
| `auditLogs/{id}` | append-only: action, actor, role, orgId, analysisId, target, summary, metadata, time |
| `feedback/{id}` | helpful / not helpful / incorrect feedback on recommendations, gaps, certification findings |
| `systemConfig/ai` | remote AI configuration (enabled, model override) |
| `systemConfig/prompts` | prompt registry (id, version, description, effort) |
| `systemConfig/dataset` | dataset name, version, retrieval date, coverage notice |
| `opsMetrics/{day}` | daily operational counters |
| `rateLimits/{uid_action}` | fixed-window rate-limit counters (server-only) |

## Documents and exports (no file storage)

No Cloud Storage is used. An uploaded PDF/DOCX (≤ 4 MB) is read in memory by `PUT /api/analyses/{id}/document`, and only its extracted text, tables and metadata are written to `inputs/primary`. Generated reports are returned to the browser as base64, and only the `exports/{exportId}` record is kept.

## Indexes

`firebase/firestore.indexes.json` defines composite indexes for:
- the organisation-scoped analysis lists (by status and creator)
- review queues (by organisation, status and assignee)
- audit trails per analysis
- admin views (failed analyses, feedback, audit by action)
- relationship lookups by `fromId`/`toId` with lifecycle
- certification rules by standard
- demo cases
