-- Optional account + records sync for the iOS app (Sign in with Apple, bearer tokens, no cookies).
-- Idempotent: the Worker also runs these statements once per instance, so a missing migration never breaks the endpoints.
-- Only the SHA-256 hash of a session token is stored.

CREATE TABLE IF NOT EXISTS apple_accounts (
  id         TEXT PRIMARY KEY,
  apple_sub  TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS apple_sessions (
  token_hash TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS apple_sync (
  account_id TEXT PRIMARY KEY,
  version    INTEGER NOT NULL,
  doc        TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Sign in with Apple refresh token, AES-GCM encrypted (key from the APPLE_TOKEN_KEY secret); used only to revoke on account deletion.
CREATE TABLE IF NOT EXISTS apple_tokens (
  account_id TEXT PRIMARY KEY,
  enc        TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
