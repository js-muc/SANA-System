import type { Score } from './supabase';

export type CBCLevel = 'EE' | 'ME' | 'AE' | 'BE';
export type RiskLevel = 'safe' | 'at-risk' | 'critical';

export type SubjectPerformance = {
  subjectId: string;
  subjectName: string;
  scores: number[];
  average: number;
  trend: 'improving' | 'stable' | 'declining';
  cbcLevel: CBCLevel;
};

export type StudentRisk = {
  studentId: string;
  overallAverage: number;
  riskLevel: RiskLevel;
  cbcLevel: CBCLevel;
  reasons: string[];
  suggestedActions: string[];
  subjectPerformances: SubjectPerformance[];
};

export function getCBCLevel(score: number): CBCLevel {
  if (score >= 80) return 'EE';
  if (score >= 60) return 'ME';
  if (score >= 40) return 'AE';
  return 'BE';
}

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
    subjectPerformances.push({
      subjectId,
      subjectName: data.name,
      scores: vals,
      average: Math.round(avg * 10) / 10,
      trend: getTrend(vals),
      cbcLevel: getCBCLevel(avg),
    });
  }

  const allScoreValues = studentScores.map(s => s.score);
  const overallAverage =
    allScoreValues.length > 0
      ? Math.round((allScoreValues.reduce((a, b) => a + b, 0) / allScoreValues.length) * 10) / 10
      : 0;

  const weakSubjects = subjectPerformances.filter(sp => sp.cbcLevel === 'BE');
  const decliningSubjects = subjectPerformances.filter(sp => sp.trend === 'declining');
  const lowSubjects = subjectPerformances.filter(sp => sp.average < 40);

  const reasons: string[] = [];
  const suggestedActions: string[] = [];

  let riskLevel: RiskLevel = 'safe';

  if (overallAverage < 40 || weakSubjects.length >= 2 || lowSubjects.length >= 2) {
    riskLevel = 'critical';
  } else if (
    overallAverage < 60 ||
    decliningSubjects.length >= 1 ||
    weakSubjects.length >= 1
  ) {
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

  if (riskLevel === 'safe' && overallAverage >= 80) {
    reasons.push('Performing excellently across all subjects');
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
    riskLevel,
    cbcLevel: getCBCLevel(overallAverage),
    reasons,
    suggestedActions,
    subjectPerformances,
  };
}

export function getRiskColor(risk: RiskLevel) {
  switch (risk) {
    case 'safe': return { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-500', badge: 'bg-emerald-100 text-emerald-800' };
    case 'at-risk': return { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', dot: 'bg-amber-500', badge: 'bg-amber-100 text-amber-800' };
    case 'critical': return { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', dot: 'bg-red-500', badge: 'bg-red-100 text-red-800' };
  }
}

export function getCBCColor(level: CBCLevel) {
  switch (level) {
    case 'EE': return 'bg-emerald-100 text-emerald-800';
    case 'ME': return 'bg-blue-100 text-blue-800';
    case 'AE': return 'bg-amber-100 text-amber-800';
    case 'BE': return 'bg-red-100 text-red-800';
  }
}
