// Wiring only: the runner itself lives in lib/migrate.ts so a test can exercise it.
//
// One transaction and one advisory lock around the whole run, so two deployments racing cannot
// both apply the same file and a failure halfway through leaves nothing behind.
import { pool } from '../lib/db';
import { migrate } from '../lib/migrate';
import { initialState } from '../lib/model';

const client = await pool.connect();
try {
  await client.query('BEGIN');
  await client.query('SELECT pg_advisory_xact_lock(73642719)');
  const applied = await migrate(client);
  // Idempotent, and separate from the migrations: the single domain document has to exist before
  // the app can read anything. Databases created by the previous runner already have 001 applied;
  // its CREATE TABLE IF NOT EXISTS lets the first run here record it instead of failing.
  await client.query('INSERT INTO bravely_state(id,value) VALUES(1,$1) ON CONFLICT DO NOTHING', [
    JSON.stringify(initialState()),
  ]);
  await client.query('COMMIT');
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
