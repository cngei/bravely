import type { ReactNode } from 'react';
export const metadata = { title: 'Bravely — JSON', description: 'Logica e API Bravely' };
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="it">
      <body style={{ fontFamily: 'system-ui', margin: '2rem', maxWidth: 1200 }}>{children}</body>
    </html>
  );
}
