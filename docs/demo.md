# SIH judge demo

**Setup (local):** `npm install` → `npm run emulators` (Auth + Firestore) → `npm run seed` → `npm run dev` → open http://localhost:3000.
Sign in as `officer@fiispec.demo` / `FiiSpec#2026`; the demo accounts are listed on the sign-in page in emulator mode.

The whole flow runs through the real pipeline, with no pre-rendered results. Without an AI key the analysis is labelled **Deterministic only**. With `ANTHROPIC_API_KEY` configured in `.env.local`, the AI stages run and are labelled **AI-assisted**.

## Flow (about 5 minutes)

1. **Landing (10 s).** Point out the tagline, the five-step workflow (Specification → AI Understanding → Standards Graph → Compliance Intelligence → Procurement-Ready Output) and the "not a chatbot" comparison table.
2. **Dashboard.** Real statistics (analyses, standards, gaps, pending reviews) computed from the organisation's data, plus one-click demo cases.
3. **New Analysis.** Choose *Describe the product* and enter:
   > 11 kW outdoor AC EV charger for public charging.

   Click **Analyze with FiiSpec**.
4. **Live processing.** Stage states come straight from the backend: Understanding → Finding standards → Relationships → Versions → Certification → Gaps → Report.
5. **Blueprint tab.**
   - The specification understanding (category with confidence, "outdoor", "public charging", 11 kW parsed).
   - The **Standards Blueprint** column.
   - The primary recommendation **IS 17017 (Part 1) : 2018** with **View evidence**: the evidence chain Recommendation → Reason → Relationship → Source → Confidence → Action, and the score breakdown.
6. **Graph tab.**
   - Primary → connector IS 17017 (Part 2/Sec 2) (from the MoP 2024 Annexure I mapping), EMC tests, IS/IEC 60529 IP code, RCCB/MCB safety, and IS 732 / IS 3043 installation.
   - Click a node for details, and an edge for its provenance. Dashed edges are curated relationships pending verification.
7. **Versions tab.** Every standard shows **"Version requires verification"**, because nothing in the prototype dataset has been verified by an administrator. FiiSpec never claims currency without evidence.
8. **Certification tab.**
   - MoP EV charging guidelines and CEA safety regulations are *Potentially applicable — verify against current official requirement*.
   - BIS compulsory certification for the IS 17017 series is *Not detected* as of 25 Sep 2026, with its source.
9. **Gaps tab.** Specification Readiness is low (a one-line description). There are critical gaps for connector type, supply voltage, IP rating (outdoor) and protection devices, plus missing test and acceptance criteria. Each gap has why it matters, a suggested fix and evidence. Mark one resolved and watch readiness update.
10. **Evidence tab.** Filter by the four information classes: verified official, curated benchmark, AI interpretation, human review required.
11. **Specification tab.** **Generate Procurement Specification** produces a 10-section draft:
    - Item origins are labelled (from input, knowledge base, drafting template, placeholder, AI draft).
    - Approval is blocked until placeholders are resolved.
12. **Export report → PDF.** A branded report with a disclaimer; the audit trail records the export.

## Extra scenarios (optional)
- **Multilingual:** run the demo case *EV charger requirement in Hinglish* ("Mujhe public charging ke liye 11 kW EV charger ka tender banana hai."). With AI, the input is normalised. Without AI, English technical terms still identify the product, and the missing AC/DC choice becomes a critical gap.
- **Outdated reference:** *Cement tender citing a superseded standard*. IS 8112:1989 is detected as superseded by IS 269 : 2015 (a critical gap), and "reputed make" is flagged as ambiguous.
- **International citation:** *DC fast charger tender extract citing IEC*. IEC 61851-23 is mapped to the Indian adoption IS 17017 (Part 23) : 2026.
- **Abstention:** "Supply of ergonomic office chairs…". FiiSpec abstains, marks *Review required* and creates a review task (see **Reviews**).
- **Admin** (`admin@fiispec.demo`):
  - Standards: record a verification for IS 17017 (Part 1), then **Re-run** the analysis; the version becomes *Current (verified)*.
  - Benchmark cases: run the benchmark to get measured metrics, with the stated caveat.
  - System health, Audit logs, Ingestion.
- **Architecture:** Blueprint tab → *How this analysis was produced* shows pipeline version, AI mode, prompt versions, AI calls, stage timings and the knowledge-base snapshot.

## Automated version
`npm run test:e2e` runs this flow in Playwright (desktop, mobile with abstention, and the admin console).
