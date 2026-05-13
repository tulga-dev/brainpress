import { fieldLines, uid } from "@/lib/brainpress";
import { generateCodexGoalText } from "@/lib/codex-goal";
import type {
  DevelopmentTask,
  DevelopmentTaskDispatchMode,
  DevelopmentTaskDispatchTarget,
  DevelopmentTaskPriority,
  DevelopmentTaskStatus,
  DevelopmentTaskType,
  Memory,
  Project,
} from "@/lib/types";

export const developmentTaskTypes: DevelopmentTaskType[] = [
  "bug_fix",
  "feature",
  "refactor",
  "test",
  "build_fix",
  "qa",
  "code_review",
  "documentation",
];

export const developmentTaskStatuses: DevelopmentTaskStatus[] = [
  "draft",
  "ready_to_dispatch",
  "prepared_for_github",
  "dispatching",
  "dispatched",
  "running",
  "completed",
  "needs_review",
  "verified",
  "failed",
  "cancelled",
  "merged",
];

export const developmentTaskPriorities: DevelopmentTaskPriority[] = ["low", "medium", "high", "urgent"];
export const developmentTaskDispatchTargets: DevelopmentTaskDispatchTarget[] = ["codex_cloud", "codex_cli", "github_issue", "manual", "none"];
export const developmentTaskDispatchModes: DevelopmentTaskDispatchMode[] = ["direct", "local_bridge", "github_based", "manual_copy"];

export function createDevelopmentTaskFromIntent({
  input,
  project,
  memory,
  codexCloudConfigured = false,
  now = new Date().toISOString(),
}: {
  input: string;
  project: Project;
  memory?: Memory;
  codexCloudConfigured?: boolean;
  now?: string;
}): DevelopmentTask {
  const normalizedInput = input.trim();
  const taskType = inferTaskType(normalizedInput);
  const priority = inferPriority(normalizedInput, taskType);
  const affectedAreas = inferAffectedAreas(normalizedInput);
  const acceptanceCriteria = inferAcceptanceCriteria(normalizedInput, project, taskType);
  const verificationCommands = inferVerificationCommands(normalizedInput, project);
  const manualQaSteps = inferManualQaSteps(normalizedInput, taskType);
  const constraints = inferConstraints(project);
  const dispatchTarget = defaultDispatchTarget({ codexCloudConfigured, preferredAgent: project.preferredAgent });
  const dispatchMode = defaultDispatchMode(dispatchTarget);
  const taskDraft = {
    title: inferTitle(normalizedInput, taskType),
    description: buildTaskDescription(normalizedInput, affectedAreas),
    affectedAreas,
    acceptanceCriteria,
    verificationCommands,
    manualQaSteps,
    constraints,
    taskType,
  };

  return {
    id: uid("devtask"),
    projectId: project.id,
    title: taskDraft.title,
    description: taskDraft.description,
    taskType,
    status: "ready_to_dispatch",
    priority,
    repo: project.repoPathOrUrl,
    branch: "",
    context: buildTaskContext(normalizedInput, project, memory),
    affectedAreas,
    acceptanceCriteria,
    verificationCommands,
    manualQaSteps,
    constraints,
    dispatchTarget,
    dispatchMode,
    codexGoal: generateCodexGoalText({ project, task: taskDraft, memory }),
    codexGoalUpdatedAt: now,
    resultSummary: "",
    resultRaw: "",
    statusHistory: [{ status: "ready_to_dispatch", note: "Structured task created from messy intent.", at: now }],
    createdAt: now,
    updatedAt: now,
  };
}

export function updateDevelopmentTaskStatus(
  task: DevelopmentTask,
  status: DevelopmentTaskStatus,
  note = "",
  now = new Date().toISOString(),
): DevelopmentTask {
  return {
    ...task,
    status,
    updatedAt: now,
    statusHistory: [...(task.statusHistory || []), { status, note: note || `Task moved to ${status}.`, at: now }],
  };
}

