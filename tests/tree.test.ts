import { describe, it, expect } from 'vitest';
import type { Skill } from '../lib/model';
import { layout, NODE } from '../lib/tree';

const form = {
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

// initial-1 initial-2        depth 0
//     a        b             depth 1  (b explicitly requires initial-1)
//         c                  depth 2  (requires a and b)
//         d                  depth 3  (requires c)
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

  it('places a skill below its deepest prerequisite, transitively', () => {
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

  it('survives an empty catalogue', () => {
    expect(layout([])).toEqual({ nodes: [], edges: [], width: 0, height: 0, layers: 0 });
  });

  it('does not loop on a malformed cycle', () => {
    const cyclic = [skill('x', 'patrol', ['y']), skill('y', 'patrol', ['x'])];
    expect(() => layout(cyclic)).not.toThrow();
  });
});
