// aiClient.ts — thin wrapper around the ai-insights Supabase Edge Function
// All AI calls go through this module so the API key never touches the browser.

const FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-insights`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// ── Payload types (must match edge function) ─────────────────────────────────

export interface CommentPayload {
  studentName: string;
  subjectName: string;
  strandName: string;
  subStrandName: string;
  score: number;
  cbcLevel: 'EE' | 'ME' | 'AE' | 'BE';
  term: string;
  priorAssessments?: Array<{ term: string; score: number; cbcLevel: string }>;
}

export interface TrendPayload {
  studentName: string;
  subjectName: string;
  subStrandName: string;
  assessments: Array<{ term: string; score: number; cbcLevel: string }>;
}

// ── Core fetch helper ────────────────────────────────────────────────────────

async function callAI(type: 'comment' | 'trend', payload: CommentPayload | TrendPayload): Promise<string> {
  const res = await fetch(FUNCTION_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${ANON_KEY}`,
      Apikey: ANON_KEY,
    },
    body: JSON.stringify({ type, payload }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `AI request failed (${res.status})`);
  }

  const data = await res.json();
  return data.result as string;
}

// ── Public API ───────────────────────────────────────────────────────────────

/** Generate teacher comment + recommendation + activity for a single assessment */
export function generateComment(payload: CommentPayload): Promise<string> {
  return callAI('comment', payload);
}

/** Generate a trend prediction statement for a student's sub-strand history */
export function generateTrendInsight(payload: TrendPayload): Promise<string> {
  return callAI('trend', payload);
}
