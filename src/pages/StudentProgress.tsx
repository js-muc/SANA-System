// StudentProgress.tsx — AI-powered granular competency tracking
// Flow: select student → select subject → select strand → select sub-strand
//       → enter score + CBC level → AI generates comment → save

import { useEffect, useMemo, useState, useCallback } from 'react';
import {
  Brain, ChevronRight, ChevronDown, Search, Sparkles, Save,
  TrendingUp, TrendingDown, Minus, AlertTriangle, CheckCircle,
  BookOpen, Layers, Atom, User, RotateCcw, Info,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Student, Subject, Strand, SubStrand, CompetencyAssessment } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { getCBCLevel, getCBCColor } from '../lib/riskEngine';
import { generateComment, generateTrendInsight } from '../lib/aiClient';

const TERMS = ['Term 1', 'Term 2', 'Term 3'] as const;
type Term = typeof TERMS[number];

const CBC_LEVELS = [
  { value: 'EE', label: 'EE — Exceeding Expectations', color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-300' },
  { value: 'ME', label: 'ME — Meeting Expectations', color: 'text-blue-700', bg: 'bg-blue-50 border-blue-300' },
  { value: 'AE', label: 'AE — Approaching Expectations', color: 'text-amber-700', bg: 'bg-amber-50 border-amber-300' },
  { value: 'BE', label: 'BE — Below Expectations', color: 'text-red-700', bg: 'bg-red-50 border-red-300' },
] as const;

// ── Small helpers ────────────────────────────────────────────────────────────

function StepBadge({ n, active, done }: { n: number; active: boolean; done: boolean }) {
  if (done) return (
    <div className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center shrink-0">
      <CheckCircle className="w-3.5 h-3.5 text-white" />
    </div>
  );
  return (
    <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-xs font-bold transition-colors ${
      active ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400'
    }`}>{n}</div>
  );
}

function TrendIcon({ trend }: { trend: 'improving' | 'stable' | 'declining' }) {
  if (trend === 'improving') return <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />;
  if (trend === 'declining') return <TrendingDown className="w-3.5 h-3.5 text-red-500" />;
  return <Minus className="w-3.5 h-3.5 text-slate-400" />;
}

function computeTrend(scores: number[]): 'improving' | 'stable' | 'declining' {
  if (scores.length < 2) return 'stable';
  const recent = scores.slice(-3);
  const diff = recent[recent.length - 1] - recent[0];
  if (diff > 5) return 'improving';
  if (diff < -5) return 'declining';
  return 'stable';
}

// ── Main component ───────────────────────────────────────────────────────────

export default function StudentProgress() {
  const { user, profile } = useAuth();
  const schoolId = profile?.school_id!;

  // ── Data ────────────────────────────────────────────────────────────────
  const [students, setStudents] = useState<Student[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [strands, setStrands] = useState<Strand[]>([]);
  const [subStrands, setSubStrands] = useState<SubStrand[]>([]);
  const [priorAssessments, setPriorAssessments] = useState<CompetencyAssessment[]>([]);

  // ── Selection state ──────────────────────────────────────────────────────
  const [studentSearch, setStudentSearch] = useState('');
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [selectedSubject, setSelectedSubject] = useState<Subject | null>(null);
  const [selectedStrand, setSelectedStrand] = useState<Strand | null>(null);
  const [selectedSubStrand, setSelectedSubStrand] = useState<SubStrand | null>(null);
  const [selectedTerm, setSelectedTerm] = useState<Term>('Term 1');

  // ── Assessment form ──────────────────────────────────────────────────────
  const [scoreInput, setScoreInput] = useState('');
  const [cbcLevel, setCbcLevel] = useState<'EE' | 'ME' | 'AE' | 'BE'>('ME');
  const [aiComment, setAiComment] = useState('');
  const [teacherNote, setTeacherNote] = useState('');
  const [trendInsight, setTrendInsight] = useState('');

  // ── UI state ─────────────────────────────────────────────────────────────
  const [loadingStudents, setLoadingStudents] = useState(true);
  const [loadingStrands, setLoadingStrands] = useState(false);
  const [generatingComment, setGeneratingComment] = useState(false);
  const [generatingTrend, setGeneratingTrend] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [existingAssessmentId, setExistingAssessmentId] = useState<string | null>(null);

  // ── Load students ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    supabase
      .from('students')
      .select('*, class:classes(name, level:levels(name))')
      .eq('teacher_id', user.id)
      .order('name')
      .then(({ data }) => {
        setStudents(data ?? []);
        setLoadingStudents(false);
      });
  }, [user]);

  // ── Load subjects for this school ────────────────────────────────────────
  useEffect(() => {
    supabase
      .from('subjects')
      .select('*')
      .eq('school_id', schoolId)
      .order('name')
      .then(({ data }) => setSubjects(data ?? []));
  }, [schoolId]);

  // ── Load strands when subject selected ──────────────────────────────────
  useEffect(() => {
    if (!selectedSubject) { setStrands([]); setSubStrands([]); return; }
    setLoadingStrands(true);
    supabase
      .from('strands')
      .select('*')
      .eq('subject_id', selectedSubject.id)
      .eq('school_id', schoolId)
      .order('sort_order')
      .then(({ data }) => {
        setStrands(data ?? []);
        setLoadingStrands(false);
      });
  }, [selectedSubject, schoolId]);

  // ── Load sub-strands when strand selected ────────────────────────────────
  useEffect(() => {
    if (!selectedStrand) { setSubStrands([]); return; }
    supabase
      .from('sub_strands')
      .select('*')
      .eq('strand_id', selectedStrand.id)
      .eq('school_id', schoolId)
      .order('sort_order')
      .then(({ data }) => setSubStrands(data ?? []));
  }, [selectedStrand, schoolId]);

  // ── Load prior assessments when student + sub-strand + term changes ──────
  useEffect(() => {
    if (!selectedStudent || !selectedSubStrand) {
      setPriorAssessments([]);
      setExistingAssessmentId(null);
      return;
    }
    supabase
      .from('competency_assessments')
      .select('*')
      .eq('student_id', selectedStudent.id)
      .eq('sub_strand_id', selectedSubStrand.id)
      .order('term')
      .then(({ data }) => {
        const all = data ?? [];
        setPriorAssessments(all);
        // Check if an assessment already exists for this term
        const existing = all.find(a => a.term === selectedTerm);
        if (existing) {
          setExistingAssessmentId(existing.id);
          setScoreInput(String(existing.score));
          setCbcLevel(existing.cbc_level);
          setAiComment(existing.ai_comment ?? '');
          setTeacherNote(existing.teacher_note ?? '');
        } else {
          setExistingAssessmentId(null);
          setScoreInput('');
          setCbcLevel('ME');
          setAiComment('');
          setTeacherNote('');
        }
      });
  }, [selectedStudent, selectedSubStrand, selectedTerm]);

  // ── Auto-set CBC level when score changes ────────────────────────────────
  useEffect(() => {
    const num = parseFloat(scoreInput);
    if (!isNaN(num) && num >= 0 && num <= 100) {
      setCbcLevel(getCBCLevel(num));
    }
  }, [scoreInput]);

  // ── Generate AI comment ──────────────────────────────────────────────────
  const handleGenerateComment = useCallback(async () => {
    if (!selectedStudent || !selectedSubject || !selectedStrand || !selectedSubStrand) return;
    const score = parseFloat(scoreInput);
    if (isNaN(score)) { setErrorMsg('Enter a score first.'); return; }
    setErrorMsg('');
    setGeneratingComment(true);
    try {
      const prior = priorAssessments
        .filter(a => a.term !== selectedTerm)
        .map(a => ({ term: a.term, score: a.score, cbcLevel: a.cbc_level }));
      const comment = await generateComment({
        studentName: selectedStudent.name,
        subjectName: selectedSubject.name,
        strandName: selectedStrand.name,
        subStrandName: selectedSubStrand.name,
        score,
        cbcLevel,
        term: selectedTerm,
        priorAssessments: prior,
      });
      setAiComment(comment);
    } catch (e: any) {
      setErrorMsg(e.message ?? 'AI comment failed.');
    } finally {
      setGeneratingComment(false);
    }
  }, [selectedStudent, selectedSubject, selectedStrand, selectedSubStrand, scoreInput, cbcLevel, selectedTerm, priorAssessments]);

  // ── Generate trend insight ───────────────────────────────────────────────
  const handleGenerateTrend = useCallback(async () => {
    if (!selectedStudent || !selectedSubject || !selectedSubStrand) return;
    if (priorAssessments.length === 0) { setErrorMsg('No prior assessments to analyse.'); return; }
    setErrorMsg('');
    setGeneratingTrend(true);
    try {
      const insight = await generateTrendInsight({
        studentName: selectedStudent.name,
        subjectName: selectedSubject.name,
        subStrandName: selectedSubStrand.name,
        assessments: priorAssessments.map(a => ({ term: a.term, score: a.score, cbcLevel: a.cbc_level })),
      });
      setTrendInsight(insight);
    } catch (e: any) {
      setErrorMsg(e.message ?? 'Trend analysis failed.');
    } finally {
      setGeneratingTrend(false);
    }
  }, [selectedStudent, selectedSubject, selectedSubStrand, priorAssessments]);

  // ── Save assessment ──────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!selectedStudent || !selectedSubStrand) return;
    const score = parseFloat(scoreInput);
    if (isNaN(score) || score < 0 || score > 100) {
      setErrorMsg('Score must be between 0 and 100.');
      return;
    }
    setErrorMsg('');
    setSaving(true);

    const record = {
      student_id: selectedStudent.id,
      sub_strand_id: selectedSubStrand.id,
      score,
      cbc_level: cbcLevel,
      term: selectedTerm,
      teacher_id: user!.id,
      school_id: schoolId,
      ai_comment: aiComment,
      teacher_note: teacherNote,
      updated_at: new Date().toISOString(),
    };

    let err: any;
    if (existingAssessmentId) {
      const res = await supabase
        .from('competency_assessments')
        .update(record)
        .eq('id', existingAssessmentId);
      err = res.error;
    } else {
      const res = await supabase
        .from('competency_assessments')
        .insert(record)
        .select()
        .single();
      err = res.error;
      if (!err && res.data) setExistingAssessmentId(res.data.id);
    }

    if (err) {
      setErrorMsg(err.message);
    } else {
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
      // Refresh prior assessments
      const { data } = await supabase
        .from('competency_assessments')
        .select('*')
        .eq('student_id', selectedStudent.id)
        .eq('sub_strand_id', selectedSubStrand.id)
        .order('term');
      setPriorAssessments(data ?? []);
    }
    setSaving(false);
  }, [selectedStudent, selectedSubStrand, scoreInput, cbcLevel, selectedTerm, user, schoolId, aiComment, teacherNote, existingAssessmentId]);

  // ── Reset chain when parent selection changes ────────────────────────────
  function selectStudent(s: Student) {
    setSelectedStudent(s);
    setSelectedSubject(null);
    setSelectedStrand(null);
    setSelectedSubStrand(null);
    setAiComment('');
    setTrendInsight('');
    setTeacherNote('');
    setScoreInput('');
    setErrorMsg('');
  }
  function selectSubject(s: Subject) {
    setSelectedSubject(s);
    setSelectedStrand(null);
    setSelectedSubStrand(null);
    setAiComment('');
    setTrendInsight('');
    setScoreInput('');
  }
  function selectStrand(s: Strand) {
    setSelectedStrand(s);
    setSelectedSubStrand(null);
    setAiComment('');
    setTrendInsight('');
    setScoreInput('');
  }

  // ── Derived ──────────────────────────────────────────────────────────────
  const filteredStudents = useMemo(
    () => students.filter(s => s.name.toLowerCase().includes(studentSearch.toLowerCase())),
    [students, studentSearch]
  );

  const priorScores = priorAssessments.map(a => ({ term: a.term, score: a.score, cbc: a.cbc_level }));
  const trend = computeTrend(priorScores.map(p => p.score));

  const step = !selectedStudent ? 1 : !selectedSubject ? 2 : !selectedStrand ? 3 : !selectedSubStrand ? 4 : 5;

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Page header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl flex items-center justify-center shadow-sm">
            <Brain className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Tracking Progress</h1>
            <p className="text-sm text-slate-500">
              Granular competency assessment — strand-level tracking with AI insights
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* ── Left panel: step-by-step selection ────────────────────────── */}
        <div className="xl:col-span-4 space-y-3">

          {/* Step 1: Student */}
          <SelectionCard
            step={1} currentStep={step}
            icon={User} title="Student"
            value={selectedStudent?.name}
            onClear={() => selectStudent(null as any)}
          >
            {!selectedStudent && (
              <div>
                <div className="relative mb-2">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                  <input
                    type="text" value={studentSearch}
                    onChange={e => setStudentSearch(e.target.value)}
                    placeholder="Search student..."
                    className="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50"
                  />
                </div>
                {loadingStudents ? (
                  <div className="flex justify-center py-4">
                    <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : filteredStudents.length === 0 ? (
                  <p className="text-center text-sm text-slate-400 py-4">
                    {students.length === 0 ? 'No students yet. Add students via Enter Scores.' : 'No match found.'}
                  </p>
                ) : (
                  <div className="space-y-1 max-h-56 overflow-y-auto">
                    {filteredStudents.map(s => (
                      <button key={s.id} onClick={() => selectStudent(s)}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-blue-50 text-left transition group"
                      >
                        <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                          <span className="text-xs font-bold text-blue-600">{s.name.charAt(0)}</span>
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-900 truncate">{s.name}</p>
                          <p className="text-xs text-slate-400 truncate">{(s as any).class?.name ?? 'No class'}</p>
                        </div>
                        <ChevronRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-blue-400 ml-auto shrink-0" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </SelectionCard>

          {/* Step 2: Subject */}
          <SelectionCard
            step={2} currentStep={step}
            icon={BookOpen} title="Learning Area (Subject)"
            value={selectedSubject?.name}
            onClear={() => selectSubject(null as any)}
            locked={!selectedStudent}
          >
            {selectedStudent && !selectedSubject && (
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {subjects.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-3">No subjects in this school.</p>
                ) : subjects.map(s => (
                  <button key={s.id} onClick={() => selectSubject(s)}
                    className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl hover:bg-blue-50 text-left transition group"
                  >
                    <div className="w-6 h-6 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
                      <BookOpen className="w-3 h-3 text-blue-600" />
                    </div>
                    <span className="flex-1 text-sm font-medium text-slate-800 truncate">{s.name}</span>
                    <ChevronRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-blue-400 shrink-0" />
                  </button>
                ))}
              </div>
            )}
          </SelectionCard>

          {/* Step 3: Strand */}
          <SelectionCard
            step={3} currentStep={step}
            icon={Layers} title="Strand"
            value={selectedStrand?.name}
            onClear={() => selectStrand(null as any)}
            locked={!selectedSubject}
          >
            {selectedSubject && !selectedStrand && (
              loadingStrands ? (
                <div className="flex justify-center py-3">
                  <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : strands.length === 0 ? (
                <div className="text-center py-3">
                  <p className="text-sm text-slate-400">No strands for {selectedSubject.name}.</p>
                  <p className="text-xs text-slate-400 mt-1">Ask an admin to add strands via Subject management.</p>
                </div>
              ) : (
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {strands.map(s => (
                    <button key={s.id} onClick={() => selectStrand(s)}
                      className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl hover:bg-blue-50 text-left transition group"
                    >
                      <div className="w-6 h-6 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                        <Layers className="w-3 h-3 text-slate-500" />
                      </div>
                      <span className="flex-1 text-sm font-medium text-slate-800 truncate">{s.name}</span>
                      <ChevronRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-blue-400 shrink-0" />
                    </button>
                  ))}
                </div>
              )
            )}
          </SelectionCard>

          {/* Step 4: Sub-strand */}
          <SelectionCard
            step={4} currentStep={step}
            icon={Atom} title="Sub-strand"
            value={selectedSubStrand?.name}
            onClear={() => { setSelectedSubStrand(null); setAiComment(''); setTrendInsight(''); setScoreInput(''); }}
            locked={!selectedStrand}
          >
            {selectedStrand && !selectedSubStrand && (
              subStrands.length === 0 ? (
                <div className="text-center py-3">
                  <p className="text-sm text-slate-400">No sub-strands for {selectedStrand.name}.</p>
                </div>
              ) : (
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {subStrands.map(s => (
                    <button key={s.id} onClick={() => setSelectedSubStrand(s)}
                      className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl hover:bg-blue-50 text-left transition group"
                    >
                      <div className="w-6 h-6 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                        <Atom className="w-3 h-3 text-slate-500" />
                      </div>
                      <span className="flex-1 text-sm font-medium text-slate-800 truncate">{s.name}</span>
                      <ChevronRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-blue-400 shrink-0" />
                    </button>
                  ))}
                </div>
              )
            )}
          </SelectionCard>
        </div>

        {/* ── Right panel: assessment form + AI ─────────────────────────── */}
        <div className="xl:col-span-8 space-y-4">

          {step < 5 ? (
            /* Empty state prompt */
            <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-16 flex flex-col items-center justify-center text-center h-full min-h-80">
              <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center mb-4">
                <Brain className="w-7 h-7 text-blue-400" />
              </div>
              <h3 className="font-semibold text-slate-700 mb-1">Complete the selection</h3>
              <p className="text-sm text-slate-400 max-w-xs">
                Choose a student, learning area, strand and sub-strand on the left to begin the assessment.
              </p>
              {/* Breadcrumb preview */}
              <div className="flex items-center gap-1.5 mt-4 flex-wrap justify-center text-xs text-slate-400">
                <span className={selectedStudent ? 'text-blue-600 font-medium' : ''}>{selectedStudent?.name ?? 'Student'}</span>
                <ChevronRight className="w-3 h-3" />
                <span className={selectedSubject ? 'text-blue-600 font-medium' : ''}>{selectedSubject?.name ?? 'Subject'}</span>
                <ChevronRight className="w-3 h-3" />
                <span className={selectedStrand ? 'text-blue-600 font-medium' : ''}>{selectedStrand?.name ?? 'Strand'}</span>
                <ChevronRight className="w-3 h-3" />
                <span className={selectedSubStrand ? 'text-blue-600 font-medium' : ''}>{selectedSubStrand?.name ?? 'Sub-strand'}</span>
              </div>
            </div>
          ) : (
            <>
              {/* Context breadcrumb */}
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-5 py-4">
                <div className="flex items-center gap-1.5 text-sm flex-wrap">
                  <span className="font-semibold text-slate-900">{selectedStudent!.name}</span>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-300" />
                  <span className="text-slate-600">{selectedSubject!.name}</span>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-300" />
                  <span className="text-slate-600">{selectedStrand!.name}</span>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-300" />
                  <span className="font-semibold text-blue-700">{selectedSubStrand!.name}</span>
                </div>
              </div>

              {/* Prior performance history */}
              {priorScores.length > 0 && (
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-blue-500" />
                      <p className="text-sm font-semibold text-slate-900">Performance History</p>
                      <TrendIcon trend={trend} />
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        trend === 'improving' ? 'bg-emerald-100 text-emerald-700' :
                        trend === 'declining' ? 'bg-red-100 text-red-700' :
                        'bg-slate-100 text-slate-600'
                      }`}>{trend}</span>
                    </div>
                    <button
                      onClick={handleGenerateTrend}
                      disabled={generatingTrend}
                      className="flex items-center gap-1.5 text-xs font-medium border border-blue-200 text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded-xl transition disabled:opacity-50"
                    >
                      {generatingTrend ? (
                        <div className="w-3 h-3 border border-blue-500 border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <Sparkles className="w-3 h-3" />
                      )}
                      AI Trend Analysis
                    </button>
                  </div>
                  <div className="flex gap-3 flex-wrap">
                    {priorScores.map(p => (
                      <div key={p.term} className={`flex flex-col items-center px-4 py-2.5 rounded-xl border text-center ${p.term === selectedTerm ? 'border-blue-300 bg-blue-50' : 'border-slate-100 bg-slate-50'}`}>
                        <span className="text-xs text-slate-500 font-medium">{p.term}</span>
                        <span className="text-lg font-bold text-slate-900 mt-0.5">{p.score}%</span>
                        <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full mt-1 ${getCBCColor(p.cbc as any)}`}>{p.cbc}</span>
                      </div>
                    ))}
                  </div>
                  {trendInsight && (
                    <div className="mt-3 bg-gradient-to-r from-blue-50 to-slate-50 border border-blue-100 rounded-xl px-4 py-3">
                      <div className="flex items-start gap-2">
                        <Brain className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
                        <p className="text-sm text-slate-700 leading-relaxed">{trendInsight}</p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Assessment form */}
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="px-5 py-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-900">
                    {existingAssessmentId ? 'Edit Assessment' : 'New Assessment'}
                  </p>
                  {/* Term selector */}
                  <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl p-1">
                    {TERMS.map(t => (
                      <button key={t}
                        onClick={() => setSelectedTerm(t)}
                        className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition ${
                          selectedTerm === t ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >{t}</button>
                    ))}
                  </div>
                </div>

                <div className="p-5 space-y-5">
                  {/* Score + CBC level row */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                        Score (0–100%)
                      </label>
                      <input
                        type="number" min="0" max="100" step="0.5"
                        value={scoreInput}
                        onChange={e => setScoreInput(e.target.value)}
                        placeholder="e.g. 20"
                        className="w-full border border-slate-200 rounded-xl px-4 py-3 text-2xl font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50 text-center transition"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                        CBC Competency Level
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        {CBC_LEVELS.map(l => (
                          <button
                            key={l.value}
                            onClick={() => setCbcLevel(l.value)}
                            className={`text-xs font-bold px-2 py-2.5 rounded-xl border-2 transition text-center ${
                              cbcLevel === l.value ? l.bg : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
                            }`}
                          >
                            {l.value}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* AI Comment section */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                        AI-Generated Comment
                      </label>
                      <button
                        onClick={handleGenerateComment}
                        disabled={generatingComment || !scoreInput}
                        className="flex items-center gap-1.5 text-xs font-semibold bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white px-3 py-1.5 rounded-xl transition shadow-sm disabled:opacity-50"
                      >
                        {generatingComment ? (
                          <>
                            <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />
                            Generating...
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-3 h-3" />
                            Generate with AI
                          </>
                        )}
                      </button>
                    </div>
                    <textarea
                      value={aiComment}
                      onChange={e => setAiComment(e.target.value)}
                      rows={5}
                      placeholder="Click 'Generate with AI' to auto-fill, or type manually..."
                      className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50 resize-none transition leading-relaxed"
                    />
                    {aiComment && (
                      <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                        <Info className="w-3 h-3" /> AI-generated — review before saving
                      </p>
                    )}
                  </div>

                  {/* Teacher note */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                      Teacher Note (optional)
                    </label>
                    <textarea
                      value={teacherNote}
                      onChange={e => setTeacherNote(e.target.value)}
                      rows={2}
                      placeholder="Add your own observation..."
                      className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50 resize-none transition"
                    />
                  </div>

                  {/* Feedback */}
                  {errorMsg && (
                    <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">
                      <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
                      <p className="text-sm text-red-600">{errorMsg}</p>
                    </div>
                  )}
                  {saveSuccess && (
                    <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2.5">
                      <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                      <p className="text-sm text-emerald-700 font-medium">Assessment saved successfully!</p>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex items-center justify-between pt-1">
                    <button
                      onClick={() => { setAiComment(''); setTeacherNote(''); setScoreInput(''); setErrorMsg(''); }}
                      className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition"
                    >
                      <RotateCcw className="w-3.5 h-3.5" /> Reset
                    </button>
                    <button
                      onClick={handleSave}
                      disabled={saving || !scoreInput}
                      className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold px-6 py-2.5 rounded-xl transition shadow-sm"
                    >
                      <Save className="w-4 h-4" />
                      {saving ? 'Saving...' : existingAssessmentId ? 'Update Assessment' : 'Save Assessment'}
                    </button>
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

// ── SelectionCard component ──────────────────────────────────────────────────

function SelectionCard({
  step, currentStep, icon: Icon, title, value, onClear, locked, children,
}: {
  step: number;
  currentStep: number;
  icon: React.ElementType;
  title: string;
  value?: string;
  onClear?: () => void;
  locked?: boolean;
  children?: React.ReactNode;
}) {
  const isDone = !!value;
  const isActive = !isDone && !locked && currentStep >= step;
  const [open, setOpen] = useState(true);

  useEffect(() => { if (isDone) setOpen(false); }, [isDone]);

  return (
    <div className={`bg-white rounded-2xl border shadow-sm transition-all ${
      isDone ? 'border-blue-100' : isActive ? 'border-blue-200' : 'border-slate-100 opacity-60'
    }`}>
      <button
        onClick={() => !locked && setOpen(o => !o)}
        disabled={locked}
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left"
      >
        <StepBadge n={step} active={isActive} done={isDone} />
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${isDone ? 'bg-blue-100' : 'bg-slate-100'}`}>
          <Icon className={`w-3.5 h-3.5 ${isDone ? 'text-blue-600' : 'text-slate-400'}`} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-slate-400 font-medium uppercase tracking-wide">{title}</p>
          {isDone ? (
            <p className="text-sm font-semibold text-blue-700 truncate">{value}</p>
          ) : (
            <p className="text-xs text-slate-400">{locked ? 'Complete previous step first' : 'Select...'}</p>
          )}
        </div>
        {isDone && onClear && (
          <button
            onClick={e => { e.stopPropagation(); onClear(); setOpen(true); }}
            className="p-1 text-slate-300 hover:text-red-400 rounded transition"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        )}
        {!locked && !isDone && (
          <ChevronDown className={`w-4 h-4 text-slate-300 transition-transform ${open ? 'rotate-180' : ''}`} />
        )}
      </button>
      {!isDone && isActive && open && (
        <div className="px-4 pb-4">{children}</div>
      )}
    </div>
  );
}
