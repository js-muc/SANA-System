/*
  # Scores Unique Constraint + Deduplication

  ## Problem
  The scores table had no uniqueness constraint on (student_id, subject_id, term).
  This allowed teachers to accidentally INSERT duplicate score records for the same
  student, subject, and term — making it look like Term 1 scores "bleed" into Term 2
  or Term 3 when averaged or displayed.

  ## Changes

  1. **Deduplication** — Before adding the constraint, remove any duplicate rows,
     keeping only the most recently created record for each (student_id, subject_id, term).

  2. **Unique constraint** — Add UNIQUE(student_id, subject_id, term) so future saves
     use UPSERT semantics (update if exists, insert if new). This makes the score entry
     idempotent: saving the same term twice just updates scores, never duplicates.
*/

-- Step 1: Delete all but the most recent duplicate per (student_id, subject_id, term)
DELETE FROM scores
WHERE id IN (
  SELECT id FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY student_id, subject_id, term
        ORDER BY created_at DESC
      ) AS rn
    FROM scores
  ) ranked
  WHERE rn > 1
);

-- Step 2: Add the unique constraint (safe to run — duplicates removed above)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'scores_student_subject_term_unique'
  ) THEN
    ALTER TABLE scores
      ADD CONSTRAINT scores_student_subject_term_unique
      UNIQUE (student_id, subject_id, term);
  END IF;
END $$;
