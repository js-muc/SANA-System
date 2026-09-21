import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  TrendingUp,
  TrendingDown,
  Minus,
  Lightbulb,
  Target,
  BookOpen,
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  Radar,
} from 'recharts';
import { supabase } from '../lib/supabase';
import type { Student, Score } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { analyzeStudent, getRiskColor, getCBCColor, getCBCSubLevel } from '../lib/riskEngine';
import type { SubjectPerformance } from '../lib/riskEngine';


const RISK_LABELS = { safe: 'Safe', 'at-risk': 'At Risk', critical: 'Critical' };
const Terms =['Term 1', 'Term 2', 'Term 3'];
const CURRENT_YEAR = new Date().getFullYear().toString();

function TrendIcon({ trend }: { trend: SubjectPerformance['trend'] }) {
  if (trend === 'improving') return <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />;
  if (trend === 'declining') return <TrendingDown className="w-3.5 h-3.5 text-red-500" />;
  return <Minus className="w-3.5 h-3.5 text-slate-400" />;
}

export default function StudentProfile() {
  const { id } = useParams<{ id: string }>();
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const isAdmin = profile?.role === 'admin';

  const [student, setStudent] = useState<Student | null>(null);
  const [scores, setScores] = useState<Score[]>([]);
  const [loading, setLoading] = useState(true);
  const [historyTerm, setHistoryTerm] = useState('Term 1');
  const [historyYear, setHistoryYear] = useState(CURRENT_YEAR);
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState({
    parent_name: '', parent_email: '', parent_whatsapp: '', religion: '',
    year_of_birth: '', admission_number: '', assessment_number: '',
  });
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState('');
  
  useEffect(() => {
    if (!student) return;
    setProfileForm({
      parent_name: student.parent_name ?? '',
      parent_email: student.parent_email ?? '',
      parent_whatsapp: student.parent_whatsapp ?? '',
      religion: student.religion ?? '',
      year_of_birth: student.year_of_birth?.toString() ?? '',
      admission_number: student.admission_number ?? '',
      assessment_number: student.assessment_number ?? '',
    });
  }, [student]);


  async function handleSaveProfile() {
    if (!student) return;
    setProfileError('');

    let yearNum: number | null = null;
    if (profileForm.year_of_birth.trim() !== '') {
      yearNum = parseInt(profileForm.year_of_birth, 10);
      if (isNaN(yearNum) || yearNum < 1990 || yearNum > new Date().getFullYear()) {
        setProfileError('Year of birth looks invalid.');
        return;
      }
    }

    setSavingProfile(true);

    const updates = {
      parent_name: profileForm.parent_name.trim() || null,
      parent_email: profileForm.parent_email.trim(),
      parent_whatsapp: profileForm.parent_whatsapp.trim() || null,
      religion: profileForm.religion.trim() || null,
      year_of_birth: yearNum,
      admission_number: profileForm.admission_number.trim() || null,
      assessment_number: profileForm.assessment_number.trim() || null,
    };

    const { error } = await supabase.from('students').update(updates).eq('id', student.id);
    setSavingProfile(false);

    if (error) {
      setProfileError(error.message);
      return;
    }

    setStudent({ ...student, ...updates } as Student);
    setEditingProfile(false);
  }

  



  useEffect(() => {
    if (!user || !id) return;



    async function load() {
      const studentQ = supabase.from('students').select('*, class:classes(*)').eq('id', id!);
      const scoresQ = supabase.from('scores').select('*, subject:subjects(*)').eq('student_id', id!).order('created_at');
      if (!isAdmin) {
        studentQ.eq('teacher_id', user!.id);
        scoresQ.eq('teacher_id', user!.id);
      }
      const [studentRes, scoresRes] = await Promise.all([studentQ.maybeSingle(), scoresQ]);
      setStudent(studentRes.data);
      setScores(scoresRes.data ?? []);
      setLoading(false);
    }
    load();
  }, [user, id]);

  

  const risk = useMemo(() => id ? analyzeStudent(id, scores) : null, [id, scores]);

  // Per-subject trend lines
  const subjectTrendData = useMemo(() => {
    if (!risk) return [];
    return risk.subjectPerformances.map(sp => ({
      name: sp.subjectName,
      data: sp.scores.map((s, i) => ({ entry: `#${i + 1}`, score: s })),
    }));
  }, [risk]);

    // Which years actually have data, for the Year selector's options
  const availableYears = useMemo(() => {
    const years = Array.from(new Set(scores.map(s => s.year))).sort();
    return years.length > 0 ? years : [CURRENT_YEAR];
  }, [scores]);

  // Scores filtered down to just the term+year currently selected in Score History
  const historyScores = useMemo(
    () => scores.filter(s => s.term === historyTerm && s.year === historyYear),
    [scores, historyTerm, historyYear],
  );

  // The distinct subjects and assessment names present in that filtered set —
  // these become the pivot table's rows and columns
  const historySubjects = useMemo(() => {
    const map = new Map<string, string>(); // subjectId → subjectName
    for (const s of historyScores) {
      map.set(s.subject_id, (s as any).subject?.name ?? 'Unknown');
    }
    return Array.from(map.entries()); // [ [subjectId, subjectName], ... ]
  }, [historyScores]);

  const historyAssessments = useMemo(() => {
    // Sort by the earliest created_at seen for each assessment name, so
    // "CAT 1" appears before "CAT 2" in chronological order rather than
    // alphabetically (which would coincidentally work for these two names,
    // but not for e.g. "Opener" vs "End Term").
    const firstSeen = new Map<string, string>(); // assessmentName → earliest created_at
    for (const s of historyScores) {
      const existing = firstSeen.get(s.assessment);
      if (!existing || s.created_at < existing) {
        firstSeen.set(s.assessment, s.created_at);
      }
    }
    return Array.from(firstSeen.keys()).sort(
      (a, b) => (firstSeen.get(a)! < firstSeen.get(b)! ? -1 : 1)
    );
  }, [historyScores]);

  // Quick lookup: given a subjectId and an assessment name, find that cell's score
  const historyCell = (subjectId: string, assessment: string) =>
    historyScores.find(s => s.subject_id === subjectId && s.assessment === assessment);

  // Radar data
  const radarData = useMemo(() =>
    risk?.subjectPerformances.map(sp => ({
      subject: sp.subjectName.slice(0, 4),
      score: sp.average,
    })) ?? [],
    [risk]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-7 h-7 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!student || !risk) {
    return (
      <div className="p-6 text-center text-slate-500">Student not found.</div>
    );
  }

  const colors = getRiskColor(risk.riskLevel);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Back */}
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900 transition mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Back
      </button>

      {/* Student header */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 mb-5">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-2xl bg-blue-100 flex items-center justify-center shrink-0">
            <span className="text-2xl font-bold text-blue-700">{student.name.charAt(0).toUpperCase()}</span>
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-slate-900">{student.name}</h1>
            <p className="text-slate-500 text-sm mt-0.5">{(student as any).class?.name ?? 'No class assigned'}</p>
            <div className="flex flex-wrap items-center gap-2 mt-3">
              <span className={`text-xs font-semibold px-3 py-1.5 rounded-full ${colors.badge}`}>
                {RISK_LABELS[risk.riskLevel]}
              </span>
              <span className={`text-xs font-bold px-3 py-1.5 rounded-full ${getCBCColor(risk.cbcLevel)}`}>
                CBC: {risk.cbcLevel}
              </span>
              <span className="text-xs text-slate-500 px-3 py-1.5 bg-slate-100 rounded-full">
                Overall: {risk.overallAverage}%
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Learner Profile */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 mb-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-sm text-slate-900">Learner Profile</h3>
          {!editingProfile ? (
            <button onClick={() => setEditingProfile(true)} className="text-xs font-medium text-blue-700 hover:underline">
              Edit
            </button>
          ) : (
            <div className="flex items-center gap-3">
              <button onClick={() => { setEditingProfile(false); setProfileError(''); }} className="text-xs font-medium text-slate-500 hover:underline">
                Cancel
              </button>
              <button
                onClick={handleSaveProfile}
                disabled={savingProfile}
                className="text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 px-3 py-1.5 rounded-lg disabled:opacity-50"
              >
                {savingProfile ? 'Saving...' : 'Save'}
              </button>
            </div>
          )}
        </div>

        {profileError && <p className="text-xs text-red-600 mb-3">{profileError}</p>}

        {!editingProfile ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
            <div><p className="text-xs text-slate-400 mb-0.5">Parent/Guardian Name</p><p className="text-slate-900">{student.parent_name || '—'}</p></div>
            <div><p className="text-xs text-slate-400 mb-0.5">Parent Email</p><p className="text-slate-900">{student.parent_email || '—'}</p></div>
            <div><p className="text-xs text-slate-400 mb-0.5">Parent WhatsApp</p><p className="text-slate-900">{student.parent_whatsapp || '—'}</p></div>
            <div><p className="text-xs text-slate-400 mb-0.5">Religion</p><p className="text-slate-900">{student.religion || '—'}</p></div>
            <div><p className="text-xs text-slate-400 mb-0.5">Year of Birth</p><p className="text-slate-900">{student.year_of_birth ?? '—'}</p></div>
            <div><p className="text-xs text-slate-400 mb-0.5">Admission No.</p><p className="text-slate-900">{student.admission_number || '—'}</p></div>
            <div><p className="text-xs text-slate-400 mb-0.5">Assessment No.</p><p className="text-slate-900">{student.assessment_number || '—'}</p></div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Parent/Guardian Name</label>
              <input value={profileForm.parent_name} onChange={e => setProfileForm(f => ({ ...f, parent_name: e.target.value }))} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Parent Email</label>
              <input type="email" value={profileForm.parent_email} onChange={e => setProfileForm(f => ({ ...f, parent_email: e.target.value }))} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Parent WhatsApp Number</label>
              <input value={profileForm.parent_whatsapp} onChange={e => setProfileForm(f => ({ ...f, parent_whatsapp: e.target.value }))} placeholder="+254 7XX XXX XXX" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Religion</label>
              <input value={profileForm.religion} onChange={e => setProfileForm(f => ({ ...f, religion: e.target.value }))} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Year of Birth</label>
              <input value={profileForm.year_of_birth} onChange={e => setProfileForm(f => ({ ...f, year_of_birth: e.target.value }))} placeholder="e.g. 2015" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Admission Number</label>
              <input value={profileForm.admission_number} onChange={e => setProfileForm(f => ({ ...f, admission_number: e.target.value }))} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Assessment Number</label>
              <input value={profileForm.assessment_number} onChange={e => setProfileForm(f => ({ ...f, assessment_number: e.target.value }))} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>
        )}
      </div>

      {/* AI Insights */}
      <div className={`rounded-2xl border p-5 mb-5 ${colors.bg} ${colors.border}`}>
        <div className={`flex items-center gap-2 mb-3 ${colors.text}`}>
          <Lightbulb className="w-4 h-4" />
          <h3 className="font-semibold text-sm">AI Insights</h3>
        </div>
        <ul className="space-y-2">
          {risk.reasons.map((r, i) => (
            <li key={i} className="flex items-start gap-2">
              <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${colors.dot}`} />
              <p className="text-sm text-slate-700">{r}</p>
            </li>
          ))}
        </ul>
      </div>

      {/* Suggested actions */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 mb-5">
        <div className="flex items-center gap-2 mb-4">
          <Target className="w-4 h-4 text-blue-500" />
          <h3 className="font-semibold text-sm text-slate-900">Suggested Actions</h3>
        </div>
        <ul className="space-y-2">
          {risk.suggestedActions.map((a, i) => (
            <li key={i} className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-lg bg-blue-50 flex items-center justify-center shrink-0 mt-0.5">
                <span className="text-xs font-bold text-blue-600">{i + 1}</span>
              </div>
              <p className="text-sm text-slate-700 pt-1">{a}</p>
            </li>
          ))}
        </ul>
      </div>

      {/* Subject performances */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 mb-5">
        <div className="flex items-center gap-2 mb-4">
          <BookOpen className="w-4 h-4 text-blue-500" />
          <h3 className="font-semibold text-sm text-slate-900">Subject Performance</h3>
        </div>
        {risk.subjectPerformances.length === 0 ? (
          <p className="text-slate-400 text-sm">No scores recorded yet.</p>
        ) : (
          <div className="space-y-3">
            {risk.subjectPerformances.map(sp => (
              <div key={sp.subjectId}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-900">{sp.subjectName}</span>
                    <TrendIcon trend={sp.trend} />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${getCBCColor(sp.cbcLevel)}`}>
                      {sp.cbcLevel}
                    </span>
                    <span className="text-sm font-semibold text-slate-700">{sp.average}%</span>
                  </div>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all ${
                      sp.average >= 80 ? 'bg-emerald-500' :
                      sp.average >= 60 ? 'bg-blue-500' :
                      sp.average >= 40 ? 'bg-amber-500' : 'bg-red-500'
                    }`}
                    style={{ width: `${sp.average}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Charts */}
      {subjectTrendData.length > 0 && subjectTrendData.some(s => s.data.length >= 2) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Radar */}
          {radarData.length >= 3 && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
              <h3 className="font-semibold text-sm text-slate-900 mb-4">Subject Overview</h3>
              <ResponsiveContainer width="100%" height={220}>
                <RadarChart data={radarData}>
                  <PolarGrid stroke="#e2e8f0" />
                  <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11, fill: '#64748b' }} />
                  <Radar name="Score" dataKey="score" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.15} strokeWidth={2} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Trend per subject */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
            <h3 className="font-semibold text-sm text-slate-900 mb-4">Performance Trend</h3>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="entry" allowDuplicatedCategory={false} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }} />
                {subjectTrendData
                  .filter(s => s.data.length >= 2)
                  .map((s, i) => {
                    const palette = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];
                    return (
                      <Line
                        key={s.name}
                        dataKey="score"
                        data={s.data}
                        name={s.name}
                        stroke={palette[i % palette.length]}
                        strokeWidth={2}
                        dot={{ r: 3 }}
                        type="monotone"
                      />
                    );
                  })}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}


      {/* Score history */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm mt-4 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-semibold text-sm text-slate-900">Score History</h3>
          <div className="flex items-center gap-2">
            <select
              value={historyYear}
              onChange={e => setHistoryYear(e.target.value)}
              className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-medium bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <div className="flex rounded-lg border border-slate-200 overflow-hidden">
              {Terms.map(t => (
                <button
                  key={t}
                  onClick={() => setHistoryTerm(t)}
                  className={`px-3 py-1.5 text-xs font-semibold transition ${
                    historyTerm === t
                      ? 'bg-blue-700 text-white'
                      : 'bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        </div>

        {historySubjects.length === 0 || historyAssessments.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-slate-400">
            No scores recorded for {historyTerm}, {historyYear}.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="text-left px-5 py-3 font-semibold text-slate-600">Subject</th>
                  {historyAssessments.map(a => (
                    <th key={a} className="text-center px-5 py-3 font-semibold text-slate-600">{a}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {historySubjects.map(([subjectId, subjectName]) => (
                  <tr key={subjectId} className="hover:bg-slate-50/50">
                    <td className="px-5 py-3 text-slate-900 font-medium">{subjectName}</td>
                    {historyAssessments.map(a => {
                      const cell = historyCell(subjectId, a);
                      return (
                        <td key={a} className="px-5 py-3 text-center">
                          {cell ? (
                            <span>
                              <span className="font-semibold text-slate-900">{cell.score}%</span>
                              <span className="text-slate-400 text-xs ml-1">
                                ({getCBCSubLevel(cell.score)})
                              </span>
                            </span>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      
    </div>
  );
}
