import {
  ArrowRight,
  BadgeCheck,
  Bot,
  CheckCircle2,
  ClipboardCheck,
  Database,
  FileSearch,
  FileText,
  GitBranch,
  History,
  Layers,
  Network,
  ScanSearch,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  UserCheck,
  XCircle,
} from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export const metadata = { title: 'FiiSpec — AI Standards Intelligence for Procurement' };

const FLOW = [
  { icon: FileText, label: 'Specification' },
  { icon: Sparkles, label: 'AI Understanding' },
  { icon: Network, label: 'Standards Graph' },
  { icon: ShieldCheck, label: 'Compliance Intelligence' },
  { icon: ClipboardCheck, label: 'Procurement-Ready Output' },
];

function Section({ id, eyebrow, title, intro, children, tone = 'white' }: { id?: string; eyebrow: string; title: string; intro?: string; children: ReactNode; tone?: 'white' | 'muted' }) {
  return (
    <section id={id} className={cn('py-16 sm:py-20', tone === 'muted' && 'bg-muted/60')}>
      <div className="container-page">
        <div className="mb-10 max-w-2xl">
          <p className="eyebrow mb-2">{eyebrow}</p>
          <h2 className="text-2xl font-semibold sm:text-3xl">{title}</h2>
          {intro ? <p className="mt-3 text-base text-muted-foreground">{intro}</p> : null}
        </div>
        {children}
      </div>
    </section>
  );
}

function Feature({ icon: Icon, title, children }: { icon: typeof FileText; title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border bg-white p-5">
      <div className="mb-3 inline-flex size-9 items-center justify-center rounded-lg bg-navy-50 text-navy-900">
        <Icon className="size-5" aria-hidden />
      </div>
      <h3 className="mb-1.5 text-base font-semibold">{title}</h3>
      <p className="text-sm leading-relaxed text-muted-foreground">{children}</p>
    </div>
  );
}

