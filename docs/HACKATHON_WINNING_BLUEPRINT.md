# EduSenseH Hackathon Winning Blueprint

## 1. Project Analysis
- **Strengths**: real-time class workflow, transcript ingestion, AI-assisted study generation, chat collaboration, archive playback, and attendance hooks.
- **Critical weaknesses fixed in this implementation**:
  - Client-exposed LLM/STT keys and direct browser orchestration.
  - Single massive live-class logic path causing reliability and maintenance drag.
  - Missing judge-visible differentiation beyond “summary + quiz.”
- **Competitive position**:
  - **Wins vs generic LMS/video tools**: live confusion intelligence, adaptive interventions, personal catch-up capsules.
  - **Loses vs mature platforms**: deep analytics history, enterprise governance, multi-tenant tooling.

## 2. Unique Features Implemented
- **Confusion Spike Rescue**: teacher gets AI-generated rescue actions when confusion rises.
- **Personal Catch-Up Capsule**: one-click student recovery plan from current live transcript.
- **Evidence-Based Participation Graph**: live poll/doubt participation telemetry shown in dashboard.
- **Concept Drift Alerts**: AI flags topic drift and suggests corrective focus.
- **Adaptive Poll-to-Quiz Loop**: teacher converts live class context into instant adaptive quiz.
- **Teacher Intervention Playbook**: cue generation workflow for fast pedagogical responses.

## 3. AI Enhancements
- Moved AI orchestration to Supabase Functions with typed workflows:
  - `live_summary`
  - `cue_generation`
  - `risk_detection`
  - `quiz_generation`
  - `personal_recap`
- Added `moderate-content` for classroom safety filtering.
- Added `stt-token` to issue short-lived streaming token for live transcription.

## 4. Code and Architecture Improvements
- Added shared workflow client: `src/lib/aiWorkflows.js`.
- Replaced direct Groq browser usage with function invocations.
- Added transcript batching to reduce DB write pressure in live sessions.
- Added explicit orchestration surface for live signals, artifacts, and personalized recaps.
- Added compatibility `aiService` facade to avoid a brittle full rewrite.

## 5. UI/UX Upgrade Highlights
- Teacher dashboard now surfaces:
  - concept drift alert card,
  - confusion rescue action card,
  - adaptive quiz launcher,
  - participation signal counter.
- Student flow now includes:
  - adaptive quiz participation,
  - personal catch-up capsule generation and display.

## 6. Quick Wins, Medium Impact, Critical Fixes
- **Quick wins**:
  - typed AI workflow endpoints,
  - moderation layer,
  - personal capsule UX call-to-action.
- **Medium effort / high impact**:
  - transcript batching,
  - adaptive quiz broadcast flow,
  - live rescue cue synchronization.
- **Critical fixes**:
  - secret isolation to server-side functions,
  - RLS-protected intelligence tables,
  - role and group membership checks at function boundary.

## 7. Security Fixes
- Added RLS tables and policies:
  - `learning_signals`
  - `ai_artifacts`
  - `student_recap_jobs`
- Added role-aware function guards (group member, teacher/creator checks).
- Added moderation for chat and doubts before DB insert/broadcast.

## 8. 60-Second Pitch Script
“EduSenseH turns passive college live classes into a real-time learning intelligence cockpit.  
As a teacher speaks, our system detects confusion spikes, flags concept drift, and suggests immediate rescue actions.  
Students get adaptive quizzes generated from class context and a one-click personal catch-up capsule that tells them exactly what to do in the next 5 minutes.  
Unlike generic AI note tools, we combine live signals, interventions, and personalization in the same classroom loop.  
Technically, we secured orchestration through Supabase Functions, added policy-protected intelligence tables, and optimized transcript flow for scale.  
EduSenseH is not just recording class. It is actively improving learning outcomes while class is still happening.”
