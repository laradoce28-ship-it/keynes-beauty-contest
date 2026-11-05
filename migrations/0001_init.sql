-- Esquema inicial del Concurso de belleza de Keynes (Cloudflare D1 / SQLite)

CREATE TABLE sessions (
  id         TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE participants (
  id         TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  token      TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (session_id, token)
);
-- Nombres únicos por sesión, sin distinguir mayúsculas
CREATE UNIQUE INDEX participants_session_name ON participants (session_id, name COLLATE NOCASE);

CREATE TABLE rounds (
  id         TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  number     INTEGER NOT NULL,
  status     TEXT NOT NULL CHECK (status IN ('open', 'closed')),
  average    REAL,
  target     REAL,
  opened_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  closed_at  TEXT,
  UNIQUE (session_id, number)
);

CREATE TABLE guesses (
  id             TEXT PRIMARY KEY,
  round_id       TEXT NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  participant_id TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  value          REAL NOT NULL CHECK (value >= 0 AND value <= 100),
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (round_id, participant_id)
);
CREATE INDEX guesses_round ON guesses (round_id);
