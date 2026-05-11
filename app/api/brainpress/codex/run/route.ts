import { existsSync } from "node:fs";
import { open, readFile, unlink } from "node:fs/promises";
import { NextResponse } from "next/server";
import {
  approvalRequired,
  codexTimeoutFailure,
  getRunDirectory,
  isPathInside,
  isRunAlreadyRunning,
  validateLocalProjectPath,
  validatePromptPath,
} from "@/lib/codex-bridge";
import { codexAskForApproval, codexSandbox } from "@/lib/codex-shared";
import { runFileCommand } from "@/lib/server-runner";
import type { AgentRunStatus } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const codexTimeoutMs = 10 * 60 * 1000;

interface CodexRunRequest {
  repoPath?: string;
  runId?: string;
  promptPath?: string;
  requireApproval?: boolean;
  sandbox?: string;
  askForApproval?: string;
  runStatus?: AgentRunStatus;
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as CodexRunRequest;
  const repoPath = body.repoPath?.trim() || "";
  const runId = body.runId?.trim() || "";
  const promptPath = body.promptPath?.trim() || "";

  const localValidation = validateLocalProjectPath(repoPath);
  if (!localValidation.ok) return NextResponse.json({ error: localValidation.error }, { status: 400 });
  const approvalValidation = approvalRequired(Boolean(body.requireApproval));
  if (!approvalValidation.ok) return NextResponse.json({ error: approvalValidation.error }, { status: 403 });
  if (body.sandbox !== codexSandbox || body.askForApproval !== codexAskForApproval) {
    return NextResponse.json({ error: "Codex must run with workspace-write sandbox and on-request approval." }, { status: 400 });
  }
  if (!runId || !promptPath) {
    return NextResponse.json({ error: "runId and promptPath are required." }, { status: 400 });
  }

  const promptValidation = validatePromptPath(repoPath, runId, promptPath);
  if (!promptValidation.ok) return NextResponse.json({ error: promptValidation.error }, { status: 400 });
  if (!existsSync(/*turbopackIgnore: true*/ promptPath)) {
    return NextResponse.json(
      { error: "prompt.md does not exist. Click Prepare Disk Package, then try again." },
      { status: 400 },
    );
  }

  const runDirectory = getRunDirectory(repoPath, runId);
  const lockPath = `${runDirectory}/codex.lock`;
  if (!isPathInside(runDirectory, lockPath)) {
    return NextResponse.json({ error: "Internal lock path failed safety validation." }, { status: 400 });
  }
  if (isRunAlreadyRunning(body.runStatus || "Prepared", existsSync(/*turbopackIgnore: true*/ lockPath))) {
    return NextResponse.json(
      { error: "Codex is already running for this AgentRun. Wait for it to finish before starting another run." },
      { status: 409 },
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

  let lockHandle: Awaited<ReturnType<typeof open>> | null = null;
  try {
    lockHandle = await open(lockPath, "wx");
    await lockHandle.writeFile(new Date().toISOString(), "utf8");
  } catch {
    return NextResponse.json(
      { error: "Codex is already running for this AgentRun. Wait for it to finish before starting another run." },
      { status: 409 },
    );
  } finally {
    await lockHandle?.close();
  }

  const prompt = await readFile(/*turbopackIgnore: true*/ promptPath, "utf8");
  try {
    const gitStatusBefore = await runFileCommand("git", ["status", "--short"], repoPath);
    const codex = await runFileCommand(
      "codex",
      ["exec", "--sandbox", codexSandbox, "--ask-for-approval", codexAskForApproval],
      repoPath,
      prompt,
      { timeoutMs: codexTimeoutMs },
    );
    const gitStatusAfter = await runFileCommand("git", ["status", "--short"], repoPath);
    const gitDiffStat = await runFileCommand("git", ["diff", "--stat"], repoPath);
    let gitDiff = await runFileCommand("git", ["diff", "--", ".", ":(exclude).brainpress/runs/**"], repoPath);
    if (gitDiff.exitCode !== 0) {
      gitDiff = await runFileCommand("git", ["diff"], repoPath);
    }
    const previewLimit = 20_000;
    const diffPreview = gitDiff.stdout.slice(0, previewLimit);

    return NextResponse.json({
      codexStdout: codex.stdout,
      codexStderr: codex.timedOut ? `${codex.stderr}\n${codexTimeoutFailure(codexTimeoutMs)}`.trim() : codex.stderr,
      codexExitCode: codex.exitCode,
      codexDurationMs: codex.durationMs,
      codexTimedOut: Boolean(codex.timedOut),
      failureReason: codex.timedOut ? codexTimeoutFailure(codexTimeoutMs) : undefined,
      gitStatusBefore: gitStatusBefore.stdout,
      gitStatusAfter: gitStatusAfter.stdout,
      gitDiffStat: gitDiffStat.stdout,
      gitDiffTextPreview: diffPreview,
      gitDiffPreviewLength: gitDiff.stdout.length,
      gitDiffPreviewTruncated: gitDiff.stdout.length > previewLimit,
      changedFilesSummary: changedFilesFromDiffStat(gitDiffStat.stdout),
      requiresDiffReview: true,
    });
  } finally {
    await unlink(lockPath).catch(() => undefined);
  }
}

function changedFilesFromDiffStat(diffStat: string) {
  return diffStat
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.includes("|"))
    .map((line) => line.split("|")[0].trim())
    .filter(Boolean);
}
