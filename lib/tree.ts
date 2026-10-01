// Pure layout for the skill DAG: turns a skill list into positioned nodes and edge paths.
// No React and no IO, so tests/tree.test.ts can pin the geometry and the edge rules.
import type { Skill } from './model';

// Sized for a circular emblem above a rounded card holding the title and description.
// Keep in step with .skill-node in app/globals.css: layout() derives every coordinate from
// these, and every node must be the same height or the grid would overlap.
export const NODE = { w: 184, h: 142, gapX: 30, gapY: 76 };

export interface TreeNode {
  skill: Skill;
  depth: number;
  x: number;
  y: number;
}
export interface TreeEdge {
  id: string;
  from: string;
  to: string;
  implicit: boolean;
  path: string;
}
export interface Tree {
  nodes: TreeNode[];
  edges: TreeEdge[];
  width: number;
  height: number;
  layers: number;
}

export function layout(skills: Skill[]): Tree {
  if (!skills.length) return { nodes: [], edges: [], width: 0, height: 0, layers: 0 };

  const byId = new Map(skills.map((skill) => [skill.id, skill]));
  const depths = new Map<string, number>();

  // Troop skills are the roots. A patrol skill sits one level below its deepest prerequisite,
  // so one with no explicit prerequisites still lands on level 1, under the two initials.
  const depthOf = (id: string): number => {
    const cached = depths.get(id);
    if (cached !== undefined) return cached;
    const skill = byId.get(id);
    if (!skill) return 0;
    // validateGraph() already forbids cycles; this only stops a malformed graph looping forever.
    depths.set(id, 0);
    const depth =
      skill.scope === 'troop' ? 0 : 1 + Math.max(0, ...skill.prerequisites.map(depthOf));
    depths.set(id, depth);
    return depth;
  };

  const byDepth = new Map<number, Skill[]>();
  for (const skill of skills) {
    const depth = depthOf(skill.id);
    byDepth.set(depth, [...(byDepth.get(depth) ?? []), skill]);
  }
  const layers = Array.from({ length: Math.max(...byDepth.keys()) + 1 }, (_, depth) =>
    (byDepth.get(depth) ?? []).sort((a, b) => a.title.localeCompare(b.title, 'it')),
  );

  const widest = Math.max(1, ...layers.map((layer) => layer.length));
  const width = widest * NODE.w + (widest - 1) * NODE.gapX;
  const height = layers.length * NODE.h + (layers.length - 1) * NODE.gapY;

  const nodes: TreeNode[] = [];
  layers.forEach((layer, depth) => {
    const rowWidth = layer.length * NODE.w + (layer.length - 1) * NODE.gapX;
    const offset = (width - rowWidth) / 2;
    layer.forEach((skill, index) => {
      nodes.push({
        skill,
        depth,
        x: offset + index * (NODE.w + NODE.gapX),
        y: depth * (NODE.h + NODE.gapY),
      });
    });
  });

  const placed = new Map(nodes.map((node) => [node.skill.id, node]));
  const edges: TreeEdge[] = [];
  const connect = (from: string, to: string, implicit: boolean) => {
    const a = placed.get(from);
    const b = placed.get(to);
    if (!a || !b) return;
    const sx = a.x + NODE.w / 2;
    const sy = a.y + NODE.h;
    const tx = b.x + NODE.w / 2;
    const ty = b.y;
    const mid = (sy + ty) / 2;
    edges.push({
      id: `${from}->${to}`,
      from,
      to,
      implicit,
      path: `M${sx} ${sy} C${sx} ${mid}, ${tx} ${mid}, ${tx} ${ty}`,
    });
  };

  const troopIds = skills.filter((skill) => skill.scope === 'troop').map((skill) => skill.id);
  for (const skill of skills) {
    for (const prerequisite of skill.prerequisites) connect(prerequisite, skill.id, false);
    // lib/domain.ts makes every patrol skill depend on both troop skills, whether or not it
    // says so. Drawing that only on the entry-level skills keeps the graph readable: anything
    // deeper inherits the same requirement transitively through its own prerequisites.
    if (skill.scope === 'patrol' && depthOf(skill.id) === 1)
      for (const troopId of troopIds)
        if (!skill.prerequisites.includes(troopId)) connect(troopId, skill.id, true);
  }

  return { nodes, edges, width, height, layers: layers.length };
}
