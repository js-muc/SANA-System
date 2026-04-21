/*
  # Multi-School Architecture & Super Admin Approval Workflow

  ## Summary
  Transforms SANA OS from a single-school system to a multi-school SaaS platform.
  Introduces a super_admin role (system owner), a schools table, and an approval
  workflow so no one can claim the admin role without super_admin approval.

  ## New Tables

  1. **schools** — Each school that uses the system
     - id, name, slug (unique URL-friendly key), country, created_at

  ## Modified Tables

  2. **profiles** — Two new columns:
     - approval_status: 'pending' | 'approved' | 'rejected' (default 'approved' for existing rows)
     - school_id: nullable FK to schools

  3. **classes / students / scores** — school_id added for scoping

  ## Security Model
  - super_admin: sees everything across all schools, approves admins
  - admin (approved): manages their school only
  - admin (pending/rejected): locked out with a waiting screen
  - teacher: scoped to their assigned class only

  ## Notes
  - The schools RLS policy referencing school_id in profiles is added AFTER
    the school_id column is created to avoid column-not-found errors.
  - super_admin accounts are created directly by seeding the profiles table.
*/

-- ============================================================
-- 1. SCHOOLS TABLE (no FK to profiles yet)
-- ============================================================
CREATE TABLE IF NOT EXISTS schools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  country text NOT NULL DEFAULT 'Kenya',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE schools ENABLE ROW LEVEL SECURITY;

-- Super admin policies (no school_id reference needed here)
CREATE POLICY "Super admin can insert schools"
  ON schools FOR INSERT
  TO authenticated
  WITH CHECK (public.get_my_role() = 'super_admin');

CREATE POLICY "Super admin can update schools"
  ON schools FOR UPDATE
  TO authenticated
  USING (public.get_my_role() = 'super_admin')
  WITH CHECK (public.get_my_role() = 'super_admin');

CREATE POLICY "Super admin can delete schools"
  ON schools FOR DELETE
  TO authenticated
  USING (public.get_my_role() = 'super_admin');

-- ============================================================
-- 2. ALTER PROFILES — add approval_status
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'approval_status'
  ) THEN
    ALTER TABLE profiles ADD COLUMN approval_status text NOT NULL DEFAULT 'approved';
  END IF;
END $$;

-- Existing admins are grandfathered in as approved
UPDATE profiles SET approval_status = 'approved' WHERE role IN ('admin', 'teacher');

-- ============================================================
-- 3. ALTER PROFILES — add school_id (after schools table exists)
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'school_id'
  ) THEN
    ALTER TABLE profiles ADD COLUMN school_id uuid REFERENCES schools(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ============================================================
-- 4. SCHOOLS RLS — policies that reference profiles.school_id
--    (added now that the column exists)
-- ============================================================
CREATE POLICY "Super admin can read all schools"
  ON schools FOR SELECT
  TO authenticated
  USING (public.get_my_role() = 'super_admin');

CREATE POLICY "Admins can read own school"
  ON schools FOR SELECT
  TO authenticated
  USING (
    id = (SELECT school_id FROM profiles WHERE id = auth.uid())
  );

-- ============================================================
-- 5. ALTER CLASSES — add school_id
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'classes' AND column_name = 'school_id'
  ) THEN
    ALTER TABLE classes ADD COLUMN school_id uuid REFERENCES schools(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ============================================================
-- 6. ALTER STUDENTS — add school_id
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'students' AND column_name = 'school_id'
  ) THEN
    ALTER TABLE students ADD COLUMN school_id uuid REFERENCES schools(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ============================================================
-- 7. ALTER SCORES — add school_id
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'scores' AND column_name = 'school_id'
  ) THEN
    ALTER TABLE scores ADD COLUMN school_id uuid REFERENCES schools(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ============================================================
-- 8. HELPER FUNCTIONS
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_my_approval_status()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT approval_status FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.get_my_school_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT school_id FROM public.profiles WHERE id = auth.uid();
$$;

-- ============================================================
-- 9. PROFILES RLS — super_admin full access
-- ============================================================
CREATE POLICY "Super admin can read all profiles"
  ON profiles FOR SELECT
  TO authenticated
  USING (public.get_my_role() = 'super_admin');

CREATE POLICY "Super admin can update profiles"
  ON profiles FOR UPDATE
  TO authenticated
  USING (public.get_my_role() = 'super_admin')
  WITH CHECK (public.get_my_role() = 'super_admin');

-- ============================================================
-- 10. CLASSES RLS — super_admin full access
-- ============================================================
CREATE POLICY "Super admin can read all classes"
  ON classes FOR SELECT
  TO authenticated
  USING (public.get_my_role() = 'super_admin');

-- ============================================================
-- 11. STUDENTS RLS — super_admin full access
-- ============================================================
CREATE POLICY "Super admin can read all students"
  ON students FOR SELECT
  TO authenticated
  USING (public.get_my_role() = 'super_admin');

-- ============================================================
-- 12. SCORES RLS — super_admin full access
-- ============================================================
CREATE POLICY "Super admin can read all scores"
  ON scores FOR SELECT
  TO authenticated
  USING (public.get_my_role() = 'super_admin');
