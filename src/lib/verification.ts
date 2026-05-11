import type { VerificationResult, VerificationStatus } from "@/lib/types";

export const allowedVerificationCommands = [
  "npm run typecheck",
  "npm test",
  "npm run build",
  "git status --short",
  "git diff --stat",
] as const;

export type AllowedVerificationCommand = (typeof allowedVerificationCommands)[number];

const allowedCommandSet = new Set<string>(allowedVerificationCommands);

export function isAllowedVerificationCommand(command: string) {
  return allowedCommandSet.has(command.trim());
}

export function validateVerificationCommands(commands: string[]) {
  const normalized = commands.map((command) => command.trim()).filter(Boolean);
  const rejectedCommands = normalized.filter((command) => !isAllowedVerificationCommand(command));

  return {
    allowedCommands: normalized.filter(isAllowedVerificationCommand),
    rejectedCommands,
    isValid: rejectedCommands.length === 0,
  };
}

export function isLikelyLocalRepoPath(repoPath: string) {
  const trimmed = repoPath.trim();
  if (!trimmed) return false;
  if (/^[a-z]+:\/\//i.test(trimmed)) return false;
  if (/^\\\\/.test(trimmed)) return false;
  return /^[a-zA-Z]:[\\/]/.test(trimmed) || trimmed.startsWith("/");
}

export function summarizeVerificationResults(results: VerificationResult[]) {
  if (!results.length) return "No verification run yet.";

  const passed = results.filter((result) => result.status === "passed").length;
  const failed = results.length - passed;

  if (!failed) return `All verification passed (${passed}/${results.length}).`;
  if (!passed) return `All verification failed (${failed}/${results.length}).`;
  return `Some verification failed (${passed}/${results.length} passed, ${failed} failed).`;
}

export function verificationStatusFromResults(results: VerificationResult[]): VerificationStatus {
  if (!results.length) return "Not run";
  const hasPassed = results.some((result) => result.status === "passed");
  const hasFailed = results.some((result) => result.status === "failed");
  if (hasPassed && hasFailed) return "Mixed";
  return hasFailed ? "Failing" : "Passing";
}

export function repairSuggestionsFromVerification(results: VerificationResult[]) {
  return results
    .filter((result) => result.status === "failed")
    .flatMap((result) => {
      if (result.command === "npm run typecheck") return ["Fix failing typecheck"];
      if (result.command === "npm test") return ["Fix failing tests"];
      if (result.command === "npm run build") return ["Investigate build failure"];
      if (result.command === "git status --short") return ["Review uncommitted workspace changes"];
      if (result.command === "git diff --stat") return ["Review changed-file footprint"];
      return ["Investigate verification failure"];
    });
}
