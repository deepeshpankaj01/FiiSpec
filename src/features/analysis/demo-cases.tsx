'use client';

import { collection, query, where } from 'firebase/firestore';
import { FlaskConical, Loader2, Play } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import type { BenchmarkCase } from '@shared/knowledge';
import { Button } from '@/components/ui/button';
import { api, friendlyError } from '@/lib/firebase/callables';
import { getFirebase } from '@/lib/firebase/client';
import { useQuery } from '@/lib/firebase/hooks';
import { cn } from '@/lib/utils';

/** One-click demo cases: prepared benchmark inputs that run through the real pipeline. */
export function DemoCases({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const [running, setRunning] = useState<string | null>(null);
  const cases = useQuery<BenchmarkCase>(
    () => query(collection(getFirebase().db, 'benchmarkCases'), where('lifecycle', '==', 'PUBLISHED'), where('isDemo', '==', true)),
    'demo-cases',
  );

  const run = async (id: string) => {
    setRunning(id);
    try {
      const { analysisId } = await api.createAnalysis({ mode: 'DESCRIPTION', form: {}, benchmarkCaseId: id });
      router.push(`/analysis/${analysisId}`);
    } catch (e) {
      toast.error(friendlyError(e));
      setRunning(null);
    }
  };

  if (!cases.loading && !cases.data.length) return null;
  const ordered = [...cases.data].sort((a, b) => (a.id === 'ev-ac-public' ? -1 : b.id === 'ev-ac-public' ? 1 : a.title.localeCompare(b.title)));

  return (
    <section aria-labelledby="demo-cases-title" className="rounded-xl border bg-white">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <FlaskConical className="size-4 text-saffron-500" aria-hidden />
        <h2 id="demo-cases-title" className="text-sm font-semibold">Demo cases</h2>
        <span className="text-xs text-muted-foreground">— prepared inputs, analysed live by the real pipeline</span>
      </div>
      <ul className={cn('grid divide-y', !compact && 'md:grid-cols-2 md:divide-y-0')}>
        {cases.loading
          ? Array.from({ length: 2 }, (_, i) => <li key={i} className="h-16 animate-pulse bg-muted/40" />)
          : ordered.map((c) => (
              <li key={c.id} className="flex items-start justify-between gap-3 p-4 md:border-b">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-navy-900">{c.title}</p>
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">“{c.inputText.replace(/\n/g, ' ')}”</p>
                </div>
                <Button size="sm" variant="outline" disabled={running !== null} onClick={() => void run(c.id)} aria-label={`Run demo case: ${c.title}`}>
                  {running === c.id ? <Loader2 className="animate-spin" aria-hidden /> : <Play aria-hidden />} Run
                </Button>
              </li>
            ))}
      </ul>
    </section>
  );
}
