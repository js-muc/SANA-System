import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type Profile = {
  id: string;
  name: string;
  role: 'teacher' | 'admin' | 'super_admin';
  approval_status: 'pending' | 'approved' | 'rejected';
  school_id: string | null;
  created_at: string;
};

export type School = {
  id: string;
  name: string;
  slug: string;
  country: string;
  created_at: string;
};

export type Level = {
  id: string;
  name: string;
  sort_order: number;
  school_id: string;
  pathway: string | null;
  created_at: string;
};

export type Class = {
  id: string;
  name: string;
  grade: string;
  level_id: string | null;
  teacher_id: string | null;
  school_id: string;
  created_at: string;
  level?: Level;
};

export type Subject = {
  id: string;
  name: string;
  school_id: string;
};

export type LevelSubject = {
  id: string;
  level_id: string;
  subject_id: string;
  created_at: string;
  subject?: Subject;
  level?: Level;
};

export type Student = {
  id: string;
  name: string;
  class_id: string | null;
  teacher_id: string;
  school_id: string;
  created_at: string;
  class?: Class;
};

export type Score = {
  id: string;
  student_id: string;
  subject_id: string;
  score: number;
  term: string;
  teacher_id: string;
  school_id: string;
  created_at: string;
  subject?: Subject;
};
