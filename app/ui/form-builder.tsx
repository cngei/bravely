'use client';
// Editor for a skill's blue/amber forms. Unlike the DAG editor this one keeps a local draft
// and saves once: the whole forms array goes in a single saveSkill, so an edit cannot
// half-apply, and a builder needs add/remove/reorder before anything is worth persisting.
//
// Nothing is validated here beyond keeping the inputs sane. execute() owns the real rules —
// unique form colours, unique field ids within a form, minFiles <= maxFiles — and its messages
// are shown as they come back.
import { useRef, useState } from 'react';
import type { Field, SkillForm } from '@/lib/model';
import { saveSkillFormsAction } from '@/app/actions';

type DraftField = Field & { key: string };
type DraftForm = { key: string; color: 'blue' | 'amber'; title: string; fields: DraftField[] };

const COLOR_LABEL = { blue: 'Blu', amber: 'Ambra' } as const;

// Field ids key the stored answers, so they are slugs derived from the label by default.
const slugify = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 150);

// Keys are derived from indices on first render so server and client markup agree; anything
// added later gets a counter value. field.id cannot be the key — it is user-editable and may
// be briefly empty or duplicated mid-edit.
const toDraft = (forms: SkillForm[]): DraftForm[] =>
  forms.map((form, formIndex) => ({
    key: `f${formIndex}`,
    color: form.color,
    title: form.title,
    fields: form.fields.map((field, fieldIndex) => ({
      ...field,
      key: `f${formIndex}-${fieldIndex}`,
    })),
  }));

const toPayload = (forms: DraftForm[]): SkillForm[] =>
  forms.map((form) => ({
    color: form.color,
    title: form.title.trim(),
    fields: form.fields.map((field) => {
      const base: Field = {
        id: field.id.trim(),
        label: field.label.trim(),
        type: field.type,
        required: field.required,
      };
      // The schema is strict and these are meaningless on a text question.
      return field.type === 'file'
        ? { ...base, minFiles: field.minFiles ?? 1, maxFiles: field.maxFiles ?? 3 }
        : base;
    }),
  }));

