import { currentActor } from '@/lib/service';
import { readState } from '@/lib/db';
import { dashboard } from '@/lib/domain';
import { AppError } from '@/lib/errors';
import { SkillCard } from './ui/skill-card';
import { AssignExplorerForm, CreatePatrolForm, ReviewForm } from './ui/leader-forms';

export const dynamic = 'force-dynamic';

type Dashboard = Extract<ReturnType<typeof dashboard>, { patrols: unknown }>;

const ROLES: Record<string, string> = {
  admin: 'amministratore',
  leader: 'capo reparto',
  explorer: 'esploratore',
};

function TopBar({ name, role }: { name: string; role: string }) {
  return (
    <div className="topbar">
      <div>
        <h1>Bravely</h1>
        <p className="muted">
          {name} · {ROLES[role] ?? role}
        </p>
      </div>
      <div className="row">
        <a className="muted" href="/albero">
          Albero delle skill
        </a>
        <a className="muted" href="/api/dashboard">
          JSON
        </a>
        <form action="/auth/logout" method="post">
          <button data-variant="ghost">Esci</button>
        </form>
      </div>
    </div>
  );
}

function ExplorerView({ data }: { data: Dashboard }) {
  const patrol = data.patrols[0];
  const titleOf = (id: string) => data.skills.find((k) => k.id === id)?.title ?? id;
  if (!patrol) return <p>Nessuna pattuglia da mostrare.</p>;
  return (
    <>
      <h2>
        {patrol.name} · {patrol.completed} skill conseguite
      </h2>
      <div className="row">
        {patrol.achievements.map((achievement) => (
          <span
            key={achievement.id}
            className="badge"
            data-status={achievement.earned ? 'completed' : undefined}
          >
            {achievement.title}
            {achievement.earned ? '' : ` · ne mancano ${achievement.remaining}`}
          </span>
        ))}
      </div>
      <h2>Le tue skill</h2>
      <div className="stack">
        {patrol.skills.map((entry) => {
          const skill = data.skills.find((k) => k.id === entry.skillId);
          if (!skill) return null;
          return (
            <SkillCard
              key={`${entry.skillId}-${entry.targetId}`}
              skill={skill}
              targetId={entry.targetId}
              status={entry.status}
              missing={entry.missingPrerequisites}
              evidence={data.evidence.find(
                (e) => e.skillId === entry.skillId && e.targetId === entry.targetId,
              )}
              // Troop-scoped skills belong to the leaders; an explorer only reads them.
              canSubmit={skill.scope === 'patrol'}
              titleOf={titleOf}
            />
          );
        })}
      </div>
    </>
  );
}

function LeaderView({ data }: { data: Dashboard }) {
  const titleOf = (id: string) => data.skills.find((k) => k.id === id)?.title ?? id;
  const evidenceFor = (skillId: string, targetId: string) =>
    data.evidence.find((e) => e.skillId === skillId && e.targetId === targetId);
  const pending = data.evidence.filter((e) => e.status === 'pending');
  const nameOf = (targetId: string, targetType: string) =>
    targetType === 'troop'
      ? (data.troops.find((t) => t.id === targetId)?.name ?? targetId)
      : (data.patrols.find((p) => p.id === targetId)?.name ?? targetId);

  return (
    <>
      <h2>Da verificare · {pending.length}</h2>
      {pending.length === 0 && <p className="muted">Nessuna prova in attesa.</p>}
      <div className="stack">
        {pending.map((evidence) => (
          <article key={evidence.id} className="card">
            <div className="card-head">
              <h3>
                {titleOf(evidence.skillId)} · {nameOf(evidence.targetId, evidence.targetType)}
              </h3>
              <span className="badge" data-status="pending">
                {evidence.color === 'amber' ? 'Ambra' : 'Blu'}
              </span>
            </div>
            <ReviewForm evidenceId={evidence.id} />
          </article>
        ))}
      </div>

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
                    <h3>{patrol.name}</h3>
                    <span className="badge">{patrol.completed} conseguite</span>
                  </div>
                  <div className="row" style={{ marginTop: '0.5rem' }}>
                    {patrol.skills
                      .filter((entry) => entry.status !== 'locked')
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
            <div className="stack">
              <CreatePatrolForm troopId={troop.id} />
              {patrols.length > 0 && people.length > 0 && (
                <AssignExplorerForm people={people} patrols={patrols} />
              )}
            </div>
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
          <ExplorerView data={data} />
        ) : (
          <LeaderView data={data} />
        )}
      </main>
    );
  } catch (error) {
    const unauthenticated = error instanceof AppError && error.status === 401;
    return (
      <main>
        <h1>Bravely</h1>
        <p>
          {unauthenticated
            ? 'Accedi per visualizzare i dati del tuo percorso.'
            : error instanceof AppError
              ? error.message
              : 'Servizio non disponibile. Verifica Postgres e le migrazioni.'}
        </p>
        <a href="/auth/login">Accedi con Keycloak</a>
      </main>
    );
  }
}
