import { currentActor } from '@/lib/service';
import { readState } from '@/lib/db';
import { dashboard } from '@/lib/domain';
import { AppError } from '@/lib/errors';
export const dynamic = 'force-dynamic';
export default async function Home() {
  try {
    const actor = await currentActor();
    const data = dashboard(await readState(), actor);
    return (
      <main>
        <h1>Bravely</h1>
        <form action="/auth/logout" method="post">
          <button>Esci da Bravely</button>
        </form>
        <p>
          <a href="/api/dashboard">Apri JSON</a>
        </p>
        <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
          {JSON.stringify(data, null, 2)}
        </pre>
      </main>
    );
  } catch (e) {
    const unauth = e instanceof AppError && e.status === 401;
    return (
      <main>
        <h1>Bravely</h1>
        <p>
          {unauth
            ? 'Accedi per visualizzare i dati del tuo percorso.'
            : e instanceof AppError
              ? e.message
              : 'Servizio non disponibile. Verifica Postgres e le migrazioni.'}
        </p>
        <a href="/auth/login">Accedi con Keycloak</a>
      </main>
    );
  }
}
