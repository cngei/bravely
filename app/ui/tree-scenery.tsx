'use client';
// Decorative parallax backdrop for the skill graph: a hand-drawn map border of distant ridges, a
// mountain range with a keep on its plateau, and a near treeline. Must be rendered as a child of
// <ReactFlow> so useViewport() can read the pan offset from its context.
//
// Every layer is a bottom-anchored band tiled horizontally by an SVG <pattern> in userSpaceOnUse
// units, so shapes keep a fixed pixel size no matter how large the container is — scaling an SVG to
// cover the viewport made them absurdly big. Each tile starts and ends at the same height so it
// repeats without a seam, and each pattern is exactly as tall as its layer so it never repeats
// vertically. Vertical parallax is kept much weaker than horizontal: a ground line that slides up
// and down reads as a mistake.
//
// Distance is carried by ink density, not by blur — see .tree-layer-{far,mid,near} in globals.css.
// Offsets are CSS custom properties rather than an inline transform, so prefers-reduced-motion can
// neutralise the movement from globals.css.
import type { CSSProperties } from 'react';
import { useViewport } from '@xyflow/react';

const BAND = 260;

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

// Battlements: `count` merlons spread along `width`, each sitting on top of the wall below.
const merlons = (x: number, top: number, width: number, count: number, h = 5) => {
  const step = width / count;
  return Array.from({ length: count }, (_, index) => (
    <rect key={index} x={x + index * step} y={top - h} width={step * 0.62} height={h} />
  ));
};

// The keep: a crenellated curtain wall between two towers, the taller one flying a pennant. It is
// the one landmark on the map, so it marks where the path is heading.
const keep = (cx: number, base: number) => (
  <>
    <rect x={cx - 26} y={base - 27} width={52} height={27} />
    {merlons(cx - 26, base - 27, 52, 5)}
    <rect x={cx - 35} y={base - 41} width={14} height={41} />
    {merlons(cx - 35, base - 41, 14, 2)}
    <rect x={cx + 20} y={base - 53} width={15} height={53} />
    {merlons(cx + 20, base - 53, 15, 2)}
    <rect x={cx + 26.8} y={base - 71} width={1.6} height={18} />
    <path d={`M${cx + 28.4} ${base - 70} l13 4.6 -13 4.6 Z`} />
  </>
);

export function TreeScenery() {
  const { x, y } = useViewport();
  return (
    <div className="tree-scenery" aria-hidden="true">
      {/* Far: a soft rolling ridge line, barely inked. Tile is 700 wide. */}
      <div className="tree-layer tree-layer-far" style={offset(x, y, 0.08, 0.03)}>
        <svg width="100%" height="100%">
          <defs>
            <pattern id="scenery-far" patternUnits="userSpaceOnUse" width="700" height={BAND}>
              <path
                fill="currentColor"
                d={`M0 ${BAND} L0 168 Q55 118 112 152 Q168 102 228 142 Q286 108 340 148 Q398 100 452 144 Q510 112 566 152 Q624 122 700 168 L700 ${BAND} Z`}
              />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#scenery-far)" />
        </svg>
      </div>

      {/* Mid: a jagged range with a plateau at x≈150–250 carrying the keep. Tile is 640 wide. */}
      <div className="tree-layer tree-layer-mid" style={offset(x, y, 0.2, 0.06)}>
        <svg width="100%" height="100%">
          <defs>
            <pattern id="scenery-mid" patternUnits="userSpaceOnUse" width="640" height={BAND}>
              <g fill="currentColor">
                <path
                  d={`M0 ${BAND} L0 212 L55 156 L100 188 L150 122 L250 122 L302 184 L356 134 L406 176 L466 128 L516 174 L576 150 L640 212 L640 ${BAND} Z`}
                />
                {keep(200, 122)}
              </g>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#scenery-mid)" />
        </svg>
      </div>

      {/* Near: defined conifers on a continuous ground line, tiled every 420px. */}
      <div className="tree-layer tree-layer-near" style={offset(x, y, 0.4, 0.11)}>
        <svg width="100%" height="100%">
          <defs>
            <pattern id="scenery-near" patternUnits="userSpaceOnUse" width="420" height={BAND}>
              <g fill="currentColor">
                <rect y="218" width="420" height={BAND - 218} />
                <path d={conifer(58, 220, 84, 30)} />
                <path d={conifer(158, 220, 122, 38)} />
                <path d={conifer(268, 220, 72, 26)} />
                <path d={conifer(360, 220, 104, 34)} />
              </g>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#scenery-near)" />
        </svg>
      </div>
    </div>
  );
}
