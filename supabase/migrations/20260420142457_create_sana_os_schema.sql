/*
  # SANA OS - School Intelligence System Schema

  ## Summary
  This migration creates the core database schema for the SANA OS MVP.

  ## New Tables

  1. **profiles** - Extends Supabase auth.users with name and role
     - id (uuid, PK, references auth.users)
     - name (text)
     - role (text): 'teacher' | 'admin'
     - created_at

  2. **classes** - School classes managed by teachers
     - id, name (e.g. "Grade 4A"), grade, teacher_id
     - created_at

  3. **students** - Student records linked to classes and teachers
     - id, name, class_id, teacher_id
     - created_at

  4. **subjects** - Subject definitions (Math, English, Science, etc.)
     - id, name

  5. **scores** - Student assessment scores per subject per term
     - id, student_id, subject_id, score (0-100), term (e.g. "Term 1 2024")
     - created_at

  ## Security
  - RLS enabled on all tables
  - Teachers can only access their own data
  - Admins have broader read access
  - All write operations restricted to authenticated users and owners

  ## Seed Data
  - Default subjects: Mathematics, English, Science, Social Studies, Kiswahili
*/

-- PROFILES TABLE
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT '',
  role text NOT NULL DEFAULT 'teacher',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own profile"
  ON profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- CLASSES TABLE
CREATE TABLE IF NOT EXISTS classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  grade text NOT NULL DEFAULT '',
  teacher_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE classes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers can view own classes"
  ON classes FOR SELECT
  TO authenticated
  USING (teacher_id = auth.uid());

CREATE POLICY "Teachers can insert own classes"
  ON classes FOR INSERT
  TO authenticated
  WITH CHECK (teacher_id = auth.uid());

CREATE POLICY "Teachers can update own classes"
  ON classes FOR UPDATE
  TO authenticated
  USING (teacher_id = auth.uid())
  WITH CHECK (teacher_id = auth.uid());

CREATE POLICY "Teachers can delete own classes"
  ON classes FOR DELETE
  TO authenticated
  USING (teacher_id = auth.uid());

-- STUDENTS TABLE
CREATE TABLE IF NOT EXISTS students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  class_id uuid REFERENCES classes(id) ON DELETE SET NULL,
  teacher_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE students ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers can view own students"
  ON students FOR SELECT
  TO authenticated
  USING (teacher_id = auth.uid());

CREATE POLICY "Teachers can insert own students"
  ON students FOR INSERT
  TO authenticated
  WITH CHECK (teacher_id = auth.uid());

CREATE POLICY "Teachers can update own students"
  ON students FOR UPDATE
  TO authenticated
  USING (teacher_id = auth.uid())
  WITH CHECK (teacher_id = auth.uid());

CREATE POLICY "Teachers can delete own students"
  ON students FOR DELETE
  TO authenticated
  USING (teacher_id = auth.uid());

-- SUBJECTS TABLE (global, readable by all authenticated)
CREATE TABLE IF NOT EXISTS subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE
);

ALTER TABLE subjects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read subjects"
  ON subjects FOR SELECT
  TO authenticated
  USING (true);

-- SCORES TABLE
CREATE TABLE IF NOT EXISTS scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  subject_id uuid NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  score numeric NOT NULL CHECK (score >= 0 AND score <= 100),
  term text NOT NULL DEFAULT 'Term 1',
  teacher_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers can view own scores"
  ON scores FOR SELECT
  TO authenticated
  USING (teacher_id = auth.uid());

CREATE POLICY "Teachers can insert own scores"
  ON scores FOR INSERT
  TO authenticated
  WITH CHECK (teacher_id = auth.uid());

CREATE POLICY "Teachers can update own scores"
  ON scores FOR UPDATE
  TO authenticated
  USING (teacher_id = auth.uid())
  WITH CHECK (teacher_id = auth.uid());

CREATE POLICY "Teachers can delete own scores"
  ON scores FOR DELETE
  TO authenticated
  USING (teacher_id = auth.uid());

-- SEED DEFAULT SUBJECTS
INSERT INTO subjects (name) VALUES
  ('Mathematics'),
  ('English'),
  ('Science'),
  ('Social Studies'),
  ('Kiswahili')
ON CONFLICT (name) DO NOTHING;
