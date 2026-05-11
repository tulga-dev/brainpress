import path from "node:path";
import type { AgentRun, Project } from "@/lib/types";
import { isLikelyLocalRepoPath } from "@/lib/verification";
import { buildCodexCommandPreview, codexAskForApproval, codexSandbox } from "@/lib/codex-shared";

export interface BridgeValidation {
  ok: boolean;
  error?: string;
}

export function validateLocalProjectPath(repoPathOrUrl: string): BridgeValidation {
  const repoPath = repoPathOrUrl.trim();
  if (!repoPath) return { ok: false, error: "A local repo path is required." };
  if (!isLikelyLocalRepoPath(repoPath)) {
    return {
      ok: false,
      error: "Direct Codex execution requires a local filesystem path. GitHub URLs are handoff-only.",
    };
  }
  return { ok: true };
}

export function getRunDirectory(repoPath: string, runId: string) {
  return path.join(path.resolve(/*turbopackIgnore: true*/ repoPath), ".brainpress", "runs", runId);
}

export function getRunPromptPath(repoPath: string, runId: string) {
  return path.join(getRunDirectory(repoPath, runId), "prompt.md");
}

export function isPathInside(parentPath: string, candidatePath: string) {
  const parent = path.resolve(/*turbopackIgnore: true*/ parentPath);
  const candidate = path.resolve(/*turbopackIgnore: true*/ candidatePath);
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export function validateRunDirectory(repoPath: string, runId: string, runDirectory: string): BridgeValidation {
  const expectedRunsRoot = path.join(path.resolve(/*turbopackIgnore: true*/ repoPath), ".brainpress", "runs");
  if (!isPathInside(expectedRunsRoot, runDirectory)) {
    return { ok: false, error: "Run directory must stay inside .brainpress/runs for the selected project." };
  }

  if (!path.basename(path.resolve(/*turbopackIgnore: true*/ runDirectory)).startsWith(runId)) {
    return { ok: false, error: "Run directory must match the selected AgentRun id." };
  }

  return { ok: true };
}

export function validatePromptPath(repoPath: string, runId: string, promptPath: string): BridgeValidation {
  const expectedPromptPath = getRunPromptPath(repoPath, runId);
  if (path.resolve(/*turbopackIgnore: true*/ promptPath) !== path.resolve(/*turbopackIgnore: true*/ expectedPromptPath)) {
    return { ok: false, error: "promptPath must point to .brainpress/runs/<runId>/prompt.md." };
  }

  if (!isPathInside(path.resolve(/*turbopackIgnore: true*/ repoPath), promptPath)) {
    return { ok: false, error: "promptPath must stay inside the selected project folder." };
  }

  return { ok: true };
}

export function approvalRequired(requireApproval: boolean) {
  return requireApproval === true
    ? { ok: true }
    : { ok: false, error: "Explicit approval is required before running Codex." };
}

export function validateCodexStreamRequest({
  repoPath,
  runId,
  promptPath,
  approvalConfirmed,
}: {
  repoPath: string;
  runId: string;
  promptPath: string;
  approvalConfirmed: boolean;
}): BridgeValidation {
  const localValidation = validateLocalProjectPath(repoPath);
  if (!localValidation.ok) return localValidation;

  const approvalValidation = approvalRequired(approvalConfirmed);
  if (!approvalValidation.ok) return approvalValidation;

  if (!runId || !promptPath) {
    return { ok: false, error: "runId and promptPath are required." };
  }

  return validatePromptPath(repoPath, runId, promptPath);
}

export function promptContainsPermissionSafetyRules(promptText: string) {
  return promptText.includes("## Permission Safety Rules") && promptText.includes("Work only inside the selected project folder.");
}

export function codexUnavailableResult(exitCode: number | null, stderr: string, stdout = "") {
  return {
    available: false,
    versionText: stdout.trim() || stderr.trim(),
    exitCode,
    stdout,
    stderr: stderr || "Codex CLI is unavailable. Install Codex or keep using handoff/export.",
  };
}

export function canAbsorbRun(run: Pick<AgentRun, "requiresDiffReview" | "diffReviewedAt">) {
  return Boolean(!run.requiresDiffReview || run.diffReviewedAt);
}

export function isRunAlreadyRunning(status: AgentRun["status"], lockExists: boolean) {
  return status === "RunningCodex" || lockExists;
}

export function codexTimeoutFailure(timeoutMs: number) {
  return `Codex timed out after ${Math.round(timeoutMs / 60000)} minutes. The process was stopped, partial output was saved, and no memory was absorbed.`;
}

export function directExecutionProjectSnapshot(project: Project) {
  return {
    id: project.id,
    name: project.name,
    repoPathOrUrl: project.repoPathOrUrl,
    safetyRules: project.safetyRules,
    verificationCommands: project.verificationCommands,
  };
}
