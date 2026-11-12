'use client';
// Upload, replace and remove a skill's explanatory PDF. The bytes go to POST /api/skill-docs as
// the raw body, like attachments do to /api/files: a Server Action body is capped at 1 MB.
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { SkillDocument as Doc } from '@/lib/model';
import { clearSkillDocumentAction } from '@/app/actions';

const size = (bytes: number) =>
  bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MiB`
    : `${Math.ceil(bytes / 1024)} KiB`;

export function SkillDocument({ skillId, document }: { skillId: string; document?: Doc }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function upload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const element = event.currentTarget;
    const file = new FormData(element).get('document');
    if (!(file instanceof File) || file.size === 0) return;
    setBusy(true);
    setError(undefined);
    try {
      const query = new URLSearchParams({ skillId, name: file.name });
      const response = await fetch(`/api/skill-docs?${query}`, { method: 'POST', body: file });
      const body = await response.json().catch(() => undefined);
      if (!response.ok) throw new Error(body?.error?.message ?? 'Caricamento non riuscito.');
      element.reset();
      router.refresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Caricamento non riuscito.');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError(undefined);
    const result = await clearSkillDocumentAction(skillId).catch(() => ({
      error: 'Rimozione non riuscita.',
    }));
    if ('error' in result && result.error) setError(result.error);
    setBusy(false);
  }

  return (
    <section className="card" style={{ marginBottom: '1.5rem' }}>
      <h3>Documento esplicativo</h3>
      {document ? (
        <p className="row">
          <a href={`/api/skill-docs/${encodeURIComponent(skillId)}`}>{document.name}</a>
          <span className="muted">{size(document.size)}</span>
          <button type="button" data-variant="danger" disabled={busy} onClick={remove}>
            Rimuovi
          </button>
        </p>
      ) : (
        <p className="muted">Nessun PDF: la skill mostra solo la descrizione.</p>
      )}
      <form onSubmit={upload} className="row" style={{ marginTop: '0.5rem' }}>
        <label htmlFor={`doc-${skillId}`}>PDF della skill</label>
        <input
          id={`doc-${skillId}`}
          name="document"
          type="file"
          accept="application/pdf"
          required
        />
        <button type="submit" disabled={busy}>
          {busy ? 'Caricamento…' : document ? 'Sostituisci' : 'Carica PDF'}
        </button>
      </form>
      <p className="muted">
        Un solo PDF per skill, fino a 10 MiB. Si scarica anche dalle skill bloccate.
      </p>
      {error && <p className="error">{error}</p>}
    </section>
  );
}
