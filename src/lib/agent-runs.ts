import {
  dedupe,
  generateAgentPrompt,
  linesToText,
  uid,
} from "@/lib/brainpress";
import type {
  AgentPrompt,
  AgentRun,
  Memory,
  Outcome,
  Project,
  TargetAgent,
  VerificationResult,
} from "@/lib/types";
import { buildCodexCommandPreview } from "@/lib/codex-shared";
import { ensurePermissionSafetyRules, getProjectSafetyRules } from "@/lib/safety";
import { summarizeVerificationResults } from "@/lib/verification";

export interface HandoffPackage {
  promptMarkdown: string;
  contextJson: string;
  verificationJson: string;
  fullHandoff: string;
  codexCommandPreview: string;
  claudeCommandPreview: string;
}

export function createAgentRun({
  project,
  memory,
  outcome,
  prompt,
  targetAgent,
}: {
  project: Project;
  memory: Memory;
  outcome: Outcome;
  prompt?: AgentPrompt;
  targetAgent: TargetAgent;
}): AgentRun {
  const now = new Date().toISOString();
  const runId = uid("run");
  const promptSnapshot =
    prompt?.prompt ||
    outcome.generatedPrompt ||
    generateAgentPrompt(project, memory, outcome, targetAgent);
  const safetyRules = getProjectSafetyRules(project);
  const codexCommandPreview = buildCodexCommandPreview(runId);

  return {
    id: runId,
    projectId: project.id,
    outcomeId: outcome.id,
    promptId: prompt?.id,
    targetAgent,
    status: "Prepared",
    executionMode: "HandoffOnly",
    approvalState: "NotRequested",
    repoPathOrUrl: project.repoPathOrUrl,
    handoffDirectory: `.brainpress/runs/${runId}`,
    promptSnapshot: ensurePermissionSafetyRules(promptSnapshot, safetyRules),
    safetyRulesSnapshot: safetyRules,
    memorySnapshot: memory,
    outcomeSnapshot: outcome,
    verificationCommands: outcome.verificationCommands.length
      ? outcome.verificationCommands
      : project.verificationCommands,
    verificationResults: [],
    codexCommandPreview,
    codexAvailable: null,
    codexExitCode: null,
    codexStdout: "",
    codexStderr: "",
    codexDurationMs: null,
    codexTimedOut: false,
    codexCancelled: false,
    gitStatusBefore: "",
    gitStatusAfter: "",
    gitBranch: "",
    gitIsClean: null,
    isGitRepo: null,
    gitStatusChecked: false,
    gitPreflightWarnings: [],
    gitDiffStat: "",
    gitDiffTextPreview: "",
    gitDiffPreviewLength: 0,
    gitDiffPreviewTruncated: false,
    changedFilesSummary: [],
    diskPackagePrepared: false,
    promptPath: "",
    verificationSummary: "No verification run yet.",
    requiresDiffReview: false,
    createdAt: now,
    updatedAt: now,
  };
}

