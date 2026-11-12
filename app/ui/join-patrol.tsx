'use client';
// What an explorer without a patrol sees: the troop's patrols, and a button to join one. The choice
// is effective at once and marked for a leader to confirm (decision 2 of the November review), so
// nobody waits on a leader to start working.
import { useActionState } from 'react';
import { joinPatrolAction, type ActionResult } from '@/app/actions';
import { SubmitButton } from './submit-button';

const idle: ActionResult = {};

export function JoinPatrol({
  patrols,
  message,
}: {
  patrols: { id: string; name: string }[];
  /** Shown when there is nothing to join yet: the troop has no patrols. */
  message: string;
}) {
  const [state, action] = useActionState(joinPatrolAction, idle);
  if (patrols.length === 0) return <p style={{ marginTop: '2rem' }}>{message}</p>;
  return (
    <section style={{ marginTop: '2rem' }}>
      <h2>In quale pattuglia sei?</h2>
      <p className="muted">
        Scegli la tua: puoi iniziare subito. Chi guida il reparto la confermerà, o ti sposterà se
        serve.
      </p>
      <div className="stack" style={{ marginTop: '1rem' }}>
        {patrols.map((patrol) => (
          <form key={patrol.id} action={action} className="row">
            <input type="hidden" name="patrolId" value={patrol.id} />
            <strong>{patrol.name}</strong>
            <SubmitButton>Entra</SubmitButton>
          </form>
        ))}
      </div>
      {state.error && <p className="error">{state.error}</p>}
    </section>
  );
}
