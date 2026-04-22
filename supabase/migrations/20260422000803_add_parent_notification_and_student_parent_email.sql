/*
  # Parent Notification Scaffold

  ## Summary
  Prepares the system for future parent communication.
  - Adds parent_email column to students table
  - Adds notification tracking to competency_assessments
  - Adds ai_comment_for_parent column (plain-language summary safe to share with parents)

  ## Changes

  ### students
  - `parent_email` (text, nullable) — parent/guardian email address for future notifications

  ### competency_assessments
  - `ai_comment_for_parent` (text) — simplified, parent-friendly version of the AI comment
  - `parent_notification_sent` (boolean, default false) — tracks if parent was notified
  - `parent_notified_at` (timestamptz, nullable) — when the notification was sent

  ## Notes
  - No existing data is changed
  - All new columns are nullable or have safe defaults
  - Parent notifications are NOT triggered automatically — field is a scaffold for future feature
*/

-- Add parent contact to students
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'students' AND column_name = 'parent_email'
  ) THEN
    ALTER TABLE students ADD COLUMN parent_email text DEFAULT '';
  END IF;
END $$;

-- Add parent-facing AI comment + notification tracking to competency_assessments
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'competency_assessments' AND column_name = 'ai_comment_for_parent'
  ) THEN
    ALTER TABLE competency_assessments ADD COLUMN ai_comment_for_parent text DEFAULT '';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'competency_assessments' AND column_name = 'parent_notification_sent'
  ) THEN
    ALTER TABLE competency_assessments ADD COLUMN parent_notification_sent boolean DEFAULT false;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'competency_assessments' AND column_name = 'parent_notified_at'
  ) THEN
    ALTER TABLE competency_assessments ADD COLUMN parent_notified_at timestamptz DEFAULT NULL;
  END IF;
END $$;
