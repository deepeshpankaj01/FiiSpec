/**
 * Stage 5 output — the Standards Relationship Graph for this analysis.
 * Every edge carries provenance; FiiSpec-ranking edges are labelled as such.
 */
import type { GraphEdge, GraphNode, GraphNodeGroup, StandardRecommendation, StandardsGraph, StructuredSpecification } from '../../../shared/analysis';
import type { KnowledgeBase } from '../../../shared/knowledge';
import type { ExpansionEdge } from './recommend';

const MAX_NODES = 45;

export function buildGraph(
  spec: StructuredSpecification,
  primary: StandardRecommendation[],
  related: StandardRecommendation[],
  expansionEdges: ExpansionEdge[],
  kb: KnowledgeBase,
): StandardsGraph {
  const nodes = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];
  let truncated = false;
  const standards = new Map(kb.standards.map((s) => [s.id, s]));

  const addNode = (node: GraphNode): boolean => {
    if (nodes.has(node.id)) return true;
    if (nodes.size >= MAX_NODES) {
      truncated = true;
      return false;
    }
    nodes.set(node.id, node);
    return true;
  };

  addNode({
    id: 'product',
    standardId: null,
    label: spec.productName,
    title: spec.productCategoryLabel ?? 'Product',
    group: 'PRODUCT',
    status: null,
    confidence: spec.categoryConfidence,
    depth: 0,
  });

  for (const p of primary) {
    addNode({ id: p.standardId, standardId: p.standardId, label: p.designation, title: p.title, group: 'PRIMARY', status: p.status, confidence: p.confidence, depth: 1 });
    edges.push({
      id: `e-product-${p.standardId}`,
      source: 'product',
      target: p.standardId,
      type: 'APPLIES_TO',
      provenanceType: 'FIISPEC_RANKING',
      statement: `Ranked as a primary standard for this requirement (score ${p.score}, ${p.confidence.toLowerCase().replace('_', ' ')} confidence).`,
      contextNote: null,
      source_ref: null,
      verificationStatus: p.verificationStatus,
      explanation: p.reasons[0] ?? null,
      explanationOrigin: 'RULE',
    });
  }

  const relatedById = new Map(related.map((r) => [r.standardId, r]));
  for (const { relationship, depth } of expansionEdges) {
    const target = relatedById.get(relationship.toId) ?? primary.find((p) => p.standardId === relationship.toId);
    if (!target || !nodes.has(relationship.fromId)) continue;
    const group: GraphNodeGroup = target.tier === 'PRIMARY' ? 'PRIMARY' : (relationship.type as GraphNodeGroup);
    const added = addNode({
      id: target.standardId,
      standardId: target.standardId,
      label: target.designation,
      title: target.title,
      group,
      status: target.status,
      confidence: target.confidence,
      depth: depth + 1,
    });
    if (!added) continue;
    edges.push({
      id: `e-${relationship.id}`,
      source: relationship.fromId,
      target: relationship.toId,
      type: relationship.type,
      provenanceType: relationship.provenance.type,
      statement: relationship.provenance.statement,
      contextNote: relationship.contextNote ?? null,
      source_ref: relationship.provenance.source ?? null,
      verificationStatus: relationship.verification.status,
      explanation: null,
      explanationOrigin: null,
    });
  }

  // Version context for primary standards: superseded predecessors and indexed amendments.
  for (const p of primary) {
    const record = standards.get(p.standardId);
    if (!record) continue;
    for (const old of record.supersedes) {
      const nodeId = old.standardId ?? `sup-${p.standardId}-${old.designation.replace(/[^A-Za-z0-9]/g, '')}`;
      const oldRecord = old.standardId ? standards.get(old.standardId) : undefined;
      if (!addNode({ id: nodeId, standardId: old.standardId ?? null, label: old.designation, title: oldRecord?.title ?? 'Superseded standard', group: 'SUPERSEDED', status: 'SUPERSEDED', confidence: null, depth: 2 })) continue;
      edges.push({
        id: `e-sup-${p.standardId}-${nodeId}`,
        source: p.standardId,
        target: nodeId,
        type: 'SUPERSEDES',
        provenanceType: 'VERSION_RECORD',
        statement: old.note ?? `${p.designation} supersedes ${old.designation} according to the version record.`,
        contextNote: null,
        source_ref: record.source,
        verificationStatus: record.verification.status,
        explanation: null,
        explanationOrigin: null,
      });
    }
    if (record.amendmentDataStatus === 'INDEXED') {
      for (const a of record.amendments) {
        const nodeId = `amd-${p.standardId}-${a.number}`;
        if (!addNode({ id: nodeId, standardId: null, label: `Amendment ${a.number}`, title: a.summary, group: 'AMENDMENT', status: null, confidence: null, depth: 2 })) continue;
        edges.push({
          id: `e-${nodeId}`,
          source: p.standardId,
          target: nodeId,
          type: 'AMENDED_BY',
          provenanceType: 'VERSION_RECORD',
          statement: `Amendment No. ${a.number}${a.date ? ` (${a.date})` : ''} recorded for ${p.designation}.`,
          contextNote: null,
          source_ref: a.source ?? null,
          verificationStatus: a.verification.status,
          explanation: null,
          explanationOrigin: null,
        });
      }
    }
  }

  // Keep only edges whose endpoints exist (truncation safety).
  const finalEdges = edges.filter((e, i, all) => nodes.has(e.source) && nodes.has(e.target) && all.findIndex((x) => x.id === e.id) === i);
  return { nodes: [...nodes.values()], edges: finalEdges, truncated };
}
