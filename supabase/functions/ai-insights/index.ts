// ai-insights — Optimized for scale (OpenAI + caching + fallback)

import OpenAI from "npm:openai";

// ── Config ─────────────────────────────────────────

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const openai = new OpenAI({
  apiKey: Deno.env.get("OPENAI_API_KEY"),
});

// ── Simple in-memory cache (fast + cheap) ───────────

const cache = new Map<string, string>();

function getCacheKey(type: string, payload: any): string {
  return `${type}:${JSON.stringify(payload)}`;
}

// ── Payload types (UNCHANGED) ───────────────────────

interface CommentPayload {
  studentName: string;
  subjectName: string;
  strandName: string;
  subStrandName: string;
  score: number;
  cbcLevel: "EE" | "ME" | "AE" | "BE";
  term: string;
  priorAssessments?: Array<{ term: string; score: number; cbcLevel: string }>;
  forParent?: boolean;
}

interface TrendPayload {
  studentName: string;
  subjectName: string;
  subStrandName: string;
  assessments: Array<{ term: string; score: number; cbcLevel: string }>;
}

// ── CBC label (UNCHANGED) ───────────────────────────

function cbcLabel(level: string): string {
  return (
    {
      EE: "Exceeding Expectations",
      ME: "Meeting Expectations",
      AE: "Approaching Expectations",
      BE: "Below Expectations",
    }[level] ?? level
  );
}

// ── Rule-based fallback (NEW — saves cost) ─────────

function generateRuleComment(p: CommentPayload): string | null {
  // Only trigger for clear cases (avoid AI call)
  if (p.score >= 90) {
    return `${p.studentName} demonstrates excellent mastery in ${p.subStrandName}. The learner applies concepts confidently and works independently. Keep up the outstanding performance.`;
  }

  if (p.score < 40) {
    return `${p.studentName} is currently below expected level in ${p.subStrandName}. The learner requires guided support and consistent practice to improve understanding. Focus on foundational concepts is recommended.`;
  }

  return null; // Use AI for middle range
}

// ── Prompts (UNCHANGED — your strength) ─────────────

function buildCommentPrompt(p: CommentPayload): string {
  const priorContext =
    p.priorAssessments && p.priorAssessments.length > 0
      ? `Prior results: ${p.priorAssessments
          .map(a => `${a.term}: ${a.score}% (${cbcLabel(a.cbcLevel)})`)
          .join("; ")}.`
      : "This is the learner's first recorded assessment in this sub-strand.";

  return `You are an experienced primary/secondary school teacher writing a professional CBC competency comment.

Learner: ${p.studentName}
Subject / Learning Area: ${p.subjectName}
Strand: ${p.strandName}
Sub-strand: ${p.subStrandName}
Term: ${p.term}
Score: ${p.score}% — ${cbcLabel(p.cbcLevel)}
${priorContext}

Write exactly THREE labelled sections. Each section: 2–3 sentences. Plain text only — no markdown.

COMMENT:
RECOMMENDATION:
ACTIVITY:

Total response: under 120 words.`;
}

function buildParentCommentPrompt(p: CommentPayload): string {
  const priorContext =
    p.priorAssessments && p.priorAssessments.length > 0
      ? `Earlier: ${p.priorAssessments.map(a => `${a.term}: ${a.score}%`).join(", ")}.`
      : "";

  return `Write a simple parent update (3–4 sentences).

Student: ${p.studentName}
Subject: ${p.subjectName}
Topic: ${p.subStrandName}
Score: ${p.score}% (${cbcLabel(p.cbcLevel)})
${priorContext}

No jargon. Friendly tone. Under 80 words.`;
}

function buildTrendPrompt(p: TrendPayload): string {
  const history = p.assessments
    .map(a => `${a.term}: ${a.score}% (${cbcLabel(a.cbcLevel)})`)
    .join("; ");

  return `Analyze this student trend in 2 sentences:

${history}

State: improving, stable, or declining.`;
}

// ── OpenAI call (CHEAP MODEL) ──────────────────────

async function generateAI(prompt: string): Promise<string> {
  const response = await openai.responses.create({
    model: "gpt-4o-mini",
    input: prompt,
    max_output_tokens: 150,
  });

  // ✅ SAFE extraction (no crash)
  const text = response.output_text;

  if (!text) {
    console.error("OpenAI empty response:", response);
    throw new Error("AI returned empty response");
  }

  return text.trim();
}

// ── Handler ────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({
          error: "Missing OPENAI_API_KEY in Supabase secrets.",
        }),
        { status: 503, headers: corsHeaders }
      );
    }

    const { type, payload } = await req.json();
    console.log("AI REQUEST:", { type, payload });

    if (!type || !payload) {
      return new Response(
        JSON.stringify({ error: "Missing type or payload" }),
        { status: 400, headers: corsHeaders }
      );
    }

    const cacheKey = getCacheKey(type, payload);

    // ✅ CACHE HIT
    if (cache.has(cacheKey)) {
      return new Response(
        JSON.stringify({ result: cache.get(cacheKey) }),
        { status: 200, headers: corsHeaders }
      );
    }

    let result = "";

    // ── COMMENT ─────────────────────────

    if (type === "comment") {
      const cp = payload as CommentPayload;

      // ✅ Rule-based shortcut (FREE)
      const fallback = generateRuleComment(cp);
      if (fallback && !cp.forParent) {
        result = fallback;
      } else {
        const prompt = cp.forParent
          ? buildParentCommentPrompt(cp)
          : buildCommentPrompt(cp);

        result = await generateAI(prompt);
        console.log("AI RESULT:", result);
      }
    }

    // ── TREND ───────────────────────────

    else if (type === "trend") {
      const prompt = buildTrendPrompt(payload as TrendPayload);
      result = await generateAI(prompt);
      console.log("AI RESULT:", result);
    }

    else {
      return new Response(
        JSON.stringify({ error: `Unknown type: ${type}` }),
        { status: 400, headers: corsHeaders }
      );
    }

    // ✅ Save cache
    cache.set(cacheKey, result);

    return new Response(
      JSON.stringify({ result }),
      { status: 200, headers: corsHeaders }
    );

  } catch (err: any) {
    console.error("ai-insights error:", err);
    return new Response(
      JSON.stringify({ error: err?.message ?? "Internal server error" }),
      { status: 500, headers: corsHeaders }
    );
  }
});