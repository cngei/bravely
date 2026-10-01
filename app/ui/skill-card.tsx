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
  const open = canSubmit && status !== 'completed' && status !== 'locked';
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

      {open && (
        <div style={{ marginTop: '0.75rem' }}>
          {!evidence && <StartSkillForm skillId={skill.id} targetId={targetId} />}
          <EvidenceForm skillId={skill.id} targetId={targetId} forms={skill.forms} />
        </div>
      )}
    </article>
  );
}
