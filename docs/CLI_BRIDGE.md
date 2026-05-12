# Brainpress CLI Bridge Plan

## Goal

Add a safe local bridge from Brainpress outcomes to Codex and Claude Code while keeping the user in control of every action that can modify a repo.

## Current v3 Behavior

Brainpress prepares handoff packages, writes disk run packages for local repos, runs allowlisted verification commands, and can run local Codex only after explicit approval. v3 streams Codex stdout/stderr live, allows cancellation, and persists run logs to disk. It can export or write:

- `.brainpress/runs/<runId>/prompt.md`
- `.brainpress/runs/<runId>/context.json`
- `.brainpress/runs/<runId>/verification.json`
- `.brainpress/runs/<runId>/safety-rules.md`
- `.brainpress/runs/<runId>/stdout.log`
- `.brainpress/runs/<runId>/stderr.log`
- `.brainpress/runs/<runId>/events.jsonl`
- `.brainpress/runs/<runId>/run-state.json`

Browser downloads still work for handoff-only mode. Direct Codex mode writes the package to disk inside the selected project folder.

Every generated prompt and handoff includes founder-safe Permission Safety Rules. These rules tell coding agents to stop and explain risk instead of asking a non-technical founder to approve dangerous actions blindly.

## DevelopmentTask Local Bridge

Brainpress now also supports a `DevelopmentTask` local bridge dispatch path. This is separate from the older AgentRun prompt execution path. A task uses:

- `dispatchTarget: codex_cli`
- `dispatchMode: local_bridge`

Brainpress checks the local bridge through:

```text
GET http://localhost:4317/health
```

The reference bridge can be started with:

```bash
npm run bridge
```

Brainpress dispatches a task through:

```text
POST http://localhost:4317/tasks
```

Expected body:

```json
{
  "task": "<DevelopmentTask>",
  "repo": "<local repo path>",
  "branch": "<branch name>",
  "mode": "local_bridge"
}
```

The reference bridge writes:

```text
.brainpress/tasks/<task-id>/
  task.json
  task.md
  status.json
  result.md
```

This version only packages the task. It does not invoke Codex CLI, edit files, commit, push, merge, or deploy. Future versions may add explicit approval-gated Codex CLI execution.

If the bridge is unavailable, Brainpress shows: "Local Codex Bridge is not running."

## Direct Codex Execution

The Codex bridge creates a run directory, writes handoff files, asks for approval, then runs:

```bash
codex exec --sandbox workspace-write --ask-for-approval on-request < .brainpress/runs/<runId>/prompt.md
```

The implementation passes `prompt.md` through stdin rather than relying on shell redirection. It captures stdout, stderr, exit code, duration, Git status before/after, `git diff --stat`, and a limited diff preview.

Codex execution requires:

- a local filesystem repo path
- a prepared disk package
- explicit approval checkbox
- `workspace-write` sandbox
- `on-request` approval mode

GitHub URLs are rejected for direct execution. If `codex --version` fails, the UI shows a setup error and keeps handoff/export available.

## v3 Streaming And Persistent Logs

The primary execution route is:

```text
POST /api/brainpress/codex/run-stream
```

The route validates the same local path, prompt path, disk package, approval, protected-branch, duplicate-run, Codex availability, and Permission Safety Rules checks as the request/response bridge. It then starts Codex and streams Server-Sent Events back to the browser.

During execution Brainpress writes:

- `stdout.log`: raw stdout chunks
- `stderr.log`: raw stderr chunks
- `events.jsonl`: structured run events
- `run-state.json`: final/current state, exit code, timing, cancellation/timeout flags, Git snapshots, and diff preview metadata

Structured event types include `run_started`, `stdout`, `stderr`, `run_cancel_requested`, `run_cancelled`, `run_timed_out`, `run_completed`, `run_failed`, `git_snapshot_captured`, `verification_started`, and `verification_completed`.

The UI can reload persisted logs after refresh through:

```text
GET /api/brainpress/agent-runs/logs?repoPath=...&runId=...
```

The older request/response route remains a fallback implementation path.

## Cancellation

Cancellation is exposed through:

```text
POST /api/brainpress/codex/cancel
```

The MVP uses an in-memory active process registry keyed by `runId`. Cancelling a run sends a termination signal to the active Codex process, writes `run_cancel_requested`, and the streaming route finalizes `run_cancelled`, `run-state.json`, partial stdout/stderr, and Git snapshots when the process closes.

Registry limitation: the active process registry is process-local and does not survive a Next.js server restart. Disk logs remain durable, but a restarted server cannot cancel a process it no longer tracks.

## Timeout Behavior

The streaming route keeps the 10-minute timeout guard. On timeout Brainpress terminates the process, writes `run_timed_out`, stores partial logs, sets the run state to `TimedOut`, and tells the founder that no memory was absorbed.

Cancelled or timed-out runs remain inspectable. Absorb is still blocked until manual diff review, and if verification did not pass the founder must provide a skipped-verification reason.

## v2.1 Readiness Checklist

Before "Approve & Run Codex," Brainpress shows a readiness checklist:

- Repo path is local
- Codex is installed
- Disk package prepared
- Git repo detected
- Git status checked
- Permission Safety Rules included
- Prompt path is inside `.brainpress/runs`
- User approval required
- No auto-commit
- Diff review required

