-- Normalises the single jsonb document into tables, and moves the data in the same transaction.
--
-- After this migration the tables are populated but NOT yet used: the application still reads
-- bravely_state. The cutover is a code change, and leaving the document in place until then means
-- this migration has a free backup of everything it just copied.
--
-- Two design points worth knowing before changing anything here:
--
-- 1. `forms` is immutable by id. Editing a form's questions inserts a new row; nothing ever
--    UPDATEs `body`. That is what lets a proof keep the questions it actually answered, and it is
--    why Evidence.formSnapshot (a copy of the form inside every proof) goes away.
-- 2. `patrol_id` lives on the person, not as a list of people on the patrol, so "one explorer
--    belongs to one patrol" stays impossible to express wrongly rather than becoming a rule
--    somebody has to enforce.

-- ---------- roster ----------

CREATE TABLE IF NOT EXISTS troops (
  id     text PRIMARY KEY,
  name   text NOT NULL,
  source text NOT NULL CHECK (source IN ('cngei', 'external'))
);

CREATE TABLE IF NOT EXISTS patrols (
  id       text PRIMARY KEY,
  troop_id text NOT NULL REFERENCES troops (id),
  name     text NOT NULL
);

CREATE TABLE IF NOT EXISTS people (
  id        text PRIMARY KEY,
  troop_id  text NOT NULL REFERENCES troops (id),
  patrol_id text REFERENCES patrols (id),
  name      text NOT NULL
);

CREATE TABLE IF NOT EXISTS external_users (
  subject   text PRIMARY KEY,
  name      text NOT NULL,
  role      text NOT NULL CHECK (role IN ('explorer', 'leader')),
  troop_ids jsonb NOT NULL
);

-- ---------- catalogue ----------

-- prerequisites stays jsonb: the DAG is revalidated whole on every save, and Postgres could not
-- enforce acyclicity anyway. Normalise it only if something needs to query it in SQL.
CREATE TABLE IF NOT EXISTS skills (
  id            text PRIMARY KEY,
  title         text NOT NULL,
  description   text NOT NULL,
  scope         text NOT NULL CHECK (scope IN ('troop', 'patrol')),
  prerequisites jsonb NOT NULL,
  public        boolean NOT NULL,
  revision      integer NOT NULL
);

