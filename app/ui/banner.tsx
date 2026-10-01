import type { ReactNode } from 'react';

// Identity block shown on every page: the name, the event, and the global navigation. Each page
// keeps its own <h1> underneath, so the banner stays the same height everywhere and the title has
// room to breathe on a phone.
//
// LOGO: drop the official Campo Nazionale 2027 artwork into public/ (SVG preferred — it scales and
// stays crisp on the emblem) and point LOGO_SRC at it, e.g. '/campo-2027.svg'. Until then a neutral
// monogram stands in. The swap is an explicit constant rather than a filesystem probe because a
// missing <img> renders as a broken-image icon, which is worse than a placeholder that looks
// deliberate.
const LOGO_SRC: string | null = null;
const EVENT = 'Campo Nazionale 2027';

export function Banner({ children }: { children?: ReactNode }) {
  return (
    <header className="banner">
      <a className="banner-identity" href="/">
        <span className="banner-mark">
          {LOGO_SRC ? <img src={LOGO_SRC} alt={EVENT} /> : <span aria-hidden="true">B</span>}
        </span>
        <span>
          <span className="banner-name">Bravely</span>
          <span className="banner-event">{EVENT}</span>
        </span>
      </a>
      {children && <nav className="row">{children}</nav>}
    </header>
  );
}
