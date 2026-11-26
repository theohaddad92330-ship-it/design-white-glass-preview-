-- Grant auth schema ownership to supabase_auth_admin
-- Required for GoTrue to run its migrations
ALTER SCHEMA auth OWNER TO supabase_auth_admin;

-- Transfer ownership of ALL auth functions
DO $$
DECLARE
  func record;
BEGIN
  FOR func IN
    SELECT p.proname, pg_get_function_identity_arguments(p.oid) as args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'auth'
  LOOP
    EXECUTE format('ALTER FUNCTION auth.%I(%s) OWNER TO supabase_auth_admin', func.proname, func.args);
  END LOOP;
END $$;

-- Transfer ownership of ALL auth tables
DO $$
DECLARE
  tbl text;
BEGIN
  FOR tbl IN SELECT tablename FROM pg_tables WHERE schemaname = 'auth'
  LOOP
    EXECUTE format('ALTER TABLE auth.%I OWNER TO supabase_auth_admin', tbl);
  END LOOP;
END $$;

-- Transfer ownership of ALL auth sequences
DO $$
DECLARE
  seq text;
BEGIN
  FOR seq IN SELECT sequencename FROM pg_sequences WHERE schemaname = 'auth'
  LOOP
    EXECUTE format('ALTER SEQUENCE auth.%I OWNER TO supabase_auth_admin', seq);
  END LOOP;
END $$;
