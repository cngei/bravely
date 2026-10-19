// Translates between the tables and the State shape the domain expects.
//
// The point of this file is that execute() does not change. It is a pure reducer over a State, and
// 395 lines of mock-free tests depend on that; rewriting it against SQL would have thrown the
// safety net away during the one change that most needed it. So: load a State, let the reducer
// mutate it in place exactly as before, then write back the rows that actually differ.
//
// Writing back is diff-based rather than one explicit persistence step per command. Nine commands
// would have meant nine chances to forget a table; a diff cannot forget one.
import type {
  Achievement,
  Evidence,
  ExternalUser,
  Patrol,
  Person,
  Skill,
  SkillForm,
  State,
  Troop,
  Upload,
} from './model';

/** Structural, so a Pool, a Client and a PoolClient all satisfy it without importing pg here. */
export interface Db {
  query(sql: string, values?: unknown[]): Promise<{ rows: unknown[] }>;
}

// Every load is ORDER BY its key, which is not cosmetic: save() writes rows in the order it finds
// them, so two concurrent transactions touching the same rows in different orders could deadlock.
// A fixed order means they queue instead. It also makes load() deterministic, which the diff and
// the tests both benefit from.
const select = async <T>(db: Db, sql: string) => (await db.query(sql)).rows as T[];
/** jsonb columns need a JSON string: node-postgres would turn a JS array into a Postgres array
    literal, which is not valid jsonb. */
const json = (value: unknown) => JSON.stringify(value ?? null);
const iso = (value: unknown) => (value instanceof Date ? value.toISOString() : undefined);
/** Absent rather than null: the domain's optional fields are `?:`, and `null` would leak into
    answers, comparisons and JSON payloads. */
const maybe = (value: unknown) => (value === null ? undefined : (value as string));

// ---------- load ----------

type FormRow = { id: string; skill_id: string; color: 'blue' | 'amber'; body: unknown };
type SkillRow = {
  id: string;
  title: string;
  description: string;
  scope: 'troop' | 'patrol';
  prerequisites: string[];
  public: boolean;
  revision: number;
  form_ids: string[];
};

export async function load(db: Db): Promise<State> {
  const troops = await select<Troop>(db, 'SELECT id, name, source FROM troops ORDER BY id');
  const patrolRows = await select<{ id: string; troop_id: string; name: string }>(
    db,
    'SELECT id, troop_id, name FROM patrols ORDER BY id',
  );
  const peopleRows = await select<{
    id: string;
    troop_id: string;
    patrol_id: string | null;
    name: string;
  }>(db, 'SELECT id, troop_id, patrol_id, name FROM people ORDER BY id');
  const externalRows = await select<{
    subject: string;
    name: string;
    role: 'explorer' | 'leader';
    troop_ids: string[];
  }>(db, 'SELECT subject, name, role, troop_ids FROM external_users ORDER BY subject');
  const skillRows = await select<SkillRow>(
    db,
    'SELECT id, title, description, scope, prerequisites, public, revision, form_ids FROM skills ORDER BY id',
  );
  const formRows = await select<FormRow>(
    db,
    'SELECT id, skill_id, color, body FROM forms ORDER BY id',
  );
  const evidenceRows = await select<Record<string, unknown>>(
    db,
    `SELECT id, skill_id, form_id, target_id, target_type, status, answers,
            started_at, submitted_at, submitted_by, reviewed_at, reviewed_by, reason
     FROM evidence ORDER BY id`,
  );
  const uploadRows = await select<Record<string, unknown>>(
    db,
    `SELECT id, skill_id, target_id, target_type, name, type, size, created_by, created_at
     FROM uploads ORDER BY id`,
  );
  const achievementRows = await select<Achievement>(
    db,
    'SELECT id, title, threshold FROM achievements ORDER BY id',
  );

  const forms = new Map<string, SkillForm>(
    formRows.map((row) => {
      const body = row.body as { title: string; fields: SkillForm['fields'] };
      return [row.id, { id: row.id, skillId: row.skill_id, color: row.color, ...body }];
    }),
  );
  // A skill names its current forms in order; everything else in the table is history, still
  // readable through Evidence.formId but never offered again. See migrations/003.
  const current = new Set(skillRows.flatMap((row) => row.form_ids));

  return {
    troops,
    patrols: patrolRows.map((r) => ({ id: r.id, name: r.name, troopId: r.troop_id })),
    people: peopleRows.map((r) => ({
      id: r.id,
      name: r.name,
      troopId: r.troop_id,
      patrolId: r.patrol_id ?? undefined,
    })),
    externalUsers: externalRows.map((r) => ({
      subject: r.subject,
      name: r.name,
      role: r.role,
      troopIds: r.troop_ids,
    })),
    skills: skillRows.map((r) => ({
      id: r.id,
      title: r.title,
      description: r.description,
      scope: r.scope,
      prerequisites: r.prerequisites,
      public: r.public,
      revision: r.revision,
      forms: r.form_ids.map((id) => forms.get(id)).filter((f): f is SkillForm => f !== undefined),
    })),
    retiredForms: [...forms.values()].filter((f) => !current.has(f.id)),
    evidence: evidenceRows.map((r) => ({
      id: r.id as string,
      skillId: r.skill_id as string,
      formId: maybe(r.form_id),
      targetId: r.target_id as string,
      targetType: r.target_type as Evidence['targetType'],
      status: r.status as Evidence['status'],
      answers: (r.answers ?? undefined) as Evidence['answers'],
      startedAt: iso(r.started_at)!,
      submittedAt: iso(r.submitted_at),
      submittedBy: maybe(r.submitted_by),
      reviewedAt: iso(r.reviewed_at),
      reviewedBy: maybe(r.reviewed_by),
      reason: maybe(r.reason),
    })),
    uploads: uploadRows.map((r) => ({
      id: r.id as string,
      skillId: r.skill_id as string,
      targetId: r.target_id as string,
      targetType: r.target_type as Upload['targetType'],
      name: r.name as string,
      type: r.type as string,
      // bigint comes back as a string from node-postgres.
      size: Number(r.size),
      createdBy: r.created_by as string,
      createdAt: iso(r.created_at)!,
    })),
    achievements: achievementRows,
  };
}

