import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserCog, Users, BarChart2, ArrowRight, Search } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { Profile, Student, Score } from '../../lib/supabase';
import { getCBCLevel, getCBCColor } from '../../lib/riskEngine';
import { useAuth } from '../../contexts/AuthContext';

type TeacherStats = Profile & {
  studentCount: number;
  scoreCount: number;
  avgScore: number;
  cbcLevel: ReturnType<typeof getCBCLevel>;
};

export default function AdminTeachers() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const schoolId = profile?.school_id;

  const [teachers, setTeachers] = useState<Profile[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [scores, setScores] = useState<Score[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    async function load() {
      const [teachersRes, studentsRes, scoresRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('role', 'teacher').eq('school_id', schoolId!).order('name'),
        supabase.from('students').select('id, name, teacher_id, class_id, class:classes(name)').eq('school_id', schoolId!),
        supabase.from('scores').select('id, score, teacher_id, term, created_at').eq('school_id', schoolId!),
      ]);
      setTeachers(teachersRes.data ?? []);
      setStudents(studentsRes.data ?? []);
      setScores(scoresRes.data ?? []);
      setLoading(false);
    }
    load();
  }, [schoolId]);

  const teacherStats = useMemo<TeacherStats[]>(() => {
    return teachers.map(t => {
      const tStudents = students.filter(s => s.teacher_id === t.id);
      const tScores = scores.filter(s => s.teacher_id === t.id);
      const avgScore =
        tScores.length > 0
          ? Math.round((tScores.reduce((sum, s) => sum + s.score, 0) / tScores.length) * 10) / 10
          : 0;
      return {
        ...t,
        studentCount: tStudents.length,
        scoreCount: tScores.length,
        avgScore,
        cbcLevel: getCBCLevel(avgScore),
      };
    });
  }, [teachers, students, scores]);

  const filtered = useMemo(
    () => teacherStats.filter(t => t.name.toLowerCase().includes(search.toLowerCase())),
    [teacherStats, search]
  );

  // School-wide summary
  const totalStudents = students.length;
  const totalScores = scores.length;
  const schoolAvg =
    scores.length > 0
      ? Math.round((scores.reduce((sum, s) => sum + s.score, 0) / scores.length) * 10) / 10
      : 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-7 h-7 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
            <UserCog className="w-4 h-4 text-blue-600" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Teachers</h1>
        </div>
        <p className="text-slate-500 ml-11">
          All registered teachers and their school-wide performance contribution
        </p>
      </div>

      {/* School summary */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Teachers', value: teachers.length, icon: UserCog, bg: 'bg-blue-50', color: 'text-blue-600' },
          { label: 'Total Students', value: totalStudents, icon: Users, bg: 'bg-emerald-50', color: 'text-emerald-600' },
          { label: 'School Average', value: `${schoolAvg}%`, icon: BarChart2, bg: 'bg-amber-50', color: 'text-amber-600' },
        ].map(stat => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex items-center gap-4">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${stat.bg}`}>
                <Icon className={`w-5 h-5 ${stat.color}`} />
              </div>
              <div>
                <p className="text-xl font-bold text-slate-900">{stat.value}</p>
                <p className="text-xs text-slate-500">{stat.label}</p>
              </div>
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
          className="w-full border border-slate-200 rounded-xl pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        />
      </div>

      {/* Teacher cards / table */}
      {teachers.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-12 text-center">
          <UserCog className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="font-medium text-slate-600">No teachers registered yet</p>
          <p className="text-sm text-slate-400 mt-1">Teachers appear here after they create an account.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-slate-400">No teachers match your search</div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-5 py-3 bg-slate-50 border-b border-slate-100 grid grid-cols-12 gap-2 text-xs font-semibold text-slate-500 uppercase tracking-wide">
            <div className="col-span-4">Teacher</div>
            <div className="col-span-2 text-center">Students</div>
            <div className="col-span-2 text-center">Scores Entered</div>
            <div className="col-span-2 text-center">Avg Score</div>
            <div className="col-span-2 text-right pr-2">Actions</div>
          </div>

          <div className="divide-y divide-slate-50">
            {filtered.map(t => (
              <div key={t.id} className="grid grid-cols-12 gap-2 items-center px-5 py-4 hover:bg-slate-50 transition group">
                {/* Teacher info */}
                <div className="col-span-4 flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-100 to-blue-200 flex items-center justify-center shrink-0">
                    <span className="font-bold text-blue-700 text-sm">{t.name.charAt(0).toUpperCase()}</span>
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900 truncate">{t.name}</p>
                    <p className="text-xs text-slate-400 capitalize">{t.role}</p>
                  </div>
                </div>

                {/* Students */}
                <div className="col-span-2 text-center">
                  <span className="text-lg font-bold text-slate-900">{t.studentCount}</span>
                </div>

                {/* Scores entered */}
                <div className="col-span-2 text-center">
                  <span className="text-lg font-bold text-slate-900">{t.scoreCount}</span>
                </div>

                {/* Avg score */}
                <div className="col-span-2 flex flex-col items-center gap-1">
                  <span className="text-lg font-bold text-slate-900">{t.avgScore > 0 ? `${t.avgScore}%` : '—'}</span>
                  {t.avgScore > 0 && (
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${getCBCColor(t.cbcLevel)}`}>
                      {t.cbcLevel}
                    </span>
                  )}
                </div>

                {/* Actions */}
                <div className="col-span-2 flex justify-end gap-2">
                  <button
                    onClick={() => navigate(`/students?teacher=${t.id}`)}
                    className="flex items-center gap-1.5 text-xs font-medium border border-slate-200 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 text-slate-600 px-3 py-1.5 rounded-lg transition"
                  >
                    <Users className="w-3 h-3" />
                    Students
                  </button>
                  <button
                    onClick={() => navigate(`/admin/results?teacher=${t.id}`)}
                    className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-700 transition"
                  >
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="px-5 py-3 border-t border-slate-100 bg-slate-50">
            <p className="text-xs text-slate-500">
              {filtered.length} teacher{filtered.length !== 1 ? 's' : ''} · {totalStudents} students total · {totalScores} scores entered
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
