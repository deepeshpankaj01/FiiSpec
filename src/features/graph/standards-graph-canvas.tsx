'use client';

import '@xyflow/react/dist/style.css';
import {
  Background,
  Controls,
  type Edge,
  Handle,
  MarkerType,
  type Node,
  type NodeProps,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
} from '@xyflow/react';
import { Crosshair, Maximize2 } from 'lucide-react';
import { memo, useCallback, useMemo } from 'react';
import type { GraphEdge, GraphNode, StandardsGraph } from '@shared/analysis';
import { Button } from '@/components/ui/button';
import { EDGE_LABEL, GROUP_STYLE, layoutGraph } from './graph-model';

type StandardNodeData = { node: GraphNode; selected: boolean };

const StandardNode = memo(function StandardNode({ data }: NodeProps<Node<StandardNodeData>>) {
  const { node } = data;
  const style = GROUP_STYLE[node.group];
  return (
    <div
      className="w-[230px] rounded-lg border bg-white px-3 py-2 shadow-sm transition-shadow"
      style={{ borderLeft: `4px solid ${style.color}`, background: style.bg, boxShadow: data.selected ? `0 0 0 2px ${style.color}` : undefined }}
    >
      <Handle type="target" position={Position.Left} className="!size-1.5 !border-0 !bg-transparent" />
      <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: style.color }}>
        {style.label}
      </p>
      <p className="truncate text-sm font-semibold text-navy-900">{node.label}</p>
      <p className="truncate text-[11px] text-muted-foreground">{node.title}</p>
      <Handle type="source" position={Position.Right} className="!size-1.5 !border-0 !bg-transparent" />
    </div>
  );
});

const NODE_TYPES = { standard: StandardNode };

function Canvas({ graph, selectedId, onSelectNode, onSelectEdge }: { graph: StandardsGraph; selectedId: string | null; onSelectNode: (n: GraphNode) => void; onSelectEdge: (e: GraphEdge) => void }) {
  const flow = useReactFlow();
  const positioned = useMemo(() => layoutGraph(graph), [graph]);
  const nodes: Node<StandardNodeData>[] = useMemo(
    () => positioned.map((p) => ({ id: p.node.id, type: 'standard', position: { x: p.x, y: p.y }, data: { node: p.node, selected: p.node.id === selectedId }, draggable: true })),
    [positioned, selectedId],
  );
  const edges: Edge[] = useMemo(
    () =>
      graph.edges.map((e) => {
        const color = e.type === 'APPLIES_TO' ? GROUP_STYLE.PRIMARY.color : e.type === 'SUPERSEDES' ? GROUP_STYLE.SUPERSEDED.color : e.type === 'AMENDED_BY' ? GROUP_STYLE.AMENDMENT.color : GROUP_STYLE[e.type as keyof typeof GROUP_STYLE]?.color ?? '#9aa5b1';
        return {
          id: e.id,
          source: e.source,
          target: e.target,
          type: 'smoothstep',
          label: EDGE_LABEL[e.type],
          labelStyle: { fontSize: 10, fill: '#52606d' },
          labelBgStyle: { fill: '#ffffff' },
          style: { stroke: color, strokeWidth: 1.5, strokeDasharray: e.provenanceType === 'CURATED_EXPERT' ? '5 4' : undefined },
          markerEnd: { type: MarkerType.ArrowClosed, color, width: 14, height: 14 },
          interactionWidth: 18,
        } satisfies Edge;
      }),
    [graph.edges],
  );

  const focusPrimary = useCallback(() => {
    const primary = positioned.find((p) => p.node.group === 'PRIMARY');
    if (primary) void flow.setCenter(primary.x + 115, primary.y + 30, { zoom: 1.1, duration: 400 });
  }, [flow, positioned]);

  return (
    <div className="relative h-[560px] w-full overflow-hidden rounded-xl border bg-white">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        minZoom={0.3}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
        onNodeClick={(_, n) => onSelectNode((n.data as StandardNodeData).node)}
        onEdgeClick={(_, e) => {
          const edge = graph.edges.find((x) => x.id === e.id);
          if (edge) onSelectEdge(edge);
        }}
        nodesConnectable={false}
        elementsSelectable
        aria-label="Standards relationship graph"
      >
        <Background gap={24} color="#e4e9f0" />
        <Controls showInteractive={false} position="bottom-left" />
      </ReactFlow>
      <div className="absolute right-3 top-3 flex gap-2">
        <Button size="sm" variant="outline" className="bg-white" onClick={() => void flow.fitView({ padding: 0.15, duration: 400 })}>
          <Maximize2 aria-hidden /> Reset view
        </Button>
        <Button size="sm" variant="outline" className="bg-white" onClick={focusPrimary}>
          <Crosshair aria-hidden /> Focus primary
        </Button>
      </div>
    </div>
  );
}

export default function StandardsGraphCanvas(props: { graph: StandardsGraph; selectedId: string | null; onSelectNode: (n: GraphNode) => void; onSelectEdge: (e: GraphEdge) => void }) {
  return (
    <ReactFlowProvider>
      <Canvas {...props} />
    </ReactFlowProvider>
  );
}
