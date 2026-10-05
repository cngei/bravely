import type { ReactNode } from 'react';
import { Cinzel, EB_Garamond } from 'next/font/google';
import './globals.css';

// Two faces carry the whole fantasy register, so globals.css never has to name a family.
// Cinzel is Roman inscriptional capitals — its lowercase are small caps, which is why headings,
// buttons and badges read as carved rather than shouted. EB Garamond is the book face underneath:
// a real text serif, legible at the long descriptions a skill can carry. Both are variable, so one
// request covers every weight, and both are self-hosted by next/font — no call to Google at runtime.
const display = Cinzel({ subsets: ['latin'], variable: '--font-display', display: 'swap' });
const body = EB_Garamond({ subsets: ['latin'], variable: '--font-body', display: 'swap' });

export const metadata = { title: 'Bravely', description: 'Percorso skill di reparto' };

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="it" className={`${display.variable} ${body.variable}`}>
      <body>{children}</body>
    </html>
  );
}