// ---------- write back ----------

async function upsert(db: Db, table: string, key: string, row: Record<string, unknown>) {
  const columns = Object.keys(row);
  const assignments = columns.filter((c) => c !== key).map((c) => `${c}=EXCLUDED.${c}`);
  await db.query(
    `INSERT INTO ${table} (${columns.join(', ')})
     VALUES (${columns.map((_, i) => `$${i + 1}`).join(', ')})
     ON CONFLICT (${key}) DO UPDATE SET ${assignments.join(', ')}`,
    columns.map((c) => row[c]),
  );
}

async function sync<T>(
  db: Db,
  table: string,
  key: string,
  identify: (entity: T) => string,
  toRow: (entity: T) => Record<string, unknown>,
  before: T[],
  after: T[],
) {
  const stale = new Map(before.map((entity) => [identify(entity), entity]));
  for (const entity of after) {
    const id = identify(entity);
    const previous = stale.get(id);
    // Structural compare by serialisation. Sound here, and only here, because both sides come
    // from the same load(): `before` is a structuredClone of it, so key order matches by
    // construction. Do not reuse this trick on anything compared against a freshly built object —
    // jsonb does not preserve key order, and that mistake once made every save mint a new form.
    // An UPDATE skipped here is the difference between touching one row and touching thirty
    // thousand.
    if (previous === undefined || JSON.stringify(previous) !== JSON.stringify(entity))
      await upsert(db, table, key, toRow(entity));
    stale.delete(id);
  }
  for (const id of stale.keys()) await db.query(`DELETE FROM ${table} WHERE ${key}=$1`, [id]);
}

/** Current forms live inside their skill; retired ones alongside. The table holds the union. */
const allForms = (s: State): SkillForm[] => [
  ...s.skills.flatMap((k) => k.forms),
  ...s.retiredForms,
];

/**
 * Writes the difference between two States. Parents before children, because the foreign keys
 * added in migration 002 are not deferred.
 */
export async function save(db: Db, before: State, after: State) {
  await sync<Troop>(
    db,
    'troops',
    'id',
    (t) => t.id,
    (t) => ({ id: t.id, name: t.name, source: t.source }),
    before.troops,
    after.troops,
  );
  await sync<Patrol>(
    db,
    'patrols',
    'id',
    (p) => p.id,
    (p) => ({ id: p.id, troop_id: p.troopId, name: p.name }),
    before.patrols,
    after.patrols,
  );
  await sync<Person>(
    db,
    'people',
    'id',
    (p) => p.id,
    (p) => ({ id: p.id, troop_id: p.troopId, patrol_id: p.patrolId ?? null, name: p.name }),
    before.people,
    after.people,
  );
  await sync<ExternalUser>(
    db,
    'external_users',
    'subject',
    (u) => u.subject,
    (u) => ({ subject: u.subject, name: u.name, role: u.role, troop_ids: json(u.troopIds) }),
    before.externalUsers,
    after.externalUsers,
  );
  await sync<Skill>(
    db,
    'skills',
    'id',
    (k) => k.id,
    (k) => ({
      id: k.id,
      title: k.title,
      description: k.description,
      scope: k.scope,
      prerequisites: json(k.prerequisites),
      public: k.public,
      revision: k.revision,
      form_ids: json(k.forms.map((f) => f.id)),
    }),
    before.skills,
    after.skills,
  );
  await sync<SkillForm>(
    db,
    'forms',
    'id',
    (f) => f.id,
    (f) => ({
      id: f.id,
      skill_id: f.skillId,
      color: f.color,
      body: json({ title: f.title, fields: f.fields }),
    }),
    allForms(before),
    allForms(after),
  );
  await sync<Evidence>(
    db,
    'evidence',
    'id',
    (e) => e.id,
    (e) => ({
      id: e.id,
      skill_id: e.skillId,
      form_id: e.formId ?? null,
      target_id: e.targetId,
      target_type: e.targetType,
      status: e.status,
      answers: e.answers === undefined ? null : json(e.answers),
      started_at: e.startedAt,
      submitted_at: e.submittedAt ?? null,
      submitted_by: e.submittedBy ?? null,
      reviewed_at: e.reviewedAt ?? null,
      reviewed_by: e.reviewedBy ?? null,
      reason: e.reason ?? null,
    }),
    before.evidence,
    after.evidence,
  );
  await sync<Upload>(
    db,
    'uploads',
    'id',
    (u) => u.id,
    (u) => ({
      id: u.id,
      skill_id: u.skillId,
      target_id: u.targetId,
      target_type: u.targetType,
      name: u.name,
      type: u.type,
      size: u.size,
      created_by: u.createdBy,
      created_at: u.createdAt,
    }),
    before.uploads,
    after.uploads,
  );
  await sync<Achievement>(
    db,
    'achievements',
    'id',
    (x) => x.id,
    (x) => ({ id: x.id, title: x.title, threshold: x.threshold }),
    before.achievements,
    after.achievements,
  );
}
