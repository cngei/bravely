import { describe, it, expect } from 'vitest';
import type { Skill } from '../lib/model';
import { layout, NODE } from '../lib/tree';

const form = {
  id: 'f1',
  skillId: 'x',
  color: 'blue' as const,
  title: 'Blu',
  fields: [{ id: 'text', label: 'Testo', type: 'text' as const, required: true }],
};
const skill = (
  id: string,
  scope: 'troop' | 'patrol',
  prerequisites: string[] = [],
  title = id,
): Skill => ({
  id,
  title,
  description: '',
  scope,
  prerequisites,
  forms: [form],
  public: true,
  revision: 1,
});

// Drawn as it appears on screen — the trunk at the bottom, growing upwards:
//
//         d                  depth 3  (requires c)
//         c                  depth 2  (requires a and b)
//     a        b             depth 1  (b explicitly requires initial-1)
// initial-1 initial-2        depth 0
const graph = [
  skill('initial-1', 'troop'),
  skill('initial-2', 'troop'),
  skill('a', 'patrol'),
  skill('b', 'patrol', ['initial-1']),
  skill('c', 'patrol', ['a', 'b']),
  skill('d', 'patrol', ['c']),
];
const depthOf = (id: string) => layout(graph).nodes.find((n) => n.skill.id === id)?.depth;
const edge = (from: string, to: string) =>
  layout(graph).edges.find((e) => e.id === `${from}->${to}`);

describe('skill tree layout', () => {
  it('roots the troop skills and puts unblocked patrol skills one level below', () => {
    expect(depthOf('initial-1')).toBe(0);
    expect(depthOf('initial-2')).toBe(0);
    expect(depthOf('a')).toBe(1);
    // An explicit troop prerequisite must not push the skill deeper than its siblings.
    expect(depthOf('b')).toBe(1);
  });

  it('places a skill one level past its deepest prerequisite, transitively', () => {
    expect(depthOf('c')).toBe(2);
    expect(depthOf('d')).toBe(3);
  });

  it('draws explicit prerequisites as solid edges', () => {
    expect(edge('a', 'c')?.implicit).toBe(false);
    expect(edge('b', 'c')?.implicit).toBe(false);
    expect(edge('c', 'd')?.implicit).toBe(false);
    expect(edge('initial-1', 'b')?.implicit).toBe(false);
  });

  it('adds the unwritten initial-skill requirement only to entry-level skills', () => {
    expect(edge('initial-1', 'a')?.implicit).toBe(true);
    expect(edge('initial-2', 'a')?.implicit).toBe(true);
    // b already declares initial-1, so only the missing one is implied.
    expect(edge('initial-2', 'b')?.implicit).toBe(true);
    expect(edge('initial-1', 'b')?.implicit).toBe(false);
    // c and d inherit it through a and b; drawing it again would only add noise.
    expect(edge('initial-1', 'c')).toBeUndefined();
    expect(edge('initial-2', 'd')).toBeUndefined();
  });

  it('never emits an edge to or from a skill it did not place', () => {
    const { nodes, edges } = layout(graph);
    const ids = new Set(nodes.map((n) => n.skill.id));
    for (const e of edges) {
      expect(ids.has(e.from)).toBe(true);
      expect(ids.has(e.to)).toBe(true);
    }
  });

  it('sizes the canvas from the widest layer and keeps every node inside it', () => {
    const tree = layout(graph);
    expect(tree.layers).toBe(4);
    // The widest layer here has two nodes.
    expect(tree.width).toBe(2 * NODE.w + NODE.gapX);
    expect(tree.height).toBe(4 * NODE.h + 3 * NODE.gapY);
    for (const node of tree.nodes) {
      expect(node.x).toBeGreaterThanOrEqual(0);
      expect(node.x + NODE.w).toBeLessThanOrEqual(tree.width);
      expect(node.y + NODE.h).toBeLessThanOrEqual(tree.height);
    }
  });

  it('centres a layer that is narrower than the canvas', () => {
    const tree = layout(graph);
    const lonely = tree.nodes.find((n) => n.skill.id === 'd');
    expect(lonely?.x).toBe((tree.width - NODE.w) / 2);
  });

  it('puts the trunk on the bottom row and grows each level upwards', () => {
    const tree = layout(graph);
    const y = (id: string) => tree.nodes.find((n) => n.skill.id === id)!.y;
    const row = NODE.h + NODE.gapY;
    // Bottom row: its lower edge is the canvas floor.
    expect(y('initial-1')).toBe(3 * row);
    expect(y('initial-1') + NODE.h).toBe(tree.height);
    expect(y('initial-2')).toBe(y('initial-1'));
    expect(y('a')).toBe(2 * row);
    expect(y('c')).toBe(row);
    // The deepest skill is the crown, at the top.
    expect(y('d')).toBe(0);
  });

  it('runs every edge from the top of the prerequisite to the bottom of the dependant', () => {
    const tree = layout(graph);
    const at = (id: string) => tree.nodes.find((n) => n.skill.id === id)!;
    for (const e of tree.edges) {
      const from = at(e.from);
      const to = at(e.to);
      const start = `M${from.x + NODE.w / 2} ${from.y}`;
      const end = `${to.x + NODE.w / 2} ${to.y + NODE.h}`;
      expect(e.path.startsWith(`${start} `)).toBe(true);
      expect(e.path.endsWith(end)).toBe(true);
      // So the arrowhead, which sits at the end, points up at the dependant.
      expect(to.y + NODE.h).toBeLessThan(from.y);
    }
  });

  it('survives an empty catalogue', () => {
    expect(layout([])).toEqual({ nodes: [], edges: [], width: 0, height: 0, layers: 0 });
  });

  it('does not loop on a malformed cycle', () => {
    const cyclic = [skill('x', 'patrol', ['y']), skill('y', 'patrol', ['x'])];
    expect(() => layout(cyclic)).not.toThrow();
  });
});
