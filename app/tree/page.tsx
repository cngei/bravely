import { currentActor } from '@/lib/service';
import { readState } from '@/lib/db';
import { dashboard } from '@/lib/domain';
import { AppError } from '@/lib/errors';
import { Banner } from '../ui/banner';
import { TreeScreen, selectPatrol } from '../ui/tree-screen';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Albero delle skill · Bravely' };

// The leaders' view of the tree. The screen itself lives in <TreeScreen>, because for an explorer
// the same screen is the home page — see app/page.tsx.
export default async function TreePage({
  searchParams,
}: {
  searchParams: Promise<{ patrol?: string }>;
}) {
  try {
    const actor = await currentActor();
    const data = dashboard(await readState(), actor);

    if (!('patrols' in data))
      return (
        <main>
          <Header subtitle="" />
          <p>{data.message}</p>
        </main>
      );

    const requested = (await searchParams).patrol;
    const selected = selectPatrol(data, requested);

    return (
      <main>
        <Header
          subtitle={
            selected ? selected.name : 'Struttura del percorso — nessuna pattuglia da seguire'
          }
        />
        <TreeScreen data={data} role={actor.role} requestedPatrol={requested}>
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
        </TreeScreen>
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
    <>
      <Banner>
        <a className="chip" href="/">
          Dashboard
        </a>
        <a className="chip" data-active href="/tree">
          Albero
        </a>
      </Banner>
      <div className="topbar">
        <div>
          <h1>Albero delle skill</h1>
          {subtitle && <p className="muted">{subtitle}</p>}
        </div>
      </div>
    </>
  );
}
