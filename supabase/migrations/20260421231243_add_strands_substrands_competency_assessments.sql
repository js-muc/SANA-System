/*
  # Add Strands, Sub-strands & Competency Assessments

  ## Summary
  Extends the curriculum model to support granular progress tracking.
  Teachers can now track student competency at the strand/sub-strand level
  (e.g. Mathematics → Numbers → Fractions) with a CBC competency rating and
  an AI-generated comment.

  ## New Tables

  ### strands
  - Curriculum strands within a subject (e.g. "Numbers", "Geometry")
  - Scoped to school_id for full isolation
  - Linked to a subject

  ### sub_strands
  - Sub-topics within a strand (e.g. "Fractions", "Decimals")
  - Scoped to school_id for full isolation
  - Linked to a strand

  ### competency_assessments
  - Per-student, per-sub-strand competency record
  - Stores: score (0-100), cbc_level (EE/ME/AE/BE), term, ai_comment, teacher_note
  - Supports trend analysis over multiple terms
  - Unique per (student_id, sub_strand_id, term)

  ## Security
  - RLS enabled on all three new tables
  - Teachers can only read/write their own students' records
  - Admins can read all records within their school
  - Super admins have full access
*/

-- ─────────────────────────────────────────────
-- STRANDS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS strands (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  subject_id uuid NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  school_id  uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  sort_order int  NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE (name, subject_id, school_id)
);

ALTER TABLE strands ENABLE ROW LEVEL SECURITY;

-- Super admin: full access
CREATE POLICY "Super admin full access on strands"
  ON strands FOR SELECT TO authenticated
  USING (public.get_my_role() = 'super_admin');

CREATE POLICY "Super admin insert strands"
  ON strands FOR INSERT TO authenticated
  WITH CHECK (public.get_my_role() = 'super_admin');

CREATE POLICY "Super admin update strands"
  ON strands FOR UPDATE TO authenticated
  USING (public.get_my_role() = 'super_admin')
  WITH CHECK (public.get_my_role() = 'super_admin');

CREATE POLICY "Super admin delete strands"
  ON strands FOR DELETE TO authenticated
  USING (public.get_my_role() = 'super_admin');

-- Admin: school-scoped
CREATE POLICY "Admin read own school strands"
  ON strands FOR SELECT TO authenticated
  USING (school_id = public.get_my_school_id() AND public.get_my_role() = 'admin');

CREATE POLICY "Admin insert strands in own school"
  ON strands FOR INSERT TO authenticated
  WITH CHECK (school_id = public.get_my_school_id() AND public.get_my_role() = 'admin');

CREATE POLICY "Admin update own school strands"
  ON strands FOR UPDATE TO authenticated
  USING (school_id = public.get_my_school_id() AND public.get_my_role() = 'admin')
  WITH CHECK (school_id = public.get_my_school_id() AND public.get_my_role() = 'admin');

CREATE POLICY "Admin delete own school strands"
  ON strands FOR DELETE TO authenticated
  USING (school_id = public.get_my_school_id() AND public.get_my_role() = 'admin');

-- Teacher: read strands for their school
CREATE POLICY "Teacher read strands"
  ON strands FOR SELECT TO authenticated
  USING (school_id = public.get_my_school_id() AND public.get_my_role() = 'teacher');

-- ─────────────────────────────────────────────
-- SUB-STRANDS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sub_strands (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  strand_id  uuid NOT NULL REFERENCES strands(id) ON DELETE CASCADE,
  school_id  uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  sort_order int  NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE (name, strand_id, school_id)
);

ALTER TABLE sub_strands ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admin full access on sub_strands"
  ON sub_strands FOR SELECT TO authenticated
  USING (public.get_my_role() = 'super_admin');

CREATE POLICY "Super admin insert sub_strands"
  ON sub_strands FOR INSERT TO authenticated
  WITH CHECK (public.get_my_role() = 'super_admin');

CREATE POLICY "Super admin update sub_strands"
  ON sub_strands FOR UPDATE TO authenticated
  USING (public.get_my_role() = 'super_admin')
  WITH CHECK (public.get_my_role() = 'super_admin');

CREATE POLICY "Super admin delete sub_strands"
  ON sub_strands FOR DELETE TO authenticated
  USING (public.get_my_role() = 'super_admin');

