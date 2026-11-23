'use client';
import { useRef, useState } from 'react';
import type { Field, SkillForm } from '@/lib/model';
import { submitEvidenceAction } from '@/app/actions';

// Matches the byte-sniffed allowlist in lib/files.ts. Advisory only — the server decides.
const ACCEPT = 'image/png,image/jpeg,image/gif,image/webp,video/mp4,video/webm';

const PATH_NAMES = { blue: 'Blu', amber: 'Ambra' } as const;
// Field ids are slugs of [a-z0-9-] (form-builder.tsx), so an underscore can never collide with one.
const COMMENT = '_comment';

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

const sameFile = (a: File, b: File) =>
  a.name === b.name && a.size === b.size && a.lastModified === b.lastModified;

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}

// A native <input multiple> replaces its whole selection on every pick, so choosing a second
// photo silently dropped the first. The chosen files live in state instead: each pick appends,
// and each file can be removed on its own. Nothing is uploaded until the form is sent, so a
// removed file never reaches the server.
function FileField({
  id,
  field,
  files,
  disabled,
  onChange,
}: {
  id: string;
  field: Field;
  files: File[];
  disabled?: boolean;
  onChange: (files: File[]) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const min = field.minFiles ?? 1,
    max = field.maxFiles ?? 10;
  const full = files.length >= max;

  function add(picked: FileList | null) {
    const fresh = Array.from(picked ?? []).filter(
      (file) => file.size > 0 && !files.some((kept) => sameFile(kept, file)),
    );
    onChange([...files, ...fresh].slice(0, max));
    // Cleared so picking the same file again after removing it still fires onChange.
    if (input.current) input.current.value = '';
  }

  return (
    <>
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        multiple={max > 1}
        hidden
        tabIndex={-1}
        onChange={(event) => add(event.currentTarget.files)}
      />
      {files.length > 0 && (
        <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: '0.25rem 0' }}>
          {files.map((file, index) => (
            <li key={`${file.name}-${file.size}-${file.lastModified}`} className="row">
              <span>
                {file.name} <span className="muted">· {formatSize(file.size)}</span>
              </span>
              <button
                type="button"
                data-variant="ghost"
                aria-label={`Rimuovi ${file.name}`}
                title="Rimuovi"
                disabled={disabled}
                onClick={() => onChange(files.filter((_, i) => i !== index))}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
      <button
        id={id}
        type="button"
        data-variant="ghost"
        disabled={disabled || full}
        onClick={() => input.current?.click()}
      >
        {files.length ? 'Aggiungi altri file' : 'Scegli file'}
      </button>
      <p className="muted">
        {files.length} di {max} file · servono almeno {min}, max 25 MiB ciascuno.
      </p>
    </>
  );
}

export function EvidenceForm({
  skillId,
  targetId,
  forms,
  disabled,
  disabledReason,
  onSubmitted,
}: {
  skillId: string;
  targetId: string;
  forms: SkillForm[];
  /** Consultation mode: the questions are readable, submission is not possible. */
  disabled?: boolean;
  disabledReason?: string;
  /** Takes over the confirmation, e.g. a sheet that closes and confirms on the page behind it. */
  onSubmitted?: () => void;
}) {
  const [formId, setFormId] = useState(forms[0].id);
  const [error, setError] = useState<string>();
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  // Keyed by form and field: two forms can share a field id (see the fieldset key below), and
  // files picked in one must not carry over into the other.
  const [files, setFiles] = useState<Record<string, File[]>>({});
  const form = forms.find((f) => f.id === formId) ?? forms[0];
  const fileKey = (fieldId: string) => `${form.id}:${fieldId}`;

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Defence in depth: the button is disabled, but a stray Enter must not submit either.
    if (disabled) return;
    const element = event.currentTarget;
    const data = new FormData(element);
    setError(undefined);
    setSent(false);
    // The file inputs are cleared after every pick, so `required` cannot guard them: count here.
    // Advisory, like ACCEPT: the server re-checks min and max.
    for (const entry of form.fields) {
      if (entry.type !== 'file') continue;
      const count = files[fileKey(entry.id)]?.length ?? 0,
        min = entry.minFiles ?? 1;
      if ((entry.required || count > 0) && count < min) {
        setError(`«${entry.label}»: servono almeno ${min} file, ne hai scelti ${count}.`);
        return;
      }
    }
    setBusy(true);
    try {
      const answers: Record<string, string | string[]> = {};
      for (const entry of form.fields) {
        if (entry.type === 'text') {
          const value = String(data.get(entry.id) ?? '');
          if (value || entry.required) answers[entry.id] = value;
          continue;
        }
        const chosen = files[fileKey(entry.id)] ?? [];
        if (chosen.length || entry.required)
          answers[entry.id] = await upload(skillId, targetId, chosen);
      }
      const comment = String(data.get(COMMENT) ?? '').trim();
      const result = await submitEvidenceAction({
        skillId,
        targetId,
        formId: form.id,
        answers,
        ...(comment ? { comment } : {}),
      });
      // On success the action calls refresh(), so this card re-renders as "pending". The refresh
      // alone was easy to miss, so success is also confirmed explicitly.
      if (result.error) setError(result.error);
      else if (onSubmitted) onSubmitted();
      else {
        element.reset();
        setFiles({});
        setSent(true);
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Invio non riuscito.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit}>
      {forms.length > 1 && (
        <div className="row tabs" style={{ marginBottom: '0.5rem' }}>
          {forms.map((option) => (
            <button
              key={option.id}
              type="button"
              data-path={option.color}
              data-variant={option.id === form.id ? undefined : 'ghost'}
              aria-pressed={option.id === form.id}
              onClick={() => setFormId(option.id)}
            >
              {option.title} · {PATH_NAMES[option.color]}
            </button>
          ))}
        </div>
      )}
      {/* Tinted by the path, so the explorer sees which colour the proof will count as before
          sending it — the same blue or amber the leader later sees on the review card. */}
      {/* Keyed by form: two forms can share a field id, and without a remount the answer typed
          into one would silently carry over into the other. */}
      <fieldset key={form.id} data-color={form.color}>
        <legend>
          {form.title} · percorso {PATH_NAMES[form.color].toLocaleLowerCase('it')}
        </legend>
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
                <FileField
                  id={`${skillId}-${entry.id}`}
                  field={entry}
                  files={files[fileKey(entry.id)] ?? []}
                  disabled={disabled || busy}
                  onChange={(next) => setFiles((all) => ({ ...all, [fileKey(entry.id)]: next }))}
                />
              )}
            </div>
          ))}
        </div>
      </fieldset>
      {/* Outside the fieldset on purpose: it is not one of the form's questions, and must not
          look like one. Not keyed by form, so switching form keeps what was written here. */}
      <label htmlFor={`${skillId}${COMMENT}`} style={{ marginTop: '0.75rem' }}>
        Vuoi aggiungere qualcosa per chi verifica? (facoltativo)
      </label>
      <textarea
        id={`${skillId}${COMMENT}`}
        name={COMMENT}
        rows={2}
        maxLength={5000}
        disabled={disabled}
      />
      <div className="row" style={{ marginTop: '0.75rem' }}>
        <button type="submit" disabled={busy || disabled}>
          {busy ? 'Invio…' : 'Invia per la verifica'}
        </button>
        {disabled && disabledReason && <span className="muted">{disabledReason}</span>}
      </div>
      {error && <p className="error">{error}</p>}
      {sent && (
        <p className="ok" role="status">
          Prova inviata: ora è in attesa di verifica.
        </p>
      )}
    </form>
  );
}
