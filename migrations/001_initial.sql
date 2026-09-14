CREATE TABLE IF NOT EXISTS bravely_state (
  id integer PRIMARY KEY CHECK (id = 1),
  value jsonb NOT NULL,
  version bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS auth_flows (
  id text PRIMARY KEY, payload jsonb NOT NULL, expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  id text PRIMARY KEY, payload text NOT NULL, expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS files (
  id uuid PRIMARY KEY, data bytea NOT NULL CHECK (octet_length(data) <= 26214400)
);
