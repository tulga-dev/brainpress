"use client";

import { initialState } from "@/lib/seed";
import { defaultPermissionSafetyRules, ensurePermissionSafetyRules } from "@/lib/safety";
import { buildCodexCommandPreview } from "@/lib/codex-shared";
import { normalizeDevelopmentTask } from "@/lib/development-tasks";
import { normalizeDevelopmentTaskResult } from "@/lib/development-task-results";
import { createDefaultServiceAgents, createEmptyServiceWindow, createServiceFromProject, normalizeService, normalizeServiceAgent, normalizeServiceWindow } from "@/lib/services";
import { normalizeProductWindow } from "@/lib/product-window";
import { normalizeRunIssue } from "@/lib/run-agents";
import {
  normalizeClarifyingQuestion,
  normalizeConstitution,
  normalizePlan,
  normalizeSpec,
  normalizeTaskList,
} from "@/lib/spec-loop";
import { normalizeThinkSession } from "@/lib/think-sessions";
import type { AgentPrompt, AgentRun, BrainpressState, BuildLog, ConsolidatedProjectMemory, Memory, Project, ProjectImport } from "@/lib/types";

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
  const projects = ensureSeedProjects(state.projects.map(normalizeProject));
  const services = ensureServices(projects, state.services || []);
  const serviceAgents = ensureServiceAgents(services, state.serviceAgents || []);
  const serviceWindows = ensureServiceWindows(services, state.serviceWindows || []);
  const safetyRulesByProject = new Map(projects.map((project) => [project.id, project.safetyRules]));
  const projectIdByOutcome = new Map(state.outcomes.map((outcome) => [outcome.id, outcome.projectId]));
  const memories = Object.fromEntries(
    Object.entries(state.memories || {}).map(([projectId, memory]) => [projectId, normalizeMemory(memory, projectId)]),
  );
  for (const project of projects) {
    if (!memories[project.id]) memories[project.id] = normalizeMemory(initialState.memories[project.id] || emptyMemory(project.id), project.id);
  }
  const projectById = new Map(projects.map((project) => [project.id, project]));

  return {
    ...state,
    services,
    serviceAgents,
    serviceWindows,
    projects,
    memories,
    prompts: (state.prompts || []).map((prompt) =>
      normalizePrompt(prompt, safetyRulesByProject, projectIdByOutcome),
    ),
    thinkSessions: (state.thinkSessions || []).map(normalizeThinkSession),
    productWindows: (state.productWindows || []).map(normalizeProductWindow),
    constitutions: (state.constitutions || []).map(normalizeConstitution),
    specs: (state.specs || []).map((spec) => normalizeSpec({ ...spec, serviceId: spec.serviceId || spec.projectId })),
    clarifyingQuestions: (state.clarifyingQuestions || []).map(normalizeClarifyingQuestion),
    plans: (state.plans || []).map((plan) => normalizePlan({ ...plan, serviceId: plan.serviceId || plan.projectId })),
    taskLists: (state.taskLists || []).map((taskList) => normalizeTaskList({ ...taskList, serviceId: taskList.serviceId || taskList.projectId })),
    developmentTasks: (state.developmentTasks || []).map((task) => normalizeDevelopmentTask(task, projectById.get(task.projectId))),
    developmentTaskResults: (state.developmentTaskResults || []).map(normalizeDevelopmentTaskResult),
    runIssues: (state.runIssues || []).map(normalizeRunIssue),
    agentRuns: (state.agentRuns || []).map((run) => normalizeAgentRun(run, safetyRulesByProject.get(run.projectId))),
    buildLogs: (state.buildLogs || []).map(normalizeBuildLog),
    imports: normalizeProjectImports(state.imports || []),
  };
}

function ensureServices(projects: Project[], services: Partial<BrainpressState["services"][number]>[]) {
  const serviceById = new Map((services || []).map((service) => [service.id || "", service]));
  return projects.map((project) => normalizeService(serviceById.get(project.id) || {}, project));
}

function ensureServiceAgents(services: BrainpressState["services"], agents: Partial<BrainpressState["serviceAgents"][number]>[]) {
  const normalized = (agents || []).map((agent) => normalizeServiceAgent(agent));
  const agentsByService = new Map<string, BrainpressState["serviceAgents"]>();
  for (const agent of normalized) {
    agentsByService.set(agent.serviceId, [...(agentsByService.get(agent.serviceId) || []), agent]);
  }

  return services.flatMap((service) => {
    const existing = agentsByService.get(service.id) || [];
    if (existing.length) return existing;
    return createDefaultServiceAgents(service, service.updatedAt);
  });
}