export function updateDevelopmentTaskResult(task: DevelopmentTask, rawResult: string, now = new Date().toISOString()): DevelopmentTask {
  const resultSummary = summarizeDevelopmentTaskResult(rawResult);
  const review = compareResultToAcceptanceCriteria(rawResult, task.acceptanceCriteria);
  const nextStatus: DevelopmentTaskStatus = "needs_review";

  return {
    ...task,
    status: nextStatus,
    resultRaw: rawResult,
    resultSummary,
    updatedAt: now,
    statusHistory: [
      ...(task.statusHistory || []),
      {
        status: nextStatus,
        note: `Result imported for structured review. ${review.satisfiedCriteria.length}/${task.acceptanceCriteria.length} acceptance checks had possible evidence.`,
        at: now,
      },
    ],
  };
}

export function compareResultToAcceptanceCriteria(rawResult: string, acceptanceCriteria: string[]) {
  const normalized = rawResult.toLowerCase();
  const satisfiedCriteria = acceptanceCriteria.filter((criterion) => {
    const words = criterion.toLowerCase().match(/[a-z0-9]+/g) || [];
    const meaningfulWords = words.filter((word) => word.length > 3).slice(0, 5);
    return meaningfulWords.length > 0 && meaningfulWords.some((word) => normalized.includes(word));
  });

  return {
    satisfiedCriteria,
    missingCriteria: acceptanceCriteria.filter((criterion) => !satisfiedCriteria.includes(criterion)),
  };
}

export function normalizeDevelopmentTask(task: Partial<DevelopmentTask>, project?: Project): DevelopmentTask {
  const now = new Date().toISOString();
  const status = developmentTaskStatuses.includes(task.status as DevelopmentTaskStatus) ? (task.status as DevelopmentTaskStatus) : "draft";
  const dispatchTarget = developmentTaskDispatchTargets.includes(task.dispatchTarget as DevelopmentTaskDispatchTarget)
    ? (task.dispatchTarget as DevelopmentTaskDispatchTarget)
    : "none";

  const normalized = {
    id: task.id || uid("devtask"),
    projectId: task.projectId || project?.id || "",
    title: task.title || "Untitled development task",
    description: task.description || "",
    taskType: developmentTaskTypes.includes(task.taskType as DevelopmentTaskType) ? (task.taskType as DevelopmentTaskType) : "feature",
    status,
    priority: developmentTaskPriorities.includes(task.priority as DevelopmentTaskPriority) ? (task.priority as DevelopmentTaskPriority) : "medium",
    repo: task.repo || project?.repoPathOrUrl || "",
    branch: task.branch || "",
    context: Array.isArray(task.context) ? task.context : [],
    affectedAreas: Array.isArray(task.affectedAreas) ? task.affectedAreas : [],
    acceptanceCriteria: Array.isArray(task.acceptanceCriteria) ? task.acceptanceCriteria : [],
    verificationCommands: Array.isArray(task.verificationCommands) ? task.verificationCommands : project?.verificationCommands || [],
    manualQaSteps: Array.isArray(task.manualQaSteps) ? task.manualQaSteps : [],
    constraints: Array.isArray(task.constraints) ? task.constraints : project?.constraints || [],
    dispatchTarget,
    dispatchMode: developmentTaskDispatchModes.includes(task.dispatchMode as DevelopmentTaskDispatchMode)
      ? (task.dispatchMode as DevelopmentTaskDispatchMode)
      : defaultDispatchMode(dispatchTarget),
    codexGoal: task.codexGoal || "",
    codexGoalUpdatedAt: task.codexGoalUpdatedAt,
    codexRunId: task.codexRunId,
    externalRunUrl: task.externalRunUrl,
    runIssueId: task.runIssueId,
    serviceId: task.serviceId || task.projectId,
    sourceThinkSessionId: task.sourceThinkSessionId,
    sourceProductWindowId: task.sourceProductWindowId,
    sourceSpecId: task.sourceSpecId,
    sourcePlanId: task.sourcePlanId,
    sourceSpecTaskId: task.sourceSpecTaskId,
    agentSource: task.agentSource === "openai" || task.agentSource === "fallback" ? task.agentSource : undefined,
    agentModel: task.agentModel,
    agentError: task.agentError,
    prUrl: task.prUrl,
    resultSummary: task.resultSummary || "",
    resultRaw: task.resultRaw || "",
    statusHistory: Array.isArray(task.statusHistory) && task.statusHistory.length
      ? task.statusHistory
      : [{ status, note: "Task loaded into Brainpress.", at: task.updatedAt || task.createdAt || now }],
    createdAt: task.createdAt || now,
    updatedAt: task.updatedAt || task.createdAt || now,
  };
  return {
    ...normalized,
    codexGoal:
      normalized.codexGoal ||
      (project
        ? generateCodexGoalText({
            project,
            task: normalized,
          })
        : ""),
  };
}