export function generateHandoffPackage(run: AgentRun, project: Project): HandoffPackage {
  const safetyRules = run.safetyRulesSnapshot || getProjectSafetyRules(project);
  const promptWithSafetyRules = ensurePermissionSafetyRules(run.promptSnapshot, safetyRules);
  const context = {
    project,
    memory: run.memorySnapshot,
    outcome: run.outcomeSnapshot,
    constraints: dedupe([...project.constraints, ...run.outcomeSnapshot.constraints]),
    safetyRules,
    targetAgent: run.targetAgent,
    handoffDirectory: run.handoffDirectory,
    commandPreviewContext: {
      codex:
        "Use the exported prompt.md, which includes Permission Safety Rules, as stdin for the Codex command preview.",
      claudeCode:
        "Use the exported prompt.md, which includes Permission Safety Rules, as the Claude Code planning context.",
    },
    timestamp: run.updatedAt,
  };

  const verification = {
    commands: run.verificationCommands,
    latestResults: run.verificationResults,
    summary: summarizeVerificationResults(run.verificationResults),
  };

  const promptMarkdown = [
    promptWithSafetyRules,
    "",
    "## Brainpress Handoff Package",
    "",
    "### Project Context Summary",
    run.memorySnapshot.productSummary || "Not yet defined.",
    "",
    "### Active Decisions",
    run.memorySnapshot.activeDecisions || "- Not yet defined.",
    "",
    "### Constraints",
    linesToText(dedupe([...project.constraints, ...run.outcomeSnapshot.constraints])) || "- Not specified.",
    "",
    "### Outcome Goal",
    run.outcomeSnapshot.goal,
    "",
    "### Acceptance Criteria",
    linesToText(run.outcomeSnapshot.acceptanceCriteria),
    "",
    "### Verification Commands",
    linesToText(run.verificationCommands),
    "",
    "### After-Completion Reporting Format",
    "- changed files",
    "- commands run",
    "- tests/build status",
    "- remaining issues",
    "- next recommended task",
  ].join("\n");

  const contextJson = `${JSON.stringify(context, null, 2)}\n`;
  const verificationJson = `${JSON.stringify(verification, null, 2)}\n`;
  const codexCommandPreview =
    run.codexCommandPreview ||
    buildCodexCommandPreview(run.id);
  const claudeCommandPreview = `claude --permission-mode plan "$(cat .brainpress/runs/${run.id}/prompt.md)"`;

  return {
    promptMarkdown,
    contextJson,
    verificationJson,
    fullHandoff: [
      "# Brainpress Agent Handoff",
      "",
      `Run: ${run.id}`,
      `Target agent: ${run.targetAgent}`,
      `Handoff directory: ${run.handoffDirectory}`,
      "",
      "## prompt.md",
      "",
      promptMarkdown,
      "",
      "## context.json",
      "",
      "```json",
      contextJson.trim(),
      "```",
      "",
      "## verification.json",
      "",
      "```json",
      verificationJson.trim(),
      "```",
    ].join("\n"),
    codexCommandPreview,
    claudeCommandPreview,
  };
}

export function applyVerificationResults(run: AgentRun, results: VerificationResult[]): AgentRun {
  const failed = results.some((result) => result.status === "failed");
  return {
    ...run,
    verificationResults: results,
    verificationSummary: summarizeVerificationResults(results),
    status: failed ? "VerificationFailed" : "VerificationPassed",
    updatedAt: new Date().toISOString(),
  };
}

export function canAbsorbAgentRun(run: AgentRun) {
  return Boolean(!run.requiresDiffReview || run.diffReviewedAt);
}

export function createVerificationRepairOutcome(project: Project, memory: Memory, run: AgentRun): Outcome | null {
  const failingResults = run.verificationResults.filter((result) => result.status === "failed");
  if (!failingResults.length) return null;

  const now = new Date().toISOString();
  const failureOutput = failingResults
    .map((result) =>
      [
        `Command: ${result.command}`,
        `Exit code: ${result.exitCode}`,
        result.stderr ? `stderr:\n${result.stderr}` : "",
        result.stdout ? `stdout:\n${result.stdout}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n\n");
  const outcome: Outcome = {
    id: uid("outcome"),
    projectId: project.id,
    title: `Fix failing verification for ${run.outcomeSnapshot.title}`,
    goal: `Repair the failing verification from AgentRun ${run.id} without expanding scope.\n\nFailing command output:\n${failureOutput}`,
    acceptanceCriteria: [
      "Failing verification commands pass.",
      "Changes stay inside the original outcome scope.",
      "Remaining issues are reported clearly.",
    ],
    constraints: project.constraints,
    verificationCommands: failingResults.map((result) => result.command),
    maxIterations: 2,
    status: "Draft",
    generatedPlan: "",
    generatedPrompt: "",
    createdAt: now,
  };

  return {
    ...outcome,
    generatedPrompt: generateAgentPrompt(project, memory, outcome, run.targetAgent),
  };
}
