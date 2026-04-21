// ai-insights edge function
// Calls Claude API to generate:
//   1. A contextual teacher comment for a student's sub-strand performance
//   2. Recommended classroom activities
//   3. A trend-based prediction (will the student pass/fail?)
//
// POST /functions/v1/ai-insights
// Body: { type: 'comment' | 'trend', payload: {...} }

import Anthropic from "npm:@anthropic-ai/sdk@0.27.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// ── Types ────────────────────────────────────────────────────────────────────

interface CommentPayload {
  studentName: string;
  subjectName: string;
  strandName: string;
  subStrandName: string;
  score: number;
  cbcLevel: "EE" | "ME" | "AE" | "BE";
  term: string;
  // Optional prior assessments for context
  priorAssessments?: Array<{
    term: string;
    score: number;
    cbcLevel: string;
  }>;
}

interface TrendPayload {
  studentName: string;
  subjectName: string;
  subStrandName: string;
  assessments: Array<{
    term: string;
    score: number;
    cbcLevel: string;
  }>;
}

// ── CBC level to human label ─────────────────────────────────────────────────
function cbcLabel(level: string): string {
  const map: Record<string, string> = {
    EE: "Exceeding Expectations",
    ME: "Meeting Expectations",
    AE: "Approaching Expectations",
    BE: "Below Expectations",
  };
  return map[level] ?? level;
}

// ── Build prompt for comment generation ─────────────────────────────────────
function buildCommentPrompt(p: CommentPayload): string {
  const priorContext =
    p.priorAssessments && p.priorAssessments.length > 0
      ? `Prior performance: ${p.priorAssessments
          .map((a) => `${a.term}: ${a.score}% (${cbcLabel(a.cbcLevel)})`)
          .join(", ")}.`
      : "This is the first recorded assessment for this sub-strand.";

  return `You are an experienced primary/secondary school teacher writing a concise, supportive, and actionable student progress comment.

Student: ${p.studentName}
Subject: ${p.subjectName}
Strand: ${p.strandName}
Sub-strand: ${p.subStrandName}
Current term: ${p.term}
Current score: ${p.score}% — ${cbcLabel(p.cbcLevel)}
${priorContext}

Write THREE short sections (2–3 sentences each, plain text, no markdown):

1. COMMENT: Describe the student's current performance on ${p.subStrandName} in ${p.subjectName}. Be honest but encouraging.
2. RECOMMENDATION: Suggest one specific classroom intervention or teaching strategy (e.g. peer teaching, manipulatives, group work, practice worksheets).
3. ACTIVITY: Describe one concrete activity the teacher can do with ${p.studentName} this week to improve understanding of ${p.subStrandName}.

Keep language simple, professional, and actionable. Total response under 120 words.`;
}

// ── Build prompt for trend prediction ────────────────────────────────────────
function buildTrendPrompt(p: TrendPayload): string {
  const history = p.assessments
    .map((a) => `${a.term}: ${a.score}% (${cbcLabel(a.cbcLevel)})`)
    .join(", ");

  return `You are a school data analyst reviewing a student's academic trend.

Student: ${p.studentName}
Subject: ${p.subjectName}
Sub-strand: ${p.subStrandName}
Assessment history (oldest to newest): ${history}

Write a brief trend analysis (2–3 sentences, plain text, no markdown) that:
1. States clearly whether the trend is improving, stable, or declining.
2. If declining or consistently below 40%, warn that if this continues the student is likely to struggle in end-of-term assessments.
3. If improving, acknowledge the progress and encourage continuation.

Be direct, data-driven, and helpful to the teacher. Under 60 words.`;
}

// ── Main handler ─────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "AI service not configured. Add ANTHROPIC_API_KEY to edge function secrets." }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const { type, payload } = body as { type: "comment" | "trend"; payload: CommentPayload | TrendPayload };

    if (!type || !payload) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: type and payload" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const anthropic = new Anthropic({ apiKey });

    let prompt: string;
    if (type === "comment") {
      prompt = buildCommentPrompt(payload as CommentPayload);
    } else if (type === "trend") {
      prompt = buildTrendPrompt(payload as TrendPayload);
    } else {
      return new Response(
        JSON.stringify({ error: `Unknown type: ${type}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 300,
      messages: [{ role: "user", content: prompt }],
    });

    const text =
      message.content[0].type === "text" ? message.content[0].text.trim() : "";

    return new Response(
      JSON.stringify({ result: text }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("ai-insights error:", err);
    return new Response(
      JSON.stringify({ error: err?.message ?? "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
