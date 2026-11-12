CREATE TABLE IF NOT EXISTS watchlists (
  id TEXT PRIMARY KEY,
  revision TEXT NOT NULL,
  endpoint TEXT NOT NULL UNIQUE,
  subscription TEXT NOT NULL,
  watches TEXT NOT NULL,
  evaluation TEXT NOT NULL
);
