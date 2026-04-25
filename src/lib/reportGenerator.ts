// reportGenerator.ts
// Generates CBC-format student report cards (screen & print).
// OpenAI API scaffold is wired here — when VITE_OPENAI_API_KEY is set,
// generateAIComment() will call GPT to produce richer teacher comments.
// Until then, deterministic comments are used as fallback.

import type { StudentRisk, CBCLevel, CBCSubLevel } from './riskEngine';
import { getKeyCompetency } from './riskEngine';
import type { Student } from './supabase';

// ── Types ─────────────────────────────────────────────────────────────────────

export type ReportCard = {
  student: Student;
  risk: StudentRisk;
  term: string;
  year: string;
  teacherComment: string;
  generatedAt: string;
};

// ── OpenAI scaffold ───────────────────────────────────────────────────────────
// FUTURE: When VITE_OPENAI_API_KEY is available this function sends the full
// student performance profile to OpenAI and returns an AI-generated comment.
// The function signature and interface are fixed — only the implementation
// body needs to be uncommented when the key is provisioned.

export interface OpenAICommentPayload {
  studentName: string;
  className: string;
  term: string;
  year: string;
  overallAverage: number;
  cbcLevel: CBCLevel;
  cbcSubLevel: CBCSubLevel;
  subjects: Array<{
    name: string;
    score: number;
    cbcLevel: CBCLevel;
    cbcSubLevel: CBCSubLevel;
    trend: string;
  }>;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function generateAIComment(_payload: OpenAICommentPayload): Promise<string | null> {
  // FUTURE OpenAI integration — uncomment and configure when API key is available:
  //
  // const apiKey = import.meta.env.VITE_OPENAI_API_KEY;
  // if (!apiKey) return null;
  //
  // const response = await fetch('https://api.openai.com/v1/chat/completions', {
  //   method: 'POST',
  //   headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
  //   body: JSON.stringify({
  //     model: 'gpt-4o-mini',
  //     max_tokens: 120,
  //     messages: [{
  //       role: 'user',
  //       content: `Write a professional CBC report card teacher's comment for ${_payload.studentName}.
  //         Class: ${_payload.className}, Term: ${_payload.term}, Year: ${_payload.year}.
  //         Overall: ${_payload.overallAverage}% (${_payload.cbcLevel} - ${_payload.cbcSubLevel}).
  //         Subjects: ${_payload.subjects.map(s => `${s.name}: ${s.score}% (${s.cbcSubLevel})`).join(', ')}.
  //         Write 2-3 sentences. Be encouraging and specific. Professional tone.`
  //     }],
  //   }),
  // });
  // const data = await response.json();
  // return data.choices?.[0]?.message?.content?.trim() ?? null;

  return null; // deterministic fallback used until OpenAI key is set
}

// ── Deterministic comment generator (fallback) ────────────────────────────────

function generateTeacherComment(risk: StudentRisk, studentName: string): string {
  const firstName = studentName.split(' ')[0];
  const avg = risk.overallAverage;
  const subLevel = risk.cbcSubLevel;

  const levelMap: Record<string, string> = {
    EE1: 'Exceptional / Excellent',
    EE2: 'Very Good',
    ME1: 'Good',
    ME2: 'Fair / Satisfactory',
    AE1: 'Needs Improvement',
    AE2: 'Below Average',
    BE1: 'Well Below Average',
    BE2: 'Minimal / Poor',
  };
  const levelDesc = levelMap[subLevel] ?? 'In Progress';

  if (risk.riskLevel === 'critical') {
    const weakSubjects = risk.subjectPerformances.filter(s => s.cbcLevel === 'BE').map(s => s.subjectName);
    const subjectText = weakSubjects.length > 0 ? ` particularly in ${weakSubjects.join(' and ')}` : '';
    return `${firstName} is performing at ${levelDesc} level with an overall average of ${avg}%. The learner requires urgent intervention${subjectText}. A parent-teacher conference is strongly recommended to develop a targeted support plan.`;
  }

  if (risk.riskLevel === 'at-risk') {
    const declining = risk.subjectPerformances.filter(s => s.trend === 'declining').map(s => s.subjectName);
    if (declining.length > 0) {
      return `${firstName} is performing at ${levelDesc} level with an overall average of ${avg}%. Declining performance in ${declining.join(' and ')} requires attention. Additional support and consistent monitoring are recommended this term.`;
    }
    return `${firstName} is performing at ${levelDesc} level with an overall average of ${avg}%. The learner shows potential but needs additional support to reach expected performance levels. Remedial activities are encouraged.`;
  }

  if (avg >= 90) {
    return `${firstName} is performing at ${levelDesc} level with an outstanding average of ${avg}%. The learner demonstrates exceptional mastery across all learning areas and is a role model to peers. Excellent work!`;
  }
  if (avg >= 75) {
    return `${firstName} is performing at ${levelDesc} level with an impressive average of ${avg}%. The learner demonstrates excellent understanding across learning areas and shows great enthusiasm. Keep up the outstanding work!`;
  }

  return `${firstName} is performing at ${levelDesc} level with an average of ${avg}%. The learner shows satisfactory progress and demonstrates good understanding of core concepts. Continued effort will yield even better results.`;
}

// ── Public API ────────────────────────────────────────────────────────────────

export function generateReportCard(
  student: Student,
  risk: StudentRisk,
  term: string,
  year?: string,
): ReportCard {
  return {
    student,
    risk,
    term,
    year: year ?? new Date().getFullYear().toString(),
    teacherComment: generateTeacherComment(risk, student.name),
    generatedAt: new Date().toISOString(),
  };
}

export function getRiskLabel(risk: StudentRisk['riskLevel']): string {
  switch (risk) {
    case 'safe':     return 'No Intervention Needed';
    case 'at-risk':  return 'Monitoring Required';
    case 'critical': return 'Immediate Intervention';
  }
}

// Export the OpenAI payload builder for use in the Reports page
export function buildOpenAIPayload(
  student: Student,
  risk: StudentRisk,
  term: string,
  year: string,
): OpenAICommentPayload {
  return {
    studentName: student.name,
    className: (student as any).class?.name ?? '',
    term,
    year,
    overallAverage: risk.overallAverage,
    cbcLevel: risk.cbcLevel,
    cbcSubLevel: risk.cbcSubLevel,
    subjects: risk.subjectPerformances.map(sp => ({
      name: sp.subjectName,
      score: sp.average,
      cbcLevel: sp.cbcLevel,
      cbcSubLevel: sp.cbcSubLevel,
      trend: sp.trend,
    })),
  };
}

// Re-export for convenience
export { getKeyCompetency };
