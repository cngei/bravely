import { currentActor } from '@/lib/service';
import { readState } from '@/lib/db';
import { dashboard } from '@/lib/domain';
import { AppError } from '@/lib/errors';
import { SkillCard } from './ui/skill-card';
import { CreatePatrolForm, ReviewForm } from './ui/leader-forms';
import { ExplorerTable } from './ui/explorer-table';
import { Answers, EvidenceTimes } from './ui/evidence-view';
import { Banner } from './ui/banner';
import { QuestMeter } from './ui/quest-meter';
import { TreeScreen, type Dashboard } from './ui/tree-screen';
import { STATUS_LABELS } from './ui/labels';

export const dynamic = 'force-dynamic';

// "3 verificate · 2 in verifica · 12 disponibili" — zeros omitted, so the line says only what is
// true of this patrol instead of printing five counters every time.
function tally(patrol: Dashboard['patrols'][number]) {
  const count = (...statuses: string[]) =>
    patrol.skills.filter((entry) => statuses.includes(entry.status)).length;
  const parts: string[] = [];
  const add = (n: number, label: string) => {
    if (n > 0) parts.push(`${n} ${label}`);
  };
  add(count('completed'), 'verificate');
  add(count('pending'), 'in verifica');
  add(count('rejected'), 'rigettate');
  add(count('available', 'started'), 'disponibili');
  add(count('locked'), 'bloccate');
  return parts.join(' · ');
}

const ROLES: Record<string, string> = {
  admin: 'amministratore',
  leader: 'capo reparto',
  explorer: 'esploratore',
};

function TopBar({ name, role }: { name: string; role: string }) {
  return (
    <>
      <Banner>
        {role === 'admin' && (
          <a className="chip" href="/admin">
            Admin
          </a>
        )}
        {/* No link to /tree for an explorer: this page already is the tree. */}
        {role !== 'explorer' && (
          <a className="chip" href="/tree">
            Albero
          </a>
        )}
        <form action="/auth/logout" method="post">
          <button data-variant="ghost">Esci</button>
        </form>
      </Banner>
      <div className="topbar">
        <div>
          <h1>Ciao, {name.split(' ')[0]}</h1>
          <p className="muted">{ROLES[role] ?? role}</p>
        </div>
      </div>
    </>
  );
}