function ensureServiceWindows(services: BrainpressState["services"], windows: Partial<BrainpressState["serviceWindows"][number]>[]) {
  const windowByService = new Map((windows || []).map((window) => [window.serviceId || "", window]));
  return services.map((service) => normalizeServiceWindow(windowByService.get(service.id) || createEmptyServiceWindow(service.id, service.updatedAt), service.id));
}

function ensureSeedProjects(projects: Project[]) {
  const existingIds = new Set(projects.map((project) => project.id));
  const missingSeedProjects = initialState.projects.filter((project) => !existingIds.has(project.id)).map(normalizeProject);
  return [...missingSeedProjects, ...projects];
}

function emptyMemory(projectId: string): Memory {
  return {
    projectId,
    productSummary: "",
    vision: "",
    targetUsers: "",
    currentBuildState: "",
    technicalArchitecture: "",
    activeDecisions: "",
    deprecatedIdeas: "",
    completedWork: "",
    openQuestions: "",
    knownIssues: "",
    roadmap: "",
  };
}

function normalizeMemory(memory: Memory, projectId: string): Memory {
  return {
    projectId: memory.projectId || projectId,
    productSummary: memory.productSummary || "",
    vision: memory.vision || "",
    targetUsers: memory.targetUsers || "",
    currentBuildState: memory.currentBuildState || "",
    technicalArchitecture: memory.technicalArchitecture || "",
    activeDecisions: memory.activeDecisions || "",
    deprecatedIdeas: memory.deprecatedIdeas || "",
    completedWork: memory.completedWork || "",
    openQuestions: memory.openQuestions || "",
    knownIssues: memory.knownIssues || "",
    roadmap: memory.roadmap || "",
    consolidated: memory.consolidated ? normalizeConsolidatedProjectMemory(memory.consolidated) : undefined,
  };
}

function normalizeConsolidatedProjectMemory(consolidated: ConsolidatedProjectMemory): ConsolidatedProjectMemory {
  return {
    productSnapshot: consolidated.productSnapshot || "",
    plainEnglishSummary: consolidated.plainEnglishSummary || "",
    whatIsDone: consolidated.whatIsDone || [],
    whatIsBrokenOrRisky: consolidated.whatIsBrokenOrRisky || [],
    whatToDoNext: consolidated.whatToDoNext || [],
    roadmapNow: consolidated.roadmapNow || [],
    roadmapNext: consolidated.roadmapNext || [],
    roadmapLater: consolidated.roadmapLater || [],
    suggestedNextOutcome: consolidated.suggestedNextOutcome || null,
    technicalDetails: consolidated.technicalDetails || [],
    openQuestions: consolidated.openQuestions || [],
    sourceIds: consolidated.sourceIds || [],
    sourceCount: typeof consolidated.sourceCount === "number" ? consolidated.sourceCount : 0,
    analyzer: consolidated.analyzer || "Local",
    updatedAt: consolidated.updatedAt || new Date().toISOString(),
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

function normalizeProjectImports(imports: ProjectImport[]): ProjectImport[] {
  const seenIds = new Set<string>();

  return imports.map((source, index) => {
    const normalized = normalizeProjectImport(source, index);
    if (!seenIds.has(normalized.id)) {
      seenIds.add(normalized.id);
      return normalized;
    }

    const id = uniqueLegacyImportId(source, index, seenIds);
    seenIds.add(id);
    return { ...normalized, id };
  });
}

function normalizeProjectImport(source: ProjectImport, index = 0): ProjectImport {
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
    id: source.id || uniqueLegacyImportId(source, index),
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
    createdAt: source.createdAt || new Date().toISOString(),
  };
}

function uniqueLegacyImportId(source: ProjectImport, index: number, seenIds = new Set<string>()) {
  const base = `import_legacy_${index}_${sanitizeImportIdPart(source.createdAt || source.fileName || source.title || "source")}`;
  let candidate = base;
  let suffix = 1;

  while (seenIds.has(candidate)) {
    candidate = `${base}_${suffix}`;
    suffix += 1;
  }

  return candidate;
}

function sanitizeImportIdPart(value: string) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "source";
}
