import { useEffect, useMemo, useState } from 'react';
import { BarChart2, Filter, Search, X, TrendingUp, FileText, BookOpen, GraduationCap } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { Score, Profile, Class, Subject, Level } from '../../lib/supabase';
import { getCBCColor, getCBCLevel, getCBCSubLevel } from '../../lib/riskEngine';
import { useAuth } from '../../contexts/AuthContext';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';

const TERMS = ['all', 'Term 1', 'Term 2', 'Term 3'];

type EnrichedScore = Score & {
  student?: { id: string; name: string; class_id: string | null };
  teacher?: Profile;
};

export default function AdminResults() {
  const { profile } = useAuth();
  const schoolId = profile?.school_id;

  const [scores, setScores] = useState<EnrichedScore[]>([]);
  const [teachers, setTeachers] = useState<Profile[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [levels, setLevels] = useState<Level[]>([]);

  const [students, setStudents] = useState<any[]>([]);
  
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [filterTeacher, setFilterTeacher] = useState('all');
  const [filterClass, setFilterClass] = useState('all');
  const [filterLevel, setFilterLevel] = useState('all');
  const [filterSubject, setFilterSubject] = useState('all');
  const [filterTerm, setFilterTerm] = useState('all');
  const [activeTab, setActiveTab] = useState<'table' | 'chart'>('table');

  console.log("STUDENTS:", students);

  useEffect(() => { load(); }, [schoolId]);

  async function load() {
    const [scoresRes, teachersRes, classesRes, subjectsRes, levelsRes, studentsRes] = await Promise.all([
      supabase
        .from('scores')
        .select('*, subject:subjects(*), student:students(id, name, class_id)')
        .eq('school_id', schoolId!)
        .order('created_at', { ascending: false }),
      supabase.from('profiles').select('*').eq('role', 'teacher').eq('school_id', schoolId!).order('name'),
      supabase.from('classes').select('*, level:levels(*)').eq('school_id', schoolId!).order('name'),
      supabase.from('subjects').select('*').eq('school_id', schoolId!).order('name'),
      supabase.from('levels').select('*').eq('school_id', schoolId!).order('sort_order'),
      supabas.from('students').select('*') .eq('school_id', schoolId!).order('name')
    ]);

    const teacherMap = new Map((teachersRes.data ?? []).map(t => [t.id, t]));
    const enriched: EnrichedScore[] = (scoresRes.data ?? []).map(s => ({
      ...s,
      teacher: teacherMap.get(s.teacher_id),
    }));

    setScores(enriched);
    setTeachers(teachersRes.data ?? []);
    setClasses(classesRes.data ?? []);
    setSubjects(subjectsRes.data ?? []);
    setLevels(levelsRes.data ?? []);
    setLoading(false);
    setStudents(studentsRes.data ?? []);
  }

  const classMap = useMemo(() => new Map(classes.map(c => [c.id, c])), [classes]);
  const levelMap = useMemo(() => new Map(levels.map(l => [l.id, l])), [levels]);

  // Classes filtered by selected level
  const filteredClassesForSelect = useMemo(() => {
    if (filterLevel === 'all') return classes;
    return classes.filter(c => c.level_id === filterLevel);
  }, [classes, filterLevel]);

  const filtered = useMemo(() => {
    return scores.filter(s => {
      const studentName = (s as any).student?.name ?? '';
      const studentClass = (s as any).student?.class_id ? classMap.get((s as any).student.class_id) : null;
      const matchSearch = !search || studentName.toLowerCase().includes(search.toLowerCase());
      const matchTeacher = filterTeacher === 'all' || s.teacher_id === filterTeacher;
      const matchClass = filterClass === 'all' || (s as any).student?.class_id === filterClass;
      const matchLevel = filterLevel === 'all' || (studentClass?.level_id === filterLevel);
      const matchSubject = filterSubject === 'all' || s.subject_id === filterSubject;
      const matchTerm = filterTerm === 'all' || s.term === filterTerm;
      return matchSearch && matchTeacher && matchClass && matchLevel && matchSubject && matchTerm;
    });
  }, [scores, search, filterTeacher, filterClass, filterLevel, filterSubject, filterTerm, classMap]);

  const summary = useMemo(() => {
    if (filtered.length === 0) return { avg: 0, highest: 0, lowest: 0 };
    const vals = filtered.map(s => s.score);
    return {
      avg: Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10,
      highest: Math.max(...vals),
      lowest: Math.min(...vals),
    };
  }, [filtered]);

  // Subject averages for bar chart
  const subjectChartData = useMemo(() => {
    const map = new Map<string, { name: string; total: number; count: number }>();
    for (const s of filtered) {
      const name = (s as any).subject?.name ?? 'Unknown';
      if (!map.has(name)) map.set(name, { name, total: 0, count: 0 });
      map.get(name)!.total += s.score;
      map.get(name)!.count += 1;
    }
    return Array.from(map.values())
      .map(v => ({ name: v.name, average: Math.round((v.total / v.count) * 10) / 10 }))
      .sort((a, b) => b.average - a.average);
  }, [filtered]);

  const hasFilters = search || filterTeacher !== 'all' || filterClass !== 'all' || filterLevel !== 'all' || filterSubject !== 'all' || filterTerm !== 'all';

  function clearFilters() {
    setSearch('');
    setFilterTeacher('all');
    setFilterClass('all');
    setFilterLevel('all');
    setFilterSubject('all');
    setFilterTerm('all');
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-7 h-7 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const cbcLevel = summary.avg > 0 ? getCBCLevel(summary.avg) : null;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-sm">
            <BarChart2 className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">All Results</h1>
            <p className="text-sm text-slate-500">Every score across all teachers, classes, and subjects</p>
          </div>
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total Entries', value: filtered.length, icon: FileText, color: 'text-blue-600', bg: 'bg-blue-50', sub: `of ${scores.length} total` },
          { label: 'Average Score', value: summary.avg > 0 ? `${summary.avg}%` : '—', icon: TrendingUp, color: 'text-emerald-600', bg: 'bg-emerald-50', sub: cbcLevel ? getCBCSubLevel(summary.avg) : 'no data' },
          { label: 'Score Range', value: filtered.length ? `${summary.lowest}%–${summary.highest}%` : '—', icon: BarChart2, color: 'text-amber-600', bg: 'bg-amber-50', sub: 'lowest to highest' },
          { label: 'Subjects', value: subjectChartData.length, icon: BookOpen, color: 'text-slate-600', bg: 'bg-slate-50', sub: 'with data' },
        ].map(stat => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
              <div className="flex items-start justify-between mb-3">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${stat.bg}`}>
                  <Icon className={`w-5 h-5 ${stat.color}`} />
                </div>
                {stat.label === 'Average Score' && cbcLevel && (
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${getCBCColor(cbcLevel)}`}>
                    {cbcLevel}
                  </span>
                )}
              </div>
              <p className="text-2xl font-bold text-slate-900">{stat.value}</p>
              <p className="text-xs font-medium text-slate-500 mt-0.5">{stat.label}</p>
              <p className="text-[11px] text-slate-400 mt-0.5">{stat.sub}</p>
            </div>
          );
        })}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 mb-5">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex items-center gap-2 text-slate-500">
            <Filter className="w-4 h-4" />
            <span className="text-xs font-semibold uppercase tracking-wide">Filter</span>
          </div>

          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search student..."
              className="w-full border border-slate-200 rounded-xl pl-8 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50"
            />
          </div>

          <select
            value={filterLevel}
            onChange={e => { setFilterLevel(e.target.value); setFilterClass('all'); }}
            className="border border-slate-200 rounded-xl px-3 py-2 text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Levels</option>
            {levels.map(l => (
              <option key={l.id} value={l.id}>
                {l.pathway ? `Senior — ${l.pathway}` : l.name}
              </option>
            ))}
          </select>

          <select
            value={filterClass}
            onChange={e => setFilterClass(e.target.value)}
            className="border border-slate-200 rounded-xl px-3 py-2 text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Classes</option>
            {filteredClassesForSelect.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>

          <select
            value={filterTeacher}
            onChange={e => setFilterTeacher(e.target.value)}
            className="border border-slate-200 rounded-xl px-3 py-2 text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Teachers</option>
            {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>

          <select
            value={filterSubject}
            onChange={e => setFilterSubject(e.target.value)}
            className="border border-slate-200 rounded-xl px-3 py-2 text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Subjects</option>
            {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>

          <select
            value={filterTerm}
            onChange={e => setFilterTerm(e.target.value)}
            className="border border-slate-200 rounded-xl px-3 py-2 text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {TERMS.map(t => <option key={t} value={t}>{t === 'all' ? 'All Terms' : t}</option>)}
          </select>

          {hasFilters && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-red-600 border border-slate-200 hover:border-red-200 hover:bg-red-50 px-3 py-2 rounded-xl transition"
            >
              <X className="w-3.5 h-3.5" />
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Tab selector */}
      {scores.length > 0 && (
        <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit mb-5">
          {(['table', 'chart'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all capitalize ${
                activeTab === tab
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      )}

      {scores.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-14 text-center">
          <BarChart2 className="w-12 h-12 text-slate-200 mx-auto mb-3" />
          <p className="font-semibold text-slate-600">No results recorded yet</p>
          <p className="text-sm text-slate-400 mt-1">Scores entered by teachers will appear here.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-slate-400 text-sm">No results match your filters</div>
      ) : activeTab === 'chart' ? (
        /* Subject averages bar chart */
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
          <p className="text-sm font-semibold text-slate-700 mb-4">Subject Averages</p>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={subjectChartData} margin={{ top: 0, right: 0, left: -20, bottom: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 11, fill: '#64748b' }}
                angle={-35}
                textAnchor="end"
                interval={0}
              />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#94a3b8' }} />
              <Tooltip
                formatter={(val: number) => [`${val}%`, 'Average']}
                contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }}
              />
              <Bar dataKey="average" radius={[6, 6, 0, 0]}>
                {subjectChartData.map((entry, i) => (
                  <Cell
                    key={i}
                    fill={entry.average >= 75 ? '#10b981' : entry.average >= 58 ? '#3b82f6' : entry.average >= 41 ? '#f59e0b' : '#ef4444'}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        /* Table view */
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-5 py-3 bg-slate-50 border-b border-slate-100 grid grid-cols-12 gap-2 text-xs font-semibold text-slate-500 uppercase tracking-wide">
            <div className="col-span-3">Student</div>
            <div className="col-span-2">Class / Level</div>
            <div className="col-span-2">Subject</div>
            <div className="col-span-1 text-center">Score</div>
            <div className="col-span-1 text-center">CBC</div>
            <div className="col-span-1 text-center">Term</div>
            <div className="col-span-2">Teacher</div>
          </div>

          <div className="divide-y divide-slate-50 max-h-[60vh] overflow-y-auto">
            {filtered.map(s => {
              const studentClass = (s as any).student?.class_id ? classMap.get((s as any).student.class_id) : null;
              const classLevel = studentClass?.level_id ? levelMap.get(studentClass.level_id) : null;
              const cbcLevel = getCBCLevel(s.score);
              return (
                <div key={s.id} className="grid grid-cols-12 gap-2 items-center px-5 py-3 hover:bg-slate-50/60 transition">
                  <div className="col-span-3 flex items-center gap-2 min-w-0">
                    <div className="w-6 h-6 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
                      <span className="text-[10px] font-bold text-blue-700">
                        {((s as any).student?.name ?? '?').charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <span className="text-sm font-medium text-slate-900 truncate">
                      {(s as any).student?.name ?? '—'}
                    </span>
                  </div>
                  <div className="col-span-2 min-w-0">
                    <p className="text-sm text-slate-700 truncate">{studentClass?.name ?? '—'}</p>
                    {classLevel && (
                      <p className="text-[10px] text-slate-400 truncate">
                        {classLevel.pathway ? `Senior — ${classLevel.pathway}` : classLevel.name}
                      </p>
                    )}
                  </div>
                  <div className="col-span-2 text-sm text-slate-700 truncate">
                    {(s as any).subject?.name ?? '—'}
                  </div>
                  <div className="col-span-1 text-center">
                    <span className={`text-sm font-bold ${s.score >= 58 ? 'text-emerald-600' : s.score >= 41 ? 'text-amber-600' : 'text-red-600'}`}>
                      {s.score}%
                    </span>
                  </div>
                  <div className="col-span-1 flex justify-center">
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${getCBCColor(cbcLevel)}`}>
                      {getCBCSubLevel(s.score)}
                    </span>
                  </div>
                  <div className="col-span-1 text-xs text-slate-500 text-center">{s.term}</div>
                  <div className="col-span-2 text-xs text-slate-500 truncate">
                    {s.teacher?.name ?? '—'}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="px-5 py-3.5 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
            <p className="text-xs text-slate-500">
              Showing {filtered.length} of {scores.length} entries
            </p>
            {hasFilters && (
              <button onClick={clearFilters} className="text-xs text-blue-600 hover:text-blue-800 font-medium">
                Clear filters
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
