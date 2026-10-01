'use client';
import { useActionState } from 'react';
import {
  createPatrolAction,
  reviewEvidenceAction,
  startSkillAction,
  type ActionResult,
} from '@/app/actions';
import { SubmitButton } from './submit-button';

const idle: ActionResult = {};

export function CreatePatrolForm({ troopId }: { troopId: string }) {
  const [state, action] = useActionState(createPatrolAction.bind(null, troopId), idle);
  return (
    <form action={action}>
      <div className="row">
        <input name="name" placeholder="Nome della pattuglia" maxLength={300} required />
        <SubmitButton>Crea pattuglia</SubmitButton>
      </div>
      {state.ok && (
        <p className="ok" role="status">
          Pattuglia creata.
        </p>
      )}
      {state.error && <p className="error">{state.error}</p>}
    </form>
  );
}

export function StartSkillForm({ skillId, targetId }: { skillId: string; targetId: string }) {
  const [state, action] = useActionState(startSkillAction.bind(null, skillId, targetId), idle);
  return (
    <form action={action}>
      <SubmitButton variant="ghost">Segna inizio lavoro</SubmitButton>
      {state.error && <p className="error">{state.error}</p>}
    </form>
  );
}

// onlyReject covers evidence that is already approved: the domain allows revoking it with a
// reason ([lib/domain.ts:343]), but approving it again is an invalid transition, so that button
// is not offered.
export function ReviewForm({
  evidenceId,
  onlyReject,
}: {
  evidenceId: string;
  onlyReject?: boolean;
}) {
  const [state, action] = useActionState(reviewEvidenceAction.bind(null, evidenceId), idle);
  return (
    <form action={action} style={{ marginTop: '0.75rem' }}>
      <label htmlFor={`reason-${evidenceId}`}>
        Motivazione {onlyReject ? '(obbligatoria)' : '(obbligatoria per il rigetto)'}
      </label>
      <textarea id={`reason-${evidenceId}`} name="reason" rows={2} maxLength={5000} />
      <div className="row" style={{ marginTop: '0.5rem' }}>
        {/* Two buttons, one form: the name/value pair tells the action which decision it was. */}
        {!onlyReject && (
          <SubmitButton name="decision" value="approve">
            Approva
          </SubmitButton>
        )}
        <SubmitButton name="decision" value="reject" variant="danger">
          {onlyReject ? 'Revoca la skill' : 'Rigetta'}
        </SubmitButton>
      </div>
      {state.error && <p className="error">{state.error}</p>}
    </form>
  );
}
