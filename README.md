# SANA-System

[![Open in Bolt](https://bolt.new/static/open-in-bolt.svg)](https://bolt.new/~/sb1-dqwvqyph)

Documentation

SANA OS is a multi-school "school intelligence" web app built for Kenya's Competency-Based Curriculum (CBC). Teachers record scores and competency assessments, the system automatically converts them into CBC levels and flags at-risk students, and admins/super-admins manage schools, staff, and curriculum structure.

1. Tech Stack

Frontend framework ----- React18 + TypeScript, built with vite

Routing ------- react-router-dom v7

Styling ------- Tailwind CSS

Charts ------- recharts (area, bar, line, radar charts)

Backend ------- Supabase (Postgres + Auth + Row-Level Security + Edge Functions)

AI ------- OpenAI gpt-4o-mini, called from a Supabase Edge Function (never from the browser)

PDF/print export ------ html2pdf.js and browser print windows

Key design decision: the OpenAI API key is never exposed to the browser. src/lib/aiClient.ts calls the ai-insights Supabase Edge Function, which holds the key server-side and proxies the request to OpenAI.

2. Setup & Local Development

2.1 Prerequisites

Node.js 18+ and npm

A Supabase account and project (supabase.com)

The Supabase CLI — needed to run migrations and deploy the ai-insights edge function

An OpenAI API key (for the AI comment feature)

2.2 Install dependences

    #Navigate to your root directory
    cd SANA-System-doc-update

    #Install Dependencies
    npm install

2.3 Create the .env file

The project reads three VITE_* variables at build/dev time (see src/lib/supabase.ts, src/lib/aiClient.ts). Create a .env file in the project root:

VITE_SUPABASE_URL=https://<your-project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<your-project-anon-key>
VITE_OPENAI_API_KEY=<unused-for-now-see-note-below>

2.4 Link the CLI and run the migrations

supabase login
supabase link --project-ref <your-project-ref>
supabase db push






