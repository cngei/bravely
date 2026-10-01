'use client';
import { useActionState } from 'react';
import {
  assignExplorerAction,
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

export function AssignExplorerForm({
  people,
  patrols,
}: {
  people: { id: string; name: string; patrolId?: string }[];
  patrols: { id: string; name: string }[];
}) {
  const [state, action] = useActionState(assignExplorerAction, idle);
  return (
    <form action={action}>
      <div className="row">
        <select name="personId" defaultValue="" required>
          <option value="" disabled>
            Esploratore…
          </option>
          {people.map((person) => (
            <option key={person.id} value={person.id}>
              {person.name}
              {person.patrolId ? '' : ' (senza pattuglia)'}
            </option>
          ))}
        </select>
        <select name="patrolId" defaultValue="" required>
          <option value="" disabled>
            Pattuglia…
          </option>
          {patrols.map((patrol) => (
            <option key={patrol.id} value={patrol.id}>
              {patrol.name}
            </option>
          ))}
        </select>
        <SubmitButton>Assegna</SubmitButton>
      </div>
      {state.ok && (
        <p className="ok" role="status">
          Esploratore assegnato.
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

export function ReviewForm({ evidenceId }: { evidenceId: string }) {
  const [state, action] = useActionState(reviewEvidenceAction.bind(null, evidenceId), idle);
  return (
    <form action={action}>
      <label htmlFor={`reason-${evidenceId}`}>Motivazione (obbligatoria per il rigetto)</label>
      <textarea id={`reason-${evidenceId}`} name="reason" rows={2} maxLength={5000} />
      <div className="row" style={{ marginTop: '0.5rem' }}>
        {/* Two buttons, one form: the name/value pair tells the action which decision it was. */}
        <SubmitButton name="decision" value="approve">
          Approva
        </SubmitButton>
        <SubmitButton name="decision" value="reject" variant="danger">
          Rigetta
        </SubmitButton>
      </div>
      {state.error && <p className="error">{state.error}</p>}
    </form>
  );
}
