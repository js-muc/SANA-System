import type { Score } from './supabase';

// ── CBC Sub-level system (screenshot 1) ──────────────────────────────────────
// Major Level | Sub-Level | Descriptor           | % Range  | Points
// EE          | EE1       | Exceptional/Excellent | 90–100%  | 8
// EE          | EE2       | Very Good             | 75–89%   | 7
// ME          | ME1       | Good                  | 58–74%   | 6
// ME          | ME2       | Fair / Satisfactory   | 41–57%   | 5
// AE          | AE1       | Needs Improvement     | 31–40%   | 4
// AE          | AE2       | Below Average         | 21–30%   | 3
// BE          | BE1       | Well Below Average    | 11–20%   | 2
// BE          | BE2       | Minimal / Poor        | 1–10%    | 1

export type CBCLevel = 'EE' | 'ME' | 'AE' | 'BE';
export type CBCSubLevel = 'EE1' | 'EE2' | 'ME1' | 'ME2' | 'AE1' | 'AE2' | 'BE1' | 'BE2';
export type RiskLevel = 'safe' | 'at-risk' | 'critical';

export type SubLevelInfo = {
  subLevel: CBCSubLevel;
  majorLevel: CBCLevel;
  descriptor: string;
  minScore: number;
  maxScore: number;
  points: number;
};

export const CBC_SUB_LEVELS: SubLevelInfo[] = [
  { subLevel: 'EE1', majorLevel: 'EE', descriptor: 'Exceptional / Excellent', minScore: 90, maxScore: 100, points: 8 },
  { subLevel: 'EE2', majorLevel: 'EE', descriptor: 'Very Good',               minScore: 75, maxScore: 89,  points: 7 },
  { subLevel: 'ME1', majorLevel: 'ME', descriptor: 'Good',                    minScore: 58, maxScore: 74,  points: 6 },
  { subLevel: 'ME2', majorLevel: 'ME', descriptor: 'Fair / Satisfactory',     minScore: 41, maxScore: 57,  points: 5 },
  { subLevel: 'AE1', majorLevel: 'AE', descriptor: 'Needs Improvement',       minScore: 31, maxScore: 40,  points: 4 },
  { subLevel: 'AE2', majorLevel: 'AE', descriptor: 'Below Average',           minScore: 21, maxScore: 30,  points: 3 },
  { subLevel: 'BE1', majorLevel: 'BE', descriptor: 'Well Below Average',      minScore: 11, maxScore: 20,  points: 2 },
  { subLevel: 'BE2', majorLevel: 'BE', descriptor: 'Minimal / Poor',          minScore: 1,  maxScore: 10,  points: 1 },
];

/** Returns the full sub-level info for a given score (0-100) */
export function getSubLevelInfo(score: number): SubLevelInfo {
  for (const sl of CBC_SUB_LEVELS) {
    if (score >= sl.minScore && score <= sl.maxScore) return sl;
  }
  // score = 0 → treat as BE2
  return CBC_SUB_LEVELS[CBC_SUB_LEVELS.length - 1];
}

/** Returns major CBC level from score */
export function getCBCLevel(score: number): CBCLevel {
  return getSubLevelInfo(score).majorLevel;
}

/** Returns sub-level string (e.g. "EE1") from score */
export function getCBCSubLevel(score: number): CBCSubLevel {
  return getSubLevelInfo(score).subLevel;
}

/** Returns points (1-8) from score */
export function getCBCPoints(score: number): number {
  return getSubLevelInfo(score).points;
}

// ── Competency key competency descriptions per sub-level ─────────────────────
// Used in report cards — "Key Competencies Demonstrated" column (screenshot 2)

