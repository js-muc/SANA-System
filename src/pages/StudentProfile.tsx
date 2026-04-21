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
import { analyzeStudent, getRiskColor, getCBCColor } from '../lib/riskEngine';
import type { SubjectPerformance } from '../lib/riskEngine';

const RISK_LABELS = { safe: 'Safe', 'at-risk': 'At Risk', critical: 'Critical' };

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
      {scores.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm mt-4 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <h3 className="font-semibold text-sm text-slate-900">Score History</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="text-left px-5 py-3 font-semibold text-slate-600">Subject</th>
                  <th className="text-left px-5 py-3 font-semibold text-slate-600">Score</th>
                  <th className="text-left px-5 py-3 font-semibold text-slate-600">CBC Level</th>
                  <th className="text-left px-5 py-3 font-semibold text-slate-600">Term</th>
                  <th className="text-left px-5 py-3 font-semibold text-slate-600">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {scores.map(s => {
                  const sp = risk.subjectPerformances.find(sp => sp.subjectId === s.subject_id);
                  return (
                    <tr key={s.id} className="hover:bg-slate-50/50">
                      <td className="px-5 py-3 text-slate-900">{(s as any).subject?.name ?? '—'}</td>
                      <td className="px-5 py-3 font-semibold text-slate-900">{s.score}%</td>
                      <td className="px-5 py-3">
                        {sp && (
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${getCBCColor(sp.cbcLevel)}`}>
                            {sp.cbcLevel}
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-slate-500">{s.term}</td>
                      <td className="px-5 py-3 text-slate-400">
                        {new Date(s.created_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
