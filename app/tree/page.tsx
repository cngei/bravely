import { currentActor } from '@/lib/service';
import { readState } from '@/lib/db';
import { dashboard } from '@/lib/domain';
import { AppError } from '@/lib/errors';
import { layout } from '@/lib/tree';
import { STATUS_LABELS } from '../ui/labels';
import { SkillGraph } from '../ui/skill-graph';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Albero delle skill · Bravely' };

// The card clamps to three lines; this only stops a long description travelling to the client.
const summarise = (text: string, limit = 180) => {
  if (text.length <= limit) return text;
  const cut = text.slice(0, limit);
  return cut.slice(0, cut.lastIndexOf(' ') + 1 || limit).trimEnd() + '…';
};

export default async function TreePage({
  searchParams,
}: {
  searchParams: Promise<{ patrol?: string }>;
}) {
  try {
    const actor = await currentActor();
    const data = dashboard(await readState(), actor);
    const tree = layout('skills' in data ? data.skills : []);

    if (!('patrols' in data))
      return (
        <main>
          <Header subtitle="" />
          <p>{data.message}</p>
        </main>
      );

    // One tree per patrol: the DAG is shared, the progress on it is not.
    const requested = (await searchParams).patrol;
    const selected = data.patrols.find((p) => p.id === requested) ?? data.patrols[0];
    const progress = new Map((selected?.skills ?? []).map((s) => [s.skillId, s]));
    const status = new Map((selected?.skills ?? []).map((s) => [s.skillId, s.status]));
    // The pip shows which form colour the patrol actually chose, which lives on the evidence
    // rather than on progress(). Keyed by target too, since a skill's target differs by scope.
    const chosenPath = new Map(
      data.evidence.filter((e) => e.color).map((e) => [`${e.skillId}:${e.targetId}`, e.color]),
    );
    const titleOf = (id: string) => data.skills.find((k) => k.id === id)?.title ?? id;

    return (
      <main>
        <Header
          subtitle={
            selected
              ? `${selected.name} · ${selected.completed} di ${data.skills.length} conseguite`
              : 'Struttura del percorso — nessuna pattuglia da seguire'
          }
        />

        {data.patrols.length > 1 && (
          <div className="row" style={{ marginTop: '1rem' }}>
            {data.patrols.map((patrol) => (
              <a
                key={patrol.id}
                className="chip"
                data-active={patrol.id === selected?.id || undefined}
                href={`/tree?patrol=${encodeURIComponent(patrol.id)}`}
              >
                {patrol.name}
              </a>
            ))}
          </div>
        )}

        {tree.nodes.length === 0 ? (
          <p className="muted" style={{ marginTop: '1.5rem' }}>
            Nessuna skill in catalogo. Eseguire <code>npm run db:seed</code>.
          </p>
        ) : (
          <>
            {/* The graph is the visual layer; the <details> list below is the accessible one. */}
            <SkillGraph
              nodes={tree.nodes.map((node) => ({
                id: node.skill.id,
                title: node.skill.title,
                // Capped here, not in CSS: descriptions may be 10000 characters and all of
                // them would be serialised into the client payload for three visible lines.
                description: summarise(node.skill.description),
                scope: node.skill.scope,
                status: status.get(node.skill.id),
                color: chosenPath.get(`${node.skill.id}:${progress.get(node.skill.id)?.targetId}`),
                x: node.x,
                y: node.y,
              }))}
              edges={tree.edges.map((edge) => ({
                id: edge.id,
                source: edge.from,
                target: edge.to,
                implicit: edge.implicit,
              }))}
            />

            <p className="muted">
              Le linee tratteggiate sono il requisito implicito: ogni skill di pattuglia richiede
              entrambe le skill iniziali di reparto, anche senza indicarle. Le skill più in basso lo
              ereditano dai propri prerequisiti.
            </p>

            <details style={{ marginTop: '1.5rem' }}>
              <summary className="muted">Elenco testuale</summary>
              <ul style={{ marginTop: '0.75rem' }}>
                {tree.nodes.map((node) => {
                  const state = status.get(node.skill.id);
                  return (
                    <li key={node.skill.id}>
                      <strong>{node.skill.title}</strong>
                      {state ? ` — ${STATUS_LABELS[state] ?? state}` : ''}
                      {node.skill.prerequisites.length > 0 && (
                        <span className="muted">
                          {' '}
                          · richiede {node.skill.prerequisites.map(titleOf).join(', ')}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </details>
          </>
        )}
      </main>
    );
  } catch (error) {
    return (
      <main>
        <Header subtitle="" />
        <p>
          {error instanceof AppError && error.status === 401
            ? 'Accedi per vedere il tuo percorso.'
            : error instanceof AppError
              ? error.message
              : 'Servizio non disponibile. Verifica Postgres e le migrazioni.'}
        </p>
        <a href="/auth/login">Accedi con Keycloak</a>
      </main>
    );
  }
}

function Header({ subtitle }: { subtitle: string }) {
  return (
    <div className="topbar">
      <div>
        <h1>Albero delle skill</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
      </div>
      <a className="muted" href="/">
        ← Dashboard
      </a>
    </div>
  );
}
