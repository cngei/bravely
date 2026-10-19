import pg from 'pg';
import type { State } from './model';
import { load, save } from './repo';
const globalDb = globalThis as unknown as { bravelyPool?: pg.Pool };
export const pool = (globalDb.bravelyPool ??= new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  connectionTimeoutMillis: 5000,
}));
export async function readState(): Promise<State> {
  return load(pool);
}
// Writes still serialize globally, exactly as they did when the whole domain was one row and the
// lock was `SELECT ... FOR UPDATE` on it. The lock moved to an advisory one because there is no
// longer a row to take it on — the behaviour, including the concurrency test that pins it, is
// unchanged. Narrowing it (commands that touch only proofs need no global lock, since
// UNIQUE (skill_id, target_id) now enforces the invariant it protected) is a separate change.
//
// The transaction still spans the file bytes: the caller gets the same client, so an upload's
// rows and its bytes commit together.
const WRITE_LOCK = 73642720;
export async function mutate<T>(
  fn: (state: State, client: pg.PoolClient) => Promise<T> | T,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1)', [WRITE_LOCK]);
    const state = await load(client);
    // The reducer mutates `state` in place, so the diff needs a copy taken before it runs.
    const before = structuredClone(state);
    const result = await fn(state, client);
    await save(client, before, state);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