export default function LandingPage() {
  return (
    <>
      {/* ---------------------------------------------------------------- Hero */}
      <section className="relative overflow-hidden border-b bg-gradient-to-b from-navy-50/70 to-white">
        <div className="container-page grid gap-12 py-16 sm:py-24 lg:grid-cols-[1.05fr_1fr] lg:items-center">
          <div>
            <p className="eyebrow mb-4">Smart India Hackathon 2026 · SIH26108</p>
            <h1 className="text-4xl font-semibold sm:text-5xl">
              FiiSpec
              <span className="mt-2 block text-2xl font-medium text-navy-700 sm:text-3xl">AI Standards Intelligence for Procurement</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg text-muted-foreground">
              Turn product and tender specifications into evidence-backed standards intelligence.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="/analysis/new" className={cn(buttonVariants({ size: 'lg' }), 'h-11 px-5 text-base')}>
                Analyze a Specification <ArrowRight className="size-4" aria-hidden />
              </Link>
              <Link href="/how-it-works" className={cn(buttonVariants({ variant: 'outline', size: 'lg' }), 'h-11 px-5 text-base')}>
                Explore How It Works
              </Link>
            </div>
            <p className="mt-6 text-sm text-muted-foreground">
              Specification <span aria-hidden>→</span> Standards <span aria-hidden>→</span> Evidence <span aria-hidden>→</span> Procurement-Ready Decision
            </p>
          </div>

          <div aria-label="FiiSpec workflow" className="rounded-2xl border bg-white p-5 shadow-sm">
            <ol className="grid gap-3">
              {FLOW.map((step, i) => (
                <li key={step.label} className="flex items-center gap-3">
                  <span className={cn('inline-flex size-10 shrink-0 items-center justify-center rounded-xl', i === FLOW.length - 1 ? 'bg-saffron-500 text-white' : 'bg-navy-900 text-white')}>
                    <step.icon className="size-5" aria-hidden />
                  </span>
                  <div className="flex-1 rounded-lg border border-dashed px-3 py-2">
                    <p className="text-sm font-semibold text-navy-900">{step.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {[
                        'Upload a tender, paste a specification or describe the product — in English, Hindi or Hinglish.',
                        'A structured specification: product, parameters, environment, cited standards.',
                        'Primary standard with normative, test, safety, installation and related references.',
                        'Versions and amendments, certification context, specification gaps.',
                        'A draft procurement specification and an evidence-backed report.',
                      ][i]}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------ Problem */}
      <Section eyebrow="The problem" title="Writing a standards-compliant tender is harder than it looks" intro="Procurement teams must identify the right Indian Standards and everything connected to them — often under time pressure and without specialist support.">
        <div className="grid gap-4 md:grid-cols-3">
          <Feature icon={Layers} title="Standards come as a web, not a list">
            A product standard depends on normative references, test methods, safety, installation and terminology standards. Missing one weakens the whole specification.
          </Feature>
          <Feature icon={History} title="Versions and amendments change">
            Standards are revised, amended, merged and withdrawn. Tenders still cite superseded editions, which can exclude currently certified products.
          </Feature>
          <Feature icon={ShieldAlert} title="Specifications leave gaps">
            Test requirements, protection, installation scope, certification and acceptance criteria are frequently missing or ambiguous — and disputes follow.
          </Feature>
        </div>
      </Section>

      {/* -------------------------------------------------------- How it works */}
      <Section tone="muted" eyebrow="How FiiSpec works" title="A multi-stage pipeline, not a single prompt" intro="Semantic AI, structured metadata, a standards knowledge graph, deterministic rules and evidence — each stage checks the one before it.">
        <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[
            ['Understand', 'Normalise the requirement (any supported language) into a validated structured specification with units converted.'],
            ['Retrieve', 'Find candidate standards with hybrid lexical + taxonomy retrieval; AI assesses semantic relevance only for supplied candidates.'],
            ['Connect', 'Expand the standards graph along curated, provenance-backed relationships.'],
            ['Verify', 'Check editions, supersession and amendments; classify certification context against indexed rules.'],
            ['Explain', 'Attach evidence and a transparent Confidence Score to every recommendation — or abstain and request review.'],
            ['Improve', 'Find specification gaps, score readiness, and draft a procurement specification for human review.'],
          ].map(([title, body], i) => (
            <li key={title} className="rounded-xl border bg-white p-5">
              <span className="mb-3 inline-flex size-7 items-center justify-center rounded-full bg-saffron-50 text-sm font-semibold text-saffron-600">{i + 1}</span>
              <h3 className="text-base font-semibold">{title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{body}</p>
            </li>
          ))}
        </ol>
        <div className="mt-8">
          <Link href="/how-it-works" className={cn(buttonVariants({ variant: 'outline', size: 'lg' }))}>
            See the full pipeline <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
      </Section>

      {/* ------------------------------------------------------- Differentiator */}
      <Section eyebrow="What makes it different" title="Decision support, not a chatbot or a search box">
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full min-w-[640px] text-left text-sm">
            <caption className="sr-only">Comparison of FiiSpec with keyword search and a generic AI chatbot</caption>
            <thead className="bg-muted/70 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th scope="col" className="px-4 py-3 font-semibold">Capability</th>
                <th scope="col" className="px-4 py-3 font-semibold">Keyword search</th>
                <th scope="col" className="px-4 py-3 font-semibold">Generic AI chatbot</th>
                <th scope="col" className="px-4 py-3 font-semibold text-navy-900">FiiSpec</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {[
                ['Understands a product description or tender', false, true, true],
                ['Only recommends standards that exist in the indexed data', true, false, true],
                ['Connected normative, test, safety and installation standards', false, false, true],
                ['Version, supersession and amendment awareness', false, false, true],
                ['Evidence and provenance for every recommendation', false, false, true],
                ['Finds what your specification is missing', false, false, true],
                ['Abstains and requests human review when evidence is weak', false, false, true],
              ].map(([label, a, b, c]) => (
                <tr key={label as string}>
                  <th scope="row" className="px-4 py-3 font-medium text-foreground">{label}</th>
                  {[a, b, c].map((v, i) => (
                    <td key={i} className="px-4 py-3">
                      {v ? <CheckCircle2 className={cn('size-5', i === 2 ? 'text-success' : 'text-muted-foreground')} aria-label="Yes" /> : <XCircle className="size-5 text-muted-foreground/50" aria-label="No" />}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* -------------------------------------------------------------- Graph */}
      <Section tone="muted" eyebrow="Standards Intelligence Graph" title="See the standards context around your product" intro="Every edge in the graph records why it exists — an official mapping, a normative reference, or a curated domain relationship marked for verification.">
        <div className="grid gap-6 lg:grid-cols-[1fr_1fr] lg:items-center">
          <div className="rounded-2xl border bg-white p-6" aria-label="Standards graph illustration">
            <div className="mx-auto mb-5 w-fit rounded-lg bg-navy-900 px-4 py-2 text-sm font-semibold text-white">Primary standard</div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {[
                ['Normative references', 'bg-navy-50 text-navy-900'],
                ['Test methods', 'bg-info-bg text-info'],
                ['Safety', 'bg-danger-bg text-danger'],
                ['Installation', 'bg-success-bg text-success'],
                ['Terminology', 'bg-muted text-muted-foreground'],
                ['Related products', 'bg-saffron-50 text-saffron-600'],
                ['Amendments', 'bg-warning-bg text-warning'],
                ['Superseded editions', 'bg-muted text-muted-foreground line-through decoration-1'],
              ].map(([label, tone]) => (
                <div key={label} className={cn('rounded-lg px-3 py-2 text-center text-xs font-semibold', tone)}>
                  {label}
                </div>
              ))}
            </div>
          </div>
          <ul className="space-y-4">
            {[
              [GitBranch, 'Relationship expansion', 'Structural edges (normative, related product, safety) are followed further; contextual edges stay as leaves so the graph never drifts into other products.'],
              [ScanSearch, 'Click any node or edge', 'Open the standard, or read why the relationship exists and where that came from.'],
              [History, 'Versions on the same canvas', 'Superseded editions and indexed amendments appear alongside the current standard.'],
            ].map(([Icon, title, body]) => {
              const I = Icon as typeof GitBranch;
              return (
                <li key={title as string} className="flex gap-3">
                  <I className="mt-0.5 size-5 shrink-0 text-saffron-500" aria-hidden />
                  <div>
                    <p className="font-semibold text-navy-900">{title as string}</p>
                    <p className="text-sm text-muted-foreground">{body as string}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </Section>

      {/* ----------------------------------------------------------- Evidence */}
      <Section eyebrow="Evidence-first AI" title="Every recommendation shows its evidence chain">
        <div className="mb-8 flex flex-wrap items-center gap-2 text-sm font-medium">
          {['Recommendation', 'Reason', 'Relationship', 'Source', 'Confidence', 'Action'].map((s, i, all) => (
            <span key={s} className="flex items-center gap-2">
              <span className="rounded-full border bg-white px-3 py-1.5 text-navy-900">{s}</span>
              {i < all.length - 1 ? <ArrowRight className="size-4 text-muted-foreground" aria-hidden /> : null}
            </span>
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Feature icon={BadgeCheck} title="Verified official information">Records an administrator has verified against the current official source.</Feature>
          <Feature icon={Database} title="Curated benchmark data">Compiled from public references, clearly labelled, pending verification.</Feature>
          <Feature icon={Bot} title="AI-generated interpretation">Model output — always labelled, grounded in quoted text, never a regulatory determination.</Feature>
          <Feature icon={UserCheck} title="Human review required">When evidence is insufficient, FiiSpec abstains and creates a review task instead of guessing.</Feature>
        </div>
      </Section>

      {/* ---------------------------------------------------------------- Gaps */}
      <Section tone="muted" eyebrow="Procurement gap detection" title="Not just “here are the standards” — “here is what your specification is missing”">
        <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
          <div className="rounded-2xl border bg-white p-6 text-center">
            <p className="text-sm font-medium text-muted-foreground">Specification Readiness</p>
            <p className="mt-2 text-5xl font-semibold text-saffron-600">
              0–100
            </p>
            <p className="mt-3 text-sm text-muted-foreground">60% parameter coverage against the product template, 40% specification quality (open critical, warning and informational issues).</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              'Missing technical parameters',
              'Ambiguous or unverifiable wording',
              'Conflicting values',
              'Missing test, safety or installation requirements',
              'Missing certification references',
              'Outdated or superseded standard references',
              'Numbers without units',
              'Incomplete acceptance criteria',
            ].map((g) => (
              <div key={g} className="flex items-center gap-2 rounded-lg border bg-white px-4 py-3 text-sm">
                <FileSearch className="size-4 shrink-0 text-saffron-500" aria-hidden />
                {g}
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* ------------------------------------------------------------- Preview */}
      <Section eyebrow="Product preview" title="What an analysis looks like" intro="Illustrative preview of the EV charger demo case (“11 kW outdoor AC EV charger for public charging”) from the curated benchmark dataset. Sign in and run it yourself — results come from the live pipeline.">
        <div className="overflow-hidden rounded-2xl border bg-white shadow-sm">
          <div className="flex items-center justify-between border-b bg-muted/50 px-5 py-3 text-sm">
            <span className="font-semibold text-navy-900">EV charger procurement — public AC charging</span>
            <span className="rounded-full bg-success-bg px-2 py-0.5 text-xs font-medium text-success">Completed</span>
          </div>
          <div className="grid gap-4 p-5 md:grid-cols-[1fr_1fr_1fr]">
            <div className="rounded-xl border p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Primary standard</p>
              <p className="mt-2 font-semibold text-navy-900">IS 17017 (Part 1) : 2018</p>
              <p className="text-sm text-muted-foreground">Electric Vehicle Conductive Charging System — General Requirements</p>
              <p className="mt-3 text-xs text-warning">Version requires verification</p>
            </div>
            <div className="rounded-xl border p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Connected requirements</p>
              <ul className="mt-2 space-y-1 text-sm">
                <li>Connector — IS 17017 (Part 2/Sec 2)</li>
                <li>EMC tests — IS 17017 (Part 21/Sec 2)</li>
                <li>Enclosure IP code — IS/IEC 60529</li>
                <li>Installation — IS 732, IS 3043</li>
              </ul>
            </div>
            <div className="rounded-xl border p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">What’s missing</p>
              <ul className="mt-2 space-y-1 text-sm">
                <li className="text-danger">Connector type not specified</li>
                <li className="text-danger">Supply voltage and phases not specified</li>
                <li className="text-danger">IP rating not specified (outdoor)</li>
                <li className="text-warning">No acceptance criteria</li>
              </ul>
            </div>
          </div>
        </div>
      </Section>

      {/* -------------------------------------------------------------- Vision */}
      <Section tone="muted" eyebrow="Startup vision" title="From SIH prototype to procurement assurance infrastructure">
        <div className="grid gap-4 md:grid-cols-3">
          <Feature icon={Network} title="Procurement portal integration">An API-first engine designed to plug into e-procurement workflows, so specifications are checked before a tender is published.</Feature>
          <Feature icon={ShieldCheck} title="Authorised standards data">A controlled ingestion workflow with provenance and verification, ready for authorised official data partnerships.</Feature>
          <Feature icon={ClipboardCheck} title="Supplier readiness">The same intelligence helps manufacturers and MSMEs understand the standards and certification a tender will require.</Feature>
        </div>
        <p className="mt-6 text-sm text-muted-foreground">Roadmap items are plans, not current features.</p>
      </Section>

      {/* ------------------------------------------------------------------ CTA */}
      <section className="bg-navy-900 py-16">
        <div className="container-page flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
          <div>
            <h2 className="text-2xl font-semibold text-white sm:text-3xl">Check your next specification before it becomes a tender.</h2>
            <p className="mt-2 text-navy-100">Start with a one-line product description, or upload a PDF/DOCX tender.</p>
          </div>
          <Link href="/analysis/new" className={cn(buttonVariants({ size: 'lg' }), 'h-11 bg-saffron-500 px-5 text-base text-white hover:bg-saffron-600')}>
            Analyze a Specification <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
      </section>
    </>
  );
}
