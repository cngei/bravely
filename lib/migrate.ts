// Migration runner. Separated from scripts/migrate.ts so it can be exercised by a test instead of
// only by a deployment: this is the one component whose failure mode is silence — the runner it
// replaces read a single hardcoded filename, so a 002_*.sql would never have run and never have
// complained. The same hardcoded read was duplicated in tests/postgres.test.ts, which now calls
// this and therefore picks up new migrations on its own.
//
// Transaction and advisory lock are the caller's job, so a test can run this inside its own
// throwaway schema while the script runs it under a lock. The consequence worth knowing: because
// the script wraps the whole run in one transaction, statements that cannot run inside one
// (CREATE INDEX CONCURRENTLY, ALTER TYPE ... ADD VALUE on older servers) need their own path.
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';

// Structural, so a Pool, a Client and a PoolClient all satisfy it without importing pg here.
export interface Queryable {
  query(sql: string, values?: unknown[]): Promise<{ rows: unknown[] }>;
}

const directory = new URL('../migrations/', import.meta.url);
const digest = (sql: string) => createHash('sha256').update(sql).digest('hex');

/** Applies every migration this database has not seen yet. Returns the filenames applied. */
export async function migrate(client: Queryable): Promise<string[]> {
  await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    filename   text PRIMARY KEY,
    checksum   text NOT NULL,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`);

  // Lexicographic order, which is why the files are numbered: 001_, 002_, … up to 999.
  const files = (await readdir(directory)).filter((name) => name.endsWith('.sql')).sort();
  const { rows } = await client.query('SELECT filename, checksum FROM schema_migrations');
  const applied = new Map(
    (rows as { filename: string; checksum: string }[]).map((row) => [row.filename, row.checksum]),
  );

  const run: string[] = [];
  for (const file of files) {
    const sql = await readFile(new URL(file, directory), 'utf8');
    const previous = applied.get(file);
    if (previous !== undefined) {
      // An applied migration that no longer matches the file means somebody edited history
      // instead of adding to it: every other database is now in a different shape from this one.
      if (previous !== digest(sql))
        throw new Error(
          `La migrazione ${file} è già stata applicata ma il file è cambiato. ` +
            'Non modificare una migrazione applicata: aggiungine una nuova.',
        );
      continue;
    }
    await client.query(sql);
    await client.query('INSERT INTO schema_migrations(filename, checksum) VALUES($1,$2)', [
      file,
      digest(sql),
    ]);
    run.push(file);
  }
  return run;
}
