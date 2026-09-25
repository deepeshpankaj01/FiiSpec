'use client';

import { FileText, FileUp, MessageSquareText } from 'lucide-react';
import Link from 'next/link';
import type { AnalysisDoc } from '@shared/analysis';
import { INPUT_MODE_LABELS } from '@shared/constants';
import { AnalysisStatusBadge } from '@/components/fiispec/badges';
import { timeAgo } from '@/lib/format';

const MODE_ICON = { DOCUMENT: FileUp, SPECIFICATION: FileText, DESCRIPTION: MessageSquareText } as const;

export function AnalysisList({ analyses }: { analyses: AnalysisDoc[] }) {
  return (
    <ul className="divide-y">
      {analyses.map((a) => {
        const Icon = MODE_ICON[a.inputMode];
        return (
          <li key={a.id}>
            <Link href={`/analysis/${a.id}`} className="flex flex-col gap-2 px-4 py-3 transition-colors hover:bg-muted/50 sm:flex-row sm:items-center sm:gap-4">
              <div className="flex min-w-0 flex-1 items-start gap-3">
                <span className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-navy-50 text-navy-900">
                  <Icon className="size-4" aria-hidden />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-navy-900">{a.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {INPUT_MODE_LABELS[a.inputMode]} · {a.createdByName} · {timeAgo(a.createdAt)}
                    {a.isDemo ? ' · Demo case' : ''}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 pl-11 sm:pl-0">
                {a.summary && !a.summary.abstained ? (
                  <span className="text-xs text-muted-foreground">
                    {a.summary.standardsIdentified} standards · {a.summary.gaps} gaps · readiness {a.summary.readinessScore ?? '—'}
                  </span>
                ) : null}
                <AnalysisStatusBadge status={a.status} />
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
