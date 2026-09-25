import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export const metadata = { title: 'How It Works' };

const STAGES = [
  {
    n: 1,
    title: 'Specification understanding',
    what: 'The input (description, pasted specification, or text extracted from a PDF/DOCX) is converted into a structured specification: product, category, intended use, technical parameters with normalised units, environment, cited standards, certification and testing mentions.',
    how: 'Deterministic extractors run first (units, IP/IK codes, connectors, standard citations). When AI is configured, a structured-output prompt normalises Hindi and Hinglish into English; every AI-reported parameter must quote text that exists in the input, or it is discarded.',
  },
  {
    n: 2,
    title: 'Candidate retrieval',
    what: 'Candidate Indian Standards are retrieved from the indexed dataset.',
    how: 'BM25 over curated titles, scope summaries and keywords, with query expansion from the product taxonomy, unioned with metadata matches on product type.',
  },
  {
    n: 3,
    title: 'Semantic relevance scoring',
    what: 'Each candidate is scored for how well its scope covers the product and its use.',
    how: 'When AI is available, the model assesses only the candidates it was given (by id). Any standard it mentions that was not supplied is ignored. Without AI, lexical similarity is used and labelled as such.',
  },
  {
    n: 4,
    title: 'Metadata filtering',
    what: 'Product type, sector, scope keywords and status filter and weight candidates.',
    how: 'Superseded and withdrawn standards can never be primary recommendations; secondary primaries must score close to the best match.',
  },
  {
    n: 5,
    title: 'Relationship expansion',
    what: 'The standards graph is expanded from the primary standards.',
    how: 'Only curated, provenance-backed relationships are followed: normative references, test methods, safety, installation, terminology, related products. Structural edges are followed one level further; contextual edges are leaves.',
  },
  {
    n: 6,
    title: 'Version & amendment checking',
    what: 'Every recommended and cited standard is checked against version records.',
    how: 'FiiSpec reports superseded, withdrawn, older-edition, undated and not-indexed references. It only says “Current (verified)” when an administrator verified the record within the last 12 months; otherwise “Version requires verification”.',
  },
  {
    n: 7,
    title: 'Certification mapping',
    what: 'Indexed certification and regulatory rules (Quality Control Orders, Compulsory Registration, BEE labelling, statutory regulations) are matched.',
    how: 'Classification is rule-based. Unverified rules are capped at “Potentially applicable — verify against current official requirement”. AI may only assess whether a rule’s condition appears to be met, with a quote from your text.',
  },
  {
    n: 8,
    title: 'Evidence validation & gap analysis',
    what: 'Evidence items are attached to every finding, and the specification is checked for gaps.',
    how: 'Gaps are justified by a category parameter template, quoted text, a version finding or a certification finding. AI-found issues are kept only if their quote is verbatim in the input.',
  },
  {
    n: 9,
    title: 'Final ranking & abstention',
    what: 'Recommendations receive an explainable score and a Confidence Score level.',
    how: 'If no candidate meets the evidence threshold, FiiSpec abstains: “FiiSpec could not establish sufficient evidence for a reliable recommendation.” The analysis is marked Review required and a review task is created.',
  },
];

export default function HowItWorksPage() {
  return (
    <div className="container-page py-14">
      <div className="max-w-3xl">
        <p className="eyebrow mb-2">How it works</p>
        <h1 className="text-3xl font-semibold sm:text-4xl">Simple on top. Deep underneath.</h1>
        <p className="mt-4 text-lg text-muted-foreground">
          FiiSpec runs a nine-stage pipeline that combines semantic AI, structured metadata, a standards knowledge graph, deterministic rules and evidence. No single model call decides the outcome.
        </p>
      </div>

      <ol className="mt-12 space-y-4">
        {STAGES.map((s) => (
          <li key={s.n} className="grid gap-4 rounded-xl border bg-white p-5 md:grid-cols-[56px_1fr_1fr]">
            <span className="inline-flex size-10 items-center justify-center rounded-xl bg-navy-900 text-sm font-semibold text-white">{s.n}</span>
            <div>
              <h2 className="text-lg font-semibold">{s.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{s.what}</p>
            </div>
            <p className="rounded-lg bg-muted/60 p-3 text-sm text-foreground">{s.how}</p>
          </li>
        ))}
      </ol>

      <div className="mt-12 grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border bg-white p-6">
          <h2 className="text-lg font-semibold">Architecture</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Next.js on Firebase App Hosting → Firebase Authentication → Cloud Functions (validated callables and asynchronous triggers) → Cloud Firestore and Cloud Storage → Claude via server-side secrets. Security Rules isolate each organisation; App Check protects callable endpoints.
          </p>
        </div>
        <div className="rounded-xl border bg-white p-6">
          <h2 className="text-lg font-semibold">Confidence, honestly</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            The Confidence Score combines semantic relevance, product match, scope match, industry match, relationship evidence and version evidence. It is an explainable ranking signal — not a calibrated probability and never “guaranteed accuracy”.
          </p>
        </div>
      </div>

      <div className="mt-10">
        <Link href="/analysis/new" className={cn(buttonVariants({ size: 'lg' }), 'h-11 px-5')}>
          Try it with a demo case <ArrowRight className="size-4" aria-hidden />
        </Link>
      </div>
    </div>
  );
}
