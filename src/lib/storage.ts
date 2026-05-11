"use client";

import { initialState } from "@/lib/seed";
import { defaultPermissionSafetyRules, ensurePermissionSafetyRules } from "@/lib/safety";
import { buildCodexCommandPreview } from "@/lib/codex-shared";
import type { AgentPrompt, AgentRun, BrainpressState, BuildLog, Project, ProjectImport } from "@/lib/types";

const storageKey = "brainpress.mvp.state.v1";

export function loadBrainpressState(): BrainpressState {
  if (typeof window === "undefined") return initialState;

  try {
    const stored = window.localStorage.getItem(storageKey);
    if (!stored) {
      window.localStorage.setItem(storageKey, JSON.stringify(initialState));
      return initialState;
    }

      return normalizeBrainpressState({
        ...initialState,
        ...JSON.parse(stored),
      });
  } catch {
    return initialState;
  }
}

export function saveBrainpressState(state: BrainpressState) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(storageKey, JSON.stringify(state));
}

export function resetBrainpressState() {
  if (typeof window === "undefined") return initialState;
  window.localStorage.setItem(storageKey, JSON.stringify(initialState));
  return initialState;
}

function normalizeBrainpressState(state: BrainpressState): BrainpressState {
  const projects = state.projects.map(normalizeProject);
  const safetyRulesByProject = new Map(projects.map((project) => [project.id, project.safetyRules]));
  const projectIdByOutcome = new Map(state.outcomes.map((outcome) => [outcome.id, outcome.projectId]));

  return {
    ...state,
    projects,
    prompts: (state.prompts || []).map((prompt) =>
      normalizePrompt(prompt, safetyRulesByProject, projectIdByOutcome),
    ),
    agentRuns: (state.agentRuns || []).map((run) => normalizeAgentRun(run, safetyRulesByProject.get(run.projectId))),
    buildLogs: (state.buildLogs || []).map(normalizeBuildLog),
    imports: (state.imports || []).map(normalizeProjectImport),
  };
}

function normalizeProject(project: Project): Project {
  return {
    ...project,
    safetyRules: project.safetyRules?.trim() || defaultPermissionSafetyRules,
  };
}

function normalizeAgentRun(run: AgentRun, projectSafetyRules = defaultPermissionSafetyRules): AgentRun {
  const runId = run.id;
  return {
    ...run,
    executionMode: run.executionMode || "HandoffOnly",
    approvalState: run.approvalState || "NotRequested",
    safetyRulesSnapshot: run.safetyRulesSnapshot?.trim() || projectSafetyRules,
    promptSnapshot: ensurePermissionSafetyRules(run.promptSnapshot, run.safetyRulesSnapshot || projectSafetyRules),
    verificationResults: run.verificationResults || [],
    codexCommandPreview: run.codexCommandPreview || buildCodexCommandPreview(runId),
    codexAvailable: typeof run.codexAvailable === "boolean" ? run.codexAvailable : null,
    codexExitCode: typeof run.codexExitCode === "number" ? run.codexExitCode : null,
    codexStdout: run.codexStdout || "",
    codexStderr: run.codexStderr || "",
    codexDurationMs: typeof run.codexDurationMs === "number" ? run.codexDurationMs : null,
    codexTimedOut: Boolean(run.codexTimedOut),
    codexCancelled: Boolean(run.codexCancelled),
    codexStartedAt: run.codexStartedAt,
    codexEndedAt: run.codexEndedAt,
    gitStatusBefore: run.gitStatusBefore || "",
    gitStatusAfter: run.gitStatusAfter || "",
    gitBranch: run.gitBranch || "",
    gitIsClean: typeof run.gitIsClean === "boolean" ? run.gitIsClean : null,
    isGitRepo: typeof run.isGitRepo === "boolean" ? run.isGitRepo : null,
    gitStatusChecked: Boolean(run.gitStatusChecked),
    gitPreflightWarnings: run.gitPreflightWarnings || [],
    gitDiffStat: run.gitDiffStat || "",
    gitDiffTextPreview: run.gitDiffTextPreview || "",
    gitDiffPreviewLength: typeof run.gitDiffPreviewLength === "number" ? run.gitDiffPreviewLength : 0,
    gitDiffPreviewTruncated: Boolean(run.gitDiffPreviewTruncated),
    changedFilesSummary: run.changedFilesSummary || [],
    diskPackagePrepared: Boolean(run.diskPackagePrepared),
    promptPath: run.promptPath || "",
    verificationSummary: run.verificationSummary || "No verification run yet.",
    requiresDiffReview: Boolean(run.requiresDiffReview),
  };
}

function normalizePrompt(
  prompt: AgentPrompt,
  safetyRulesByProject: Map<string, string>,
  projectIdByOutcome: Map<string, string>,
): AgentPrompt {
  const projectId = projectIdByOutcome.get(prompt.outcomeId);
  const safetyRules = projectId ? safetyRulesByProject.get(projectId) : undefined;

  return {
    ...prompt,
    prompt: ensurePermissionSafetyRules(prompt.prompt, safetyRules || defaultPermissionSafetyRules),
  };
}

function normalizeBuildLog(log: BuildLog): BuildLog {
  return {
    ...log,
    verificationResults: log.verificationResults || [],
    verificationSummary: log.verificationSummary || "No verification summary recorded.",
    skippedVerificationReason: log.skippedVerificationReason,
  };
}

function normalizeProjectImport(source: ProjectImport): ProjectImport {
  const memorySections = source.memorySections || {
    productSummary: "",
    currentBuildState: "",
    technicalArchitecture: [],
    activeDecisions: [],
    completedWork: [],
    knownIssues: [],
    openQuestions: [],
    roadmap: [],
  };

  return {
    ...source,
    sourceType: source.sourceType || "TextPaste",
    title: source.title || source.fileName || "Imported project history",
    extractedText: source.extractedText || "",
    extractedPages: source.extractedPages || [],
    detectedThemes: source.detectedThemes || [],
    analyzer: source.analyzer || "Local",
    analysisSummary: source.analysisSummary || "Imported source saved without analysis summary.",
    analysisBullets: source.analysisBullets || [],
    plainEnglishSummary: source.plainEnglishSummary || "",
    keyFacts: source.keyFacts || [],
    discardedNoise: source.discardedNoise || [],
    memorySections: {
      productSummary: memorySections.productSummary || "",
      currentBuildState: memorySections.currentBuildState || "",
      technicalArchitecture: memorySections.technicalArchitecture || [],
      activeDecisions: memorySections.activeDecisions || [],
      completedWork: memorySections.completedWork || [],
      knownIssues: memorySections.knownIssues || [],
      openQuestions: memorySections.openQuestions || [],
      roadmap: memorySections.roadmap || [],
    },
    suggestedOutcomes: source.suggestedOutcomes || [],
  };
}
