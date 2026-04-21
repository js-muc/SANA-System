/*
  # SANA OS — Curriculum-Flexible Schema Refactor

  ## Summary
  This migration adds a levels system and dynamic subject-to-level mapping,
  transforming SANA OS from a fixed-curriculum system to a fully flexible
  school intelligence platform.

  ## New Tables

  1. **levels** — School levels (Primary, Junior Secondary, Senior Secondary)
     - id, name (unique), sort_order, created_at
     - Seeded with the three standard Kenyan curriculum levels

  2. **level_subjects** — Maps which subjects belong to each level
     - id, level_id (FK), subject_id (FK), created_at
     - UNIQUE constraint on (level_id, subject_id) to prevent duplicates
     - This is the ONLY source of truth for subject-level assignment

  ## Modified Tables

  3. **classes** — Now admin-managed, linked to a level
     - Added: level_id (uuid, nullable FK → levels)
     - Changed: teacher_id is now NULLABLE (classes are no longer teacher-owned)
     - Old teacher-scoped RLS policies dropped
     - New RLS: all authenticated users can read; only admins can write

  4. **subjects** — Admin-managed (write policies added)
     - Added: admin INSERT and DELETE policies

  ## Security Changes
  - All new tables have RLS enabled
  - Admin-write patterns use: (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  - Classes become globally readable (teachers see all admin-created classes)
  - Levels and level_subjects are globally readable

  ## Important Notes
  1. Existing classes keep their teacher_id data but the column becomes optional
  2. The five seeded default subjects remain; admin can add/remove subjects going forward
  3. Teachers still own their students (student.teacher_id unchanged)
  4. Scores still belong to teachers (score.teacher_id unchanged)
*/

-- ============================================================
-- LEVELS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS levels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE levels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read levels"
  ON levels FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can insert levels"
  ON levels FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

CREATE POLICY "Admins can update levels"
  ON levels FOR UPDATE
  TO authenticated
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin')
  WITH CHECK ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

CREATE POLICY "Admins can delete levels"
  ON levels FOR DELETE
  TO authenticated
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

-- Seed the three standard levels
INSERT INTO levels (name, sort_order) VALUES
  ('Primary', 1),
  ('Junior Secondary', 2),
  ('Senior Secondary', 3)
ON CONFLICT (name) DO NOTHING;

-- ============================================================
-- ALTER CLASSES TABLE
-- ============================================================

-- Add level_id (nullable — existing rows won't have a level yet)
ALTER TABLE classes ADD COLUMN IF NOT EXISTS level_id uuid REFERENCES levels(id) ON DELETE SET NULL;

-- Make teacher_id nullable — classes are now admin-created
ALTER TABLE classes ALTER COLUMN teacher_id DROP NOT NULL;

-- Drop old teacher-scoped policies
DROP POLICY IF EXISTS "Teachers can view own classes" ON classes;
DROP POLICY IF EXISTS "Teachers can insert own classes" ON classes;
DROP POLICY IF EXISTS "Teachers can update own classes" ON classes;
DROP POLICY IF EXISTS "Teachers can delete own classes" ON classes;

-- New policies: globally readable, admin-writable
CREATE POLICY "Authenticated users can read classes"
  ON classes FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can insert classes"
  ON classes FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

CREATE POLICY "Admins can update classes"
  ON classes FOR UPDATE
  TO authenticated
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin')
  WITH CHECK ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

CREATE POLICY "Admins can delete classes"
  ON classes FOR DELETE
  TO authenticated
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

-- ============================================================
-- LEVEL_SUBJECTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS level_subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  level_id uuid NOT NULL REFERENCES levels(id) ON DELETE CASCADE,
  subject_id uuid NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(level_id, subject_id)
);

ALTER TABLE level_subjects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read level_subjects"
  ON level_subjects FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can insert level_subjects"
  ON level_subjects FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

CREATE POLICY "Admins can delete level_subjects"
  ON level_subjects FOR DELETE
  TO authenticated
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

-- ============================================================
-- UPDATE SUBJECTS RLS — add admin write access
-- ============================================================
CREATE POLICY "Admins can insert subjects"
  ON subjects FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

CREATE POLICY "Admins can update subjects"
  ON subjects FOR UPDATE
  TO authenticated
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin')
  WITH CHECK ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

CREATE POLICY "Admins can delete subjects"
  ON subjects FOR DELETE
  TO authenticated
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');
