import type { Evidence, Skill } from '@/lib/model';
import { EvidenceForm } from './evidence-form';
import { StartSkillForm } from './leader-forms';
import { STATUS_LABELS } from './labels';
import { Answers, waiting } from './evidence-view';

export function SkillCard({
  skill,
  targetId,
  status,
  missing,
  evidence,
  canSubmit,
  titleOf,
}: {
  skill: Skill;
  targetId: string;
  status: string;
  missing: string[];
  evidence?: Evidence & { waitingSeconds?: number };
  canSubmit: boolean;
  titleOf: (id: string) => string;
}) {
  // Consultation and authorisation are two different questions, and conflating them was a bug:
  // the spec requires every skill's forms to be readable, including locked ones, with only the
  // submission disabled ("consultabili ma non conseguibili").
  const interactive = canSubmit && status !== 'completed' && status !== 'locked';
  // Completed skills show the accepted answers instead; a blank disabled form would be noise.
  const consultable = !interactive && status !== 'completed';
  const why =
    status === 'locked'
      ? 'Completa prima i prerequisiti per poter inviare questa prova.'
      : canSubmit
        ? undefined
        : 'Questa prova è di competenza dei capi reparto: puoi consultarla ma non inviarla.';
  return (
    <article className="card">
      <div className="card-head">
        <h3>{skill.title}</h3>
        <span className="badge" data-status={status}>
          {STATUS_LABELS[status] ?? status}
        </span>
      </div>
      {skill.description && <p className="muted">{skill.description}</p>}

      {status === 'locked' && (
        <p className="muted">Prima servono: {missing.map(titleOf).join(', ')}.</p>
      )}
      {status === 'pending' && evidence?.waitingSeconds !== undefined && (
        <p className="muted">In attesa di verifica {waiting(evidence.waitingSeconds)}.</p>
      )}
      {status === 'rejected' && evidence?.reason && (
        <p className="error">Rigettata: {evidence.reason}</p>
      )}
      {evidence && status !== 'available' && <Answers evidence={evidence} />}

      {(interactive || consultable) && (
        <div style={{ marginTop: '0.75rem' }}>
          {interactive && !evidence && <StartSkillForm skillId={skill.id} targetId={targetId} />}
          <EvidenceForm
            skillId={skill.id}
            targetId={targetId}
            forms={skill.forms}
            disabled={!interactive}
            disabledReason={why}
          />
        </div>
      )}
    </article>
  );
}
