// Full detail for one skill. This is the screen the specification calls "Dettaglio skill": the
// proofs required, the patrols that already earned it with their troop names, and whatever
// documentation the viewer is allowed to see.
//
// It reads from two places on purpose. dashboard() gives the viewer's own patrol context — status,
// missing prerequisites, their own evidence — and skillDetail() gives the cross-patrol view, whose
// privacy rules (canReadEvidence / canReadUpload) already live in the domain and are not repeated
// here. Until now skillDetail() was reachable only through GET /api/skills/:id.
import { currentActor } from '@/lib/service';
import { readState } from '@/lib/db';
import { dashboard, skillDetail } from '@/lib/domain';
import { AppError } from '@/lib/errors';
import { SkillCard } from '../../ui/skill-card';
import { Answers, EvidenceTimes } from '../../ui/evidence-view';
import { STATUS_LABELS } from '../../ui/labels';
import { Banner } from '../../ui/banner';

export const dynamic = 'force-dynamic';

export default async function SkillDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ patrol?: string }>;
}) {
  try {
    const actor = await currentActor();
    const state = await readState();
    const { id } = await params;
    const data = dashboard(state, actor);

    if (!('patrols' in data))
      return (
        <main>
          <Header title="Skill" />
          <p>{data.message}</p>
        </main>
      );

    // Throws 404 for an unknown id and 403 for an unassigned explorer; both land in the catch.
    const detail = skillDetail(state, actor, id);

    const requested = (await searchParams).patrol;
    const patrol = data.patrols.find((p) => p.id === requested) ?? data.patrols[0];
    const entry = patrol?.skills.find((s) => s.skillId === id);
    const own = entry
      ? data.evidence.find((e) => e.skillId === id && e.targetId === entry.targetId)
      : undefined;
    const titleOf = (skillId: string) =>
      data.skills.find((k) => k.id === skillId)?.title ?? skillId;

    return (
      <main>
        <Header title={detail.skill.title} subtitle={patrol?.name} />

        {entry && (
          <p>
            <span className="badge" data-status={entry.status}>
              {STATUS_LABELS[entry.status] ?? entry.status}
            </span>
          </p>
        )}
        {detail.skill.description && <p>{detail.skill.description}</p>}

        {/* Reuses the dashboard card, so the form, the start button and the submitted answers
            behave identically here — including the read-only mode when locked. */}
        {entry && (
          <SkillCard
            skill={detail.skill}
            targetId={entry.targetId}
            status={entry.status}
            missing={entry.missingPrerequisites}
            evidence={own}
            canSubmit={detail.skill.scope === 'patrol' || actor.role !== 'explorer'}
            titleOf={titleOf}
          />
        )}

        <h2>Pattuglie che l’hanno conseguita · {detail.achieverCount}</h2>
        {detail.achieverCount === 0 && <p className="muted">Ancora nessuna.</p>}
        <ul>
          {detail.achievers.map((achiever) => (
            <li key={achiever.patrolId}>
              {achiever.patrolName}
              {achiever.troopName ? <span className="muted"> · {achiever.troopName}</span> : null}
            </li>
          ))}
        </ul>

        <h2>Documentazione consultabile</h2>
        {detail.documentation.length === 0 && (
          <p className="muted">
            Nessuna documentazione visibile. Le documentazioni delle altre pattuglie sono
            accessibili solo se la skill è pubblica e la tua pattuglia l’ha già conseguita.
          </p>
        )}
        <div className="stack">
          {detail.documentation.map((document) => (
            <article key={document.id} className="card" data-status={document.status}>
              <div className="card-head">
                <h3>{STATUS_LABELS[document.status] ?? document.status}</h3>
                {document.color && (
                  <span className="badge">{document.color === 'amber' ? 'Ambra' : 'Blu'}</span>
                )}
              </div>
              <EvidenceTimes evidence={document} />
              <Answers evidence={document} />
              {document.files.length > 0 && (
                <p className="row">
                  {document.files.map((file) => (
                    <a key={file.id} href={file.url}>
                      {file.name}
                    </a>
                  ))}
                </p>
              )}
            </article>
          ))}
        </div>
      </main>
    );
  } catch (error) {
    return (
      <main>
        <Header title="Skill" />
        <p>
          {error instanceof AppError && error.status === 401
            ? 'Accedi per vedere questa skill.'
            : error instanceof AppError
              ? error.message
              : 'Servizio non disponibile. Verifica Postgres e le migrazioni.'}
        </p>
        <a href="/auth/login">Accedi con Keycloak</a>
      </main>
    );
  }
}

function Header({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <>
      <Banner>
        <a className="chip" href="/tree">
          ← Albero
        </a>
        <a className="chip" href="/">
          Dashboard
        </a>
      </Banner>
      <div className="topbar">
        <div>
          <h1>{title}</h1>
          {subtitle && <p className="muted">{subtitle}</p>}
        </div>
      </div>
    </>
  );
}
