import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, ArrowRight, Users, Filter } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Student, Score, Profile, Class } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { analyzeStudent, getRiskColor, getCBCColor } from '../lib/riskEngine';
import type { StudentRisk } from '../lib/riskEngine';

const RISK_LABELS: Record<StudentRisk['riskLevel'], string> = {
  safe: 'Safe',
  'at-risk': 'At Risk',
  critical: 'Critical',
};

export default function StudentsList() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const isAdmin = profile?.role === 'admin';
  const schoolId = profile?.school_id;

  const [students, setStudents] = useState<Student[]>([]);
  const [scores, setScores] = useState<Score[]>([]);
  const [teachers, setTeachers] = useState<Profile[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [filterRisk, setFilterRisk] = useState<StudentRisk['riskLevel'] | 'all'>('all');
  const [filterTeacher, setFilterTeacher] = useState('all');
  const [filterClass, setFilterClass] = useState('all');

  useEffect(() => {
    if (!user) return;
    async function load() {
      const studentsQ = supabase
        .from('students')
        .select('*, class:classes(*, level:levels(*))')
        .order('name');
      const scoresQ = supabase.from('scores').select('*, subject:subjects(*)');

      if (isAdmin) {
        studentsQ.eq('school_id', schoolId!);
        scoresQ.eq('school_id', schoolId!);
      } else {
        studentsQ.eq('teacher_id', user!.id);
        scoresQ.eq('teacher_id', user!.id);
      }

      const ops: PromiseLike<any>[] = [studentsQ, scoresQ];
      if (isAdmin) {
        ops.push(
          supabase.from('profiles').select('*').eq('role', 'teacher').eq('school_id', schoolId!).order('name'),
          supabase.from('classes').select('*, level:levels(*)').eq('school_id', schoolId!).order('name')
        );
      }

      const results = await Promise.all(ops);
      setStudents(results[0].data ?? []);
      setScores(results[1].data ?? []);
      if (isAdmin) {
        setTeachers(results[2].data ?? []);
        setClasses(results[3].data ?? []);
      }
      setLoading(false);
    }
    load();
  }, [user, isAdmin]);

  const studentsWithRisk = useMemo(
    () => students.map(s => ({ ...s, risk: analyzeStudent(s.id, scores) })),
    [students, scores]
  );

  const filtered = useMemo(() => {
    return studentsWithRisk.filter(s => {
      const matchSearch = s.name.toLowerCase().includes(search.toLowerCase());
      const matchRisk = filterRisk === 'all' || s.risk.riskLevel === filterRisk;
      const matchTeacher = !isAdmin || filterTeacher === 'all' || s.teacher_id === filterTeacher;
      const matchClass = !isAdmin || filterClass === 'all' || s.class_id === filterClass;
      return matchSearch && matchRisk && matchTeacher && matchClass;
    });
  }, [studentsWithRisk, search, filterRisk, filterTeacher, filterClass, isAdmin]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-7 h-7 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">
          {isAdmin ? 'All Students' : 'Students'}
        </h1>
        <p className="text-slate-500 mt-1">
          {isAdmin
            ? `${students.length} students across all classes and teachers`
            : 'View performance and risk status for your students'}
        </p>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 mb-5">
        <div className="flex flex-wrap gap-3">
          {/* Search */}
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search students..."
              className="w-full border border-slate-200 rounded-xl pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50"
            />
          </div>

          {/* Admin-only filters */}
          {isAdmin && (
            <>
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-slate-400 shrink-0" />
                <select
                  value={filterTeacher}
                  onChange={e => setFilterTeacher(e.target.value)}
                  className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">All Teachers</option>
                  {teachers.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>

              <select
                value={filterClass}
                onChange={e => setFilterClass(e.target.value)}
                className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Classes</option>
                {classes.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </>
          )}

          {/* Risk filter */}
          <div className="flex gap-2">
            {(['all', 'critical', 'at-risk', 'safe'] as const).map(r => (
              <button
                key={r}
                onClick={() => setFilterRisk(r)}
                className={`px-3 py-2 rounded-xl text-xs font-medium transition ${
                  filterRisk === r
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-50 border border-slate-200 text-slate-600 hover:border-slate-300'
                }`}
              >
                {r === 'all' ? 'All' : RISK_LABELS[r]}
              </button>
            ))}
          </div>
        </div>

        {/* Active filter summary */}
        {isAdmin && (filterTeacher !== 'all' || filterClass !== 'all' || filterRisk !== 'all') && (
          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-100">
            <span className="text-xs text-slate-500">Showing {filtered.length} of {students.length} students</span>
            <button
              onClick={() => { setFilterTeacher('all'); setFilterClass('all'); setFilterRisk('all'); setSearch(''); }}
              className="text-xs text-blue-600 hover:text-blue-800 font-medium"
            >
              Clear filters
            </button>
          </div>
        )}
      </div>

      {/* Table */}
      {students.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-12 text-center">
          <Users className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="font-medium text-slate-600">
            {isAdmin ? 'No students in the system yet' : 'No students yet'}
          </p>
          <p className="text-sm text-slate-400 mt-1">
            {isAdmin ? 'Teachers can add students from the Enter Scores page.' : 'Add students from the Enter Scores page.'}
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-slate-400">No students match your filters</div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          {isAdmin && (
            <div className="px-5 py-3 bg-slate-50 border-b border-slate-100 grid grid-cols-12 gap-2 text-xs font-semibold text-slate-500 uppercase tracking-wide">
              <div className="col-span-4">Student</div>
              <div className="col-span-2">Class</div>
              <div className="col-span-2">Teacher</div>
              <div className="col-span-2 text-center">Risk</div>
              <div className="col-span-2 text-right pr-8">Avg</div>
            </div>
          )}
          <div className="divide-y divide-slate-50">
            {filtered.map(s => {
              const colors = getRiskColor(s.risk.riskLevel);
              const teacherName = isAdmin ? teachers.find(t => t.id === s.teacher_id)?.name : null;

              if (isAdmin) {
                return (
                  <button
                    key={s.id}
                    onClick={() => navigate(`/students/${s.id}`)}
                    className="w-full grid grid-cols-12 gap-2 items-center px-5 py-3.5 hover:bg-slate-50 transition text-left group"
                  >
                    <div className="col-span-4 flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
                        <span className="font-bold text-blue-700 text-xs">{s.name.charAt(0).toUpperCase()}</span>
                      </div>
                      <span className="font-semibold text-slate-900 truncate">{s.name}</span>
                    </div>
                    <div className="col-span-2 text-sm text-slate-500 truncate">
                      {(s as any).class?.name ?? '—'}
                    </div>
                    <div className="col-span-2 text-sm text-slate-500 truncate">
                      {teacherName ?? '—'}
                    </div>
                    <div className="col-span-2 flex justify-center gap-1.5">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${colors.badge}`}>
                        {RISK_LABELS[s.risk.riskLevel]}
                      </span>
                    </div>
                    <div className="col-span-2 flex items-center justify-end gap-2">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${getCBCColor(s.risk.cbcLevel)}`}>
                        {s.risk.cbcLevel}
                      </span>
                      <span className="text-sm font-semibold text-slate-700">{s.risk.overallAverage}%</span>
                      <ArrowRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-slate-500 transition shrink-0" />
                    </div>
                  </button>
                );
              }

              return (
                <button
                  key={s.id}
                  onClick={() => navigate(`/students/${s.id}`)}
                  className="w-full flex items-center gap-4 px-5 py-4 hover:bg-slate-50 transition text-left group"
                >
                  <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
                    <span className="font-bold text-blue-700 text-sm">{s.name.charAt(0).toUpperCase()}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-900">{s.name}</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {(s as any).class?.name ?? 'No class'} · {s.risk.overallAverage}% avg
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${colors.badge}`}>
                      {RISK_LABELS[s.risk.riskLevel]}
                    </span>
                    <span className={`text-xs font-bold px-2 py-1 rounded-full ${getCBCColor(s.risk.cbcLevel)}`}>
                      {s.risk.cbcLevel}
                    </span>
                    <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-slate-500 transition" />
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
