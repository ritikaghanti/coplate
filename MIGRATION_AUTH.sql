-- Run in the Neon SQL Editor BEFORE starting the updated API.
-- Adds password storage and makes email a unique login identifier.

ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash text;

-- Make email unique (needed for login lookups). If you have duplicate or null
-- emails from earlier testing this could error — in that case clear them first.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_email_unique'
  ) THEN
    ALTER TABLE users ADD CONSTRAINT users_email_unique UNIQUE (email);
  END IF;
END $$;
