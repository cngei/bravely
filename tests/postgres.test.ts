import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { emptyState, initialState, type Actor, type State } from '../lib/model';
import { execute } from '../lib/domain';
import { migrate } from '../lib/migrate';
import { load, save } from '../lib/repo';
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
    // Through the repository, so the fixture lands in the tables the app now reads.
    await save(db.pool, emptyState(), s);
  });
  afterAll(async () => {
    await db?.pool.end();
    if (control) {
      await control.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await control.end();
    }
  });
  // Everything lib/repo.ts converts by hand, in one pass: bigint comes back from node-postgres as
  // a string, timestamptz as a Date where the domain wants an ISO string, a jsonb array must be
  // sent as a JSON string or it becomes a Postgres array, and the database's null is the domain's
  // absent field. A mistake in any of those compiles, passes every in-memory test, and corrupts
  // data silently — which is exactly how the form-comparison bug got in.
  //
  // So: populate every optional field, write it, read it back, and demand the same State. In its
  // own schema, because a full State would trample the shared fixture.
  it('round trips a fully populated State through the tables unchanged', async () => {
    const scratch = `bravely_trip_${randomUUID().replaceAll('-', '')}`;
    await control.query(`CREATE SCHEMA ${scratch}`);
    const client = await control.connect();
    try {
      await client.query(`SET search_path = ${scratch}`);
      await migrate(client);

      const field = { id: 'testo', label: 'Racconto', type: 'text' as const, required: true };
      const media = {
        id: 'media',
        label: 'Foto',
        type: 'file' as const,
        required: false,
        minFiles: 2,
        maxFiles: 7,
      };
      const fileId = randomUUID();
      await client.query('INSERT INTO files VALUES($1,$2)', [fileId, Buffer.from([1, 2, 3])]);

      // Arrays are in key order throughout, because load() is ORDER BY its key and toEqual
      // compares arrays positionally.
      const state: State = {
        troops: [
          { id: 't1', name: 'Interno', source: 'cngei' },
          { id: 't2', name: 'Esterno', source: 'external' },
        ],
        patrols: [{ id: 'p1', name: 'Lupi', troopId: 't1' }],
        people: [
          // One assigned and one not: the unassigned one is the null/undefined boundary.
          { id: 'u1', name: 'Con pattuglia', troopId: 't1', patrolId: 'p1' },
          { id: 'u2', name: 'Senza pattuglia', troopId: 't1' },
        ],
        externalUsers: [{ subject: 's1', name: 'Esterno', role: 'leader', troopIds: ['t2'] }],
        skills: [
          {
            id: 'k1',
            title: 'Uno',
            description: 'Descrizione',
            scope: 'troop',
            prerequisites: [],
            public: true,
            revision: 3,
            forms: [
              { id: 'k1:blue:r3', skillId: 'k1', color: 'blue', title: 'Blu', fields: [field] },
              { id: 'k1:amber:r3', skillId: 'k1', color: 'amber', title: 'Ambra', fields: [media] },
            ],
          },
          {
            id: 'k2',
            title: 'Due',
            description: '',
            scope: 'patrol',
            prerequisites: ['k1'],
            public: false,
            revision: 1,
            forms: [
              { id: 'k2:blue:r1', skillId: 'k2', color: 'blue', title: 'Blu', fields: [field] },
            ],
          },
        ],
        // Superseded by an edit and still referenced by the rejected proof below.
        retiredForms: [
          { id: 'k2:blue:r0', skillId: 'k2', color: 'blue', title: 'Vecchio', fields: [field] },
        ],
        evidence: [
          // Started: no form chosen, no answers, nothing reviewed — every optional column null.
          {
            id: 'e1',
            skillId: 'k1',
            targetId: 't1',
            targetType: 'troop',
            startedAt: '2026-01-01T00:00:00.000Z',
            status: 'started',
          },
          {
            id: 'e2',
            skillId: 'k2',
            formId: 'k2:blue:r1',
            targetId: 'p1',
            targetType: 'patrol',
            startedAt: '2026-01-02T00:00:00.000Z',
            submittedAt: '2026-01-03T10:30:00.000Z',
            submittedBy: 'u1',
            answers: { testo: 'Ecco com’è andata', media: [fileId] },
            status: 'pending',
          },
          // Points at a retired form, which is the whole reason retiredForms exists.
          {
            id: 'e3',
            skillId: 'k1',
            formId: 'k2:blue:r0',
            targetId: 'p1',
            targetType: 'patrol',
            startedAt: '2026-01-04T00:00:00.000Z',
            submittedAt: '2026-01-05T00:00:00.000Z',
            submittedBy: 'u1',
            answers: { testo: 'Primo tentativo' },
            status: 'rejected',
            reason: 'Da rifare',
            reviewedAt: '2026-01-06T08:15:00.000Z',
            reviewedBy: 'a',
          },
        ],
        uploads: [
          {
            id: fileId,
            skillId: 'k2',
            targetId: 'p1',
            targetType: 'patrol',
            name: 'foto.png',
            type: 'image/png',
            // Number, not string: bigint arrives from node-postgres as a string.
            size: 3,
            createdBy: 'u1',
            createdAt: '2026-01-03T10:29:00.000Z',
          },
        ],
        achievements: [{ id: 'a1', title: 'Primo', threshold: 5 }],
      };

      await save(client, emptyState(), state);
      expect(await load(client)).toEqual(state);

      // A mutation that changes nothing must write nothing: the diff is what keeps one command
      // from touching every row of every table.
      //
      // Shaped exactly like mutate(): `before` is a structuredClone of the same load as `after`.
      // That matters, because sync() compares by serialisation, and jsonb does not preserve key
      // order — a hand-built State would differ textually from a loaded one and report every row
      // as changed. Sound in production precisely because both sides share one origin.
      const loaded = await load(client);
      const touched: string[] = [];
      const spy = {
        query: (sql: string, values?: unknown[]) => {
          if (/^\s*(INSERT|UPDATE|DELETE)/i.test(sql)) touched.push(sql.trim().split('\n')[0]);
          return client.query(sql, values);
        },
      };
      await save(spy, structuredClone(loaded), loaded);
      expect(touched).toEqual([]);
    } finally {
      await client.query('SET search_path = public');
      client.release();
      await control.query(`DROP SCHEMA IF EXISTS ${scratch} CASCADE`);
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
  // Regression: this can only fail against a real database. jsonb does not preserve key order, so
  // a form read back from the catalogue is never textually equal to the same form rebuilt from a
  // request. Comparing them by serialisation reported every save as an edit, minting a new form id
  // each time and leaving every submitted proof's questions a revision behind. An in-memory test
  // cannot see it: there, both sides keep the order they were written in.
  it('keeps a form id when a save round trips an unchanged form through jsonb', async () => {
    const before = (await db.readState()).skills.find((k) => k.id === 'initial-1')!;
    await db.mutate((s) =>
      execute(s, actor, {
        type: 'saveSkill',
        skill: {
          id: before.id,
          title: before.title,
          description: before.description,
          scope: before.scope,
          prerequisites: before.prerequisites,
          public: before.public,
          // Back to a draft: ids are the domain's to mint, and minting one is the bug's symptom.
          forms: before.forms.map(({ id: _id, skillId: _skillId, ...draft }) => draft),
        },
      }),
    );
    const after = (await db.readState()).skills.find((k) => k.id === 'initial-1')!;
    expect(after.forms.map((f) => f.id)).toEqual(before.forms.map((f) => f.id));
    expect(after.revision).toBe(before.revision + 1);
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
  // Unserialized on purpose, because that is how startSkill now reaches the database: the one
  // proof per target that the global write lock used to protect is UNIQUE (skill_id, target_id)
  // instead. So the racing writers hit the constraint rather than queueing, and mutate() retries
  // each loser once against a fresh load — where the reducer finds the row and treats the proof as
  // already open. None of them may fail, and only one row may exist.
  it('multiple concurrent start requests create only one evidence record', async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 6 }, () =>
        db.mutate(
          (s) => execute(s, actor, { type: 'startSkill', skillId: 'initial-1', targetId: 't' }),
          false,
        ),
      ),
    );
    expect(results.filter((r) => r.status === 'rejected')).toEqual([]);
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
