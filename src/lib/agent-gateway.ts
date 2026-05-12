import { createDevelopmentTaskFromIntent, defaultDispatchTarget, developmentTaskTypes, developmentTaskPriorities, developmentTaskDispatchTargets } from "@/lib/development-tasks";
import { createRunIssue } from "@/lib/run-agents";
import { createThinkSession, thinkArtifactTypes, thinkModes } from "@/lib/think-sessions";
import type {
  BrainpressAgentSource,
  DevelopmentTaskDispatchTarget,
  DevelopmentTaskPriority,
  DevelopmentTaskType,
  Project,
  RecommendedBuildTask,
  RunIssue,
  RunIssueProvider,
  RunIssueType,
  ThinkArtifactType,
  ThinkMode,
} from "@/lib/types";

export type BrainpressAgentSurface = "think" | "build" | "run";

export interface BrainpressAgentRequest {
  surface: BrainpressAgentSurface;
  input: string;
  project: Project;
  mode?: string;
  artifactType?: string;
  taskContext?: Record<string, unknown>;
  runContext?: Record<string, unknown>;
}

export interface ThinkAgentResult {
  summary: string;
  productDirection: string;
  userProblem: string;
  targetUser: string;
  proposedSolution: string;
  mvpScope: string[];
  featureIdeas: string[];
  decisions: string[];
  risks: string[];
  openQuestions: string[];
  recommendedBuildTasks: RecommendedBuildTask[];
  productWindowSuggestion?: {
    title: string;
    route: string;
    primaryCTA: string;
    sections: string[];
  };
}

export interface BuildAgentResult {
  title: string;
  taskType: DevelopmentTaskType;
  priority: DevelopmentTaskPriority;
  context: string[];
  affectedAreas: string[];
  acceptanceCriteria: string[];
  verificationCommands: string[];
  manualQaSteps: string[];
  constraints: string[];
  recommendedDispatchTarget: DevelopmentTaskDispatchTarget;
}

export interface RunAgentResult {
  type: RunIssueType;
  title: string;
  summary: string;
  provider?: RunIssueProvider;
  likelyCauses: string[];
  recommendedSteps: string[];
  verificationSteps: string[];
  requiredAccess: string[];
  risks: string[];
  recommendedBuildTasks: string[];
}

export type BrainpressAgentResult = ThinkAgentResult | BuildAgentResult | RunAgentResult;

export interface BrainpressAgentResponse {
  ok: true;
  source: BrainpressAgentSource;
  surface: BrainpressAgentSurface;
  result: BrainpressAgentResult;
  model?: string;
  error?: string;
}

export const defaultBrainpressOpenAIModel = "gpt-4o-mini";
export const maxAgentInputCharacters = 20_000;

