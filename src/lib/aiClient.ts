// aiClient.ts — browser-side wrapper around the ai-insights Supabase Edge Function
// API key never touches the browser; all AI calls are proxied through the edge function.

const FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-insights`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// ── Payload types (must mirror edge function input) ───────────────────────────

export interface CommentPayload {
  studentName: string;
  subjectName: string;
  strandName: string;
  subStrandName: string;
  score: number;
  cbcLevel: 'EE' | 'ME' | 'AE' | 'BE';
  term: string;
  priorAssessments?: Array<{ term: string; score: number; cbcLevel: string }>;
  /** When true, returns a plain-language summary safe to share with parents */
  forParent?: boolean;
}

export interface TrendPayload {
  studentName: string;
  subjectName: string;
  subStrandName: string;
  assessments: Array<{ term: string; score: number; cbcLevel: string }>;
}

// ── Core fetch ────────────────────────────────────────────────────────────────

async function callAI(
  type: 'comment' | 'trend',
  payload: CommentPayload | TrendPayload,
): Promise<string> {
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

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Generate a CBC-aligned teacher comment (or parent-friendly summary).
 * Includes: performance observation, teaching recommendation, activity suggestion.
 */
export function generateComment(payload: CommentPayload): Promise<string> {
  return callAI('comment', payload);
}

/**
 * Generate a trend-based prediction for a student's sub-strand performance history.
 * Warns if declining, encourages if improving.
 */
export function generateTrendInsight(payload: TrendPayload): Promise<string> {
  return callAI('trend', payload);
}
