# Brainpress MVP

Brainpress is becoming an AI software development task orchestrator. It turns messy product memory and founder intent into structured, verified Codex-ready work by keeping the loop visible:

Project Memory -> Development Task -> Codex Dispatch -> Result Review -> Verification -> Next Action

## MVP Scope

- Next.js App Router, TypeScript, and Tailwind CSS.
- Local persistence through `localStorage`, with a Supabase-backed cloud store foundation for hosted use.
- Optional Supabase Auth and Postgres persistence for cross-device projects.
- Server-side OpenAI and GitHub integrations when configured; no API keys are stored in frontend state or localStorage.
- Seeded GensecAI demo project with memory, roadmap, verification commands, and one ready outcome.
- Seeded Brainpress Core project for internal product development tasks.
- DevelopmentTask system with task type, status, priority, repo/branch, context, affected areas, acceptance criteria, verification commands, QA steps, dispatch target, result, PR URL, and status history.
- Codex Goal Function generation: every development task can store a durable `/goal` objective with target outcome, validation loop, permission-safe guidance, required checks, and final summary format.
- Dev Agent Inbox for turning messy bug reports, feature requests, QA notes, build logs, or Codex results into structured tasks.
- Server-side Codex adapter placeholder. If Codex Cloud/CLI dispatch is not configured, Brainpress says so clearly and does not pretend a run happened.
- Heuristic memory parser for decisions, completed work, known issues, roadmap items, and technical signals.
- Outcome plan generation and agent-ready prompt generation.
- Agent result ingestion into structured build logs.
- Project settings for repo path, preferred agent, constraints, and verification commands.
- Founder-safe Permission Safety Rules included in every generated prompt and handoff package.
- PDF Intake for Project Memory: upload many text-based PDFs over time, extract page text, save each PDF as a source, rebuild one founder-friendly roadmap dashboard, keep raw source collapsed, and create suggested outcomes.

## Hosted Cross-Device Setup

Brainpress can run locally without cloud configuration, but hosted phone/computer usage is designed for Vercel + Supabase:

1. Create a Supabase project.
2. Run the schema in [`docs/SUPABASE_SCHEMA.sql`](docs/SUPABASE_SCHEMA.sql) from the Supabase SQL editor.
3. Add these variables locally and in Vercel:

```text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
OPENAI_API_KEY=
BRAINPRESS_OPENAI_MODEL=
BRAINPRESS_GITHUB_TOKEN=
```

`SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, `BRAINPRESS_GITHUB_TOKEN`, and `GITHUB_TOKEN` are server-side only. Do not prefix them with `NEXT_PUBLIC_`.

When Supabase is configured, Brainpress shows a sign-in card in the workspace header. Signed-in users see **Cloud synced** and their projects, Think sessions, Product Windows, Build tasks, task results, and Run issues are saved to Supabase Postgres under RLS. If Supabase is missing or the user is signed out, Brainpress keeps working in **Local only** mode through `localStorage`.

### Vercel Deployment

Recommended Vercel settings:

- Framework: Next.js
- Root Directory: empty, if `package.json` is at repository root
- Install Command: `npm install`
- Build Command: `npm run build`
- Output Directory: empty
- Node: 20.x or 22.x

### Phone Workflow

On phone, Brainpress keeps the Think / Build / Run model but uses compact segmented views:

- Think: Chat / Canvas
- Build: Chat / Tasks / task detail through a compact task rail and canvas
- Run: Chat / Ops Board

GitHub Dispatch is the default phone-safe handoff. It can create a GitHub issue server-side when `BRAINPRESS_GITHUB_TOKEN` or `GITHUB_TOKEN` is configured; otherwise Brainpress generates a copyable issue package. Local Bridge remains available as a desktop-only option when a local repo and `http://localhost:4317` bridge are running.

## Development Tasks And Codex Dispatch

Brainpress now treats coding-agent work as a structured **DevelopmentTask**, not as a copy/paste prompt-first workflow. The Dev Tasks tab includes:

