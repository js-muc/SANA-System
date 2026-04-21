/*
  # Fix Infinite RLS Recursion on profiles Table

  ## Problem
  Every admin RLS policy used the pattern:
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'

  When this subquery runs inside a policy on the `profiles` table itself,
  it re-triggers the same policy check → infinite recursion.
  The same recursion cascades to other tables (students, scores, etc.)
  because their admin policies also read from `profiles`, which then
  evaluates the profiles policy in a loop.

  ## Solution
  Create a SECURITY DEFINER function `public.get_my_role()` that reads
  the current user's role from `profiles` while BYPASSING row-level security.
  Since the function runs with definer privileges, it avoids the recursive
  policy evaluation entirely.

  All admin policies are then dropped and recreated using this function.

  ## Changes
  1. New function: `public.get_my_role()` — SECURITY DEFINER, reads own role
  2. Dropped + recreated: all admin-gated policies on
     profiles, students, scores, levels, classes, level_subjects, subjects
*/

-- ============================================================
-- 1. SECURITY DEFINER HELPER FUNCTION
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

-- ============================================================
-- 2. FIX profiles TABLE — drop recursive policy, recreate
-- ============================================================
DROP POLICY IF EXISTS "Admins can read all profiles" ON profiles;

CREATE POLICY "Admins can read all profiles"
  ON profiles FOR SELECT
  TO authenticated
  USING (public.get_my_role() = 'admin');

-- ============================================================
-- 3. FIX students TABLE
-- ============================================================
DROP POLICY IF EXISTS "Admins can read all students" ON students;

CREATE POLICY "Admins can read all students"
  ON students FOR SELECT
  TO authenticated
  USING (public.get_my_role() = 'admin');

-- ============================================================
-- 4. FIX scores TABLE
-- ============================================================
DROP POLICY IF EXISTS "Admins can read all scores" ON scores;

CREATE POLICY "Admins can read all scores"
  ON scores FOR SELECT
  TO authenticated
  USING (public.get_my_role() = 'admin');

-- ============================================================
-- 5. FIX levels TABLE
-- ============================================================
DROP POLICY IF EXISTS "Admins can insert levels" ON levels;
DROP POLICY IF EXISTS "Admins can update levels" ON levels;
DROP POLICY IF EXISTS "Admins can delete levels" ON levels;

CREATE POLICY "Admins can insert levels"
  ON levels FOR INSERT
  TO authenticated
  WITH CHECK (public.get_my_role() = 'admin');

CREATE POLICY "Admins can update levels"
  ON levels FOR UPDATE
  TO authenticated
  USING (public.get_my_role() = 'admin')
  WITH CHECK (public.get_my_role() = 'admin');

CREATE POLICY "Admins can delete levels"
  ON levels FOR DELETE
  TO authenticated
  USING (public.get_my_role() = 'admin');

-- ============================================================
-- 6. FIX classes TABLE
-- ============================================================
DROP POLICY IF EXISTS "Admins can insert classes" ON classes;
DROP POLICY IF EXISTS "Admins can update classes" ON classes;
DROP POLICY IF EXISTS "Admins can delete classes" ON classes;

CREATE POLICY "Admins can insert classes"
  ON classes FOR INSERT
  TO authenticated
  WITH CHECK (public.get_my_role() = 'admin');

CREATE POLICY "Admins can update classes"
  ON classes FOR UPDATE
  TO authenticated
  USING (public.get_my_role() = 'admin')
  WITH CHECK (public.get_my_role() = 'admin');

CREATE POLICY "Admins can delete classes"
  ON classes FOR DELETE
  TO authenticated
  USING (public.get_my_role() = 'admin');

-- ============================================================
-- 7. FIX level_subjects TABLE
-- ============================================================
DROP POLICY IF EXISTS "Admins can insert level_subjects" ON level_subjects;
DROP POLICY IF EXISTS "Admins can delete level_subjects" ON level_subjects;

CREATE POLICY "Admins can insert level_subjects"
  ON level_subjects FOR INSERT
  TO authenticated
  WITH CHECK (public.get_my_role() = 'admin');

CREATE POLICY "Admins can delete level_subjects"
  ON level_subjects FOR DELETE
  TO authenticated
  USING (public.get_my_role() = 'admin');

-- ============================================================
-- 8. FIX subjects TABLE
-- ============================================================
DROP POLICY IF EXISTS "Admins can insert subjects" ON subjects;
DROP POLICY IF EXISTS "Admins can update subjects" ON subjects;
DROP POLICY IF EXISTS "Admins can delete subjects" ON subjects;

CREATE POLICY "Admins can insert subjects"
  ON subjects FOR INSERT
  TO authenticated
  WITH CHECK (public.get_my_role() = 'admin');

CREATE POLICY "Admins can update subjects"
  ON subjects FOR UPDATE
  TO authenticated
  USING (public.get_my_role() = 'admin')
  WITH CHECK (public.get_my_role() = 'admin');

CREATE POLICY "Admins can delete subjects"
  ON subjects FOR DELETE
  TO authenticated
  USING (public.get_my_role() = 'admin');
