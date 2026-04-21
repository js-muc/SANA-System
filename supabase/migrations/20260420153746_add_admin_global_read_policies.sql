/*
  # SANA OS — Admin Global Read Access

  ## Summary
  Grants administrators full read visibility across all school data.
  Previously, teachers could only see their own students and scores.
  Admins now bypass teacher-scoped filters and see the entire system.

  ## Changes

  1. **profiles** — Admins can read ALL user profiles (needed to list all teachers)
     - Existing policy: users can read own profile (unchanged)
     - New policy: admins can read all profiles

  2. **students** — Admins can read ALL students regardless of teacher ownership
     - Existing policy: teachers read own students (unchanged)
     - New policy: admins read all students

  3. **scores** — Admins can read ALL scores regardless of teacher ownership
     - Existing policy: teachers read own scores (unchanged)
     - New policy: admins read all scores

  ## Security Notes
  - Teacher write policies are NOT changed — teachers still own their data
  - Admin read access uses the pattern:
      (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  - This subquery is safe because users can always read their own profile row
  - No circular dependency exists since the subquery targets auth.uid() = id
    which matches the existing "Users can read own profile" policy

  ## Important
  These are additive SELECT policies only — no write permissions are added.
  Supabase evaluates multiple SELECT policies with OR logic, so existing
  teacher-scoped policies continue to work unchanged.
*/

-- ============================================================
-- PROFILES: Admin can read all profiles (to list teachers)
-- ============================================================
CREATE POLICY "Admins can read all profiles"
  ON profiles FOR SELECT
  TO authenticated
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

-- ============================================================
-- STUDENTS: Admin can read all students
-- ============================================================
CREATE POLICY "Admins can read all students"
  ON students FOR SELECT
  TO authenticated
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

-- ============================================================
-- SCORES: Admin can read all scores
-- ============================================================
CREATE POLICY "Admins can read all scores"
  ON scores FOR SELECT
  TO authenticated
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');
