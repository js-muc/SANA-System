import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  UserCog, Users, BarChart2, ArrowRight, Search,
  GraduationCap, BookOpen, TrendingUp, TrendingDown,
  Minus, Mail,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { Profile, Student, Score, Class } from '../../lib/supabase';
import { getCBCLevel, getCBCColor, getCBCSubLevel } from '../../lib/riskEngine';
import { useAuth } from '../../contexts/AuthContext';

type TeacherStats = Profile & {
  assignedClass: Class | null;
  studentCount: number;
  scoreCount: number;
  avgScore: number;
  trend: 'up' | 'down' | 'stable';
};

function TrendIcon({ trend }: { trend: 'up' | 'down' | 'stable' }) {
  if (trend === 'up') return <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />;
  if (trend === 'down') return <TrendingDown className="w-3.5 h-3.5 text-red-500" />;
  return <Minus className="w-3.5 h-3.5 text-slate-400" />;
}

export default function AdminTeachers() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const schoolId = profile?.school_id;

  const [teachers, setTeachers] = useState<Profile[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [scores, setScores] = useState<Score[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    async function load() {
      const [teachersRes, studentsRes, scoresRes, classesRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('role', 'teacher').eq('school_id', schoolId!).order('name'),
        supabase.from('students').select('id, name, teacher_id, class_id').eq('school_id', schoolId!),
        supabase.from('scores').select('id, score, teacher_id, term, created_at').eq('school_id', schoolId!),
        supabase.from('classes').select('*, level:levels(*)').eq('school_id', schoolId!).order('name'),
      ]);
      setTeachers(teachersRes.data ?? []);
      setStudents(studentsRes.data ?? []);
      setScores(scoresRes.data ?? []);
      setClasses(classesRes.data ?? []);
      setLoading(false);
    }
    load();
  }, [schoolId]);

  const teacherStats = useMemo<TeacherStats[]>(() => {
    return teachers.map(t => {
      const tStudents = students.filter(s => s.teacher_id === t.id);
      const tScores = scores.filter(s => s.teacher_id === t.id);
      const assignedClass = classes.find(c => c.teacher_id === t.id) ?? null;

      const avgScore = tScores.length > 0
        ? Math.round((tScores.reduce((sum, s) => sum + s.score, 0) / tScores.length) * 10) / 10
        : 0;

      // Simple trend: compare Term 1 vs Term 2 avg if both exist
      const term1 = tScores.filter(s => s.term === 'Term 1');
      const term2 = tScores.filter(s => s.term === 'Term 2');
      let trend: 'up' | 'down' | 'stable' = 'stable';
      if (term1.length > 0 && term2.length > 0) {
        const avg1 = term1.reduce((a, b) => a + b.score, 0) / term1.length;
        const avg2 = term2.reduce((a, b) => a + b.score, 0) / term2.length;
        if (avg2 - avg1 > 2) trend = 'up';
        else if (avg1 - avg2 > 2) trend = 'down';
      }

      return { ...t, assignedClass, studentCount: tStudents.length, scoreCount: tScores.length, avgScore, trend };
    });
  }, [teachers, students, scores, classes]);

  const filtered = useMemo(
    () => teacherStats.filter(t => t.name.toLowerCase().includes(search.toLowerCase())),
    [teacherStats, search]
  );

  const totalStudents = students.length;
  const schoolAvg = scores.length > 0
    ? Math.round((scores.reduce((sum, s) => sum + s.score, 0) / scores.length) * 10) / 10
    : 0;
  const assignedCount = teacherStats.filter(t => !!t.assignedClass).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-7 h-7 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-sm">
            <UserCog className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Teachers</h1>
            <p className="text-sm text-slate-500">All registered teachers and their performance contribution</p>
          </div>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Teachers', value: teachers.length, icon: UserCog, bg: 'bg-blue-50', color: 'text-blue-600', sub: `${assignedCount} with class` },
          { label: 'Total Students', value: totalStudents, icon: Users, bg: 'bg-emerald-50', color: 'text-emerald-600', sub: 'enrolled' },
          { label: 'School Average', value: schoolAvg > 0 ? `${schoolAvg}%` : '—', icon: BarChart2, bg: 'bg-amber-50', color: 'text-amber-600', sub: scores.length > 0 ? getCBCSubLevel(schoolAvg) : 'no scores yet' },
          { label: 'Classes', value: classes.length, icon: GraduationCap, bg: 'bg-slate-50', color: 'text-slate-600', sub: `${classes.filter(c => !!c.teacher_id).length} assigned` },
        ].map(stat => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
              <div className="flex items-start justify-between mb-3">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${stat.bg}`}>
                  <Icon className={`w-5 h-5 ${stat.color}`} />
                </div>
              </div>
              <p className="text-2xl font-bold text-slate-900">{stat.value}</p>
              <p className="text-xs font-medium text-slate-500 mt-0.5">{stat.label}</p>
              <p className="text-[11px] text-slate-400 mt-0.5">{stat.sub}</p>
            </div>
          );
        })}
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search teachers..."
          className="w-full border border-slate-200 rounded-xl pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white shadow-sm"
        />
      </div>

      {teachers.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-14 text-center">
          <UserCog className="w-12 h-12 text-slate-200 mx-auto mb-3" />
          <p className="font-semibold text-slate-600">No teachers registered yet</p>
          <p className="text-sm text-slate-400 mt-1">Teachers appear here after they create an account and are approved.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-slate-400 text-sm">No teachers match your search</div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          {/* Table header */}
          <div className="px-5 py-3 bg-slate-50 border-b border-slate-100 grid grid-cols-12 gap-2 text-xs font-semibold text-slate-500 uppercase tracking-wide">
            <div className="col-span-4">Teacher</div>
            <div className="col-span-3">Assigned Class</div>
            <div className="col-span-1 text-center">Students</div>
            <div className="col-span-1 text-center">Scores</div>
            <div className="col-span-2 text-center">Avg / CBC</div>
            <div className="col-span-1 text-right pr-2">Actions</div>
          </div>

          <div className="divide-y divide-slate-50">
            {filtered.map(t => {
              const cbcLevel = t.avgScore > 0 ? getCBCLevel(t.avgScore) : null;
              const classLevel = (t.assignedClass as any)?.level;

              return (
                <div key={t.id} className="grid grid-cols-12 gap-2 items-center px-5 py-4 hover:bg-slate-50/60 transition group">
                  {/* Teacher */}
                  <div className="col-span-4 flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-100 to-blue-200 flex items-center justify-center shrink-0">
                      <span className="font-bold text-blue-700 text-sm">{t.name.charAt(0).toUpperCase()}</span>
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900 truncate text-sm">{t.name}</p>
                      <div className="flex items-center gap-1 mt-0.5">
                        <TrendIcon trend={t.trend} />
                        <p className="text-xs text-slate-400">
                          {t.trend === 'up' ? 'Improving' : t.trend === 'down' ? 'Declining' : 'Stable'}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Assigned class */}
                  <div className="col-span-3 min-w-0">
                    {t.assignedClass ? (
                      <div>
                        <p className="text-sm font-medium text-slate-900 truncate">{t.assignedClass.name}</p>
                        {classLevel && (
                          <p className="text-xs text-slate-400 truncate">
                            {classLevel.pathway ? `Senior — ${classLevel.pathway}` : classLevel.name}
                          </p>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 px-2 py-1 rounded-lg">
                        No class assigned
                      </span>
                    )}
                  </div>

                  {/* Students */}
                  <div className="col-span-1 text-center">
                    <span className="text-base font-bold text-slate-900">{t.studentCount}</span>
                  </div>

                  {/* Scores */}
                  <div className="col-span-1 text-center">
                    <span className="text-base font-bold text-slate-900">{t.scoreCount}</span>
                  </div>

                  {/* Avg + CBC */}
                  <div className="col-span-2 flex flex-col items-center gap-1">
                    <span className="text-base font-bold text-slate-900">
                      {t.avgScore > 0 ? `${t.avgScore}%` : '—'}
                    </span>
                    {cbcLevel && (
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${getCBCColor(cbcLevel)}`}>
                        {getCBCSubLevel(t.avgScore)}
                      </span>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="col-span-1 flex justify-end gap-1">
                    <button
                      onClick={() => navigate(`/students?teacher=${t.id}`)}
                      title="View students"
                      className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition opacity-0 group-hover:opacity-100"
                    >
                      <Users className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => navigate(`/admin/results?teacher=${t.id}`)}
                      title="View results"
                      className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition opacity-0 group-hover:opacity-100"
                    >
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="px-5 py-3.5 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
            <p className="text-xs text-slate-500">
              {filtered.length} teacher{filtered.length !== 1 ? 's' : ''}
              {' · '}
              {totalStudents} students total
              {' · '}
              {scores.length} score entries
            </p>
            <button
              onClick={() => navigate('/admin/results')}
              className="flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-800 transition"
            >
              View all results <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
