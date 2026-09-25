import { render, screen } from '@testing-library/react';
import { FirebaseError } from 'firebase/app';
import { describe, expect, it } from 'vitest';
import type { AnalysisDoc, GeneratedSpecificationDoc, StandardsGraph } from '@shared/analysis';
import { AnalysisStatusBadge, ConfidenceBadge, ProvenanceBadge, RelevanceMeter } from '@/components/fiispec/badges';
import { ProgressTracker } from '@/features/analysis/progress-tracker';
import { validateFile } from '@/features/analysis/new-analysis-form';
import { specToPlainText } from '@/features/analysis/results/specification-tab';
import { safeNext } from '@/features/auth/login-form';
import { layoutGraph } from '@/features/graph/graph-model';
import { friendlyError, withoutUndefined } from '@/lib/firebase/callables';
import { formatBytes, timeAgo } from '@/lib/format';

describe('status and provenance badges', () => {
  it('labels confidence as a Confidence Score, never accuracy', () => {
    render(<ConfidenceBadge level="REVIEW_REQUIRED" />);
    const badge = screen.getByText('Review required');
    expect(badge.closest('span')).toHaveAttribute('title', expect.stringMatching(/not a guaranteed accuracy/));
  });
  it('shows the four information classes distinctly', () => {
    render(
      <>
        <ProvenanceBadge value="VERIFIED_OFFICIAL" />
        <ProvenanceBadge value="CURATED_BENCHMARK" />
        <ProvenanceBadge value="AI_INTERPRETATION" />
        <ProvenanceBadge value="HUMAN_REVIEW_REQUIRED" />
      </>,
    );
    for (const label of ['Verified official information', 'Curated benchmark data', 'AI-generated interpretation', 'Human review required']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });
  it('renders relevance as an accessible meter', () => {
    render(<RelevanceMeter score={89} label="HIGH_RELEVANCE" />);
    expect(screen.getByRole('meter', { name: 'Relevance score' })).toHaveAttribute('aria-valuenow', '89');
  });
  it('renders analysis status', () => {
    render(<AnalysisStatusBadge status="REVIEW_REQUIRED" />);
    expect(screen.getByText('Review required')).toBeInTheDocument();
  });
});

describe('progress tracker', () => {
  it('reflects backend stage states exactly and hides skipped stages', () => {
    const now = new Date().toISOString();
    const analysis = {
      status: 'PROCESSING',
      currentStage: 'RETRIEVING',
      createdAt: now,
      updatedAt: now,
      stages: {
        UPLOADING: { state: 'SKIPPED' },
        READING_DOCUMENT: { state: 'SKIPPED' },
        UNDERSTANDING: { state: 'DONE', durationMs: 120 },
        RETRIEVING: { state: 'RUNNING' },
        RELATIONSHIPS: { state: 'PENDING' },
      },
    } as unknown as AnalysisDoc;
    render(<ProgressTracker analysis={analysis} />);
    expect(screen.queryByText('Uploading')).not.toBeInTheDocument();
    expect(screen.getByText('Understanding specification')).toHaveTextContent('done');
    expect(screen.getByText('Finding relevant standards…')).toBeInTheDocument();
    expect(screen.getByText('120 ms')).toBeInTheDocument();
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
  });
});

describe('client-side validation and helpers', () => {
  it('validates uploads by type and size', () => {
    expect(validateFile(new File(['x'], 'a.exe', { type: 'application/x-msdownload' }))).toMatch(/Unsupported/);
    expect(validateFile(new File([], 'a.pdf', { type: 'application/pdf' }))).toMatch(/empty/);
    expect(validateFile(new File(['%PDF-1.7'], 'a.pdf', { type: 'application/pdf' }))).toBeNull();
  });
  it('only allows same-origin relative redirects after sign-in', () => {
    expect(safeNext('/analysis/new')).toBe('/analysis/new');
    expect(safeNext('https://evil.example')).toBe('/dashboard');
    expect(safeNext('//evil.example')).toBe('/dashboard');
    expect(safeNext(null)).toBe('/dashboard');
  });
  it('maps errors to friendly messages without leaking details', () => {
    expect(friendlyError(new FirebaseError('functions/permission-denied', 'raw internal detail'))).toBe('You do not have permission to do this.');
    expect(friendlyError(new FirebaseError('functions/invalid-argument', 'form.description: Describe the requirement'))).toBe('form.description: Describe the requirement');
    expect(friendlyError(new Error('stack trace at foo.ts:12'))).toBe('Something went wrong. Please try again.');
  });
  it('drops undefined fields before calling functions', () => {
    expect(withoutUndefined({ a: 1, b: undefined, c: { d: undefined, e: 'x' } })).toEqual({ a: 1, c: { e: 'x' } });
  });
  it('formats sizes and relative times', () => {
    expect(formatBytes(2048)).toBe('2 KB');
    expect(timeAgo(new Date(Date.now() - 5 * 60_000).toISOString())).toBe('5 min ago');
  });
});

describe('graph layout and specification text', () => {
  it('lays out the graph deterministically by depth', () => {
    const graph: StandardsGraph = {
      nodes: [
        { id: 'product', standardId: null, label: 'EV charger', title: 'Product', group: 'PRODUCT', status: null, confidence: null, depth: 0 },
        { id: 'p', standardId: 'p', label: 'IS 17017 (Part 1)', title: 't', group: 'PRIMARY', status: 'CURRENT', confidence: 'HIGH', depth: 1 },
        { id: 'r1', standardId: 'r1', label: 'B', title: 't', group: 'SAFETY', status: 'CURRENT', confidence: 'MEDIUM', depth: 2 },
        { id: 'r2', standardId: 'r2', label: 'A', title: 't', group: 'NORMATIVE_REFERENCE', status: 'CURRENT', confidence: 'MEDIUM', depth: 2 },
      ],
      edges: [],
      truncated: false,
    };
    const laid = layoutGraph(graph);
    const x = (id: string) => laid.find((p) => p.node.id === id)!.x;
    expect(x('product')).toBeLessThan(x('p'));
    expect(x('p')).toBeLessThan(x('r1'));
    // Normative references are ordered before safety within a layer.
    expect(laid.find((p) => p.node.id === 'r2')!.y).toBeLessThan(laid.find((p) => p.node.id === 'r1')!.y);
    expect(layoutGraph(graph)).toEqual(laid);
  });
  it('always includes the decision-support notice in copied specifications', () => {
    const spec = { version: 2, status: 'AI_DRAFT', sections: [{ key: 'product_definition', title: '1. Product definition', items: [{ text: 'Supply of chargers.', origin: 'SPECIFICATION_INPUT', standardIds: [] }] }] } as unknown as GeneratedSpecificationDoc;
    const text = specToPlainText(spec);
    expect(text).toMatch(/Not official government text/);
    expect(text).toMatch(/Generated draft — not reviewed/);
    expect(text).toMatch(/• Supply of chargers\./);
  });
});
