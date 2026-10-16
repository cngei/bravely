// Shared between the read-only tree (skill-graph.tsx) and the admin editor (skill-editor.tsx), so
// a prerequisite is drawn the same way wherever it appears. Kept out of labels.ts on purpose:
// MarkerType is a runtime value from @xyflow/react, and labels.ts is imported by server pages that
// must not pull React Flow in.
import { MarkerType } from '@xyflow/react';

// Must stay in sync with --xy-edge-stroke-default in globals.css. React Flow renders marker <defs>
// outside the edge path, so an arrowhead cannot inherit the stroke colour the way the line does
// and has to be given its own value.
export const EDGE_INK = '#8c7a5e';

// The direction of a prerequisite was invisible without a head: the line said "these two are
// related", not "that one comes first". One frozen object, so React Flow emits a single <marker>
// definition shared by every edge rather than one per edge.
export const ARROW = {
  type: MarkerType.ArrowClosed,
  width: 15,
  height: 15,
  color: EDGE_INK,
} as const;
