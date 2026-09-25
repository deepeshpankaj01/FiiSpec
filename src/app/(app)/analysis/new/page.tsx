import { PageHeader } from '@/components/layout/app-shell';
import { DemoCases } from '@/features/analysis/demo-cases';
import { NewAnalysisForm } from '@/features/analysis/new-analysis-form';

export const metadata = { title: 'New analysis' };

export default function NewAnalysisPage() {
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        eyebrow="New analysis"
        title="What are you procuring?"
        description="FiiSpec will identify applicable Indian Standards, connected requirements, versions, certification context and what your specification is missing."
      />
      <NewAnalysisForm />
      <div className="mt-10">
        <DemoCases />
      </div>
    </div>
  );
}