Critical failures block execution: missing/URL repo path, Codex unavailable, disk package missing, invalid prompt path, or missing safety rules.

Warnings do not block execution: dirty Git status, protected branch, or missing verification commands.

## Protected Branch Warning

If Git preflight detects `main`, `master`, `production`, or `release`, Brainpress shows:

"You are on master/main. Brainpress recommends creating a feature branch or worktree before running Codex."

This does not block v2.1 execution, but it requires an extra checkbox: "I understand this will run on master/main."

## Run Lock And Timeout

The Codex run route creates a lock for `.brainpress/runs/<runId>` while Codex is running. A second run for the same AgentRun is rejected until the first run finishes.

Codex execution has a 10-minute timeout. If the timeout is reached, Brainpress stops the process, stores partial stdout/stderr, marks the run failed, and tells the founder that no memory was absorbed.

## Future Direct Claude Code Execution

Claude Code remains handoff-only. The bridge should start in planning mode first. The current draft preview is:

```bash
claude --permission-mode plan "$(cat .brainpress/runs/<runId>/prompt.md)"
```

The exact command should be confirmed against the local Claude Code CLI before enabling direct execution.

## Safety Model

- Never run Codex without explicit approval.
- Never auto-edit a repo without explicit approval.
- Never auto-commit.
- Never deploy.
- Never push to GitHub.
- Never run outside the selected project folder.
- Include Permission Safety Rules in every generated prompt, handoff, and future direct execution context.
- Tell agents to stop and explain risk before elevated permission, internet execution, broad deletion, database reset, force push, or access outside the project folder.
- Require branch or worktree isolation before agent execution.
- Require diff review before absorbing memory, roadmap, or build-log changes.
- Store every command, result, and verification snapshot in the run directory.

## Founder-Safe Permissions

Brainpress assumes the founder may not know whether an agent's permission request is safe. The default policy is therefore conservative:

- Work only inside the selected project folder.
- Read, edit, create, and delete files only inside that folder.
- Avoid printing secrets from `.env` files.
- Avoid destructive commands such as `rm -rf`, `del /s /q`, `format`, database resets, and force pushes.
- Avoid `curl | bash`, `Invoke-WebRequest | iex`, unknown downloaded scripts, and system-level PowerShell commands.
- Explain package installs before doing them.
- Stop and explain risk instead of asking for blind approval.

Future direct Codex execution must inject the same rules into the executed prompt and store them in `.brainpress/runs/<runId>/context.json`.

## Command Allowlist

Verification commands currently allowed:

- `npm run typecheck`
- `npm test`
- `npm run build`
- `git status --short`
- `git diff --stat`

Future versions can add project-specific allowlists, but they should be reviewed and stored in project settings.

## Approval Modes

Suggested approval modes:

- `plan`: prepare files and show commands only.
- `verify-only`: run allowlisted verification commands.
- `agent-plan`: open the agent in planning mode without write permission.
- `agent-write`: allow workspace writes in an isolated branch or worktree.
- `absorb`: update Brainpress memory and logs after diff review.

## Branch/Worktree Isolation

Git preflight currently warns on dirty repos but does not fully block. A safer next phase should create or require an isolated branch/worktree:

```bash
git switch -c brainpress/<runId>
```

or:

```bash
git worktree add ../<repo>-brainpress-<runId> -b brainpress/<runId>
```

The app should eventually refuse direct write execution on a dirty main branch unless the user explicitly chooses a safe isolation path.

## Diff Review Before Absorb

Before a run can be marked absorbed, Brainpress should show:

- changed files
- `git diff --stat`
- verification command results
- agent-reported remaining issues
- proposed memory updates
- proposed next outcomes

The user must approve absorption. The app should not silently rewrite product memory.

In v2, `requiresDiffReview` is set after Codex completes. The "Absorb Result into Memory" action stays disabled until the user clicks "Mark Diff Reviewed."

In v2.1, diff preview also reports preview length, whether truncation occurred, and a changed-file summary. The UI warns: "Review the actual files in your editor before absorbing."

## Absorb Confirmation

Before absorbing, Brainpress requires:

- diff reviewed
- confirmation that Brainpress will update memory/build logs
- successful verification, or a skipped-verification reason

If verification is skipped or failed, the skipped reason is stored in the build log.

## No Auto-Commit Rule

Brainpress should never commit automatically. A future version may prepare a suggested commit message, but the user must review and execute or approve the commit.

## Failure Handling

Failures should create repair-oriented next outcomes:

- Fix failing typecheck
- Fix failing tests
- Investigate build failure
- Review uncommitted workspace changes
- Review changed-file footprint
- Resume or restart cancelled Codex run for the outcome
- Continue timed-out Codex run for the outcome

The failed run should remain inspectable with command output and exact exit codes.

## Limitations

- Streaming uses request-held Server-Sent Events, not a durable job queue.
- The active cancellation registry is process-local and is lost on server restart.
- Claude Code direct execution is not enabled.
- Git preflight warns on dirty repos but does not create a branch/worktree yet.
- Diff preview is truncated for UI safety and performance.
- Verification remains an exact allowlist.

## Suggested `.brainpress/runs` Directory Structure

```text
.brainpress/
  runs/
    <runId>/
      prompt.md
      context.json
      verification.json
      safety-rules.md
      agent-result.md
      stdout.log
      stderr.log
      events.jsonl
      run-state.json
      diff-stat.txt
```
