'use client';
// Onboarding for the "altre organizzazioni coinvolte" in the specification: troops that do not
// come from the CNGEI roster, and the people who belong to them.
//
// Accounts still live in Keycloak — this only binds an existing Keycloak subject to a troop. The
// domain refuses to match on email or name, so the association is the `sub` claim, pasted by hand.
// Both commands are upserts with no delete, so correcting a mistake means saving over it.
import { useActionState, useState } from 'react';
import { createTroopAction, saveExternalUserAction, type ActionResult } from '@/app/actions';
import { SubmitButton } from './submit-button';

export interface ExternalTroop {
  id: string;
  name: string;
}

export interface ExternalUser {
  subject: string;
  name: string;
  role: 'explorer' | 'leader';
  troopIds: string[];
}

const idle: ActionResult = {};

export function ExternalTroops({ troops }: { troops: ExternalTroop[] }) {
  const [state, action] = useActionState(createTroopAction, idle);
  return (
    <>
      {troops.length === 0 ? (
        <p className="muted">Nessun reparto esterno.</p>
      ) : (
        <ul>
          {troops.map((troop) => (
            <li key={troop.id}>
              {troop.name} <span className="muted">· {troop.id}</span>
            </li>
          ))}
        </ul>
      )}
      <form action={action}>
        <div className="row">
          <input name="name" placeholder="Nome del reparto esterno" maxLength={300} required />
          <SubmitButton>Crea reparto</SubmitButton>
        </div>
        {state.ok && (
          <p className="ok" role="status">
            Reparto creato.
          </p>
        )}
        {state.error && <p className="error">{state.error}</p>}
      </form>
    </>
  );
}

export function ExternalUsers({
  users,
  troops,
}: {
  users: ExternalUser[];
  troops: ExternalTroop[];
}) {
  const [state, action] = useActionState(saveExternalUserAction, idle);
  // Editing means re-saving the same subject, so selecting a row just prefills the form.
  const [editing, setEditing] = useState<ExternalUser | null>(null);
  const [role, setRole] = useState<'explorer' | 'leader'>('explorer');
  const nameOf = (id: string) => troops.find((troop) => troop.id === id)?.name ?? id;

  const load = (user: ExternalUser) => {
    setEditing(user);
    setRole(user.role);
  };

  return (
    <>
      {users.length > 0 && (
        <div className="table-scroll">
          <table className="data">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Ruolo</th>
                <th>Reparti</th>
                <th>Subject</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.subject}>
                  <td data-label="Nome">
                    <strong>{user.name}</strong>
                  </td>
                  <td data-label="Ruolo">{user.role === 'leader' ? 'capo' : 'esploratore'}</td>
                  <td data-label="Reparti">{user.troopIds.map(nameOf).join(', ')}</td>
                  <td data-label="Subject">
                    <code style={{ fontSize: '0.75rem', overflowWrap: 'anywhere' }}>
                      {user.subject}
                    </code>
                  </td>
                  <td>
                    <button type="button" data-variant="ghost" onClick={() => load(user)}>
                      Modifica
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {troops.length === 0 ? (
        <p className="muted">Crea prima un reparto esterno: un utente esterno deve appartenervi.</p>
      ) : (
        /* Keyed on the subject so selecting a different row resets the uncontrolled inputs. */
        <form action={action} key={editing?.subject ?? 'new'} style={{ marginTop: '1rem' }}>
          <label htmlFor="subject">Subject Keycloak</label>
          <input
            id="subject"
            name="subject"
            defaultValue={editing?.subject ?? ''}
            maxLength={150}
            required
            placeholder="es. 7c9e6679-7425-40de-944b-e07fc1f90ae7"
          />
          <p className="muted">
            È il campo <code>sub</code> dell’utente nella console Keycloak. L’associazione è
            esplicita: non viene usata l’email né il nome.
          </p>

          <label htmlFor="name" style={{ marginTop: '0.75rem' }}>
            Nome e cognome
          </label>
          <input
            id="name"
            name="name"
            defaultValue={editing?.name ?? ''}
            maxLength={300}
            required
          />

          <label htmlFor="role" style={{ marginTop: '0.75rem' }}>
            Ruolo
          </label>
          <select
            id="role"
            name="role"
            value={role}
            onChange={(event) => setRole(event.target.value as 'explorer' | 'leader')}
          >
            <option value="explorer">Esploratore</option>
            <option value="leader">Capo</option>
          </select>

          <fieldset>
            <legend>
              {role === 'explorer' ? 'Reparto (esattamente uno)' : 'Reparti (uno o più)'}
            </legend>
            {/* Radios for an explorer, checkboxes for a leader: the domain allows exactly one
                troop for explorers, so the input type prevents the error instead of reporting it. */}
            <div className="stack">
              {troops.map((troop) => (
                <label key={troop.id} className="row" style={{ fontWeight: 400 }}>
                  <input
                    type={role === 'explorer' ? 'radio' : 'checkbox'}
                    name="troopIds"
                    value={troop.id}
                    defaultChecked={editing?.troopIds.includes(troop.id)}
                  />
                  {troop.name}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="row" style={{ marginTop: '0.75rem' }}>
            <SubmitButton>{editing ? 'Aggiorna utente' : 'Aggiungi utente'}</SubmitButton>
            {editing && (
              <button type="button" data-variant="ghost" onClick={() => setEditing(null)}>
                Annulla
              </button>
            )}
            {state.ok && (
              <span className="ok" role="status">
                Salvato.
              </span>
            )}
          </div>
          {state.error && <p className="error">{state.error}</p>}
        </form>
      )}
    </>
  );
}
