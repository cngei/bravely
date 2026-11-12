import { currentActor } from '@/lib/service';
import { readState } from '@/lib/db';
import { dashboard } from '@/lib/domain';
import { AppError } from '@/lib/errors';
import { byManagement, managementAlerts } from '@/lib/notifications';
import { Banner } from '../ui/banner';
import { Nav } from '../ui/nav';
import { CreatePatrolForm } from '../ui/leader-forms';
import { ExplorerTable } from '../ui/explorer-table';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Gestione · Bravely' };

// Decision 4 of the November review: everything about running a troop — patrols, roster,
// confirmations, export — lives here. The review queue stays on the dashboard, because it is the
// daily task and this is the occasional one.
export default async function GestionePage() {
  try {
    const actor = await currentActor();
    const state = await readState();
    const alerts = managementAlerts(state.people, actor);
    // dashboard() already scopes troops, patrols and people to what this actor may manage: the
    // same filter as the queue, so the two pages cannot disagree about whose troop is whose.
    const data = dashboard(state, actor);

    if (actor.role === 'explorer' || !('patrols' in data))
      return (
        <main>
          <Header role={actor.role} />
          <p style={{ marginTop: '1.5rem' }}>Questa sezione è riservata a chi guida un reparto.</p>
        </main>
      );

    return (
      <main>
        <Header role={actor.role} alerts={alerts} />
        {alerts.total > 0 && (
          <p className="muted">
            {[
              alerts.unassigned > 0 && `${alerts.unassigned} senza pattuglia`,
              alerts.toConfirm > 0 && `${alerts.toConfirm} da confermare`,
            ]
              .filter(Boolean)
              .join(' · ')}
            . Sono in cima all’elenco del loro reparto.
          </p>
        )}
        {data.troops.length === 0 && <p className="muted">Nessun reparto da gestire.</p>}
        {data.troops.map((troop) => {
          const patrols = data.patrols.filter((p) => p.troopId === troop.id);
          const people = data.people.filter((p) => p.troopId === troop.id).sort(byManagement);
          return (
            <section key={troop.id}>
              <h2>{troop.name}</h2>

              <h3>Pattuglie · {patrols.length}</h3>
              <CreatePatrolForm troopId={troop.id} />

              <h3 style={{ marginTop: '2rem' }}>Esploratori del reparto · {people.length}</h3>
              {/* Always rendered: the roster is how a leader starts, so it must not depend on a
                  patrol already existing. */}
              <ExplorerTable people={people} patrols={patrols} />
            </section>
          );
        })}
      </main>
    );
  } catch (error) {
    const unauthenticated = error instanceof AppError && error.status === 401;
    return (
      <main>
        <Banner />
        <p style={{ marginTop: '1.5rem' }}>
          {unauthenticated
            ? 'Accedi per gestire il tuo reparto.'
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

function Header({
  role,
  alerts,
}: {
  role: Parameters<typeof Nav>[0]['role'];
  alerts?: Parameters<typeof Nav>[0]['alerts'];
}) {
  return (
    <>
      <Banner>
        <Nav role={role} alerts={alerts} active="gestione" />
      </Banner>
      <div className="topbar">
        <div>
          <h1>Gestione</h1>
          <p className="muted">Pattuglie e assegnazioni dei tuoi reparti</p>
        </div>
      </div>
    </>
  );
}
