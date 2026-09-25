import {
  AlertOctagon,
  AlertTriangle,
  BadgeCheck,
  Bot,
  CircleDashed,
  CircleHelp,
  Clock,
  Database,
  Info,
  Loader2,
  ShieldCheck,
  UserCheck,
  XCircle,
} from 'lucide-react';
import type { ReactNode } from 'react';
import type {
  AnalysisStatus,
  CertificationClass,
  ConfidenceLevel,
  GapSeverity,
  ProvenanceClass,
  RelevanceLabel,
  VersionState,
} from '@shared/constants';
import {
  ANALYSIS_STATUS_LABELS,
  CERTIFICATION_CLASS_LABELS,
  CONFIDENCE_LABELS,
  GAP_SEVERITY_LABELS,
  PROVENANCE_LABELS,
  RELEVANCE_LABEL_TEXT,
  VERSION_STATE_LABELS,
} from '@shared/constants';
import { cn } from '@/lib/utils';

type Tone = 'navy' | 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'saffron';

const TONES: Record<Tone, string> = {
  navy: 'bg-navy-50 text-navy-900 ring-navy-100',
  success: 'bg-success-bg text-success ring-success/20',
  warning: 'bg-warning-bg text-warning ring-warning/25',
  danger: 'bg-danger-bg text-danger ring-danger/20',
  info: 'bg-info-bg text-info ring-info/20',
  neutral: 'bg-muted text-muted-foreground ring-border',
  saffron: 'bg-saffron-50 text-saffron-600 ring-saffron-100',
};

export function Chip({ tone = 'neutral', icon, children, className, title }: { tone?: Tone; icon?: ReactNode; children: ReactNode; className?: string; title?: string }) {
  return (
    <span
      title={title}
      className={cn('inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2 text-xs font-medium whitespace-nowrap ring-1 ring-inset [&>svg]:size-3.5', TONES[tone], className)}
    >
      {icon}
      {children}
    </span>
  );
}

const CONFIDENCE_TONE: Record<ConfidenceLevel, Tone> = { HIGH: 'success', MEDIUM: 'info', LOW: 'warning', REVIEW_REQUIRED: 'danger' };

export function ConfidenceBadge({ level }: { level: ConfidenceLevel }) {
  return (
    <Chip tone={CONFIDENCE_TONE[level]} icon={level === 'REVIEW_REQUIRED' ? <UserCheck /> : <ShieldCheck />} title="Confidence Score — a ranking signal, not a guaranteed accuracy">
      {CONFIDENCE_LABELS[level]}
    </Chip>
  );
}

const PROVENANCE_TONE: Record<ProvenanceClass, Tone> = {
  VERIFIED_OFFICIAL: 'success',
  CURATED_BENCHMARK: 'navy',
  AI_INTERPRETATION: 'saffron',
  HUMAN_REVIEW_REQUIRED: 'danger',
};
const PROVENANCE_ICON: Record<ProvenanceClass, ReactNode> = {
  VERIFIED_OFFICIAL: <BadgeCheck />,
  CURATED_BENCHMARK: <Database />,
  AI_INTERPRETATION: <Bot />,
  HUMAN_REVIEW_REQUIRED: <UserCheck />,
};

export function ProvenanceBadge({ value }: { value: ProvenanceClass }) {
  return (
    <Chip tone={PROVENANCE_TONE[value]} icon={PROVENANCE_ICON[value]}>
      {PROVENANCE_LABELS[value]}
    </Chip>
  );
}

const STATUS_TONE: Record<AnalysisStatus, Tone> = {
  AWAITING_UPLOAD: 'neutral',
  QUEUED: 'info',
  PROCESSING: 'info',
  COMPLETED: 'success',
  REVIEW_REQUIRED: 'warning',
  FAILED: 'danger',
};

export function AnalysisStatusBadge({ status }: { status: AnalysisStatus }) {
  const icon =
    status === 'PROCESSING' || status === 'QUEUED' ? <Loader2 className="animate-spin" /> : status === 'COMPLETED' ? <BadgeCheck /> : status === 'FAILED' ? <XCircle /> : status === 'REVIEW_REQUIRED' ? <UserCheck /> : <Clock />;
  return (
    <Chip tone={STATUS_TONE[status]} icon={icon}>
      {ANALYSIS_STATUS_LABELS[status]}
    </Chip>
  );
}

const SEVERITY_TONE: Record<GapSeverity, Tone> = { CRITICAL: 'danger', WARNING: 'warning', INFO: 'info' };
const SEVERITY_ICON: Record<GapSeverity, ReactNode> = { CRITICAL: <AlertOctagon />, WARNING: <AlertTriangle />, INFO: <Info /> };

export function SeverityBadge({ severity }: { severity: GapSeverity }) {
  return (
    <Chip tone={SEVERITY_TONE[severity]} icon={SEVERITY_ICON[severity]}>
      {GAP_SEVERITY_LABELS[severity]}
    </Chip>
  );
}

const CERT_TONE: Record<CertificationClass, Tone> = {
  APPLICABLE: 'success',
  POTENTIALLY_APPLICABLE: 'warning',
  MANUAL_VERIFICATION: 'danger',
  NOT_DETECTED: 'neutral',
};

export function CertificationBadge({ value }: { value: CertificationClass }) {
  const icon = value === 'APPLICABLE' ? <BadgeCheck /> : value === 'POTENTIALLY_APPLICABLE' ? <CircleHelp /> : value === 'MANUAL_VERIFICATION' ? <UserCheck /> : <CircleDashed />;
  return (
    <Chip tone={CERT_TONE[value]} icon={icon}>
      {CERTIFICATION_CLASS_LABELS[value]}
    </Chip>
  );
}

const VERSION_TONE: Record<VersionState, Tone> = {
  CURRENT_VERIFIED: 'success',
  REQUIRES_VERIFICATION: 'warning',
  OUTDATED_EDITION: 'warning',
  SUPERSEDED: 'danger',
  WITHDRAWN: 'danger',
  NOT_INDEXED: 'neutral',
  UNDATED_REFERENCE: 'info',
};

export function VersionBadge({ state }: { state: VersionState }) {
  return <Chip tone={VERSION_TONE[state]}>{VERSION_STATE_LABELS[state]}</Chip>;
}

export function RelevanceMeter({ score, label }: { score: number; label: RelevanceLabel }) {
  const color = score >= 70 ? 'bg-success' : score >= 55 ? 'bg-info' : score >= 35 ? 'bg-warning' : 'bg-danger';
  return (
    <div className="flex min-w-36 items-center gap-2" title={`Relevance score ${score}/100 — explainable ranking score, not a probability`}>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={score} aria-label="Relevance score">
        <div className={cn('h-full rounded-full', color)} style={{ width: `${Math.max(4, score)}%` }} />
      </div>
      <span className="text-xs font-medium whitespace-nowrap text-foreground">
        {RELEVANCE_LABEL_TEXT[label]} <span className="text-muted-foreground">· {score}</span>
      </span>
    </div>
  );
}

export function PrototypeBadge() {
  return (
    <Chip tone="saffron" icon={<Database />} title="Standards data comes from a small curated benchmark dataset; records are unverified until an administrator verifies them.">
      Prototype · Curated benchmark dataset
    </Chip>
  );
}
