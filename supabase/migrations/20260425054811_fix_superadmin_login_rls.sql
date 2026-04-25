/*
  # Fix SuperAdmin Login — RLS & Schema Query Error

  Problem: When the superadmin logs in, loadProfile() runs:
    SELECT *, school:schools(*) FROM profiles WHERE id = auth.uid()

  PostgREST resolves the schools FK join. The "Admins can read own school" policy
  uses a correlated subquery back into profiles, which can cause a schema resolution
  error (circular dependency during PostgREST's schema introspection/query planning).

  Fix:
  1. Drop the redundant "Admins can read own school" policy (already covered by
     "Authenticated users can read schools" which allows all authenticated reads).
  2. Ensure the get_my_role() and get_my_school_id() functions are SECURITY DEFINER
     with search_path set (prevents search_path injection and ensures they bypass RLS
     correctly when called from within RLS policies).
  3. Re-create the functions with explicit SET search_path = public for safety.
*/

-- Drop the problematic correlated-subquery schools policy
DROP POLICY IF EXISTS "Admins can read own school" ON public.schools;

-- Re-create get_my_role with explicit security settings
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

-- Re-create get_my_school_id with explicit security settings
CREATE OR REPLACE FUNCTION public.get_my_school_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT school_id FROM public.profiles WHERE id = auth.uid();
$$;