function LeaderView({ data }: { data: Dashboard }) {
  const titleOf = (id: string) => data.skills.find((k) => k.id === id)?.title ?? id;
  const evidenceFor = (skillId: string, targetId: string) =>
    data.evidence.find((e) => e.skillId === skillId && e.targetId === targetId);
  // The spec asks for every uploaded proof with its state, not just the queue. `started` is
  // excluded: work has begun but nothing has been submitted, so there is nothing to review.
  // Pending first, then rejected, then approved; within a group the longest wait comes first.
  const rank = (status: string) => (status === 'pending' ? 0 : status === 'rejected' ? 1 : 2);
  const reviewable = data.evidence
    .filter((e) => e.status !== 'started')
    .sort(
      (a, b) =>
        rank(a.status) - rank(b.status) || (b.waitingSeconds ?? 0) - (a.waitingSeconds ?? 0),
    );
  const pending = reviewable.filter((e) => e.status === 'pending');
  const nameOf = (targetId: string, targetType: string) =>
    targetType === 'troop'
      ? (data.troops.find((t) => t.id === targetId)?.name ?? targetId)
      : (data.patrols.find((p) => p.id === targetId)?.name ?? targetId);

  // One proof, rendered the same whether it is waiting or already settled.
  const card = (evidence: (typeof reviewable)[number]) => (
    <article key={evidence.id} className="card" data-status={evidence.status}>
      <div className="card-head">
        <h3>
          {titleOf(evidence.skillId)} · {nameOf(evidence.targetId, evidence.targetType)}
        </h3>
        <span className="row">
          <span className="badge">{evidence.form?.color === 'amber' ? 'Ambra' : 'Blu'}</span>
          <span className="badge" data-status={evidence.status}>
            {STATUS_LABELS[evidence.status] ?? evidence.status}
          </span>
        </span>
      </div>

      <EvidenceTimes evidence={evidence} />
      <Answers evidence={evidence} />

      {evidence.status === 'rejected' && evidence.reason && (
        <p className="error">Motivazione del rigetto: {evidence.reason}</p>
      )}

      {/* Approved evidence stays actionable: the domain allows revoking it with a reason,
          and the spec asks for exactly that. Rejected evidence has no legal transition
          until the patrol resubmits. */}
      {evidence.status === 'pending' && <ReviewForm evidenceId={evidence.id} />}
      {evidence.status === 'approved' && <ReviewForm evidenceId={evidence.id} onlyReject />}
    </article>
  );
  const settled = reviewable.filter((e) => e.status !== 'pending');

  return (
    <>
      {/* The queue used to be every proof ever submitted, unpaginated, above everything else: to
          reach the patrols a leader scrolled past the whole archive. Only what needs a decision
          stays up here; the rest is one click away and says how much it is holding. */}
      <h2>Da verificare · {pending.length}</h2>
      {pending.length === 0 && <p className="muted">Nessuna prova in attesa di verifica.</p>}
      <div className="stack">{pending.map(card)}</div>

      {settled.length > 0 && (
        <details style={{ marginTop: '1.5rem' }}>
          <summary className="muted">Archivio · {settled.length} prove già decise</summary>
          <div className="stack" style={{ marginTop: '0.75rem' }}>
            {settled.map(card)}
          </div>
        </details>
      )}

      {data.troops.map((troop) => {
        const patrols = data.patrols.filter((p) => p.troopId === troop.id);
        const people = data.people.filter((p) => p.troopId === troop.id);
        return (
          <section key={troop.id}>
            <h2>{troop.name}</h2>

            <h3>Skill iniziali di reparto</h3>
            <p className="muted">
              Fino a quando queste due non sono verificate, tutte le skill di pattuglia restano
              bloccate.
            </p>
            <div className="stack" style={{ marginTop: '0.75rem' }}>
              {data.skills
                .filter((skill) => skill.scope === 'troop')
                .map((skill) => {
                  const evidence = evidenceFor(skill.id, troop.id);
                  return (
                    <SkillCard
                      key={skill.id}
                      skill={skill}
                      targetId={troop.id}
                      // Troop skills carry no prerequisites, so they are never locked.
                      status={
                        evidence?.status === 'approved'
                          ? 'completed'
                          : (evidence?.status ?? 'available')
                      }
                      missing={[]}
                      evidence={evidence}
                      canSubmit
                      titleOf={titleOf}
                    />
                  );
                })}
            </div>

            <h3 style={{ marginTop: '2rem' }}>Pattuglie</h3>
            {patrols.length === 0 && <p className="muted">Nessuna pattuglia in questo reparto.</p>}
            <div className="stack">
              {patrols.map((patrol) => (
                <article key={patrol.id} className="card">
                  <div className="card-head">
                    {/* The two halves of "avanzamento pattuglie" used to be unlinked: the states
                        here, the position in the tree on /tree, and the leader bridging them by
                        hand. */}
                    <h3>
                      <a href={`/tree?patrol=${encodeURIComponent(patrol.id)}`}>{patrol.name}</a>
                    </h3>
                  </div>
                  {/* The meter carries the count, so the badge that used to repeat it is gone. */}
                  <QuestMeter
                    label="Cammino"
                    value={patrol.completed}
                    total={patrol.skills.length}
                  />
                  {/* A chip per unlocked skill meant a wall of twenty to forty of them, where
                      "how many are waiting on me?" had to be answered by counting. The tally says
                      it, and only the states a leader can act on keep a chip. */}
                  <p className="muted" style={{ marginTop: '0.5rem' }}>
                    {tally(patrol)}
                  </p>
                  <div className="row">
                    {patrol.skills
                      .filter((entry) => entry.status === 'pending' || entry.status === 'rejected')
                      .map((entry) => (
                        <span
                          key={`${entry.skillId}-${entry.targetId}`}
                          className="badge"
                          data-status={entry.status}
                        >
                          {titleOf(entry.skillId)}
                        </span>
                      ))}
                  </div>
                  <p className="muted" style={{ marginTop: '0.5rem' }}>
                    {people
                      .filter((p) => p.patrolId === patrol.id)
                      .map((p) => p.name)
                      .join(', ') || 'Nessun esploratore assegnato.'}
                  </p>
                </article>
              ))}
            </div>

            <h3 style={{ marginTop: '2rem' }}>Gestione</h3>
            <CreatePatrolForm troopId={troop.id} />

            <h3 style={{ marginTop: '2rem' }}>Esploratori del reparto · {people.length}</h3>
            {/* Always rendered: the roster is how a leader starts, so it must not depend on a
                patrol already existing. */}
            <ExplorerTable people={people} patrols={patrols} />
          </section>
        );
      })}
    </>
  );
}

export default async function Home() {
  try {
    const actor = await currentActor();
    const data = dashboard(await readState(), actor);
    return (
      <main>
        <TopBar name={data.user.name} role={data.user.role} />
        {!('patrols' in data) ? (
          <p style={{ marginTop: '2rem' }}>{data.message}</p>
        ) : actor.role === 'explorer' ? (
          // Decided in the 16/10 meeting: the explorer's only screen is the tree, and proofs are
          // submitted from the node's bottom sheet. The card list this replaced is gone.
          <TreeScreen data={data} role={actor.role} />
        ) : (
          <LeaderView data={data} />
        )}
      </main>
    );
  } catch (error) {
    const unauthenticated = error instanceof AppError && error.status === 401;
    return (
      <main>
        <Banner />
        <p style={{ marginTop: '1.5rem' }}>
          {unauthenticated
            ? 'Accedi per visualizzare i dati del tuo percorso.'
            : error instanceof AppError
              ? error.message
              : 'Servizio non disponibile. Verifica Postgres e le migrazioni.'}
        </p>
        <a className="button-link" href="/auth/login">
          Accedi con Keycloak
        </a>
      </main>
    );
  }
}