- a Dev Agent Inbox for messy founder intent
- a task detail view with repo, branch, type, priority, context, affected areas, acceptance criteria, verification commands, manual QA, constraints, dispatch target, PR URL, result import, and status history
- a primary **Send to Codex** action
- a durable **Codex Goal Function** with Copy and Regenerate actions
- a result review area that stores raw results, summarizes them, and compares them against acceptance criteria

The Codex dispatch layer is intentionally separated from task creation. `CodingAgentAdapter` defines `createTask`, `getTaskStatus`, and `getTaskResult`; `CodexAdapter` currently provides a safe placeholder boundary. No Codex API key is stored in frontend state or localStorage. Direct Codex Cloud/CLI dispatch remains a TODO integration step, and Brainpress does not auto-merge, auto-deploy, push, or hide destructive actions.

The `/goal` output is intentionally founder-safe and execution-focused. It tells Codex what outcome to reach, what to validate, what commands to run, when to stop for founder input, and how to summarize changed files, verification results, risks, remaining issues, and next tasks.

## Local Codex Bridge

Brainpress can now dispatch a `DevelopmentTask` to a local bridge service before full Codex automation exists. The default bridge URL is:

```text
http://localhost:4317
```

Start the reference bridge with:

```bash
npm run bridge
```

The reference bridge supports:

- `GET /health`
- `POST /tasks`
- `GET /tasks/:id`
- `GET /tasks/:id/result`

When Brainpress sends a task, the bridge writes a package into the selected local repo:

```text
.brainpress/tasks/<task-id>/
  task.json
  task.md
  status.json
  result.md
```

This first bridge version does **not** invoke Codex CLI automatically. It only packages the task and returns a local run ID. Future bridge versions can add explicit, approval-gated Codex CLI execution. If the bridge is not running, Brainpress shows "Local Codex Bridge is not running." and keeps the task ready to dispatch.

## Founder-Safe Permissions

Brainpress is designed for founders who may not know whether a coding agent request is risky. Every generated Codex, Claude Code, or generic prompt now includes a standard **Permission Safety Rules** section.

These rules tell the agent to work only inside the selected project folder, avoid secrets, avoid destructive commands, avoid untrusted internet execution, avoid force pushes, and stop when a command needs elevated permission, broad deletion, database reset, internet execution, or access outside the project folder.

The important product behavior is that the agent is told to **stop and explain the risk** instead of asking a non-technical founder to approve blindly. Project safety rules are editable in Settings and older localStorage projects receive the default rules automatically.

## v1 Agent Handoff

Brainpress v1 adds a safe handoff layer without autonomous agent execution. An Agent Run freezes the selected outcome, memory snapshot, prompt snapshot, repo path, verification commands, and latest verification results.

From the Agent Runs tab you can:

- Prepare a handoff package for Codex, Claude Code, or a generic agent.
- Copy the full handoff text.
- Download `prompt.md`, `context.json`, and `verification.json` from browser state.
- Export founder-safe permission rules inside both `prompt.md` and `context.json`.
- Copy command previews for future CLI workflows.
- Run allowlisted verification commands against a local repo path.
- Link verification results into a build log when ingesting an agent result.

Claude Code remains handoff-only until its local CLI contract is confirmed.

## v2 Direct Local Codex Bridge

Brainpress v2 can run local Codex from the Agent Runs tab, but only behind an explicit approval card. The flow is:

1. Check whether `codex` is available with `codex --version`.
2. Prepare a disk run package inside `.brainpress/runs/<runId>/`.
3. Run Git preflight with `git status --short` and `git rev-parse --abbrev-ref HEAD`.
4. Show the exact command preview and require the checkbox: "I approve running Codex in this project folder only."
5. Run Codex with `codex exec --sandbox workspace-write --ask-for-approval on-request` and pass `prompt.md` through stdin.
6. Capture stdout, stderr, exit code, duration, git status before/after, diff stat, and a limited diff preview.
7. Require diff review before absorbing the result into memory/build logs.
8. Let the user run allowlisted verification as a separate action.

