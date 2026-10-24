import type { ReactNode } from 'react';

// Identity block shown on every page: the name, the event, and the global navigation. Each page
// keeps its own <h1> underneath, so the banner stays the same height everywhere and the title has
// room to breathe on a phone.
//
// LOGO: the Campo Nazionale 2027 emblem, served as a downscaled copy of logo-cn27.png at the repo
// root (an SVG would be crisper, if one turns up). Set LOGO_SRC to null to fall back to the neutral
// monogram. The swap is an explicit constant rather than a filesystem probe because a missing <img>
// renders as a broken-image icon, which is worse than a placeholder that looks deliberate. The
// emblem brings its own outline and its crest breaks the circle, so it drops the round frame.
const LOGO_SRC: string | null = '/logo-cn27.png';
const EVENT = 'Campo Nazionale 2027';

export function Banner({ children }: { children?: ReactNode }) {
  return (
    <header className="banner">
      <a className="banner-identity" href="/">
        {LOGO_SRC ? (
          <img className="banner-logo" src={LOGO_SRC} alt={EVENT} />
        ) : (
          <span className="banner-mark">
            <span aria-hidden="true">B</span>
          </span>
        )}
        <span>
          <span className="banner-name">Bravely</span>
          <span className="banner-event">{EVENT}</span>
        </span>
      </a>
      {children && <nav className="row">{children}</nav>}
    </header>
  );
}
