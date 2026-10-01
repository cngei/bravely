'use client';
// Quick look at a skill, opened by tapping a node in the tree. Bottom sheet on phones, centred
// dialog on wider screens — one native <dialog>, which brings focus trapping, Esc to dismiss and
// a backdrop for free rather than reimplementing them.
//
// Everything shown here is already in the client payload, so the sheet opens instantly with no
// spinner. Anything that needs a server read — who else earned the skill, other patrols'
// documentation — lives behind the button at the bottom.
import { useEffect, useRef } from 'react';
import { STATUS_LABELS } from './labels';

export interface SheetForm {
  color: 'blue' | 'amber';
  title: string;
  fields: { label: string; type: 'text' | 'file'; required: boolean; min?: number; max?: number }[];
}

export interface SheetSkill {
  id: string;
  title: string;
  description: string;
  glyph: string;
  status?: string;
  color?: 'blue' | 'amber';
  missing: string[];
  forms: SheetForm[];
}

export function SkillSheet({ skill, onClose }: { skill: SheetSkill | null; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (skill && !element.open) element.showModal();
    if (!skill && element.open) element.close();
  }, [skill]);

  return (
    <dialog
      ref={dialog}
      className="sheet"
      // Fires for Esc and for the close() above, so the parent's state cannot drift from the DOM.
      onClose={onClose}
      // The backdrop is part of the dialog's own box, so a click landing on the element itself
      // rather than on its content means the user clicked outside the card.
      onClick={(event) => {
        if (event.target === dialog.current) onClose();
      }}
    >
      {skill && (
        <div className="sheet-body">
          <div className="sheet-head">
            <span className="skill-emblem" data-status={skill.status}>
              <span className="skill-glyph">{skill.glyph}</span>
            </span>
            <div>
              <h2 style={{ margin: 0 }}>{skill.title}</h2>
              {skill.status && (
                <span className="badge" data-status={skill.status}>
                  {STATUS_LABELS[skill.status] ?? skill.status}
                </span>
              )}
            </div>
            <button type="button" data-variant="ghost" onClick={onClose} aria-label="Chiudi">
              ✕
            </button>
          </div>

          {skill.description && <p>{skill.description}</p>}

          {skill.status === 'locked' && skill.missing.length > 0 && (
            <p className="muted">Prima servono: {skill.missing.join(', ')}.</p>
          )}
          {skill.color && (
            <p className="muted">
              Percorso scelto: form {skill.color === 'amber' ? 'ambra' : 'blu'}.
            </p>
          )}

          <h3 style={{ marginTop: '1rem' }}>Prove richieste</h3>
          <p className="muted">
            {skill.forms.length > 1
              ? 'Due modalità alternative: ne basta una.'
              : 'Una sola modalità disponibile.'}
          </p>
          <div className="stack">
            {skill.forms.map((form) => (
              <section key={form.color} className="card" data-color={form.color}>
                <h4 style={{ fontSize: '0.875rem', margin: 0 }}>
                  {form.title} · {form.color === 'amber' ? 'Ambra' : 'Blu'}
                </h4>
                <ul style={{ margin: '0.5rem 0 0', paddingLeft: '1.1rem' }}>
                  {form.fields.map((field, index) => (
                    <li key={index} className="muted" style={{ fontSize: '0.875rem' }}>
                      {field.label}
                      {field.type === 'file'
                        ? ` — da ${field.min ?? 1} a ${field.max ?? 10} file`
                        : ' — risposta scritta'}
                      {field.required ? '' : ' (facoltativa)'}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>

          <a className="button-link sheet-cta" href={`/skills/${encodeURIComponent(skill.id)}`}>
            Dettagli completi →
          </a>
        </div>
      )}
    </dialog>
  );
}
