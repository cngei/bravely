import pg from 'pg';
import type { State } from './model';
const globalDb = globalThis as unknown as { bravelyPool?: pg.Pool };
export const pool = (globalDb.bravelyPool ??= new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  connectionTimeoutMillis: 5000,
}));
export async function readState(): Promise<State> {
  const { rows } = await pool.query('SELECT value FROM bravely_state WHERE id=1');
  if (!rows[0]) throw new Error('Database non inizializzato: npm run db:migrate');
  return rows[0].value;
}
// All domain writes, including file bytes, commit atomically. The row lock also
// serializes decisions across multiple Next.js processes (no in-memory locks).
export async function mutate<T>(
  fn: (state: State, client: pg.PoolClient) => Promise<T> | T,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query('SELECT value FROM bravely_state WHERE id=1 FOR UPDATE');
    if (!rows[0]) throw new Error('Database non inizializzato');
    const state: State = rows[0].value;
    const result = await fn(state, client);
    await client.query(
      'UPDATE bravely_state SET value=$1, version=version+1, updated_at=now() WHERE id=1',
      [JSON.stringify(state)],
    );
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
