import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { open, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import {
  codexTimeoutFailure,
  getRunDirectory,
  isPathInside,
  isRunAlreadyRunning,
  promptContainsPermissionSafetyRules,
  validateCodexStreamRequest,
} from "@/lib/codex-bridge";
import { codexAskForApproval, codexSandbox } from "@/lib/codex-shared";
import { isProtectedBranch } from "@/lib/execution-readiness";
import {
  appendStderr,
  appendStdout,
  appendRunEvent,
  codexStreamTimeoutMs,
  diffPreviewLimit,
  getActiveCodexRun,
  getRunLogPaths,
  hasActiveCodexRun,
  initializeRunLogFiles,
  registerActiveCodexRun,
  unregisterActiveCodexRun,
  writeRunState,
} from "@/lib/server-run-logs";
import { runFileCommand } from "@/lib/server-runner";
import { createRunEvent, statusFromCodexStreamResult, type CodexRunEvent, type CodexRunState } from "@/lib/run-events";
import type { AgentRunStatus } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface CodexStreamRequest {
  repoPath?: string;
  runId?: string;
  promptPath?: string;
  approvalConfirmed?: boolean;
  protectedBranchConfirmed?: boolean;
  runStatus?: AgentRunStatus;
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as CodexStreamRequest;
  const repoPath = body.repoPath?.trim() || "";
  const runId = body.runId?.trim() || "";
  const promptPath = body.promptPath?.trim() || "";

  const requestValidation = validateCodexStreamRequest({
    repoPath,
    runId,
    promptPath,
    approvalConfirmed: Boolean(body.approvalConfirmed),
  });
  if (!requestValidation.ok) return NextResponse.json({ error: requestValidation.error }, { status: 400 });

  if (!existsSync(/*turbopackIgnore: true*/ promptPath)) {
    return NextResponse.json(
      { error: "prompt.md does not exist. Click Prepare Disk Package, then try again." },
      { status: 400 },
    );
  }

  const runDirectory = getRunDirectory(repoPath, runId);
  const paths = getRunLogPaths(repoPath, runId);
  const requiredPackageFiles = ["context.json", "verification.json", "safety-rules.md"].map((file) =>
    path.join(/*turbopackIgnore: true*/ runDirectory, file),
  );
  if (requiredPackageFiles.some((filePath) => !existsSync(/*turbopackIgnore: true*/ filePath))) {
    return NextResponse.json(
      { error: "Disk package is incomplete. Click Prepare Disk Package before running Codex." },
      { status: 400 },
    );
  }

  if (!isPathInside(runDirectory, paths.lockPath)) {
    return NextResponse.json({ error: "Internal lock path failed safety validation." }, { status: 400 });
  }

  if (
    hasActiveCodexRun(runId) ||
    isRunAlreadyRunning(body.runStatus || "Prepared", existsSync(/*turbopackIgnore: true*/ paths.lockPath))
  ) {
    return NextResponse.json(
      { error: "Codex is already running for this AgentRun. Wait for it to finish or cancel it before starting another run." },
      { status: 409 },
    );
  }

  const prompt = await readFile(/*turbopackIgnore: true*/ promptPath, "utf8");
  if (!promptContainsPermissionSafetyRules(prompt)) {
    return NextResponse.json(
      { error: "Permission Safety Rules are missing from prompt.md. Recreate the disk package before running Codex." },
      { status: 400 },
    );
  }

  const codexCheck = await runFileCommand("codex", ["--version"], repoPath);
  if (codexCheck.exitCode !== 0) {
    return NextResponse.json(
      {
        error: "Codex CLI is not installed or is not on PATH. Install Codex, restart the dev server if needed, or keep using handoff/export.",
        codexAvailable: false,
        codexStdout: codexCheck.stdout,
        codexStderr: codexCheck.stderr,
        codexExitCode: codexCheck.exitCode,
      },
      { status: 400 },
    );
  }

  const branchCheck = await runFileCommand("git", ["rev-parse", "--abbrev-ref", "HEAD"], repoPath);
  const branch = branchCheck.exitCode === 0 ? branchCheck.stdout.trim() : "";
  if (isProtectedBranch(branch) && !body.protectedBranchConfirmed) {
    return NextResponse.json(
      {
        error:
          "You are on master/main. Brainpress recommends creating a feature branch or worktree before running Codex. Confirm the protected-branch checkbox to continue.",
        branch,
      },
      { status: 403 },
    );
  }

  let lockHandle: Awaited<ReturnType<typeof open>> | null = null;
  try {
    lockHandle = await open(paths.lockPath, "wx");
    await lockHandle.writeFile(new Date().toISOString(), "utf8");
  } catch {
    return NextResponse.json(
      { error: "Codex is already running for this AgentRun. Wait for it to finish or cancel it before starting another run." },
      { status: 409 },
    );
  } finally {
    await lockHandle?.close();
  }

  await initializeRunLogFiles(repoPath, runId);

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const startedAtMs = performance.now();
      const startedAt = new Date().toISOString();
      const stdoutChunks: string[] = [];
      const stderrChunks: string[] = [];
      const pendingWrites: Array<Promise<unknown>> = [];
      let closed = false;
      let spawnError = "";

      const enqueue = (event: CodexRunEvent) => {
        if (closed) return;
        controller.enqueue(encoder.encode(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`));
      };
      const persistEvent = (event: CodexRunEvent) => {
        pendingWrites.push(appendRunEvent(repoPath, event));
        enqueue(event);
      };

      void (async () => {
        const gitStatusBefore = await runFileCommand("git", ["status", "--short"], repoPath);
        const initialState: CodexRunState = {
          runId,
          status: "RunningCodex",
          startedAt,
          exitCode: null,
          durationMs: null,
          cancelled: false,
          timedOut: false,
          gitStatusBefore: gitStatusBefore.stdout,
          gitStatusAfter: "",
          gitDiffStat: "",
          diffPreviewMetadata: {
            length: 0,
            truncated: false,
            changedFiles: [],
            previewLimit: diffPreviewLimit,
          },
        };
        await writeRunState(repoPath, initialState);
        persistEvent(
          createRunEvent(runId, "run_started", {
            command: `codex exec --sandbox ${codexSandbox} --ask-for-approval ${codexAskForApproval}`,
            repoPath,
            promptPath,
            gitStatusBefore: gitStatusBefore.stdout,
          }),
        );

        const child = spawn("codex", ["exec", "--sandbox", codexSandbox, "--ask-for-approval", codexAskForApproval], {
          cwd: repoPath,
          stdio: ["pipe", "pipe", "pipe"],
          windowsHide: true,
        });

        registerActiveCodexRun({
          runId,
          repoPath,
          runDirectory,
          lockPath: paths.lockPath,
          child,
          startedAt,
          cancelRequested: false,
          timedOut: false,
        });

        const timeout = setTimeout(() => {
          const active = getActiveCodexRun(runId);
          if (active) active.timedOut = true;
          child.kill("SIGTERM");
        }, codexStreamTimeoutMs);

        child.stdout.on("data", (chunk: Buffer) => {
          const text = chunk.toString("utf8");
          stdoutChunks.push(text);
          pendingWrites.push(appendStdout(repoPath, runId, text));
          persistEvent(createRunEvent(runId, "stdout", { text }));
        });

        child.stderr.on("data", (chunk: Buffer) => {
          const text = chunk.toString("utf8");
          stderrChunks.push(text);
          pendingWrites.push(appendStderr(repoPath, runId, text));
          persistEvent(createRunEvent(runId, "stderr", { text }));
        });

        child.on("error", (error) => {
          spawnError = error.message;
          stderrChunks.push(error.message);
          pendingWrites.push(appendStderr(repoPath, runId, error.message));
        });

        child.on("close", (code) => {
          void (async () => {
            clearTimeout(timeout);
            const active = getActiveCodexRun(runId);
            const cancelled = Boolean(active?.cancelRequested);
            const timedOut = Boolean(active?.timedOut);
            unregisterActiveCodexRun(runId);
            await unlink(paths.lockPath).catch(() => undefined);
            await Promise.allSettled(pendingWrites);

            const durationMs = Math.round(performance.now() - startedAtMs);
            const exitCode = timedOut ? 124 : cancelled ? 130 : typeof code === "number" ? code : 1;
            const gitStatusAfter = await runFileCommand("git", ["status", "--short"], repoPath);
            const gitDiffStat = await runFileCommand("git", ["diff", "--stat"], repoPath);
            let gitDiff = await runFileCommand("git", ["diff", "--", ".", ":(exclude).brainpress/runs/**"], repoPath);
            if (gitDiff.exitCode !== 0) {
              gitDiff = await runFileCommand("git", ["diff"], repoPath);
            }
            const diffPreview = gitDiff.stdout.slice(0, diffPreviewLimit);
            const status = statusFromCodexStreamResult({ cancelled, timedOut, exitCode });
            const rawStderr = stderrChunks.join("");
            const stderrAdditions = [
              timedOut ? codexTimeoutFailure(codexStreamTimeoutMs) : "",
              spawnError && !rawStderr.includes(spawnError) ? spawnError : "",
            ].filter(Boolean);
            if (stderrAdditions.length) {
              await appendStderr(repoPath, runId, `\n${stderrAdditions.join("\n")}`);
            }
            const finalStderr = [rawStderr, ...stderrAdditions].filter(Boolean).join("\n");
            const changedFiles = changedFilesFromDiffStat(gitDiffStat.stdout);

            const runState: CodexRunState = {
              runId,
              status,
              startedAt,
              endedAt: new Date().toISOString(),
              exitCode,
              durationMs,
              cancelled,
              timedOut,
              gitStatusBefore: gitStatusBefore.stdout,
              gitStatusAfter: gitStatusAfter.stdout,
              gitDiffStat: gitDiffStat.stdout,
              diffPreviewMetadata: {
                length: gitDiff.stdout.length,
                truncated: gitDiff.stdout.length > diffPreviewLimit,
                changedFiles,
                previewLimit: diffPreviewLimit,
              },
            };

            await writeRunState(repoPath, runState);
            const gitEvent = createRunEvent(runId, "git_snapshot_captured", {
              gitStatusBefore: gitStatusBefore.stdout,
              gitStatusAfter: gitStatusAfter.stdout,
              gitDiffStat: gitDiffStat.stdout,
              diffPreviewLength: gitDiff.stdout.length,
              diffPreviewTruncated: gitDiff.stdout.length > diffPreviewLimit,
              changedFiles,
            });
            const finalEventType = cancelled
              ? "run_cancelled"
              : timedOut
                ? "run_timed_out"
                : exitCode === 0
                  ? "run_completed"
                  : "run_failed";
            const finalEvent = createRunEvent(runId, finalEventType, {
              status,
              codexStdout: stdoutChunks.join(""),
              codexStderr: finalStderr,
              codexExitCode: exitCode,
              codexDurationMs: durationMs,
              codexTimedOut: timedOut,
              codexCancelled: cancelled,
              gitStatusBefore: gitStatusBefore.stdout,
              gitStatusAfter: gitStatusAfter.stdout,
              gitDiffStat: gitDiffStat.stdout,
              gitDiffTextPreview: diffPreview,
              gitDiffPreviewLength: gitDiff.stdout.length,
              gitDiffPreviewTruncated: gitDiff.stdout.length > diffPreviewLimit,
              changedFilesSummary: changedFiles,
              requiresDiffReview: true,
              failureReason: failureReasonFor(status, timedOut, cancelled, exitCode),
              runState,
            });

            await appendRunEvent(repoPath, gitEvent);
            enqueue(gitEvent);
            await appendRunEvent(repoPath, finalEvent);
            enqueue(finalEvent);
            closed = true;
            controller.close();
          })().catch((error) => {
            if (!closed) {
              const failed = createRunEvent(runId, "run_failed", {
                status: "CodexFailed",
                failureReason: error instanceof Error ? error.message : "Codex streaming failed.",
              });
              enqueue(failed);
              closed = true;
              controller.close();
            }
          });
        });

        child.stdin.write(prompt);
        child.stdin.end();
      })().catch((error) => {
        void unlink(paths.lockPath).catch(() => undefined);
        unregisterActiveCodexRun(runId);
        const failed = createRunEvent(runId, "run_failed", {
          status: "CodexFailed",
          failureReason: error instanceof Error ? error.message : "Codex streaming failed before start.",
        });
        enqueue(failed);
        closed = true;
        controller.close();
      });
    },
    cancel() {
      const active = getActiveCodexRun(runId);
      if (active) {
        active.cancelRequested = true;
        void appendRunEvent(active.repoPath, createRunEvent(runId, "run_cancel_requested", { reason: "client_disconnected" }));
        active.child.kill("SIGTERM");
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

function changedFilesFromDiffStat(diffStat: string) {
  return diffStat
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.includes("|"))
    .map((line) => line.split("|")[0].trim())
    .filter(Boolean);
}

function failureReasonFor(status: AgentRunStatus, timedOut: boolean, cancelled: boolean, exitCode: number) {
  if (cancelled) return "Codex run was cancelled. Partial logs were saved and no memory was absorbed.";
  if (timedOut) return codexTimeoutFailure(codexStreamTimeoutMs);
  if (status === "CodexFailed") return `Codex exited with status ${exitCode}. Review stdout/stderr before retrying.`;
  return undefined;
}
