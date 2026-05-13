import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  canAbsorbAgentRun,
  createAgentRun,
  createVerificationRepairOutcome,
  generateHandoffPackage,
} from "../src/lib/agent-runs";
import { CodexAdapter, defaultLocalCodexBridgeUrl, LocalCodexBridgeAdapter } from "../src/lib/coding-agent-adapter";
import { generateCodexGoalObjective } from "../src/lib/codex-goal";
import {
  callBrainpressAgent,
  normalizeAgentResponse,
  shouldUseOpenAI,
} from "../src/lib/agent-gateway";
import {
  LocalStorageBrainpressStore,
  loadStateFromStore,
  selectBrainpressStore,
  SupabaseBrainpressStore,
} from "../src/lib/brainpress-store";
import { runBrainpressAgent } from "../src/lib/server/agent-gateway";
import {
  compareResultToAcceptanceCriteria,
  createDevelopmentTaskFromIntent,
  defaultDispatchMode,
  defaultDispatchTarget,
  developmentStatusFromCodingAgentStatus,
  normalizeDevelopmentTask,
  updateDevelopmentTaskResult,
  updateDevelopmentTaskStatus,
} from "../src/lib/development-tasks";
import {
  applyRecommendedDevelopmentTaskStatus,
  parseDevelopmentTaskResult,
} from "../src/lib/development-task-results";
import { createDevelopmentTaskFromRunIssue, createRunIssue } from "../src/lib/run-agents";
import {
  createDevelopmentTaskFromThinkRecommendation,
  createThinkSession,
  normalizeThinkSession,
} from "../src/lib/think-sessions";
import {
  generateThinkingArtifacts,
  normalizeThinkingArtifact,
} from "../src/lib/think-canvases";
import {
  createDevelopmentTaskFromProductWindow,
  createProductWindowFromThinkSession,
  inferProductWindowPreviewType,
} from "../src/lib/product-window";
import {
  createClarifyingQuestions,
  createConstitution,
  createDevelopmentTasksFromSpecTasks,
  createPlanFromSpec,
  createSpecFromThinkSession,
  createTaskListFromPlan,
  normalizeSpec,
} from "../src/lib/spec-loop";
import {
  createDefaultServiceAgents,
  createEmptyServiceWindow,
  createProjectFromServiceInput,
  createServiceFromInput,
  createServiceFromProject,
  createServiceWindowCodexPrompt,
  generateServiceBlueprint,
  generateServiceWindow,
  normalizeService,
  normalizeServiceAgent,
  normalizeServiceWindow,
} from "../src/lib/services";
import {
  applyGithubDispatchResult,
  createGithubIssueBody,
  createGithubIssueTitle,
  prepareGithubDispatch,
} from "../src/lib/github-dispatch";
import {
  analyzeMemoryInput,
  analyzeProjectHistory,
  appendProjectImport,
  buildConsolidatedProjectMemory,
  createProjectImport,
  dashboardHasContent,
  dedupe,
  generateAgentPrompt,
  getMemoryTabMode,
  getVisibleMemoryCards,
  hasUsableProjectMemory,
  ingestAgentResult,
  memoryFromConsolidatedProjectMemory,
  mergeMemoryWithProjectHistory,
  pdfTextExtractionFailureMessage,
  savePendingImportToProjectMemory,
  savePendingImportSourceOnly,
  savedSourcesLabel,
  updateProjectImport,
} from "../src/lib/brainpress";
import {
  analyzeProjectHistoryWithOptionalOpenAI,
  maxOpenAIInputCharacters,
  rebuildProjectMemoryWithOptionalOpenAI,
  requestOpenAIMemoryAnalysis,
} from "../src/lib/ai/openai-memory-analyzer";
import {
  approvalRequired,
  codexTimeoutFailure,
  codexUnavailableResult,
  getRunPromptPath,
  isRunAlreadyRunning,
  promptContainsPermissionSafetyRules,
  validateLocalProjectPath,
  validateCodexStreamRequest,
  validatePromptPath,
} from "../src/lib/codex-bridge";
import {
  buildExecutionReadiness,
  canAbsorbWithConfirmation,
  isProtectedBranch,
  readinessAllowsRun,
  requiresVerificationSkippedReason,
} from "../src/lib/execution-readiness";
import { createBlankProject } from "../src/lib/projects";
import {
  createRunEvent,
  nextTaskForInterruptedRun,
  parseRunEvents,
  serializeRunEvent,
  statusFromCodexStreamResult,
} from "../src/lib/run-events";
import { defaultPermissionSafetyRules } from "../src/lib/safety";
import { cancelActiveCodexRun, emptyRunLogs, getRunLogPaths, validateRunLogPath } from "../src/lib/server-run-logs";
import { brainpressCoreMemory, brainpressCoreProject, initialState, seedMemory, seedOutcome, seedProject } from "../src/lib/seed";
import { loadBrainpressState } from "../src/lib/storage";
import { validateVerificationCommands } from "../src/lib/verification";

function sourceBetween(source: string, startMarker: string, endMarker: string) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(start, -1, `Missing source marker: ${startMarker}`);
  assert.notEqual(end, -1, `Missing source marker: ${endMarker}`);
  return source.slice(start, end);
}

async function withMockLocalStorage<T>(callback: () => T | Promise<T>): Promise<T> {
  const globals = globalThis as unknown as { window?: unknown };
  const previousWindow = globals.window;
  const storage = new Map<string, string>();
  globals.window = {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
      removeItem: (key: string) => {
        storage.delete(key);
      },
      clear: () => storage.clear(),
      key: (index: number) => Array.from(storage.keys())[index] ?? null,
      get length() {
        return storage.size;
      },
    },
  };

  try {
    return await callback();
  } finally {
    if (previousWindow === undefined) {
      delete globals.window;
    } else {
      globals.window = previousWindow;
    }
  }
}

test("heuristic parser organizes decisions, completed work, issues, and roadmap", () => {
  const result = analyzeMemoryInput(
    [
      "Decision: PC usage must remain the primary metric.",
      "Implemented the last 7 days usage chart.",
      "Bug: empty state is missing for the trend panel.",
      "Next add top users leaderboard.",
    ].join("\n"),
    "Agent result",
    seedProject,
    seedMemory,
  );

  assert.match(result.memory.activeDecisions, /PC usage must remain/i);
  assert.match(result.memory.completedWork, /last 7 days usage chart/i);
  assert.match(result.memory.knownIssues, /empty state is missing/i);
  assert.match(result.memory.roadmap, /top users leaderboard/i);
});

