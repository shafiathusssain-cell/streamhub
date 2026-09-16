/*
# Revoke client access to app_config

1. Security
- Revoke all privileges on app_config from anon and authenticated roles.
- RLS already blocks client access (no policies exist), but this adds
  defense-in-depth so the table stays protected even if RLS is accidentally
  disabled in the future.
- Only the service role (used by edge functions) can read/write this table.
*/

REVOKE ALL ON app_config FROM anon;
REVOKE ALL ON app_config FROM authenticated;
