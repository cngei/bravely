'use client';
// Read-only React Flow view of the skill DAG. The geometry still comes from lib/tree.ts —
// React Flow only pans, zooms and draws the edges, so layout() and its tests stay untouched.
// Handles are rendered but invisible: step 3 of the plan makes them connectable for the
// admin editor, and edges need them to anchor even in read-only mode.
import { useMemo, useState } from 'react';
import {
  Controls,
  Handle,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { STATUS_LABELS } from './labels';
import { TreeScenery } from './tree-scenery';
import { SkillSheet, type SheetForm, type SheetSkill } from './skill-sheet';

// Only what a node renders: the full Skill carries forms and descriptions that would be
// serialised to the client for nothing.
export interface GraphNode {
  id: string;
  title: string;
  /** Already truncated by the server: Skill.description allows up to 10000 characters. */
  description: string;
  scope: 'troop' | 'patrol';
  status?: string;
  /** The form colour the patrol actually chose, once there is evidence. */
  color?: 'blue' | 'amber';
  /** Titles, not ids: the sheet shows them to a human. */
  missing: string[];
  /** Enough of each form to say what the proof asks for, without the editing machinery. */
  forms: SheetForm[];
  x: number;
  y: number;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  implicit: boolean;
}

type SkillData = {
  title: string;
  description: string;
  scope: 'troop' | 'patrol';
  status?: string;
  color?: 'blue' | 'amber';
};

// Stand-in for a real emblem: Skill has no icon field yet, so derive initials from the title.
// Swapping this for an <svg> is a one-line change once the model carries one.
const initials = (title: string) =>
  title
    .split(/\s+/)
    .filter((word) => word.length > 2)
    .slice(0, 2)
    .map((word) => word[0]?.toLocaleUpperCase('it'))
    .join('') || title.slice(0, 2).toLocaleUpperCase('it');

function Pip({ status, color }: { status?: string; color?: 'blue' | 'amber' }) {
  if (status === 'locked')
    return (
      <span className="skill-pip" data-pip="locked">
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path
            d="M5 7V5.5a3 3 0 0 1 6 0V7"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
          <rect x="3.6" y="7" width="8.8" height="6.2" rx="1.6" fill="currentColor" />
        </svg>
      </span>
    );
  if (status === 'completed')
    return (
      <span className="skill-pip" data-pip="completed">
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path
            d="M4 8.4 L6.7 11 L12 5.4"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.1"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    );
  // In progress: the pip takes the colour of the chosen path, or stays neutral if the
  // patrol has not picked one yet.
  return <span className="skill-pip" data-pip={color ?? 'none'} />;
}

function SkillNode({ data }: NodeProps<Node<SkillData>>) {
  const label = data.status
    ? (STATUS_LABELS[data.status] ?? data.status)
    : data.scope === 'troop'
      ? 'Reparto'
      : 'Pattuglia';
  return (
    <>
      <Handle type="target" position={Position.Top} className="tree-handle" />
      <div
        className="skill-node"
        data-status={data.status}
        title={`${data.title} — ${label}`}
        aria-label={`${data.title}, ${label}`}
      >
        <span className="skill-emblem" data-status={data.status}>
          <span className="skill-glyph">{initials(data.title)}</span>
          <Pip status={data.status} color={data.color} />
        </span>
        <span className="skill-card">
          <span className="skill-name">{data.title}</span>
          {data.description && <span className="skill-desc">{data.description}</span>}
        </span>
      </div>
      <Handle type="source" position={Position.Bottom} className="tree-handle" />
    </>
  );
}

// Defined once, outside the component: React Flow warns on an unstable nodeTypes reference.
const nodeTypes = { skill: SkillNode };

export function SkillGraph({ nodes, edges }: { nodes: GraphNode[]; edges: GraphEdge[] }) {
  const [openId, setOpenId] = useState<string>();
  const open = nodes.find((node) => node.id === openId);
  const sheet: SheetSkill | null = open
    ? {
        id: open.id,
        title: open.title,
        description: open.description,
        glyph: initials(open.title),
        status: open.status,
        color: open.color,
        missing: open.missing,
        forms: open.forms,
      }
    : null;

  const flowNodes = useMemo<Node<SkillData>[]>(
    () =>
      nodes.map((node) => ({
        id: node.id,
        type: 'skill',
        position: { x: node.x, y: node.y },
        data: {
          title: node.title,
          description: node.description,
          scope: node.scope,
          status: node.status,
          color: node.color,
        },
      })),
    [nodes],
  );

  const flowEdges = useMemo<Edge[]>(
    () =>
      edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        type: 'smoothstep',
        // Dashed means the implicit initial-skill requirement from lib/domain.ts:62-63.
        style: edge.implicit ? { strokeDasharray: '5 5' } : undefined,
      })),
    [edges],
  );

  return (
    <div className="tree-flow">
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        nodesDraggable={false}
        nodesConnectable={false}
        edgesFocusable={false}
        onNodeClick={(_event, node) => setOpenId(node.id)}
        minZoom={0.3}
        maxZoom={1.5}
      >
        {/* Replaces <Background>: the scenery is the backdrop, dots on top read as clutter. */}
        <TreeScenery />
        <Controls showInteractive={false} />
      </ReactFlow>
      <SkillSheet skill={sheet} onClose={() => setOpenId(undefined)} />
    </div>
  );
}
