'use client';
import { useActionState, useRef, useState } from 'react';
import {
  createPatrolAction,
  publishEvidenceAction,
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
// canPublish (public skill, not just revoking) adds the privacy check to the same card as an
// opt-in box, off by default. It only counts with «Approva»; skipped, the «Seconda verifica»
// block still appears on the approved card, so the second pass cannot get lost.
export function ReviewForm({
  evidenceId,
  onlyReject,
  canPublish,
}: {
  evidenceId: string;
  onlyReject?: boolean;
  canPublish?: boolean;
}) {
  const [state, action] = useActionState(reviewEvidenceAction.bind(null, evidenceId), idle);
  return (
    <form action={action} style={{ marginTop: '0.75rem' }}>
      <label htmlFor={`reason-${evidenceId}`}>
        Motivazione {onlyReject ? '(obbligatoria)' : '(obbligatoria per il rigetto)'}
      </label>
      <textarea id={`reason-${evidenceId}`} name="reason" rows={2} maxLength={5000} />
      {canPublish && !onlyReject && (
        <>
          <label className="row" style={{ marginTop: '0.5rem' }}>
            <input type="checkbox" name="publish" />
            Approva e rendi consultabile dalle altre pattuglie
          </label>
          <p className="muted">
            Ricontrolla risposte e allegati (volti, nomi, luoghi riconoscibili) prima di spuntarla.
            Vale solo con «Approva»; si può revocare solo rigettando la prova.
          </p>
        </>
      )}
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

// The second check before an approved proof becomes readable by every patrol (November review).
// Rendered from state — approved, public skill, not yet published — so it appears on its own right
// after approval and stays there if the leader skips it: the second pass cannot get lost. The
// confirmation is a native <dialog>, like the skill sheet, for focus trapping and Esc for free.
export function PublishForm({ evidenceId }: { evidenceId: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function publish() {
    setBusy(true);
    setError(undefined);
    const result = await publishEvidenceAction(evidenceId).catch(() => ({
      error: 'Pubblicazione non riuscita.',
    }));
    setBusy(false);
    if ('error' in result && result.error) setError(result.error);
    else dialog.current?.close();
  }

  return (
    <section className="card" style={{ marginTop: '0.75rem' }}>
      <h4>Seconda verifica</h4>
      <p className="muted">
        La skill è consultabile dalle altre pattuglie, ma questa prova non lo è ancora. Ricontrolla
        risposte e allegati — volti, nomi, luoghi riconoscibili — prima di renderla visibile in
        tutta Italia.
      </p>
      <button type="button" data-variant="ghost" onClick={() => dialog.current?.showModal()}>
        Rendi consultabile…
      </button>
      {error && <p className="error">{error}</p>}
      <dialog ref={dialog} aria-labelledby={`publish-${evidenceId}`}>
        <h3 id={`publish-${evidenceId}`}>Rendere consultabile questa prova?</h3>
        <p>
          Le pattuglie che hanno conseguito questa skill potranno leggere le risposte e scaricare
          gli allegati. Si può revocare solo rigettando la prova.
        </p>
        <div className="row">
          <button type="button" onClick={publish} disabled={busy}>
            {busy ? 'Pubblicazione…' : 'Sì, rendila consultabile'}
          </button>
          <button type="button" data-variant="ghost" onClick={() => dialog.current?.close()}>
            Annulla
          </button>
        </div>
      </dialog>
    </section>
  );
}
