-- 1. Add the year column. We backfill it from created_at rather than a flat
--    default, since that's the closest thing we have to "what year was this
--    actually entered in" for your 193 existing rows.
ALTER TABLE scores ADD COLUMN IF NOT EXISTS year text;

UPDATE scores
SET year = EXTRACT(YEAR FROM created_at)::text
WHERE year IS NULL;

ALTER TABLE scores ALTER COLUMN year SET NOT NULL;
ALTER TABLE scores ALTER COLUMN year SET DEFAULT (EXTRACT(YEAR FROM now())::text);

-- 2. Replace the 4-column constraint with a 5-column one that also
--    distinguishes by year. Without this, "Term 1" from 2025 and "Term 1"
--    from 2026 for the same student/subject/assessment silently collide.

-- Clean up the old 4-column constraint if it exists
ALTER TABLE scores DROP CONSTRAINT IF EXISTS scores_student_subject_term_assessment_unique;

-- Clean up the conflicting 5-column constraint if a previous push created it partially
ALTER TABLE scores DROP CONSTRAINT IF EXISTS scores_student_subject_term_year_assessment_unique;

-- Create the new 5-column unique constraint safely
ALTER TABLE scores
  ADD CONSTRAINT scores_student_subject_term_year_assessment_unique
  UNIQUE (student_id, subject_id, term, year, assessment);
