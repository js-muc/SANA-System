import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users,
  TrendingUp,
  AlertTriangle,
  CheckCircle,
  XCircle,
  ArrowRight,
  Plus,
  BookOpen,
  Activity,
  GraduationCap,
  UserCog,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from 'recharts';
import { supabase } from '../lib/supabase';
import type { Student, Score, Profile } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { analyzeStudent, getRiskColor } from '../lib/riskEngine';
import type { StudentRisk } from '../lib/riskEngine';
import { Building2 } from 'lucide-react';

type StudentWithRisk = Student & { risk: StudentRisk };

export default function Dashboard() {
  const { user, profile, school } = useAuth();
  const navigate = useNavigate();
  const isAdmin = profile?.role === 'admin';
  const schoolId = profile?.school_id;

  const [students, setStudents] = useState<Student[]>([]);
  const [scores, setScores] = useState<Score[]>([]);
  const [teachers, setTeachers] = useState<Profile[]>([]);
  const [classCount, setClassCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    async function load() {
      const studentsQ = supabase.from('students').select('*, class:classes(*, level:levels(*))');
      const scoresQ = supabase.from('scores').select('*, subject:subjects(*)');

      if (isAdmin) {
        studentsQ.eq('school_id', schoolId!);
        scoresQ.eq('school_id', schoolId!);
      } else {
        studentsQ.eq('teacher_id', user!.id);
        scoresQ.eq('teacher_id', user!.id);
      }

      const ops: Promise<any>[] = [studentsQ, scoresQ];
      if (isAdmin) {
        ops.push(
          supabase.from('profiles').select('*').eq('role', 'teacher').eq('school_id', schoolId!),
          supabase.from('classes').select('id', { count: 'exact', head: true }).eq('school_id', schoolId!)
        );
      }

      const results = await Promise.all(ops);
      setStudents(results[0].data ?? []);
      setScores(results[1].data ?? []);
      if (isAdmin) {
        setTeachers(results[2].data ?? []);
        setClassCount(results[3].count ?? 0);
      }
      setLoading(false);
    }
    load();
  }, [user, isAdmin]);

  const studentsWithRisk = useMemo<StudentWithRisk[]>(
    () => students.map(s => ({ ...s, risk: analyzeStudent(s.id, scores) })),
    [students, scores]
  );

  const safeStudents = studentsWithRisk.filter(s => s.risk.riskLevel === 'safe');
  const atRiskStudents = studentsWithRisk.filter(s => s.risk.riskLevel === 'at-risk');
  const criticalStudents = studentsWithRisk.filter(s => s.risk.riskLevel === 'critical');
  const overallAvg =
    studentsWithRisk.length > 0
      ? Math.round(studentsWithRisk.reduce((sum, s) => sum + s.risk.overallAverage, 0) / studentsWithRisk.length)
      : 0;

  const subjectAverages = useMemo(() => {
    const map = new Map<string, { name: string; total: number; count: number }>();
    for (const s of scores) {
      const name = (s as any).subject?.name ?? 'Unknown';
      if (!map.has(name)) map.set(name, { name, total: 0, count: 0 });
      map.get(name)!.total += s.score;
      map.get(name)!.count += 1;
    }
    return Array.from(map.values()).map(v => ({
      subject: v.name,
      average: Math.round((v.total / v.count) * 10) / 10,
    }));
  }, [scores]);

  const trendData = useMemo(() => {
    const byDate = new Map<string, number[]>();
    for (const s of scores) {
      const d = new Date(s.created_at);
      const key = `${d.getMonth() + 1}/${d.getDate()}`;
      if (!byDate.has(key)) byDate.set(key, []);
      byDate.get(key)!.push(s.score);
    }
    return Array.from(byDate.entries())
      .slice(-8)
      .map(([date, vals]) => ({
        date,
        average: Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10,
      }));
  }, [scores]);

  const greeting = new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening';

  const stats = isAdmin
    ? [
        { label: 'Total Students', value: students.length, icon: Users, iconBg: 'bg-blue-100', iconColor: 'text-blue-600' },
        { label: 'Total Classes', value: classCount, icon: GraduationCap, iconBg: 'bg-emerald-100', iconColor: 'text-emerald-600' },
        { label: 'Active Teachers', value: teachers.length, icon: UserCog, iconBg: 'bg-slate-100', iconColor: 'text-slate-600' },
        { label: 'School Average', value: `${overallAvg}%`, icon: TrendingUp, iconBg: 'bg-amber-100', iconColor: 'text-amber-600' },
      ]
    : [
        { label: 'Total Students', value: students.length, icon: Users, iconBg: 'bg-blue-100', iconColor: 'text-blue-600' },
        { label: 'Class Average', value: `${overallAvg}%`, icon: TrendingUp, iconBg: 'bg-emerald-100', iconColor: 'text-emerald-600' },
        { label: 'At Risk', value: atRiskStudents.length, icon: AlertTriangle, iconBg: 'bg-amber-100', iconColor: 'text-amber-600' },
        { label: 'Critical', value: criticalStudents.length, icon: XCircle, iconBg: 'bg-red-100', iconColor: 'text-red-600' },
      ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-64">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-slate-500">Loading intelligence data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <div className="flex items-center gap-2 mb-1">
            {school && (
              <span className="flex items-center gap-1.5 text-xs font-semibold bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full">
                <Building2 className="w-3 h-3" />
                {school.name}
              </span>
            )}
            {isAdmin && (
              <span className="text-xs font-semibold bg-blue-100 text-blue-700 px-2.5 py-1 rounded-full uppercase tracking-wide">
                School Overview
              </span>
            )}
          </div>
          <h1 className="text-2xl font-bold text-slate-900">
            Good {greeting}, {profile?.name?.split(' ')[0] ?? (isAdmin ? 'Admin' : 'Teacher')}
          </h1>
          <p className="text-slate-500 mt-1">
            {isAdmin
              ? `Monitoring ${students.length} students across ${classCount} classes and ${teachers.length} teachers.`
              : criticalStudents.length > 0
              ? `${criticalStudents.length} student${criticalStudents.length > 1 ? 's' : ''} need${criticalStudents.length === 1 ? 's' : ''} your immediate attention.`
              : students.length === 0
              ? 'Start by adding students and entering scores.'
              : 'All students are within acceptable performance ranges.'}
          </p>
        </div>
        {!isAdmin && (
          <button
            onClick={() => navigate('/scores')}
            className="hidden sm:flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-all shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Enter Scores
          </button>
        )}
        {isAdmin && (
          <div className="hidden sm:flex gap-2">
            <button
              onClick={() => navigate('/admin/results')}
              className="flex items-center gap-2 border border-slate-200 hover:border-blue-300 hover:bg-blue-50 text-slate-700 text-sm font-medium px-4 py-2.5 rounded-xl transition"
            >
              View Results
            </button>
            <button
              onClick={() => navigate('/admin/teachers')}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition shadow-sm"
            >
              <UserCog className="w-4 h-4" />
              Teachers
            </button>
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {stats.map(stat => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-3 ${stat.iconBg}`}>
                <Icon className={`w-4 h-4 ${stat.iconColor}`} />
              </div>
              <p className="text-2xl font-bold text-slate-900">{stat.value}</p>
              <p className="text-sm text-slate-500 mt-0.5">{stat.label}</p>
            </div>
          );
        })}
      </div>

      {/* Admin: risk summary row */}
      {isAdmin && studentsWithRisk.length > 0 && (
        <div className="grid grid-cols-3 gap-4 mb-8">
          {([
            { label: 'Critical', count: criticalStudents.length, color: 'bg-red-50 border-red-100', text: 'text-red-700', dot: 'bg-red-500', icon: XCircle },
            { label: 'At Risk', count: atRiskStudents.length, color: 'bg-amber-50 border-amber-100', text: 'text-amber-700', dot: 'bg-amber-500', icon: AlertTriangle },
            { label: 'Safe', count: safeStudents.length, color: 'bg-emerald-50 border-emerald-100', text: 'text-emerald-700', dot: 'bg-emerald-500', icon: CheckCircle },
          ] as const).map(item => {
            const Icon = item.icon;
            return (
              <div key={item.label} className={`rounded-2xl border p-5 flex items-center gap-4 ${item.color}`}>
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center bg-white shadow-sm`}>
                  <Icon className={`w-5 h-5 ${item.text}`} />
                </div>
                <div>
                  <p className={`text-2xl font-bold ${item.text}`}>{item.count}</p>
                  <p className={`text-sm font-medium ${item.text} opacity-80`}>{item.label}</p>
                </div>
                <div className="ml-auto text-right">
                  <p className={`text-xs font-medium ${item.text} opacity-60`}>
                    {studentsWithRisk.length > 0 ? Math.round((item.count / studentsWithRisk.length) * 100) : 0}%
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Charts */}
      {scores.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
          <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <Activity className="w-4 h-4 text-blue-500" />
              <h3 className="font-semibold text-slate-900 text-sm">
                {isAdmin ? 'School Performance Trend' : 'Class Performance Trend'}
              </h3>
            </div>
            {trendData.length >= 2 ? (
              <ResponsiveContainer width="100%" height={160}>
                <AreaChart data={trendData}>
                  <defs>
                    <linearGradient id="colorAvg" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} />
                  <Tooltip
                    contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }}
                    formatter={(v: number) => [`${v}%`, 'Average']}
                  />
                  <Area type="monotone" dataKey="average" stroke="#3b82f6" strokeWidth={2} fill="url(#colorAvg)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-40 flex items-center justify-center text-slate-400 text-sm">More data needed to show trend</div>
            )}
          </div>

          <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <BookOpen className="w-4 h-4 text-blue-500" />
              <h3 className="font-semibold text-slate-900 text-sm">Subject Averages</h3>
            </div>
            {subjectAverages.length > 0 ? (
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={subjectAverages} barSize={28}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="subject" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} />
                  <Tooltip
                    contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }}
                    formatter={(v: number) => [`${v}%`, 'Average']}
                  />
                  <Bar dataKey="average" fill="#3b82f6" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-40 flex items-center justify-center text-slate-400 text-sm">No subject data yet</div>
            )}
          </div>
        </div>
      )}

      {/* Student risk lists */}
      {students.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-12 text-center">
          <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Users className="w-7 h-7 text-slate-400" />
          </div>
          <h3 className="font-semibold text-slate-900 mb-2">
            {isAdmin ? 'No students in the system yet' : 'No students yet'}
          </h3>
          <p className="text-slate-500 text-sm mb-6">
            {isAdmin
              ? 'Teachers can add students from the Enter Scores page.'
              : 'Go to Enter Scores to add your students and start tracking performance.'}
          </p>
          {!isAdmin && (
            <button
              onClick={() => navigate('/scores')}
              className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-5 py-2.5 rounded-xl transition"
            >
              Get Started
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <StudentList title="Critical" icon={XCircle} students={criticalStudents} riskLevel="critical" onNavigate={navigate} showTeacher={isAdmin} />
          <StudentList title="At Risk" icon={AlertTriangle} students={atRiskStudents} riskLevel="at-risk" onNavigate={navigate} showTeacher={isAdmin} />
          <StudentList title="Safe" icon={CheckCircle} students={safeStudents} riskLevel="safe" onNavigate={navigate} showTeacher={isAdmin} />
        </div>
      )}
    </div>
  );
}

