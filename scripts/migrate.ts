import { readFile } from 'node:fs/promises';
import { pool } from '../lib/db';
import { initialState } from '../lib/model';
const client = await pool.connect();
try {
  await client.query('BEGIN');
  await client.query('SELECT pg_advisory_xact_lock(73642719)');
  await client.query(
    await readFile(new URL('../migrations/001_initial.sql', import.meta.url), 'utf8'),
  );
  await client.query('INSERT INTO bravely_state(id,value) VALUES(1,$1) ON CONFLICT DO NOTHING', [
    JSON.stringify(initialState()),
  ]);
  await client.query('COMMIT');
  console.log('Database Bravely pronto.');
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
  await pool.end();
}
