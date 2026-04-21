import { useEffect, useMemo, useState } from 'react';
import { BarChart2, Filter, Search, X, TrendingUp, FileText } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { Score, Profile, Class, Subject } from '../../lib/supabase';
import { getCBCColor, getCBCLevel } from '../../lib/riskEngine';

const TERMS = ['all', 'Term 1', 'Term 2', 'Term 3'];

type EnrichedScore = Score & {
  student?: { id: string; name: string; class_id: string | null };
  teacher?: Profile;
};

export default function AdminResults() {
  const [scores, setScores] = useState<EnrichedScore[]>([]);
  const [teachers, setTeachers] = useState<Profile[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [filterTeacher, setFilterTeacher] = useState('all');
  const [filterClass, setFilterClass] = useState('all');
  const [filterSubject, setFilterSubject] = useState('all');
  const [filterTerm, setFilterTerm] = useState('all');

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const [scoresRes, teachersRes, classesRes, subjectsRes] = await Promise.all([
      supabase
        .from('scores')
        .select('*, subject:subjects(*), student:students(id, name, class_id)')
        .order('created_at', { ascending: false }),
      supabase.from('profiles').select('*').eq('role', 'teacher').order('name'),
      supabase.from('classes').select('*, level:levels(*)').order('name'),
      supabase.from('subjects').select('*').order('name'),
    ]);

    // Attach teacher profile to each score
    const teacherMap = new Map((teachersRes.data ?? []).map(t => [t.id, t]));
    const enriched: EnrichedScore[] = (scoresRes.data ?? []).map(s => ({
      ...s,
      teacher: teacherMap.get(s.teacher_id),
    }));

    setScores(enriched);
    setTeachers(teachersRes.data ?? []);
    setClasses(classesRes.data ?? []);
    setSubjects(subjectsRes.data ?? []);
    setLoading(false);
  }

  const classMap = useMemo(() => new Map(classes.map(c => [c.id, c])), [classes]);

  const filtered = useMemo(() => {
    return scores.filter(s => {
      const studentName = (s as any).student?.name ?? '';
      const matchSearch = !search || studentName.toLowerCase().includes(search.toLowerCase());
      const matchTeacher = filterTeacher === 'all' || s.teacher_id === filterTeacher;
      const matchClass = filterClass === 'all' || (s as any).student?.class_id === filterClass;
      const matchSubject = filterSubject === 'all' || s.subject_id === filterSubject;
      const matchTerm = filterTerm === 'all' || s.term === filterTerm;
      return matchSearch && matchTeacher && matchClass && matchSubject && matchTerm;
    });
  }, [scores, search, filterTeacher, filterClass, filterSubject, filterTerm]);

  const summary = useMemo(() => {
    if (filtered.length === 0) return { avg: 0, highest: 0, lowest: 0 };
    const vals = filtered.map(s => s.score);
    return {
      avg: Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10,
      highest: Math.max(...vals),
      lowest: Math.min(...vals),
    };
  }, [filtered]);

  const hasFilters = search || filterTeacher !== 'all' || filterClass !== 'all' || filterSubject !== 'all' || filterTerm !== 'all';

  function clearFilters() {
    setSearch('');
    setFilterTeacher('all');
    setFilterClass('all');
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

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
            <BarChart2 className="w-4 h-4 text-blue-600" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">All Results</h1>
        </div>
        <p className="text-slate-500 ml-11">
          Every score entered across all teachers, classes, and subjects
        </p>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-4 mb-5">
        {[
          { label: 'Total Entries', value: filtered.length, icon: FileText, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'Average Score', value: `${summary.avg}%`, icon: TrendingUp, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'Score Range', value: filtered.length ? `${summary.lowest}% – ${summary.highest}%` : '—', icon: BarChart2, color: 'text-amber-600', bg: 'bg-amber-50' },
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
              placeholder="Search student name..."
              className="w-full border border-slate-200 rounded-xl pl-8 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50"
            />
          </div>

          <select
            value={filterTeacher}
            onChange={e => setFilterTeacher(e.target.value)}
            className="border border-slate-200 rounded-xl px-3 py-2 text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Teachers</option>
            {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>

          <select
            value={filterClass}
            onChange={e => setFilterClass(e.target.value)}
            className="border border-slate-200 rounded-xl px-3 py-2 text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Classes</option>
            {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
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

      {/* Results table */}
      {scores.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-12 text-center">
          <BarChart2 className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="font-medium text-slate-600">No results recorded yet</p>
          <p className="text-sm text-slate-400 mt-1">Scores entered by teachers will appear here.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-slate-400">No results match your filters</div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-5 py-3 bg-slate-50 border-b border-slate-100 grid grid-cols-12 gap-2 text-xs font-semibold text-slate-500 uppercase tracking-wide">
            <div className="col-span-3">Student</div>
            <div className="col-span-2">Class</div>
            <div className="col-span-2">Subject</div>
            <div className="col-span-1 text-center">Score</div>
            <div className="col-span-1 text-center">CBC</div>
            <div className="col-span-1 text-center">Term</div>
            <div className="col-span-2">Teacher</div>
          </div>

          <div className="divide-y divide-slate-50 max-h-[60vh] overflow-y-auto">
            {filtered.map(s => {
              const studentClass = (s as any).student?.class_id ? classMap.get((s as any).student.class_id) : null;
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
                  <div className="col-span-2 text-sm text-slate-500 truncate">
                    {studentClass?.name ?? '—'}
                  </div>
                  <div className="col-span-2 text-sm text-slate-700 truncate">
                    {(s as any).subject?.name ?? '—'}
                  </div>
                  <div className="col-span-1 text-center">
                    <span className={`text-sm font-bold ${s.score >= 60 ? 'text-emerald-600' : s.score >= 40 ? 'text-amber-600' : 'text-red-600'}`}>
                      {s.score}%
                    </span>
                  </div>
                  <div className="col-span-1 flex justify-center">
                    <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${getCBCColor(cbcLevel)}`}>
                      {cbcLevel}
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

          <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
            <p className="text-xs text-slate-500">
              Showing {filtered.length} of {scores.length} entries
            </p>
            {hasFilters && (
              <button onClick={clearFilters} className="text-xs text-blue-600 hover:text-blue-800 font-medium">
                Clear all filters
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
