import { currentActor } from '@/lib/service';
import { readState } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { layout } from '@/lib/tree';
import { SkillEditor } from '../ui/skill-editor';
import { AchievementsEditor } from '../ui/achievements-editor';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Amministrazione · Bravely' };

export default async function AdminPage() {
  try {
    const actor = await currentActor();
    // UX gate only: execute() rejects a non-admin saveSkill regardless of what is rendered.
    if (actor.role !== 'admin')
      return (
        <main>
          <Header />
          <p>Questa sezione è riservata agli amministratori Bravely.</p>
          <p className="muted">
            Serve il ruolo realm <code>ADMIN_BRAVELY</code> in Keycloak, assegnato esplicitamente.
          </p>
        </main>
      );

    const state = await readState();
    const tree = layout(state.skills);
    const placed = new Map(tree.nodes.map((node) => [node.skill.id, node]));

    return (
      <main>
        <Header />
        <h2>Albero delle skill</h2>
        <SkillEditor
          skills={state.skills.map((skill) => ({
            id: skill.id,
            title: skill.title,
            description: skill.description,
            scope: skill.scope,
            prerequisites: skill.prerequisites,
            public: skill.public,
            revision: skill.revision,
            x: placed.get(skill.id)?.x ?? 0,
            y: placed.get(skill.id)?.y ?? 0,
          }))}
          edges={tree.edges.map((edge) => ({
            id: edge.id,
            source: edge.from,
            target: edge.to,
            implicit: edge.implicit,
          }))}
        />

        <h2>Achievement</h2>
        <AchievementsEditor initial={state.achievements} skillCount={state.skills.length} />
      </main>
    );
  } catch (error) {
    return (
      <main>
        <Header />
        <p>
          {error instanceof AppError && error.status === 401
            ? 'Accedi per amministrare il catalogo.'
            : error instanceof AppError
              ? error.message
              : 'Servizio non disponibile. Verifica Postgres e le migrazioni.'}
        </p>
        <a href="/auth/login">Accedi con Keycloak</a>
      </main>
    );
  }
}

function Header() {
  return (
    <div className="topbar">
      <div>
        <h1>Amministrazione</h1>
        <p className="muted">Catalogo delle skill e dei prerequisiti</p>
      </div>
      <div className="row">
        <a className="muted" href="/tree">
          Albero
        </a>
        <a className="muted" href="/">
          ← Dashboard
        </a>
      </div>
    </div>
  );
}
