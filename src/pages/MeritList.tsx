// MeritList.tsx — CBC Class Performance List
//
// Format matches screenshot 3:
//   Title: CBC CLASS PERFORMANCE LIST
//   Header row: School Name | Class | Term | Year
//   Columns: #  | Name | [Subject Score + Sub-Level] ... | Mean | Position
//   Footer row: Subject averages for the whole class
//
// Teacher selects class + term → scores load from DB → printable merit list.
// All data is scoped to the logged-in teacher's school (RLS enforced at DB level).

import { useEffect, useState, useMemo, useCallback } from 'react';
import {
  Trophy, Printer, BookOpen, ChevronDown, Info, Download,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Class, Subject, Student, Score } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { getSubLevelInfo, getSubLevelColor, getCBCColor } from '../lib/riskEngine';
import html2pdf from "html2pdf.js";

const TERMS = ['Term 1', 'Term 2', 'Term 3'];
const CURRENT_YEAR = new Date().getFullYear().toString();

// ── Print styles ───────────────────────────────────────────────────────────────
const PRINT_CSS = `
* { box-sizing:border-box; margin:0; padding:0; }
body { font-family:'Segoe UI',Arial,sans-serif; font-size:10px; color:#0f172a; background:#fff; padding:20px 24px; }
.report-title { text-align:center; font-size:16px; font-weight:900; text-transform:uppercase; letter-spacing:0.08em; color:#1e3a5f; margin-bottom:6px; }
.report-meta { text-align:center; font-size:11px; color:#475569; margin-bottom:14px; }
.meta-grid { display:flex; justify-content:center; gap:28px; margin-bottom:14px; font-size:11px; }
.meta-item { display:flex; gap:5px; }
.meta-label { font-weight:700; color:#374151; }
.meta-value { color:#111827; border-bottom:1px solid #94a3b8; min-width:80px; padding-bottom:1px; }
table { width:100%; border-collapse:collapse; table-layout:fixed; page-break-inside:auto; }
th { background:#1e3a5f; color:#fff; padding:6px 4px; text-align:center; font-size:9px; font-weight:700; border:1px solid #334155; white-space:normal; word-break:break-word; min-width:40px; }
th.name-col { text-align:left; white-space:nowrap; word-break:normal; }
th.subject-header { padding:6px 4px; height:40px; vertical-align:middle; }
th.subject-header .subject-label { display:block; font-size:9px; font-weight:700; text-align:center; line-height:1.2; padding:2px 4px; white-space:normal; }
th.score-sub-header { font-size:7.5px; background:#334155; padding:3px 2px; }
td { padding:4px 3px; border:1px solid #e2e8f0; font-size:9px; text-align:center; overflow:visible; text-overflow:ellipsis; white-space:normal; }
td.name-col { text-align:left; font-weight:600; white-space:normal; word-break:break-word; font-size:9px; }
td.score-cell { font-weight:700; }
td.sub-cell { font-size:8px; color:#475569; }
tr:nth-child(even) td { background:#f8fafc; }
.avg-row td { background:#1e3a5f !important; color:#fff; font-weight:700; font-size:8.5px; }
.pos-cell { font-weight:800; color:#1e3a5f; }
.footer-note { margin-top:12px; font-size:9px; color:#94a3b8; text-align:center; page-break-inside: avoid; white-space:nowrap; }
@media print { body { padding:10px 12px; } @page { size:A4 landscape; margin:10mm; } }
`;

// ── Types ──────────────────────────────────────────────────────────────────────

type StudentRow = {
  student: Student;
  scores: Record<string, number>; // subjectId → score
  subLevels: Record<string, string>; // subjectId → subLevel string
  mean: number;
  totalPoints: number;
  position: number;
};

