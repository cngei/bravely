import type { Evidence, Skill } from '@/lib/model';
import { EvidenceForm } from './evidence-form';
import { StartSkillForm } from './leader-forms';
import { STATUS_LABELS } from './labels';

const waiting = (seconds: number) => {
  const hours = Math.floor(seconds / 3600);
  if (hours >= 24) return `da ${Math.floor(hours / 24)} g`;
  return hours >= 1 ? `da ${hours} h` : `da ${Math.max(1, Math.floor(seconds / 60))} min`;
};

// Labels the stored answers with the form as it was when submitted, not as it reads today.
function Answers({ evidence }: { evidence: Evidence }) {
  const fields = evidence.formSnapshot?.fields ?? [];
  if (!evidence.answers || !fields.length) return null;
  return (
    <dl>
      {fields.map((entry) => {
        const value = evidence.answers?.[entry.id];
        if (value === undefined) return null;
        return (
          <div key={entry.id} style={{ display: 'contents' }}>
            <dt>{entry.label}</dt>
            <dd>
              {Array.isArray(value) ? (
                <span className="row">
                  {value.map((id, index) => (
                    <a key={id} href={`/api/files/${id}`}>
                      Allegato {index + 1}
                    </a>
                  ))}
                </span>
              ) : (
                value
              )}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

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
