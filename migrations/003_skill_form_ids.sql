-- `forms` holds every version ever: the ones a skill currently offers, plus the ones superseded by
-- an edit and still referenced by proofs submitted against them. Nothing in 002 said which is
-- which, and (skill_id, color) is not enough — after one edit there are two rows for that pair.
--
-- So the skill names its current forms, in order. Everything else in `forms` is history: still
-- readable through evidence.form_id, never offered to a patrol again.
ALTER TABLE skills ADD COLUMN IF NOT EXISTS form_ids jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Backfill: at this point every form row either came from the catalogue (id ends with the
-- revision that produced it) or is a snapshot carried by a proof (id starts with 'snap:').
-- The catalogue ones are the current set; blue before amber, which is the order the editor uses.
UPDATE skills k
SET form_ids = COALESCE(
  (SELECT jsonb_agg(f.id ORDER BY f.color DESC)
   FROM forms f
   WHERE f.skill_id = k.id AND f.id NOT LIKE 'snap:%'),
  '[]'::jsonb
);
