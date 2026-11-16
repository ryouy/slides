-- ART SLIDE Premium: only what is needed to know who is signed in and whether they have paid.
-- Play records are NOT stored here (they live on the device and in the user's own Google Drive).

CREATE TABLE IF NOT EXISTS users (
  id                 TEXT PRIMARY KEY,              -- random id used inside this app
  google_sub         TEXT NOT NULL UNIQUE,          -- Google's stable account id (OIDC "sub")
  name               TEXT,                          -- display name, shown on the Account screen only
  stripe_customer_id TEXT UNIQUE,
  created_at         INTEGER NOT NULL,              -- unix seconds
  updated_at         INTEGER NOT NULL
);

-- One contract per account. `status` is Stripe's own subscription status.
CREATE TABLE IF NOT EXISTS subscriptions (
  user_id                TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  stripe_subscription_id TEXT NOT NULL UNIQUE,
  status                 TEXT NOT NULL,
  current_period_end     INTEGER,                   -- unix seconds
  cancel_at_period_end   INTEGER NOT NULL DEFAULT 0,
  updated_at             INTEGER NOT NULL
);

-- Webhook deliveries already handled (Stripe may deliver an event more than once).
CREATE TABLE IF NOT EXISTS stripe_events (
  event_id     TEXT PRIMARY KEY,
  type         TEXT NOT NULL,
  processed_at INTEGER NOT NULL
);

-- Login sessions. Only a SHA-256 hash of the cookie value is stored.
CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);

-- Fixed-window counters for the billing endpoints.
CREATE TABLE IF NOT EXISTS rate_limits (
  key          TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  count        INTEGER NOT NULL
);