Direct Codex execution requires a local filesystem repo path. GitHub URLs are rejected for direct execution and remain handoff/export only. If Codex is unavailable, Brainpress shows a setup error and keeps handoff/download workflows working.

The disk package contains:

- `prompt.md`
- `context.json`
- `verification.json`
- `safety-rules.md`

Brainpress does not auto-commit, deploy, push to GitHub, bypass Permission Safety Rules, or mark a run absorbed before diff review.

## v2.1 Safety Hardening

Brainpress v2.1 adds a founder-readable Execution Readiness Checklist before Codex can run. Critical checks block execution:

- repo path must be local
- Codex must be installed
- disk package must be prepared
- `prompt.md` must stay inside `.brainpress/runs/<runId>/`
- Permission Safety Rules must be included

Warnings do not block execution, but they are made explicit:

- dirty Git status
- running on `main`, `master`, `production`, or `release`
- missing verification commands

If the current branch is protected, Brainpress requires an extra checkbox: "I understand this will run on master/main."

The Codex route also uses a run lock so the same AgentRun cannot be started twice while it is running. Codex has a 10-minute timeout guard; if it times out, Brainpress stops the process, keeps partial output, marks the run failed, and does not absorb memory.

Diff previews remain truncated for UI safety. Brainpress shows preview length, truncation state, and changed-file summary, and warns founders to review the actual files in their editor before absorbing.

Absorb now requires confirmation:

- I reviewed the diff
- I understand Brainpress will update memory/build logs
- verification passed, or the founder provides a skipped-verification reason

Skipped verification reasons are stored in the build log.

## v3 Streaming Codex Runs

Brainpress v3 upgrades Direct Codex from request/response execution to a streaming, cancellable run experience. When a founder clicks "Approve & Run Codex," Brainpress starts Codex with the same safe command shape, streams stdout/stderr into the Agent Runs tab, and persists run logs inside:

```text
.brainpress/runs/<runId>/
```

Each streaming run writes:

- `stdout.log`
- `stderr.log`
- `events.jsonl`
- `run-state.json`

`events.jsonl` stores structured events such as `run_started`, `stdout`, `stderr`, `run_cancel_requested`, `run_cancelled`, `run_timed_out`, `run_completed`, `run_failed`, `git_snapshot_captured`, `verification_started`, and `verification_completed`.

The Agent Runs tab now includes:

- live stdout/stderr log viewer
- event timeline
- elapsed time
- Cancel Run button
- persisted log loading after refresh/reopen

Cancellation uses an in-memory active process registry for the MVP. That registry is process-local, so it does not survive a Next.js server restart. The disk logs still remain in `.brainpress/runs/<runId>`.

Timeout remains 10 minutes. If a run is cancelled or times out, Brainpress preserves partial logs, marks the run as interrupted, does not absorb memory automatically, and recommends a resume/continue task. Absorb still requires manual diff review and a skipped-verification reason if verification did not pass.

## PDF Intake For Project Memory

Brainpress can now import project history from the Memory tab through either pasted text or PDF upload. PDF intake is for product memory only; it does not run Codex, start agents, edit repos, or create autonomous loops.

Supported PDFs are text-based PDFs such as ChatGPT exports, product specs, research memos, investor memos, meeting notes, repo summaries, and saved agent results. Brainpress extracts text page by page in the browser, shows progress like "Extracting page 3 of 18", and then analyzes the extracted text into project memory.

Brainpress now treats imports as **Sources** and memory as the current founder-facing understanding of the project. You can import many ChatGPT/Codex PDFs over time. Each PDF remains saved with file name, import date, analyzer badge, short summary, detected themes, and raw text access. Raw extracted text stays separate from Memory and only appears behind an explicit View text action.

At the top of the Memory tab, Brainpress shows a **Project Roadmap Dashboard**:

- Product Snapshot
- What is Done
- What is Broken / Risky
- What To Do Next
- Roadmap grouped into Now, Next, and Later
- Suggested Next Outcome with acceptance checks and safe verification commands

