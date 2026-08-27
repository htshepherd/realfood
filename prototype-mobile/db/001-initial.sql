CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text NOT NULL UNIQUE,
  display_name text NOT NULL,
  password_hash text NOT NULL,
  password_version integer NOT NULL DEFAULT 1,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS accounts_username_lower_idx ON accounts(lower(username));

CREATE TABLE IF NOT EXISTS trusted_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  password_version integer NOT NULL,
  device_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS trusted_devices_account_idx ON trusted_devices(account_id);
CREATE INDEX IF NOT EXISTS trusted_devices_expiry_idx ON trusted_devices(expires_at);

CREATE TABLE IF NOT EXISTS favorites (
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  object_id text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted boolean NOT NULL DEFAULT false,
  PRIMARY KEY (account_id, object_id)
);
