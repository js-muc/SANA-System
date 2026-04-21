/*
  # Fix School Data Isolation

  ## Summary
  Closes all cross-school data leakage gaps. Every table that holds school-specific
  data is now fully scoped so that an admin from School A can never read or write
  data that belongs to School B.

  ## Changes

  ### 1. Add school_id to levels, subjects, level_subjects
  - `levels` gains `school_id uuid NOT NULL REFERENCES schools(id)`
  - `subjects` gains `school_id uuid NOT NULL REFERENCES schools(id)`
  - `level_subjects` school scoping is inherited via level/subject FK cascade
  - Existing rows are assigned to the first school found (safe for single-school installs)

  ### 2. Add school_id to classes (if column absent)
  - Already present per earlier migration; ensure it exists

  ### 3. Add school_id to students (if column absent)
  - Already present per earlier migration; ensure it exists

  ### 4. Replace all admin RLS policies with school-scoped versions
  - profiles: admins see only their school's teachers/admins
  - classes: admins manage only their school's classes
  - students: admins manage only their school's students
  - scores: admins manage only their school's scores
  - levels: admins manage only their school's levels
  - subjects: admins manage only their school's subjects
  - level_subjects: scoped through level's school_id

  ## Security
  - super_admin continues to have unrestricted access
  - teachers continue to be scoped by teacher_id
  - no USING (true) policies remain on sensitive tables
*/

-- ─────────────────────────────────────────────────────────────
-- 1. Add school_id to levels (safe if already exists)
-- ─────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'levels' AND column_name = 'school_id'
  ) THEN
    ALTER TABLE levels ADD COLUMN school_id uuid REFERENCES schools(id) ON DELETE CASCADE;

    -- Assign existing rows to first school
    UPDATE levels SET school_id = (SELECT id FROM schools ORDER BY created_at LIMIT 1)
    WHERE school_id IS NULL;

    ALTER TABLE levels ALTER COLUMN school_id SET NOT NULL;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────
-- 2. Add school_id to subjects (safe if already exists)
-- ─────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'subjects' AND column_name = 'school_id'
  ) THEN
    ALTER TABLE subjects ADD COLUMN school_id uuid REFERENCES schools(id) ON DELETE CASCADE;

    UPDATE subjects SET school_id = (SELECT id FROM schools ORDER BY created_at LIMIT 1)
    WHERE school_id IS NULL;

    ALTER TABLE subjects ALTER COLUMN school_id SET NOT NULL;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────
-- 3. Ensure classes.school_id exists
-- ─────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'classes' AND column_name = 'school_id'
  ) THEN
    ALTER TABLE classes ADD COLUMN school_id uuid REFERENCES schools(id) ON DELETE CASCADE;

    UPDATE classes SET school_id = (SELECT id FROM schools ORDER BY created_at LIMIT 1)
    WHERE school_id IS NULL;

    ALTER TABLE classes ALTER COLUMN school_id SET NOT NULL;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────
-- 4. Ensure students.school_id exists
-- ─────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'students' AND column_name = 'school_id'
  ) THEN
    ALTER TABLE students ADD COLUMN school_id uuid REFERENCES schools(id) ON DELETE CASCADE;

    UPDATE students SET school_id = (SELECT id FROM schools ORDER BY created_at LIMIT 1)
    WHERE school_id IS NULL;

    ALTER TABLE students ALTER COLUMN school_id SET NOT NULL;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────
-- 5. Ensure scores.school_id exists
-- ─────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'scores' AND column_name = 'school_id'
  ) THEN
    ALTER TABLE scores ADD COLUMN school_id uuid REFERENCES schools(id) ON DELETE CASCADE;

    UPDATE scores SET school_id = (SELECT id FROM schools ORDER BY created_at LIMIT 1)
    WHERE school_id IS NULL;

    ALTER TABLE scores ALTER COLUMN school_id SET NOT NULL;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────
-- Helper: get current user's school_id (security definer, avoids RLS recursion)
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_my_school_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT school_id FROM public.profiles WHERE id = auth.uid();
$$;

-- ─────────────────────────────────────────────────────────────
-- 6. RE-SCOPE: profiles — admins see only their school's users
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can read all profiles" ON profiles;
DROP POLICY IF EXISTS "Admin can read all profiles in school" ON profiles;