test("agent prompt includes required handoff sections", () => {
  const prompt = generateAgentPrompt(seedProject, seedMemory, seedOutcome, "Codex");

  assert.match(prompt, /# Outcome: Improve GensecAI PC Center Dashboard/);
  assert.match(prompt, /## Project Context/);
  assert.match(prompt, /## Acceptance Criteria/);
  assert.match(prompt, /## Permission Safety Rules/);
  assert.match(prompt, /npm run typecheck/);
  assert.match(prompt, /After Completion/);
});

test("generated outcome prompt includes the default Permission Safety Rules", () => {
  const prompt = generateAgentPrompt(seedProject, seedMemory, seedOutcome, "Claude Code");

  assert.match(prompt, /## Permission Safety Rules/);
  assert.match(prompt, /Work only inside the selected project folder\./);
  assert.match(prompt, /stop and explain the risk instead of asking the founder to approve blindly\./);
});

test("agent result ingestion extracts files and verification state", () => {
  const log = ingestAgentResult(
    seedProject.id,
    seedOutcome.id,
    "Implemented dashboard polish in app/page.tsx and app/globals.css. npm run build passed. Next add proactive offer cards.",
  );

  assert.equal(log.verificationStatus, "Passing");
  assert.deepEqual(log.filesChanged, ["app/page.tsx", "app/globals.css"]);
  assert.match(log.nextOutcomes.join("\n"), /proactive offer cards/i);
});

test("agent run creation snapshots prompt, memory, outcome, and verification commands", () => {
  const run = createAgentRun({
    project: seedProject,
    memory: seedMemory,
    outcome: seedOutcome,
    targetAgent: "Codex",
  });

  assert.equal(run.projectId, seedProject.id);
  assert.equal(run.outcomeId, seedOutcome.id);
  assert.equal(run.targetAgent, "Codex");
  assert.equal(run.status, "Prepared");
  assert.match(run.handoffDirectory || "", /^\.brainpress\/runs\/run_/);
  assert.match(run.promptSnapshot, /# Outcome: Improve GensecAI PC Center Dashboard/);
  assert.deepEqual(run.verificationCommands, ["npm run typecheck", "npm test", "npm run build"]);
});

test("handoff package generation exports prompt, context, verification, and command previews", () => {
  const run = createAgentRun({
    project: seedProject,
    memory: seedMemory,
    outcome: seedOutcome,
    targetAgent: "Claude Code",
  });
  const handoff = generateHandoffPackage(run, seedProject);

  assert.match(handoff.promptMarkdown, /Brainpress Handoff Package/);
  assert.match(handoff.contextJson, /"project"/);
  assert.match(handoff.verificationJson, /"commands"/);
  assert.match(handoff.codexCommandPreview, /codex exec --sandbox workspace-write/);
  assert.match(handoff.claudeCommandPreview, /claude --permission-mode plan/);
});

test("handoff package includes Permission Safety Rules", () => {
  const run = createAgentRun({
    project: seedProject,
    memory: seedMemory,
    outcome: seedOutcome,
    targetAgent: "Codex",
  });
  const handoff = generateHandoffPackage(run, seedProject);

  assert.match(handoff.promptMarkdown, /## Permission Safety Rules/);
  assert.match(handoff.fullHandoff, /Do not run destructive commands/);
});

test("exported context includes safetyRules", () => {
  const run = createAgentRun({
    project: seedProject,
    memory: seedMemory,
    outcome: seedOutcome,
    targetAgent: "Generic",
  });
  const handoff = generateHandoffPackage(run, seedProject);
  const context = JSON.parse(handoff.contextJson) as { safetyRules: string; project: { safetyRules: string } };

  assert.equal(context.safetyRules, defaultPermissionSafetyRules);
  assert.equal(context.project.safetyRules, defaultPermissionSafetyRules);
});

test("new projects default safetyRules correctly", () => {
  const project = createBlankProject("2026-05-11T00:00:00.000Z");

  assert.equal(project.safetyRules, defaultPermissionSafetyRules);
});

test("Brainpress Core project is available for internal development tasks", () => {
  assert.equal(brainpressCoreProject.name, "Brainpress Core");
  assert.equal(initialState.projects.some((project) => project.id === brainpressCoreProject.id), true);
  assert.match(brainpressCoreMemory.productSummary, /development task orchestrator/i);
});

test("Brainpress Service wraps a legacy project with service-first fields", () => {
  const service = createServiceFromProject(brainpressCoreProject, "2026-05-13T00:00:00.000Z");

  assert.equal(service.id, brainpressCoreProject.id);
  assert.equal(service.name, "Brainpress Agent Service");
  assert.match(service.servicePromise, /founder intent|Codex/i);
  assert.match(service.targetCustomer, /founder|builder/i);
  assert.match(service.desiredOutcome, /founder intent|Codex/i);
  assert.equal(service.currentStage, "build_ready");
  assert.equal(service.agentIds.includes(service.mainAgentId || ""), true);
  assert.ok(service.serviceWorkflow.length > 0);
  assert.ok(service.humanApprovalPoints.length > 0);
  assert.ok(service.successMetrics.length > 0);
});

test("Create Service flow prepares compatibility project, service, and agent team", () => {
  const project = createProjectFromServiceInput({
    serviceName: "Dental Lead Generation Service",
    targetCustomer: "Dental clinics",
    outcome: "Find and qualify new patient leads with agent follow-up.",
    now: "2026-05-13T00:00:00.000Z",
  });
  const service = createServiceFromInput({
    project,
    serviceName: "Dental Lead Generation Service",
    targetCustomer: "Dental clinics",
    outcome: "Find and qualify new patient leads with agent follow-up.",
    now: "2026-05-13T00:00:00.000Z",
  });
  const agents = createDefaultServiceAgents(service, "2026-05-13T00:00:00.000Z");

  assert.equal(project.id, service.id);
  assert.equal(project.name, "Dental Lead Generation Service");
  assert.equal(service.servicePromise, "Find and qualify new patient leads with agent follow-up.");
  assert.equal(service.targetCustomer, "Dental clinics");
  assert.equal(agents.length >= 2, true);
  assert.equal(agents[0].serviceId, service.id);
  assert.equal(agents[0].permissionLevel, "founder_approval_required");
  assert.equal(agents[0].status, "active");
  assert.equal(agents.slice(1).every((agent) => agent.status === "proposed"), true);
});

test("Service Blueprint generation refines service promise, agent team, workflow, and open questions", () => {
  const baseService = createServiceFromProject(brainpressCoreProject, "2026-05-13T00:00:00.000Z");
  const session = createThinkSession({
    input: "Create a service that helps founders approve Codex work safely before it touches production.",
    mode: "clarify_idea",
    artifactType: "product_brief",
    project: brainpressCoreProject,
    now: "2026-05-13T00:01:00.000Z",
  });
  const spec = createSpecFromThinkSession({
    session,
    project: brainpressCoreProject,
    now: "2026-05-13T00:02:00.000Z",
  });
  const blueprint = generateServiceBlueprint({
    service: { ...baseService, mainAgentId: "", agentIds: [], serviceWorkflow: [], humanApprovalPoints: [], successMetrics: [] },
    agents: [],
    spec,
    memory: brainpressCoreMemory,
    now: "2026-05-13T00:03:00.000Z",
  });

  assert.match(blueprint.service.servicePromise, /service that helps founders approve Codex work safely/i);
  assert.ok(blueprint.service.mainAgentId.length > 0);
  assert.ok(blueprint.service.agentIds.length >= 3);
  assert.ok(blueprint.service.serviceWorkflow.some((item) => /Codex/i.test(item)));
  assert.ok(blueprint.service.humanApprovalPoints.some((item) => /Codex dispatch/i.test(item)));
  assert.ok(blueprint.service.successMetrics.length > 0);
  assert.ok(blueprint.service.openQuestions.length > 0);
  assert.equal(blueprint.agents[0].permissionLevel, "founder_approval_required");
  assert.ok(blueprint.agents.some((agent) => /Codex Build Agent/i.test(agent.name)));
  assert.ok(blueprint.agents.some((agent) => /QA & Verification Agent/i.test(agent.name)));
});

test("Design Agent starts empty, generates premium ServiceWindow UI/UX, and exports a Codex prompt", () => {
  const service = createServiceFromProject(brainpressCoreProject, "2026-05-13T00:00:00.000Z");
  const emptyWindow = createEmptyServiceWindow(service.id, "2026-05-13T00:00:00.000Z");
  const agents = createDefaultServiceAgents(service, "2026-05-13T00:00:00.000Z");
  const session = createThinkSession({
    input: "Design an agent-native service where founders approve Codex build work.",
    mode: "clarify_idea",
    artifactType: "product_brief",
    project: brainpressCoreProject,
    now: "2026-05-13T00:01:00.000Z",
  });
  const spec = createSpecFromThinkSession({
    session,
    project: brainpressCoreProject,
    now: "2026-05-13T00:02:00.000Z",
  });
  const plan = createPlanFromSpec({
    spec,
    project: brainpressCoreProject,
    now: "2026-05-13T00:03:00.000Z",
  });
  const blueprint = generateServiceBlueprint({ service, agents, spec, memory: brainpressCoreMemory });
  const generatedWindow = generateServiceWindow({
    service: blueprint.service,
    agents: blueprint.agents,
    spec,
    plan,
    now: "2026-05-13T00:04:00.000Z",
  });
  const taskList = createTaskListFromPlan(plan, "2026-05-13T00:04:30.000Z");
  const developmentTasks = createDevelopmentTasksFromSpecTasks({
    taskList,
    project: brainpressCoreProject,
    memory: brainpressCoreMemory,
    spec,
    plan,
    now: "2026-05-13T00:04:45.000Z",
  });
  const prompt = createServiceWindowCodexPrompt({
    service: blueprint.service,
    agents: blueprint.agents,
    serviceWindow: generatedWindow,
    spec,
    plan,
    taskLists: [taskList],
    developmentTasks,
    memory: brainpressCoreMemory,
  });

  assert.equal(emptyWindow.status, "empty");
  assert.equal(emptyWindow.screens.length, 0);
  assert.equal(generatedWindow.status, "design_generated");
  assert.equal(generatedWindow.serviceId, service.id);
  assert.ok(generatedWindow.screens.length >= 3);
  assert.equal(generatedWindow.designAgentName, "Brainpress Design Agent");
  assert.ok(generatedWindow.designBrief?.length);
  assert.ok(generatedWindow.uxStrategy?.trustConcern.length);
  assert.ok(generatedWindow.informationArchitecture?.mainNavigation.length);
  assert.ok(generatedWindow.visualSystem?.productFeel.length);
  assert.ok((generatedWindow.componentSystem || []).some((component) => component.name === "AgentStatusCard"));
  assert.ok(generatedWindow.interactionStates?.some((state) => /Needs approval/i.test(state)));
  assert.ok(generatedWindow.codexImplementationPrompt?.includes("Design Agent Output"));
  assert.match(generatedWindow.primaryFlow.join("\n"), /Founder/i);
  assert.match(generatedWindow.agentInteractionPoints.join("\n"), /agent/i);
  assert.match(generatedWindow.humanApprovalPoints.join("\n"), /Codex dispatch|merge|deploy/i);
  assert.match(prompt, /Codex Build Prompt/);
  assert.match(prompt, /Service Promise/);
  assert.match(prompt, /Agent Team/);
  assert.match(prompt, /Design Agent Output/);
  assert.match(prompt, /UX Strategy/);
  assert.match(prompt, /Component System/);
  assert.match(prompt, /Visual System/);
  assert.match(prompt, /Ordered Spec Tasks/);
  assert.match(prompt, /Existing DevelopmentTasks/);
  assert.match(prompt, /Preserve existing PDF upload/);
});

test("Design Agent creates procurement-specific ServiceWindow output", () => {
  const project = createProjectFromServiceInput({
    serviceName: "Construction Procurement Service",
    targetCustomer: "Local construction company operators",
    outcome: "Compare vendor quotes and recommend safe purchases with budget and delivery risk evidence.",
    now: "2026-05-13T00:00:00.000Z",
  });
  const service = createServiceFromInput({
    project,
    serviceName: "Construction Procurement Service",
    targetCustomer: "Local construction company operators",
    outcome: "Compare vendor quotes and recommend safe purchases with budget and delivery risk evidence.",
    now: "2026-05-13T00:00:00.000Z",
  });
  const agents = createDefaultServiceAgents(service, "2026-05-13T00:00:00.000Z");
  const window = generateServiceWindow({
    service,
    agents,
    now: "2026-05-13T00:01:00.000Z",
  });
  const prompt = createServiceWindowCodexPrompt({ service, agents, serviceWindow: window });

  assert.match(window.informationArchitecture?.mainNavigation.join("\n") || "", /Quotes|Vendors|Approvals/i);
  assert.match(window.screens.map((screen) => screen.name).join("\n"), /Procurement Intake|Vendor \/ Quote Comparison|Purchase Recommendation/i);
  assert.match(window.screens.flatMap((screen) => screen.keyComponents).join("\n"), /Quote comparison table|Budget|Vendor/i);
  assert.ok(window.componentSystem?.some((component) => component.name === "QuoteComparisonTable"));
  assert.match(window.visualSystem?.tableListStyle || "", /vendor|quote|budget/i);
  assert.match(prompt, /Procurement Intake/);
  assert.match(prompt, /QuoteComparisonTable/);
});

test("Agent Development Agent creates only clarifying canvas for vague ideas", () => {
  const service = {
    ...createServiceFromInput({
      project: brainpressCoreProject,
      serviceName: "New Service",
      targetCustomer: "",
      outcome: "",
      now: "2026-05-13T00:00:00.000Z",
    }),
    servicePromise: "",
    targetCustomer: "",
    desiredOutcome: "",
    serviceWorkflow: [],
    humanApprovalPoints: [],
    successMetrics: [],
    openQuestions: [],
  };
  const artifacts = generateThinkingArtifacts({
    service,
    input: "help",
    existingArtifacts: [],
    now: "2026-05-13T00:01:00.000Z",
  });

  assert.equal(artifacts.length, 1);
  assert.equal(artifacts[0].type, "clarifying_questions");
  assert.match(artifacts[0].title, /Clarifying Questions/);
});

test("initial Think state has no pre-populated dynamic canvas cards", async () => {
  await withMockLocalStorage(async () => {
    const state = loadBrainpressState();
    const initialArtifacts = (state.thinkingArtifacts || []).filter((artifact) => artifact.serviceId === brainpressCoreProject.id);

    assert.equal(initialArtifacts.length, 0);
  });
});

test("Agent Development Agent creates procurement-specific dynamic canvases", () => {
  const project = createProjectFromServiceInput({
    serviceName: "Construction Procurement Service",
    targetCustomer: "Local construction company operators",
    outcome: "Compare vendor quotes and recommend safe purchases.",
    now: "2026-05-13T00:00:00.000Z",
  });
  const service = createServiceFromInput({
    project,
    serviceName: "Construction Procurement Service",
    targetCustomer: "Local construction company operators",
    outcome: "Compare vendor quotes and recommend safe purchases.",
    now: "2026-05-13T00:00:00.000Z",
  });
  const agents = createDefaultServiceAgents(service, "2026-05-13T00:00:00.000Z");
  const artifacts = generateThinkingArtifacts({
    service,
    agents,
    input: "Build a procurement agent for a construction company that compares vendor quotes and needs approval policy.",
    existingArtifacts: [],
    now: "2026-05-13T00:02:00.000Z",
  });
  const titles = artifacts.map((artifact) => artifact.title).join("\n");
  const types = artifacts.map((artifact) => artifact.type);

  assert.match(titles, /Vendor Workflow/);
  assert.match(titles, /Quote Comparison Features/);
  assert.match(titles, /Procurement Approval Policy/);
  assert.match(titles, /Procurement Risk Map/);
  assert.match(titles, /Build Roadmap/);
  assert.ok(types.includes("agent_team"));
});

test("dynamic Think canvases update instead of duplicating and persist through normalization", async () => {
  await withMockLocalStorage(async () => {
    const service = createServiceFromInput({
      project: brainpressCoreProject,
      serviceName: "Brainpress Test Service",
      targetCustomer: "Founder-builders",
      outcome: "Turn messy ideas into agent-ready build work.",
      now: "2026-05-13T00:00:00.000Z",
    });
    const first = generateThinkingArtifacts({
      service,
      input: "Create feature map and roadmap for an agent task service.",
      existingArtifacts: [],
      now: "2026-05-13T00:03:00.000Z",
    });
    const second = generateThinkingArtifacts({
      service,
      input: "Refine feature map and roadmap with UI/UX brief.",
      existingArtifacts: first,
      now: "2026-05-13T00:04:00.000Z",
    });
    const featureMaps = second.filter((artifact) => artifact.type === "feature_map");
    const normalized = normalizeThinkingArtifact({ ...second[0], confidence: 2 });

    assert.equal(featureMaps.length, 1);
    assert.equal(normalized.confidence, 1);
    assert.ok(second.some((artifact) => artifact.type === "ui_ux_brief"));
  });
});

test("Codex UI build prompt includes relevant dynamic Think canvases", () => {
  const service = createServiceFromProject(brainpressCoreProject, "2026-05-13T00:00:00.000Z");
  const agents = createDefaultServiceAgents(service, "2026-05-13T00:00:00.000Z");
  const window = generateServiceWindow({ service, agents, now: "2026-05-13T00:01:00.000Z" });
  const thinkingArtifacts = generateThinkingArtifacts({
    service,
    agents,
    input: "Create a UI/UX brief and feature map for Brainpress.",
    now: "2026-05-13T00:02:00.000Z",
  });
  const prompt = createServiceWindowCodexPrompt({ service, agents, serviceWindow: window, thinkingArtifacts });

  assert.match(prompt, /Think Dynamic Canvases/);
  assert.match(prompt, /UI\/UX Brief|Service Capabilities/);
});

test("Service normalization preserves agents and generated UI for legacy storage", async () => {
  await withMockLocalStorage(async () => {
    const state = loadBrainpressState();
    const service = state.services.find((item) => item.id === brainpressCoreProject.id);
    const agents = state.serviceAgents.filter((agent) => agent.serviceId === brainpressCoreProject.id);
    const serviceWindow = state.serviceWindows.find((item) => item.serviceId === brainpressCoreProject.id);

    assert.ok(service);
    assert.equal(service?.name, "Brainpress Agent Service");
    assert.equal(agents.length >= 2, true);
    assert.equal(agents[0].permissionLevel, "founder_approval_required");
    assert.equal(serviceWindow?.status, "empty");
    assert.deepEqual(normalizeService({ id: "svc_1", name: "Research Service" }).agentIds, ["agent_svc_1_main"]);
    assert.equal(normalizeServiceAgent({ id: "agent_1", serviceId: "svc_1", name: "Research Agent" }).status, "proposed");
    assert.equal(normalizeServiceWindow({ id: "window_1", serviceId: "svc_1" }).status, "empty");
  });
});

test("messy multi-PDF bug intent creates a ready DevelopmentTask", () => {
  const task = createDevelopmentTaskFromIntent({
    input: "checked but still cant upload multiple pdfs to memory",
    project: brainpressCoreProject,
    memory: brainpressCoreMemory,
    now: "2026-05-12T00:00:00.000Z",
  });

  assert.equal(task.projectId, brainpressCoreProject.id);
  assert.equal(task.taskType, "bug_fix");
  assert.equal(task.status, "ready_to_dispatch");
  assert.deepEqual(task.affectedAreas, [
    "PDF upload/import flow",
    "source memory persistence",
    "localStorage hydration",
    "consolidated memory rebuild",
  ]);
  assert.match(task.acceptanceCriteria.join("\n"), /PDF A and PDF B save separately/i);
  assert.match(task.acceptanceCriteria.join("\n"), /Same-name PDFs save separately/i);
  assert.match(task.acceptanceCriteria.join("\n"), /Reload preserves both/i);
  assert.match(task.acceptanceCriteria.join("\n"), /Consolidated memory count matches saved source count/i);
  assert.deepEqual(task.verificationCommands, ["npm run typecheck", "npm test", "npm run build"]);
  assert.equal(task.dispatchTarget, "github_issue");
  assert.match(task.codexGoal, /^\/goal Continue building Brainpress Core\./);
  assert.match(task.codexGoal, /PDF A and PDF B save separately/i);
  assert.match(task.codexGoal, /browser verification/i);
});

test("founder input creates a structured ThinkSession", () => {
  const session = createThinkSession({
    input: "I want Brainpress to help non-technical founders manage Codex without copy-pasting prompts.",
    mode: "open_thinking",
    artifactType: "product_brief",
    project: brainpressCoreProject,
    now: "2026-05-12T00:00:00.000Z",
  });

  assert.equal(session.projectId, brainpressCoreProject.id);
  assert.equal(session.status, "generated");
  assert.equal(session.mode, "open_thinking");
  assert.equal(session.artifactType, "product_brief");
  assert.match(session.summary, /product brief direction/i);
  assert.match(session.productDirection, /Brainpress Core should/i);
  assert.match(session.targetUser, /founders/i);
  assert.ok(session.mvpScope.length > 0);
  assert.ok(session.risks.length > 0);
  assert.ok(session.openQuestions.length > 0);
  assert.ok(session.recommendedBuildTasks.length >= 1);
});

test("Think quick action mode and artifact card type are stored", () => {
  const session = createThinkSession({
    input: "Define the smallest useful MVP for founder product direction.",
    mode: "define_mvp",
    artifactType: "feature_spec",
    project: brainpressCoreProject,
    now: "2026-05-12T00:00:00.000Z",
  });

  assert.equal(session.mode, "define_mvp");
  assert.equal(session.artifactType, "feature_spec");
  assert.match(session.mvpScope.join("\n"), /first version|first useful|one clear founder workflow/i);
  assert.match(session.featureIdeas.join("\n"), /build-ready feature spec/i);
});

test("ThinkSession normalization preserves generated artifacts for legacy storage", () => {
  const normalized = normalizeThinkSession({
    id: "think_legacy",
    projectId: brainpressCoreProject.id,
    input: "Plan roadmap for Brainpress.",
    mode: "plan_roadmap",
    artifactType: "roadmap",
    recommendedBuildTasks: [
      {
        title: "Implement first roadmap item",
        taskType: "feature",
        priority: "high",
        reason: "Roadmap needs one build step.",
        acceptanceCriteria: ["First roadmap item is visible."],
      },
    ],
  });

  assert.equal(normalized.id, "think_legacy");
  assert.equal(normalized.mode, "plan_roadmap");
  assert.equal(normalized.artifactType, "roadmap");
  assert.equal(normalized.status, "generated");
  assert.equal(normalized.recommendedBuildTasks[0].title, "Implement first roadmap item");
});

test("recommended Think build task becomes a ready DevelopmentTask", () => {
  const session = createThinkSession({
    input: "Create a feature spec for turning founder thinking into Build tasks.",
    mode: "create_feature_spec",
    artifactType: "feature_spec",
    project: brainpressCoreProject,
    now: "2026-05-12T00:00:00.000Z",
  });
  const task = createDevelopmentTaskFromThinkRecommendation({
    session,
    recommendation: session.recommendedBuildTasks[0],
    project: brainpressCoreProject,
    memory: brainpressCoreMemory,
    now: "2026-05-12T00:01:00.000Z",
  });

  assert.equal(task.sourceThinkSessionId, session.id);
  assert.equal(task.status, "ready_to_dispatch");
  assert.equal(task.title, session.recommendedBuildTasks[0].title);
  assert.match(task.context.join("\n"), /Think session:/i);
  assert.match(task.codexGoal, /^\/goal Continue building Brainpress Core\./);
});

test("ProductWindow is created from a ThinkSession", () => {
  const session = createThinkSession({
    input: "I want an agent workspace where founders can decide what Codex should build next.",
    mode: "clarify_idea",
    artifactType: "product_brief",
    project: brainpressCoreProject,
    now: "2026-05-12T00:00:00.000Z",
  });
  const productWindow = createProductWindowFromThinkSession({
    session,
    project: brainpressCoreProject,
    now: "2026-05-12T00:01:00.000Z",
  });

  assert.equal(productWindow.projectId, brainpressCoreProject.id);
  assert.equal(productWindow.thinkSessionId, session.id);
  assert.equal(productWindow.title, "Brainpress Agent Workspace");
  assert.equal(productWindow.route, "/projects/brainpress-core");
  assert.equal(productWindow.previewType, "agent_console");
  assert.equal(productWindow.primaryCTA, "Think with Brainpress");
  assert.ok(productWindow.sections.length >= 5);
  assert.ok(productWindow.userFlow.length >= 4);
  assert.equal(productWindow.status, "generated");
});

test("ProductWindow preview type inference covers common product surfaces", () => {
  assert.equal(inferProductWindowPreviewType("agent task orchestrator codex workspace"), "agent_console");
  assert.equal(inferProductWindowPreviewType("analytics dashboard with metrics reporting"), "dashboard");
  assert.equal(inferProductWindowPreviewType("marketing homepage landing page"), "landing_page");
  assert.equal(inferProductWindowPreviewType("onboarding setup first use flow"), "onboarding");
});

test("ProductWindow includes route, primary CTA, sections, and user flow", () => {
  const session = createThinkSession({
    input: "Create an onboarding first use flow for founders setting up Brainpress.",
    mode: "define_mvp",
    artifactType: "mvp_scope",
    project: brainpressCoreProject,
    now: "2026-05-12T00:00:00.000Z",
  });
  const productWindow = createProductWindowFromThinkSession({ session, project: brainpressCoreProject });

  assert.match(productWindow.route, /\/projects\/brainpress-core/);
  assert.ok(productWindow.primaryCTA.length > 0);
  assert.ok(productWindow.sections.some((section) => section.componentType === "input_console"));
  assert.ok(productWindow.sections.some((section) => /Product Window/i.test(section.title)));
  assert.match(productWindow.userFlow.join("\n"), /Founder describes the idea/i);
  assert.match(productWindow.uiPrinciples.join("\n"), /Founder-friendly language/i);
});

test("Create Build Task from Product Window creates a linked DevelopmentTask", () => {
  const session = createThinkSession({
    input: "Show Brainpress as an agent workspace before building the UI.",
    mode: "create_feature_spec",
    artifactType: "feature_spec",
    project: brainpressCoreProject,
    now: "2026-05-12T00:00:00.000Z",
  });
  const productWindow = createProductWindowFromThinkSession({
    session,
    project: brainpressCoreProject,
    now: "2026-05-12T00:01:00.000Z",
  });
  const task = createDevelopmentTaskFromProductWindow({
    productWindow,
    session,
    project: brainpressCoreProject,
    memory: brainpressCoreMemory,
    now: "2026-05-12T00:02:00.000Z",
  });

  assert.equal(task.sourceThinkSessionId, session.id);
  assert.equal(task.sourceProductWindowId, productWindow.id);
  assert.equal(task.status, "ready_to_dispatch");
  assert.match(task.title, /Build Brainpress Agent Workspace preview/i);
  assert.match(task.acceptanceCriteria.join("\n"), /primary CTA is visible/i);
  assert.match(task.acceptanceCriteria.join("\n"), /npm run typecheck passes/i);
  assert.match(task.context.join("\n"), /Concept note: Product Window is a thinking artifact/i);
  assert.match(task.codexGoal, /^\/goal Continue building Brainpress Core\./);
});

test("Spec Loop turns ThinkSession and ProductWindow into spec, clarify, plan, tasks, and linked DevelopmentTasks", () => {
  const session = createThinkSession({
    input: "I want Brainpress to help founders approve product direction before agents build anything. It should show a preview, ask questions when unclear, and create safe Build tasks.",
    mode: "clarify_idea",
    artifactType: "product_brief",
    project: brainpressCoreProject,
    now: "2026-05-12T00:00:00.000Z",
  });
  const productWindow = createProductWindowFromThinkSession({
    session,
    project: brainpressCoreProject,
    now: "2026-05-12T00:01:00.000Z",
  });
  const constitution = createConstitution(brainpressCoreProject, "2026-05-12T00:02:00.000Z");
  const spec = createSpecFromThinkSession({
    session,
    productWindow,
    project: brainpressCoreProject,
    now: "2026-05-12T00:03:00.000Z",
  });
  const questions = createClarifyingQuestions(spec, "2026-05-12T00:04:00.000Z");
  const plan = createPlanFromSpec({
    spec,
    project: brainpressCoreProject,
    now: "2026-05-12T00:05:00.000Z",
  });
  const taskList = createTaskListFromPlan(plan, "2026-05-12T00:06:00.000Z");
  const tasks = createDevelopmentTasksFromSpecTasks({
    taskList,
    project: brainpressCoreProject,
    memory: brainpressCoreMemory,
    spec,
    plan,
    now: "2026-05-12T00:07:00.000Z",
  });

  assert.equal(constitution.projectId, brainpressCoreProject.id);
  assert.match(constitution.approvalRules.join("\n"), /Founder approval is required/i);
  assert.equal(spec.thinkSessionId, session.id);
  assert.equal(spec.productWindowId, productWindow.id);
  assert.equal(spec.serviceId, brainpressCoreProject.id);
  assert.match(spec.what, /Brainpress|founders|approve/i);
  assert.ok(spec.userStories.length > 0);
  assert.ok(spec.successCriteria.length > 0);
  assert.ok(spec.nonGoals.length > 0);
  assert.ok(spec.assumptions.length > 0);
  assert.ok(questions.length > 0);
  assert.equal(plan.specId, spec.id);
  assert.equal(plan.serviceId, brainpressCoreProject.id);
  assert.match(plan.validationPlan.join("\n"), /npm run build|Product Window/i);
  assert.equal(taskList.planId, plan.id);
  assert.equal(taskList.serviceId, brainpressCoreProject.id);
  assert.ok(taskList.dependencyOrder.length >= 3);
  assert.equal(tasks.length, taskList.tasks.length);
  assert.equal(tasks[0].sourceSpecId, spec.id);
  assert.equal(tasks[0].sourcePlanId, plan.id);
  assert.equal(tasks[0].sourceSpecTaskId, taskList.tasks[0].id);
  assert.equal(tasks[0].serviceId, brainpressCoreProject.id);
  assert.equal(tasks[0].status, "ready_to_dispatch");
  assert.match(tasks[0].codexGoal, /^\/goal Continue building Brainpress Core\./);
});

test("Spec Loop marks ambiguous ideas as needing clarification", () => {
  const session = createThinkSession({
    input: "Maybe improve onboarding?",
    mode: "open_thinking",
    artifactType: "product_brief",
    project: brainpressCoreProject,
    now: "2026-05-12T00:00:00.000Z",
  });
  const spec = createSpecFromThinkSession({ session, project: brainpressCoreProject });
  const questions = createClarifyingQuestions(spec);
  const normalized = normalizeSpec({ id: "legacy_spec", projectId: brainpressCoreProject.id });

  assert.equal(spec.clarificationStatus, "needs_clarification");
  assert.ok(questions.length >= 2);
  assert.ok(questions.every((question) => question.question.endsWith("?")));
  assert.equal(normalized.clarificationStatus, "needs_clarification");
});

test("GitHub Dispatch creates issue title and body from DevelopmentTask", () => {
  const task = createDevelopmentTaskFromIntent({
    input: "Fix multi-PDF source persistence and prove both PDFs remain saved.",
    project: brainpressCoreProject,
    memory: brainpressCoreMemory,
    now: "2026-05-12T00:00:00.000Z",
  });
  const title = createGithubIssueTitle(task);
  const body = createGithubIssueBody(task, brainpressCoreProject);

  assert.equal(title, `[Brainpress] ${task.title}`);
  assert.match(body, /# Brainpress Development Task/);
  assert.match(body, /## Goal/);
  assert.match(body, /\/goal Continue building Brainpress Core\./);
  assert.match(body, /## Acceptance Criteria/);
  assert.match(body, /- \[ \] /);
  assert.match(body, /## Verification Commands/);
  assert.match(body, /```bash\nnpm run typecheck\nnpm test\nnpm run build\n```/);
  assert.match(body, /## Expected Final Summary/);
  assert.match(body, /Changed files/);
  assert.match(body, new RegExp(`Task ID: ${task.id}`));
});

test("GitHub Dispatch issue body includes Product Window source metadata", () => {
  const session = createThinkSession({
    input: "Show Brainpress as an agent workspace before building the UI.",
    project: brainpressCoreProject,
  });
  const productWindow = createProductWindowFromThinkSession({ session, project: brainpressCoreProject });
  const task = createDevelopmentTaskFromProductWindow({
    productWindow,
    session,
    project: brainpressCoreProject,
    memory: brainpressCoreMemory,
  });
  const body = createGithubIssueBody(task, brainpressCoreProject);

  assert.match(body, new RegExp(`Think Session ID: ${session.id}`));
  assert.match(body, new RegExp(`Product Window ID: ${productWindow.id}`));
  assert.match(body, /The primary CTA is visible/);
});

test("GitHub Dispatch prepares repository, title, body, and guidance", () => {
  const task = {
    ...createDevelopmentTaskFromIntent({
      input: "Create GitHub dispatch package.",
      project: brainpressCoreProject,
      memory: brainpressCoreMemory,
    }),
    repo: "https://github.com/tulga-dev/brainpress.git",
  };
  const prepared = prepareGithubDispatch(task, brainpressCoreProject);

  assert.equal(prepared.repository, "tulga-dev/brainpress");
  assert.equal(prepared.issueTitle, `[Brainpress] ${task.title}`);
  assert.match(prepared.issueBody, /Brainpress Metadata/);
  assert.match(prepared.guidance, /tag @codex/i);
});

test("GitHub Dispatch status is honest for created issues and copy fallback", () => {
  const task = createDevelopmentTaskFromIntent({
    input: "Create GitHub dispatch package.",
    project: brainpressCoreProject,
    memory: brainpressCoreMemory,
    now: "2026-05-12T00:00:00.000Z",
  });
  const copied = applyGithubDispatchResult(
    task,
    { configured: false, message: "GitHub issue body copied." },
    "2026-05-12T00:01:00.000Z",
  );
  const dispatched = applyGithubDispatchResult(
    task,
    {
      configured: true,
      issueUrl: "https://github.com/tulga-dev/brainpress/issues/7",
      issueNumber: 7,
      message: "GitHub issue created.",
    },
    "2026-05-12T00:02:00.000Z",
  );

  assert.equal(copied.status, "prepared_for_github");
  assert.equal(copied.externalRunUrl, undefined);
  assert.equal(dispatched.status, "dispatched");
  assert.equal(dispatched.externalRunUrl, "https://github.com/tulga-dev/brainpress/issues/7");
});

test("Agent Gateway normalizes structured OpenAI-style Think responses", async () => {
  const fetcher: typeof fetch = async () =>
    new Response(
      JSON.stringify({
        ok: true,
        source: "openai",
        surface: "think",
        model: "gpt-test",
        result: {
          summary: "Brainpress should help founders think clearly before building.",
          productDirection: "Create a Think-first agentic workspace.",
          userProblem: "Founders cannot translate messy product ideas into buildable work.",
          targetUser: "Non-technical founders using coding agents.",
          proposedSolution: "Guide the founder from product direction to Build tasks.",
          mvpScope: ["Capture messy input.", "Produce buildable direction."],
          featureIdeas: ["Live AI co-thinking."],
          decisions: ["Keep deterministic fallback."],
          risks: ["AI output could be vague."],
          openQuestions: ["Which model should be default?"],
          recommendedBuildTasks: [
            {
              title: "Add Live AI badge",
              taskType: "feature",
              priority: "medium",
              reason: "Founders need to know whether the response came from AI.",
              acceptanceCriteria: ["Live AI responses show a badge."],
            },
          ],
          productWindowSuggestion: {
            title: "Brainpress Think Workspace",
            route: "/projects/brainpress-core",
            primaryCTA: "Think with Brainpress",
            sections: ["Hero", "Input console"],
          },
        },
      }),
    );

  const response = await callBrainpressAgent(
    {
      surface: "think",
      input: "Help me shape Brainpress.",
      project: brainpressCoreProject,
    },
    { fetcher },
  );

  assert.equal(response.source, "openai");
  assert.equal(response.model, "gpt-test");
  assert.match((response.result as { summary: string }).summary, /founders think clearly/i);
  assert.equal((response.result as { recommendedBuildTasks: unknown[] }).recommendedBuildTasks.length, 1);
});

test("Agent Gateway falls back for Think, Build, and Run when OPENAI_API_KEY is missing", async () => {
  assert.equal(shouldUseOpenAI({}), false);

  const think = await runBrainpressAgent(
    { surface: "think", input: "Clarify Brainpress as a product OS.", project: brainpressCoreProject },
    { env: {} },
  );
  const build = await runBrainpressAgent(
    { surface: "build", input: "Fix failed build and run typecheck.", project: brainpressCoreProject },
    { env: {} },
  );
  const run = await runBrainpressAgent(
    { surface: "run", input: "Supabase login is broken in Vercel production.", project: brainpressCoreProject },
    { env: {} },
  );

  assert.equal(think.source, "fallback");
  assert.match((think.result as { summary: string }).summary, /Brainpress/i);
  assert.equal(build.source, "fallback");
  assert.match((build.result as { title: string }).title, /Repair|Fix/i);
  assert.equal(run.source, "fallback");
  assert.equal((run.result as { provider?: string }).provider, "supabase");
});

test("Agent Gateway falls back safely when OpenAI output is malformed", async () => {
  const fetcher: typeof fetch = async () =>
    new Response(
      JSON.stringify({
        output_text: JSON.stringify({ summary: "Missing required structured fields." }),
      }),
    );

  const response = await runBrainpressAgent(
    {
      surface: "build",
      input: "Create a GitHub dispatch package.",
      project: brainpressCoreProject,
    },
    {
      env: { OPENAI_API_KEY: "sk-test", BRAINPRESS_OPENAI_MODEL: "gpt-test" },
      fetcher,
    },
  );

  assert.equal(response.source, "fallback");
  assert.match(response.error || "", /malformed/i);
  assert.match((response.result as { title: string }).title, /GitHub dispatch/i);
});

test("Agent Gateway rejects malformed client payloads during normalization", () => {
  const malformed = normalizeAgentResponse("run", {
    ok: true,
    source: "openai",
    surface: "run",
    result: {
      type: "vercel",
      title: "Broken deploy",
      summary: "Deployment needs review.",
      recommendedSteps: [],
    },
  });

  assert.equal(malformed, null);
});

test("Agent Gateway keeps OpenAI key server-side and avoids public env names", () => {
  const routeSource = readFileSync("app/api/brainpress/agent/route.ts", "utf8");
  const gatewaySource = readFileSync("src/lib/agent-gateway.ts", "utf8");
  const serverGatewaySource = readFileSync("src/lib/server/agent-gateway.ts", "utf8");
  const workspaceSource = readFileSync("src/components/brainpress/project-workspace.tsx", "utf8");

  assert.match(serverGatewaySource, /OPENAI_API_KEY/);
  assert.match(serverGatewaySource, /Authorization/);
  assert.match(routeSource, /runBrainpressAgent/);
  assert.doesNotMatch(gatewaySource, /Authorization: `Bearer/);
  assert.doesNotMatch(gatewaySource, /https:\/\/api\.openai\.com/);
  assert.doesNotMatch(`${gatewaySource}\n${workspaceSource}`, /NEXT_PUBLIC_OPENAI_API_KEY/);
  assert.doesNotMatch(workspaceSource, /OPENAI_API_KEY/);
});

test("Brainpress store selects Supabase when authenticated and local fallback otherwise", () => {
  const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const previousKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://brainpress.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon_test";

  const localSelection = selectBrainpressStore(null);
  const cloudSelection = selectBrainpressStore({
    accessToken: "access",
    refreshToken: "refresh",
    user: { id: "user_123", email: "founder@example.com" },
  });

  assert.equal(localSelection.store.mode, "local");
  assert.equal(localSelection.sourceLabel, "Local workspace");
  assert.match(localSelection.reason, /Working locally/);
  assert.equal(cloudSelection.store.mode, "cloud");
  assert.equal(cloudSelection.sourceLabel, "Cloud synced");

  process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = previousKey;
});

test("signed-out Local workspace can create Think, Build, Run, and GitHub copy handoff", async () => {
  await withMockLocalStorage(async () => {
    const store = new LocalStorageBrainpressStore();
    const thinkSession = createThinkSession({
      input: "I want Brainpress to work locally without forcing sign-in.",
      mode: "clarify_idea",
      artifactType: "product_brief",
      project: brainpressCoreProject,
      now: "2026-05-12T00:00:00.000Z",
    });
    const productWindow = createProductWindowFromThinkSession({
      session: thinkSession,
      project: brainpressCoreProject,
      now: "2026-05-12T00:01:00.000Z",
    });
    const task = createDevelopmentTaskFromProductWindow({
      productWindow,
      session: thinkSession,
      project: brainpressCoreProject,
      memory: brainpressCoreMemory,
      now: "2026-05-12T00:02:00.000Z",
    });
    const runIssue = createRunIssue({
      projectId: brainpressCoreProject.id,
      input: "Supabase login works locally but fails on Vercel production.",
      now: "2026-05-12T00:03:00.000Z",
    });

    await store.saveThinkSession(thinkSession);
    await store.saveProductWindow(productWindow);
    await store.saveDevelopmentTask(task);
    await store.saveRunIssue(runIssue);

    const reloaded = await loadStateFromStore(store);
    assert.equal(reloaded.thinkSessions.some((item) => item.id === thinkSession.id), true);
    assert.equal(reloaded.productWindows.some((item) => item.id === productWindow.id), true);
    assert.equal(reloaded.developmentTasks.some((item) => item.id === task.id), true);
    assert.equal(reloaded.runIssues.some((item) => item.id === runIssue.id), true);

    const githubDispatch = prepareGithubDispatch(task, brainpressCoreProject);
    assert.match(githubDispatch.issueBody, /Brainpress Development Task/);
    const copied = applyGithubDispatchResult(task, {
      configured: false,
      message: "GitHub issue body copied locally.",
    });
    assert.equal(copied.status, "prepared_for_github");
  });
});

test("SupabaseBrainpressStore saves and loads core Brainpress entities", async () => {
  const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const previousKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const previousFetch = globalThis.fetch;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://brainpress.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon_test";
  const savedTables: string[] = [];
  const thinkSession = createThinkSession({
    input: "Build a phone-friendly Brainpress workspace.",
    mode: "clarify_idea",
    artifactType: "product_brief",
    project: brainpressCoreProject,
    now: "2026-05-12T00:00:00.000Z",
  });
  const productWindow = createProductWindowFromThinkSession({ session: thinkSession, project: brainpressCoreProject });
  const developmentTask = createDevelopmentTaskFromThinkRecommendation({
    session: thinkSession,
    recommendation: thinkSession.recommendedBuildTasks[0],
    project: brainpressCoreProject,
    memory: brainpressCoreMemory,
  });
  const runIssue = createRunIssue({
    projectId: brainpressCoreProject.id,
    input: "Vercel production deploy failed because env vars are missing.",
    now: "2026-05-12T00:00:00.000Z",
  });

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (init?.method === "POST") {
      savedTables.push(url.split("/rest/v1/")[1]?.split("?")[0] || "unknown");
      return new Response("[]", { status: 201 });
    }
    if (url.includes("/projects")) {
      return Response.json([{
        id: brainpressCoreProject.id,
        owner_id: "user_123",
        name: brainpressCoreProject.name,
        description: brainpressCoreProject.description,
        repo_path_or_url: brainpressCoreProject.repoPathOrUrl,
        preferred_agent: brainpressCoreProject.preferredAgent,
        primary_goal: brainpressCoreProject.primaryGoal,
        constraints: brainpressCoreProject.constraints,
        verification_commands: brainpressCoreProject.verificationCommands,
        safety_rules: brainpressCoreProject.safetyRules,
        created_at: brainpressCoreProject.createdAt,
        updated_at: brainpressCoreProject.createdAt,
      }]);
    }
    if (url.includes("/think_sessions")) return Response.json([{
      id: thinkSession.id,
      project_id: thinkSession.projectId,
      title: thinkSession.title,
      input: thinkSession.input,
      mode: thinkSession.mode,
      artifact_type: thinkSession.artifactType,
      summary: thinkSession.summary,
      product_direction: thinkSession.productDirection,
      user_problem: thinkSession.userProblem,
      target_user: thinkSession.targetUser,
      proposed_solution: thinkSession.proposedSolution,
      mvp_scope: thinkSession.mvpScope,
      feature_ideas: thinkSession.featureIdeas,
      decisions: thinkSession.decisions,
      risks: thinkSession.risks,
      open_questions: thinkSession.openQuestions,
      recommended_build_tasks: thinkSession.recommendedBuildTasks,
      status: thinkSession.status,
      created_at: thinkSession.createdAt,
      updated_at: thinkSession.updatedAt,
    }]);
    if (url.includes("/product_windows")) return Response.json([{
      id: productWindow.id,
      project_id: productWindow.projectId,
      think_session_id: productWindow.thinkSessionId,
      title: productWindow.title,
      route: productWindow.route,
      preview_type: productWindow.previewType,
      user_scenario: productWindow.userScenario,
      screen_description: productWindow.screenDescription,
      primary_cta: productWindow.primaryCTA,
      sections: productWindow.sections,
      ui_principles: productWindow.uiPrinciples,
      user_flow: productWindow.userFlow,
      open_questions: productWindow.openQuestions,
      status: productWindow.status,
      created_at: productWindow.createdAt,
      updated_at: productWindow.updatedAt,
    }]);
    if (url.includes("/development_tasks")) return Response.json([{
      id: developmentTask.id,
      project_id: developmentTask.projectId,
      title: developmentTask.title,
      description: developmentTask.description,
      task_type: developmentTask.taskType,
      status: developmentTask.status,
      priority: developmentTask.priority,
      repo: developmentTask.repo,
      branch: developmentTask.branch,
      context: developmentTask.context,
      affected_areas: developmentTask.affectedAreas,
      acceptance_criteria: developmentTask.acceptanceCriteria,
      verification_commands: developmentTask.verificationCommands,
      manual_qa_steps: developmentTask.manualQaSteps,
      constraints: developmentTask.constraints,
      dispatch_target: developmentTask.dispatchTarget,
      dispatch_mode: developmentTask.dispatchMode,
      codex_goal: developmentTask.codexGoal,
      result_summary: developmentTask.resultSummary,
      result_raw: developmentTask.resultRaw,
      status_history: developmentTask.statusHistory,
      created_at: developmentTask.createdAt,
      updated_at: developmentTask.updatedAt,
    }]);
    if (url.includes("/development_task_results")) return Response.json([]);
    if (url.includes("/run_issues")) return Response.json([{
      id: runIssue.id,
      project_id: runIssue.projectId,
      type: runIssue.type,
      title: runIssue.title,
      summary: runIssue.summary,
      provider: runIssue.provider,
      likely_causes: runIssue.likelyCauses,
      recommended_steps: runIssue.recommendedSteps,
      verification_steps: runIssue.verificationSteps,
      required_access: runIssue.requiredAccess,
      risks: runIssue.risks,
      recommended_build_tasks: runIssue.recommendedBuildTasks,
      created_at: runIssue.createdAt,
      updated_at: runIssue.createdAt,
    }]);
    return Response.json([]);
  }) as typeof fetch;

  const store = new SupabaseBrainpressStore({
    accessToken: "access",
    user: { id: "user_123", email: "founder@example.com" },
  });
  const cloudState = await loadStateFromStore(store);
  assert.equal(cloudState.projects[0].id, brainpressCoreProject.id);
  assert.equal(cloudState.thinkSessions[0].id, thinkSession.id);
  assert.equal(cloudState.productWindows[0].id, productWindow.id);
  assert.equal(cloudState.developmentTasks[0].id, developmentTask.id);
  assert.equal(cloudState.runIssues[0].id, runIssue.id);

  await store.saveProject(brainpressCoreProject);
  await store.saveThinkSession(thinkSession);
  await store.saveProductWindow(productWindow);
  await store.saveDevelopmentTask(developmentTask);
  await store.saveRunIssue(runIssue);
  assert.deepEqual(savedTables, ["projects", "think_sessions", "product_windows", "development_tasks", "run_issues"]);

  globalThis.fetch = previousFetch;
  process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = previousKey;
});

test("SupabaseBrainpressStore does not request updated_at for result tables", async () => {
  const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const previousKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const previousFetch = globalThis.fetch;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://brainpress.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon_test";
  const requestedUrls: string[] = [];

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    requestedUrls.push(String(input));
    return Response.json([]);
  }) as typeof fetch;

  const store = new SupabaseBrainpressStore({
    accessToken: "access",
    user: { id: "user_123", email: "founder@example.com" },
  });
  await store.listDevelopmentTaskResults(brainpressCoreProject.id);

  const resultUrl = requestedUrls.find((url) => url.includes("/development_task_results")) || "";
  assert.match(resultUrl, /order=created_at\.desc/);
  assert.doesNotMatch(resultUrl, /updated_at/);

  globalThis.fetch = previousFetch;
  process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = previousKey;
});

test("Cloud auth UI uses local fallback and does not expose server-only env vars to frontend", () => {
  const workspaceSource = readFileSync("src/components/brainpress/project-workspace.tsx", "utf8");
  const hookSource = readFileSync("src/components/brainpress/use-brainpress.ts", "utf8");
  const supabaseBrowserSource = readFileSync("src/lib/supabase-browser.ts", "utf8");
  const storeSource = readFileSync("src/lib/brainpress-store.ts", "utf8");
  const clientSources = `${workspaceSource}\n${hookSource}\n${supabaseBrowserSource}\n${storeSource}`;

  assert.match(clientSources, /Cloud synced/);
  assert.match(clientSources, /Local workspace/);
  assert.match(clientSources, /Working locally\. Sign in to sync across devices\./);
  assert.match(workspaceSource, /Local workspace is stored on this browser only/);
  assert.match(workspaceSource, /To use the same workspace from another device, sign in to enable cloud sync/);
  assert.match(workspaceSource, /Dismiss/);
  assert.match(workspaceSource, /Sign in to sync/);
  assert.match(hookSource, /restoreSupabaseSession/);
  assert.doesNotMatch(clientSources, /process\.env\.OPENAI_API_KEY/);
  assert.doesNotMatch(clientSources, /process\.env\.SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(clientSources, /process\.env\.BRAINPRESS_GITHUB_TOKEN/);
  assert.doesNotMatch(clientSources, /process\.env\.GITHUB_TOKEN/);
});

test("Codex Goal Function includes outcome, validation, permissions, checks, and final summary", () => {
  const task = createDevelopmentTaskFromIntent({
    input: "checked but still cant upload multiple pdfs to memory",
    project: brainpressCoreProject,
    memory: brainpressCoreMemory,
    now: "2026-05-12T00:00:00.000Z",
  });
  const goal = generateCodexGoalObjective({
    project: brainpressCoreProject,
    memory: brainpressCoreMemory,
    task,
  });

  assert.match(goal.goalText, /^\/goal Continue building Brainpress Core\./);
  assert.match(goal.targetOutcome, /Fix multi-PDF memory import persistence/i);
  assert.match(goal.validationLoop, /acceptance criteria/i);
  assert.match(goal.permissionGuidance, /Work only inside the selected project folder/i);
  assert.match(goal.permissionGuidance, /Do not access secrets/i);
  assert.deepEqual(goal.requiredChecks, [
    "npm run typecheck",
    "npm test",
    "npm run build",
    "npm run lint if available",
    "browser verification",
  ]);
  assert.match(goal.goalText, /changed files, commands run, verification results/i);
  assert.match(goal.goalText, /Stop only when the checks pass or when a blocker requires founder input/i);
});

test("DevelopmentTask status and result review preserve raw Codex result", () => {
  const task = createDevelopmentTaskFromIntent({
    input: "Fix upload multiple PDFs to memory.",
    project: brainpressCoreProject,
    memory: brainpressCoreMemory,
    now: "2026-05-12T00:00:00.000Z",
  });
  const running = updateDevelopmentTaskStatus(task, "running", "Codex started.", "2026-05-12T00:01:00.000Z");
  const reviewed = updateDevelopmentTaskResult(
    running,
    [
      "Implemented fix for PDF A and PDF B save separately.",
      "Same-name PDFs save separately.",
      "Reload preserves both saved PDF sources.",
      "Consolidated memory count matches saved source count.",
      "npm run typecheck passed.",
      "npm run build passed.",
    ].join("\n"),
    "2026-05-12T00:02:00.000Z",
  );

  assert.equal(running.status, "running");
  assert.equal(reviewed.status, "needs_review");
  assert.match(reviewed.resultRaw, /PDF A and PDF B/i);
  assert.match(reviewed.resultSummary, /Implemented fix/i);
  assert.equal(reviewed.statusHistory[reviewed.statusHistory.length - 1]?.status, "needs_review");
});

test("DevelopmentTask acceptance comparison reports missing criteria", () => {
  const task = createDevelopmentTaskFromIntent({
    input: "Fix upload multiple PDFs to memory.",
    project: brainpressCoreProject,
    memory: brainpressCoreMemory,
  });
  const review = compareResultToAcceptanceCriteria("PDF A and PDF B save separately. npm run build passed.", task.acceptanceCriteria);

  assert.ok(review.satisfiedCriteria.length >= 2);
  assert.ok(review.missingCriteria.length > 0);
});

test("DevelopmentTask result parser extracts files, commands, risks, and next tasks", () => {
  const task = createDevelopmentTaskFromIntent({
    input: "Fix upload multiple PDFs to memory.",
    project: brainpressCoreProject,
    memory: brainpressCoreMemory,
  });
  const result = parseDevelopmentTaskResult(
    task,
    [
      "Summary: fixed PDF source persistence.",
      "Files changed:",
      "- src/lib/brainpress.ts",
      "- src/components/brainpress/project-workspace.tsx",
      "Commands run:",
      "- npm run typecheck passed",
      "- npm test passed",
      "- npm run build failed with a route error",
      "Risks:",
      "- localStorage migration needs founder browser verification.",
      "Next:",
      "- Fix build failure and retry.",
    ].join("\n"),
    "local_bridge",
  );

  assert.deepEqual(result.changedFiles.slice(0, 2), [
    "src/lib/brainpress.ts",
    "src/components/brainpress/project-workspace.tsx",
  ]);
  assert.equal(result.verificationResults.find((item) => item.command === "npm run typecheck")?.status, "passed");
  assert.equal(result.verificationResults.find((item) => item.command === "npm run build")?.status, "failed");
  assert.match(result.risks.join("\n"), /localStorage migration/i);
  assert.match(result.nextTasks.join("\n"), /Fix build failure/i);
  assert.equal(result.recommendedStatus, "failed");
});

test("multi-PDF task result with command passes but no browser QA is partially verified", () => {
  const task = createDevelopmentTaskFromIntent({
    input: "checked but still cant upload multiple pdfs to memory",
    project: brainpressCoreProject,
    memory: brainpressCoreMemory,
  });
  const result = parseDevelopmentTaskResult(
    task,
    [
      "Implemented source append helper updates.",
      "npm run typecheck passed.",
      "npm test passed.",
      "npm run build passed.",
      "No browser QA was run yet.",
    ].join("\n"),
    "local_bridge",
  );
  const applied = applyRecommendedDevelopmentTaskStatus(task, result, "2026-05-12T00:03:00.000Z");

  assert.equal(result.recommendedStatus, "partially_verified");
  assert.equal(applied.status, "needs_review");
  assert.equal(result.acceptanceCriteriaReview.find((review) => /PDF A and PDF B/i.test(review.criterion))?.status, "unknown");
  assert.equal(result.acceptanceCriteriaReview.find((review) => /typecheck/i.test(review.criterion))?.status, "met");
  assert.equal(result.acceptanceCriteriaReview.find((review) => /build/i.test(review.criterion))?.status, "met");
});

test("multi-PDF task result with browser QA and commands passed recommends verified", () => {
  const task = createDevelopmentTaskFromIntent({
    input: "checked but still cant upload multiple pdfs to memory",
    project: brainpressCoreProject,
    memory: brainpressCoreMemory,
  });
  const result = parseDevelopmentTaskResult(
    task,
    [
      "Browser verification passed: PDF A and PDF B save separately.",
      "Browser verification passed: Same-name PDFs save separately.",
      "Browser verification passed: Reload preserves both saved PDF sources.",
      "Browser verification passed: Consolidated memory count matches saved source count.",
      "npm run typecheck passed.",
      "npm test passed.",
      "npm run build passed.",
    ].join("\n"),
    "manual_import",
  );

  assert.equal(result.recommendedStatus, "verified");
  assert.equal(result.acceptanceCriteriaReview.every((review) => review.status === "met"), true);
});

test("DevelopmentTask result with build failure recommends failed", () => {
  const task = createDevelopmentTaskFromIntent({
    input: "checked but still cant upload multiple pdfs to memory",
    project: brainpressCoreProject,
    memory: brainpressCoreMemory,
  });
  const result = parseDevelopmentTaskResult(task, "npm run build failed with TypeScript error TS2322.", "local_bridge");

  assert.equal(result.recommendedStatus, "failed");
  assert.equal(result.acceptanceCriteriaReview.find((review) => /build/i.test(review.criterion))?.status, "unmet");
});

test("unknown acceptance criteria are not treated as met", () => {
  const task = {
    ...createDevelopmentTaskFromIntent({
      input: "Build a careful dashboard.",
      project: brainpressCoreProject,
      memory: brainpressCoreMemory,
    }),
    acceptanceCriteria: ["Dashboard gives founders a clear source count."],
  };
  const result = parseDevelopmentTaskResult(task, "Implemented unrelated button styling.", "manual_import");

  assert.equal(result.acceptanceCriteriaReview[0].status, "unknown");
  assert.equal(result.recommendedStatus, "needs_review");
});

test("applying a recommended DevelopmentTask result updates status history", () => {
  const task = createDevelopmentTaskFromIntent({
    input: "checked but still cant upload multiple pdfs to memory",
    project: brainpressCoreProject,
    memory: brainpressCoreMemory,
    now: "2026-05-12T00:00:00.000Z",
  });
  const result = parseDevelopmentTaskResult(
    task,
    [
      "Browser verification passed: PDF A and PDF B save separately.",
      "Browser verification passed: Same-name PDFs save separately.",
      "Browser verification passed: Reload preserves both saved PDF sources.",
      "Browser verification passed: Consolidated memory count matches saved source count.",
      "npm run typecheck passed.",
      "npm run build passed.",
    ].join("\n"),
    "manual_import",
    "2026-05-12T00:02:00.000Z",
  );
  const updated = applyRecommendedDevelopmentTaskStatus(task, result, "2026-05-12T00:03:00.000Z");

  assert.equal(result.recommendedStatus, "verified");
  assert.equal(updated.status, "verified");
  assert.equal(updated.statusHistory[updated.statusHistory.length - 1]?.status, "verified");
  assert.match(updated.statusHistory[updated.statusHistory.length - 1]?.note || "", /Applied result review recommendation/i);
});

test("Codex adapter placeholder does not pretend dispatch happened without config", async () => {
  const task = createDevelopmentTaskFromIntent({
    input: "Fix upload multiple PDFs to memory.",
    project: brainpressCoreProject,
    memory: brainpressCoreMemory,
  });
  const run = await new CodexAdapter().createTask(task);

  assert.equal(run.configured, false);
  assert.equal(run.status, "not_configured");
  assert.equal(run.runId, "");
  assert.match(run.message, /Codex dispatch not configured yet/i);
});

test("Codex adapter boundary returns queued placeholder when configured", async () => {
  const task = {
    ...createDevelopmentTaskFromIntent({
      input: "Fix upload multiple PDFs to memory.",
      project: brainpressCoreProject,
      memory: brainpressCoreMemory,
      codexCloudConfigured: true,
    }),
    dispatchTarget: "codex_cloud" as const,
  };
  const run = await new CodexAdapter({ codexCloudConfigured: true }).createTask(task);

  assert.equal(run.configured, true);
  assert.equal(run.status, "queued");
  assert.match(run.runId, /^codex_cloud_placeholder_/);
});

test("LocalCodexBridgeAdapter health check reads localhost bridge metadata", async () => {
  const adapter = new LocalCodexBridgeAdapter({
    baseUrl: defaultLocalCodexBridgeUrl,
    fetcher: async (url) => {
      assert.equal(String(url), `${defaultLocalCodexBridgeUrl}/health`);
      return new Response(JSON.stringify({ ok: true, name: "Brainpress Local Codex Bridge", version: "0.1.0" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    },
  });

  const health = await adapter.checkHealth();

  assert.equal(health.ok, true);
  assert.equal(health.url, defaultLocalCodexBridgeUrl);
  assert.equal(health.name, "Brainpress Local Codex Bridge");
});

test("LocalCodexBridgeAdapter dispatch posts DevelopmentTask to /tasks", async () => {
  const task = createDevelopmentTaskFromIntent({
    input: "checked but still cant upload multiple pdfs to memory",
    project: brainpressCoreProject,
    memory: brainpressCoreMemory,
  });
  const calls: Array<{ url: string; body?: string }> = [];
  const adapter = new LocalCodexBridgeAdapter({
    baseUrl: "http://localhost:4317",
    fetcher: async (url, init) => {
      calls.push({ url: String(url), body: String(init?.body || "") });
      if (String(url).endsWith("/health")) {
        return new Response(JSON.stringify({ ok: true, name: "Brainpress Local Codex Bridge", version: "0.1.0" }), { status: 200 });
      }
      return new Response(
        JSON.stringify({
          runId: "local_devtask_123",
          status: "queued",
          externalRunUrl: "http://localhost:4317/tasks/local_devtask_123",
          message: "Task packaged.",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    },
  });

  const run = await adapter.createTask(task);
  const requestBody = JSON.parse(calls[1].body || "{}") as { task: { id: string }; repo: string; branch: string; mode: string };

  assert.equal(calls[0].url, "http://localhost:4317/health");
  assert.equal(calls[1].url, "http://localhost:4317/tasks");
  assert.equal(requestBody.task.id, task.id);
  assert.equal(requestBody.repo, task.repo);
  assert.equal(requestBody.branch, task.branch);
  assert.equal(requestBody.mode, "local_bridge");
  assert.equal(run.configured, true);
  assert.equal(run.runId, "local_devtask_123");
  assert.equal(run.status, "queued");
});

test("LocalCodexBridgeAdapter reports unavailable bridge clearly", async () => {
  const task = createDevelopmentTaskFromIntent({
    input: "checked but still cant upload multiple pdfs to memory",
    project: brainpressCoreProject,
    memory: brainpressCoreMemory,
  });
  const adapter = new LocalCodexBridgeAdapter({
    fetcher: async () => {
      throw new Error("connection refused");
    },
  });

  const health = await adapter.checkHealth();
  const run = await adapter.createTask(task);

  assert.equal(health.ok, false);
  assert.equal(health.message, "Local Codex Bridge is not running.");
  assert.equal(run.configured, false);
  assert.equal(run.message, "Local Codex Bridge is not running.");
});

test("LocalCodexBridgeAdapter can poll status and import result", async () => {
  const adapter = new LocalCodexBridgeAdapter({
    baseUrl: "http://localhost:4317",
    fetcher: async (url) => {
      if (String(url).endsWith("/result")) {
        return new Response(JSON.stringify({ runId: "local_123", status: "completed", summary: "Packaged.", raw: "Result placeholder." }), {
          status: 200,
        });
      }
      return new Response(JSON.stringify({ runId: "local_123", status: "running", message: "Still running." }), { status: 200 });
    },
  });

  const status = await adapter.getTaskStatus("local_123");
  const result = await adapter.getTaskResult("local_123");

  assert.equal(status, "running");
  assert.equal(result.status, "completed");
  assert.equal(result.raw, "Result placeholder.");
});

test("coding agent statuses map to DevelopmentTask statuses", () => {
  assert.equal(developmentStatusFromCodingAgentStatus("queued"), "dispatched");
  assert.equal(developmentStatusFromCodingAgentStatus("running"), "running");
  assert.equal(developmentStatusFromCodingAgentStatus("completed"), "completed");
  assert.equal(developmentStatusFromCodingAgentStatus("failed"), "failed");
  assert.equal(developmentStatusFromCodingAgentStatus("cancelled"), "cancelled");
  assert.equal(developmentStatusFromCodingAgentStatus("unknown"), "ready_to_dispatch");
});

test("legacy storage loads with DevelopmentTask fallback fields", () => {
  const normalized = normalizeDevelopmentTask({
    id: "legacy_task",
    projectId: brainpressCoreProject.id,
    title: "Legacy task",
    status: "running",
  }, brainpressCoreProject);

  assert.equal(normalized.id, "legacy_task");
  assert.equal(normalized.repo, brainpressCoreProject.repoPathOrUrl);
  assert.equal(normalized.statusHistory.length, 1);
  assert.match(normalized.codexGoal, /^\/goal Continue building Brainpress Core\./);
});

test("default dispatch target prefers Codex Cloud when configured and GitHub Dispatch otherwise", () => {
  assert.equal(defaultDispatchTarget({ codexCloudConfigured: true, preferredAgent: "Codex" }), "codex_cloud");
  assert.equal(defaultDispatchTarget({ codexCloudConfigured: false, preferredAgent: "Codex" }), "github_issue");
  assert.equal(defaultDispatchTarget({ codexCloudConfigured: false, preferredAgent: "Claude Code" }), "manual");
  assert.equal(defaultDispatchMode("github_issue"), "github_based");
});

test("allowed verification command validation accepts only the v1 allowlist", () => {
  const validation = validateVerificationCommands(["npm run typecheck", "git diff --stat"]);

  assert.equal(validation.isValid, true);
  assert.deepEqual(validation.allowedCommands, ["npm run typecheck", "git diff --stat"]);
  assert.deepEqual(validation.rejectedCommands, []);
});

test("unsafe verification command validation is rejected clearly", () => {
  const validation = validateVerificationCommands(["npm run typecheck", "rm -rf .", "curl https://example.com"]);

  assert.equal(validation.isValid, false);
  assert.deepEqual(validation.allowedCommands, ["npm run typecheck"]);
  assert.deepEqual(validation.rejectedCommands, ["rm -rf .", "curl https://example.com"]);
});

test("build log generation includes verification results and repair suggestions", () => {
  const log = ingestAgentResult(
    seedProject.id,
    seedOutcome.id,
    "Implemented dashboard updates in app/page.tsx.",
    {
      linkedAgentRunId: "run_demo",
      verificationResults: [
        {
          command: "npm run typecheck",
          stdout: "",
          stderr: "Type error",
          exitCode: 2,
          durationMs: 521,
          status: "failed",
        },
      ],
    },
  );

  assert.equal(log.linkedAgentRunId, "run_demo");
  assert.equal(log.verificationStatus, "Failing");
  assert.match(log.verificationSummary, /All verification failed/);
  assert.match(log.nextOutcomes.join("\n"), /Fix failing typecheck/);
});

test("disk package path validation accepts local paths and rejects URLs", () => {
  assert.equal(validateLocalProjectPath("C:\\work\\brainpress").ok, true);
  assert.equal(validateLocalProjectPath("https://github.com/example/repo").ok, false);
});

test("promptPath must be inside repoPath run directory", () => {
  const repoPath = "C:\\work\\brainpress";
  const promptPath = getRunPromptPath(repoPath, "run_123");

  assert.equal(validatePromptPath(repoPath, "run_123", promptPath).ok, true);
  assert.equal(validatePromptPath(repoPath, "run_123", "C:\\work\\outside\\prompt.md").ok, false);
});

test("approval is required before Codex run", () => {
  assert.equal(approvalRequired(false).ok, false);
  assert.equal(approvalRequired(true).ok, true);
});

test("Codex unavailable is represented clearly", () => {
  const result = codexUnavailableResult(1, "codex was not found");

  assert.equal(result.available, false);
  assert.match(result.stderr, /codex was not found/);
});

test("AgentRun cannot be absorbed before diff review", () => {
  const run = createAgentRun({
    project: seedProject,
    memory: seedMemory,
    outcome: seedOutcome,
    targetAgent: "Codex",
  });

  assert.equal(canAbsorbAgentRun({ ...run, requiresDiffReview: true }), false);
  assert.equal(canAbsorbAgentRun({ ...run, requiresDiffReview: true, diffReviewedAt: "2026-05-11T00:00:00.000Z" }), true);
});

test("verification failure creates repair outcome with failing output in prompt", () => {
  const run = createAgentRun({
    project: seedProject,
    memory: seedMemory,
    outcome: seedOutcome,
    targetAgent: "Codex",
  });
  const repairOutcome = createVerificationRepairOutcome(seedProject, seedMemory, {
    ...run,
    verificationResults: [
      {
        command: "npm test",
        stdout: "expected true to equal false",
        stderr: "1 failing test",
        exitCode: 1,
        durationMs: 315,
        status: "failed",
      },
    ],
  });

  assert.ok(repairOutcome);
  assert.match(repairOutcome.title, /Fix failing verification/);
  assert.match(repairOutcome.generatedPrompt, /1 failing test/);
  assert.match(repairOutcome.generatedPrompt, /## Permission Safety Rules/);
});

test("readiness checklist reports critical execution state", () => {
  const project = { ...seedProject, repoPathOrUrl: "C:\\work\\brainpress" };
  const run = {
    ...createAgentRun({ project, memory: seedMemory, outcome: seedOutcome, targetAgent: "Codex" }),
    codexAvailable: true,
    diskPackagePrepared: true,
    promptPath: getRunPromptPath("C:\\work\\brainpress", "run_ready").replace("run_ready", "run_ready"),
    id: "run_ready",
    promptSnapshot: `${seedOutcome.generatedPrompt}\n\n## Permission Safety Rules`,
    safetyRulesSnapshot: defaultPermissionSafetyRules,
  };
  const readiness = buildExecutionReadiness(project, {
    ...run,
    promptPath: getRunPromptPath(project.repoPathOrUrl, run.id),
  });

  assert.equal(readiness.find((item) => item.id === "repo-local")?.state, "passed");
  assert.equal(readiness.find((item) => item.id === "codex-installed")?.state, "passed");
});

test("master/main branch warning is detected", () => {
  assert.equal(isProtectedBranch("main"), true);
  assert.equal(isProtectedBranch("master"), true);
  assert.equal(isProtectedBranch("feature/brainpress"), false);
});

test("duplicate Codex run rejection helper detects running state or lock", () => {
  assert.equal(isRunAlreadyRunning("RunningCodex", false), true);
  assert.equal(isRunAlreadyRunning("Prepared", true), true);
  assert.equal(isRunAlreadyRunning("Prepared", false), false);
});

test("absorb confirmation blocks before diff review", () => {
  assert.equal(
    canAbsorbWithConfirmation({
      diffReviewed: false,
      understandsAbsorb: true,
      verificationPassed: true,
      skippedVerificationReason: "",
    }),
    false,
  );
});

test("absorb without successful verification requires reason", () => {
  const run = createAgentRun({ project: seedProject, memory: seedMemory, outcome: seedOutcome, targetAgent: "Codex" });

  assert.equal(requiresVerificationSkippedReason(run), true);
  assert.equal(
    canAbsorbWithConfirmation({
      diffReviewed: true,
      understandsAbsorb: true,
      verificationPassed: false,
      skippedVerificationReason: "",
    }),
    false,
  );
  assert.equal(
    canAbsorbWithConfirmation({
      diffReviewed: true,
      understandsAbsorb: true,
      verificationPassed: false,
      skippedVerificationReason: "Founder accepted visual-only change.",
    }),
    true,
  );
});

test("critical safety checks block run", () => {
  const project = { ...seedProject, repoPathOrUrl: "https://github.com/example/repo" };
  const run = createAgentRun({ project, memory: seedMemory, outcome: seedOutcome, targetAgent: "Codex" });

  assert.equal(readinessAllowsRun(buildExecutionReadiness(project, run)), false);
});

test("warnings do not block run", () => {
  const project = { ...seedProject, repoPathOrUrl: "C:\\work\\brainpress" };
  const run = {
    ...createAgentRun({ project, memory: seedMemory, outcome: seedOutcome, targetAgent: "Codex" }),
    id: "run_warning",
    codexAvailable: true,
    diskPackagePrepared: true,
    promptPath: getRunPromptPath(project.repoPathOrUrl, "run_warning"),
    isGitRepo: true,
    gitStatusChecked: true,
    gitIsClean: false,
    gitBranch: "feature/brainpress",
    verificationCommands: [],
  };

  assert.equal(readinessAllowsRun(buildExecutionReadiness(project, run)), true);
});

test("timeout handling explains no memory was absorbed", () => {
  assert.match(codexTimeoutFailure(10 * 60 * 1000), /no memory was absorbed/i);
});

test("v3 run event serialization round-trips jsonl events", () => {
  const event = createRunEvent("run_stream", "stdout", { text: "hello" }, "2026-05-11T00:00:00.000Z");
  const parsed = parseRunEvents(serializeRunEvent(event));

  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].type, "stdout");
  assert.equal(parsed[0].payload.text, "hello");
});

test("v3 run log path validation keeps files inside run directory", () => {
  const repoPath = "C:\\work\\brainpress";
  const paths = getRunLogPaths(repoPath, "run_stream");

  assert.equal(validateRunLogPath(repoPath, "run_stream", paths.statePath).ok, true);
  assert.equal(validateRunLogPath(repoPath, "run_stream", "C:\\work\\brainpress\\.brainpress\\other\\run-state.json").ok, false);
});

test("v3 logs missing files behavior returns empty logs with clear message", () => {
  const logs = emptyRunLogs("No persisted logs found yet.");

  assert.equal(logs.stdout, "");
  assert.equal(logs.stderr, "");
  assert.deepEqual(logs.events, []);
  assert.equal(logs.runState, null);
  assert.match(logs.message, /No persisted logs/);
});

test("v3 cancellation route helper is non-fatal when no run exists", async () => {
  const result = await cancelActiveCodexRun("run_missing");

  assert.equal(result.cancelled, false);
  assert.match(result.message, /No active Codex run/);
});

test("v3 status transition helper handles cancelled, timed out, completed, and failed runs", () => {
  assert.equal(statusFromCodexStreamResult({ cancelled: true, timedOut: false, exitCode: 0 }), "Cancelled");
  assert.equal(statusFromCodexStreamResult({ cancelled: false, timedOut: true, exitCode: 124 }), "TimedOut");
  assert.equal(statusFromCodexStreamResult({ cancelled: false, timedOut: false, exitCode: 0 }), "DiffReviewRequired");
  assert.equal(statusFromCodexStreamResult({ cancelled: false, timedOut: false, exitCode: 1 }), "CodexFailed");
});

test("v3 interrupted run helper suggests the right next task", () => {
  assert.equal(
    nextTaskForInterruptedRun("Cancelled", "Improve Dashboard"),
    "Resume or restart cancelled Codex run for Improve Dashboard",
  );
  assert.equal(
    nextTaskForInterruptedRun("TimedOut", "Improve Dashboard"),
    "Continue timed-out Codex run for Improve Dashboard",
  );
});

test("v3 streaming request rejects missing approval", () => {
  const repoPath = "C:\\work\\brainpress";
  const result = validateCodexStreamRequest({
    repoPath,
    runId: "run_stream",
    promptPath: getRunPromptPath(repoPath, "run_stream"),
    approvalConfirmed: false,
  });

  assert.equal(result.ok, false);
  assert.match(result.error || "", /approval/i);
});

test("v3 streaming request rejects invalid prompt path", () => {
  const repoPath = "C:\\work\\brainpress";
  const result = validateCodexStreamRequest({
    repoPath,
    runId: "run_stream",
    promptPath: "C:\\work\\brainpress\\.brainpress\\runs\\other\\prompt.md",
    approvalConfirmed: true,
  });

  assert.equal(result.ok, false);
  assert.match(result.error || "", /promptPath/);
});

test("v3 streaming prompt must include Permission Safety Rules", () => {
  assert.equal(promptContainsPermissionSafetyRules("## Permission Safety Rules\n\n- Work only inside the selected project folder."), true);
  assert.equal(promptContainsPermissionSafetyRules("# Outcome\n\nDo the thing."), false);
});

test("PDF import model creation stores source metadata and pages", () => {
  const source = createProjectImport({
    project: seedProject,
    sourceType: "PDF",
    title: "Investor memo",
    fileName: "memo.pdf",
    fileSize: 2048,
    pageCount: 2,
    extractedText: "Page 1\nDecision: build owner-grade dashboards.",
    extractedPages: [
      { pageNumber: 1, text: "Decision: build owner-grade dashboards." },
      { pageNumber: 2, text: "Next add proactive offer cards." },
    ],
  });

  assert.equal(source.projectId, seedProject.id);
  assert.equal(source.sourceType, "PDF");
  assert.equal(source.fileName, "memo.pdf");
  assert.equal(source.pageCount, 2);
  assert.equal(source.extractedPages[1].pageNumber, 2);
  assert.deepEqual(source.keyFacts, []);
  assert.equal(source.memorySections.productSummary, "");
  assert.equal(source.analyzer, "Local");
});

test("project history parser handles long noisy text", () => {
  const longText = Array.from({ length: 800 }, (_, index) =>
    index % 20 === 0
      ? "Confidential\nDecision: PC usage must remain primary.\nNext add top users leaderboard."
      : "Confidential\nResearch notes about dashboard operations.",
  ).join("\n");
  const analysis = analyzeProjectHistory(longText, {
    project: seedProject,
    currentMemory: seedMemory,
    sourceType: "TextPaste",
    title: "Long project export",
  });

  assert.ok(analysis.cleanedText.length > 0);
  assert.match(analysis.memory.activeDecisions, /PC usage must remain primary/i);
  assert.match(analysis.memory.roadmap, /top users leaderboard/i);
  assert.doesNotMatch(analysis.cleanedText, /Confidential\nConfidential\nConfidential/);
});

test("project history parser extracts decisions, work, issues, roadmap, and architecture", () => {
  const analysis = analyzeProjectHistory(
    [
      "We decided the dashboard should use deterministic intelligence.",
      "Implemented the Next.js route and TypeScript component.",
      "Known issue: empty state is missing.",
      "Future roadmap: add Supabase integration and Postgres schema.",
      "Need to build proactive agent recommendations.",
    ].join("\n"),
    {
      project: seedProject,
      currentMemory: seedMemory,
      sourceType: "PDF",
      title: "Spec",
      fileName: "spec.pdf",
      pageCount: 1,
    },
  );

  assert.match(analysis.detected.decisions.join("\n"), /deterministic intelligence/i);
  assert.match(analysis.detected.completedWork.join("\n"), /Implemented/i);
  assert.match(analysis.detected.knownIssues.join("\n"), /empty state/i);
  assert.match(analysis.detected.roadmap.join("\n"), /proactive agent/i);
  assert.match(analysis.detected.technicalSignals.join("\n"), /Supabase integration/i);
  assert.match(analysis.memorySections.technicalArchitecture.join("\n"), /Supabase integration/i);
  assert.ok(analysis.keyFacts.length > 0);
  assert.ok(analysis.analysisBullets.length >= 5);
});

test("PDF history analysis preserves raw text but keeps visible memory concise", () => {
  const rawLongSource = [
    "Decision: The app must keep Brainpress PDF Intake focused on project memory.",
    "src/app/page.tsx exists and npm run build passed.",
    "Known issue: Vercel still shows 404 because the wrong folder may be deployed.",
    "Next add a clean PDF review that hides raw extracted text by default.",
    "Technical architecture: Next.js App Router, TypeScript, Tailwind, localStorage.",
    ...Array.from({ length: 180 }, (_, index) => `Repeated transcript filler ${index}: this paragraph is useful as raw source but should not become a memory card.`),
  ].join("\n");

  const analysis = analyzeProjectHistory(rawLongSource, {
    project: seedProject,
    currentMemory: seedMemory,
    sourceType: "PDF",
    title: "Long PDF",
    fileName: "long.pdf",
    pageCount: 12,
  });

  assert.ok(analysis.source.extractedText.includes("Repeated transcript filler 179"));
  assert.ok(analysis.previewText.length < analysis.source.extractedText.length);
  assert.ok(analysis.previewText.length <= 1_100);
  assert.ok(analysis.analysisBullets.length >= 5);
  assert.match(analysis.analysisSummary, /Source analyzed/i);
  assert.ok(analysis.keyFacts.some((fact) => /src\/app\/page\.tsx|npm run build/i.test(fact)));
  assert.ok(analysis.memorySections.activeDecisions.length <= 10);
  assert.ok(analysis.memorySections.knownIssues.length <= 10);
  assert.ok(analysis.memorySections.roadmap.length <= 10);
  assert.ok(
    [
      ...analysis.memorySections.activeDecisions,
      ...analysis.memorySections.knownIssues,
      ...analysis.memorySections.roadmap,
      ...analysis.memorySections.technicalArchitecture,
    ].every((line) => line.length <= 193),
  );
});

test("one-line PDF extraction keeps late file paths, commands, decisions, errors, and next steps", () => {
  const filler = "background project transcript ".repeat(80);
  const oneLinePdfText = [
    filler,
    "Decision: must keep src/app/autobiography/page.tsx available in production.",
    filler,
    "Error: npm run build failed while checking src/lib/actions.ts.",
    filler,
    "Next run git status --short and add the missing admin/document-intake route.",
  ].join(" ");

  const analysis = analyzeProjectHistory(oneLinePdfText, {
    project: seedProject,
    currentMemory: seedMemory,
    sourceType: "PDF",
    title: "One-line export",
    fileName: "one-line.pdf",
    pageCount: 1,
  });

  assert.match(analysis.memorySections.activeDecisions.join("\n"), /src\/app\/autobiography\/page\.tsx/i);
  assert.match(analysis.memorySections.knownIssues.join("\n"), /npm run build failed/i);
  assert.match(analysis.memorySections.roadmap.join("\n"), /git status --short|admin\/document-intake/i);
  assert.ok(analysis.keyFacts.some((fact) => /src\/lib\/actions\.ts|src\/app\/autobiography\/page\.tsx/i.test(fact)));
});

test("OpenAI PDF memory analysis falls back when OPENAI_API_KEY is missing", async () => {
  const analysis = await analyzeProjectHistoryWithOptionalOpenAI(
    "Decision: must keep raw PDF text available.\nNext create a founder-friendly PDF review.",
    {
      project: seedProject,
      currentMemory: seedMemory,
      sourceType: "PDF",
      title: "Missing key PDF",
      fileName: "missing-key.pdf",
      pageCount: 1,
    },
    { env: { OPENAI_API_KEY: "" } },
  );

  assert.equal(analysis.analyzer, "AIUnavailable");
  assert.equal(analysis.source.analyzer, "AIUnavailable");
  assert.match(analysis.warnings.join("\n"), /OPENAI_API_KEY/i);
  assert.match(analysis.source.extractedText, /raw PDF text/);
});

test("OpenAI PDF memory analysis success path uses mocked structured response", async () => {
  let requestBody = "";
  const mockResponse = {
    analysisSummary: "This PDF explains that Brainpress imports PDFs and turns them into clear project memory.",
    plainEnglishSummary: "The project is working, but PDF review needs to be easier for founders to understand.",
    productSummary: "Brainpress helps founders turn product history into clear memory and next outcomes.",
    currentBuildState: ["PDF extraction works.", "The review UI now separates summary from raw source."],
    technicalArchitecture: ["Next.js App Router with localStorage-backed Brainpress state."],
    activeDecisions: ["Raw source should stay available but not be the main memory view."],
    completedWork: ["PDF extraction and local analysis are implemented."],
    knownIssues: ["Local analysis can still include noisy technical fragments."],
    openQuestions: ["Should OCR be added later for scanned PDFs?"],
    roadmap: ["Add optional AI analysis for cleaner founder review."],
    nextRecommendedOutcome: {
      title: "Make PDF review founder-friendly",
      description: "Use AI analysis to produce concise memory sections and a suggested next outcome.",
      acceptanceChecks: ["Plain English summary exists.", "Raw source remains collapsed.", "Local fallback still works."],
    },
    keyFacts: ["OPENAI_API_KEY is read server-side only.", "Raw extracted text remains stored as source."],
    discardedNoise: ["Repeated commands", "Broken transcript fragments"],
  };
  const fetcher: typeof fetch = async (_url, init) => {
    requestBody = String(init?.body || "");
    return new Response(JSON.stringify({ output_text: JSON.stringify(mockResponse) }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  const analysis = await analyzeProjectHistoryWithOptionalOpenAI(
    "Decision: raw source should stay available.\nIssue: local analysis is noisy.\nNext add AI analysis.",
    {
      project: seedProject,
      currentMemory: seedMemory,
      sourceType: "PDF",
      title: "AI PDF",
      fileName: "ai.pdf",
      pageCount: 2,
    },
    { env: { OPENAI_API_KEY: "sk-test" }, fetcher },
  );

  assert.equal(analysis.analyzer, "AI");
  assert.equal(analysis.source.analyzer, "AI");
  assert.match(requestBody, /json_schema/);
  assert.doesNotMatch(requestBody, /sk-test/);
  assert.match(analysis.plainEnglishSummary, /founders/i);
  assert.match(analysis.memorySections.knownIssues.join("\n"), /noisy technical fragments/i);
  assert.equal(analysis.suggestedOutcomes[0].title, "Make PDF review founder-friendly");
  assert.match(analysis.source.extractedText, /raw source should stay available/i);
});

test("invalid OpenAI PDF memory response falls back to local analysis", async () => {
  const fetcher: typeof fetch = async () =>
    new Response(JSON.stringify({ output_text: JSON.stringify({ analysisSummary: 42 }) }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  const analysis = await analyzeProjectHistoryWithOptionalOpenAI(
    "Decision: keep PDF imports safe.\nNext improve review mode.",
    {
      project: seedProject,
      currentMemory: seedMemory,
      sourceType: "PDF",
      title: "Invalid AI PDF",
      fileName: "invalid-ai.pdf",
      pageCount: 1,
    },
    { env: { OPENAI_API_KEY: "sk-test" }, fetcher },
  );

  assert.equal(analysis.analyzer, "AIUnavailable");
  assert.match(analysis.warnings.join("\n"), /invalid JSON/i);
  assert.match(analysis.memorySections.activeDecisions.join("\n"), /keep PDF imports safe/i);
});

test("OpenAI analyzer validates and dedupes concise memory arrays", async () => {
  const result = await requestOpenAIMemoryAnalysis(
    {
      projectName: seedProject.name,
      projectGoal: seedProject.primaryGoal,
      sourceTitle: "Noisy PDF",
      extractedText: "Noisy PDF",
    },
    {
      env: { OPENAI_API_KEY: "sk-test" },
      fetcher: async () =>
        new Response(
          JSON.stringify({
            output_text: JSON.stringify({
              analysisSummary: "Clear summary.",
              plainEnglishSummary: "Plain summary.",
              productSummary: "Product summary.",
              currentBuildState: ["Done", "Done", "Also done", "Third", "Fourth", "Fifth", "Sixth", "Seventh"],
              technicalArchitecture: ["Next.js", "Next.js"],
              activeDecisions: ["Keep raw source collapsed", "Keep raw source collapsed"],
              completedWork: [],
              knownIssues: [],
              openQuestions: [],
              roadmap: [],
              nextRecommendedOutcome: {
                title: "Review PDF memory",
                description: "Make import review clearer.",
                acceptanceChecks: ["Summary exists"],
              },
              keyFacts: ["Fact", "Fact"],
              discardedNoise: ["duplicate URL", "duplicate URL"],
            }),
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    },
  );

  assert.equal(result.status, "success");
  if (result.status === "success") {
    assert.deepEqual(result.analysis.currentBuildState, ["Done", "Also done", "Third", "Fourth", "Fifth", "Sixth"]);
    assert.deepEqual(result.analysis.technicalArchitecture, ["Next.js"]);
    assert.deepEqual(result.analysis.discardedNoise, ["duplicate URL"]);
  }
});

test("OpenAI analyzer truncates large PDF text before sending request body", async () => {
  let requestBody = "";
  const tailMarker = "TAIL_MARKER_SHOULD_NOT_BE_SENT";
  const longText = `${"A".repeat(maxOpenAIInputCharacters + 2_000)}${tailMarker}`;
  const fetcher: typeof fetch = async (_url, init) => {
    requestBody = String(init?.body || "");
    return new Response(
      JSON.stringify({
        output_text: JSON.stringify({
          analysisSummary: "Clear summary.",
          plainEnglishSummary: "Plain summary.",
          productSummary: "Product summary.",
          currentBuildState: [],
          technicalArchitecture: [],
          activeDecisions: [],
          completedWork: [],
          knownIssues: [],
          openQuestions: ["The source was truncated for safe analysis."],
          roadmap: [],
          nextRecommendedOutcome: {
            title: "Review truncated source",
            description: "Confirm whether later PDF pages contain important decisions.",
            acceptanceChecks: ["Open question is captured."],
          },
          keyFacts: [],
          discardedNoise: [],
        }),
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };

  const result = await requestOpenAIMemoryAnalysis(
    {
      projectName: seedProject.name,
      projectGoal: seedProject.primaryGoal,
      sourceTitle: "Large PDF",
      extractedText: longText,
    },
    { env: { OPENAI_API_KEY: "sk-test" }, fetcher },
  );

  assert.equal(result.status, "success");
  assert.equal(requestBody.includes(tailMarker), false);
  assert.match(requestBody, /first safe chunk/i);
});

test("OpenAI request failure warning does not expose raw provider response", async () => {
  const result = await requestOpenAIMemoryAnalysis(
    {
      projectName: seedProject.name,
      projectGoal: seedProject.primaryGoal,
      sourceTitle: "Failing PDF",
      extractedText: "PDF text",
    },
    {
      env: { OPENAI_API_KEY: "sk-test" },
      fetcher: async () =>
        new Response("provider stack trace with prompt echo", {
          status: 500,
        }),
    },
  );

  assert.equal(result.status, "request_failed");
  if (result.status === "request_failed") {
    assert.match(result.warning, /500/);
    assert.doesNotMatch(result.warning, /provider stack trace|prompt echo/i);
  }
});

test("long PDF memory sections are capped instead of showing raw extracted blocks", () => {
  const text = Array.from({ length: 30 }, (_, index) =>
    [
      `Decision: must keep owner-grade workflow ${index}.`,
      `Issue: missing polished state ${index}.`,
      `Next build verification-ready outcome ${index}.`,
      `Technical architecture: src/app/feature-${index}/page.tsx route uses TypeScript components.`,
    ].join("\n"),
  ).join("\n");
  const analysis = analyzeProjectHistory(text, {
    project: seedProject,
    currentMemory: seedMemory,
    sourceType: "PDF",
    title: "Large spec",
    fileName: "large-spec.pdf",
    pageCount: 24,
  });

  assert.equal(analysis.memorySections.activeDecisions.length, 10);
  assert.equal(analysis.memorySections.knownIssues.length, 10);
  assert.equal(analysis.memorySections.roadmap.length, 10);
  assert.equal(analysis.memorySections.technicalArchitecture.length, 10);
  assert.ok(analysis.suggestedOutcomes.length >= 3);
});

test("legacy raw imports load with fallback project-memory analysis fields", () => {
  const previousWindow = Reflect.get(globalThis, "window");
  const store = new Map<string, string>();
  const fakeWindow = {
    localStorage: {
      getItem: (key: string) => store.get(key) || null,
      setItem: (key: string, value: string) => store.set(key, value),
      removeItem: (key: string) => store.delete(key),
      clear: () => store.clear(),
    },
  };
  const rawText = "Page 1\nDecision: preserve raw source text.\nNext add cleaner PDF review.";

  Reflect.set(globalThis, "window", fakeWindow);
  try {
    store.set(
      "brainpress.mvp.state.v1",
      JSON.stringify({
        ...initialState,
        imports: [
          {
            id: "legacy_import",
            projectId: seedProject.id,
            sourceType: "PDF",
            title: "Legacy PDF",
            fileName: "legacy.pdf",
            pageCount: 1,
            extractedText: rawText,
            extractedPages: [{ pageNumber: 1, text: rawText }],
            detectedThemes: ["route"],
            analysisSummary: "Legacy summary",
            suggestedOutcomes: [],
            createdAt: "2026-05-11T00:00:00.000Z",
          },
        ],
      }),
    );

    const state = loadBrainpressState();
    const source = state.imports[0];

    assert.equal(source.id, "legacy_import");
    assert.equal(source.extractedText, rawText);
    assert.deepEqual(source.analysisBullets, []);
    assert.deepEqual(source.keyFacts, []);
    assert.deepEqual(source.memorySections.activeDecisions, []);
    assert.equal(source.memorySections.productSummary, "");
  } finally {
    if (typeof previousWindow === "undefined") {
      Reflect.deleteProperty(globalThis, "window");
    } else {
      Reflect.set(globalThis, "window", previousWindow);
    }
  }
});

test("memory merge appends imported sections without replacing existing summary by default", () => {
  const analysis = analyzeProjectHistory("Decision: Must show top users.\nCompleted: added trend chart.\nIssue: missing loading state.", {
    project: seedProject,
    currentMemory: seedMemory,
    sourceType: "TextPaste",
    title: "Agent report",
  });
  const merged = mergeMemoryWithProjectHistory(seedMemory, analysis);

  assert.equal(merged.productSummary, seedMemory.productSummary);
  assert.match(merged.activeDecisions, /Must show top users/i);
  assert.match(merged.completedWork, /added trend chart/i);
  assert.match(merged.knownIssues, /missing loading state/i);
});

test("deduplication helper removes repeated imported lines", () => {
  assert.deepEqual(dedupe(["Add dashboard", "add dashboard", "Fix chart"]), ["Add dashboard", "Fix chart"]);
});

test("suggested outcomes are generated from imported content", () => {
  const analysis = analyzeProjectHistory("Issue: dashboard empty states are missing.\nNext add last 7 days chart.\nNext add top users.", {
    project: seedProject,
    currentMemory: seedMemory,
    sourceType: "PDF",
    title: "Roadmap PDF",
    fileName: "roadmap.pdf",
    pageCount: 3,
  });

  assert.ok(analysis.suggestedOutcomes.length >= 3);
  assert.match(analysis.suggestedOutcomes.map((outcome) => outcome.title).join("\n"), /dashboard empty states|last 7 days|known issues/i);
  assert.deepEqual(analysis.suggestedOutcomes[0].verificationCommands, seedProject.verificationCommands);
});

test("multiple PDF sources consolidate into one roadmap dashboard", () => {
  const older = analyzeProjectHistory("Completed: added PDF extraction.\nNext add local memory cards.", {
    project: seedProject,
    currentMemory: seedMemory,
    sourceType: "PDF",
    title: "Older chat",
    fileName: "older.pdf",
    pageCount: 2,
  }).source;
  const newer = analyzeProjectHistory("Completed: added PDF extraction.\nIssue: build route is broken.\nNext rebuild project memory from all sources.", {
    project: seedProject,
    currentMemory: seedMemory,
    sourceType: "PDF",
    title: "Newer chat",
    fileName: "newer.pdf",
    pageCount: 3,
  }).source;
  const sources = [
    { ...older, createdAt: "2026-05-10T00:00:00.000Z" },
    { ...newer, createdAt: "2026-05-11T00:00:00.000Z" },
  ];

  const dashboard = buildConsolidatedProjectMemory(seedProject, seedMemory, sources);

  assert.equal(dashboard.sourceCount, 2);
  assert.deepEqual(dashboard.sourceIds, [newer.id, older.id]);
  assert.equal(dashboard.whatIsDone.filter((item) => /PDF extraction/i.test(item)).length, 1);
  assert.match(dashboard.whatIsBrokenOrRisky.join("\n"), /build route is broken/i);
  assert.match(dashboard.whatToDoNext[0], /matters because/i);
  assert.match(dashboard.roadmapNow.join("\n"), /rebuild project memory|build route/i);
});

test("saving a new PDF can merge memory and preserve raw source separately", () => {
  const first = analyzeProjectHistory("Completed: added source list.\nNext add roadmap dashboard.", {
    project: seedProject,
    currentMemory: seedMemory,
    sourceType: "PDF",
    title: "First PDF",
    fileName: "first.pdf",
    pageCount: 1,
  });
  const second = analyzeProjectHistory("Completed: added source list.\nIssue: source list repeats source list.\nNext add roadmap dashboard.", {
    project: seedProject,
    currentMemory: seedMemory,
    sourceType: "PDF",
    title: "Second PDF",
    fileName: "second.pdf",
    pageCount: 1,
  });
  const mergedOnce = mergeMemoryWithProjectHistory(seedMemory, first);
  const mergedTwice = mergeMemoryWithProjectHistory(mergedOnce, second);
  const dashboard = buildConsolidatedProjectMemory(seedProject, mergedTwice, [first.source, second.source]);
  const consolidatedMemory = memoryFromConsolidatedProjectMemory(mergedTwice, dashboard);

  assert.equal([first.source, second.source].every((source) => source.extractedText.length > 0), true);
  assert.equal(dashboard.whatIsDone.filter((item) => /source list/i.test(item)).length, 1);
  assert.ok(consolidatedMemory.consolidated);
  assert.match(consolidatedMemory.roadmap, /roadmap dashboard/i);
});

test("saving first and second PDFs appends separate saved sources", () => {
  const first = analyzeProjectHistory("Completed: imported first chat.\nDecision: keep first source metadata.\nNext build memory dashboard.", {
    project: seedProject,
    currentMemory: seedMemory,
    sourceType: "PDF",
    title: "Chat export",
    fileName: "chat.pdf",
    pageCount: 1,
  }).source;
  const second = analyzeProjectHistory("Completed: imported second chat.\nIssue: previous PDF was replaced.\nNext verify multi source rebuild.", {
    project: seedProject,
    currentMemory: seedMemory,
    sourceType: "PDF",
    title: "Chat export",
    fileName: "chat.pdf",
    pageCount: 2,
  }).source;
  const firstSave = appendProjectImport([], first, { now: "2026-05-11T00:00:00.000Z" });
  const secondSave = appendProjectImport(firstSave.imports, second, { now: "2026-05-11T00:01:00.000Z" });

  assert.equal(secondSave.imports.length, 2);
  assert.notEqual(secondSave.imports[0].id, secondSave.imports[1].id);
  assert.equal(secondSave.imports[0].fileName, "chat.pdf");
  assert.equal(secondSave.imports[1].fileName, "chat.pdf");
  assert.match(secondSave.imports[0].extractedText, /second chat/i);
  assert.match(secondSave.imports[1].extractedText, /first chat/i);
  assert.equal(secondSave.imports[1].title, "Chat export");
  assert.equal(secondSave.imports[1].analyzer, "Local");
  assert.match(secondSave.imports[1].plainEnglishSummary, /first chat|project history/i);
  assert.match(secondSave.imports[1].analysisSummary, /first chat|memory/i);
  assert.match(secondSave.imports[1].memorySections.activeDecisions.join("\n"), /keep first source metadata/i);
  assert.match(secondSave.imports[0].memorySections.knownIssues.join("\n"), /previous PDF was replaced/i);
});

test("Save to Memory UI helper appends a second pending PDF with a fresh source id", () => {
  const firstAnalysis = analyzeProjectHistory("Completed: browser flow saved PDF one.\nNext add second upload.", {
    project: seedProject,
    currentMemory: seedMemory,
    sourceType: "PDF",
    title: "same-name",
    fileName: "same-name.pdf",
    pageCount: 1,
  });
  const firstSave = savePendingImportToProjectMemory({
    project: seedProject,
    currentMemory: seedMemory,
    currentImports: [],
    analysis: { ...firstAnalysis, source: { ...firstAnalysis.source, id: "pending_review" } },
  });
  const secondAnalysis = analyzeProjectHistory("Completed: browser flow saved PDF two.\nIssue: source one must stay.", {
    project: seedProject,
    currentMemory: firstSave.memory,
    sourceType: "PDF",
    title: "same-name",
    fileName: "same-name.pdf",
    pageCount: 1,
  });
  const secondSave = savePendingImportToProjectMemory({
    project: seedProject,
    currentMemory: firstSave.memory,
    currentImports: firstSave.imports,
    analysis: { ...secondAnalysis, source: { ...secondAnalysis.source, id: "pending_review" } },
  });

  assert.equal(secondSave.imports.length, 2);
  assert.notEqual(secondSave.imports[0].id, secondSave.imports[1].id);
  assert.equal(secondSave.imports[0].fileName, "same-name.pdf");
  assert.equal(secondSave.imports[1].fileName, "same-name.pdf");
  assert.match(secondSave.imports[0].extractedText, /PDF two/i);
  assert.match(secondSave.imports[1].extractedText, /PDF one/i);
  assert.equal(secondSave.memory.consolidated?.sourceCount, 2);
  assert.match(secondSave.memory.consolidated?.whatIsDone.join("\n") || "", /PDF one/i);
  assert.match(secondSave.memory.consolidated?.whatIsDone.join("\n") || "", /PDF two/i);
});

test("Save as Source Only UI helper appends without counting a pending review", () => {
  const saved = analyzeProjectHistory("Completed: source-only one remains saved.", {
    project: seedProject,
    currentMemory: seedMemory,
    sourceType: "PDF",
    title: "Source only",
    fileName: "same-name.pdf",
    pageCount: 1,
  });
  const pending = analyzeProjectHistory("Completed: pending source-only two.", {
    project: seedProject,
    currentMemory: seedMemory,
    sourceType: "PDF",
    title: "Source only",
    fileName: "same-name.pdf",
    pageCount: 1,
  });
  const first = savePendingImportSourceOnly({ currentImports: [], analysis: saved });
  const second = savePendingImportSourceOnly({ currentImports: first.imports, analysis: pending });

  assert.equal(first.imports.length, 1);
  assert.equal(second.imports.length, 2);
  assert.notEqual(second.imports[0].id, second.imports[1].id);
  assert.equal(getMemoryTabMode(seedMemory, pending), "review");
  assert.equal(savedSourcesLabel(second.imports.length), "2 эх сурвалж хадгалагдсан / 2 sources saved");
});

test("legacy duplicate import ids are normalized instead of collapsing saved PDFs", () => {
  const previousWindow = Reflect.get(globalThis, "window");
  const store = new Map<string, string>();
  const fakeWindow = {
    localStorage: {
      getItem: (key: string) => store.get(key) || null,
      setItem: (key: string, value: string) => store.set(key, value),
      removeItem: (key: string) => store.delete(key),
      clear: () => store.clear(),
    },
  };

  Reflect.set(globalThis, "window", fakeWindow);
  try {
    store.set(
      "brainpress.mvp.state.v1",
      JSON.stringify({
        ...initialState,
        imports: [
          {
            id: "duplicate_import",
            projectId: seedProject.id,
            sourceType: "PDF",
            title: "Same name",
            fileName: "same.pdf",
            extractedText: "Completed: first raw text is preserved.",
            createdAt: "2026-05-11T00:00:00.000Z",
          },
          {
            id: "duplicate_import",
            projectId: seedProject.id,
            sourceType: "PDF",
            title: "Same name",
            fileName: "same.pdf",
            extractedText: "Completed: second raw text is preserved.",
            createdAt: "2026-05-11T00:01:00.000Z",
          },
        ],
      }),
    );

    const state = loadBrainpressState();

    assert.equal(state.imports.length, 2);
    assert.notEqual(state.imports[0].id, state.imports[1].id);
    assert.equal(state.imports[0].fileName, "same.pdf");
    assert.equal(state.imports[1].fileName, "same.pdf");
    assert.match(state.imports[0].extractedText, /first raw text/i);
    assert.match(state.imports[1].extractedText, /second raw text/i);
  } finally {
    if (typeof previousWindow === "undefined") {
      Reflect.deleteProperty(globalThis, "window");
    } else {
      Reflect.set(globalThis, "window", previousWindow);
    }
  }
});

test("legacy Sources panel is archived while saved source labels stay available", () => {
  const componentSource = readFileSync("src/components/brainpress/project-workspace.tsx", "utf8");
  const archiveSource = readFileSync("src/components/brainpress/internal/archived-workspace-surfaces.ts", "utf8");

  assert.match(savedSourcesLabel(2), /2 sources saved/);
  assert.match(archiveSource, /ImportsPanel/);
  assert.doesNotMatch(componentSource, /function ImportsPanel/);
  assert.doesNotMatch(componentSource, /Saved sources:/);
});

test("Save as Source Only appends a source without changing dashboard memory", () => {
  const source = analyzeProjectHistory("Completed: saved as source only.\nNext decide whether to merge it.", {
    project: seedProject,
    currentMemory: seedMemory,
    sourceType: "PDF",
    title: "Source only",
    fileName: "source-only.pdf",
    pageCount: 1,
  }).source;
  const saved = appendProjectImport([], source);

  assert.equal(saved.imports.length, 1);
  assert.match(saved.imports[0].plainEnglishSummary, /saved as source only|source history/i);
  assert.equal(seedMemory.consolidated, undefined);
});

test("re-analyze updates only the selected saved source", () => {
  const first = appendProjectImport([], analyzeProjectHistory("Completed: first source stays.", {
    project: seedProject,
    currentMemory: seedMemory,
    sourceType: "PDF",
    title: "First",
    fileName: "first.pdf",
    pageCount: 1,
  }).source);
  const second = appendProjectImport(first.imports, analyzeProjectHistory("Issue: old second source.", {
    project: seedProject,
    currentMemory: seedMemory,
    sourceType: "PDF",
    title: "Second",
    fileName: "second.pdf",
    pageCount: 1,
  }).source);
  const targetId = second.imports[0].id;
  const updatedAnalysis = analyzeProjectHistory("Issue: updated second source only.\nNext rebuild memory.", {
    project: seedProject,
    currentMemory: seedMemory,
    sourceType: "PDF",
    title: "Second",
    fileName: "second.pdf",
    pageCount: 1,
  }).source;
  const updated = updateProjectImport(second.imports, targetId, updatedAnalysis);

  assert.equal(updated.imports.length, 2);
  assert.equal(updated.imports[0].id, targetId);
  assert.match(updated.imports[0].extractedText, /updated second source only/i);
  assert.match(updated.imports[1].extractedText, /first source stays/i);
});

test("saving a re-analyzed source as new source appends instead of replacing original", () => {
  const original = appendProjectImport([], analyzeProjectHistory("Completed: original PDF remains saved.", {
    project: seedProject,
    currentMemory: seedMemory,
    sourceType: "PDF",
    title: "Same report",
    fileName: "same.pdf",
    pageCount: 1,
  }).source);
  const reanalysis = analyzeProjectHistory("Completed: re-analyzed PDF saved as a new source.", {
    project: seedProject,
    currentMemory: seedMemory,
    sourceType: "PDF",
    title: "Same report",
    fileName: "same.pdf",
    pageCount: 1,
  }).source;
  const savedAsNew = appendProjectImport(original.imports, reanalysis);

  assert.equal(savedAsNew.imports.length, 2);
  assert.notEqual(savedAsNew.imports[0].id, original.source.id);
  assert.equal(savedAsNew.imports[0].fileName, savedAsNew.imports[1].fileName);
  assert.match(savedAsNew.imports[0].extractedText, /re-analyzed PDF saved as a new source/i);
  assert.match(savedAsNew.imports[1].extractedText, /original PDF remains saved/i);
});

test("source count and rebuild use saved sources only, excluding pending review", () => {
  const saved = appendProjectImport([], analyzeProjectHistory("Completed: saved PDF source.", {
    project: seedProject,
    currentMemory: seedMemory,
    sourceType: "PDF",
    title: "Saved",
    fileName: "saved.pdf",
    pageCount: 1,
  }).source);
  const pending = analyzeProjectHistory("Completed: pending PDF source should not count yet.", {
    project: seedProject,
    currentMemory: seedMemory,
    sourceType: "PDF",
    title: "Pending",
    fileName: "pending.pdf",
    pageCount: 1,
  });
  const dashboard = buildConsolidatedProjectMemory(seedProject, seedMemory, saved.imports);

  assert.equal(getMemoryTabMode(seedMemory, pending), "review");
  assert.equal(dashboard.sourceCount, 1);
  assert.match(dashboard.whatIsDone.join("\n"), /saved PDF source/i);
  assert.doesNotMatch(dashboard.whatIsDone.join("\n"), /pending PDF source/i);
});

test("newer source is preferred for current roadmap ordering", () => {
  const older = createProjectImport({
    project: seedProject,
    sourceType: "PDF",
    title: "Older",
    fileName: "older.pdf",
    extractedText: "Next add old onboarding page.",
    memorySections: {
      productSummary: "",
      currentBuildState: "",
      technicalArchitecture: [],
      activeDecisions: [],
      completedWork: [],
      knownIssues: [],
      openQuestions: [],
      roadmap: ["Add old onboarding page."],
    },
  });
  const newer = {
    ...createProjectImport({
      project: seedProject,
      sourceType: "PDF",
      title: "Newer",
      fileName: "newer.pdf",
      extractedText: "Next fix production deploy.",
      memorySections: {
        productSummary: "",
        currentBuildState: "",
        technicalArchitecture: [],
        activeDecisions: [],
        completedWork: [],
        knownIssues: [],
        openQuestions: [],
        roadmap: ["Fix production deploy."],
      },
    }),
    createdAt: "2026-05-11T00:00:00.000Z",
  };
  const olderDated = { ...older, createdAt: "2026-05-10T00:00:00.000Z" };

  const dashboard = buildConsolidatedProjectMemory(seedProject, seedMemory, [olderDated, newer]);

  assert.match(dashboard.whatToDoNext[0], /Fix production deploy/i);
});

test("empty memory cards are hidden and technical details are collapsed by default", () => {
  const cards = getVisibleMemoryCards({
    projectId: seedProject.id,
    productSummary: "Clear product summary.",
    vision: "",
    targetUsers: "",
    currentBuildState: "",
    technicalArchitecture: "- Next.js App Router.",
    activeDecisions: "",
    deprecatedIdeas: "",
    completedWork: "",
    openQuestions: "",
    knownIssues: "",
    roadmap: "",
  });

  assert.deepEqual(cards.map((card) => card.key), ["productSummary", "technicalArchitecture"]);
  assert.equal(cards.find((card) => card.key === "technicalArchitecture")?.collapsed, true);
  assert.equal(cards.some((card) => card.key === "deprecatedIdeas"), false);
});

test("empty project memory uses empty mode instead of a fake roadmap dashboard", () => {
  const project = createBlankProject("2026-05-11T00:00:00.000Z");
  const emptyMemory = {
    ...seedMemory,
    projectId: project.id,
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
    consolidated: undefined,
  };
  const dashboard = buildConsolidatedProjectMemory(project, emptyMemory, []);

  assert.equal(hasUsableProjectMemory(emptyMemory), false);
  assert.equal(getMemoryTabMode(emptyMemory, null), "empty");
  assert.equal(dashboardHasContent(dashboard), false);
  assert.equal(dashboard.productSnapshot, "");
  assert.equal(dashboard.plainEnglishSummary, "");
  assert.equal(dashboard.suggestedNextOutcome, null);
  assert.doesNotMatch(JSON.stringify(dashboard), /Outcome-managed AI build workspace|Define a clear product outcome/i);
});

test("unsaved PDF analysis switches Memory tab into review mode and hides the saved dashboard", () => {
  const analysis = analyzeProjectHistory("Completed: PDF review works.\nNext save this analysis to memory.", {
    project: seedProject,
    currentMemory: seedMemory,
    sourceType: "PDF",
    title: "Unsaved PDF",
    fileName: "unsaved.pdf",
    pageCount: 2,
  });

  assert.equal(getMemoryTabMode(seedMemory, analysis), "review");
  assert.ok(analysis.source.extractedText.includes("PDF review works"));
});

test("saving PDF analysis updates dashboard source count and clears review mode", () => {
  const analysis = analyzeProjectHistory("Completed: dashboard now uses saved memory.\nIssue: stale default copy appeared.\nNext remove duplicate review surfaces.", {
    project: seedProject,
    currentMemory: seedMemory,
    sourceType: "PDF",
    title: "Saved PDF",
    fileName: "saved.pdf",
    pageCount: 3,
  });
  const merged = mergeMemoryWithProjectHistory(seedMemory, analysis);
  const dashboard = buildConsolidatedProjectMemory(seedProject, merged, [analysis.source]);
  const savedMemory = memoryFromConsolidatedProjectMemory(merged, dashboard);

  assert.equal(getMemoryTabMode(savedMemory, null), "dashboard");
  assert.equal(savedMemory.consolidated?.sourceCount, 1);
  assert.match(savedMemory.consolidated?.whatIsDone.join("\n") || "", /dashboard now uses saved memory/i);
  assert.match(savedMemory.consolidated?.whatIsBrokenOrRisky.join("\n") || "", /stale default copy/i);
});

test("Memory UI does not repeat stale filler copy in cards", () => {
  const componentSource = readFileSync("src/components/brainpress/project-workspace.tsx", "utf8");

  assert.doesNotMatch(componentSource, /No strong signal detected/);
});

test("Service workspace exposes Service Overview, Agent Team, ServiceWindow, Think, Build, and Run", () => {
  const componentSource = readFileSync("src/components/brainpress/project-workspace.tsx", "utf8");
  const thinkSource = readFileSync("src/components/brainpress/think-workspace.tsx", "utf8");
  const homeSource = readFileSync("app/page.tsx", "utf8");
  const buildSection = sourceBetween(componentSource, "function DevelopmentTasksTab", "function DevelopmentTaskDetail");
  const taskDetailSection = sourceBetween(componentSource, "function DevelopmentTaskDetail", "function DispatchOptionCard");

  assert.match(componentSource, /const tabs = \["Overview", "Agent Team", "ServiceWindow", "Think", "Build", "Run"\] as const/);
  assert.match(componentSource, /useState<Tab>\("Overview"\)/);
  assert.match(componentSource, /ServiceOverviewTab/);
  assert.match(componentSource, /AgentTeamTab/);
  assert.match(componentSource, /ServiceWindowTab/);
  assert.match(componentSource, /Agent-native Service/);
  assert.match(componentSource, /Run Design Agent/);
  assert.match(componentSource, /No premium service UI designed yet/);
  assert.match(componentSource, /UX Strategy/);
  assert.match(componentSource, /Screen Map/);
  assert.match(componentSource, /Visual System/);
  assert.match(componentSource, /Component System/);
  assert.match(componentSource, /Export Codex Build Prompt/);
  assert.match(thinkSource, /Agent Development Agent/);
  assert.match(thinkSource, /Co-think the Service before Codex builds it/);
  assert.match(thinkSource, /Dynamic Canvas/);
  assert.match(thinkSource, /No canvases yet/);
  assert.match(thinkSource, /Let Brainpress organize this/);
  assert.match(thinkSource, /Ask Brainpress about your service idea/);
  assert.match(thinkSource, /ThinkChatMessage/);
  assert.match(thinkSource, /Brainpress is thinking through the service direction/);
  assert.match(thinkSource, /I shaped this into a service direction/);
  assert.match(thinkSource, /I also updated the Dynamic Canvas with the artifacts this idea needs right now/);
  assert.match(thinkSource, /I couldn't complete that Think session/);
  assert.match(thinkSource, /Clarify idea/);
  assert.match(thinkSource, /Define MVP/);
  assert.match(thinkSource, /Create service spec/);
  assert.match(thinkSource, /Plan build path/);
  assert.match(thinkSource, /Analyze risk/);
  assert.match(thinkSource, /Service brief/);
  assert.match(thinkSource, /Build path/);
  assert.match(thinkSource, /Describe the service you want to create/);
  assert.match(thinkSource, /Co-think with Brainpress to generate the right artifacts/);
  assert.match(thinkSource, /ThinkingArtifactCard/);
  assert.match(thinkSource, /formatCanvasType/);
  assert.match(thinkSource, /Generate Service Blueprint/);
  assert.match(thinkSource, /Generate Build Plan/);
  assert.match(thinkSource, /Live AI/);
  assert.match(thinkSource, /Local fallback/);
  assert.doesNotMatch(thinkSource, /Service UI Example Window/);
  assert.doesNotMatch(thinkSource, /Agent-built preview page/);
  assert.doesNotMatch(thinkSource, /Product UI/);
  assert.doesNotMatch(thinkSource, /Center Column/);
  assert.doesNotMatch(thinkSource, /Service Capabilities will appear as the spec becomes clearer/);
  assert.doesNotMatch(thinkSource, /What are we trying to figure out\?/);
  assert.doesNotMatch(thinkSource, /Co-create artifacts/);
  assert.doesNotMatch(thinkSource, /Generated product direction/);
  assert.match(buildSection, /AI Build Agent/);
  assert.match(buildSection, /Task Execution Canvas/);
  assert.match(buildSection, /Generate Plan \+ Tasks/);
  assert.match(buildSection, /Chat \/ Tasks/);
  assert.match(buildSection, /Canvas \/ Detail/);
  assert.match(buildSection, /Human approval/);
  assert.match(taskDetailSection, /Local Bridge/);
  assert.match(taskDetailSection, /Desktop only/);
  assert.match(taskDetailSection, /GitHub Dispatch/);
  assert.match(taskDetailSection, /Best for phone/);
  assert.match(taskDetailSection, /Codex Cloud/);
  assert.match(taskDetailSection, /Use Codex web\/iOS or GitHub @codex/);
  assert.match(taskDetailSection, /Copy GitHub Issue Body/);
  assert.match(taskDetailSection, /Create GitHub Issue/);
  assert.match(homeSource, /ServicesDashboard/);
  assert.doesNotMatch(componentSource, /Dev Agent Inbox/);
  assert.doesNotMatch(componentSource, /const tabs = .*"Memory".*"Agent Runs"/);
  assert.doesNotMatch(thinkSource, /Import Project History|Upload PDF|Sources|Workspace settings|Project Roadmap Dashboard/);
  assert.doesNotMatch(buildSection, /Import Project History|Upload PDF|Sources|Founder Memory|Project Roadmap Dashboard/);
});

test("Brainpress workspace list keys include context and index instead of raw duplicated text", () => {
  const workspaceSource = readFileSync("src/components/brainpress/project-workspace.tsx", "utf8");
  const thinkSource = readFileSync("src/components/brainpress/think-workspace.tsx", "utf8");
  const agentRunsSource = readFileSync("src/components/brainpress/agent-runs-tab.tsx", "utf8");
  const combined = `${workspaceSource}\n${thinkSource}\n${agentRunsSource}`;

  assert.doesNotMatch(combined, /key=\{item\}/);
  assert.doesNotMatch(combined, /key=\{command\}/);
  assert.doesNotMatch(combined, /key=\{step\}/);
  assert.doesNotMatch(combined, /key=\{action\}/);
  assert.doesNotMatch(combined, /key=\{title\}/);
  assert.doesNotMatch(combined, /key=\{result\.command\}/);
  assert.match(workspaceSource, /summary-list-\$\{title\}-\$\{index\}/);
  assert.match(thinkSource, /compact-list-\$\{label\}-\$\{index\}/);
  assert.match(thinkSource, /think-chat-message-\$\{index\}-\$\{message\.id\}/);
  assert.match(workspaceSource, /criteria-review-\$\{index\}-\$\{review\.status\}/);
  assert.match(agentRunsSource, /verification-command-\$\{selectedRun\.id\}-\$\{index\}/);
});

test("Run workspace is service operations, not old memory or source intake UI", () => {
  const componentSource = readFileSync("src/components/brainpress/project-workspace.tsx", "utf8");
  const runSection = sourceBetween(componentSource, "function RunOperatingTab", "function RunAgentCard");

  assert.match(runSection, /Run the Service after agents build it\./);
  assert.match(runSection, /What do we need to run, verify, or fix\?/);
  assert.match(runSection, /Review with Run Agent/);
  assert.match(runSection, /AI Operations Agent/);
  assert.match(runSection, /Run Canvas/);
  assert.match(runSection, /Ops Board/);
  assert.match(runSection, /Approval gate/);
  assert.match(runSection, /Infrastructure Agent/);
  assert.match(runSection, /QA Agent/);
  assert.match(runSection, /Release Agent/);
  assert.match(runSection, /Feedback \/ Issue Agent/);
  assert.match(runSection, /Supabase setup/);
  assert.match(runSection, /Vercel deployment/);
  assert.match(runSection, /Set up infrastructure/);
  assert.match(runSection, /Fix deployment/);
  assert.match(runSection, /Configure Supabase/);
  assert.match(runSection, /Configure Vercel/);
  assert.doesNotMatch(runSection, /Advanced source intake/);
  assert.doesNotMatch(runSection, /Founder Memory/);
  assert.doesNotMatch(runSection, /Project Roadmap Dashboard/);
  assert.doesNotMatch(runSection, /Import Project History/);
  assert.doesNotMatch(runSection, /Paste text|Upload PDF/);
  assert.doesNotMatch(runSection, /Workspace settings/);
  assert.doesNotMatch(runSection, /Product Summary|Target Users|Current Build State|Technical Details/);
});

test("Run Agent classifies Supabase and Vercel operations issues", () => {
  const supabaseIssue = createRunIssue({
    projectId: seedProject.id,
    input: "Login not working in production after Supabase auth redirect and RLS changes.",
    now: "2026-05-12T00:00:00.000Z",
  });
  const vercelIssue = createRunIssue({
    projectId: seedProject.id,
    input: "Vercel production deploy failed and the domain shows a serverless API route error.",
    now: "2026-05-12T00:00:00.000Z",
  });

  assert.equal(supabaseIssue.type, "supabase");
  assert.equal(supabaseIssue.provider, "supabase");
  assert.match(supabaseIssue.verificationSteps.join("\n"), /Supabase auth Site URL and redirect URLs/i);
  assert.match(supabaseIssue.verificationSteps.join("\n"), /RLS policies/i);
  assert.match(supabaseIssue.recommendedSteps.join("\n"), /Vercel environment variables/i);
  assert.match(supabaseIssue.recommendedSteps.join("\n"), /Redeploy after environment variable changes/i);
  assert.match(supabaseIssue.verificationSteps.join("\n"), /Production login succeeds/i);

  assert.equal(vercelIssue.type, "vercel");
  assert.equal(vercelIssue.provider, "domain");
  assert.match(vercelIssue.verificationSteps.join("\n"), /Vercel build logs/i);
  assert.match(vercelIssue.verificationSteps.join("\n"), /Environment variables/i);
  assert.match(vercelIssue.verificationSteps.join("\n"), /Domain points/i);
  assert.match(vercelIssue.recommendedSteps.join("\n"), /Compare Preview versus Production/i);
  assert.match(vercelIssue.recommendedSteps.join("\n"), /serverless\/API route errors/i);
});

test("Run issue can create a ready Build task linked back to Run", () => {
  const issue = createRunIssue({
    projectId: seedProject.id,
    input: "Supabase storage bucket uploads fail in production and users cannot finish onboarding.",
    now: "2026-05-12T00:00:00.000Z",
  });
  const task = createDevelopmentTaskFromRunIssue({
    issue,
    project: seedProject,
    memory: seedMemory,
    now: "2026-05-12T00:01:00.000Z",
  });

  assert.equal(task.status, "ready_to_dispatch");
  assert.equal(task.runIssueId, issue.id);
  assert.match(task.context.join("\n"), /Run issue type: supabase/i);
  assert.match(task.acceptanceCriteria.join("\n"), /Storage bucket policies work/i);
  assert.match(task.codexGoal, /\/goal/);
});

test("Rebuild Project Memory uses all saved sources with mocked OpenAI", async () => {
  let requestBody = "";
  const sources = ["alpha.pdf", "beta.pdf"].map((fileName, index) => ({
    ...analyzeProjectHistory(`Completed: source ${index} done.\nNext improve ${fileName}.`, {
      project: seedProject,
      currentMemory: seedMemory,
      sourceType: "PDF",
      title: fileName,
      fileName,
      pageCount: 1,
    }).source,
    createdAt: `2026-05-1${index}T00:00:00.000Z`,
  }));
  const fetcher: typeof fetch = async (_url, init) => {
    requestBody = String(init?.body || "");
    return new Response(
      JSON.stringify({
        output_text: JSON.stringify({
          productSnapshot: "Brainpress turns many project chats into one clear roadmap.",
          plainEnglishSummary: "The project has two imported source PDFs and a clear next roadmap step.",
          whatIsDone: ["Source alpha is captured.", "Source beta is captured."],
          whatIsBrokenOrRisky: ["The roadmap is spread across chats."],
          whatToDoNext: ["Create a consolidated memory dashboard because founders need one current view."],
          roadmapNow: ["Create a consolidated memory dashboard."],
          roadmapNext: ["Turn the dashboard into a next outcome."],
          roadmapLater: ["Add OCR later."],
          suggestedNextOutcome: {
            title: "Create consolidated memory dashboard",
            description: "Show one current project roadmap from all saved sources.",
            acceptanceChecks: ["All sources are represented.", "Raw text remains separate."],
          },
          technicalDetails: ["Use localStorage-compatible source records."],
          openQuestions: [],
        }),
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };

  const result = await rebuildProjectMemoryWithOptionalOpenAI(
    { project: seedProject, currentMemory: seedMemory, sources },
    { env: { OPENAI_API_KEY: "sk-test" }, fetcher },
  );

  assert.equal(result.analyzer, "AI");
  assert.match(requestBody, /alpha\.pdf/i);
  assert.match(requestBody, /beta\.pdf/i);
  assert.equal(result.consolidated.sourceCount, 2);
  assert.match(result.memory.productSummary, /many project chats/i);
});

test("Rebuild Project Memory falls back when OPENAI_API_KEY is missing", async () => {
  const source = analyzeProjectHistory("Issue: memory is scattered.\nNext rebuild project memory.", {
    project: seedProject,
    currentMemory: seedMemory,
    sourceType: "PDF",
    title: "Scattered PDF",
    fileName: "scattered.pdf",
    pageCount: 1,
  }).source;

  const result = await rebuildProjectMemoryWithOptionalOpenAI(
    { project: seedProject, currentMemory: seedMemory, sources: [source] },
    { env: { OPENAI_API_KEY: "" } },
  );

  assert.equal(result.analyzer, "AIUnavailable");
  assert.match(result.warnings.join("\n"), /OPENAI_API_KEY/i);
  assert.match(result.consolidated.whatIsBrokenOrRisky.join("\n"), /memory is scattered/i);
  assert.match(source.extractedText, /memory is scattered/i);
});

test("Rebuild Project Memory falls back when AI consolidation JSON is invalid", async () => {
  const source = analyzeProjectHistory("Issue: duplicate roadmap is confusing.\nNext rebuild one dashboard.", {
    project: seedProject,
    currentMemory: seedMemory,
    sourceType: "PDF",
    title: "Invalid rebuild PDF",
    fileName: "invalid-rebuild.pdf",
    pageCount: 1,
  }).source;
  const fetcher: typeof fetch = async () =>
    new Response(JSON.stringify({ output_text: JSON.stringify({ productSnapshot: 42 }) }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  const result = await rebuildProjectMemoryWithOptionalOpenAI(
    { project: seedProject, currentMemory: seedMemory, sources: [source] },
    { env: { OPENAI_API_KEY: "sk-test" }, fetcher },
  );

  assert.equal(result.analyzer, "AIUnavailable");
  assert.match(result.warnings.join("\n"), /invalid JSON/i);
  assert.match(result.consolidated.whatIsBrokenOrRisky.join("\n"), /duplicate roadmap/i);
  assert.match(source.extractedText, /duplicate roadmap is confusing/i);
});

test("PDF scanned or image-only failure message is founder-friendly", () => {
  assert.match(pdfTextExtractionFailureMessage(), /scanned\/image-only/i);
  assert.match(pdfTextExtractionFailureMessage(), /text-based PDF/i);
});
