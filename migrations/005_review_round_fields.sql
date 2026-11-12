-- Every column the November review round needs, in one migration rather than five in a row.
--
--   evidence.comment       free text from the patrol to whoever reviews (PLAN E)
--   evidence.published_*   the second, explicit privacy pass before other patrols can read (PLAN H)
--   people.self_assigned   an explorer joined a patrol alone; a leader still has to confirm (PLAN G)
--   skills.document        {id,name,size} of the skill's explanatory PDF, bytes in `files` (PLAN F)
--
-- No data to move: every new column is either nullable or has a default that describes the
-- existing rows truthfully (nobody has self-assigned yet; nothing has been published yet).
ALTER TABLE evidence ADD COLUMN IF NOT EXISTS comment       text;
ALTER TABLE evidence ADD COLUMN IF NOT EXISTS published_at  timestamptz;
ALTER TABLE evidence ADD COLUMN IF NOT EXISTS published_by  text;
ALTER TABLE people   ADD COLUMN IF NOT EXISTS self_assigned boolean NOT NULL DEFAULT false;
ALTER TABLE skills   ADD COLUMN IF NOT EXISTS document      jsonb;
