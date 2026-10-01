'use client';
import { useState } from 'react';
import type { SkillForm } from '@/lib/model';
import { submitEvidenceAction } from '@/app/actions';

// Matches the byte-sniffed allowlist in lib/files.ts. Advisory only — the server decides.
const ACCEPT = 'image/png,image/jpeg,image/gif,image/webp,video/mp4,video/webm';

// Attachments go to /api/files, not through the Server Action, whose body is capped at 1 MB.
// The route expects the raw bytes as the body with the metadata in the query string, so a
// plain multipart <form> would not work here.
async function upload(skillId: string, targetId: string, files: File[]): Promise<string[]> {
  const ids: string[] = [];
  for (const file of files) {
    const query = new URLSearchParams({ skillId, targetId, name: file.name });
    const response = await fetch(`/api/files?${query}`, { method: 'POST', body: file });
    const body = await response.json().catch(() => undefined);
    if (!response.ok)
      throw new Error(body?.error?.message ?? `Caricamento di ${file.name} non riuscito.`);
    ids.push(body.id);
  }
  return ids;
}

export function EvidenceForm({
  skillId,
  targetId,
  forms,
  disabled,
  disabledReason,
}: {
  skillId: string;
  targetId: string;
  forms: SkillForm[];
  /** Consultation mode: the questions are readable, submission is not possible. */
  disabled?: boolean;
  disabledReason?: string;
}) {
  const [color, setColor] = useState(forms[0].color);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const form = forms.find((f) => f.color === color) ?? forms[0];

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Defence in depth: the button is disabled, but a stray Enter must not submit either.
    if (disabled) return;
    const data = new FormData(event.currentTarget);
    setError(undefined);
    setBusy(true);
    try {
      const answers: Record<string, string | string[]> = {};
      for (const entry of form.fields) {
        if (entry.type === 'text') {
          const value = String(data.get(entry.id) ?? '');
          if (value || entry.required) answers[entry.id] = value;
          continue;
        }
        const files = data
          .getAll(entry.id)
          .filter((value): value is File => value instanceof File && value.size > 0);
        if (files.length || entry.required)
          answers[entry.id] = await upload(skillId, targetId, files);
      }
      const result = await submitEvidenceAction({ skillId, targetId, color, answers });
      // On success the action calls refresh(), so this card re-renders as "pending".
      if (result.error) setError(result.error);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Invio non riuscito.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit}>
      {forms.length > 1 && (
        <div className="row" style={{ marginBottom: '0.5rem' }}>
          {forms.map((option) => (
            <button
              key={option.color}
              type="button"
              data-variant={option.color === color ? undefined : 'ghost'}
              onClick={() => setColor(option.color)}
            >
              {option.title}
            </button>
          ))}
        </div>
      )}
      <fieldset>
        <legend>{form.title}</legend>
        <div className="stack">
          {form.fields.map((entry) => (
            <div key={entry.id}>
              <label htmlFor={`${skillId}-${entry.id}`}>
                {entry.label}
                {entry.required ? ' *' : ''}
              </label>
              {entry.type === 'text' ? (
                <textarea
                  id={`${skillId}-${entry.id}`}
                  name={entry.id}
                  rows={3}
                  maxLength={20000}
                  required={entry.required}
                  disabled={disabled}
                />
              ) : (
                <>
                  <input
                    id={`${skillId}-${entry.id}`}
                    name={entry.id}
                    type="file"
                    accept={ACCEPT}
                    multiple={(entry.maxFiles ?? 10) > 1}
                    required={entry.required}
                    disabled={disabled}
                  />
                  <p className="muted">
                    Da {entry.minFiles ?? 1} a {entry.maxFiles ?? 10} file, max 25 MiB ciascuno.
                  </p>
                </>
              )}
            </div>
          ))}
        </div>
      </fieldset>
      <div className="row" style={{ marginTop: '0.75rem' }}>
        <button type="submit" disabled={busy || disabled}>
          {busy ? 'Invio…' : 'Invia per la verifica'}
        </button>
        {disabled && disabledReason && <span className="muted">{disabledReason}</span>}
      </div>
      {error && <p className="error">{error}</p>}
    </form>
  );
}