export async function callBrainpressAgent(
  request: BrainpressAgentRequest,
  options: { fetcher?: typeof fetch } = {},
): Promise<BrainpressAgentResponse> {
  const fetcher = options.fetcher || fetch;
  try {
    const response = await fetcher("/api/brainpress/agent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    const payload = await response.json().catch(() => null);
    const normalized = normalizeAgentResponse(request.surface, payload);
    if (response.ok && normalized) return normalized;
    return fallbackToDeterministicEngine(request, "Agent gateway returned an invalid response.");
  } catch (error) {
    return fallbackToDeterministicEngine(
      request,
      `Agent gateway unavailable. ${error instanceof Error ? error.message : ""}`.trim(),
    );
  }
}

export function shouldUseOpenAI(env: Partial<Record<string, string | undefined>> = {}) {
  return Boolean(env.OPENAI_API_KEY?.trim());
}

export function fallbackToDeterministicEngine(
  request: BrainpressAgentRequest,
  error = "OpenAI unavailable. Local fallback used.",
): BrainpressAgentResponse {
  if (request.surface === "think") {
    const session = createThinkSession({
      input: request.input,
      mode: normalizeThinkMode(request.mode),
      artifactType: normalizeThinkArtifactType(request.artifactType),
      project: request.project,
    });
    return {
      ok: true,
      source: "fallback",
      surface: "think",
      result: {
        summary: session.summary,
        productDirection: session.productDirection,
        userProblem: session.userProblem,
        targetUser: session.targetUser,
        proposedSolution: session.proposedSolution,
        mvpScope: session.mvpScope,
        featureIdeas: session.featureIdeas,
        decisions: session.decisions,
        risks: session.risks,
        openQuestions: session.openQuestions,
        recommendedBuildTasks: session.recommendedBuildTasks,
      },
      error,
    };
  }

  if (request.surface === "build") {
    const task = createDevelopmentTaskFromIntent({
      input: request.input,
      project: request.project,
    });
    return {
      ok: true,
      source: "fallback",
      surface: "build",
      result: {
        title: task.title,
        taskType: task.taskType,
        priority: task.priority,
        context: task.context,
        affectedAreas: task.affectedAreas,
        acceptanceCriteria: task.acceptanceCriteria,
        verificationCommands: task.verificationCommands,
        manualQaSteps: task.manualQaSteps,
        constraints: task.constraints,
        recommendedDispatchTarget: task.dispatchTarget,
      },
      error,
    };
  }

  const issue = createRunIssue({
    projectId: request.project.id,
    input: request.input,
  });
  return {
    ok: true,
    source: "fallback",
    surface: "run",
    result: {
      type: issue.type,
      title: issue.title,
      summary: issue.summary,
      provider: issue.provider,
      likelyCauses: issue.likelyCauses,
      recommendedSteps: issue.recommendedSteps,
      verificationSteps: issue.verificationSteps,
      requiredAccess: issue.requiredAccess,
      risks: issue.risks,
      recommendedBuildTasks: issue.recommendedBuildTasks,
    },
    error,
  };
}

export function normalizeAgentResponse(surface: BrainpressAgentSurface, value: unknown): BrainpressAgentResponse | null {
  if (!isRecord(value) || value.ok !== true || (value.source !== "openai" && value.source !== "fallback") || value.surface !== surface) {
    return null;
  }
  const result = normalizeAgentResult(surface, value.result);
  if (!result) return null;
  return {
    ok: true,
    source: value.source,
    surface,
    result,
    model: cleanText(value.model),
    error: cleanText(value.error),
  };
}

function normalizeAgentResult(surface: BrainpressAgentSurface, value: unknown): BrainpressAgentResult | null {
  if (!isRecord(value)) return null;
  if (surface === "think") return normalizeThinkResult(value);
  if (surface === "build") return normalizeBuildResult(value);
  return normalizeRunResult(value);
}

function normalizeThinkResult(value: Record<string, unknown>): ThinkAgentResult | null {
  const recommendedBuildTasks = Array.isArray(value.recommendedBuildTasks)
    ? value.recommendedBuildTasks.map(normalizeRecommendedBuildTask).filter((item): item is RecommendedBuildTask => Boolean(item)).slice(0, 4)
    : [];
  const productWindowSuggestion = isRecord(value.productWindowSuggestion)
    ? {
        title: cleanText(value.productWindowSuggestion.title),
        route: cleanText(value.productWindowSuggestion.route),
        primaryCTA: cleanText(value.productWindowSuggestion.primaryCTA),
        sections: cleanStringArray(value.productWindowSuggestion.sections, 8),
      }
    : undefined;
  const result: ThinkAgentResult = {
    summary: cleanText(value.summary),
    productDirection: cleanText(value.productDirection),
    userProblem: cleanText(value.userProblem),
    targetUser: cleanText(value.targetUser),
    proposedSolution: cleanText(value.proposedSolution),
    mvpScope: cleanStringArray(value.mvpScope, 8),
    featureIdeas: cleanStringArray(value.featureIdeas, 8),
    decisions: cleanStringArray(value.decisions, 8),
    risks: cleanStringArray(value.risks, 8),
    openQuestions: cleanStringArray(value.openQuestions, 8),
    recommendedBuildTasks,
    productWindowSuggestion,
  };
  if (!result.summary || !result.productDirection || !result.proposedSolution) return null;
  return result;
}

function normalizeBuildResult(value: Record<string, unknown>): BuildAgentResult | null {
  const taskType = developmentTaskTypes.includes(value.taskType as DevelopmentTaskType) ? (value.taskType as DevelopmentTaskType) : "feature";
  const priority = developmentTaskPriorities.includes(value.priority as DevelopmentTaskPriority) ? (value.priority as DevelopmentTaskPriority) : "medium";
  const recommendedDispatchTarget = developmentTaskDispatchTargets.includes(value.recommendedDispatchTarget as DevelopmentTaskDispatchTarget)
    ? (value.recommendedDispatchTarget as DevelopmentTaskDispatchTarget)
    : "github_issue";
  const result: BuildAgentResult = {
    title: cleanText(value.title),
    taskType,
    priority,
    context: cleanStringArray(value.context, 10),
    affectedAreas: cleanStringArray(value.affectedAreas, 8),
    acceptanceCriteria: cleanStringArray(value.acceptanceCriteria, 10),
    verificationCommands: cleanStringArray(value.verificationCommands, 6),
    manualQaSteps: cleanStringArray(value.manualQaSteps, 8),
    constraints: cleanStringArray(value.constraints, 10),
    recommendedDispatchTarget,
  };
  if (!result.title || !result.acceptanceCriteria.length) return null;
  return result;
}

function normalizeRunResult(value: Record<string, unknown>): RunAgentResult | null {
  const type = isRunIssueType(value.type) ? value.type : "infrastructure";
  const provider = isRunIssueProvider(value.provider) ? value.provider : undefined;
  const result: RunAgentResult = {
    type,
    title: cleanText(value.title),
    summary: cleanText(value.summary),
    provider,
    likelyCauses: cleanStringArray(value.likelyCauses, 8),
    recommendedSteps: cleanStringArray(value.recommendedSteps, 10),
    verificationSteps: cleanStringArray(value.verificationSteps, 10),
    requiredAccess: cleanStringArray(value.requiredAccess, 8),
    risks: cleanStringArray(value.risks, 8),
    recommendedBuildTasks: cleanStringArray(value.recommendedBuildTasks, 6),
  };
  if (!result.title || !result.summary || !result.recommendedSteps.length) return null;
  return result;
}

function normalizeRecommendedBuildTask(value: unknown): RecommendedBuildTask | null {
  if (!isRecord(value)) return null;
  const title = cleanText(value.title);
  if (!title) return null;
  return {
    title,
    taskType: developmentTaskTypes.includes(value.taskType as DevelopmentTaskType) ? (value.taskType as DevelopmentTaskType) : "feature",
    priority: developmentTaskPriorities.includes(value.priority as DevelopmentTaskPriority) ? (value.priority as DevelopmentTaskPriority) : "medium",
    reason: cleanText(value.reason) || "Recommended by Brainpress.",
    acceptanceCriteria: cleanStringArray(value.acceptanceCriteria, 8),
  };
}

function normalizeThinkMode(value: unknown): ThinkMode {
  return thinkModes.includes(value as ThinkMode) ? (value as ThinkMode) : "open_thinking";
}

function normalizeThinkArtifactType(value: unknown): ThinkArtifactType {
  return thinkArtifactTypes.includes(value as ThinkArtifactType) ? (value as ThinkArtifactType) : "product_brief";
}

function cleanStringArray(value: unknown, limit: number) {
  if (!Array.isArray(value)) return [];
  return unique(value.map(cleanText).filter(Boolean)).slice(0, limit);
}

function cleanText(value: unknown) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function unique(items: string[]) {
  return Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isRunIssueType(value: unknown): value is RunIssueType {
  return value === "infrastructure" || value === "deployment" || value === "supabase" || value === "vercel" || value === "qa" || value === "release" || value === "feedback" || value === "bug";
}

function isRunIssueProvider(value: unknown): value is RunIssueProvider {
  return value === "supabase" || value === "vercel" || value === "github" || value === "domain" || value === "custom";
}
