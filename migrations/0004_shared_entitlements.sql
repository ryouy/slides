-- Shared account additions.  Existing Google/Stripe rows are deliberately left in
-- place: `apple_account_links` is only created by an explicit, authenticated link.
CREATE TABLE IF NOT EXISTS apple_account_links (
  apple_account_id TEXT PRIMARY KEY REFERENCES apple_accounts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  linked_at INTEGER NOT NULL
);

-- An original App Store subscription can belong to exactly one ART SLIDE account.
-- It is never inferred from a display name or an e-mail address.
CREATE TABLE IF NOT EXISTS apple_entitlements (
  original_transaction_id TEXT PRIMARY KEY,
  apple_account_id TEXT NOT NULL REFERENCES apple_accounts(id) ON DELETE CASCADE,
  expires_ms INTEGER NOT NULL,
  revoked INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS apple_entitlements_account ON apple_entitlements(apple_account_id);
