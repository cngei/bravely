'use client';
// Achievement thresholds. saveAchievements replaces the whole array, so this keeps a local
// draft and submits the complete list in one command — sending a diff would delete whatever
// was left out. Removing a row here is the only deletion the domain supports at all.
//
// A threshold counts distinct skills earned, the two shared troop skills included, so a
// threshold above the catalogue size can never be reached. That is surfaced as a hint rather
// than blocked: the catalogue is expected to grow.
import { useRef, useState } from 'react';
import type { Achievement } from '@/lib/model';
import { saveAchievementsAction } from '@/app/actions';

type Draft = Achievement & { key: string };

const slugify = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 150);

export function AchievementsEditor({
  initial,
  skillCount,
}: {
  initial: Achievement[];
  skillCount: number;
}) {
  // Index-derived keys so SSR and client agree; `id` is user-editable and cannot be the key.
  const [rows, setRows] = useState<Draft[]>(() =>
    initial.map((achievement, index) => ({ ...achievement, key: `a${index}` })),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);
  const counter = useRef(0);

  const dirty = () => {
    setSaved(false);
    setError(undefined);
  };

  const update = (key: string, patch: Partial<Draft>) => {
    dirty();
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  };

  const add = () => {
    dirty();
    setRows((current) => [
      ...current,
      { key: `new-${++counter.current}`, id: '', title: '', threshold: 1 },
    ]);
  };

  const remove = (key: string) => {
    dirty();
    setRows((current) => current.filter((row) => row.key !== key));
  };

  async function save() {
    setBusy(true);
    setError(undefined);
    try {
      const result = await saveAchievementsAction(
        rows.map(({ key: _localKey, ...achievement }) => ({
          ...achievement,
          id: achievement.id.trim(),
          title: achievement.title.trim(),
        })),
      );
      if (result.error) setError(result.error);
      else setSaved(true);
    } catch {
      setError('Salvataggio non riuscito.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {rows.length === 0 && <p className="muted">Nessun achievement configurato.</p>}
      <div className="stack">
        {rows.map((row) => (
          <div key={row.key} className="field-row">
            <div className="field-grid">
              <div>
                <label htmlFor={`title-${row.key}`}>Titolo</label>
                <input
                  id={`title-${row.key}`}
                  value={row.title}
                  maxLength={300}
                  onChange={(event) => {
                    const title = event.target.value;
                    const follow = !row.id || row.id === slugify(row.title);
                    update(row.key, { title, ...(follow ? { id: slugify(title) } : {}) });
                  }}
                />
              </div>
              <div>
                <label htmlFor={`id-${row.key}`}>Identificatore</label>
                <input
                  id={`id-${row.key}`}
                  value={row.id}
                  maxLength={150}
                  onChange={(event) => update(row.key, { id: event.target.value })}
                />
              </div>
              <div>
                <label htmlFor={`threshold-${row.key}`}>Skill richieste</label>
                <input
                  id={`threshold-${row.key}`}
                  type="number"
                  min={1}
                  max={10000}
                  value={row.threshold}
                  onChange={(event) =>
                    update(row.key, { threshold: Number(event.target.value) || 1 })
                  }
                />
              </div>
            </div>
            <div className="row">
              {row.threshold > skillCount && (
                <span className="muted">
                  Non raggiungibile: in catalogo ci sono {skillCount} skill.
                </span>
              )}
              <button type="button" data-variant="danger" onClick={() => remove(row.key)}>
                Elimina
              </button>
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        data-variant="ghost"
        style={{ marginTop: '0.75rem' }}
        disabled={rows.length >= 100}
        onClick={add}
      >
        Aggiungi achievement
      </button>

      <div className="row" style={{ marginTop: '1.25rem' }}>
        <button type="button" onClick={save} disabled={busy}>
          {busy ? 'Salvataggio…' : 'Salva gli achievement'}
        </button>
        {saved && !busy && (
          <span className="ok" role="status">
            Achievement salvati.
          </span>
        )}
      </div>
      {error && <p className="error">{error}</p>}
      <p className="muted" style={{ marginTop: '0.75rem' }}>
        Il conteggio usa le skill distinte conseguite, comprese le due iniziali di reparto; non
        conta gli invii né i due colori separatamente. Eliminare una riga e salvare rimuove
        l’achievement per tutti.
      </p>
    </>
  );
}