export function FormBuilder({
  skillId,
  skillTitle,
  initialForms,
}: {
  skillId: string;
  skillTitle: string;
  initialForms: SkillForm[];
}) {
  const [forms, setForms] = useState<DraftForm[]>(() => toDraft(initialForms));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);
  const counter = useRef(0);
  const nextKey = () => `new-${++counter.current}`;

  const dirty = () => {
    setSaved(false);
    setError(undefined);
  };

  const updateForm = (key: string, patch: Partial<DraftForm>) => {
    dirty();
    setForms((current) => current.map((f) => (f.key === key ? { ...f, ...patch } : f)));
  };

  const updateField = (formKey: string, fieldKey: string, patch: Partial<DraftField>) => {
    dirty();
    setForms((current) =>
      current.map((form) =>
        form.key === formKey
          ? {
              ...form,
              fields: form.fields.map((field) =>
                field.key === fieldKey ? { ...field, ...patch } : field,
              ),
            }
          : form,
      ),
    );
  };

  const addField = (formKey: string) => {
    dirty();
    setForms((current) =>
      current.map((form) =>
        form.key === formKey
          ? {
              ...form,
              fields: [
                ...form.fields,
                { key: nextKey(), id: '', label: '', type: 'text', required: true },
              ],
            }
          : form,
      ),
    );
  };

  const removeField = (formKey: string, fieldKey: string) => {
    dirty();
    setForms((current) =>
      current.map((form) =>
        form.key === formKey
          ? { ...form, fields: form.fields.filter((field) => field.key !== fieldKey) }
          : form,
      ),
    );
  };

  // Field order is the order the explorer sees, so it has to be editable.
  const moveField = (formKey: string, index: number, delta: number) => {
    dirty();
    setForms((current) =>
      current.map((form) => {
        if (form.key !== formKey) return form;
        const target = index + delta;
        if (target < 0 || target >= form.fields.length) return form;
        const fields = [...form.fields];
        [fields[index], fields[target]] = [fields[target], fields[index]];
        return { ...form, fields };
      }),
    );
  };

  // Colour is assigned, never chosen: the two forms must have different colours, so the second
  // one takes whichever is free.
  const addForm = () => {
    dirty();
    setForms((current) => {
      if (current.length >= 2) return current;
      const color = current.some((form) => form.color === 'blue') ? 'amber' : 'blue';
      return [
        ...current,
        {
          key: nextKey(),
          color,
          title: color === 'blue' ? 'Racconto' : 'Foto o video',
          fields: [
            color === 'blue'
              ? {
                  key: nextKey(),
                  id: 'racconto',
                  label: 'Com’è andata la prova?',
                  type: 'text',
                  required: true,
                }
              : {
                  key: nextKey(),
                  id: 'media',
                  label: 'Documentazione',
                  type: 'file',
                  required: true,
                  minFiles: 1,
                  maxFiles: 3,
                },
          ],
        },
      ];
    });
  };

  const removeForm = (key: string) => {
    dirty();
    setForms((current) => (current.length <= 1 ? current : current.filter((f) => f.key !== key)));
  };

  async function save() {
    setBusy(true);
    setError(undefined);
    try {
      const result = await saveSkillFormsAction(skillId, toPayload(forms));
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
      <div className="stack">
        {forms.map((form) => (
          <section key={form.key} className="card" data-color={form.color}>
            <div className="card-head">
              <h3>Form {COLOR_LABEL[form.color]}</h3>
              {forms.length > 1 && (
                <button type="button" data-variant="danger" onClick={() => removeForm(form.key)}>
                  Elimina form
                </button>
              )}
            </div>

            <label htmlFor={`title-${form.key}`} style={{ marginTop: '0.75rem' }}>
              Titolo del form
            </label>
            <input
              id={`title-${form.key}`}
              value={form.title}
              maxLength={300}
              onChange={(event) => updateForm(form.key, { title: event.target.value })}
            />

            <h4 style={{ fontSize: '0.875rem', margin: '1rem 0 0.5rem' }}>
              Domande ({form.fields.length})
            </h4>
            <div className="stack">
              {form.fields.map((field, index) => (
                <div key={field.key} className="field-row">
                  <div className="field-grid">
                    <div>
                      <label htmlFor={`label-${field.key}`}>Domanda</label>
                      <input
                        id={`label-${field.key}`}
                        value={field.label}
                        maxLength={300}
                        onChange={(event) => {
                          const label = event.target.value;
                          // Keep the id in step until the admin edits it by hand.
                          const follow = !field.id || field.id === slugify(field.label);
                          updateField(form.key, field.key, {
                            label,
                            ...(follow ? { id: slugify(label) } : {}),
                          });
                        }}
                      />
                    </div>
                    <div>
                      <label htmlFor={`id-${field.key}`}>Identificatore</label>
                      <input
                        id={`id-${field.key}`}
                        value={field.id}
                        maxLength={150}
                        onChange={(event) =>
                          updateField(form.key, field.key, { id: event.target.value })
                        }
                      />
                    </div>
                    <div>
                      <label htmlFor={`type-${field.key}`}>Tipo</label>
                      <select
                        id={`type-${field.key}`}
                        value={field.type}
                        onChange={(event) =>
                          updateField(form.key, field.key, {
                            type: event.target.value as Field['type'],
                          })
                        }
                      >
                        <option value="text">Risposta testuale</option>
                        <option value="file">Immagini o video</option>
                      </select>
                    </div>
                    {field.type === 'file' && (
                      <>
                        <div>
                          <label htmlFor={`min-${field.key}`}>Min file</label>
                          <input
                            id={`min-${field.key}`}
                            type="number"
                            min={1}
                            max={10}
                            value={field.minFiles ?? 1}
                            onChange={(event) =>
                              updateField(form.key, field.key, {
                                minFiles: Number(event.target.value) || 1,
                              })
                            }
                          />
                        </div>
                        <div>
                          <label htmlFor={`max-${field.key}`}>Max file</label>
                          <input
                            id={`max-${field.key}`}
                            type="number"
                            min={1}
                            max={10}
                            value={field.maxFiles ?? 3}
                            onChange={(event) =>
                              updateField(form.key, field.key, {
                                maxFiles: Number(event.target.value) || 1,
                              })
                            }
                          />
                        </div>
                      </>
                    )}
                  </div>
                  <div className="row">
                    <label className="row" style={{ fontWeight: 400 }}>
                      <input
                        type="checkbox"
                        checked={field.required}
                        onChange={(event) =>
                          updateField(form.key, field.key, { required: event.target.checked })
                        }
                      />
                      Obbligatoria
                    </label>
                    <button
                      type="button"
                      data-variant="ghost"
                      disabled={index === 0}
                      onClick={() => moveField(form.key, index, -1)}
                      aria-label="Sposta su"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      data-variant="ghost"
                      disabled={index === form.fields.length - 1}
                      onClick={() => moveField(form.key, index, 1)}
                      aria-label="Sposta giù"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      data-variant="danger"
                      disabled={form.fields.length <= 1}
                      onClick={() => removeField(form.key, field.key)}
                    >
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
              disabled={form.fields.length >= 50}
              onClick={() => addField(form.key)}
            >
              Aggiungi domanda
            </button>
          </section>
        ))}
      </div>

      {forms.length < 2 && (
        <button type="button" data-variant="ghost" style={{ marginTop: '1rem' }} onClick={addForm}>
          Aggiungi il form {forms[0]?.color === 'blue' ? 'ambra' : 'blu'}
        </button>
      )}

      <div className="row" style={{ marginTop: '1.5rem' }}>
        <button type="button" onClick={save} disabled={busy}>
          {busy ? 'Salvataggio…' : `Salva i form di ${skillTitle}`}
        </button>
        {saved && !busy && (
          <span className="ok" role="status">
            Form salvati.
          </span>
        )}
      </div>
      {error && <p className="error">{error}</p>}
      <p className="muted" style={{ marginTop: '0.75rem' }}>
        Cambiare un identificatore vale per gli invii futuri: le prove già inviate conservano la
        propria copia del form, quindi non si rompono.
      </p>
    </>
  );
}