-- body is {title, fields:[...]}: a blob, because nothing queries inside a form.
CREATE TABLE IF NOT EXISTS forms (
  id       text PRIMARY KEY,
  skill_id text NOT NULL REFERENCES skills (id),
  color    text NOT NULL CHECK (color IN ('blue', 'amber')),
  body     jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS achievements (
  id        text PRIMARY KEY,
  title     text NOT NULL,
  threshold integer NOT NULL
);

-- ---------- proofs ----------

-- UNIQUE (skill_id, target_id) is the domain invariant "one proof per skill and target", which
-- until now only the reducer enforced while holding a row lock. Postgres enforcing it is what
-- lets commands that touch only proofs stop taking a global lock.
--
-- form_id is nullable because a 'started' proof has no form chosen yet.
-- color and skill_revision are gone: both are derivable from form_id.
CREATE TABLE IF NOT EXISTS evidence (
  id           text PRIMARY KEY,
  skill_id     text NOT NULL REFERENCES skills (id),
  form_id      text REFERENCES forms (id),
  target_id    text NOT NULL,
  target_type  text NOT NULL CHECK (target_type IN ('troop', 'patrol')),
  status       text NOT NULL CHECK (status IN ('started', 'pending', 'approved', 'rejected')),
  answers      jsonb,
  started_at   timestamptz NOT NULL,
  submitted_at timestamptz,
  submitted_by text,
  reviewed_at  timestamptz,
  reviewed_by  text,
  reason       text,
  UNIQUE (skill_id, target_id)
);

-- id REFERENCES files(id): metadata can no longer exist without its bytes. The upload endpoint
-- already writes both in one transaction, so this makes an existing guarantee enforceable.
CREATE TABLE IF NOT EXISTS uploads (
  id          uuid PRIMARY KEY REFERENCES files (id),
  skill_id    text NOT NULL REFERENCES skills (id),
  target_id   text NOT NULL,
  target_type text NOT NULL CHECK (target_type IN ('troop', 'patrol')),
  name        text NOT NULL,
  type        text NOT NULL,
  size        bigint NOT NULL,
  created_by  text NOT NULL,
  created_at  timestamptz NOT NULL
);

-- ---------- indexes ----------

-- No index on evidence(form_id): no query asks "every proof using this form version", and an
-- index nobody reads costs write throughput. Add it when something needs it.
CREATE INDEX IF NOT EXISTS evidence_target_idx ON evidence (target_id);
CREATE INDEX IF NOT EXISTS uploads_target_idx ON uploads (skill_id, target_id);
CREATE INDEX IF NOT EXISTS patrols_troop_idx ON patrols (troop_id);
CREATE INDEX IF NOT EXISTS people_patrol_idx ON people (patrol_id);
CREATE INDEX IF NOT EXISTS people_troop_idx ON people (troop_id);

-- ---------- backfill ----------

-- Order matters: foreign keys mean parents before children. ON CONFLICT DO NOTHING keeps this
-- harmless if it ever runs against partially populated tables.

INSERT INTO troops (id, name, source)
SELECT e ->> 'id', e ->> 'name', e ->> 'source'
FROM bravely_state s, jsonb_array_elements(s.value -> 'troops') e
WHERE s.id = 1
ON CONFLICT (id) DO NOTHING;

INSERT INTO patrols (id, troop_id, name)
SELECT e ->> 'id', e ->> 'troopId', e ->> 'name'
FROM bravely_state s, jsonb_array_elements(s.value -> 'patrols') e
WHERE s.id = 1
ON CONFLICT (id) DO NOTHING;

INSERT INTO people (id, troop_id, patrol_id, name)
SELECT e ->> 'id', e ->> 'troopId', e ->> 'patrolId', e ->> 'name'
FROM bravely_state s, jsonb_array_elements(s.value -> 'people') e
WHERE s.id = 1
ON CONFLICT (id) DO NOTHING;

INSERT INTO external_users (subject, name, role, troop_ids)
SELECT e ->> 'subject', e ->> 'name', e ->> 'role', e -> 'troopIds'
FROM bravely_state s, jsonb_array_elements(s.value -> 'externalUsers') e
WHERE s.id = 1
ON CONFLICT (subject) DO NOTHING;

INSERT INTO skills (id, title, description, scope, prerequisites, public, revision)
SELECT e ->> 'id',
       e ->> 'title',
       e ->> 'description',
       e ->> 'scope',
       e -> 'prerequisites',
       (e ->> 'public')::boolean,
       (e ->> 'revision')::integer
FROM bravely_state s, jsonb_array_elements(s.value -> 'skills') e
WHERE s.id = 1
ON CONFLICT (id) DO NOTHING;

-- The catalogue's current forms. The id encodes the revision that produced them, so the next edit
-- naturally lands on a new row instead of overwriting this one.
INSERT INTO forms (id, skill_id, color, body)
SELECT (k ->> 'id') || ':' || (f ->> 'color') || ':r' || (k ->> 'revision'),
       k ->> 'id',
       f ->> 'color',
       jsonb_build_object('title', f -> 'title', 'fields', f -> 'fields')
FROM bravely_state s,
     jsonb_array_elements(s.value -> 'skills') k,
     jsonb_array_elements(k -> 'forms') f
WHERE s.id = 1
ON CONFLICT (id) DO NOTHING;

-- One form row per snapshot carried by an existing proof. A snapshot may differ from every
-- current form — that is the entire reason snapshots exist — so it cannot be matched to one and
-- gets a row of its own. Duplicating a body that happens to be identical to a catalogue form is
-- the cheap, correct choice here.
INSERT INTO forms (id, skill_id, color, body)
SELECT 'snap:' || (e ->> 'id'),
       e ->> 'skillId',
       e -> 'formSnapshot' ->> 'color',
       jsonb_build_object('title', e -> 'formSnapshot' -> 'title', 'fields', e -> 'formSnapshot' -> 'fields')
FROM bravely_state s, jsonb_array_elements(s.value -> 'evidence') e
WHERE s.id = 1 AND e ? 'formSnapshot'
ON CONFLICT (id) DO NOTHING;

INSERT INTO evidence (id, skill_id, form_id, target_id, target_type, status, answers,
                      started_at, submitted_at, submitted_by, reviewed_at, reviewed_by, reason)
SELECT e ->> 'id',
       e ->> 'skillId',
       CASE WHEN e ? 'formSnapshot' THEN 'snap:' || (e ->> 'id') END,
       e ->> 'targetId',
       e ->> 'targetType',
       e ->> 'status',
       e -> 'answers',
       (e ->> 'startedAt')::timestamptz,
       (e ->> 'submittedAt')::timestamptz,
       e ->> 'submittedBy',
       (e ->> 'reviewedAt')::timestamptz,
       e ->> 'reviewedBy',
       e ->> 'reason'
FROM bravely_state s, jsonb_array_elements(s.value -> 'evidence') e
WHERE s.id = 1
ON CONFLICT (id) DO NOTHING;

INSERT INTO uploads (id, skill_id, target_id, target_type, name, type, size, created_by, created_at)
SELECT (e ->> 'id')::uuid,
       e ->> 'skillId',
       e ->> 'targetId',
       e ->> 'targetType',
       e ->> 'name',
       e ->> 'type',
       (e ->> 'size')::bigint,
       e ->> 'createdBy',
       (e ->> 'createdAt')::timestamptz
FROM bravely_state s, jsonb_array_elements(s.value -> 'uploads') e
WHERE s.id = 1
ON CONFLICT (id) DO NOTHING;

INSERT INTO achievements (id, title, threshold)
SELECT e ->> 'id', e ->> 'title', (e ->> 'threshold')::integer
FROM bravely_state s, jsonb_array_elements(s.value -> 'achievements') e
WHERE s.id = 1
ON CONFLICT (id) DO NOTHING;
