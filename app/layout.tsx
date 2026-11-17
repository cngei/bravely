import type { ReactNode } from 'react';
import { cookies } from 'next/headers';
import { Cinzel, EB_Garamond, Inter, Plus_Jakarta_Sans } from 'next/font/google';
import { resolveTheme, THEME_COOKIE } from '@/lib/theme';
import './globals.css';
import './themes/moderno.css';

// Pergamena: two faces carry the whole fantasy register, so globals.css never has to name a family.
// Cinzel is Roman inscriptional capitals — its lowercase are small caps, which is why headings,
// buttons and badges read as carved rather than shouted. EB Garamond is the book face underneath:
// a real text serif, legible at the long descriptions a skill can carry.
//
// Moderno: Plus Jakarta Sans for headings and Inter for text — a geometric display face over the
// most legible UI sans there is. All four are variable and self-hosted by next/font, so there is no
// call to Google at runtime; only the theme's own stylesheet names the families it uses.
const display = Cinzel({ subsets: ['latin'], variable: '--font-display', display: 'swap' });
const body = EB_Garamond({ subsets: ['latin'], variable: '--font-body', display: 'swap' });
const sans = Inter({ subsets: ['latin'], variable: '--font-sans', display: 'swap' });
const heading = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-heading',
  display: 'swap',
});

export const metadata = { title: 'Bravely', description: 'Percorso skill di reparto' };

export default async function Layout({ children }: { children: ReactNode }) {
  const theme = resolveTheme((await cookies()).get(THEME_COOKIE)?.value);
  return (
    <html
      lang="it"
      data-theme={theme}
      className={`${display.variable} ${body.variable} ${sans.variable} ${heading.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
