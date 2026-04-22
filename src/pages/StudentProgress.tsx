// StudentProgress.tsx — Teacher competency tracking (Tracking Progress)
//
// Flow:
//   1. Teacher selects a student
//   2. Selects a learning area (subject)
//   3. Selects a strand
//   4. Selects a sub-strand
//   5. Enters a CBC score + competency level for a term
//   6. Generates AI comment (teacher-facing + parent-facing)
//   7. Saves to DB — retrievable at any time
//   8. "Notify Parent" button scaffold (ready for future email integration)

import {
  useEffect, useState, useCallback, useMemo, useRef,
} from 'react';
import {
  Brain, Search, Sparkles, Save, TrendingUp, TrendingDown,
  Minus, AlertTriangle, CheckCircle2, BookOpen, Layers, Atom,
  User, RotateCcw, ChevronRight, ChevronDown, Mail, Info,
  History, FileText, BadgeCheck, ArrowRight,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import type {
  Student, Subject, Strand, SubStrand, CompetencyAssessment,
} from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { getCBCLevel, getCBCColor } from '../lib/riskEngine';
import { generateComment, generateTrendInsight } from '../lib/aiClient';

// ── Constants ────────────────────────────────────────────────────────────────

const TERMS = ['Term 1', 'Term 2', 'Term 3'] as const;
type Term = typeof TERMS[number];

const CBC_META = {
  EE: { label: 'Exceeding Expectations', short: 'Exceeding', color: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  ME: { label: 'Meeting Expectations',   short: 'Meeting',   color: 'bg-blue-100 text-blue-800 border-blue-200' },
  AE: { label: 'Approaching Expectations', short: 'Approaching', color: 'bg-amber-100 text-amber-800 border-amber-200' },
  BE: { label: 'Below Expectations',     short: 'Below',     color: 'bg-red-100 text-red-800 border-red-200' },
} as const;

type CBCLevel = 'EE' | 'ME' | 'AE' | 'BE';

// ── Helpers ───────────────────────────────────────────────────────────────────

function computeTrend(scores: number[]): 'improving' | 'stable' | 'declining' {
  if (scores.length < 2) return 'stable';
  const recent = scores.slice(-3);
  const diff = recent[recent.length - 1] - recent[0];
  if (diff > 5) return 'improving';
  if (diff < -5) return 'declining';
  return 'stable';
}

function TrendBadge({ trend }: { trend: 'improving' | 'stable' | 'declining' }) {
  if (trend === 'improving')
    return <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700"><TrendingUp className="w-3 h-3" />Improving</span>;
  if (trend === 'declining')
    return <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-red-100 text-red-700"><TrendingDown className="w-3 h-3" />Declining</span>;
  return <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600"><Minus className="w-3 h-3" />Stable</span>;
}

function CBCBadge({ level }: { level: CBCLevel }) {
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-0.5 rounded-full border ${CBC_META[level].color}`}>
      <BadgeCheck className="w-3 h-3" />
      {level} — {CBC_META[level].short}
    </span>
  );
}

// ── Panel wrapper ─────────────────────────────────────────────────────────────

function Panel({
  step, totalSteps, label, icon: Icon, selected, onReset, locked, children,
}: {
  step: number;
  totalSteps: number;
  label: string;
  icon: React.ElementType;
  selected?: string;
  onReset?: () => void;
  locked?: boolean;
  children?: React.ReactNode;
}) {
  const isDone = !!selected;
  const isActive = !locked && !isDone;

  return (
    <div className={`rounded-2xl border transition-all ${
      isDone ? 'bg-white border-blue-100' :
      isActive ? 'bg-white border-blue-200 shadow-sm' :
      'bg-slate-50 border-slate-100 opacity-60 pointer-events-none'
    }`}>
      <div className="flex items-center gap-3 px-4 py-3.5">
        {/* Step indicator */}
        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-colors ${
          isDone ? 'bg-blue-600 text-white' : isActive ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-400'
        }`}>
          {isDone ? <CheckCircle2 className="w-4 h-4" /> : step}
        </div>

        <div className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 ${isDone ? 'bg-blue-50' : 'bg-slate-100'}`}>
          <Icon className={`w-3.5 h-3.5 ${isDone ? 'text-blue-600' : 'text-slate-400'}`} />
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">{label}</p>
          {isDone ? (
            <p className="text-sm font-semibold text-blue-700 truncate">{selected}</p>
          ) : (
            <p className="text-xs text-slate-400">{locked ? 'Complete previous step' : 'Select below…'}</p>
          )}
        </div>

        {isDone && onReset && (
          <button
            onClick={onReset}
            className="p-1.5 text-slate-300 hover:text-slate-500 hover:bg-slate-100 rounded-xl transition shrink-0"
            title="Change selection"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {isActive && children && (
        <div className="px-4 pb-4 border-t border-slate-100">{children}</div>
      )}
    </div>
  );
}

// ── Selectable list item ──────────────────────────────────────────────────────

function PickItem({
  icon: Icon, iconColor = 'bg-slate-100', iconText = 'text-slate-500',
  label, sublabel, onClick,
}: {
  icon: React.ElementType;
  iconColor?: string;
  iconText?: string;
  label: string;
  sublabel?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-blue-50 text-left transition group"
    >
      <div className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 ${iconColor}`}>
        <Icon className={`w-3.5 h-3.5 ${iconText}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-900 truncate">{label}</p>
        {sublabel && <p className="text-xs text-slate-400 truncate">{sublabel}</p>}
      </div>
      <ArrowRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-blue-400 shrink-0 transition" />
    </button>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────

export default function StudentProgress() {
  const { user, profile } = useAuth();
  const schoolId = profile?.school_id!;

  // ── Master data ───────────────────────────────────────────────────────────
  const [students, setStudents] = useState<Student[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [strands, setStrands] = useState<Strand[]>([]);
  const [subStrands, setSubStrands] = useState<SubStrand[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(true);
  const [loadingStrands, setLoadingStrands] = useState(false);

  // ── Selection ─────────────────────────────────────────────────────────────
  const [studentSearch, setStudentSearch] = useState('');
  const [student, setStudent] = useState<Student | null>(null);
  const [subject, setSubject] = useState<Subject | null>(null);
  const [strand, setStrand] = useState<Strand | null>(null);
  const [subStrand, setSubStrand] = useState<SubStrand | null>(null);
  const [term, setTerm] = useState<Term>('Term 1');

  // ── Assessment form ───────────────────────────────────────────────────────
  const [scoreInput, setScoreInput] = useState('');
  const [cbcLevel, setCbcLevel] = useState<CBCLevel>('ME');
  const [aiComment, setAiComment] = useState('');
  const [aiCommentForParent, setAiCommentForParent] = useState('');
  const [teacherNote, setTeacherNote] = useState('');

  // ── Saved data ────────────────────────────────────────────────────────────
  const [priorAssessments, setPriorAssessments] = useState<CompetencyAssessment[]>([]);
  const [existingId, setExistingId] = useState<string | null>(null);
  const [trendInsight, setTrendInsight] = useState('');

  // ── History panel ─────────────────────────────────────────────────────────
  const [showHistory, setShowHistory] = useState(false);

  // ── UI state ──────────────────────────────────────────────────────────────
  const [generatingComment, setGeneratingComment] = useState(false);
  const [generatingTrend, setGeneratingTrend] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [parentNotified, setParentNotified] = useState(false);

  const scoreRef = useRef<HTMLInputElement>(null);

  // ── Loaders ───────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!user) return;
    supabase
      .from('students')
      .select('*, class:classes(name, level:levels(name))')
      .eq('teacher_id', user.id)
      .order('name')
      .then(({ data }) => { setStudents(data ?? []); setLoadingStudents(false); });
  }, [user]);

  useEffect(() => {
    supabase
      .from('subjects').select('*').eq('school_id', schoolId).order('name')
      .then(({ data }) => setSubjects(data ?? []));
  }, [schoolId]);

  useEffect(() => {
    if (!subject) { setStrands([]); return; }
    setLoadingStrands(true);
    supabase
      .from('strands').select('*').eq('subject_id', subject.id).eq('school_id', schoolId).order('sort_order')
      .then(({ data }) => { setStrands(data ?? []); setLoadingStrands(false); });
  }, [subject, schoolId]);

  useEffect(() => {
    if (!strand) { setSubStrands([]); return; }
    supabase
      .from('sub_strands').select('*').eq('strand_id', strand.id).eq('school_id', schoolId).order('sort_order')
      .then(({ data }) => setSubStrands(data ?? []));
  }, [strand, schoolId]);

  // ── Load/retrieve prior assessments ──────────────────────────────────────

  const loadAssessments = useCallback(async (studentId: string, subStrandId: string) => {
    const { data } = await supabase
      .from('competency_assessments')
      .select('*')
      .eq('student_id', studentId)
      .eq('sub_strand_id', subStrandId)
      .order('term');
    const all = data ?? [];
    setPriorAssessments(all);
    const existing = all.find(a => a.term === term);
    if (existing) {
      setExistingId(existing.id);
      setScoreInput(String(existing.score));
      setCbcLevel(existing.cbc_level);
      setAiComment(existing.ai_comment ?? '');
      setAiCommentForParent(existing.ai_comment_for_parent ?? '');
      setTeacherNote(existing.teacher_note ?? '');
      setParentNotified(existing.parent_notification_sent ?? false);
    } else {
      resetForm();
    }
  }, [term]);

  useEffect(() => {
    if (student && subStrand) loadAssessments(student.id, subStrand.id);
  }, [student, subStrand, term, loadAssessments]);

  // ── Auto-compute CBC level from score ─────────────────────────────────────

  useEffect(() => {
    const n = parseFloat(scoreInput);
    if (!isNaN(n) && n >= 0 && n <= 100) setCbcLevel(getCBCLevel(n));
  }, [scoreInput]);

  // ── Selection handlers ────────────────────────────────────────────────────

  function pickStudent(s: Student) {
    setStudent(s);
    setSubject(null); setStrand(null); setSubStrand(null);
    resetForm(); setTrendInsight('');
  }
  function pickSubject(s: Subject) {
    setSubject(s); setStrand(null); setSubStrand(null);
    resetForm(); setTrendInsight('');
  }
  function pickStrand(s: Strand) {
    setStrand(s); setSubStrand(null);
    resetForm(); setTrendInsight('');
  }
  function pickSubStrand(ss: SubStrand) {
    setSubStrand(ss);
    resetForm(); setTrendInsight('');
  }

  function resetForm() {
    setScoreInput(''); setCbcLevel('ME');
    setAiComment(''); setAiCommentForParent('');
    setTeacherNote(''); setExistingId(null);
    setError(''); setPriorAssessments([]);
    setParentNotified(false);
  }

  // ── AI: generate teacher comment + parent summary ─────────────────────────

  async function handleGenerateComment() {
    if (!student || !subject || !strand || !subStrand) return;
    const score = parseFloat(scoreInput);
    if (isNaN(score)) { setError('Enter a score first.'); return; }
    setError('');
    setGeneratingComment(true);
    try {
      const prior = priorAssessments
        .filter(a => a.term !== term)
        .map(a => ({ term: a.term, score: a.score, cbcLevel: a.cbc_level }));
      const result = await generateComment({
        studentName: student.name,
        subjectName: subject.name,
        strandName: strand.name,
        subStrandName: subStrand.name,
        score,
        cbcLevel,
        term,
        priorAssessments: prior,
      });
      // Edge function returns structured text — split into teacher + parent portions
      setAiComment(result);
      // Parent version: extract first section up to RECOMMENDATION or 100 chars
      const parentVersion = await generateComment({
        studentName: student.name,
        subjectName: subject.name,
        strandName: strand.name,
        subStrandName: subStrand.name,
        score,
        cbcLevel,
        term,
        priorAssessments: prior,
        forParent: true,
      });
      setAiCommentForParent(parentVersion);
    } catch (e: any) {
      setError(e.message ?? 'AI generation failed.');
    } finally {
      setGeneratingComment(false);
    }
  }

  async function handleGenerateTrend() {
    if (!student || !subject || !subStrand || priorAssessments.length === 0) {
      setError('No prior assessments to analyse.'); return;
    }
    setError('');
    setGeneratingTrend(true);
    try {
      const insight = await generateTrendInsight({
        studentName: student.name,
        subjectName: subject.name,
        subStrandName: subStrand.name,
        assessments: priorAssessments.map(a => ({ term: a.term, score: a.score, cbcLevel: a.cbc_level })),
      });
      setTrendInsight(insight);
    } catch (e: any) {
      setError(e.message ?? 'Trend analysis failed.');
    } finally {
      setGeneratingTrend(false);
    }
  }

  // ── Save ──────────────────────────────────────────────────────────────────

  async function handleSave() {
    if (!student || !subStrand || !user) return;
    const score = parseFloat(scoreInput);
    if (isNaN(score) || score < 0 || score > 100) {
      setError('Score must be between 0 and 100.');
      return;
    }
    setError('');
    setSaving(true);

    const record = {
      student_id: student.id,
      sub_strand_id: subStrand.id,
      score,
      cbc_level: cbcLevel,
      term,
      teacher_id: user.id,
      school_id: schoolId,
      ai_comment: aiComment,
      ai_comment_for_parent: aiCommentForParent,
      teacher_note: teacherNote,
      updated_at: new Date().toISOString(),
    };

    let saveError: any = null;

    if (existingId) {
      const res = await supabase.from('competency_assessments').update(record).eq('id', existingId);
      saveError = res.error;
    } else {
      const res = await supabase.from('competency_assessments').insert(record).select().single();
      saveError = res.error;
      if (!saveError && res.data) setExistingId(res.data.id);
    }

    if (saveError) {
      setError(saveError.message);
    } else {
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      await loadAssessments(student.id, subStrand.id);
    }
    setSaving(false);
  }

  // ── Notify parent (scaffold — sends nothing yet) ──────────────────────────

  async function handleNotifyParent() {
    if (!existingId) return;
    // FUTURE: trigger email edge function here
    // await supabase.functions.invoke('notify-parent', { body: { assessmentId: existingId } });
    await supabase
      .from('competency_assessments')
      .update({ parent_notification_sent: true, parent_notified_at: new Date().toISOString() })
      .eq('id', existingId);
    setParentNotified(true);
    alert(`Parent notification marked as sent.\n\n(Email sending will be enabled in the next release.)`);
  }

  // ── Derived ───────────────────────────────────────────────────────────────

  const filteredStudents = useMemo(
    () => students.filter(s => s.name.toLowerCase().includes(studentSearch.toLowerCase())),
    [students, studentSearch],
  );

  const priorScores = priorAssessments.map(a => a.score);
  const trend = computeTrend(priorScores);
  const isReadyToAssess = !!(student && subject && strand && subStrand);
  const step = !student ? 1 : !subject ? 2 : !strand ? 3 : !subStrand ? 4 : 5;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Page header */}
      <div className="mb-8 flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl flex items-center justify-center shadow-sm">
            <Brain className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Tracking Progress</h1>
            <p className="text-sm text-slate-500">
              Record learner competency by strand — get an AI CBC comment and store it for future reference.
            </p>
          </div>
        </div>

        {/* History toggle */}
        {isReadyToAssess && priorAssessments.length > 0 && (
          <button
            onClick={() => setShowHistory(h => !h)}
            className={`flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-xl border transition ${
              showHistory
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300'
            }`}
          >
            <History className="w-4 h-4" />
            View History ({priorAssessments.length})
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">

        {/* ── Left: selection wizard ─────────────────────────────────────── */}
        <div className="xl:col-span-4 space-y-2.5">

          {/* Step 1: Student */}
          <Panel step={1} totalSteps={4} label="Learner" icon={User}
            selected={student?.name} onReset={() => { setStudent(null); setSubject(null); setStrand(null); setSubStrand(null); resetForm(); }}
          >
            <div className="pt-3 space-y-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <input
                  value={studentSearch}
                  onChange={e => setStudentSearch(e.target.value)}
                  placeholder="Search learner…"
                  className="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                />
              </div>
              {loadingStudents ? (
                <div className="flex justify-center py-5"><div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>
              ) : filteredStudents.length === 0 ? (
                <p className="text-center text-xs text-slate-400 py-4">
                  {students.length === 0 ? 'Add learners via Enter Scores first.' : 'No match.'}
                </p>
              ) : (
                <div className="space-y-0.5 max-h-52 overflow-y-auto">
                  {filteredStudents.map(s => (
                    <PickItem
                      key={s.id}
                      icon={User}
                      iconColor="bg-blue-100"
                      iconText="text-blue-600"
                      label={s.name}
                      sublabel={(s as any).class?.name}
                      onClick={() => pickStudent(s)}
                    />
                  ))}
                </div>
              )}
            </div>
          </Panel>

          {/* Step 2: Learning Area */}
          <Panel step={2} totalSteps={4} label="Learning Area" icon={BookOpen}
            selected={subject?.name} onReset={() => { setSubject(null); setStrand(null); setSubStrand(null); resetForm(); }}
            locked={!student}
          >
            <div className="pt-3 space-y-0.5 max-h-52 overflow-y-auto">
              {subjects.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-3">No learning areas configured by admin.</p>
              ) : subjects.map(s => (
                <PickItem
                  key={s.id}
                  icon={BookOpen}
                  iconColor="bg-blue-50"
                  iconText="text-blue-500"
                  label={s.name}
                  onClick={() => pickSubject(s)}
                />
              ))}
            </div>
          </Panel>

          {/* Step 3: Strand */}
          <Panel step={3} totalSteps={4} label="Strand" icon={Layers}
            selected={strand?.name} onReset={() => { setStrand(null); setSubStrand(null); resetForm(); }}
            locked={!subject}
          >
            <div className="pt-3">
              {loadingStrands ? (
                <div className="flex justify-center py-4"><div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>
              ) : strands.length === 0 ? (
                <div className="text-center py-3">
                  <p className="text-xs text-slate-400">No strands for {subject?.name}.</p>
                  <p className="text-xs text-slate-400 mt-1">Ask your admin to add strands in Curriculum Setup.</p>
                </div>
              ) : (
                <div className="space-y-0.5 max-h-48 overflow-y-auto">
                  {strands.map(s => (
                    <PickItem
                      key={s.id}
                      icon={Layers}
                      iconColor="bg-slate-100"
                      iconText="text-slate-500"
                      label={s.name}
                      onClick={() => pickStrand(s)}
                    />
                  ))}
                </div>
              )}
            </div>
          </Panel>

          {/* Step 4: Sub-strand */}
          <Panel step={4} totalSteps={4} label="Sub-strand" icon={Atom}
            selected={subStrand?.name} onReset={() => { setSubStrand(null); resetForm(); }}
            locked={!strand}
          >
            <div className="pt-3">
              {subStrands.length === 0 ? (
                <div className="text-center py-3">
                  <p className="text-xs text-slate-400">No sub-strands for {strand?.name}.</p>
                  <p className="text-xs text-slate-400 mt-1">Ask your admin to add sub-strands.</p>
                </div>
              ) : (
                <div className="space-y-0.5 max-h-48 overflow-y-auto">
                  {subStrands.map(ss => (
                    <PickItem
                      key={ss.id}
                      icon={Atom}
                      iconColor="bg-slate-100"
                      iconText="text-slate-400"
                      label={ss.name}
                      onClick={() => pickSubStrand(ss)}
                    />
                  ))}
                </div>
              )}
            </div>
          </Panel>
        </div>

        {/* ── Right: assessment panel ────────────────────────────────────── */}
        <div className="xl:col-span-8 space-y-4">

          {!isReadyToAssess ? (
            /* Empty state */
            <div className="bg-white rounded-2xl border border-dashed border-slate-200 flex flex-col items-center justify-center text-center p-16 min-h-80">
              <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center mb-4">
                <Brain className="w-7 h-7 text-blue-300" />
              </div>
              <h3 className="font-semibold text-slate-600 mb-1.5">Start by selecting a learner</h3>
              <p className="text-sm text-slate-400 max-w-sm">
                Choose learner → learning area → strand → sub-strand on the left. The assessment form will appear here.
              </p>
              {/* Breadcrumb hint */}
              <div className="flex items-center gap-1.5 mt-5 text-xs text-slate-400 flex-wrap justify-center">
                {[student?.name ?? 'Learner', subject?.name ?? 'Learning Area', strand?.name ?? 'Strand', subStrand?.name ?? 'Sub-strand'].map((label, i, arr) => (
                  <span key={i} className="flex items-center gap-1.5">
                    <span className={label && !label.includes(' ') && i <= step - 2 ? 'text-blue-500 font-semibold' : ''}>{label}</span>
                    {i < arr.length - 1 && <ChevronRight className="w-3 h-3" />}
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <>
              {/* ── Context breadcrumb ── */}
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-5 py-4">
                <div className="flex items-center gap-1.5 text-sm flex-wrap">
                  <span className="font-bold text-slate-900">{student!.name}</span>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-300" />
                  <span className="text-slate-600">{subject!.name}</span>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-300" />
                  <span className="text-slate-600">{strand!.name}</span>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-300" />
                  <span className="font-semibold text-blue-700">{subStrand!.name}</span>
                  {existingId && (
                    <span className="ml-auto text-[10px] font-semibold px-2.5 py-1 rounded-full bg-blue-50 text-blue-600 border border-blue-100">
                      Saved record loaded
                    </span>
                  )}
                </div>
              </div>

              {/* ── Prior performance + trend ── */}
              {priorAssessments.length > 0 && (
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                  <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-slate-400" />
                      <span className="text-sm font-semibold text-slate-900">Performance History</span>
                      <TrendBadge trend={trend} />
                    </div>
                    <button
                      onClick={handleGenerateTrend}
                      disabled={generatingTrend}
                      className="flex items-center gap-1.5 text-xs font-semibold border border-blue-200 text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded-xl transition disabled:opacity-50"
                    >
                      {generatingTrend
                        ? <div className="w-3 h-3 border border-blue-500 border-t-transparent rounded-full animate-spin" />
                        : <Sparkles className="w-3 h-3" />}
                      AI Trend Analysis
                    </button>
                  </div>

                  {/* Term score cards */}
                  <div className="flex gap-3 flex-wrap">
                    {priorAssessments.map(a => (
                      <div
                        key={a.id}
                        className={`flex flex-col items-center px-5 py-3 rounded-xl border text-center min-w-[80px] transition ${
                          a.term === term ? 'border-blue-300 bg-blue-50 shadow-sm' : 'border-slate-100 bg-slate-50'
                        }`}
                      >
                        <span className="text-[10px] font-semibold text-slate-500 uppercase">{a.term}</span>
                        <span className="text-2xl font-bold text-slate-900 mt-1">{a.score}%</span>
                        <CBCBadge level={a.cbc_level} />
                      </div>
                    ))}
                  </div>

                  {/* Trend insight */}
                  {trendInsight && (
                    <div className="mt-4 bg-gradient-to-r from-blue-50 to-slate-50 border border-blue-100 rounded-xl px-4 py-3.5">
                      <div className="flex items-start gap-2.5">
                        <Brain className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
                        <p className="text-sm text-slate-700 leading-relaxed">{trendInsight}</p>
                      </div>
                    </div>
                  )}

                  {/* History detail */}
                  {showHistory && (
                    <div className="mt-4 border-t border-slate-100 pt-4 space-y-3">
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">All Saved Records</p>
                      {priorAssessments.map(a => (
                        <div key={a.id} className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-semibold text-slate-700">{a.term}</span>
                            <CBCBadge level={a.cbc_level} />
                          </div>
                          {a.ai_comment && (
                            <div className="mb-2">
                              <p className="text-[10px] font-semibold text-slate-400 uppercase mb-1">AI Comment</p>
                              <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-line">{a.ai_comment}</p>
                            </div>
                          )}
                          {a.teacher_note && (
                            <div>
                              <p className="text-[10px] font-semibold text-slate-400 uppercase mb-1">Teacher Note</p>
                              <p className="text-xs text-slate-600">{a.teacher_note}</p>
                            </div>
                          )}
                          {a.parent_notification_sent && (
                            <div className="mt-2 flex items-center gap-1 text-[10px] font-medium text-emerald-600">
                              <Mail className="w-3 h-3" />
                              Parent notified {a.parent_notified_at ? new Date(a.parent_notified_at).toLocaleDateString() : ''}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ── Assessment form ── */}
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                {/* Form header */}
                <div className="flex items-center justify-between px-5 py-4 bg-slate-50 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-slate-400" />
                    <span className="text-sm font-semibold text-slate-900">
                      {existingId ? 'Update Assessment' : 'New Assessment'}
                    </span>
                  </div>
                  {/* Term selector */}
                  <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl p-1">
                    {TERMS.map(t => (
                      <button
                        key={t}
                        onClick={() => setTerm(t)}
                        className={`text-xs font-semibold px-3.5 py-1.5 rounded-lg transition ${
                          term === t ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >{t}</button>
                    ))}
                  </div>
                </div>

                <div className="p-5 space-y-6">
                  {/* Score + CBC row */}
                  <div className="grid grid-cols-1 sm:grid-cols-5 gap-4">
                    {/* Score */}
                    <div className="sm:col-span-2">
                      <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-2">
                        Competency Score (%)
                      </label>
                      <div className="relative">
                        <input
                          ref={scoreRef}
                          type="number" min="0" max="100" step="1"
                          value={scoreInput}
                          onChange={e => setScoreInput(e.target.value)}
                          placeholder="0 – 100"
                          className="w-full border-2 border-slate-200 rounded-2xl px-4 py-4 text-3xl font-bold text-slate-900 text-center focus:outline-none focus:border-blue-500 bg-slate-50 transition"
                        />
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-lg font-bold text-slate-300">%</span>
                      </div>
                    </div>

                    {/* CBC Level selector */}
                    <div className="sm:col-span-3">
                      <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-2">
                        CBC Competency Level
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        {(Object.keys(CBC_META) as CBCLevel[]).map(level => (
                          <button
                            key={level}
                            onClick={() => setCbcLevel(level)}
                            className={`text-xs font-bold py-3 px-2 rounded-xl border-2 transition text-center ${
                              cbcLevel === level
                                ? CBC_META[level].color
                                : 'border-slate-200 bg-white text-slate-400 hover:border-slate-300'
                            }`}
                          >
                            <span className="block text-sm font-black">{level}</span>
                            <span className="block font-medium mt-0.5 text-[10px]">{CBC_META[level].short}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* AI Comment — Teacher */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">
                          AI Comment (Teacher)
                        </label>
                        <span className="text-[10px] text-slate-400">· CBC-aligned feedback</span>
                      </div>
                      <button
                        onClick={handleGenerateComment}
                        disabled={generatingComment || !scoreInput}
                        className="flex items-center gap-1.5 text-xs font-semibold bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white px-4 py-2 rounded-xl transition shadow-sm disabled:opacity-40"
                      >
                        {generatingComment
                          ? <><div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />Generating…</>
                          : <><Sparkles className="w-3 h-3" />Generate with AI</>}
                      </button>
                    </div>
                    <textarea
                      value={aiComment}
                      onChange={e => setAiComment(e.target.value)}
                      rows={5}
                      placeholder="Click 'Generate with AI' to auto-fill a CBC-aligned comment, or type manually…"
                      className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-700 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none transition leading-relaxed"
                    />
                    {aiComment && (
                      <p className="text-[10px] text-slate-400 mt-1 flex items-center gap-1">
                        <Info className="w-3 h-3" />Review and edit before saving
                      </p>
                    )}
                  </div>

                  {/* AI Comment — Parent */}
                  <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Mail className="w-4 h-4 text-amber-600" />
                      <label className="text-[10px] font-semibold text-amber-700 uppercase tracking-widest">
                        Parent Summary (Future Notification)
                      </label>
                      <span className="ml-auto text-[10px] bg-amber-100 text-amber-600 px-2 py-0.5 rounded-full font-semibold">
                        Coming soon
                      </span>
                    </div>
                    <textarea
                      value={aiCommentForParent}
                      onChange={e => setAiCommentForParent(e.target.value)}
                      rows={3}
                      placeholder="A simplified, parent-friendly version of the comment will appear here after AI generation…"
                      className="w-full border border-amber-200 rounded-xl px-3 py-2.5 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none transition leading-relaxed"
                    />
                    {student?.parent_email && (
                      <p className="text-xs text-amber-600 mt-2 flex items-center gap-1.5">
                        <Mail className="w-3 h-3" />
                        Will be sent to: <strong>{student.parent_email}</strong>
                      </p>
                    )}
                    {!student?.parent_email && (
                      <p className="text-xs text-amber-500 mt-2 flex items-center gap-1.5">
                        <Info className="w-3 h-3" />
                        No parent email on file for this learner.
                      </p>
                    )}
                  </div>

                  {/* Teacher note */}
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-2">
                      Teacher Observation (optional)
                    </label>
                    <textarea
                      value={teacherNote}
                      onChange={e => setTeacherNote(e.target.value)}
                      rows={2}
                      placeholder="Your own private observation about this learner…"
                      className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-700 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none transition"
                    />
                  </div>

                  {/* Feedback messages */}
                  {error && (
                    <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                      <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
                      <p className="text-sm text-red-600">{error}</p>
                    </div>
                  )}
                  {saved && (
                    <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                      <p className="text-sm font-semibold text-emerald-700">Assessment saved successfully!</p>
                    </div>
                  )}

                  {/* Action bar */}
                  <div className="flex items-center justify-between gap-3 pt-1 flex-wrap">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={resetForm}
                        className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-600 transition"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />Reset form
                      </button>
                    </div>

                    <div className="flex items-center gap-2">
                      {/* Notify parent — scaffold */}
                      {existingId && (
                        <button
                          onClick={handleNotifyParent}
                          disabled={parentNotified}
                          title={!student?.parent_email ? 'No parent email on file' : ''}
                          className={`flex items-center gap-2 text-sm font-semibold px-4 py-2.5 rounded-xl border transition ${
                            parentNotified
                              ? 'border-emerald-200 text-emerald-600 bg-emerald-50 cursor-default'
                              : 'border-amber-200 text-amber-700 hover:bg-amber-50'
                          }`}
                        >
                          <Mail className="w-4 h-4" />
                          {parentNotified ? 'Notified' : 'Notify Parent'}
                        </button>
                      )}

                      <button
                        onClick={handleSave}
                        disabled={saving || !scoreInput}
                        className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-sm font-semibold px-6 py-2.5 rounded-xl transition shadow-sm"
                      >
                        <Save className="w-4 h-4" />
                        {saving ? 'Saving…' : existingId ? 'Update & Save' : 'Save Assessment'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
