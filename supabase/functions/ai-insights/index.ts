// ai-insights — Supabase Edge Function
//
// Handles two request types:
//   POST { type: "comment", payload: CommentPayload }
//     → Returns a CBC-aligned teacher comment OR a parent-friendly summary
//   POST { type: "trend",   payload: TrendPayload }
//     → Returns a trend prediction for a student's sub-strand performance history
//
// Requires ANTHROPIC_API_KEY edge function secret.

import Anthropic from "npm:@anthropic-ai/sdk@0.27.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// ── Payload types ─────────────────────────────────────────────────────────────

interface CommentPayload {
  studentName: string;
  subjectName: string;
  strandName: string;
  subStrandName: string;
  score: number;
  cbcLevel: "EE" | "ME" | "AE" | "BE";
  term: string;
  priorAssessments?: Array<{ term: string; score: number; cbcLevel: string }>;
  forParent?: boolean; // if true → plain-language parent summary
}

interface TrendPayload {
  studentName: string;
  subjectName: string;
  subStrandName: string;
  assessments: Array<{ term: string; score: number; cbcLevel: string }>;
}

// ── CBC label ─────────────────────────────────────────────────────────────────

function cbcLabel(level: string): string {
  return (
    { EE: "Exceeding Expectations", ME: "Meeting Expectations", AE: "Approaching Expectations", BE: "Below Expectations" }[level] ?? level
  );
}

// ── Teacher comment prompt ────────────────────────────────────────────────────

function buildCommentPrompt(p: CommentPayload): string {
  const priorContext =
    p.priorAssessments && p.priorAssessments.length > 0
      ? `Prior results: ${p.priorAssessments.map(a => `${a.term}: ${a.score}% (${cbcLabel(a.cbcLevel)})`).join("; ")}.`
      : "This is the learner's first recorded assessment in this sub-strand.";

  return `You are an experienced primary/secondary school teacher writing a professional CBC competency comment.

Learner: ${p.studentName}
Subject / Learning Area: ${p.subjectName}
Strand: ${p.strandName}
Sub-strand: ${p.subStrandName}
Term: ${p.term}
Score: ${p.score}% — ${cbcLabel(p.cbcLevel)}
${priorContext}

Write exactly THREE labelled sections. Each section: 2–3 sentences. Plain text only — no markdown, no bullet points.

COMMENT: Describe ${p.studentName}'s current competency in ${p.subStrandName}. Be honest, specific, and encouraging.
RECOMMENDATION: Suggest one targeted classroom strategy or intervention (e.g. peer teaching, guided practice, manipulatives).
ACTIVITY: Describe one concrete activity for this week that directly addresses ${p.studentName}'s gap in ${p.subStrandName}.

Total response: under 130 words. Professional tone.`;
}

// ── Parent summary prompt ─────────────────────────────────────────────────────

function buildParentCommentPrompt(p: CommentPayload): string {
  const priorContext =
    p.priorAssessments && p.priorAssessments.length > 0
      ? `Earlier: ${p.priorAssessments.map(a => `${a.term}: ${a.score}%`).join(", ")}.`
      : "";

  return `You are writing a warm, simple progress update to a parent (not a teacher).

Learner: ${p.studentName}
Subject: ${p.subjectName}
Topic studied: ${p.subStrandName}
Score this term: ${p.score}% (${cbcLabel(p.cbcLevel)})
${priorContext}

Write a short, friendly note (3–4 sentences) to the parent:
1. Tell them how ${p.studentName} is doing in ${p.subStrandName} this term — in simple, everyday language.
2. If the score is below 60%, mention one thing the parent can do at home to help.
3. End with an encouraging sentence.

No jargon, no CBC acronyms (write out "Exceeding Expectations" in full if needed). Under 80 words.`;
}

// ── Trend analysis prompt ─────────────────────────────────────────────────────

function buildTrendPrompt(p: TrendPayload): string {
  const history = p.assessments
    .map(a => `${a.term}: ${a.score}% (${cbcLabel(a.cbcLevel)})`)
    .join("; ");

  return `You are a school data analyst reviewing a student's academic trend.

Student: ${p.studentName}
Subject: ${p.subjectName}
Sub-strand: ${p.subStrandName}
Assessment history (oldest → newest): ${history}

Write a direct, data-driven analysis (2–3 sentences, plain text):
1. State clearly whether the trend is improving, stable, or declining.
2. If declining or consistently below 40%, give a clear warning: if this continues, ${p.studentName} is likely to underperform in end-of-term assessments.
3. If improving, acknowledge the progress and encourage the teacher to continue.

Under 70 words. No markdown.`;
}

// ── Handler ───────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({
          error:
            "AI service not configured. Ask your system administrator to add ANTHROPIC_API_KEY to the edge function secrets.",
        }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const body = await req.json();
    const { type, payload } = body as {
      type: "comment" | "trend";
      payload: CommentPayload | TrendPayload;
    };

    if (!type || !payload) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: type and payload" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let prompt: string;

    if (type === "comment") {
      const cp = payload as CommentPayload;
      prompt = cp.forParent ? buildParentCommentPrompt(cp) : buildCommentPrompt(cp);
    } else if (type === "trend") {
      prompt = buildTrendPrompt(payload as TrendPayload);
    } else {
      return new Response(
        JSON.stringify({ error: `Unknown type: ${type}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const anthropic = new Anthropic({ apiKey });
    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 400,
      messages: [{ role: "user", content: prompt }],
    });

    const result =
      message.content[0].type === "text" ? message.content[0].text.trim() : "";

    return new Response(
      JSON.stringify({ result }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error("ai-insights error:", err);
    return new Response(
      JSON.stringify({ error: err?.message ?? "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
