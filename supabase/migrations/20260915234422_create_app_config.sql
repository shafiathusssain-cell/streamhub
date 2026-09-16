/*
# Create app_config table for storing third-party API keys

1. New Tables
- `app_config`
  - `key` (text, primary key) — config key name (e.g. YOUTUBE_API_KEY)
  - `value` (text, not null) — the secret value
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)
2. Security
- Enable RLS on `app_config`.
- Deny all access to anon and authenticated roles — only the service role
  (used by edge functions) can read/write this table. No policies are created,
  so RLS blocks all client access by default.
3. Notes
- The edge function reads the YouTube API key from this table using the
  service role key, which is automatically available in the Deno runtime.
- Client browsers can never read this table because no anon/authenticated
  policies exist.
*/

CREATE TABLE IF NOT EXISTS app_config (
  key text PRIMARY KEY,
  value text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE app_config ENABLE ROW LEVEL SECURITY;