CREATE POLICY "Admin can read all profiles in school"
  ON profiles FOR SELECT
  TO authenticated
  USING (
    public.get_my_role() = 'admin'
    AND school_id = public.get_my_school_id()
  );

-- ─────────────────────────────────────────────────────────────
-- 7. RE-SCOPE: classes
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated users can read classes" ON classes;
DROP POLICY IF EXISTS "Admins can insert classes" ON classes;
DROP POLICY IF EXISTS "Admins can update classes" ON classes;
DROP POLICY IF EXISTS "Admins can delete classes" ON classes;
DROP POLICY IF EXISTS "Teachers can read classes" ON classes;

CREATE POLICY "Authenticated users can read own school classes"
  ON classes FOR SELECT
  TO authenticated
  USING (school_id = public.get_my_school_id());

CREATE POLICY "Admins can insert own school classes"
  ON classes FOR INSERT
  TO authenticated
  WITH CHECK (
    public.get_my_role() = 'admin'
    AND school_id = public.get_my_school_id()
  );

CREATE POLICY "Admins can update own school classes"
  ON classes FOR UPDATE
  TO authenticated
  USING (public.get_my_role() = 'admin' AND school_id = public.get_my_school_id())
  WITH CHECK (public.get_my_role() = 'admin' AND school_id = public.get_my_school_id());

CREATE POLICY "Admins can delete own school classes"
  ON classes FOR DELETE
  TO authenticated
  USING (public.get_my_role() = 'admin' AND school_id = public.get_my_school_id());

-- ─────────────────────────────────────────────────────────────
-- 8. RE-SCOPE: students
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can read all students" ON students;
DROP POLICY IF EXISTS "Admin can read own school students" ON students;

CREATE POLICY "Admin can read own school students"
  ON students FOR SELECT
  TO authenticated
  USING (
    public.get_my_role() = 'admin'
    AND school_id = public.get_my_school_id()
  );

DROP POLICY IF EXISTS "Admins can insert students" ON students;
DROP POLICY IF EXISTS "Admin can insert own school students" ON students;

CREATE POLICY "Admin can insert own school students"
  ON students FOR INSERT
  TO authenticated
  WITH CHECK (
    public.get_my_role() = 'admin'
    AND school_id = public.get_my_school_id()
  );

DROP POLICY IF EXISTS "Admins can update students" ON students;
DROP POLICY IF EXISTS "Admin can update own school students" ON students;

CREATE POLICY "Admin can update own school students"
  ON students FOR UPDATE
  TO authenticated
  USING (public.get_my_role() = 'admin' AND school_id = public.get_my_school_id())
  WITH CHECK (public.get_my_role() = 'admin' AND school_id = public.get_my_school_id());

DROP POLICY IF EXISTS "Admins can delete students" ON students;
DROP POLICY IF EXISTS "Admin can delete own school students" ON students;

CREATE POLICY "Admin can delete own school students"
  ON students FOR DELETE
  TO authenticated
  USING (public.get_my_role() = 'admin' AND school_id = public.get_my_school_id());

-- ─────────────────────────────────────────────────────────────
-- 9. RE-SCOPE: scores
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can read all scores" ON scores;
DROP POLICY IF EXISTS "Admin can read own school scores" ON scores;

CREATE POLICY "Admin can read own school scores"
  ON scores FOR SELECT
  TO authenticated
  USING (
    public.get_my_role() = 'admin'
    AND school_id = public.get_my_school_id()
  );

DROP POLICY IF EXISTS "Admins can insert scores" ON scores;
DROP POLICY IF EXISTS "Admin can insert own school scores" ON scores;

CREATE POLICY "Admin can insert own school scores"
  ON scores FOR INSERT
  TO authenticated
  WITH CHECK (
    public.get_my_role() = 'admin'
    AND school_id = public.get_my_school_id()
  );

DROP POLICY IF EXISTS "Admins can update scores" ON scores;
DROP POLICY IF EXISTS "Admin can update own school scores" ON scores;

CREATE POLICY "Admin can update own school scores"
  ON scores FOR UPDATE
  TO authenticated
  USING (public.get_my_role() = 'admin' AND school_id = public.get_my_school_id())
  WITH CHECK (public.get_my_role() = 'admin' AND school_id = public.get_my_school_id());

