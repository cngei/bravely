// Wiring only: the runner itself lives in lib/migrate.ts so a test can exercise it.
//
// One transaction and one advisory lock around the whole run, so two deployments racing cannot
// both apply the same file and a failure halfway through leaves nothing behind.
import { pool } from '../lib/db';
import { migrate } from '../lib/migrate';
import { emptyState, initialState } from '../lib/model';
import { save } from '../lib/repo';

const client = await pool.connect();
try {
  await client.query('BEGIN');
  await client.query('SELECT pg_advisory_xact_lock(73642719)');
  const applied = await migrate(client);
  // Separate from the migrations: the domain requires exactly two troop-scoped skills, so a brand
  // new database needs them before the app can read anything.
  //
  // Guarded on the catalogue being empty rather than written unconditionally: initial-1 and
  // initial-2 are meant to be renamed and re-formed from the admin panel, and an upsert on every
  // migrate run would quietly undo that work.
  const { rows } = await client.query('SELECT count(*)::int AS n FROM skills');
  const seeded = rows[0].n === 0;
  if (seeded) await save(client, emptyState(), initialState());
  await client.query('COMMIT');
  if (seeded) console.log('Catalogo iniziale creato.');
  for (const file of applied) console.log(`Applicata ${file}.`);
  console.log(
    applied.length === 0
      ? 'Database Bravely pronto: nessuna migrazione da applicare.'
      : `Database Bravely pronto: ${applied.length} migrazioni applicate.`,
  );
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
  await pool.end();
}
