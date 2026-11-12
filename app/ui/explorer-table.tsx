'use client';
// The roster the specification asks for: every explorer in the troop, their current patrol, and
// the assignment control on the same row. It replaces a pair of dropdowns that only appeared once
// a patrol and an explorer both existed — which hid the roster exactly when a leader was setting
// a new troop up.
//
// One form per row rather than one for the table: assignExplorerAction is a single command per
// explorer, so a bulk form would have to apply them one by one and could half-fail.
import { useActionState } from 'react';
import { assignExplorerAction, confirmAssignmentAction, type ActionResult } from '@/app/actions';
import { SubmitButton } from './submit-button';

export interface RosterPerson {
  id: string;
  name: string;
  patrolId?: string;
  selfAssigned?: boolean;
}

const idle: ActionResult = {};

export function ExplorerTable({
  people,
  patrols,
}: {
  people: RosterPerson[];
  patrols: { id: string; name: string }[];
}) {
  if (people.length === 0)
    return (
      <p className="muted">
        Nessun esploratore in questo reparto. L’elenco arriva dalle anagrafiche CNGEI e si aggiorna
        a ogni accesso.
      </p>
    );

  return (
    <>
      {patrols.length === 0 && (
        <p className="muted">Crea prima una pattuglia per poter assegnare gli esploratori.</p>
      )}
      <div className="table-scroll">
        <table className="data">
          <thead>
            <tr>
              <th>Esploratore</th>
              <th>Pattuglia</th>
              <th>Assegna</th>
            </tr>
          </thead>
          <tbody>
            {people.map((person) => (
              <Row key={person.id} person={person} patrols={patrols} />
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Row({
  person,
  patrols,
}: {
  person: RosterPerson;
  patrols: { id: string; name: string }[];
}) {
  const [state, action] = useActionState(assignExplorerAction, idle);
  const [confirmState, confirm] = useActionState(confirmAssignmentAction, idle);
  const current = patrols.find((patrol) => patrol.id === person.patrolId);
  return (
    <tr>
      {/* data-label drives the phone layout, where the table collapses into cards. */}
      <td data-label="Esploratore">
        <strong>{person.name}</strong>
      </td>
      <td data-label="Pattuglia">
        {current ? (
          <>
            {current.name}
            {person.selfAssigned && (
              <form action={confirm} className="row" style={{ marginTop: '0.35rem' }}>
                <input type="hidden" name="personId" value={person.id} />
                <span className="badge" data-status="pending">
                  autoassegnata · da confermare
                </span>
                <SubmitButton variant="ghost">Conferma</SubmitButton>
                {confirmState.error && <span className="error">{confirmState.error}</span>}
              </form>
            )}
          </>
        ) : (
          <span className="badge" data-status="available">
            senza pattuglia
          </span>
        )}
      </td>
      <td>
        <form action={action}>
          <input type="hidden" name="personId" value={person.id} />
          <div className="row">
            <select
              name="patrolId"
              defaultValue=""
              required
              disabled={patrols.length === 0}
              aria-label={`Pattuglia per ${person.name}`}
            >
              <option value="" disabled>
                {current ? 'Sposta in…' : 'Scegli…'}
              </option>
              {patrols
                .filter((patrol) => patrol.id !== person.patrolId)
                .map((patrol) => (
                  <option key={patrol.id} value={patrol.id}>
                    {patrol.name}
                  </option>
                ))}
            </select>
            <SubmitButton variant="ghost">{current ? 'Sposta' : 'Assegna'}</SubmitButton>
          </div>
          {state.ok && (
            <p className="ok" role="status">
              Fatto.
            </p>
          )}
          {state.error && <p className="error">{state.error}</p>}
        </form>
      </td>
    </tr>
  );
}