export function defaultDispatchTarget({
  codexCloudConfigured = false,
  preferredAgent = "Codex",
}: {
  codexCloudConfigured?: boolean;
  preferredAgent?: Project["preferredAgent"];
}): DevelopmentTaskDispatchTarget {
  if (codexCloudConfigured) return "codex_cloud";
  if (preferredAgent === "Codex" || preferredAgent === "Both") return "github_issue";
  return "manual";
}

export function defaultDispatchMode(target: DevelopmentTaskDispatchTarget): DevelopmentTaskDispatchMode {
  if (target === "codex_cloud") return "direct";
  if (target === "codex_cli") return "local_bridge";
  if (target === "github_issue") return "github_based";
  return "manual_copy";
}

export function developmentStatusFromCodingAgentStatus(status: string): DevelopmentTaskStatus {
  if (status === "queued") return "dispatched";
  if (status === "running") return "running";
  if (status === "completed") return "completed";
  if (status === "failed") return "failed";
  if (status === "cancelled") return "cancelled";
  return "ready_to_dispatch";
}

export function isBrainpressCoreIntent(input: string) {
  const value = input.toLowerCase();
  return value.includes("brainpress") || (value.includes("upload") && value.includes("pdf") && value.includes("memory"));
}

function inferTaskType(input: string): DevelopmentTaskType {
  const value = input.toLowerCase();
  if (hasAny(value, ["typecheck", "build failed", "build error", "compile", "vercel 404"])) return "build_fix";
  if (hasAny(value, ["bug", "broken", "can't", "cant", "cannot", "failed", "still", "issue"])) return "bug_fix";
  if (hasAny(value, ["test", "coverage", "spec"])) return "test";
  if (hasAny(value, ["review", "audit"])) return "code_review";
  if (hasAny(value, ["docs", "readme", "documentation"])) return "documentation";
  if (hasAny(value, ["refactor", "cleanup", "simplify"])) return "refactor";
  if (hasAny(value, ["qa", "check flow", "manual"])) return "qa";
  return "feature";
}

function inferPriority(input: string, taskType: DevelopmentTaskType): DevelopmentTaskPriority {
  const value = input.toLowerCase();
  if (hasAny(value, ["production", "blocked", "cannot use", "can't use", "cant use"])) return "urgent";
  if (taskType === "bug_fix" || taskType === "build_fix") return "high";
  if (hasAny(value, ["nice to have", "later"])) return "low";
  return "medium";
}

function inferTitle(input: string, taskType: DevelopmentTaskType) {
  if (isMultiPdfMemoryBug(input)) return "Fix multi-PDF memory import persistence";
  const cleaned = input.replace(/\s+/g, " ").trim();
  if (!cleaned) return "Untitled development task";
  const title = cleaned.length > 88 ? `${cleaned.slice(0, 85).trim()}...` : cleaned;
  const prefix = taskType === "bug_fix" ? "Fix" : taskType === "feature" ? "Build" : taskType === "build_fix" ? "Repair" : "Handle";
  return /^[A-Z]/.test(title) ? title : `${prefix} ${title}`;
}

function buildTaskDescription(input: string, affectedAreas: string[]) {
  const areaText = affectedAreas.length ? `\n\nLikely affected areas:\n${affectedAreas.map((area) => `- ${area}`).join("\n")}` : "";
  return `${input.trim() || "No raw intent provided."}${areaText}`;
}

function buildTaskContext(input: string, project: Project, memory?: Memory) {
  return [
    `Raw founder intent: ${input.trim() || "No raw intent provided."}`,
    `Project: ${project.name}`,
    `Primary goal: ${project.primaryGoal}`,
    memory?.productSummary ? `Product memory: ${memory.productSummary}` : "",
    memory?.currentBuildState ? `Current build state: ${memory.currentBuildState}` : "",
  ].filter(Boolean);
}

