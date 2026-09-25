import type { GraphEdge, GraphNode, GraphNodeGroup, StandardsGraph } from '@shared/analysis';

export const GROUP_STYLE: Record<GraphNodeGroup, { label: string; color: string; bg: string }> = {
  PRODUCT: { label: 'Product', color: '#e07a1f', bg: '#fff4e8' },
  PRIMARY: { label: 'Primary standard', color: '#0b2545', bg: '#eef3fa' },
  NORMATIVE_REFERENCE: { label: 'Normative reference', color: '#1d4577', bg: '#ffffff' },
  TEST_METHOD: { label: 'Test method', color: '#2b6cb0', bg: '#ffffff' },
  SAFETY: { label: 'Safety', color: '#c53030', bg: '#ffffff' },
  INSTALLATION: { label: 'Installation', color: '#2f855a', bg: '#ffffff' },
  TERMINOLOGY: { label: 'Terminology', color: '#52606d', bg: '#ffffff' },
  RELATED_PRODUCT: { label: 'Related product', color: '#c1600d', bg: '#ffffff' },
  RELATED_STANDARD: { label: 'Related standard', color: '#6b46c1', bg: '#ffffff' },
  AMENDMENT: { label: 'Amendment', color: '#a8670f', bg: '#fff8eb' },
  SUPERSEDED: { label: 'Superseded', color: '#9aa5b1', bg: '#f5f7fa' },
};

export const GROUP_ORDER: GraphNodeGroup[] = ['PRODUCT', 'PRIMARY', 'NORMATIVE_REFERENCE', 'RELATED_PRODUCT', 'TEST_METHOD', 'SAFETY', 'INSTALLATION', 'RELATED_STANDARD', 'TERMINOLOGY', 'AMENDMENT', 'SUPERSEDED'];

export const EDGE_LABEL: Record<GraphEdge['type'], string> = {
  APPLIES_TO: 'applies to',
  NORMATIVE_REFERENCE: 'normative ref.',
  RELATED_STANDARD: 'related',
  TEST_METHOD: 'test method',
  SAFETY: 'safety',
  INSTALLATION: 'installation',
  TERMINOLOGY: 'terminology',
  RELATED_PRODUCT: 'related product',
  SUPERSEDES: 'supersedes',
  AMENDED_BY: 'amended by',
};

export interface Positioned {
  node: GraphNode;
  x: number;
  y: number;
}

/**
 * Deterministic left-to-right layered layout by depth; within a layer, nodes
 * are grouped by relationship type so the graph reads as a blueprint.
 */
export function layoutGraph(graph: StandardsGraph): Positioned[] {
  const COLUMN = 300;
  const ROW = 84;
  const byDepth = new Map<number, GraphNode[]>();
  for (const n of graph.nodes) {
    const depth = n.group === 'AMENDMENT' || n.group === 'SUPERSEDED' ? Math.max(2, n.depth) : n.depth;
    byDepth.set(depth, [...(byDepth.get(depth) ?? []), n]);
  }
  const out: Positioned[] = [];
  const maxRows = Math.max(...[...byDepth.values()].map((l) => l.length));
  for (const [depth, nodes] of [...byDepth.entries()].sort((a, b) => a[0] - b[0])) {
    const sorted = [...nodes].sort((a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group) || a.label.localeCompare(b.label));
    const offset = ((maxRows - sorted.length) * ROW) / 2;
    sorted.forEach((node, i) => out.push({ node, x: depth * COLUMN, y: offset + i * ROW }));
  }
  return out;
}