CREATE POLICY "Admin read own school sub_strands"
  ON sub_strands FOR SELECT TO authenticated
  USING (school_id = public.get_my_school_id() AND public.get_my_role() = 'admin');

CREATE POLICY "Admin insert sub_strands in own school"
  ON sub_strands FOR INSERT TO authenticated
  WITH CHECK (school_id = public.get_my_school_id() AND public.get_my_role() = 'admin');

CREATE POLICY "Admin update own school sub_strands"
  ON sub_strands FOR UPDATE TO authenticated
  USING (school_id = public.get_my_school_id() AND public.get_my_role() = 'admin')
  WITH CHECK (school_id = public.get_my_school_id() AND public.get_my_role() = 'admin');

CREATE POLICY "Admin delete own school sub_strands"
  ON sub_strands FOR DELETE TO authenticated
  USING (school_id = public.get_my_school_id() AND public.get_my_role() = 'admin');

CREATE POLICY "Teacher read sub_strands"
  ON sub_strands FOR SELECT TO authenticated
  USING (school_id = public.get_my_school_id() AND public.get_my_role() = 'teacher');

-- ─────────────────────────────────────────────
-- COMPETENCY ASSESSMENTS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS competency_assessments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id     uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  sub_strand_id  uuid NOT NULL REFERENCES sub_strands(id) ON DELETE CASCADE,
  score          numeric(5,2) NOT NULL CHECK (score >= 0 AND score <= 100),
  cbc_level      text NOT NULL CHECK (cbc_level IN ('EE', 'ME', 'AE', 'BE')),
  term           text NOT NULL,
  teacher_id     uuid NOT NULL REFERENCES profiles(id),
  school_id      uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  ai_comment     text DEFAULT '',
  teacher_note   text DEFAULT '',
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now(),
  UNIQUE (student_id, sub_strand_id, term)
);

ALTER TABLE competency_assessments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admin full access on competency_assessments"
  ON competency_assessments FOR SELECT TO authenticated
  USING (public.get_my_role() = 'super_admin');

CREATE POLICY "Super admin insert competency_assessments"
  ON competency_assessments FOR INSERT TO authenticated
  WITH CHECK (public.get_my_role() = 'super_admin');

CREATE POLICY "Super admin update competency_assessments"
  ON competency_assessments FOR UPDATE TO authenticated
  USING (public.get_my_role() = 'super_admin')
  WITH CHECK (public.get_my_role() = 'super_admin');

CREATE POLICY "Super admin delete competency_assessments"
  ON competency_assessments FOR DELETE TO authenticated
  USING (public.get_my_role() = 'super_admin');

CREATE POLICY "Admin read competency_assessments in school"
  ON competency_assessments FOR SELECT TO authenticated
  USING (school_id = public.get_my_school_id() AND public.get_my_role() = 'admin');

CREATE POLICY "Teacher read own competency_assessments"
  ON competency_assessments FOR SELECT TO authenticated
  USING (teacher_id = auth.uid() AND public.get_my_role() = 'teacher');

CREATE POLICY "Teacher insert competency_assessments"
  ON competency_assessments FOR INSERT TO authenticated
  WITH CHECK (teacher_id = auth.uid() AND school_id = public.get_my_school_id() AND public.get_my_role() = 'teacher');

CREATE POLICY "Teacher update own competency_assessments"
  ON competency_assessments FOR UPDATE TO authenticated
  USING (teacher_id = auth.uid() AND public.get_my_role() = 'teacher')
  WITH CHECK (teacher_id = auth.uid() AND school_id = public.get_my_school_id());

CREATE POLICY "Teacher delete own competency_assessments"
  ON competency_assessments FOR DELETE TO authenticated
  USING (teacher_id = auth.uid() AND public.get_my_role() = 'teacher');

-- Index for fast student trend queries
CREATE INDEX IF NOT EXISTS idx_competency_student_term ON competency_assessments(student_id, term);
CREATE INDEX IF NOT EXISTS idx_competency_sub_strand ON competency_assessments(sub_strand_id);
CREATE INDEX IF NOT EXISTS idx_strands_subject ON strands(subject_id);
CREATE INDEX IF NOT EXISTS idx_sub_strands_strand ON sub_strands(strand_id);
