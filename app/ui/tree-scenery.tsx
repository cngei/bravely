'use client';
// Decorative parallax backdrop for the skill graph. Must be rendered as a child of
// <ReactFlow> so useViewport() can read the pan offset from its context.
//
// Both layers are bottom-anchored bands tiled horizontally by an SVG <pattern> in
// userSpaceOnUse units, so shapes keep a fixed pixel size no matter how large the container
// is — scaling an SVG to cover the viewport made them absurdly big. Vertical parallax is kept
// much weaker than horizontal: a ground line that slides up and down reads as a mistake.
//
// Offsets are CSS custom properties rather than an inline transform, so
// prefers-reduced-motion can neutralise the movement from globals.css.
import type { CSSProperties } from 'react';
import { useViewport } from '@xyflow/react';

const offset = (x: number, y: number, fx: number, fy: number) =>
  ({ '--px': `${x * fx}px`, '--py': `${y * fy}px` }) as CSSProperties;

// One conifer: a two-tier silhouette on a baseline, drawn around its centre.
const conifer = (cx: number, base: number, height: number, spread: number) =>
  [
    `M${cx - spread} ${base}`,
    `L${cx - spread * 0.55} ${base - height * 0.42}`,
    `L${cx - spread * 0.78} ${base - height * 0.42}`,
    `L${cx} ${base - height}`,
    `L${cx + spread * 0.78} ${base - height * 0.42}`,
    `L${cx + spread * 0.55} ${base - height * 0.42}`,
    `L${cx + spread} ${base}`,
    'Z',
  ].join(' ');

export function TreeScenery() {
  const { x, y } = useViewport();
  return (
    <div className="tree-scenery" aria-hidden="true">
      {/* Far: a soft rolling tree-line. Tile is 560 wide and starts and ends at the same
          height so it repeats without a seam. */}
      <div className="tree-layer tree-layer-far" style={offset(x, y, 0.14, 0.04)}>
        <svg width="100%" height="100%">
          <defs>
            <pattern id="scenery-far" patternUnits="userSpaceOnUse" width="560" height="240">
              <path
                fill="currentColor"
                d="M0 240 L0 150 Q40 108 82 140 Q124 94 172 130 Q214 102 254 136 Q304 88 352 130 Q402 104 452 142 Q504 110 560 150 L560 240 Z"
              />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#scenery-far)" />
        </svg>
      </div>

      {/* Near: defined conifers on a continuous ground line, tiled every 420px. */}
      <div className="tree-layer tree-layer-mid" style={offset(x, y, 0.34, 0.1)}>
        <svg width="100%" height="100%">
          <defs>
            <pattern id="scenery-mid" patternUnits="userSpaceOnUse" width="420" height="240">
              <g fill="currentColor">
                <rect y="196" width="420" height="44" />
                <path d={conifer(58, 198, 84, 30)} />
                <path d={conifer(158, 198, 122, 38)} />
                <path d={conifer(268, 198, 72, 26)} />
                <path d={conifer(360, 198, 104, 34)} />
              </g>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#scenery-mid)" />
        </svg>
      </div>
    </div>
  );
}
