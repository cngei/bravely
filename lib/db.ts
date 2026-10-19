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
// When the whole domain was one row, `SELECT ... FOR UPDATE` on it serialized every write. Now
// only the two commands that enforce a cross-row invariant the schema cannot express need that —
// see needsGlobalLock() in lib/commands.ts for which and why.
//
// `serialize` defaults to true on purpose: forgetting it costs throughput, while forgetting the
// other way round would cost an invariant, and silently.
//
// The transaction still spans the file bytes: the caller gets the same client, so an upload's
// rows and its bytes commit together.
const WRITE_LOCK = 73642720;
const isUniqueViolation = (error: unknown) =>
  typeof error === 'object' && error !== null && (error as { code?: unknown }).code === '23505';

export async function mutate<T>(
  fn: (state: State, client: pg.PoolClient) => Promise<T> | T,
  serialize = true,
): Promise<T> {
  try {
    return await attempt(fn, serialize);
  } catch (error) {
    // Two unserialized writers racing for the same new row: one inserts, the other's UNIQUE
    // constraint fires. Retried once against a fresh load it converges rather than failing — the
    // loser now finds the row and the reducer treats it as existing. This is the trade the global
    // lock used to hide: the constraint catches what the lock prevented.
    if (serialize || !isUniqueViolation(error)) throw error;
    return attempt(fn, serialize);
  }
}

async function attempt<T>(
  fn: (state: State, client: pg.PoolClient) => Promise<T> | T,
  serialize: boolean,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (serialize) await client.query('SELECT pg_advisory_xact_lock($1)', [WRITE_LOCK]);
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
