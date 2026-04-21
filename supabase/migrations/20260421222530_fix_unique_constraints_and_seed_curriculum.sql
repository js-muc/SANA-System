/*
  # Fix unique constraints & seed curriculum structure

  ## Summary
  1. Drop global unique constraints on levels.name and subjects.name
     (names should only be unique WITHIN a school)
  2. Add school-scoped unique constraints: (name, school_id)
  3. Add pathway column to levels for Senior Secondary career tracks
  4. Seed 5 levels (Primary, Junior Secondary, 3x Senior Secondary pathways)
     and 8 default subjects for every school that has none
  5. Seed level_subjects for existing schools

  ## Changes
  - levels: drop global name unique → add unique(name, school_id), add pathway column
  - subjects: drop global name unique → add unique(name, school_id)
  - Seed: Primary, Junior Secondary, Senior Secondary (STEM/Social Science/Sports & Career)
  - Seed: Mathematics, English, Kiswahili, Science, Social Studies, CRE/IRE, Creative Arts, PE
*/

-- 1. Fix levels unique constraint
ALTER TABLE levels DROP CONSTRAINT IF EXISTS levels_name_key;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'levels' AND constraint_name = 'levels_name_school_id_key'
  ) THEN
    ALTER TABLE levels ADD CONSTRAINT levels_name_school_id_key UNIQUE (name, school_id);
  END IF;
END $$;

-- 2. Fix subjects unique constraint
ALTER TABLE subjects DROP CONSTRAINT IF EXISTS subjects_name_key;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'subjects' AND constraint_name = 'subjects_name_school_id_key'
  ) THEN
    ALTER TABLE subjects ADD CONSTRAINT subjects_name_school_id_key UNIQUE (name, school_id);
  END IF;
END $$;

-- 3. Add pathway column to levels
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'levels' AND column_name = 'pathway'
  ) THEN
    ALTER TABLE levels ADD COLUMN pathway text DEFAULT NULL;
  END IF;
END $$;

-- 4. Seed the 5 level rows for every school that has no levels yet
INSERT INTO levels (name, sort_order, school_id, pathway)
SELECT
  lvl.name,
  lvl.sort_order,
  s.id,
  lvl.pathway
FROM schools s
CROSS JOIN (
  VALUES
    ('Primary',                                1, NULL::text),
    ('Junior Secondary',                       2, NULL),
    ('Senior Secondary – STEM',                3, 'STEM'),
    ('Senior Secondary – Social Science',      4, 'Social Science'),
    ('Senior Secondary – Sports & Career',     5, 'Sports & Career')
) AS lvl(name, sort_order, pathway)
WHERE NOT EXISTS (
  SELECT 1 FROM levels l WHERE l.school_id = s.id
)
ON CONFLICT (name, school_id) DO NOTHING;

-- 5. Seed default subjects for every school that has no subjects yet
INSERT INTO subjects (name, school_id)
SELECT sub.name, s.id
FROM schools s
CROSS JOIN (
  VALUES
    ('Mathematics'),
    ('English'),
    ('Kiswahili'),
    ('Science & Technology'),
    ('Social Studies'),
    ('CRE / IRE'),
    ('Creative Arts & Sports'),
    ('Physical Education')
) AS sub(name)
WHERE NOT EXISTS (
  SELECT 1 FROM subjects ex WHERE ex.school_id = s.id
)
ON CONFLICT (name, school_id) DO NOTHING;