The founder does not need to manually fill database-like boxes. Empty memory cards are hidden, populated memory cards are read-first, each card has an Edit action, and Technical Details are collapsed by default.

PDF analysis can optionally use OpenAI from a server-side route. Add `OPENAI_API_KEY=` to `.env.local` to enable it. The key is read only from `process.env.OPENAI_API_KEY` on the server and is never sent to the browser. If the key is missing, the OpenAI request fails, or the structured JSON is invalid, Brainpress falls back to the local heuristic analyzer and labels the review as "AI unavailable, local analysis used."

PDF analysis produces a review screen with:

- a Founder Review with Plain English Summary, What is done, What is broken / risky, What to do next, and Suggested next outcome
- an Analysis Summary card with 5-8 bullets, source file name, page count, and detected theme chips
- structured memory cards for Product Summary, Key Facts, Current Build State, Technical Architecture, Active Decisions, Completed Work, Known Issues, Open Questions, Roadmap, and Suggested Outcomes
- raw extracted PDF text collapsed by default with only a short preview
- 3-5 suggested outcomes
- options to Save to Memory, Save as Source Only, Generate Outcome from PDF, or Discard

Saving to Memory merges structured analysis into existing memory with deduplication. Decisions, completed work, issues, open questions, roadmap, and architecture are appended. Product Summary is only updated when it is empty, unless the user explicitly chooses to update it. The full raw extracted text remains stored as source history, but it is not pasted into the main import textarea or memory cards.

Use **Rebuild Project Memory from Sources** after importing several PDFs. Brainpress sends source summaries and prior analyses to the optional server-side OpenAI analyzer when `OPENAI_API_KEY` is available, then previews one consolidated memory before replacing the current dashboard. If the key is missing or AI fails, Brainpress falls back to a local merge and explains that AI rebuild is unavailable.

Scanned/image-only PDFs are not supported yet. If text extraction fails, Brainpress tells the user to export as text or upload a text-based PDF. OCR is a future phase.

## Verification Allowlist

The v1 backend route `POST /api/brainpress/verify` only accepts local filesystem repo paths and these exact commands:

- `npm run typecheck`
- `npm test`
- `npm run build`
- `git status --short`
- `git diff --stat`

All other commands are rejected before execution. URLs and network paths are rejected. Results capture `stdout`, `stderr`, `exitCode`, `durationMs`, and pass/fail status.

## Demo Data

The seeded project is **GensecAI**, an AI command center for SMEs. Its first outcome is **Improve GensecAI PC Center Dashboard**, focused on making PC center operations intelligence clean, premium, and owner-grade.

## OpenAI Agent Gateway

Think, Build, and Run can optionally use a server-side OpenAI gateway for structured agent responses. Set `OPENAI_API_KEY` in `.env.local` to enable Live AI responses, and optionally set `BRAINPRESS_OPENAI_MODEL` to override the default model.

If the key is missing, the request fails, or the model returns malformed JSON, Brainpress falls back to the deterministic local engines. The UI labels each generated Think session, Build task, and Run review as either **Live AI** or **Local fallback**. The browser never receives the OpenAI key and the gateway never dispatches or executes code automatically.

## Run Locally

```bash
npm install
npm run dev
```

Verification:

```bash
npm run typecheck
npm test
npm run build
```

## Next Technical Phase

The next phase should make write execution safer before adding more agent bridges:

1. Add branch/worktree creation helpers before write execution.
2. Add stronger diff review with file-level summaries and selective absorb.
3. Add a Claude Code bridge once the exact safe local command contract is confirmed.
4. Add JSON-backed project state so teams can commit Brainpress memory, outcomes, prompts, and build logs beside the repo.
5. Add optional streaming persistence beyond the process-local active run registry.

See [docs/CLI_BRIDGE.md](docs/CLI_BRIDGE.md) for the proposed direct CLI bridge safety model.
See [docs/PDF_INTAKE.md](docs/PDF_INTAKE.md) for PDF import behavior and limitations.
