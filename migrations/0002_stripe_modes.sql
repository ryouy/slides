-- Stripe TEST and LIVE objects are different worlds: a customer or subscription id of one mode does not exist in the other.
-- These tables keep them apart (livemode 1 = live key, 0 = test key), so the same account can have a customer in each.
-- The older users.stripe_customer_id and subscriptions table are NOT changed or deleted: their rows are checked against Stripe
-- the first time they are needed and copied here under the mode they really belong to.
-- (Idempotent: the Worker also runs these statements once per instance, so a missing migration never breaks billing.)

CREATE TABLE IF NOT EXISTS stripe_customers (
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  livemode    INTEGER NOT NULL CHECK (livemode IN (0, 1)),
  customer_id TEXT NOT NULL UNIQUE,
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (user_id, livemode)
);

CREATE TABLE IF NOT EXISTS stripe_subscriptions (
  user_id                TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  livemode               INTEGER NOT NULL CHECK (livemode IN (0, 1)),
  stripe_subscription_id TEXT NOT NULL UNIQUE,
  status                 TEXT NOT NULL,
  current_period_end     INTEGER,
  cancel_at_period_end   INTEGER NOT NULL DEFAULT 0,
  updated_at             INTEGER NOT NULL,
  PRIMARY KEY (user_id, livemode)
);
