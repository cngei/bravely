'use client';
// A skill, opened by tapping a node in the tree — and, for an explorer, the place where a proof is
// actually submitted. Bottom sheet on phones, centred dialog on wider screens: one native
// <dialog>, which brings focus trapping, Esc to dismiss and a backdrop for free rather than
// reimplementing them.
//
// The submission rules are deliberately the same three lines as SkillCard (interactive /
// consultable / why) rather than a second interpretation of them: the specification requires every
// skill's forms to be readable, including locked ones, with only the submission disabled
// ("consultabili ma non conseguibili"), and two copies of that rule would drift.
//
// Everything shown here is already in the client payload, so the sheet opens instantly with no
// spinner. Anything that needs a server read — who else earned the skill, other patrols'
// documentation, the answers already accepted — lives behind the link at the bottom.
import { useEffect, useRef } from 'react';
import type { SkillForm } from '@/lib/model';
import { EvidenceForm } from './evidence-form';
import { StartSkillForm } from './leader-forms';
import { STATUS_LABELS } from './labels';
import { waiting } from './evidence-view';

export interface SheetSkill {
  id: string;
  title: string;
  description: string;
  glyph: string;
  status?: string;
  color?: 'blue' | 'amber';
  missing: string[];
  forms: SkillForm[];
  /** Absent when the viewer has no patrol context, e.g. a leader whose troop has no patrols yet. */
  targetId?: string;
  canSubmit: boolean;
  hasEvidence: boolean;
  reason?: string;
  waitingSeconds?: number;
}

export function SkillSheet({
  skill,
  onClose,
  onSubmitted,
}: {
  skill: SheetSkill | null;
  onClose: () => void;
  /** After a successful submission; the sheet closes, so the parent owns the confirmation. */
  onSubmitted: (title: string) => void;
}) {
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
        <Body
          skill={skill}
          onClose={onClose}
          onSubmitted={() => {
            onSubmitted(skill.title);
            onClose();
          }}
        />
      )}
    </dialog>
  );
}

function Body({
  skill,
  onClose,
  onSubmitted,
}: {
  skill: SheetSkill;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  // Without a target there is nothing to submit against, so the forms can only be described.
  const submittable = skill.canSubmit && skill.targetId !== undefined;
  // Gated on the prerequisites, not on status === 'locked' — same reasoning as SkillCard: a proof
  // submitted before a prerequisite was revoked reads 'pending' but still cannot be sent again.
  const blocked = skill.missing.length > 0;
  const interactive = submittable && skill.status !== 'completed' && !blocked;
  const consultable = !interactive && skill.status !== 'completed';
  const why = blocked
    ? 'Completa prima i prerequisiti per poter inviare questa prova.'
    : skill.canSubmit
      ? undefined
      : 'Questa prova è di competenza dei capi reparto: puoi consultarla ma non inviarla.';

  return (
    <div className="sheet-body">
      <div className="sheet-head">
        <span className="skill-emblem" data-status={skill.status} data-color={skill.color}>
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

      {skill.status === 'pending' && skill.waitingSeconds !== undefined && (
        <p className="muted">In attesa di verifica {waiting(skill.waitingSeconds)}.</p>
      )}
      {blocked && <p className="muted">Prima servono: {skill.missing.join(', ')}.</p>}
      {skill.status === 'rejected' && skill.reason && (
        <p className="error">Rigettata: {skill.reason}</p>
      )}
      {skill.color && (
        <p className="muted">Percorso scelto: form {skill.color === 'amber' ? 'ambra' : 'blu'}.</p>
      )}

      {skill.status === 'completed' && (
        <p className="muted">Prova verificata. Le risposte accettate sono nei dettagli completi.</p>
      )}

      {/* The real form, enabled or disabled. A disabled form already lists the questions, which
          is why there is no separate "prove richieste" summary to keep in sync. */}
      {skill.targetId !== undefined && (interactive || consultable) && (
        <>
          {skill.forms.length > 1 && <h3 style={{ marginTop: '1.1rem' }}>Scegli una modalità</h3>}
          {interactive && !skill.hasEvidence && (
            <StartSkillForm skillId={skill.id} targetId={skill.targetId} />
          )}
          <EvidenceForm
            skillId={skill.id}
            targetId={skill.targetId}
            forms={skill.forms}
            disabled={!interactive}
            disabledReason={why}
            onSubmitted={onSubmitted}
          />
        </>
      )}

      {/* No patrol context: describe what the proof asks for, since it cannot be filled in here. */}
      {skill.targetId === undefined && (
        <>
          <h3 style={{ marginTop: '1.1rem' }}>Prove richieste</h3>
          <div className="stack">
            {skill.forms.map((form) => (
              <section key={form.color} className="card" data-color={form.color}>
                <h4 style={{ fontSize: '0.875rem', margin: 0 }}>
                  {form.title} · {form.color === 'amber' ? 'Ambra' : 'Blu'}
                </h4>
                <ul style={{ margin: '0.5rem 0 0', paddingLeft: '1.1rem' }}>
                  {form.fields.map((field) => (
                    <li key={field.id} className="muted" style={{ fontSize: '0.875rem' }}>
                      {field.label}
                      {field.type === 'file'
                        ? ` — da ${field.minFiles ?? 1} a ${field.maxFiles ?? 10} file`
                        : ' — risposta scritta'}
                      {field.required ? '' : ' (facoltativa)'}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </>
      )}

      <a className="button-link sheet-cta" href={`/skills/${encodeURIComponent(skill.id)}`}>
        Dettagli completi →
      </a>
    </div>
  );
}
