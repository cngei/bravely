import type { ReactNode } from 'react';
import './globals.css';
export const metadata = { title: 'Bravely', description: 'Percorso skill di reparto' };
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="it">
      <body>{children}</body>
    </html>
  );
}
