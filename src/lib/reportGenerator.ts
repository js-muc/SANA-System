import type { StudentRisk, CBCLevel } from './riskEngine';
import type { Student } from './supabase';

export type ReportCard = {
  student: Student;
  risk: StudentRisk;
  term: string;
  teacherComment: string;
  generatedAt: string;
};

function getCBCDescription(level: CBCLevel): string {
  switch (level) {
    case 'EE': return 'Exceeding Expectation';
    case 'ME': return 'Meeting Expectation';
    case 'AE': return 'Approaching Expectation';
    case 'BE': return 'Below Expectation';
  }
}

function generateTeacherComment(risk: StudentRisk, studentName: string): string {
  const firstName = studentName.split(' ')[0];
  const cbcDesc = getCBCDescription(risk.cbcLevel);
  const avg = risk.overallAverage;

  if (risk.riskLevel === 'critical') {
    const weakSubjects = risk.subjectPerformances.filter(s => s.cbcLevel === 'BE').map(s => s.subjectName);
    const subjectText = weakSubjects.length > 0 ? ` particularly in ${weakSubjects.join(' and ')}` : '';
    return `${firstName} is currently ${cbcDesc} with an average of ${avg}%. The learner requires urgent intervention${subjectText}. A parent-teacher conference is strongly recommended to develop a targeted support plan.`;
  }

  if (risk.riskLevel === 'at-risk') {
    const declining = risk.subjectPerformances.filter(s => s.trend === 'declining').map(s => s.subjectName);
    if (declining.length > 0) {
      return `${firstName} is ${cbcDesc} with an average of ${avg}%. The learner shows declining performance in ${declining.join(' and ')} and would benefit from additional support and regular monitoring this term.`;
    }
    return `${firstName} is ${cbcDesc} with an average of ${avg}%. The learner shows potential but requires additional support to reach expected performance levels. Remedial activities are recommended.`;
  }

  if (avg >= 80) {
    return `${firstName} is ${cbcDesc} with an impressive average of ${avg}%. The learner demonstrates excellent understanding across subjects and shows great enthusiasm for learning. Keep up the outstanding work!`;
  }

  return `${firstName} is ${cbcDesc} with an average of ${avg}%. The learner shows satisfactory progress and demonstrates good understanding of core concepts. Continued effort will help achieve even better results.`;
}

export function generateReportCard(student: Student, risk: StudentRisk, term: string): ReportCard {
  return {
    student,
    risk,
    term,
    teacherComment: generateTeacherComment(risk, student.name),
    generatedAt: new Date().toISOString(),
  };
}

export function getRiskLabel(risk: StudentRisk['riskLevel']): string {
  switch (risk) {
    case 'safe': return 'No Intervention Needed';
    case 'at-risk': return 'Monitoring Required';
    case 'critical': return 'Immediate Intervention';
  }
}
