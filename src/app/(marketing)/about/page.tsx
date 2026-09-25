import { DISCLAIMER } from '@shared/constants';

export const metadata = { title: 'About FiiSpec' };

export default function AboutPage() {
  return (
    <div className="container-page max-w-4xl py-14">
      <p className="eyebrow mb-2">About FiiSpec</p>
      <h1 className="text-3xl font-semibold sm:text-4xl">Standards intelligence and procurement assurance</h1>
      <p className="mt-4 text-lg text-muted-foreground">
        FiiSpec transforms a procurement specification into an evidence-backed map of applicable Indian Standards, connected requirements, current versions, certification context, specification gaps, and procurement-ready output.
      </p>

      <section className="mt-12 space-y-3">
        <h2 className="text-xl font-semibold">Who it is for</h2>
        <p className="text-muted-foreground">
          Government procurement officers, PSU procurement teams, procurement consultants, technical evaluators, and manufacturers and MSMEs preparing to bid. Roles in FiiSpec: Administrator, Procurement Officer, Reviewer and Organization User.
        </p>
      </section>

      <section id="data" className="mt-12 space-y-3 scroll-mt-24">
        <h2 className="text-xl font-semibold">Data &amp; honesty policy</h2>
        <ul className="list-disc space-y-2 pl-5 text-muted-foreground">
          <li>This prototype uses a <strong className="text-foreground">small curated benchmark dataset</strong> of Indian Standards, relationships and certification rules compiled from public sources (BIS listings, Ministry of Power, CEA, BEE). It does not represent complete BIS coverage.</li>
          <li>Records are marked <strong className="text-foreground">unverified</strong> until an administrator verifies them against the current official source. FiiSpec never claims a standard is current without that evidence.</li>
          <li>Scope texts are short curated summaries, not the official text of standards. Restricted content is not copied.</li>
          <li>AI output is always labelled as AI-generated interpretation, is grounded in quoted text, and is never treated as an official regulatory determination.</li>
          <li>Benchmark metrics shown in the admin console are measured on the curated benchmark cases only. They are not accuracy claims.</li>
        </ul>
      </section>

      <section id="security" className="mt-12 space-y-3 scroll-mt-24">
        <h2 className="text-xl font-semibold">Security &amp; privacy</h2>
        <ul className="list-disc space-y-2 pl-5 text-muted-foreground">
          <li>Uploaded tender documents are stored privately per organisation and are readable only by members of that organisation.</li>
          <li>Roles and organisation membership are enforced server-side through custom claims, Firestore and Storage Security Rules.</li>
          <li>AI credentials are held in Cloud Secret Manager and used only by Cloud Functions; they never reach the browser.</li>
          <li>Every important action — analyses, reviews, approvals, exports and knowledge-base changes — is recorded in an audit log.</li>
        </ul>
      </section>

      <p className="mt-12 rounded-xl border bg-muted/60 p-4 text-sm text-muted-foreground">{DISCLAIMER}</p>
    </div>
  );
}
