-- Run this in the Neon SQL Editor BEFORE starting the updated API.
-- Adds the reservations table and the is_event_meal column on meals.

ALTER TABLE meals
  ADD COLUMN IF NOT EXISTS is_event_meal boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  reserved_date date NOT NULL,
  venue_label text NOT NULL,
  event_time text NOT NULL,
  reserve jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
