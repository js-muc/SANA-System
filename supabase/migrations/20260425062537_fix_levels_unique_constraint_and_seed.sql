/*
  # Fix Levels Unique Constraint & Seed Default Levels

  The existing unique constraint on (name, school_id) prevents multiple
  Senior Secondary pathways (same name, different pathway) per school.

  Changes:
  1. Drop the old unique constraint on (name, school_id)
  2. Add new unique constraint on (name, pathway, school_id) to allow
     multiple Senior Secondary rows with different pathways
  3. Seed all existing schools with the 5 standard CBC levels
*/

-- Drop old constraint
ALTER TABLE public.levels DROP CONSTRAINT IF EXISTS levels_name_school_id_key;

-- New constraint includes pathway (NULL-safe using COALESCE)
-- Use a unique index instead to handle NULL pathway values properly
CREATE UNIQUE INDEX IF NOT EXISTS levels_name_pathway_school_unique
  ON public.levels (school_id, name, COALESCE(pathway, ''));

-- Seed levels for each school that has none
DO $$
DECLARE
  school_record RECORD;
  existing_count INTEGER;
BEGIN
  FOR school_record IN SELECT id FROM public.schools LOOP
    SELECT COUNT(*) INTO existing_count
    FROM public.levels
    WHERE school_id = school_record.id;

    IF existing_count = 0 THEN
      INSERT INTO public.levels (name, sort_order, school_id, pathway) VALUES
        ('Primary School',          1, school_record.id, NULL),
        ('Junior Secondary School', 2, school_record.id, NULL),
        ('Senior Secondary School', 3, school_record.id, 'STEM'),
        ('Senior Secondary School', 4, school_record.id, 'Social Science'),
        ('Senior Secondary School', 5, school_record.id, 'Arts & Sports');
    END IF;
  END LOOP;
END $$;