export default function MeritList() {
  const { user, profile, school } = useAuth();
  const schoolId = profile?.school_id ?? null;
  const isAdmin = profile?.role === 'admin' || profile?.role === 'super_admin';

  const [classes, setClasses] = useState<Class[]>([]);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [selectedTerm, setSelectedTerm] = useState('Term 1');
  const [selectedYear, setSelectedYear] = useState(CURRENT_YEAR);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<StudentRow[]>([]);

  // Load classes
  useEffect(() => {
    if (!user || !schoolId) return;
    supabase
      .from('classes')
      .select('*, level:levels(*)')
      .eq('school_id', schoolId)
      .order('name')
      .then(({ data }) => setClasses(data ?? []));
  }, [user, schoolId]);

  const selectedClass = useMemo(
    () => classes.find(c => c.id === selectedClassId) ?? null,
    [classes, selectedClassId],
  );

  // ── Load merit list data ────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    if (!selectedClassId || !user) return;
    setLoading(true);
    setRows([]);

    const cls = classes.find(c => c.id === selectedClassId);
    const levelId = cls?.level_id ?? null;

    // Load subjects for this level
    const subjectsQuery = levelId
      ? supabase.from('level_subjects').select('subject:subjects(*)').eq('level_id', levelId)
      : Promise.resolve({ data: [] as any[] });

    // Load students
    const studentsQuery = supabase
      .from('students')
      .select('*')
      .eq('class_id', selectedClassId)
      .order('name');
    if (!isAdmin) (studentsQuery as any).eq('teacher_id', user.id);

    const [subjectsRes, studentsRes] = await Promise.all([subjectsQuery, studentsQuery]);

    const subjectList: Subject[] = ((subjectsRes.data ?? []) as any[])
      .map((ls: any) => ls.subject)
      .filter(Boolean);

    const studentList: Student[] = (studentsRes.data ?? []) as Student[];

    if (studentList.length === 0 || subjectList.length === 0) {
      setSubjects(subjectList);
      setRows([]);
      setLoading(false);
      return;
    }

    // Load scores for this class + term
    const { data: scoresData } = await supabase
      .from('scores')
      .select('student_id, subject_id, score')
      .in('student_id', studentList.map(s => s.id))
      .eq('term', selectedTerm);

    const scoreMap: Record<string, Record<string, number>> = {};
    for (const sc of scoresData ?? []) {
      if (!scoreMap[sc.student_id]) scoreMap[sc.student_id] = {};
      scoreMap[sc.student_id][sc.subject_id] = sc.score;
    }

    // Build rows with mean + sub-levels
    const built: Omit<StudentRow, 'position'>[] = studentList.map(student => {
      const studentScores = scoreMap[student.id] ?? {};
      const scoreValues = subjectList
        .map(sub => studentScores[sub.id])
        .filter(v => v !== undefined) as number[];

      const mean = scoreValues.length > 0
        ? Math.round((scoreValues.reduce((a, b) => a + b, 0) / scoreValues.length) * 10) / 10
        : 0;

      const totalPoints = subjectList.reduce((acc, sub) => {
        const score = studentScores[sub.id];
        return acc + (score !== undefined ? getSubLevelInfo(score).points : 0);
      }, 0);

      const subLevels: Record<string, string> = {};
      for (const sub of subjectList) {
        const score = studentScores[sub.id];
        if (score !== undefined) subLevels[sub.id] = getSubLevelInfo(score).subLevel;
      }

      return { student, scores: studentScores, subLevels, mean, totalPoints };
    });

    // Sort by mean descending, assign positions
    const sorted = [...built].sort((a, b) => b.mean - a.mean || b.totalPoints - a.totalPoints);
    const withPositions: StudentRow[] = sorted.map((r, i) => ({ ...r, position: i + 1 }));

    setSubjects(subjectList);
    setRows(withPositions);
    setLoading(false);
  }, [selectedClassId, selectedTerm, classes, user, isAdmin]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Subject averages (bottom row) ──────────────────────────────────────────

  const subjectAverages = useMemo(() => {
    const avgs: Record<string, number> = {};
    for (const sub of subjects) {
      const vals = rows.map(r => r.scores[sub.id]).filter(v => v !== undefined) as number[];
      avgs[sub.id] = vals.length > 0
        ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10
        : 0;
    }
    return avgs;
  }, [rows, subjects]);

  const classOverallMean = useMemo(() => {
    if (rows.length === 0) return 0;
    return Math.round((rows.reduce((a, r) => a + r.mean, 0) / rows.length) * 10) / 10;
  }, [rows]);

  // ── Print ──────────────────────────────────────────────────────────────────

  function buildMeritListHTML(): string {
    const subjectHeaders = subjects.map(sub =>
      `<th colspan="2" class="subject-header"><div class="subject-label">${sub.name}</div></th>`
    ).join('');

    const subSubHeaders = subjects.map(() =>
      `<th class="score-sub-header">Score</th><th class="score-sub-header">Sub</th>`
    ).join('');

    const dataRows = rows.map(row => {
      const subjectCells = subjects.map(sub => {
        const score = row.scores[sub.id];
        const sl = row.subLevels[sub.id] ?? '';
        return score !== undefined
          ? `<td class="score-cell">${score}</td><td class="sub-cell">${sl}</td>`
          : `<td>—</td><td>—</td>`;
      }).join('');

      return `<tr>
        <td style="text-align:center">${row.position}</td>
        <td class="name-col">${row.student.name}</td>
        ${subjectCells}
        <td style="font-weight:800">${row.mean}%</td>
        <td class="pos-cell">${row.position}</td>
      </tr>`;
    }).join('');

    const avgCells = subjects.map(sub => {
      const avg = subjectAverages[sub.id];
      const sl = avg > 0 ? getSubLevelInfo(avg).subLevel : '—';
      return `<td style="font-weight:800">${avg > 0 ? avg + '%' : '—'}</td><td>${sl}</td>`;
    }).join('');

    return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/>
<title>Merit List — ${selectedClass?.name ?? ''} ${selectedTerm}</title>
<style>${PRINT_CSS}</style>
</head><body>
<div class="report-title">CBC Class Performance List</div>
<div class="meta-grid">
  <div class="meta-item"><span class="meta-label">School:</span><span class="meta-value">${school?.name ?? ''}</span></div>
  <div class="meta-item"><span class="meta-label">Class:</span><span class="meta-value">${selectedClass?.name ?? ''}</span></div>
  <div class="meta-item"><span class="meta-label">Term:</span><span class="meta-value">${selectedTerm}</span></div>
  <div class="meta-item"><span class="meta-label">Year:</span><span class="meta-value">${selectedYear}</span></div>
</div>
<table>
  <thead>
    <tr>
      <th rowspan="2" style="width:28px">#</th>
      <th rowspan="2" class="name-col" style="min-width:110px">Name</th>
      ${subjectHeaders}
      <th rowspan="2" style="width:44px">Mean</th>
      <th rowspan="2" style="width:30px">Pos.</th>
    </tr>
    <tr>${subSubHeaders}</tr>
  </thead>
  <tbody>
    ${dataRows}
    <tr class="avg-row">
      <td colspan="2" style="text-align:left;padding-left:8px">CLASS AVERAGE</td>
      ${avgCells}
      <td>${classOverallMean}%</td>
      <td></td>
    </tr>
  </tbody>
</table>
<div class="footer-note">Generated by SANA OS · ${new Date().toLocaleDateString('en-KE', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
</body></html>`;
  }

  function downloadMeritList() {
    if (rows.length === 0) return;

    const html = buildMeritListHTML();

    const element = document.createElement("div");
    element.innerHTML = html;

    const opt = {
      margin: [10, 10, 20, 10],
      filename: `Merit-List_${selectedClass?.name ?? 'Class'}_${selectedTerm}_${selectedYear}.pdf`
        .replace(/\s+/g, "-"),
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: { scale: 2 },
      jsPDF: { unit: "mm", format: "a4", orientation: "landscape" },
    };

    (html2pdf as any)().set(opt).from(element).save();
  }

  function printMeritList() {
    if (rows.length === 0) return;
    alert("For clean print, disable 'Headers and Footers' in print settings.");
    const html = buildMeritListHTML();
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;width:0;height:0;border:0;visibility:hidden;';
    iframe.src = url;
    document.body.appendChild(iframe);
    iframe.onload = () => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      setTimeout(() => {
        document.body.removeChild(iframe);
        URL.revokeObjectURL(url);
      }, 2000);
    };
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const hasData = rows.length > 0 && subjects.length > 0;

  return (
    <div className="p-4 sm:p-6 max-w-full mx-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-9 h-9 bg-blue-700 rounded-xl flex items-center justify-center shrink-0">
            <Trophy className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Class Merit List</h1>
            <p className="text-sm text-slate-500">CBC class performance list — ranked by mean score · print-ready</p>
          </div>
        </div>

        {/* Controls */}
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-48">
            <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-1.5">Class</label>
            <div className="relative">
              <select
                value={selectedClassId}
                onChange={e => setSelectedClassId(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none pr-8"
              >
                <option value="">— Select class —</option>
                {classes.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name}{(c as any).level?.name ? ` (${(c as any).level.name})` : ''}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
            </div>
          </div>

          <div className="min-w-32">
            <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-1.5">Term</label>
            <select
              value={selectedTerm}
              onChange={e => setSelectedTerm(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {TERMS.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>

          <div className="min-w-28">
            <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-1.5">Year</label>
            <select
              value={selectedYear}
              onChange={e => setSelectedYear(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {[-1, 0, 1].map(offset => {
                const y = (parseInt(CURRENT_YEAR) + offset).toString();
                return <option key={y} value={y}>{y}</option>;
              })}
            </select>
          </div>

          {hasData && (
            <div className="flex items-center gap-2">
              <button
                onClick={downloadMeritList}
                className="flex items-center gap-2 bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition shadow-sm"
              >
                <Download className="w-4 h-4" />
                Download
              </button>
              <button
                onClick={printMeritList}
                className="flex items-center gap-2 border border-slate-200 hover:border-blue-300 hover:bg-blue-50 text-slate-700 hover:text-blue-700 text-sm font-medium px-4 py-2.5 rounded-xl transition"
              >
                <Printer className="w-4 h-4" />
                Print
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Empty state */}
      {!selectedClassId ? (
        <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-14 text-center">
          <Trophy className="w-10 h-10 text-slate-200 mx-auto mb-3" />
          <p className="font-medium text-slate-500">Select a class to view the merit list</p>
          <p className="text-sm text-slate-400 mt-1">Scores entered in "Enter Scores" appear here ranked by performance.</p>
        </div>
      ) : loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : !hasData ? (
        <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-14 text-center">
          <BookOpen className="w-10 h-10 text-slate-200 mx-auto mb-3" />
          <p className="font-medium text-slate-500">No scores found for {selectedTerm}</p>
          <p className="text-sm text-slate-400 mt-1">Enter scores in the "Enter Scores" page first.</p>
        </div>
      ) : (
        <>
          {/* Report header preview */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm mb-4 overflow-hidden">
            <div className="bg-blue-700 px-6 py-5 text-center">
              <h2 className="text-lg font-black text-white uppercase tracking-widest">CBC Class Performance List</h2>
              <p className="text-blue-200 text-sm mt-1">{school?.name ?? ''}</p>
            </div>
            <div className="px-6 py-3 flex flex-wrap gap-x-8 gap-y-1 bg-slate-50 border-b border-slate-100">
              {[
                { label: 'Class', value: selectedClass?.name ?? '' },
                { label: 'Term', value: selectedTerm },
                { label: 'Year', value: selectedYear },
                { label: 'Students', value: rows.length },
                { label: 'Subjects', value: subjects.length },
                { label: 'Class Mean', value: `${classOverallMean}%` },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-baseline gap-1.5 text-sm">
                  <span className="font-bold text-slate-600 text-xs">{label}:</span>
                  <span className="font-semibold text-slate-900">{value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Merit list table */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                {/* Header */}
                <thead>
                  <tr className="bg-slate-800 text-white">
                    <th className="px-3 py-3 text-center font-bold w-10 border-r border-slate-700">#</th>
                    <th className="px-4 py-3 text-left font-bold min-w-36 border-r border-slate-700">Student Name</th>
                    {subjects.map(sub => (
                      <th key={sub.id} colSpan={2} className="px-2 py-3 text-center font-bold border-r border-slate-700">
                        <div
                          style={{
                            fontSize: '10px',
                            textAlign: 'center',
                            lineHeight: '1.2',
                            padding: '2px 4px',
                            whiteSpace: 'normal',
                          }}
                        >
                          {sub.name}
                        </div>
                      </th>
                    ))}
                    <th className="px-3 py-3 text-center font-bold w-16 border-r border-slate-700">Mean</th>
                    <th className="px-3 py-3 text-center font-bold w-12">Pos.</th>
                  </tr>
                  {/* Sub-header: Score | Sub for each subject */}
                  <tr className="bg-slate-700 text-slate-200">
                    <th className="border-r border-slate-600" />
                    <th className="border-r border-slate-600" />
                    {subjects.map(sub => (
                      <React.Fragment key={sub.id}>
                        <th className="px-2 py-1.5 text-center text-[9px] font-medium border-r border-slate-600">Score</th>
                        <th className="px-2 py-1.5 text-center text-[9px] font-medium border-r border-slate-600">Sub</th>
                      </React.Fragment>
                    ))}
                    <th className="border-r border-slate-600" />
                    <th />
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100">
                  {rows.map((row, idx) => {
                    // Position medal colors
                    const posClass = row.position === 1
                      ? 'bg-amber-50'
                      : row.position === 2
                      ? 'bg-slate-50'
                      : row.position === 3
                      ? 'bg-orange-50'
                      : idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50';

                    return (
                      <tr key={row.student.id} className={`${posClass} hover:bg-blue-50/30 transition`}>
                        <td className="px-3 py-3 text-center font-bold text-slate-500 border-r border-slate-100">
                          {row.position}
                        </td>
                        <td className="px-4 py-3 font-semibold text-slate-900 border-r border-slate-100">
                          {row.student.name}
                        </td>
                        {subjects.map(sub => {
                          const score = row.scores[sub.id];
                          const sl = row.subLevels[sub.id];
                          return (
                            <React.Fragment key={sub.id}>
                              <td className="px-2 py-3 text-center font-bold text-slate-900 border-r border-slate-50">
                                {score !== undefined ? score : <span className="text-slate-300">—</span>}
                              </td>
                              <td className="px-2 py-3 text-center border-r border-slate-100">
                                {sl ? (
                                  <span className={`text-[9px] font-black px-1.5 py-0.5 rounded ${getSubLevelColor(sl as any)}`}>
                                    {sl}
                                  </span>
                                ) : <span className="text-slate-300 text-[9px]">—</span>}
                              </td>
                            </React.Fragment>
                          );
                        })}
                        <td className="px-3 py-3 text-center border-r border-slate-100">
                          <span className="font-black text-slate-900">{row.mean}%</span>
                        </td>
                        <td className="px-3 py-3 text-center">
                          <span className={`font-black text-sm ${
                            row.position === 1 ? 'text-amber-600' :
                            row.position === 2 ? 'text-slate-500' :
                            row.position === 3 ? 'text-orange-600' :
                            'text-slate-700'
                          }`}>
                            {row.position}
                          </span>
                        </td>
                      </tr>
                    );
                  })}

                  {/* Class average row */}
                  <tr className="bg-blue-700 text-white border-t-2 border-blue-800">
                    <td className="px-3 py-3 text-center font-bold text-blue-200" />
                    <td className="px-4 py-3 font-black text-white text-xs uppercase tracking-wide border-r border-blue-600">
                      Class Average
                    </td>
                    {subjects.map(sub => {
                      const avg = subjectAverages[sub.id];
                      const sl = avg > 0 ? getSubLevelInfo(avg).subLevel : null;
                      return (
                        <React.Fragment key={sub.id}>
                          <td className="px-2 py-3 text-center font-black text-white border-r border-blue-600">
                            {avg > 0 ? `${avg}%` : '—'}
                          </td>
                          <td className="px-2 py-3 text-center border-r border-blue-600">
                            {sl ? (
                              <span className="text-[9px] font-black bg-blue-500 text-white px-1.5 py-0.5 rounded">{sl}</span>
                            ) : '—'}
                          </td>
                        </React.Fragment>
                      );
                    })}
                    <td className="px-3 py-3 text-center font-black text-white border-r border-blue-600">
                      {classOverallMean}%
                    </td>
                    <td />
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Footer actions */}
            <div className="px-5 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Info className="w-3.5 h-3.5" />
                {rows.length} students · Ranked by mean score · {subjects.length} learning areas
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={downloadMeritList}
                  className="flex items-center gap-2 bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition shadow-sm"
                >
                  <Download className="w-4 h-4" />
                  Download
                </button>
                <button
                  onClick={printMeritList}
                  className="flex items-center gap-2 border border-slate-200 hover:border-blue-300 hover:bg-blue-50 text-slate-700 hover:text-blue-700 text-sm font-medium px-4 py-2.5 rounded-xl transition"
                >
                  <Printer className="w-4 h-4" />
                  Print
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// Need React for React.Fragment in TSX
import React from 'react';
