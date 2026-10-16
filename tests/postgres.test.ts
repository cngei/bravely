import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { initialState, type Actor } from '../lib/model';
import { execute } from '../lib/domain';
import { migrate } from '../lib/migrate';
// Explicit opt-in; every run uses and removes a unique isolated schema.
const auth = vi.hoisted(() => ({
  actor: { id: 'a', name: 'Admin', role: 'admin', troopIds: [], explorerTroopIds: [] } as Actor,
}));
vi.mock('../lib/service', () => ({ currentActor: async () => auth.actor }));
const url = process.env.TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;
suite('real PostgreSQL persistence and concurrency', () => {
  const schema = `bravely_test_${randomUUID().replaceAll('-', '')}`;
  let routes: typeof import('../app/api/[...path]/route');
  let control: pg.Pool;
  let db: typeof import('../lib/db');
  const actor: Actor = {
    id: 'a',
    name: 'Admin',
    role: 'admin',
    troopIds: [],
    explorerTroopIds: [],
  };
  beforeAll(async () => {
    control = new pg.Pool({ connectionString: url });
    await control.query(`CREATE SCHEMA ${schema}`);
    const connection = new URL(url!);
    connection.searchParams.set('options', `-c search_path=${schema}`);
    process.env.DATABASE_URL = connection.href;
    db = await import('../lib/db');
    routes = await import('../app/api/[...path]/route');
    // Through the real runner, not a hardcoded filename: the harness used to read
    // 001_initial.sql directly and would have silently ignored every later migration.
    await migrate(db.pool);
    const s = initialState();
    s.troops = [{ id: 't', name: 'Test', source: 'external' }];
    await db.pool.query('INSERT INTO bravely_state VALUES(1,$1,0,now())', [JSON.stringify(s)]);
  });
  afterAll(async () => {
    await db?.pool.end();
    if (control) {
      await control.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await control.end();
    }
  });
  // In a schema of its own: this test tampers with the ledger on purpose, and doing that in the
  // shared schema would break every test after it.
  it('applies each migration once and refuses to run an edited one', async () => {
    const scratch = `bravely_mig_${randomUUID().replaceAll('-', '')}`;
    await control.query(`CREATE SCHEMA ${scratch}`);
    const client = await control.connect();
    try {
      await client.query(`SET search_path = ${scratch}`);

      const first = await migrate(client);
      expect(first).toContain('001_initial.sql');
      // Every file on disk is recorded, so a new migration cannot be quietly skipped.
      const { rows } = await client.query('SELECT filename FROM schema_migrations');
      expect(rows.map((r) => r.filename).sort()).toEqual([...first].sort());

      // Second run is a no-op rather than a re-apply: this is what the old runner got wrong.
      expect(await migrate(client)).toEqual([]);

      await client.query('UPDATE schema_migrations SET checksum=$1 WHERE filename=$2', [
        'tampered',
        first[0],
      ]);
      await expect(migrate(client)).rejects.toThrow(/è cambiato/);
    } finally {
      // The client goes back to a shared pool, so it must not carry the scratch search_path.
      await client.query('SET search_path = public');
      client.release();
      await control.query(`DROP SCHEMA IF EXISTS ${scratch} CASCADE`);
    }
  });
  it('serializes simultaneous duplicate patrol creation', async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 8 }, () =>
        db.mutate((s) =>
          execute(s, actor, { type: 'createPatrol', troopId: 't', name: 'Concurrent' }),
        ),
      ),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect((await db.readState()).patrols).toHaveLength(1);
  });
  it('rolls back both file data and domain metadata on failure', async () => {
    const id = randomUUID();
    await expect(
      db.mutate(async (s, client) => {
        await client.query('INSERT INTO files VALUES($1,$2)', [id, Buffer.from('test')]);
        s.achievements = [];
        throw new Error('rollback');
      }),
    ).rejects.toThrow('rollback');
    expect((await db.pool.query('SELECT id FROM files WHERE id=$1', [id])).rowCount).toBe(0);
    expect((await db.readState()).achievements).toHaveLength(3);
  });
  it('persists binary content and metadata in one commit', async () => {
    const id = randomUUID();
    await db.mutate(async (s, client) => {
      await client.query('INSERT INTO files VALUES($1,$2)', [id, Buffer.from([0, 1, 2, 255])]);
      s.uploads.push({
        id,
        skillId: 'initial-1',
        targetId: 't',
        targetType: 'troop',
        name: 'test',
        type: 'image/png',
        size: 4,
        createdBy: 'a',
        createdAt: new Date().toISOString(),
      });
    });
    expect((await db.readState()).uploads[0].id).toBe(id);
    expect((await db.pool.query('SELECT data FROM files WHERE id=$1', [id])).rows[0].data).toEqual(
      Buffer.from([0, 1, 2, 255]),
    );
  });
  it('multiple concurrent start requests create only one evidence record', async () => {
    await Promise.all(
      Array.from({ length: 6 }, () =>
        db.mutate((s) =>
          execute(s, actor, { type: 'startSkill', skillId: 'initial-1', targetId: 't' }),
        ),
      ),
    );
    expect((await db.readState()).evidence).toHaveLength(1);
  });
  it('HTTP command handler validates payloads and blocks cross-origin writes', async () => {
    const params = { params: Promise.resolve({ path: ['commands'] }) };
    const foreign = await routes.POST(
      new Request('http://localhost:3000/api/commands', {
        method: 'POST',
        headers: { origin: 'http://evil.test', 'content-type': 'application/json' },
        body: '{}',
      }),
      params,
    );
    expect(foreign.status).toBe(403);
    const bad = await routes.POST(
      new Request('http://localhost:3000/api/commands', {
        method: 'POST',
        headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' },
        body: '{"type":"unknown"}',
      }),
      params,
    );
    expect(bad.status).toBe(400);
    const valid = await routes.POST(
      new Request('http://localhost:3000/api/commands', {
        method: 'POST',
        headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' },
        body: JSON.stringify({ type: 'createPatrol', troopId: 't', name: 'HTTP' }),
      }),
      params,
    );
    expect(valid.status).toBe(200);
    expect((await valid.json()).name).toBe('HTTP');
  });
  it('HTTP upload and protected download preserve bytes and deny unassigned users', async () => {
    const bytes = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    const res = await routes.POST(
      new Request('http://localhost:3000/api/files?skillId=initial-1&targetId=t&name=photo.png', {
        method: 'POST',
        headers: { origin: 'http://localhost:3000' },
        body: bytes,
      }),
      { params: Promise.resolve({ path: ['files'] }) },
    );
    expect(res.status).toBe(201);
    const upload = await res.json();
    const ctx = { params: Promise.resolve({ path: ['files', upload.id] }) };
    const download = await routes.GET(new Request('http://localhost:3000' + upload.url), ctx);
    expect(download.status).toBe(200);
    expect(Buffer.from(await download.arrayBuffer())).toEqual(bytes);
    expect(download.headers.get('cache-control')).toContain('no-store');
    auth.actor = {
      id: 'unknown',
      name: 'Unknown',
      role: 'explorer',
      troopIds: [],
      explorerTroopIds: [],
    };
    try {
      expect(
        (await routes.GET(new Request('http://localhost:3000' + upload.url), ctx)).status,
      ).toBe(403);
    } finally {
      auth.actor = actor;
    }
  });
});
