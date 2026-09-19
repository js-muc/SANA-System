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
  Loader2
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import type { Student, Subject, Class } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { getCBCSubLevel, getSubLevelColor } from '../lib/riskEngine';
import * as XLSX from 'xlsx';

const TERMS = ['Term 1', 'Term 2', 'Term 3'];
const CURRENT_YEAR = new Date().getFullYear().toString();

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

  // Class / term / year / assessment selection
  const [classes, setClasses] = useState<Class[]>([]);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [selectedClass, setSelectedClass] = useState<Class | null>(null);
  const [selectedTerm, setSelectedTerm] = useState('Term 1');
  const [selectedYear, setSelectedYear] = useState(CURRENT_YEAR);
  const [assessmentName, setAssessmentName] = useState('Assessment 1');
  const [assessmentOptions, setAssessmentOptions] = useState<string[]>([]);
  const [showManageAssessments, setShowManageAssessments] = useState(false);
  const [renamingName, setRenamingName] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [manageBusy, setManageBusy] = useState(false);
  const [manageError, setManageError] = useState('');
  const [manageConflicts, setManageConflicts] = useState<{ studentName: string; subjectName: string }[]>([]);
  const [deleteAssessmentTarget, setDeleteAssessmentTarget] = useState<{ name: string; count: number } | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'focus'>('grid');
  const [focusIndex, setFocusIndex] = useState(0);



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

    const [autosaveStatus, setAutosaveStatus] = useState<'idle' | 'pending' | 'saving' | 'error'>('idle');

  // Refs mirror the latest state so a setTimeout callback scheduled a moment ago
  // can still read fresh data when it actually fires — plain closures would see
  // whatever `rows`/`selectedTerm`/etc. looked like at the exact instant the
  // timer was scheduled, which is "stale" the moment another keystroke happens.
  const rowsRef = useRef<ScoreRow[]>(rows);
  const contextRef = useRef({ term: selectedTerm, year: selectedYear, assessment: assessmentName });
  const dirtyCellsRef = useRef<Set<string>>(new Set());
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRefsRef = useRef<Map<string, HTMLInputElement>>(new Map());
  
  type PreviewCell = { studentId: string; studentName: string; subjectId: string; subjectName: string; value: string };
  const [preview, setPreview] = useState<{ cells: PreviewCell[]; warnings: string[]; source: 'paste' | 'import' } | null>(null);
  const [importBusy, setImportBusy] = useState(false);

  useEffect(() => {
    contextRef.current = { term: selectedTerm, year: selectedYear, assessment: assessmentName };
  }, [selectedTerm, selectedYear, assessmentName]);

    useEffect(() => {
    return () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
      if (dirtyCellsRef.current.size > 0) {
        flushAutosave();
      }
    };
  }, [selectedClassId, selectedTerm, selectedYear, assessmentName]);

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
    setFocusIndex(0);
  }, [selectedClassId, classes, user]);

    // ── Load saved scores + assessment names when class/term/year/assessment changes ──
  useEffect(() => {
    if (!selectedClassId || students.length === 0) return;
    const studentIds = students.map(s => s.id);
    loadSavedScores(studentIds, selectedTerm, selectedYear, assessmentName);
    loadAssessmentOptions(studentIds, selectedTerm, selectedYear);
  }, [selectedClassId, selectedTerm, selectedYear, assessmentName, students]);

  

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
  // load saved scores for the current class+term+year+assessment and populate the rows
      async function loadSavedScores(studentIds: string[], term: string, year: string, assessment: string) {
    if (studentIds.length === 0) return;

    const { data } = await supabase
      .from('scores')
      .select('student_id, subject_id, score')
      .in('student_id', studentIds)
      .eq('term', term)
      .eq('year', year)
      .eq('assessment', assessment);

    const map: Record<string, Record<string, number>> = {};
    for (const s of data ?? []) {
      if (!map[s.student_id]) map[s.student_id] = {};
      map[s.student_id][s.subject_id] = s.score;
    }
    setSavedScores(map);

    setRows(prev =>
      prev.map(row => ({
        ...row,
        scores: Object.fromEntries(
          Object.entries(map[row.studentId] ?? {}).map(([sid, val]) => [sid, String(val)])
        ),
      }))
    );
    setHighlightMissing(false);
  }

  // auto-load assessment options for the current class+term+year and populate the dropdown
    async function loadAssessmentOptions(studentIds: string[], term: string, year: string) {
    if (studentIds.length === 0) return;

    const { data } = await supabase
      .from('scores')
      .select('assessment')
      .in('student_id', studentIds)
      .eq('term', term)
      .eq('year', year);

    const names = Array.from(new Set((data ?? []).map(d => d.assessment))).sort();
    setAssessmentOptions(names);
  }
    // ── Manage assessments: rename / delete ─────────────────────────────────

  async function checkRenameCollisions(oldName: string, newName: string) {
    const studentIds = students.map(s => s.id);
    const { data } = await supabase
      .from('scores')
      .select('student_id, subject_id, assessment')
      .in('student_id', studentIds)
      .eq('term', selectedTerm)
      .eq('year', selectedYear)
      .in('assessment', [oldName, newName]);

    // Group by student+subject, then check which pairs have BOTH names present —
    // those are the ones that would collide if we renamed oldName to newName.
    const seen: Record<string, Set<string>> = {};
    for (const row of data ?? []) {
      const key = `${row.student_id}|${row.subject_id}`;
      if (!seen[key]) seen[key] = new Set();
      seen[key].add(row.assessment);
    }

    const conflicts: { studentName: string; subjectName: string }[] = [];
    for (const key of Object.keys(seen)) {
      if (seen[key].has(oldName) && seen[key].has(newName)) {
        const [studentId, subjectId] = key.split('|');
        conflicts.push({
          studentName: students.find(s => s.id === studentId)?.name ?? 'Unknown student',
          subjectName: subjects.find(s => s.id === subjectId)?.name ?? 'Unknown subject',
        });
      }
    }
    return conflicts;
  }

  async function handleConfirmRename(oldName: string) {
    const newName = renameValue.trim();
    setManageError('');
    setManageConflicts([]);

    if (!newName) {
      setManageError('Assessment name cannot be empty.');
      return;
    }
    if (newName === oldName) {
      setRenamingName(null);
      return;
    }

    setManageBusy(true);
    const conflicts = await checkRenameCollisions(oldName, newName);

    if (conflicts.length > 0) {
      setManageConflicts(conflicts);
      setManageError(`Can't rename — these already have a "${newName}" score for the same subject:`);
      setManageBusy(false);
      return;
    }

    const studentIds = students.map(s => s.id);
    const { error } = await supabase
      .from('scores')
      .update({ assessment: newName })
      .in('student_id', studentIds)
      .eq('term', selectedTerm)
      .eq('year', selectedYear)
      .eq('assessment', oldName);

    setManageBusy(false);

    if (error) {
      setManageError(error.message);
      return;
    }

    setRenamingName(null);
    await loadAssessmentOptions(studentIds, selectedTerm, selectedYear);

    // If the renamed assessment is the one currently loaded into the score grid, follow the rename
    if (assessmentName === oldName) {
      setAssessmentName(newName);
    }
  }

  async function openDeleteAssessmentConfirm(name: string) {
    const studentIds = students.map(s => s.id);
    const { count } = await supabase
      .from('scores')
      .select('id', { count: 'exact', head: true })
      .in('student_id', studentIds)
      .eq('term', selectedTerm)
      .eq('year', selectedYear)
      .eq('assessment', name);

    setDeleteAssessmentTarget({ name, count: count ?? 0 });
  }

  async function handleConfirmDeleteAssessment(name: string) {
    const studentIds = students.map(s => s.id);
    setManageBusy(true);

    const { error } = await supabase
      .from('scores')
      .delete()
      .in('student_id', studentIds)
      .eq('term', selectedTerm)
      .eq('year', selectedYear)
      .eq('assessment', name);

    setManageBusy(false);
    setDeleteAssessmentTarget(null);

    if (error) {
      setManageError(error.message);
      return;
    }

    await loadAssessmentOptions(studentIds, selectedTerm, selectedYear);

    // If the deleted assessment is the one currently loaded into the grid, clear it out
    if (assessmentName === name) {
      setAssessmentName('');
      setRows(prev => prev.map(row => ({ ...row, scores: {} })));
    }
  }



  // ── Score input handler ───────────────────────────────────────────────────
    function setScore(studentId: string, subjectId: string, value: string) {
    setRows(prev => {
      // Updating rowsRef HERE — synchronously, inside the setState updater —
      // is what avoids the stale-closure trap. React itself won't re-render
      // (and hand us a fresh `rows` variable) until after this function returns,
      // but rowsRef.current is a plain mutable object, so it's updated instantly.
      const next = prev.map(r =>
        r.studentId === studentId ? { ...r, scores: { ...r.scores, [subjectId]: value } } : r
      );
      rowsRef.current = next;
      return next;
    });

    dirtyCellsRef.current.add(`${studentId}|${subjectId}`);
    setAutosaveStatus('pending');

    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(() => {
      flushAutosave();
    }, 1200);
  }


    // ── Grid keyboard navigation ─────────────────────────────────────────────
  // Deliberate choice: we only intercept Enter/ArrowDown/ArrowUp for vertical
  // movement (matching the natural "fill one subject down the whole class"
  // workflow). Left/Right are left to Tab's native browser behavior, so a
  // number input's own text-cursor editing never gets fought over.
  // One real trade-off: type="number" inputs normally use ArrowUp/ArrowDown to
  // nudge the value by `step` — we're intentionally overriding that, since
  // jumping between students is far more useful here than a spinner.
  function handleCellKeyDown(e: React.KeyboardEvent<HTMLInputElement>, rowIndex: number, colIndex: number) {
    let targetRowIndex = rowIndex;

    if (e.key === 'Enter' || e.key === 'ArrowDown') {
      targetRowIndex = rowIndex + 1;
    } else if (e.key === 'ArrowUp') {
      targetRowIndex = rowIndex - 1;
    } else {
      return; // not a key we handle — let the browser do its normal thing
    }

    e.preventDefault();
    const targetRow = rows[targetRowIndex];
    const targetSub = subjects[colIndex];
    if (!targetRow || !targetSub) return;

    const nextInput = inputRefsRef.current.get(`${targetRow.studentId}|${targetSub.id}`);
    nextInput?.focus();
    nextInput?.select(); // select existing text so typing immediately overwrites it, spreadsheet-style
  }

    // ── Paste-from-spreadsheet, routed through the shared preview/confirm panel ──
  function handleCellPaste(e: React.ClipboardEvent<HTMLInputElement>, rowIndex: number, colIndex: number) {
    const text = e.clipboardData.getData('text');
    if (!text.includes('\n') && !text.includes('\t')) return; // single value — let the browser paste it normally

    e.preventDefault();

    const grid = text
      .replace(/\r/g, '')
      .split('\n')
      .filter(line => line.length > 0)
      .map(line => line.split('\t'));

    // If every first-column value is non-numeric text, treat this as a
    // "Name, Score, Score..." paste and match by NAME instead of position —
    // this is what protects you when the source spreadsheet's row order
    // doesn't match your roster's order.
    const looksLikeNameColumn = grid.every(line => {
      const first = line[0]?.trim() ?? '';
      return first !== '' && isNaN(parseFloat(first));
    });

    const cells: PreviewCell[] = [];
    const warnings: string[] = [];

    if (looksLikeNameColumn) {
      grid.forEach(line => {
        const name = line[0].trim();
        const student = findStudentByName(name);
        if (!student) {
          warnings.push(`No matching student found for "${name}" — that row was skipped.`);
          return;
        }
        for (let i = 1; i < line.length; i++) {
          const sub = subjects[colIndex + (i - 1)];
          const val = line[i]?.trim();
          if (!sub || !val) continue;
          cells.push({ studentId: student.studentId, studentName: student.studentName, subjectId: sub.id, subjectName: sub.name, value: val });
        }
      });
    } else {
      grid.forEach((line, rOffset) => {
        line.forEach((rawVal, cOffset) => {
          const targetRow = rows[rowIndex + rOffset];
          const targetSub = subjects[colIndex + cOffset];
          const cleaned = rawVal.trim();
          if (!targetRow || !targetSub || cleaned === '') return;
          cells.push({ studentId: targetRow.studentId, studentName: targetRow.studentName, subjectId: targetSub.id, subjectName: targetSub.name, value: cleaned });
        });
      });
      if (grid.length > rows.length - rowIndex) {
        warnings.push(`You pasted ${grid.length} rows, but only ${rows.length - rowIndex} students remain below this point — the extra rows were ignored. Double-check the values below match who you expect before applying.`);
      } else {
        warnings.push(`This paste is being matched by POSITION (row order), not by name — carefully check every name below matches the value next to it before applying.`);
      }
    }

    setPreview({ cells, warnings, source: 'paste' });
  }

    function findStudentByName(name: string) {
    const normalized = name.trim().toLowerCase();
    return rows.find(r => r.studentName.trim().toLowerCase() === normalized) ?? null;
  }

    // ── Export current grid to .xlsx or .csv ─────────────────────────────────
  function handleExport(format: 'xlsx' | 'csv') {
    const headerRow = ['Student Name', ...subjects.map(s => s.name)];
    const dataRows = rows.map(row => [
      row.studentName,
      ...subjects.map(sub => row.scores[sub.id] ?? ''),
    ]);

    const worksheet = XLSX.utils.aoa_to_sheet([headerRow, ...dataRows]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Scores');

    const filename = `Scores_${selectedClass?.name ?? 'Class'}_${selectedTerm}_${selectedYear}_${assessmentName}`
      .replace(/\s+/g, '-');

    XLSX.writeFile(workbook, `${filename}.${format}`, { bookType: format });
  }


    async function flushAutosave() {
    const dirtyKeys = Array.from(dirtyCellsRef.current);
    if (dirtyKeys.length === 0) return;

    const { term, year, assessment } = contextRef.current;
    const currentRows = rowsRef.current;

    const toUpsert: {
      student_id: string;
      subject_id: string;
      score: number;
      term: string;
      year: string;
      assessment: string;
      teacher_id: string;
      school_id: string | null;
    }[] = [];

    for (const key of dirtyKeys) {
      const [studentId, subjectId] = key.split('|');
      const row = currentRows.find(r => r.studentId === studentId);
      const val = row?.scores[subjectId] ?? '';
      const num = parseFloat(val);
      if (val !== '' && !isNaN(num) && num >= 0 && num <= 100) {
        toUpsert.push({
          student_id: studentId,
          subject_id: subjectId,
          score: num,
          term,
          year,
          assessment,
          teacher_id: user!.id,
          school_id: schoolId,
        });
      }
    }

    if (toUpsert.length === 0) {
      dirtyCellsRef.current.clear();
      setAutosaveStatus('idle');
      return;
    }

    setAutosaveStatus('saving');

    const { error } = await supabase
      .from('scores')
      .upsert(toUpsert, { onConflict: 'student_id,subject_id,term,year,assessment' });

    if (error) {
      console.error('Autosave failed:', error.message);
      setAutosaveStatus('error');
      // Deliberately NOT clearing dirtyCellsRef here — leaving these cells marked
      // dirty means the next successful flush will retry them automatically.
      return;
    }

    for (const key of dirtyKeys) dirtyCellsRef.current.delete(key);
    setAutosaveStatus('idle');
  }


    // ── Focus Mode keyboard flow: Enter moves to the next subject for this
  // student, and once you're on the last subject, Enter jumps to the NEXT
  // STUDENT'S first subject — so holding down Enter blasts through an entire
  // class, one field at a time, hands never leaving the keyboard.
  function handleFocusKeyDown(e: React.KeyboardEvent<HTMLInputElement>, subjectIndex: number) {
    if (e.key !== 'Enter') return;
    e.preventDefault();

    if (subjectIndex < subjects.length - 1) {
      const nextSub = subjects[subjectIndex + 1];
      const student = rows[focusIndex];
      const nextInput = inputRefsRef.current.get(`${student.studentId}|${nextSub.id}`);
      nextInput?.focus();
      nextInput?.select();
    } else if (focusIndex < rows.length - 1) {
      const nextIndex = focusIndex + 1;
      setFocusIndex(nextIndex);
      // The next student's inputs don't exist in the DOM yet — they only get
      // created once React re-renders with the new focusIndex. setTimeout(...,0)
      // defers our focus() call until just after that render completes.
      setTimeout(() => {
        const nextStudent = rows[nextIndex];
        const firstSub = subjects[0];
        const nextInput = inputRefsRef.current.get(`${nextStudent.studentId}|${firstSub.id}`);
        nextInput?.focus();
        nextInput?.select();
      }, 0);
    }
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
      year: string;
      assessment: string;
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
            year: selectedYear,
            assessment: assessmentName.trim() || 'Assessment 1',
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
      .upsert(toUpsert, { onConflict: 'student_id,subject_id,term,year,assessment' });

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



    // ── Import from .xlsx or .csv, routed through the same preview/confirm panel ──
  async function handleImportFile(file: File) {
    setImportBusy(true);
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const grid = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, raw: false });

      if (grid.length < 2) {
        setPreview({ cells: [], warnings: ['That file has no data rows to import.'], source: 'import' });
        return;
      }

      const headerRow = grid[0].map(h => (h ?? '').toString().trim());
      const nameColIndex = headerRow.findIndex(h => h.toLowerCase() === 'student name');
      if (nameColIndex === -1) {
        setPreview({ cells: [], warnings: ['No "Student Name" column found in the header row — check the file matches the exported format.'], source: 'import' });
        return;
      }

      // Match each remaining header to a real subject by exact (case-insensitive) name
      const subjectColumns = headerRow
        .map((header, colIdx) => ({ colIdx, subject: subjects.find(s => s.name.toLowerCase() === header.toLowerCase()) }))
        .filter(c => c.subject);

      const unmatchedHeaders = headerRow.filter((h, i) => i !== nameColIndex && h !== '' && !subjects.some(s => s.name.toLowerCase() === h.toLowerCase()));

      const cells: PreviewCell[] = [];
      const warnings: string[] = [...unmatchedHeaders.map(h => `Column "${h}" doesn't match any subject in this class — it was ignored.`)];

      for (const line of grid.slice(1)) {
        const name = (line[nameColIndex] ?? '').toString().trim();
        if (!name) continue;
        const student = findStudentByName(name);
        if (!student) {
          warnings.push(`No matching student found for "${name}" — that row was skipped.`);
          continue;
        }
        for (const { colIdx, subject } of subjectColumns) {
          const val = (line[colIdx] ?? '').toString().trim();
          if (!subject || val === '') continue;
          cells.push({ studentId: student.studentId, studentName: student.studentName, subjectId: subject.id, subjectName: subject.name, value: val });
        }
      }

      setPreview({ cells, warnings, source: 'import' });
    } catch (err) {
      setPreview({ cells: [], warnings: [`Couldn't read that file: ${err instanceof Error ? err.message : 'unknown error'}`], source: 'import' });
    } finally {
      setImportBusy(false);
    }
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

                    <div className="flex-1 min-w-32">
            <label className="block text-xs font-medium text-slate-500 mb-1.5 uppercase tracking-wide">Year</label>
            <select
              value={selectedYear}
              onChange={e => {
                setSelectedYear(e.target.value);
                setSaveError('');
                setSaveSuccess(false);
              }}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-900 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {[-1, 0, 1].map(offset => {
                const y = (parseInt(CURRENT_YEAR) + offset).toString();
                return <option key={y} value={y}>{y}</option>;
              })}
            </select>
          </div>
          
                    <div className="flex items-end gap-2">
            <button
              type="button"
              onClick={() => handleExport('xlsx')}
              className="px-3 py-2.5 text-xs font-medium text-slate-700 border border-slate-200 rounded-xl hover:bg-slate-50"
            >
              Export .xlsx
            </button>
            <button
              type="button"
              onClick={() => handleExport('csv')}
              className="px-3 py-2.5 text-xs font-medium text-slate-700 border border-slate-200 rounded-xl hover:bg-slate-50"
            >
              Export .csv
            </button>
            <label className="px-3 py-2.5 text-xs font-medium text-blue-700 border border-blue-200 rounded-xl hover:bg-blue-50 cursor-pointer">
              {importBusy ? 'Reading...' : 'Import File'}
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={e => {
                  const file = e.target.files?.[0];
                  if (file) handleImportFile(file);
                  e.target.value = ''; // allow re-selecting the same file next time
                }}
              />
            </label>
          </div>





                    <div className="flex-1 min-w-48 relative">
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-medium text-slate-500 uppercase tracking-wide">Assessment</label>
              <button
                type="button"
                onClick={() => {
                  setShowManageAssessments(v => !v);
                  setManageError('');
                  setManageConflicts([]);
                  setRenamingName(null);
                }}
                className="text-xs font-medium text-blue-700 hover:underline"
              >
                Manage
              </button>
            </div>
            <input
              list="assessment-options"
              value={assessmentName}
              onChange={e => {
                setAssessmentName(e.target.value);
                setSaveError('');
                setSaveSuccess(false);
              }}
              placeholder="e.g. CAT 1, Midterm, Assessment 1"
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-900 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <datalist id="assessment-options">
              {assessmentOptions.map(name => <option key={name} value={name} />)}
            </datalist>

            {showManageAssessments && (
              <div className="absolute z-20 mt-2 w-80 bg-white border border-slate-200 rounded-xl shadow-lg p-3 right-0">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
                    Assessments — {selectedTerm} {selectedYear}
                  </span>
                  <button onClick={() => setShowManageAssessments(false)} className="text-slate-400 hover:text-slate-600">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {manageError && (
                  <div className="mb-2 p-2 bg-red-50 border border-red-100 rounded-lg text-xs text-red-700">
                    <div className="flex items-start gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                      <span>{manageError}</span>
                    </div>
                    {manageConflicts.length > 0 && (
                      <ul className="mt-1.5 ml-5 list-disc space-y-0.5">
                        {manageConflicts.map((c, i) => (
                          <li key={i}>{c.studentName} — {c.subjectName}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                <div className="space-y-1 max-h-56 overflow-y-auto">
                  {assessmentOptions.length === 0 && (
                    <p className="text-xs text-slate-400 py-2 text-center">No assessments recorded yet for this term/year.</p>
                  )}
                  {assessmentOptions.map(name => (
                    <div key={name} className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-slate-50">
                      {renamingName === name ? (
                        <>
                          <input
                            autoFocus
                            value={renameValue}
                            onChange={e => setRenameValue(e.target.value)}
                            className="flex-1 border border-slate-200 rounded-lg px-2 py-1 text-xs"
                          />
                          <button
                            disabled={manageBusy}
                            onClick={() => handleConfirmRename(name)}
                            className="text-xs font-medium text-green-700 hover:underline disabled:opacity-50"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => { setRenamingName(null); setManageError(''); setManageConflicts([]); }}
                            className="text-slate-400 hover:text-slate-600"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </>
                      ) : (
                        <>
                          <span className="flex-1 text-sm text-slate-800 truncate">{name}</span>
                          <button
                            onClick={() => { setRenamingName(name); setRenameValue(name); setManageError(''); setManageConflicts([]); }}
                            className="text-slate-400 hover:text-blue-600"
                            title="Rename"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => openDeleteAssessmentConfirm(name)}
                            className="text-slate-400 hover:text-red-600"
                            title="Delete"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

         {selectedClassId && (
          <div className="flex items-center justify-between mt-2">
          <div className="flex items-center gap-1.5 text-xs">
            {autosaveStatus === 'saving' && (
              <span className="flex items-center gap-1 text-blue-600">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving...
              </span>
            )}
            {autosaveStatus === 'pending' && (
              <span className="text-slate-400">Unsaved changes...</span>
            )}
            {autosaveStatus === 'idle' && (
              <span className="flex items-center gap-1 text-green-600">
                <CheckCircle className="w-3.5 h-3.5" /> All changes saved
              </span>
            )}
                        {autosaveStatus === 'error' && (
              <span className="flex items-center gap-1 text-red-600">
                <AlertCircle className="w-3.5 h-3.5" /> Autosave failed — will retry automatically
              </span>
            )}
          </div>

          <div className="flex rounded-lg border border-slate-200 overflow-hidden">
            <button
              onClick={() => setViewMode('grid')}
              className={`px-3 py-1.5 text-xs font-semibold transition ${viewMode === 'grid' ? 'bg-blue-700 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
            >
              Grid
            </button>
            <button
              onClick={() => setViewMode('focus')}
              className={`px-3 py-1.5 text-xs font-semibold transition ${viewMode === 'focus' ? 'bg-blue-700 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
            >
              Focus Mode
            </button>
          </div>
          </div>
        )}




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
      ) : (viewMode === 'grid' ? (
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
                {rows.map((row, rowIndex) => (
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
                                        {subjects.map((sub, colIndex) => {
                      const missing = isMissingCell(row.studentId, sub.id);
                      const saved = isSavedCell(row.studentId, sub.id);
                      const currentVal = row.scores[sub.id] ?? '';
                      const currentNum = parseFloat(currentVal);
                      const hasValidScore = currentVal !== '' && !isNaN(currentNum) && currentNum >= 0 && currentNum <= 100;
                      return (
                                                <td key={sub.id} className="px-3 py-3 text-center">
                          <input
                            ref={el => {
                              if (el) inputRefsRef.current.set(`${row.studentId}|${sub.id}`, el);
                              else inputRefsRef.current.delete(`${row.studentId}|${sub.id}`);
                            }}
                            type="number"
                            min="0"
                            max="100"
                            step="0.5"
                            value={row.scores[sub.id] ?? ''}
                            onChange={e => setScore(row.studentId, sub.id, e.target.value)}
                            onKeyDown={e => handleCellKeyDown(e, rowIndex, colIndex)}
                            onPaste={e => handleCellPaste(e, rowIndex, colIndex)}
                            placeholder="—"
                            className={`w-20 text-center border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:border-transparent transition-colors ${
                              missing
                                ? 'border-amber-300 bg-amber-50 focus:ring-amber-400'
                                : saved
                                ? 'border-blue-200 bg-blue-50 focus:ring-blue-500'
                                : 'border-slate-200 bg-white focus:ring-blue-500'
                            }`}
                          />
                          {hasValidScore && (
                            <div className={`mt-1 inline-block text-[10px] font-bold px-1.5 py-0.5 rounded-full ${getSubLevelColor(getCBCSubLevel(currentNum))}`}>
                              {getCBCSubLevel(currentNum)}
                            </div>
                          )}
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
      ):(<div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 max-w-xl mx-auto">
          {/* Progress */}
          <div className="mb-5">
            <div className="flex items-center justify-between text-xs text-slate-500 mb-1.5">
              <span>Student {focusIndex + 1} of {rows.length}</span>
              <span>
                {rows.filter(r => subjects.every(s => {
                  const v = parseFloat(r.scores[s.id] ?? '');
                  return !isNaN(v) && v >= 0 && v <= 100;
                })).length} of {rows.length} complete
              </span>
            </div>
            <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-600 transition-all"
                style={{ width: `${((focusIndex + 1) / rows.length) * 100}%` }}
              />
            </div>
          </div>

          {/* Student header */}
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
              <span className="font-bold text-blue-700 text-lg">
                {rows[focusIndex]?.studentName.charAt(0).toUpperCase()}
              </span>
            </div>
            <div>
              <p className="font-semibold text-slate-900 text-lg">{rows[focusIndex]?.studentName}</p>
              <p className="text-xs text-slate-400">{selectedTerm} {selectedYear} · {assessmentName}</p>
            </div>
          </div>

          {/* Subject inputs */}
          <div className="space-y-4">
            {subjects.map((sub, subjectIndex) => {
              const student = rows[focusIndex];
              const val = student?.scores[sub.id] ?? '';
              const num = parseFloat(val);
              const hasValidScore = val !== '' && !isNaN(num) && num >= 0 && num <= 100;
              return (
                <div key={sub.id} className="flex items-center justify-between gap-4">
                  <label className="text-sm font-medium text-slate-700 flex-1">{sub.name}</label>
                  <div className="flex items-center gap-2">
                    <input
                      ref={el => {
                        if (!student) return;
                        if (el) inputRefsRef.current.set(`${student.studentId}|${sub.id}`, el);
                        else inputRefsRef.current.delete(`${student.studentId}|${sub.id}`);
                      }}
                      type="number"
                      min="0"
                      max="100"
                      step="0.5"
                      value={val}
                      onChange={e => student && setScore(student.studentId, sub.id, e.target.value)}
                      onKeyDown={e => handleFocusKeyDown(e, subjectIndex)}
                      placeholder="—"
                      className="w-24 text-center text-lg border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    {hasValidScore ? (
                      <span className={`text-xs font-bold px-2 py-1 rounded-full w-14 text-center ${getSubLevelColor(getCBCSubLevel(num))}`}>
                        {getCBCSubLevel(num)}
                      </span>
                    ) : (
                      <span className="w-14" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-between mt-6 pt-4 border-t border-slate-100">
            <button
              onClick={() => setFocusIndex(i => Math.max(0, i - 1))}
              disabled={focusIndex === 0}
              className="px-4 py-2 text-sm font-medium text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              ← Previous
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50"
            >
              <Save className="w-4 h-4" /> {saving ? 'Saving...' : 'Check Missing'}
            </button>
            <button
              onClick={() => setFocusIndex(i => Math.min(rows.length - 1, i + 1))}
              disabled={focusIndex === rows.length - 1}
              className="px-4 py-2 text-sm font-semibold text-white bg-blue-700 rounded-xl hover:bg-blue-800 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next →
            </button>
          </div>
        </div>
      ))}

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


            {preview && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[80vh] flex flex-col">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-semibold text-sm text-slate-900">
                {preview.source === 'paste' ? 'Confirm Pasted Values' : 'Confirm Import'}
              </h3>
              <button onClick={() => setPreview(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-5 py-3 overflow-y-auto flex-1">
              {preview.warnings.length > 0 && (
                <div className="mb-3 p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 space-y-1">
                  {preview.warnings.map((w, i) => (
                    <div key={i} className="flex items-start gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                      <span>{w}</span>
                    </div>
                  ))}
                </div>
              )}

              {preview.cells.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-6">Nothing to apply.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-slate-400 uppercase tracking-wide">
                      <th className="py-1.5">Student</th>
                      <th className="py-1.5">Subject</th>
                      <th className="py-1.5 text-right">Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {preview.cells.map((c, i) => (
                      <tr key={i}>
                        <td className="py-1.5 text-slate-900">{c.studentName}</td>
                        <td className="py-1.5 text-slate-500">{c.subjectName}</td>
                        <td className="py-1.5 text-right font-semibold text-slate-900">{c.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="px-5 py-3 border-t border-slate-100 flex justify-end gap-2">
              <button onClick={() => setPreview(null)} className="px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 rounded-lg">
                Cancel
              </button>
              <button
                disabled={preview.cells.length === 0}
                onClick={() => {
                  preview.cells.forEach(c => setScore(c.studentId, c.subjectId, c.value));
                  setPreview(null);
                }}
                className="px-3 py-1.5 text-sm font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800 disabled:opacity-40"
              >
                Apply {preview.cells.length} Value{preview.cells.length !== 1 ? 's' : ''}
              </button>
            </div>
          </div>
        </div>
      )}

            {deleteAssessmentTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-5">
            <div className="flex items-center gap-2 text-red-600 mb-2">
              <AlertTriangle className="w-5 h-5" />
              <h3 className="font-semibold text-sm">Delete "{deleteAssessmentTarget.name}"?</h3>
            </div>
            <p className="text-sm text-slate-600 mb-4">
              This will permanently delete <strong>{deleteAssessmentTarget.count}</strong> score record{deleteAssessmentTarget.count !== 1 ? 's' : ''} for {selectedTerm} {selectedYear}. This cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeleteAssessmentTarget(null)}
                className="px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 rounded-lg"
              >
                Cancel
              </button>
              <button
                disabled={manageBusy}
                onClick={() => handleConfirmDeleteAssessment(deleteAssessmentTarget.name)}
                className="px-3 py-1.5 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {manageBusy ? 'Deleting...' : 'Delete'}
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
