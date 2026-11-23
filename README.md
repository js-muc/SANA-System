# SANA System

**Open-source, multi-tenant school management & exam analytics for African schools.**

SANA is a mobile-first alternative to proprietary school-management SaaS. It handles the full academic workflow — from learner enrollment and staff onboarding through score entry, merit lists, and progress reports — on a Supabase backbone with row-level security for per-school data isolation.

Built with a **3-tier role model** (`super_admin` → `admin` → `teacher`) so a single deployment can serve an entire school network.

---

## ✨ Features

### Academic Analytics
- **Score entry** by teachers, scoped to their assigned classes.
- **Merit lists** — ranked performance per class/level/exam.
- **Progress tracking** — per-student trend across terms.
- **Reports** — printable report cards with data visualization (Recharts).
- **Admin results console** — cross-class aggregation & oversight.

### Student & Staff Management
- Student registry with profile pages.
- Bulk subject/level/class configuration by admin.
- **Teacher onboarding workflow** — new admins land in `PendingApproval` until approved.

### Platform Administration (`super_admin`)
- Tenant-wide dashboard for network operators.
- Central oversight of all schools, levels, and classes.

### Security
- Supabase Auth (email/password).
- Row-Level Security (RLS) enabled on all tables, with strict `school_id` tenant isolation.
- Route guards: `AdminRoute`, `SuperAdminRoute`, `ProtectedRoutes`.
- Approval gate: `approval_status ∈ {pending, approved, rejected}`.

---

## 🏗 Architecture

```text
┌──────────────────────────────────────────────┐
│  React 18 + TypeScript + Vite + Tailwind     │
│  ┌────────────┐  ┌───────────────────────┐   │
│  │ AuthContext│─▶│ Route Guards          │   │
│  │ (Supabase) │  │ Admin / SuperAdmin /  │   │
│  └────────────┘  │ Protected / Public    │   │
│                  └───────────────────────┘   │
│  ┌──────────────────────────────────────┐    │
│  │ Pages: Dashboard | Scores | Students │    │
│  │ Reports | MeritList | Progress |     │    │
│  │ admin/* | superadmin/* | Pending     │    │
│  └──────────────────────────────────────┘    │
└──────────────────────┬───────────────────────┘
                       │ @supabase/supabase-js
┌──────────────────────▼───────────────────────┐
│  Supabase (Postgres + Auth + RLS)            │
│  Tables: schools, profiles, levels, classes, │
│          students, subjects, scores          │
└──────────────────────────────────────────────┘