DROP POLICY IF EXISTS "Admins can delete scores" ON scores;
DROP POLICY IF EXISTS "Admin can delete own school scores" ON scores;

CREATE POLICY "Admin can delete own school scores"
  ON scores FOR DELETE
  TO authenticated
  USING (public.get_my_role() = 'admin' AND school_id = public.get_my_school_id());

-- ─────────────────────────────────────────────────────────────
-- 10. RE-SCOPE: levels
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated users can read levels" ON levels;
DROP POLICY IF EXISTS "Admins can insert levels" ON levels;
DROP POLICY IF EXISTS "Admins can update levels" ON levels;
DROP POLICY IF EXISTS "Admins can delete levels" ON levels;

CREATE POLICY "Authenticated users can read own school levels"
  ON levels FOR SELECT
  TO authenticated
  USING (school_id = public.get_my_school_id());

CREATE POLICY "Admins can insert own school levels"
  ON levels FOR INSERT
  TO authenticated
  WITH CHECK (
    public.get_my_role() = 'admin'
    AND school_id = public.get_my_school_id()
  );

CREATE POLICY "Admins can update own school levels"
  ON levels FOR UPDATE
  TO authenticated
  USING (public.get_my_role() = 'admin' AND school_id = public.get_my_school_id())
  WITH CHECK (public.get_my_role() = 'admin' AND school_id = public.get_my_school_id());

CREATE POLICY "Admins can delete own school levels"
  ON levels FOR DELETE
  TO authenticated
  USING (public.get_my_role() = 'admin' AND school_id = public.get_my_school_id());

-- ─────────────────────────────────────────────────────────────
-- 11. RE-SCOPE: subjects
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated users can read subjects" ON subjects;
DROP POLICY IF EXISTS "Admins can insert subjects" ON subjects;
DROP POLICY IF EXISTS "Admins can update subjects" ON subjects;
DROP POLICY IF EXISTS "Admins can delete subjects" ON subjects;

CREATE POLICY "Authenticated users can read own school subjects"
  ON subjects FOR SELECT
  TO authenticated
  USING (school_id = public.get_my_school_id());

CREATE POLICY "Admins can insert own school subjects"
  ON subjects FOR INSERT
  TO authenticated
  WITH CHECK (
    public.get_my_role() = 'admin'
    AND school_id = public.get_my_school_id()
  );

CREATE POLICY "Admins can update own school subjects"
  ON subjects FOR UPDATE
  TO authenticated
  USING (public.get_my_role() = 'admin' AND school_id = public.get_my_school_id())
  WITH CHECK (public.get_my_role() = 'admin' AND school_id = public.get_my_school_id());

CREATE POLICY "Admins can delete own school subjects"
  ON subjects FOR DELETE
  TO authenticated
  USING (public.get_my_role() = 'admin' AND school_id = public.get_my_school_id());

-- ─────────────────────────────────────────────────────────────
-- 12. RE-SCOPE: level_subjects
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated users can read level_subjects" ON level_subjects;
DROP POLICY IF EXISTS "Admins can insert level_subjects" ON level_subjects;
DROP POLICY IF EXISTS "Admins can delete level_subjects" ON level_subjects;

CREATE POLICY "Authenticated users can read own school level_subjects"
  ON level_subjects FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM levels
      WHERE levels.id = level_subjects.level_id
      AND levels.school_id = public.get_my_school_id()
    )
  );

CREATE POLICY "Admins can insert own school level_subjects"
  ON level_subjects FOR INSERT
  TO authenticated
  WITH CHECK (
    public.get_my_role() = 'admin'
    AND EXISTS (
      SELECT 1 FROM levels
      WHERE levels.id = level_subjects.level_id
      AND levels.school_id = public.get_my_school_id()
    )
  );

CREATE POLICY "Admins can delete own school level_subjects"
  ON level_subjects FOR DELETE
  TO authenticated
  USING (
    public.get_my_role() = 'admin'
    AND EXISTS (
      SELECT 1 FROM levels
      WHERE levels.id = level_subjects.level_id
      AND levels.school_id = public.get_my_school_id()
    )
  );

-- ─────────────────────────────────────────────────────────────
-- 13. Super admin keep-all-access policies (already exist, ensure no drop)
-- ─────────────────────────────────────────────────────────────
-- super_admin policies from previous migrations remain in place.
-- No changes needed here.