function StudentList({
  title,
  icon: Icon,
  students,
  riskLevel,
  onNavigate,
  showTeacher,
}: {
  title: string;
  icon: React.ElementType;
  students: StudentWithRisk[];
  riskLevel: 'safe' | 'at-risk' | 'critical';
  onNavigate: (path: string) => void;
  showTeacher: boolean;
}) {
  const colors = getRiskColor(riskLevel);

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <div className={`flex items-center gap-2 px-5 py-4 border-b ${colors.border} ${colors.bg}`}>
        <Icon className={`w-4 h-4 ${colors.text}`} />
        <span className={`font-semibold text-sm ${colors.text}`}>{title}</span>
        <span className={`ml-auto text-xs font-bold px-2 py-0.5 rounded-full ${colors.badge}`}>
          {students.length}
        </span>
      </div>
      <div className="divide-y divide-slate-50">
        {students.length === 0 ? (
          <p className="px-5 py-6 text-center text-slate-400 text-sm">No students in this category</p>
        ) : (
          students.slice(0, 5).map(s => (
            <button
              key={s.id}
              onClick={() => onNavigate(`/students/${s.id}`)}
              className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-slate-50 transition text-left group"
            >
              <div className={`w-2 h-2 rounded-full shrink-0 ${colors.dot}`} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-900 truncate">{s.name}</p>
                <p className="text-xs text-slate-400 truncate">
                  {s.risk.overallAverage}% avg
                  {showTeacher && (s as any).class?.name ? ` · ${(s as any).class.name}` : ''}
                </p>
              </div>
              <ArrowRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-slate-500 shrink-0 transition" />
            </button>
          ))
        )}
        {students.length > 5 && (
          <p className="px-5 py-2.5 text-xs text-slate-400 text-center">+{students.length - 5} more</p>
        )}
      </div>
    </div>
  );
}
