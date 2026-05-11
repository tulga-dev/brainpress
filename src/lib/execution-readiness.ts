import type { AgentRun, Project } from "@/lib/types";
import { isLikelyLocalRepoPath } from "@/lib/verification";

export type ReadinessState = "passed" | "warning" | "failed";

export interface ReadinessItem {
  id: string;
  label: string;
  state: ReadinessState;
  detail: string;
  critical: boolean;
}

export const protectedBranchNames = ["main", "master", "production", "release"];

export function isProtectedBranch(branch: string) {
  return protectedBranchNames.includes(branch.trim().toLowerCase());
}

export function promptPathLooksInsideRun(run: Pick<AgentRun, "id" | "promptPath">) {
  const normalized = run.promptPath.replace(/\\/g, "/");
  return normalized.endsWith(`.brainpress/runs/${run.id}/prompt.md`) && !normalized.includes("../");
}

export function buildExecutionReadiness(project: Project, run: AgentRun): ReadinessItem[] {
  const repoPath = project.repoPathOrUrl.trim();
  const isLocal = Boolean(repoPath) && isLikelyLocalRepoPath(repoPath);
  const safetyRulesIncluded =
    run.promptSnapshot.includes("## Permission Safety Rules") &&
    run.safetyRulesSnapshot.includes("## Permission Safety Rules");
  const hasVerificationCommands = run.verificationCommands.length > 0;

  return [
    {
      id: "repo-local",
      label: "Repo path is local",
      state: !repoPath ? "failed" : isLocal ? "passed" : "failed",
      detail: !repoPath
        ? "Add a local repo path in Settings before running Codex."
        : isLocal
          ? "Direct execution will stay in the selected local folder."
          : "GitHub URLs are handoff-only. Select a local repo path for direct Codex.",
      critical: true,
    },
    {
      id: "codex-installed",
      label: "Codex is installed",
      state: run.codexAvailable === true ? "passed" : "failed",
      detail:
        run.codexAvailable === true
          ? "Codex CLI was detected."
          : run.codexAvailable === false
            ? "Codex CLI was not found. Install Codex or use handoff/export."
            : "Run Check Codex before executing.",
      critical: true,
    },
    {
      id: "disk-package",
      label: "Disk package prepared",
      state: run.diskPackagePrepared ? "passed" : "failed",
      detail: run.diskPackagePrepared
        ? "prompt.md, context.json, verification.json, and safety-rules.md are prepared."
        : "Prepare the disk package before running Codex.",
      critical: true,
    },
    {
      id: "git-repo",
      label: "Git repo detected",
      state: run.isGitRepo === true ? "passed" : run.isGitRepo === false ? "failed" : "warning",
      detail:
        run.isGitRepo === true
          ? `Git repo detected${run.gitBranch ? ` on ${run.gitBranch}` : ""}.`
          : run.isGitRepo === false
            ? "Selected path is not a Git repo."
            : "Run Git Preflight to check repository state.",
      critical: false,
    },
    {
      id: "git-status",
      label: "Git status checked",
      state: run.gitStatusChecked ? (run.gitIsClean === false ? "warning" : "passed") : "warning",
      detail: run.gitStatusChecked
        ? run.gitIsClean === false
          ? "Workspace is dirty. Brainpress recommends a clean branch or worktree."
          : "Git status has been checked."
        : "Run Git Preflight before executing.",
      critical: false,
    },
    {
      id: "safety-rules",
      label: "Permission Safety Rules included",
      state: safetyRulesIncluded ? "passed" : "failed",
      detail: safetyRulesIncluded
        ? "The prompt and run snapshot include founder-safe permission rules."
        : "Safety rules are missing from the prompt or run snapshot.",
      critical: true,
    },
    {
      id: "prompt-path",
      label: "Prompt path is inside .brainpress/runs",
      state: promptPathLooksInsideRun(run) ? "passed" : "failed",
      detail: promptPathLooksInsideRun(run)
        ? "prompt.md is in the expected run directory."
        : "Prepare disk package so prompt.md is created inside .brainpress/runs/<runId>.",
      critical: true,
    },
    {
      id: "approval-required",
      label: "User approval required",
      state: "passed",
      detail: "The UI requires an explicit approval checkbox before running Codex.",
      critical: true,
    },
    {
      id: "no-auto-commit",
      label: "No auto-commit",
      state: "passed",
      detail: "Brainpress will not commit, deploy, or push.",
      critical: true,
    },
    {
      id: "diff-review",
      label: "Diff review required",
      state: "passed",
      detail: "Absorb stays blocked until the diff is reviewed.",
      critical: true,
    },
    {
      id: "feature-branch",
      label: "Feature branch recommended",
      state: run.gitBranch && isProtectedBranch(run.gitBranch) ? "warning" : "passed",
      detail:
        run.gitBranch && isProtectedBranch(run.gitBranch)
          ? "You are on master/main. Brainpress recommends creating a feature branch or worktree before running Codex."
          : "No protected-branch warning.",
      critical: false,
    },
    {
      id: "verification-commands",
      label: "Verification commands present",
      state: hasVerificationCommands ? "passed" : "warning",
      detail: hasVerificationCommands
        ? "Verification commands are ready for the post-Codex check."
        : "No verification commands are configured.",
      critical: false,
    },
  ];
}

export function criticalReadinessFailures(items: ReadinessItem[]) {
  return items.filter((item) => item.critical && item.state === "failed");
}

export function readinessAllowsRun(items: ReadinessItem[]) {
  return criticalReadinessFailures(items).length === 0;
}

export function canAbsorbWithConfirmation({
  diffReviewed,
  understandsAbsorb,
  verificationPassed,
  skippedVerificationReason,
}: {
  diffReviewed: boolean;
  understandsAbsorb: boolean;
  verificationPassed: boolean;
  skippedVerificationReason: string;
}) {
  if (!diffReviewed || !understandsAbsorb) return false;
  if (verificationPassed) return true;
  return skippedVerificationReason.trim().length > 0;
}

export function requiresVerificationSkippedReason(run: Pick<AgentRun, "verificationResults">) {
  return !run.verificationResults.length || run.verificationResults.some((result) => result.status === "failed");
}