function inferAffectedAreas(input: string) {
  if (isMultiPdfMemoryBug(input)) {
    return [
      "PDF upload/import flow",
      "source memory persistence",
      "localStorage hydration",
      "consolidated memory rebuild",
    ];
  }

  const value = input.toLowerCase();
  const areas: string[] = [];
  if (hasAny(value, ["pdf", "upload", "source", "memory"])) areas.push("memory import flow");
  if (hasAny(value, ["localstorage", "reload", "persist"])) areas.push("localStorage persistence");
  if (hasAny(value, ["dashboard", "ui", "screen", "button"])) areas.push("workspace UI");
  if (hasAny(value, ["test", "typecheck", "build"])) areas.push("verification");
  if (hasAny(value, ["api", "route", "server"])) areas.push("API routes");
  return areas.length ? areas : ["product workflow"];
}

function inferAcceptanceCriteria(input: string, project: Project, taskType: DevelopmentTaskType) {
  if (isMultiPdfMemoryBug(input)) {
    return [
      "PDF A and PDF B save separately.",
      "Same-name PDFs save separately.",
      "Reload preserves both saved PDF sources.",
      "Consolidated memory count matches saved source count.",
      "npm run typecheck passes.",
      "npm run build passes.",
    ];
  }

  const lines = fieldLines(input).filter((line) => /should|must|acceptance|passes|works|shows|saves|preserves/i.test(line));
  if (lines.length) return lines.slice(0, 8);
  const base = taskType === "bug_fix" ? "The reported issue is fixed in the product flow." : "The requested behavior is implemented.";
  return [
    base,
    "The change is visible or verifiable in the relevant workspace.",
    ...project.verificationCommands.slice(0, 3).map((command) => `${command} passes.`),
  ];
}

function inferVerificationCommands(input: string, project: Project) {
  const value = input.toLowerCase();
  const commands = project.verificationCommands.length ? project.verificationCommands : ["npm run typecheck", "npm run build"];
  if (hasAny(value, ["test", "coverage"])) return [...new Set([...commands, "npm test"])];
  return commands;
}

function inferManualQaSteps(input: string, taskType: DevelopmentTaskType) {
  if (isMultiPdfMemoryBug(input)) {
    return [
      "Open Brainpress locally.",
      "Upload PDF A to Memory and save it.",
      "Upload PDF B to Memory and save it.",
      "Reload the app and confirm both sources remain visible.",
    ];
  }
  if (taskType === "qa") return fieldLines(input).slice(0, 6);
  return ["Open the affected screen and confirm the founder-facing flow works end to end."];
}

function inferConstraints(project: Project) {
  return [
    ...project.constraints,
    "Do not auto-commit, push, deploy, or merge.",
    "User approval is required before merge or deploy.",
  ];
}

function summarizeDevelopmentTaskResult(rawResult: string) {
  const lines = fieldLines(rawResult).filter(Boolean);
  if (!lines.length) return "";
  const verification = lines.filter((line) => /typecheck|test|build|passed|failed|error/i.test(line)).slice(0, 4);
  const changes = lines.filter((line) => /changed|fixed|added|updated|implemented|files?/i.test(line)).slice(0, 4);
  return [...changes, ...verification].slice(0, 6).join("\n") || lines.slice(0, 4).join("\n");
}

function inferResultStatus(rawResult: string, missingCriteria: string[]): DevelopmentTaskStatus {
  const value = rawResult.toLowerCase();
  if (hasAny(value, ["failed", "failing", "error", "blocked", "could not"])) return "failed";
  if (!missingCriteria.length && hasAny(value, ["passed", "verified", "complete", "completed"])) return "verified";
  if (hasAny(value, ["implemented", "fixed", "completed", "changed"])) return "needs_review";
  return "needs_review";
}

function isMultiPdfMemoryBug(input: string) {
  const value = input.toLowerCase();
  return value.includes("upload") && value.includes("pdf") && value.includes("memory");
}

function hasAny(value: string, terms: string[]) {
  return terms.some((term) => value.includes(term));
}
