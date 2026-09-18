// Reports.tsx — Individual student CBC report cards
// Format matches screenshot 2:
//   Header: School, Student Name, Admission No, Grade/Class, Term, Year
//   Table: Learning Area | Score | Level | Sub-Level | Points | Key Competencies Demonstrated
//   Footer: Teacher comment, signatures
//
// OpenAI scaffold: buildOpenAIPayload() is exported from reportGenerator.ts.
// When VITE_OPENAI_API_KEY is configured in reportGenerator.ts the AI comment
// replaces the deterministic one — no changes needed here.

import { useEffect, useMemo, useState } from 'react';
import {
  FileText, ChevronDown, ChevronUp, Printer, Sparkles, Search, Download,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import html2pdf from "html2pdf.js";
import type { Student, Score } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import {
  analyzeStudent, getRiskColor, getCBCColor,
  getSubLevelColor, CBC_SUB_LEVELS,
} from '../lib/riskEngine';
import {
  generateReportCard, getRiskLabel, getKeyCompetency,
} from '../lib/reportGenerator';

const TERMS = ['Term 1', 'Term 2', 'Term 3'];
const CURRENT_YEAR = new Date().getFullYear().toString();

// ── Print styles injected into the popup window ───────────────────────────────
const PRINT_CSS = `
* { box-sizing:border-box; margin:0; padding:0; }
body { font-family:'Segoe UI',Arial,sans-serif; font-size:12px; color:#0f172a; background:#fff; padding:28px 36px; }
.page-header { text-align:center; border-bottom:2px solid #1e3a5f; padding-bottom:12px; margin-bottom:20px; }
.page-header h1 { font-size:18px; font-weight:800; color:#1e3a5f; letter-spacing:0.04em; }
.page-header h2 { font-size:13px; color:#475569; font-weight:500; margin-top:3px; }
.student-meta { display:grid; grid-template-columns:1fr 1fr; gap:5px 32px; margin-bottom:20px; padding-bottom:12px; border-bottom:1px solid #e2e8f0; }
.meta-row { display:flex; gap:6px; font-size:12px; align-items:baseline; }
.meta-label { font-weight:700; min-width:110px; color:#374151; }
.meta-value { border-bottom:1px solid #94a3b8; flex:1; padding-bottom:1px; color:#111827; }
.section-title { font-size:13px; font-weight:800; text-transform:uppercase; letter-spacing:0.06em; color:#1e3a5f; margin-bottom:10px; margin-top:18px; }
table { width:100%; border-collapse:collapse; }
th { background:#f1f5f9; padding:8px 10px; text-align:left; font-size:11px; font-weight:700; color:#374151; border:1px solid #e2e8f0; }
td { padding:7px 10px; border:1px solid #e2e8f0; font-size:11.5px; vertical-align:top; }
tr:nth-child(even) td { background:#fafafa; }
.total-row td { background:#eff6ff; font-weight:700; }
.badge { display:inline-block; font-weight:800; padding:2px 7px; border-radius:5px; font-size:11px; }
.ee { background:#d1fae5; color:#065f46; }
.me { background:#dbeafe; color:#1e40af; }
.ae { background:#fef3c7; color:#92400e; }
.be { background:#fee2e2; color:#991b1b; }
.comment-box { background:#eff6ff; border:1px solid #bfdbfe; border-radius:8px; padding:12px 14px; margin-top:16px; }
.comment-label { font-size:10px; text-transform:uppercase; letter-spacing:0.05em; color:#3b82f6; font-weight:700; margin-bottom:5px; }
.comment-text { font-size:12px; line-height:1.65; color:#0f172a; font-style:italic; }
.sign-row { display:grid; grid-template-columns:1fr 1fr 1fr; gap:24px; margin-top:28px; padding-top:16px; border-top:1px solid #e2e8f0; }
.sign-block { text-align:center; font-size:11px; color:#64748b; }
.sign-line { border-bottom:1px solid #94a3b8; height:28px; margin-bottom:4px; }
.footer-note { margin-top:16px; font-size:10px; color:#94a3b8; text-align:center; }
@media print { body { padding:16px 20px; } }
`;

export default function Reports() {
  const { user, profile, school } = useAuth();
  const [students, setStudents] = useState<Student[]>([]);
  const [scores, setScores] = useState<Score[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTerm, setSelectedTerm] = useState('Term 1');
  const [selectedYear, setSelectedYear] = useState(CURRENT_YEAR);
  const [selectedAssessment, setSelectedAssessment] = useState('Assessment 1');
  const [reportMode, setReportMode] = useState<'assessment' | 'summary'>('assessment');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');


  useEffect(() => {
    if (!user) return;
    async function load() {
      const [studentsRes, scoresRes] = await Promise.all([
        supabase
          .from('students')
          .select('*, class:classes(*, level:levels(*))')
          .eq('teacher_id', user!.id)
          .order('name'),
        supabase
          .from('scores')
          .select('*, subject:subjects(*)')
          .eq('teacher_id', user!.id),
      ]);
      setStudents(studentsRes.data ?? []);
      setScores(scoresRes.data ?? []);
      setLoading(false);
    }
    load();
  }, [user]);

    const reports = useMemo(() =>
    students.map(s => {
      const termScores = scores.filter(sc =>
        sc.term === selectedTerm &&
        sc.year === selectedYear &&
        (reportMode === 'summary' || sc.assessment === selectedAssessment)
      );
      const risk = analyzeStudent(s.id, termScores);
      return generateReportCard(s, risk, selectedTerm, selectedYear);
    }),
    [students, scores, selectedTerm, selectedYear, selectedAssessment, reportMode],
  );

  // Which assessments actually fed into this term's summary — shown on screen and in the printed header
  const summaryAssessmentNames = useMemo(() => {
    const names = new Set(
      scores.filter(sc => sc.term === selectedTerm && sc.year === selectedYear).map(sc => sc.assessment)
    );
    return Array.from(names).sort();
  }, [scores, selectedTerm, selectedYear]);

    

  const filteredReports = useMemo(() =>
    reports.filter(r => r.student.name.toLowerCase().includes(search.toLowerCase())),
    [reports, search],
  );

  // ── Build printable HTML string for a single report ───────────────────────

  function buildPrintHTML(reportId: string): string {
    const report = reports.find(r => r.student.id === reportId);
    if (!report) return '';
    const schoolName = school?.name ?? 'School';
    const className = (report.student as any).class?.name ?? '—';

    const subjectRows = report.risk.subjectPerformances.map(sp => {
      const lvl = sp.cbcLevel.toLowerCase();
      return `<tr>
        <td>${sp.subjectName}</td>
        <td style="text-align:center"><strong>${sp.average}%</strong></td>
        <td style="text-align:center"><span class="badge ${lvl}">${sp.cbcLevel}</span></td>
        <td style="text-align:center"><strong>${sp.cbcSubLevel}</strong></td>
        <td style="text-align:center">${sp.points}</td>
        <td>${getKeyCompetency(sp.subjectName, sp.cbcSubLevel)}</td>
      </tr>`;
    }).join('');

    const ovLvl = report.risk.cbcLevel.toLowerCase();

    return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/>
<title>Report Card — ${report.student.name}</title>
<style>${PRINT_CSS}</style>
</head><body>
<div class="page-header">
  <h1>${schoolName}</h1>
  <h2>CBC Student Report Card — ${report.term} ${report.year} — ${reportMode === 'summary' ? 'Term Summary' : selectedAssessment}</h2>
</div>
<div class="student-meta">
  <div class="meta-row"><span class="meta-label">School:</span><span class="meta-value">${schoolName}</span></div>
  <div class="meta-row"><span class="meta-label">Student Name:</span><span class="meta-value">${report.student.name}</span></div>
  <div class="meta-row"><span class="meta-label">Admission No:</span><span class="meta-value"></span></div>
  <div class="meta-row"><span class="meta-label">Grade / Class:</span><span class="meta-value">${className}</span></div>
  <div class="meta-row"><span class="meta-label">Term:</span><span class="meta-value">${report.term}</span></div>
  <div class="meta-row"><span class="meta-label">Year:</span><span class="meta-value">${report.year}</span></div>
  ${reportMode === 'summary'
    ? `<div class="meta-row"><span class="meta-label">Assessments Included:</span><span class="meta-value">${summaryAssessmentNames.join(', ')}</span></div>`
    : `<div class="meta-row"><span class="meta-label">Assessment:</span><span class="meta-value">${selectedAssessment}</span></div>`
  }
</div>
<div class="section-title">1. Learning Areas Assessment</div>
<table>
  <thead>
    <tr>
      <th>Learning Area</th>
      <th style="text-align:center">Score</th>
      <th style="text-align:center">Level</th>
      <th style="text-align:center">Sub-Level</th>
      <th style="text-align:center">Points</th>
      <th>Key Competencies Demonstrated</th>
    </tr>
  </thead>
  <tbody>
    ${subjectRows}
    <tr class="total-row">
      <td colspan="3"><strong>Overall</strong></td>
      <td style="text-align:center"><strong>${report.risk.cbcSubLevel}</strong></td>
      <td style="text-align:center"><strong>${report.risk.totalPoints}</strong></td>
      <td><strong>Average: ${report.risk.overallAverage}% — <span class="badge ${ovLvl}">${report.risk.cbcLevel}</span> (${report.risk.cbcSubLevel})</strong></td>
    </tr>
  </tbody>
</table>
<div class="comment-box">
  <div class="comment-label">Teacher's Comment</div>
  <div class="comment-text">"${report.teacherComment}"</div>
</div>
<div class="sign-row">
  <div class="sign-block"><div class="sign-line"></div>Class Teacher</div>
  <div class="sign-block"><div class="sign-line"></div>Head Teacher</div>
  <div class="sign-block"><div class="sign-line"></div>Parent / Guardian</div>
</div>
<div class="footer-note">Generated by SANA OS · ${new Date(report.generatedAt).toLocaleDateString('en-KE', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
</body></html>`;
  }

  function downloadReport(reportId: string) {
    const html = buildPrintHTML(reportId);
    if (!html) return;

    const element = document.createElement("div");
    element.innerHTML = html;

    const report = reports.find(r => r.student.id === reportId);

    const opt = {
      margin: 5,
      filename: `Report-Card_${report?.student.name}_${report?.term}_${report?.year}.pdf`
        .replace(/\s+/g, "-"),
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: { scale: 2 },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
    };

    (html2pdf as any)().set(opt).from(element).save();
  }

  function printReport(reportId: string) {
    const html = buildPrintHTML(reportId);
    if (!html) return;
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-7 h-7 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      {/* Page header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center shrink-0">
            <FileText className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Student Reports</h1>
            <p className="text-sm text-slate-500">CBC-format individual report cards · print-ready</p>
          </div>
        </div>

        {/* Controls */}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search student…"
              className="w-full pl-8 pr-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <select
            value={selectedTerm}
            onChange={e => setSelectedTerm(e.target.value)}
            className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {TERMS.map(t => <option key={t}>{t}</option>)}
          </select>
                    <div className="flex rounded-xl border border-slate-200 overflow-hidden shrink-0">
            <button
              onClick={() => setReportMode('assessment')}
              className={`px-3 py-2.5 text-sm font-semibold transition ${
                reportMode === 'assessment' ? 'bg-blue-700 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              Per-Assessment
            </button>
            <button
              onClick={() => setReportMode('summary')}
              className={`px-3 py-2.5 text-sm font-semibold transition ${
                reportMode === 'summary' ? 'bg-blue-700 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              Term Summary
            </button>
          </div>
          {reportMode === 'assessment' && (
            <select
              value={selectedAssessment}
              onChange={e => setSelectedAssessment(e.target.value)}
              className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {Array.from(new Set(scores.map(sc => sc.assessment))).sort().map(name => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          )}
        </div>
        {reportMode === 'summary' && summaryAssessmentNames.length > 0 && (
          <p className="mt-2 text-xs text-slate-500">
            Term Summary averages: <span className="font-medium text-slate-700">{summaryAssessmentNames.join(', ')}</span>
          </p>
        )}
        <div className="mt-3">
          <select
            value={selectedYear}
            onChange={e => setSelectedYear(e.target.value)}
            className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {[-1, 0, 1].map(offset => {
              const y = (parseInt(CURRENT_YEAR) + offset).toString();
              return <option key={y} value={y}>{y}</option>;
            })}
          </select>
        </div>
      </div>

      {/* CBC Level legend */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 mb-5 overflow-x-auto">
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-3">CBC Competency Levels Reference</p>
        <div className="flex gap-2 flex-wrap">
          {CBC_SUB_LEVELS.map(sl => (
            <div
              key={sl.subLevel}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium ${getSubLevelColor(sl.subLevel)}`}
            >
              <span className="font-black">{sl.subLevel}</span>
              <span className="opacity-60">·</span>
              <span className="hidden sm:inline">{sl.descriptor}</span>
              <span className="opacity-50">{sl.minScore}–{sl.maxScore}%</span>
              <span className="font-bold">{sl.points}pt</span>
            </div>
          ))}
        </div>
      </div>

      {students.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-12 text-center">
          <FileText className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="font-medium text-slate-600">No reports available</p>
          <p className="text-sm text-slate-400 mt-1">Add students and enter scores to generate report cards.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredReports.map(report => {
            const colors = getRiskColor(report.risk.riskLevel);
            const isExpanded = expandedId === report.student.id;

            return (
              <div key={report.student.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                {/* Collapsed row */}
                <button
                  className="w-full flex items-center gap-4 px-5 py-4 hover:bg-slate-50 transition text-left"
                  onClick={() => setExpandedId(isExpanded ? null : report.student.id)}
                >
                  <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
                    <span className="font-bold text-blue-700 text-sm">{report.student.name.charAt(0).toUpperCase()}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-900 truncate">{report.student.name}</p>
                    <p className="text-xs text-slate-400 mt-0.5 truncate">
                      {(report.student as any).class?.name ?? 'No class'} · {report.risk.overallAverage}% avg · {report.risk.totalPoints} pts
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                    <span className={`text-xs font-black px-2.5 py-1 rounded-full ${getSubLevelColor(report.risk.cbcSubLevel)}`}>
                      {report.risk.cbcSubLevel}
                    </span>
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${colors.badge}`}>
                      {getRiskLabel(report.risk.riskLevel)}
                    </span>
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                  </div>
                </button>

                {/* Expanded */}
                {isExpanded && (
                  <div className="border-t border-slate-100 p-5">
                    {/* Student metadata — screenshot 2 header */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2.5 mb-6 pb-5 border-b border-slate-100">
                      {[
                        { label: 'School', value: school?.name ?? '—' },
                        { label: 'Student Name', value: report.student.name },
                        { label: 'Admission No', value: '—' },
                        { label: 'Grade / Class', value: (report.student as any).class?.name ?? '—' },
                        { label: 'Term', value: report.term },
                        { label: 'Year', value: report.year },
                      ].map(({ label, value }) => (
                        <div key={label} className="flex items-baseline gap-2">
                          <span className="text-xs font-bold text-slate-700 whitespace-nowrap shrink-0">{label}:</span>
                          <span className="text-xs text-slate-900 border-b border-slate-300 flex-1 pb-0.5 min-w-0 truncate">{value}</span>
                        </div>
                      ))}
                    </div>

                    {/* Section title */}
                    <h3 className="text-sm font-black uppercase tracking-wide text-slate-800 mb-4">
                      1. Learning Areas Assessment
                    </h3>

                    {/* Learning areas table — screenshot 2 */}
                    {report.risk.subjectPerformances.length > 0 ? (
                      <div className="rounded-xl overflow-hidden border border-slate-200 mb-5">
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="bg-slate-50 border-b border-slate-200">
                                <th className="text-left px-4 py-3 font-bold text-slate-700 text-xs uppercase tracking-wide min-w-36">Learning Area</th>
                                <th className="text-center px-3 py-3 font-bold text-slate-700 text-xs uppercase tracking-wide w-16">Score</th>
                                <th className="text-center px-3 py-3 font-bold text-slate-700 text-xs uppercase tracking-wide w-20">Level</th>
                                <th className="text-center px-3 py-3 font-bold text-slate-700 text-xs uppercase tracking-wide w-24">Sub-Level</th>
                                <th className="text-center px-3 py-3 font-bold text-slate-700 text-xs uppercase tracking-wide w-16">Points</th>
                                <th className="text-left px-4 py-3 font-bold text-slate-700 text-xs uppercase tracking-wide">Key Competencies Demonstrated</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {report.risk.subjectPerformances.map(sp => (
                                <tr key={sp.subjectId} className="hover:bg-slate-50 transition">
                                  <td className="px-4 py-3 font-medium text-slate-900">{sp.subjectName}</td>
                                  <td className="px-3 py-3 text-center font-bold text-slate-900">{sp.average}%</td>
                                  <td className="px-3 py-3 text-center">
                                    <span className={`text-xs font-bold px-2 py-0.5 rounded-lg ${getCBCColor(sp.cbcLevel)}`}>
                                      {sp.cbcLevel}
                                    </span>
                                  </td>
                                  <td className="px-3 py-3 text-center">
                                    <span className={`text-xs font-black px-2.5 py-1 rounded-lg ${getSubLevelColor(sp.cbcSubLevel)}`}>
                                      {sp.cbcSubLevel}
                                    </span>
                                  </td>
                                  <td className="px-3 py-3 text-center font-bold text-slate-700">{sp.points}</td>
                                  <td className="px-4 py-3 text-xs text-slate-600 leading-relaxed">
                                    {getKeyCompetency(sp.subjectName, sp.cbcSubLevel)}
                                  </td>
                                </tr>
                              ))}
                              {/* Overall row */}
                              <tr className="bg-blue-50 border-t-2 border-blue-200">
                                <td className="px-4 py-2.5 font-bold text-slate-900" colSpan={3}>Overall</td>
                                <td className="px-3 py-2.5 text-center">
                                  <span className={`text-xs font-black px-2.5 py-1 rounded-lg ${getSubLevelColor(report.risk.cbcSubLevel)}`}>
                                    {report.risk.cbcSubLevel}
                                  </span>
                                </td>
                                <td className="px-3 py-2.5 text-center font-black text-blue-700">{report.risk.totalPoints}</td>
                                <td className="px-4 py-2.5 text-xs font-semibold text-blue-700">
                                  Average: {report.risk.overallAverage}% —{' '}
                                  <span className={`font-black px-1.5 py-0.5 rounded ${getCBCColor(report.risk.cbcLevel)}`}>
                                    {report.risk.cbcLevel}
                                  </span>
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ) : (
                      <div className="bg-slate-50 rounded-xl border border-slate-100 p-6 text-center mb-5">
                        <p className="text-sm text-slate-400">No scores for {report.term} yet.</p>
                      </div>
                    )}

                    {/* Teacher comment */}
                    <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 mb-5">
                      <div className="flex items-center gap-2 mb-2">
                        <Sparkles className="w-3.5 h-3.5 text-blue-400" />
                        <p className="text-[10px] uppercase tracking-widest text-blue-500 font-bold">Teacher's Comment</p>
                      </div>
                      <p className="text-sm text-slate-700 leading-relaxed italic">"{report.teacherComment}"</p>
                    </div>

                    {/* Signature row */}
                    <div className="grid grid-cols-3 gap-4 mb-4 pt-2">
                      {['Class Teacher', 'Head Teacher', 'Parent / Guardian'].map(sig => (
                        <div key={sig} className="text-center">
                          <div className="border-b border-slate-300 h-8 mb-1" />
                          <p className="text-[10px] text-slate-400">{sig}</p>
                        </div>
                      ))}
                    </div>

                    <p className="text-[10px] text-slate-400 mt-1">
                      Generated: {new Date(report.generatedAt).toLocaleDateString('en-KE', { day: 'numeric', month: 'long', year: 'numeric' })}
                      {' · '}SANA OS
                    </p>

                    {/* Download / Print buttons */}
                    <div className="mt-4 pt-4 border-t border-slate-100 flex items-center gap-2">
                      <button
                        onClick={() => downloadReport(report.student.id)}
                        className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-xl transition shadow-sm"
                      >
                        <Download className="w-4 h-4" />
                        Download
                      </button>
                      <button
                        onClick={() => printReport(report.student.id)}
                        className="flex items-center gap-2 border border-slate-200 hover:border-blue-300 hover:bg-blue-50 text-slate-700 hover:text-blue-700 text-sm font-medium px-4 py-2 rounded-xl transition"
                      >
                        <Printer className="w-4 h-4" />
                        Print
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
