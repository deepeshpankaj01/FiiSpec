'use client';

import { useParams } from 'next/navigation';
import { Suspense } from 'react';
import { PageSkeleton } from '@/components/layout/app-shell';
import { AnalysisView } from '@/features/analysis/results/analysis-view';

export default function AnalysisPage() {
  const params = useParams<{ id: string }>();
  return (
    <Suspense fallback={<PageSkeleton />}>
      <AnalysisView analysisId={params.id} />
    </Suspense>
  );
}