export function getKeyCompetency(subjectName: string, subLevel: CBCSubLevel): string {
  const level = subLevel.slice(0, 2) as CBCLevel;
  const templates: Record<CBCLevel, string[]> = {
    EE: [
      `Demonstrates outstanding mastery in ${subjectName}; applies concepts confidently in new situations.`,
      `Shows excellent understanding of ${subjectName}; communicates ideas clearly and effectively.`,
    ],
    ME: [
      `Understands core concepts in ${subjectName}; actively participates and meets learning expectations.`,
      `Shows good grasp of ${subjectName}; demonstrates satisfactory performance across most activities.`,
    ],
    AE: [
      `Developing understanding in ${subjectName}; needs consistent support to reach expected level.`,
      `Shows limited grasp of ${subjectName}; requires additional practice and guided activities.`,
    ],
    BE: [
      `Experiencing significant difficulty in ${subjectName}; requires targeted intervention and remediation.`,
      `Minimal engagement with ${subjectName} concepts; urgent support and parental involvement recommended.`,
    ],
  };
  const options = templates[level];
  // EE1/ME1/AE1/BE1 → index 0; EE2/ME2/AE2/BE2 → index 1
  return options[subLevel.endsWith('1') ? 0 : 1];
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type SubjectPerformance = {
  subjectId: string;
  subjectName: string;
  scores: number[];
  average: number;
  trend: 'improving' | 'stable' | 'declining';
  cbcLevel: CBCLevel;
  cbcSubLevel: CBCSubLevel;
  points: number;
};

export type StudentRisk = {
  studentId: string;
  overallAverage: number;
  totalPoints: number;
  riskLevel: RiskLevel;
  cbcLevel: CBCLevel;
  cbcSubLevel: CBCSubLevel;
  reasons: string[];
  suggestedActions: string[];
  subjectPerformances: SubjectPerformance[];
};

// ── Core functions ─────────────────────────────────────────────────────────────

function getTrend(scores: number[]): 'improving' | 'stable' | 'declining' {
  if (scores.length < 2) return 'stable';
  const recent = scores.slice(-3);
  if (recent.length < 2) return 'stable';
  const diff = recent[recent.length - 1] - recent[0];
  if (diff > 5) return 'improving';
  if (diff < -5) return 'declining';
  return 'stable';
}

export function analyzeStudent(studentId: string, scores: Score[]): StudentRisk {
  const studentScores = scores.filter(s => s.student_id === studentId);

  const subjectMap = new Map<string, { name: string; scores: { score: number; date: string }[] }>();
  for (const s of studentScores) {
    const name = s.subject?.name ?? 'Unknown';
    if (!subjectMap.has(s.subject_id)) {
      subjectMap.set(s.subject_id, { name, scores: [] });
    }
    subjectMap.get(s.subject_id)!.scores.push({ score: s.score, date: s.created_at });
  }

  const subjectPerformances: SubjectPerformance[] = [];
  for (const [subjectId, data] of subjectMap.entries()) {
    const sorted = data.scores.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const vals = sorted.map(s => s.score);
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    const roundedAvg = Math.round(avg * 10) / 10;
    const subInfo = getSubLevelInfo(roundedAvg);
    subjectPerformances.push({
      subjectId,
      subjectName: data.name,
      scores: vals,
      average: roundedAvg,
      trend: getTrend(vals),
      cbcLevel: subInfo.majorLevel,
      cbcSubLevel: subInfo.subLevel,
      points: subInfo.points,
    });
  }

  const allScoreValues = studentScores.map(s => s.score);
  const overallAverage =
    allScoreValues.length > 0
      ? Math.round((allScoreValues.reduce((a, b) => a + b, 0) / allScoreValues.length) * 10) / 10
      : 0;

  const totalPoints = subjectPerformances.reduce((acc, sp) => acc + sp.points, 0);
  const overallSubInfo = getSubLevelInfo(overallAverage);

  const weakSubjects = subjectPerformances.filter(sp => sp.cbcLevel === 'BE');
  const decliningSubjects = subjectPerformances.filter(sp => sp.trend === 'declining');
  const lowSubjects = subjectPerformances.filter(sp => sp.average < 40);

  const reasons: string[] = [];
  const suggestedActions: string[] = [];
  let riskLevel: RiskLevel = 'safe';

  if (overallAverage < 40 || weakSubjects.length >= 2 || lowSubjects.length >= 2) {
    riskLevel = 'critical';
  } else if (overallAverage < 58 || decliningSubjects.length >= 1 || weakSubjects.length >= 1) {
    riskLevel = 'at-risk';
  }

  if (weakSubjects.length > 0) {
    reasons.push(`Below expectation in ${weakSubjects.map(s => s.subjectName).join(', ')}`);
    suggestedActions.push(`Immediate remedial support for ${weakSubjects[0].subjectName}`);
  }
  if (decliningSubjects.length > 0) {
    reasons.push(`Performance declining in ${decliningSubjects.map(s => s.subjectName).join(', ')}`);
    suggestedActions.push('Schedule one-on-one session to identify learning barriers');
  }
  if (overallAverage < 40 && reasons.length === 0) {
    reasons.push('Overall performance below acceptable threshold');
    suggestedActions.push('Urgent parent-teacher conference required');
  }
  if (riskLevel === 'safe' && overallAverage >= 75) {
    reasons.push('Performing excellently across all learning areas');
    suggestedActions.push('Consider enrichment activities to maintain engagement');
  } else if (riskLevel === 'safe') {
    reasons.push('Performance within acceptable range');
    suggestedActions.push('Continue monitoring progress each term');
  }
  if (weakSubjects.length >= 2) {
    suggestedActions.push('Peer tutoring session recommended');
  }

  return {
    studentId,
    overallAverage,
    totalPoints,
    riskLevel,
    cbcLevel: overallSubInfo.majorLevel,
    cbcSubLevel: overallSubInfo.subLevel,
    reasons,
    suggestedActions,
    subjectPerformances,
  };
}

// ── Color helpers ─────────────────────────────────────────────────────────────

export function getRiskColor(risk: RiskLevel) {
  switch (risk) {
    case 'safe':     return { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-500', badge: 'bg-emerald-100 text-emerald-800' };
    case 'at-risk':  return { bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200',   dot: 'bg-amber-500',   badge: 'bg-amber-100 text-amber-800' };
    case 'critical': return { bg: 'bg-red-50',     text: 'text-red-700',     border: 'border-red-200',     dot: 'bg-red-500',     badge: 'bg-red-100 text-red-800' };
  }
}

export function getCBCColor(level: CBCLevel): string {
  switch (level) {
    case 'EE': return 'bg-emerald-100 text-emerald-800';
    case 'ME': return 'bg-blue-100 text-blue-800';
    case 'AE': return 'bg-amber-100 text-amber-800';
    case 'BE': return 'bg-red-100 text-red-800';
  }
}

export function getSubLevelColor(subLevel: CBCSubLevel): string {
  if (subLevel.startsWith('EE')) return 'bg-emerald-100 text-emerald-800';
  if (subLevel.startsWith('ME')) return 'bg-blue-100 text-blue-800';
  if (subLevel.startsWith('AE')) return 'bg-amber-100 text-amber-800';
  return 'bg-red-100 text-red-800';
}
