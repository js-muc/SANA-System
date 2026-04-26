import { useEffect, useRef, useState } from 'react';
import {
  CheckCircle,
  Plus,
  Trash2,
  Save,
  AlertCircle,
  UserPlus,
  BookOpen,
  Info,
  ShieldCheck,
  Pencil,
  X,
  AlertTriangle,
  Trophy,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import type { Student, Subject, Class } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

const TERMS = ['Term 1', 'Term 2', 'Term 3'];

type ScoreRow = {
  studentId: string;
  studentName: string;
  scores: Record<string, string>; // subjectId → current input value
};

type MissingEntry = {
  studentId: string;
  studentName: string;
  subjects: { id: string; name: string }[];
};

export default function ScoreInput() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const schoolId = profile?.school_id ?? null;
  const isAdmin = profile?.role === 'admin';

  // Class / term selection
  const [classes, setClasses] = useState<Class[]>([]);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [selectedClass, setSelectedClass] = useState<Class | null>(null);
  const [selectedTerm, setSelectedTerm] = useState('Term 1');

  // Curriculum
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [subjectsLoading, setSubjectsLoading] = useState(false);

  // Students + score grid
  const [students, setStudents] = useState<Student[]>([]);
  const [rows, setRows] = useState<ScoreRow[]>([]);

  // Saved scores for current class+term (subjectId keyed per studentId)
  const [savedScores, setSavedScores] = useState<Record<string, Record<string, number>>>({});

  // Save state
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState('');

  // Missing scores modal (shown after save)
  const [missingEntries, setMissingEntries] = useState<MissingEntry[]>([]);
  const [showMissingModal, setShowMissingModal] = useState(false);
  const [highlightMissing, setHighlightMissing] = useState(false);

  // Add student
  const [newStudentName, setNewStudentName] = useState('');
  const [addingStudent, setAddingStudent] = useState(false);
  const [showAddStudent, setShowAddStudent] = useState(false);

  // Inline student name editing
  const [editingStudentId, setEditingStudentId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const editInputRef = useRef<HTMLInputElement>(null);

  const [deleteStudentTarget, setDeleteStudentTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);

  // ── Load classes: teachers see only their assigned class; admins see all ─
  useEffect(() => {
    if (!user || !schoolId) return;
    const q = supabase
      .from('classes')
      .select('*, level:levels(*)')
      .eq('school_id', schoolId)
      .order('name');
    // Teachers only see the class they are assigned to
    if (!isAdmin) q.eq('teacher_id', user.id);
    q.then(({ data }) => setClasses(data ?? []));
  }, [user, schoolId, isAdmin]);

  // ── Auto-select if teacher has exactly one class ──────────────────────────
  useEffect(() => {
    if (!isAdmin && classes.length === 1 && !selectedClassId) {
      setSelectedClassId(classes[0].id);
    }
  }, [classes, isAdmin]);

  // ── Load students + subjects when class changes ───────────────────────────
  useEffect(() => {
    if (!user || !selectedClassId) {
      setStudents([]);
      setSubjects([]);
      setRows([]);
      setSavedScores({});
      setSelectedClass(null);
      return;
    }
    const cls = classes.find(c => c.id === selectedClassId) ?? null;
    setSelectedClass(cls);
    loadClassStructure(selectedClassId, cls?.level_id ?? null);
  }, [selectedClassId, classes, user]);

  // ── Load saved scores when class or term changes ──────────────────────────
  useEffect(() => {
    if (!selectedClassId || students.length === 0) return;
    loadSavedScores(students.map(s => s.id), selectedTerm);
  }, [selectedClassId, selectedTerm, students]);

  async function loadClassStructure(classId: string, levelId: string | null) {
    setSubjectsLoading(true);

    const studentsQ = supabase
      .from('students')
      .select('*')
      .eq('class_id', classId)
      .order('name');
    if (!isAdmin) studentsQ.eq('teacher_id', user!.id);

    const [studentsRes, subjectsRes] = await Promise.all([
      studentsQ,
      levelId
        ? supabase
            .from('level_subjects')
            .select('subject:subjects(*)')
            .eq('level_id', levelId)
        : Promise.resolve({ data: [] }),
    ]);

    const studentList: Student[] = studentsRes.data ?? [];
    const subjectList: Subject[] = ((subjectsRes.data ?? []) as any[])
      .map(ls => ls.subject)
      .filter(Boolean);

    setStudents(studentList);
    setSubjects(subjectList);
    // Rows are initialised empty here; saved scores fill them via the next effect
    setRows(studentList.map(s => ({ studentId: s.id, studentName: s.name, scores: {} })));
    setSavedScores({});
    setSubjectsLoading(false);
  }

  async function loadSavedScores(studentIds: string[], term: string) {
    if (studentIds.length === 0) return;

    const { data } = await supabase
      .from('scores')
      .select('student_id, subject_id, score')
      .in('student_id', studentIds)
      .eq('term', term);

    // Build map: studentId → subjectId → score
    const map: Record<string, Record<string, number>> = {};
    for (const s of data ?? []) {
      if (!map[s.student_id]) map[s.student_id] = {};
      map[s.student_id][s.subject_id] = s.score;
    }
    setSavedScores(map);

    // Pre-fill rows with saved scores (as string values for the inputs)
    setRows(prev =>
      prev.map(row => ({
        ...row,
        scores: Object.fromEntries(
          Object.entries(map[row.studentId] ?? {}).map(([sid, val]) => [sid, String(val)])
        ),
      }))
    );
    // Clear any stale highlighting
    setHighlightMissing(false);
  }

  // ── Score input handler ───────────────────────────────────────────────────
  function setScore(studentId: string, subjectId: string, value: string) {
    setRows(prev =>
      prev.map(r =>
        r.studentId === studentId ? { ...r, scores: { ...r.scores, [subjectId]: value } } : r
      )
    );
  }

  // ── Save scores (upsert) ──────────────────────────────────────────────────
  async function handleSave() {
    setSaveError('');
    setSaving(true);
    setHighlightMissing(false);

    const toUpsert: {
      student_id: string;
      subject_id: string;
      score: number;
      term: string;
      teacher_id: string;
      school_id: string | null;
    }[] = [];

    for (const row of rows) {
      for (const sub of subjects) {
        const val = row.scores[sub.id] ?? '';
        const num = parseFloat(val);
        if (val !== '' && !isNaN(num) && num >= 0 && num <= 100) {
          toUpsert.push({
            student_id: row.studentId,
            subject_id: sub.id,
            score: num,
            term: selectedTerm,
            teacher_id: user!.id,
            school_id: schoolId,
          });
        }
      }
    }

    if (toUpsert.length === 0) {
      setSaveError('Please enter at least one score before saving.');
      setSaving(false);
      return;
    }

    const { error: err } = await supabase
      .from('scores')
      .upsert(toUpsert, { onConflict: 'student_id,subject_id,term' });

    if (err) {
      setSaveError(err.message);
      setSaving(false);
      return;
    }

    // Update savedScores map with what we just saved
    const newSaved = { ...savedScores };
    for (const entry of toUpsert) {
      if (!newSaved[entry.student_id]) newSaved[entry.student_id] = {};
      newSaved[entry.student_id][entry.subject_id] = entry.score;
    }
    setSavedScores(newSaved);

    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 4000);

    // Compute missing scores after save
    const missing: MissingEntry[] = rows
      .map(row => {
        const missingSubjects = subjects.filter(sub => {
          const val = row.scores[sub.id] ?? '';
          const num = parseFloat(val);
          return val === '' || isNaN(num) || num < 0 || num > 100;
        });
        return { studentId: row.studentId, studentName: row.studentName, subjects: missingSubjects };
      })
      .filter(e => e.subjects.length > 0);

    if (missing.length > 0) {
      setMissingEntries(missing);
      setShowMissingModal(true);
    }

    setSaving(false);
  }

  // ── Add student ───────────────────────────────────────────────────────────
  async function handleAddStudent() {
    if (!newStudentName.trim() || !selectedClassId) return;
    setAddingStudent(true);
    const { data, error: err } = await supabase
      .from('students')
      .insert({ name: newStudentName.trim(), class_id: selectedClassId, teacher_id: user!.id, school_id: schoolId })
      .select()
      .single();
    if (!err && data) {
      const updated = [...students, data].sort((a, b) => a.name.localeCompare(b.name));
      setStudents(updated);
      setRows(updated.map(s => ({
        studentId: s.id,
        studentName: s.name,
        scores: Object.fromEntries(
          Object.entries(savedScores[s.id] ?? {}).map(([sid, v]) => [sid, String(v)])
        ),
      })));
      setNewStudentName('');
      setShowAddStudent(false);
    }
    setAddingStudent(false);
  }

  // ── Delete student ────────────────────────────────────────────────────────
  async function handleDeleteStudent(id: string, name: string) {
    await supabase.from('students').delete().eq('id', id);
    const updated = students.filter(s => s.id !== id);
    setStudents(updated);
    setRows(prev => prev.filter(r => r.studentId !== id));
  }

  // ── Inline name edit ──────────────────────────────────────────────────────
  function startEdit(studentId: string, currentName: string) {
    setEditingStudentId(studentId);
    setEditingName(currentName);
    setTimeout(() => editInputRef.current?.select(), 0);
  }

  async function commitEdit() {
    if (!editingStudentId || !editingName.trim()) {
      setEditingStudentId(null);
      return;
    }
    const trimmed = editingName.trim();
    const { error: err } = await supabase
      .from('students')
      .update({ name: trimmed })
      .eq('id', editingStudentId);
    if (!err) {
      setStudents(prev => prev.map(s => s.id === editingStudentId ? { ...s, name: trimmed } : s));
      setRows(prev => prev.map(r => r.studentId === editingStudentId ? { ...r, studentName: trimmed } : r));
    }
    setEditingStudentId(null);
  }

  function cancelEdit() {
    setEditingStudentId(null);
  }

  // ── Missing modal actions ─────────────────────────────────────────────────
  function handleFillMissing() {
    setShowMissingModal(false);
    setHighlightMissing(true);
    // Scroll to table
    document.getElementById('score-table')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function handleIgnoreMissing() {
    setShowMissingModal(false);
    setHighlightMissing(false);
    setMissingEntries([]);
  }

  // ── Derived state ─────────────────────────────────────────────────────────
  const hasLevel = !!selectedClass?.level_id;
  const levelName = (selectedClass as any)?.level?.name ?? null;

  function isMissingCell(studentId: string, subjectId: string): boolean {
    if (!highlightMissing) return false;
    return !!missingEntries.find(
      e => e.studentId === studentId && e.subjects.some(s => s.id === subjectId)
    );
  }

  function isSavedCell(studentId: string, subjectId: string): boolean {
    return savedScores[studentId]?.[subjectId] !== undefined;
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Enter Scores</h1>
        <p className="text-slate-500 mt-1">
          {isAdmin
            ? 'Select any class — view all students and enter scores across all teachers'
            : 'Your assigned class is pre-selected — all subjects for your level load automatically'}
        </p>
        {isAdmin && (
          <div className="flex items-center gap-2 mt-2 text-xs text-blue-600 bg-blue-50 border border-blue-100 rounded-xl px-3 py-2 w-fit">
            <ShieldCheck className="w-3.5 h-3.5" />
            Admin mode — viewing all students in selected class
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 mb-5">
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex-1 min-w-48">
            <label className="block text-xs font-medium text-slate-500 mb-1.5 uppercase tracking-wide">Class</label>
            <select
              value={selectedClassId}
              onChange={e => {
                setSelectedClassId(e.target.value);
                setSaveError('');
                setSaveSuccess(false);
                setHighlightMissing(false);
              }}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-900 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">— Select a class —</option>
              {classes.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name}{(c as any).level?.name ? ` (${(c as any).level.name})` : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="flex-1 min-w-40">
            <label className="block text-xs font-medium text-slate-500 mb-1.5 uppercase tracking-wide">Term</label>
            <select
              value={selectedTerm}
              onChange={e => {
                setSelectedTerm(e.target.value);
                setSaveError('');
                setSaveSuccess(false);
                setHighlightMissing(false);
              }}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-900 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {TERMS.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>

          {selectedClassId && (
            <button
              onClick={() => setShowAddStudent(!showAddStudent)}
              className="flex items-center gap-2 border border-slate-200 hover:border-blue-300 hover:bg-blue-50 text-slate-700 text-sm font-medium px-4 py-2.5 rounded-xl transition"
            >
              <UserPlus className="w-4 h-4" />
              Add Student
            </button>
          )}
        </div>

        {/* Level indicator */}
        {selectedClass && (
          <div className="mt-4 pt-4 border-t border-slate-100">
            {hasLevel ? (
              <div className="flex items-center gap-2 text-sm">
                <BookOpen className="w-4 h-4 text-blue-500" />
                <span className="text-slate-600">
                  Level: <span className="font-semibold text-slate-900">{levelName}</span>
                </span>
                {subjectsLoading ? (
                  <span className="text-slate-400">Loading...</span>
                ) : subjects.length > 0 ? (
                  <span className="text-slate-400">· {subjects.length} learning areas</span>
                ) : (
                  <span className="text-amber-600 flex items-center gap-1">
                    <Info className="w-3.5 h-3.5" />
                    No subjects assigned — ask an admin
                  </span>
                )}
                {Object.keys(savedScores).length > 0 && (
                  <span className="ml-2 text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">
                    Existing {selectedTerm} scores loaded
                  </span>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm text-amber-600">
                <Info className="w-4 h-4" />
                This class has no level assigned. Ask an admin to update it.
              </div>
            )}
          </div>
        )}

        {/* Add student form */}
        {showAddStudent && selectedClassId && (
          <div className="mt-4 pt-4 border-t border-slate-100 flex flex-wrap items-center gap-3">
            <input
              type="text"
              value={newStudentName}
              onChange={e => setNewStudentName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddStudent()}
              placeholder="Student full name..."
              className="flex-1 min-w-48 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50"
            />
            <button
              onClick={handleAddStudent}
              disabled={addingStudent || !newStudentName.trim()}
              className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-xl transition"
            >
              <Plus className="w-4 h-4" />
              {addingStudent ? 'Adding...' : 'Add'}
            </button>
          </div>
        )}
      </div>

      {/* Feedback banners */}
      {saveSuccess && (
        <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 mb-4 flex-wrap">
          <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
          <p className="text-sm text-emerald-700 font-medium flex-1">
            {selectedTerm} scores saved successfully!
          </p>
          <button
            onClick={() => navigate('/merit-list')}
            className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 border border-emerald-300 hover:bg-emerald-100 px-3 py-1.5 rounded-xl transition shrink-0"
          >
            <Trophy className="w-3.5 h-3.5" />
            View Merit List
          </button>
        </div>
      )}
      {saveError && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
          <p className="text-sm text-red-700">{saveError}</p>
        </div>
      )}

      {/* Highlight-missing banner */}
      {highlightMissing && missingEntries.length > 0 && (
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-4">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-amber-800">Missing learning areas highlighted below</p>
            <p className="text-xs text-amber-600 mt-0.5">
              Fill in the highlighted cells or dismiss if the student was absent.
            </p>
          </div>
          <button
            onClick={() => { setHighlightMissing(false); setMissingEntries([]); }}
            className="p-1 text-amber-500 hover:text-amber-700 rounded transition shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Empty states */}
      {!selectedClassId ? (
        <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-12 text-center">
          <BookOpen className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          {!isAdmin && classes.length === 0 ? (
            <>
              <p className="font-medium text-slate-600">No class assigned yet</p>
              <p className="text-sm text-slate-400 mt-1">Ask your school admin to assign you to a class.</p>
            </>
          ) : (
            <>
              <p className="font-medium text-slate-600">Select a class to begin</p>
              <p className="text-sm text-slate-400 mt-1">Subjects load automatically from the class curriculum level.</p>
            </>
          )}
        </div>
      ) : subjects.length === 0 && !subjectsLoading ? (
        <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-12 text-center">
          <BookOpen className="w-10 h-10 text-amber-300 mx-auto mb-3" />
          <p className="font-medium text-slate-600">No subjects for this level</p>
          <p className="text-sm text-slate-400 mt-1">
            Ask an admin to assign subjects to <strong>{levelName ?? 'this level'}</strong>.
          </p>
        </div>
      ) : students.length === 0 && !subjectsLoading ? (
        <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-12 text-center">
          <UserPlus className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="font-medium text-slate-600">No students in this class yet</p>
          <p className="text-sm text-slate-400 mt-1">Use "Add Student" above to enrol students.</p>
        </div>
      ) : (
        <div id="score-table" className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          {/* Legend */}
          <div className="flex items-center gap-4 px-5 py-3 border-b border-slate-100 bg-slate-50/60">
            <span className="text-xs text-slate-500 font-medium">Legend:</span>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm bg-blue-50 border border-blue-200" />
              <span className="text-xs text-slate-500">Saved score</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm bg-amber-50 border border-amber-300" />
              <span className="text-xs text-slate-500">Missing (highlighted)</span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="text-left px-5 py-3.5 font-semibold text-slate-700 min-w-52">Student</th>
                  {subjects.map(sub => (
                    <th key={sub.id} className="text-center px-3 py-3.5 font-semibold text-slate-700 min-w-28">
                      {sub.name}
                    </th>
                  ))}
                  <th className="px-3 py-3.5 w-16" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {rows.map(row => (
                  <tr key={row.studentId} className="hover:bg-slate-50/40 transition-colors group">
                    {/* Student name cell */}
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                          <span className="text-xs font-semibold text-blue-700">
                            {row.studentName.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        {editingStudentId === row.studentId ? (
                          <input
                            ref={editInputRef}
                            type="text"
                            value={editingName}
                            onChange={e => setEditingName(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') commitEdit();
                              if (e.key === 'Escape') cancelEdit();
                            }}
                            onBlur={commitEdit}
                            className="flex-1 border border-blue-300 rounded-lg px-2 py-1 text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        ) : (
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="font-medium text-slate-900 truncate">{row.studentName}</span>
                            <button
                              onClick={() => startEdit(row.studentId, row.studentName)}
                              className="p-1 text-slate-300 hover:text-blue-500 rounded transition opacity-0 group-hover:opacity-100 shrink-0"
                              title="Edit name"
                            >
                              <Pencil className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                      </div>
                    </td>

                    {/* Score cells */}
                    {subjects.map(sub => {
                      const missing = isMissingCell(row.studentId, sub.id);
                      const saved = isSavedCell(row.studentId, sub.id);
                      return (
                        <td key={sub.id} className="px-3 py-3 text-center">
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="0.5"
                            value={row.scores[sub.id] ?? ''}
                            onChange={e => setScore(row.studentId, sub.id, e.target.value)}
                            placeholder="—"
                            className={`w-20 text-center border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:border-transparent transition-colors ${
                              missing
                                ? 'border-amber-300 bg-amber-50 focus:ring-amber-400'
                                : saved
                                ? 'border-blue-200 bg-blue-50 focus:ring-blue-500'
                                : 'border-slate-200 bg-white focus:ring-blue-500'
                            }`}
                          />
                        </td>
                      );
                    })}

                    {/* Actions */}
                    <td className="px-3 py-3 text-center">
                      <button
                        onClick={() => setDeleteStudentTarget({
                           id: row.studentId,
                           name: row.studentName
                        })}
                        className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition"
                        title="Remove student"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="px-5 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
            <p className="text-sm text-slate-500">
              {students.length} student{students.length !== 1 ? 's' : ''} · {selectedClass?.name} · {selectedTerm}
            </p>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition shadow-sm"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Saving...' : `Save ${selectedTerm} Scores`}
            </button>
          </div>
        </div>
      )}

      {/* Missing Scores Modal */}
      {showMissingModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            {/* Modal header */}
            <div className="flex items-center gap-3 px-6 py-5 border-b border-slate-100">
              <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <h2 className="font-bold text-slate-900">Missing Learning Areas</h2>
                <p className="text-xs text-slate-500 mt-0.5">{selectedTerm} · {selectedClass?.name}</p>
              </div>
            </div>

            {/* Modal body */}
            <div className="px-6 py-5 max-h-72 overflow-y-auto">
              <p className="text-sm text-slate-600 mb-4">
                The following students have learning areas with no score recorded:
              </p>
              <div className="space-y-3">
                {missingEntries.map(entry => (
                  <div key={entry.studentId} className="bg-slate-50 rounded-xl px-4 py-3">
                    <p className="text-sm font-semibold text-slate-900 mb-1.5">{entry.studentName}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {entry.subjects.map(sub => (
                        <span
                          key={sub.id}
                          className="text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-medium"
                        >
                          {sub.name}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Modal footer */}
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex gap-3">
              <button
                onClick={handleFillMissing}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition"
              >
                Fill in Missing
              </button>
              <button
                onClick={handleIgnoreMissing}
                className="flex-1 border border-slate-200 hover:bg-slate-100 text-slate-700 text-sm font-medium px-4 py-2.5 rounded-xl transition"
              >
                Ignore (Student Absent)
              </button>
            </div>
          </div>
        </div>
      )}
      {deleteStudentTarget && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
    <div className="bg-white rounded-2xl shadow-xl p-6 w-[90%] max-w-sm text-center">

      <h3 className="text-lg font-bold text-slate-900 mb-2">
        Remove Student
      </h3>

      <p className="text-sm text-slate-600 mb-4">
        Remove <span className="font-semibold">"{deleteStudentTarget.name}"</span> from this class?
        <br />
        <span className="text-xs text-red-500">
          All their scores will also be deleted.
        </span>
      </p>

      <div className="flex gap-2 justify-center">

        <button
          onClick={() => setDeleteStudentTarget(null)}
          className="px-4 py-2 rounded-lg border border-slate-200 text-sm"
        >
          Cancel
        </button>

        <button
          onClick={async () => {
            const { id, name } = deleteStudentTarget;
            setDeleteStudentTarget(null);
            await handleDeleteStudent(id, name);
          }}
          className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-semibold"
        >
          Remove
        </button>

      </div>
    </div>
  </div>
)}
    </div>
  );
}
