ALTER TABLE accounts ADD COLUMN IF NOT EXISTS failed_login_count integer NOT NULL DEFAULT 0;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS login_locked_until timestamptz;

CREATE INDEX IF NOT EXISTS accounts_login_locked_idx
  ON accounts(login_locked_until)
  WHERE login_locked_until IS NOT NULL;
