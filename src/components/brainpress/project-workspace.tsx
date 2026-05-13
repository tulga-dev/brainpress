"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  Clipboard,
  History,
  Plus,
  Save,
  Send,
  ShieldCheck,
  Sparkles,
  Wand2,
} from "lucide-react";
import { generateCodexGoalText } from "@/lib/codex-goal";
import { callBrainpressAgent, type BuildAgentResult, type RunAgentResult, type ThinkAgentResult } from "@/lib/agent-gateway";
import { createDevelopmentTaskFromProductWindow, createProductWindowFromThinkSession } from "@/lib/product-window";
import { createDevelopmentTaskFromRunIssue, createRunIssue } from "@/lib/run-agents";
import { createServiceWindowCodexPrompt, generateServiceBlueprint, generateServiceWindow } from "@/lib/services";
import {
  createClarifyingQuestions,
  createConstitution,
  createDevelopmentTasksFromSpecTasks,
  createPlanFromSpec,
  createSpecFromThinkSession,
  createTaskListFromPlan,
} from "@/lib/spec-loop";
import { createDevelopmentTaskFromThinkRecommendation, createThinkSession } from "@/lib/think-sessions";
import { applyProductWindowSuggestion, ThinkOperatingTab, type ThinkCreationResult } from "@/components/brainpress/think-workspace";
import {
  applyGithubDispatchResult,
  prepareGithubDispatch,
  type GithubIssueCreationResult,
} from "@/lib/github-dispatch";
import {
  createDevelopmentTaskFromIntent,
  defaultDispatchMode,
  developmentStatusFromCodingAgentStatus,
  developmentTaskDispatchTargets,
  developmentTaskPriorities,
  developmentTaskStatuses,
  developmentTaskTypes,
  updateDevelopmentTaskResult,
  updateDevelopmentTaskStatus,
} from "@/lib/development-tasks";
import {
  applyRecommendedDevelopmentTaskStatus,
  parseDevelopmentTaskResult,
  taskStatusFromRecommendedResult,
} from "@/lib/development-task-results";
import type {
  DevelopmentTask,
  DevelopmentTaskDispatchTarget,
  DevelopmentTaskPriority,
  DevelopmentTaskResult,
  DevelopmentTaskStatus,
  DevelopmentTaskType,
  BrainpressSpec,
  BrainpressPlan,
  BrainpressTaskList,
  BrainpressService,
  Memory,
  ProductWindow,
  Project,
  RecommendedBuildTask,
  RunIssue,
  ServiceAgent,
  ServiceWindow,
  BrainpressAgentSource,
  ThinkArtifactType,
  ThinkMode,
  ThinkSession,
} from "@/lib/types";
import { useBrainpress } from "@/components/brainpress/use-brainpress";
import {
  Button,
  EmptyState,
  FieldLabel,
  MonoBlock,
  Panel,
  PanelBody,
  SectionHeader,
  Select,
  StatusPill,
  TextArea,
  TextInput,
  cx,
} from "@/components/brainpress/ui";

const tabs = ["Overview", "Agent Team", "ServiceWindow", "Think", "Build", "Run"] as const;
type Tab = (typeof tabs)[number];
interface LocalBridgeUiState {
  ok: boolean;
  name?: string;
  version?: string;
  url?: string;
  message: string;
  checkedAt: string;
}

export function ProjectWorkspace({ projectId }: { projectId: string }) {
  const router = useRouter();
  const {
    state,
    setState,
    session,
    storageSourceLabel,
    storageSourceReason,
    supabaseConfigured,
    authMessage,
    authLoading,
    signIn,
    signOut,
  } = useBrainpress();
  const [activeTab, setActiveTab] = useState<Tab>("Overview");
  const [cloudEmail, setCloudEmail] = useState("");
  const [syncPromptDismissed, setSyncPromptDismissed] = useState(false);
  const [showCloudSignInForm, setShowCloudSignInForm] = useState(false);
  const [thinkDirectionInput, setThinkDirectionInput] = useState("");
  const [thinkMode, setThinkMode] = useState<ThinkMode>("open_thinking");
  const [thinkArtifactType, setThinkArtifactType] = useState<ThinkArtifactType>("product_brief");
  const [selectedThinkSessionId, setSelectedThinkSessionId] = useState("");
  const [devTaskInput, setDevTaskInput] = useState("");
  const [selectedDevTaskId, setSelectedDevTaskId] = useState("");
  const [devTaskResultInput, setDevTaskResultInput] = useState("");
  const [dispatchingDevelopmentTaskId, setDispatchingDevelopmentTaskId] = useState<string | null>(null);
  const [githubDispatchingTaskId, setGithubDispatchingTaskId] = useState<string | null>(null);
  const [developmentTaskDispatchMessage, setDevelopmentTaskDispatchMessage] = useState("");
  const [copiedGoalTaskId, setCopiedGoalTaskId] = useState<string | null>(null);
  const [copiedGithubIssueTaskId, setCopiedGithubIssueTaskId] = useState<string | null>(null);
  const [localBridgeHealth, setLocalBridgeHealth] = useState<LocalBridgeUiState | null>(null);
  const [checkingLocalBridge, setCheckingLocalBridge] = useState(false);
  const [refreshingBridgeTaskId, setRefreshingBridgeTaskId] = useState<string | null>(null);
  const [runIssueInput, setRunIssueInput] = useState("");
  const [selectedRunIssueId, setSelectedRunIssueId] = useState("");
  const [thinkingWithAgent, setThinkingWithAgent] = useState(false);
  const [buildingWithAgent, setBuildingWithAgent] = useState(false);
  const [runningWithAgent, setRunningWithAgent] = useState(false);
  const [serviceWindowCopied, setServiceWindowCopied] = useState(false);

  const project = state.projects.find((item) => item.id === projectId);
  const memory = project ? state.memories[project.id] : undefined;
  const service = state.services.find((item) => item.id === projectId);
  const serviceAgents = useMemo(
    () => (state.serviceAgents || []).filter((agent) => agent.serviceId === projectId),
    [projectId, state.serviceAgents],
  );
  const serviceWindow = (state.serviceWindows || []).find((window) => window.serviceId === projectId);
  const developmentTasks = useMemo(
    () => (state.developmentTasks || []).filter((task) => task.projectId === projectId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [projectId, state.developmentTasks],
  );
  const developmentTaskResults = useMemo(
    () =>
      (state.developmentTaskResults || [])
        .filter((result) => developmentTasks.some((task) => task.id === result.taskId))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [developmentTasks, state.developmentTaskResults],
  );
  const projectImports = useMemo(
    () => (state.imports || []).filter((source) => source.projectId === projectId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [projectId, state.imports],
  );
  const thinkSessions = useMemo(
    () => (state.thinkSessions || []).filter((session) => session.projectId === projectId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [projectId, state.thinkSessions],
  );
  const productWindows = useMemo(
    () => (state.productWindows || []).filter((window) => window.projectId === projectId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [projectId, state.productWindows],
  );
  const specs = useMemo(
    () => (state.specs || []).filter((spec) => spec.projectId === projectId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [projectId, state.specs],
  );
  const clarifyingQuestions = useMemo(() => {
    const specIds = new Set(specs.map((spec) => spec.id));
    return (state.clarifyingQuestions || []).filter((question) => specIds.has(question.specId));
  }, [specs, state.clarifyingQuestions]);
  const plans = useMemo(
    () => (state.plans || []).filter((plan) => plan.projectId === projectId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [projectId, state.plans],
  );
  const taskLists = useMemo(
    () => (state.taskLists || []).filter((taskList) => taskList.projectId === projectId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [projectId, state.taskLists],
  );
  const runIssues = useMemo(
    () => (state.runIssues || []).filter((issue) => issue.projectId === projectId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [projectId, state.runIssues],
  );
  if (!project || !memory) {
    return (
      <main className="min-h-screen bg-mist px-5 py-8 text-ink">
        <div className="mx-auto max-w-3xl">
          <Panel>
            <PanelBody>
              <SectionHeader title="Service not found" eyebrow="Brainpress" />
              <p className="text-slateText">This workspace does not contain that Service. Return to Services and create a new one.</p>
              <Button className="mt-5" onClick={() => router.push("/")}>
                <ArrowLeft className="h-4 w-4" />
                Dashboard
              </Button>
            </PanelBody>
          </Panel>
        </div>
      </main>
    );
  }

  const activeProject: Project = project;
  const activeMemory: Memory = memory;
  const activeService: BrainpressService = service || {
    id: activeProject.id,
    name: activeProject.name,
    description: activeProject.description,
    servicePromise: activeProject.primaryGoal,
    targetCustomer: activeMemory.targetUsers || "Founder-builders",
    desiredOutcome: activeProject.primaryGoal,
    currentStage: "idea",
    mainAgentId: `agent_${activeProject.id}_main`,
    agentIds: serviceAgents.map((agent) => agent.id),
    serviceWorkflow: [
      "Capture the user or founder request.",
      "Clarify the desired outcome and missing context.",
      "Route implementation work to Codex only after approval.",
      "Verify results against acceptance criteria.",
    ],
    humanApprovalPoints: [
      "Before Codex dispatch.",
      "Before merge, deploy, or verified status.",
      "Before accessing secrets, production data, or services outside the selected service scope.",
    ],
    successMetrics: ["The service delivers its promised outcome.", "Verification evidence is captured before work is marked complete."],
    openQuestions: [],
    createdAt: activeProject.createdAt,
    updatedAt: activeProject.createdAt,
  };
  function updateDevelopmentTask(taskId: string, patch: Partial<DevelopmentTask>) {
    setState((current) => ({
      ...current,
      developmentTasks: (current.developmentTasks || []).map((task) =>
        task.id === taskId
          ? {
              ...task,
              ...patch,
              dispatchMode: patch.dispatchTarget ? defaultDispatchMode(patch.dispatchTarget) : patch.dispatchMode || task.dispatchMode,
              updatedAt: new Date().toISOString(),
            }
          : task,
      ),
    }));
  }

  async function createProductDirection(): Promise<ThinkCreationResult | null> {
    const input = thinkDirectionInput.trim();
    if (!input) return null;
    setThinkingWithAgent(true);
    try {
      const agentResponse = await callBrainpressAgent({
        surface: "think",
        input,
        project: activeProject,
        mode: thinkMode,
        artifactType: thinkArtifactType,
      });
      const localSession = createThinkSession({
        input,
        mode: thinkMode,
        artifactType: thinkArtifactType,
        project: activeProject,
      });
      const agentResult = agentResponse.result as ThinkAgentResult;
      const session: ThinkSession = {
        ...localSession,
        title: agentResult.productDirection || localSession.title,
        summary: agentResult.summary || localSession.summary,
        productDirection: agentResult.productDirection || localSession.productDirection,
        userProblem: agentResult.userProblem || localSession.userProblem,
        targetUser: agentResult.targetUser || localSession.targetUser,
        proposedSolution: agentResult.proposedSolution || localSession.proposedSolution,
        mvpScope: agentResult.mvpScope.length ? agentResult.mvpScope : localSession.mvpScope,
        featureIdeas: agentResult.featureIdeas.length ? agentResult.featureIdeas : localSession.featureIdeas,
        decisions: agentResult.decisions.length ? agentResult.decisions : localSession.decisions,
        risks: agentResult.risks.length ? agentResult.risks : localSession.risks,
        openQuestions: agentResult.openQuestions.length ? agentResult.openQuestions : localSession.openQuestions,
        recommendedBuildTasks: agentResult.recommendedBuildTasks.length
          ? agentResult.recommendedBuildTasks
          : localSession.recommendedBuildTasks,
        agentSource: agentResponse.source,
        agentModel: agentResponse.model,
        agentError: agentResponse.error,
      };
      const productWindow = applyProductWindowSuggestion(
        createProductWindowFromThinkSession({
          session,
          project: activeProject,
        }),
        agentResult.productWindowSuggestion,
      );
      const spec = createSpecFromThinkSession({
        session,
        productWindow,
        project: activeProject,
      });
      const questions = createClarifyingQuestions(spec);
      setState((current) => ({
        ...current,
        thinkSessions: [session, ...(current.thinkSessions || [])],
        productWindows: [productWindow, ...(current.productWindows || [])],
        constitutions: current.constitutions?.some((constitution) => constitution.projectId === activeProject.id)
          ? current.constitutions
          : [createConstitution(activeProject), ...(current.constitutions || [])],
        specs: [spec, ...(current.specs || [])],
        clarifyingQuestions: [...questions, ...(current.clarifyingQuestions || [])],
      }));
      setSelectedThinkSessionId(session.id);
      setThinkDirectionInput("");
      return { session, productWindow };
    } finally {
      setThinkingWithAgent(false);
    }
  }
  function regenerateDevelopmentTaskGoal(task: DevelopmentTask) {
    updateDevelopmentTask(task.id, {
      codexGoal: generateCodexGoalText({
        project: activeProject,
        memory: activeMemory,
        sources: projectImports,
        task,
      }),
      codexGoalUpdatedAt: new Date().toISOString(),
    });
  }

  async function copyDevelopmentTaskGoal(task: DevelopmentTask) {
    await navigator.clipboard.writeText(task.codexGoal);
    setCopiedGoalTaskId(task.id);
    setTimeout(() => setCopiedGoalTaskId((current) => (current === task.id ? null : current)), 1400);
  }

  async function checkLocalBridge() {
    setCheckingLocalBridge(true);
    try {
      const response = await fetch("/api/brainpress/codex/local-bridge/health");
      const payload = (await response.json().catch(() => ({}))) as Partial<LocalBridgeUiState>;
      const health: LocalBridgeUiState = {
        ok: response.ok && Boolean(payload.ok),
        name: payload.name,
        version: payload.version,
        url: payload.url || "http://localhost:4317",
        message: payload.message || (response.ok ? "Local Codex Bridge is available." : "Local Codex Bridge is not running."),
        checkedAt: new Date().toISOString(),
      };
      setLocalBridgeHealth(health);
      setDevelopmentTaskDispatchMessage(
        health.ok
          ? "Local Codex Bridge is available. You can send this task to Codex."
          : "Local Codex Bridge is not running. Start it with: node scripts/brainpress-codex-bridge.js",
      );
    } catch {
      setLocalBridgeHealth({
        ok: false,
        url: "http://localhost:4317",
        message: "Local Codex Bridge is not running.",
        checkedAt: new Date().toISOString(),
      });
      setDevelopmentTaskDispatchMessage("Local Codex Bridge is not running. Start it with: node scripts/brainpress-codex-bridge.js");
    } finally {
      setCheckingLocalBridge(false);
    }
  }

  async function refreshDevelopmentTaskBridgeStatus(task: DevelopmentTask) {
    if (!task.codexRunId) return;
    setRefreshingBridgeTaskId(task.id);
    try {
      const response = await fetch(`/api/brainpress/codex/local-bridge/tasks/${encodeURIComponent(task.codexRunId)}`);
      const payload = (await response.json().catch(() => ({}))) as {
        status?: string;
        message?: string;
        externalRunUrl?: string;
        runId?: string;
      };
      const nextStatus = response.ok ? developmentStatusFromCodingAgentStatus(payload.status || "queued") : "ready_to_dispatch";
      setState((current) => ({
        ...current,
        developmentTasks: (current.developmentTasks || []).map((item) =>
          item.id === task.id
            ? {
                ...updateDevelopmentTaskStatus(
                  item,
                  nextStatus,
                  payload.message || (response.ok ? "Local bridge status refreshed." : "Local Codex Bridge is not running."),
                ),
                externalRunUrl: payload.externalRunUrl || item.externalRunUrl,
                codexRunId: payload.runId || item.codexRunId,
              }
            : item,
        ),
      }));
      setDevelopmentTaskDispatchMessage(payload.message || (response.ok ? "Local bridge status refreshed." : "Local Codex Bridge is not running."));
    } finally {
      setRefreshingBridgeTaskId(null);
    }
  }

  async function importDevelopmentTaskBridgeResult(task: DevelopmentTask) {
    if (!task.codexRunId) return;
    setRefreshingBridgeTaskId(task.id);
    try {
      const response = await fetch(`/api/brainpress/codex/local-bridge/tasks/${encodeURIComponent(task.codexRunId)}/result`);
      const payload = (await response.json().catch(() => ({}))) as {
        status?: string;
        summary?: string;
        raw?: string;
        prUrl?: string;
      };
      const raw = payload.raw || payload.summary || "";
      const now = new Date().toISOString();
      const parsedResult = raw ? parseDevelopmentTaskResult(task, raw, "local_bridge", now) : null;
      setState((current) => ({
        ...current,
        developmentTaskResults: parsedResult
          ? [parsedResult, ...(current.developmentTaskResults || [])]
          : current.developmentTaskResults || [],
        developmentTasks: (current.developmentTasks || []).map((item) => {
          if (item.id !== task.id) return item;
          if (parsedResult) {
            const withResult = updateDevelopmentTaskResult(item, raw, now);
            return {
              ...withResult,
              resultSummary: parsedResult.summary || withResult.resultSummary,
              prUrl: payload.prUrl || parsedResult.prUrl || withResult.prUrl,
            };
          }
          return updateDevelopmentTaskStatus(
            item,
            response.ok ? developmentStatusFromCodingAgentStatus(payload.status || "completed") : "ready_to_dispatch",
            payload.summary || (response.ok ? "Local bridge result imported." : "Local Codex Bridge is not running."),
          );
        }),
      }));
      setDevelopmentTaskDispatchMessage(
        raw
          ? "Local bridge result imported for structured acceptance review."
          : payload.summary || (response.ok ? "Local bridge result imported." : "Local Codex Bridge is not running."),
      );
    } finally {
      setRefreshingBridgeTaskId(null);
    }
  }

  async function createDevelopmentTask() {
    await createDevelopmentTaskFromText(devTaskInput);
  }

  async function createDevelopmentTaskFromText(input: string) {
    const normalizedInput = input.trim();
    if (!normalizedInput) return;
    setBuildingWithAgent(true);
    try {
      const agentResponse = await callBrainpressAgent({
        surface: "build",
        input: normalizedInput,
        project: activeProject,
      });
      const localTask = createDevelopmentTaskFromIntent({
        input: normalizedInput,
        project: activeProject,
        memory: activeMemory,
      });
      const agentResult = agentResponse.result as BuildAgentResult;
      const taskDraft: DevelopmentTask = {
        ...localTask,
        serviceId: activeService.id,
        title: agentResult.title || localTask.title,
        description: normalizedInput,
        taskType: agentResult.taskType || localTask.taskType,
        priority: agentResult.priority || localTask.priority,
        context: agentResult.context.length ? agentResult.context : localTask.context,
        affectedAreas: agentResult.affectedAreas.length ? agentResult.affectedAreas : localTask.affectedAreas,
        acceptanceCriteria: agentResult.acceptanceCriteria.length ? agentResult.acceptanceCriteria : localTask.acceptanceCriteria,
        verificationCommands: agentResult.verificationCommands.length ? agentResult.verificationCommands : localTask.verificationCommands,
        manualQaSteps: agentResult.manualQaSteps.length ? agentResult.manualQaSteps : localTask.manualQaSteps,
        constraints: agentResult.constraints.length ? agentResult.constraints : localTask.constraints,
        dispatchTarget: agentResult.recommendedDispatchTarget || localTask.dispatchTarget,
        dispatchMode: defaultDispatchMode(agentResult.recommendedDispatchTarget || localTask.dispatchTarget),
        agentSource: agentResponse.source,
        agentModel: agentResponse.model,
        agentError: agentResponse.error,
        statusHistory: [
          ...(localTask.statusHistory || []),
          {
            status: "ready_to_dispatch",
            note: `${agentResponse.source === "openai" ? "Live AI" : "Local fallback"} generated the structured Build task.`,
            at: new Date().toISOString(),
          },
        ],
      };
      const task: DevelopmentTask = {
        ...taskDraft,
        codexGoal: generateCodexGoalText({
          project: activeProject,
          memory: activeMemory,
          sources: projectImports,
          task: taskDraft,
        }),
        codexGoalUpdatedAt: new Date().toISOString(),
      };

      setState((current) => ({
        ...current,
        developmentTasks: [task, ...(current.developmentTasks || [])],
      }));
      setSelectedDevTaskId(task.id);
      setDevTaskResultInput("");
      setDevelopmentTaskDispatchMessage(
        `${agentResponse.source === "openai" ? "Live AI" : "Local fallback"} created a development task ready to dispatch.`,
      );
      setDevTaskInput("");
    } finally {
      setBuildingWithAgent(false);
    }
  }

  async function createAgentTaskFromDirection() {
    const direction =
      devTaskInput.trim() ||
      thinkDirectionInput.trim() ||
      thinkSessions[0]?.recommendedBuildTasks[0]?.title ||
      thinkSessions[0]?.productDirection ||
      activeProject.primaryGoal ||
      "Create the next verified product improvement.";

    await createDevelopmentTaskFromText(direction);
    setActiveTab("Build");
  }

  function createBuildTaskFromThinkSession(session: ThinkSession, recommendation: RecommendedBuildTask) {
    const sourceSpec = specs.find((spec) => spec.thinkSessionId === session.id);
    const task = {
      ...createDevelopmentTaskFromThinkRecommendation({
        session,
        recommendation,
        project: activeProject,
        memory: activeMemory,
      }),
      serviceId: activeService.id,
      sourceSpecId: sourceSpec?.id,
    };
    setState((current) => ({
      ...current,
      developmentTasks: [task, ...(current.developmentTasks || [])],
      thinkSessions: (current.thinkSessions || []).map((item) =>
        item.id === session.id
          ? { ...item, status: "converted_to_build", updatedAt: new Date().toISOString() }
          : item,
      ),
    }));
    setSelectedThinkSessionId(session.id);
    setSelectedDevTaskId(task.id);
    setDevelopmentTaskDispatchMessage("Build task created from Think session.");
    setActiveTab("Build");
  }

  function regenerateProductWindow(session: ThinkSession) {
    const productWindow = createProductWindowFromThinkSession({
      session,
      project: activeProject,
    });
    const spec = createSpecFromThinkSession({
      session,
      productWindow,
      project: activeProject,
    });
    const questions = createClarifyingQuestions(spec);
    setState((current) => ({
      ...current,
      productWindows: [productWindow, ...(current.productWindows || []).filter((item) => item.thinkSessionId !== session.id)],
      specs: [spec, ...(current.specs || []).filter((item) => item.thinkSessionId !== session.id)],
      clarifyingQuestions: [
        ...questions,
        ...(current.clarifyingQuestions || []).filter((question) => {
          const oldSpecIds = new Set((current.specs || []).filter((item) => item.thinkSessionId === session.id).map((item) => item.id));
          return !oldSpecIds.has(question.specId);
        }),
      ],
    }));
    setSelectedThinkSessionId(session.id);
  }

  function approveProductWindow(productWindow: ProductWindow) {
    const now = new Date().toISOString();
    setState((current) => ({
      ...current,
      productWindows: (current.productWindows || []).map((item) =>
        item.id === productWindow.id ? { ...item, status: "approved", updatedAt: now } : item,
      ),
      thinkSessions: (current.thinkSessions || []).map((item) =>
        item.id === productWindow.thinkSessionId ? { ...item, status: "accepted", updatedAt: now } : item,
      ),
    }));
  }

  function createBuildTaskFromProductWindow(session: ThinkSession, productWindow: ProductWindow) {
    const sourceSpec = specs.find((spec) => spec.thinkSessionId === session.id || spec.productWindowId === productWindow.id);
    const task = {
      ...createDevelopmentTaskFromProductWindow({
        productWindow,
        session,
        project: activeProject,
        memory: activeMemory,
      }),
      serviceId: activeService.id,
      sourceSpecId: sourceSpec?.id,
    };
    const now = new Date().toISOString();
    setState((current) => ({
      ...current,
      developmentTasks: [task, ...(current.developmentTasks || [])],
      productWindows: (current.productWindows || []).map((item) =>
        item.id === productWindow.id ? { ...item, status: "converted_to_build", updatedAt: now } : item,
      ),
      thinkSessions: (current.thinkSessions || []).map((item) =>
        item.id === session.id ? { ...item, status: "converted_to_build", updatedAt: now } : item,
      ),
    }));
    setSelectedThinkSessionId(session.id);
    setSelectedDevTaskId(task.id);
    setDevelopmentTaskDispatchMessage("Build task created from ServiceWindow.");
    setActiveTab("Build");
  }

  function createPlanAndTasksFromSpec(spec: BrainpressSpec) {
    const plan = createPlanFromSpec({
      spec,
      project: activeProject,
    });
    const taskList = createTaskListFromPlan(plan);
    const tasks = createDevelopmentTasksFromSpecTasks({
      taskList,
      project: activeProject,
      memory: activeMemory,
      spec,
      plan,
    }).map((task) => ({ ...task, serviceId: activeService.id }));
    setState((current) => ({
      ...current,
      plans: [plan, ...(current.plans || [])],
      taskLists: [taskList, ...(current.taskLists || [])],
      developmentTasks: [...tasks, ...(current.developmentTasks || [])],
    }));
    setSelectedDevTaskId(tasks[0]?.id || "");
    setDevelopmentTaskDispatchMessage("Technical plan and ordered Build tasks generated from the Service Spec.");
    setActiveTab("Build");
  }

  function generateServiceBlueprintForWorkspace() {
    const latestSpec = specs[0];
    const blueprint = generateServiceBlueprint({
      service: activeService,
      agents: serviceAgents,
      spec: latestSpec,
      memory: activeMemory,
    });
    setState((current) => ({
      ...current,
      services: [blueprint.service, ...(current.services || []).filter((item) => item.id !== activeService.id)],
      serviceAgents: [
        ...blueprint.agents,
        ...(current.serviceAgents || []).filter((agent) => agent.serviceId !== activeService.id),
      ],
    }));
    setActiveTab("Agent Team");
  }

  function generateServiceUi() {
    const latestSpec = specs[0];
    const latestPlan = latestSpec ? plans.find((plan) => plan.specId === latestSpec.id) || plans[0] : plans[0];
    const blueprint = generateServiceBlueprint({
      service: activeService,
      agents: serviceAgents,
      spec: latestSpec,
      memory: activeMemory,
    });
    const window = generateServiceWindow({
      service: blueprint.service,
      agents: blueprint.agents,
      spec: latestSpec,
      plan: latestPlan,
    });
    setState((current) => ({
      ...current,
      services: [blueprint.service, ...(current.services || []).filter((item) => item.id !== activeService.id)],
      serviceAgents: [
        ...blueprint.agents,
        ...(current.serviceAgents || []).filter((agent) => agent.serviceId !== activeService.id),
      ],
      serviceWindows: [window, ...(current.serviceWindows || []).filter((item) => item.serviceId !== activeService.id)],
    }));
    setActiveTab("ServiceWindow");
  }

  async function copyServiceUiPrompt() {
    const latestSpec = specs[0];
    const latestPlan = latestSpec ? plans.find((plan) => plan.specId === latestSpec.id) || plans[0] : plans[0];
    const window = serviceWindow || generateServiceWindow({
      service: activeService,
      agents: serviceAgents,
      spec: latestSpec,
      plan: latestPlan,
    });
    await navigator.clipboard.writeText(createServiceWindowCodexPrompt({
      service: activeService,
      agents: serviceAgents,
      serviceWindow: window,
      spec: latestSpec,
      plan: latestPlan,
      taskLists,
      developmentTasks,
      memory: activeMemory,
    }));
    setServiceWindowCopied(true);
    setTimeout(() => setServiceWindowCopied(false), 1400);
  }

  async function reviewRunIssue(input = runIssueInput) {
    const normalizedInput = input.trim();
    if (!normalizedInput) return;
    setRunningWithAgent(true);
    try {
      const agentResponse = await callBrainpressAgent({
        surface: "run",
        input: normalizedInput,
        project: activeProject,
      });
      const localIssue = createRunIssue({
        projectId: activeProject.id,
        input: normalizedInput,
      });
      const agentResult = agentResponse.result as RunAgentResult;
      const issue: RunIssue = {
        ...localIssue,
        type: agentResult.type || localIssue.type,
        title: agentResult.title || localIssue.title,
        summary: agentResult.summary || localIssue.summary,
        provider: agentResult.provider || localIssue.provider,
        likelyCauses: agentResult.likelyCauses.length ? agentResult.likelyCauses : localIssue.likelyCauses,
        recommendedSteps: agentResult.recommendedSteps.length ? agentResult.recommendedSteps : localIssue.recommendedSteps,
        verificationSteps: agentResult.verificationSteps.length ? agentResult.verificationSteps : localIssue.verificationSteps,
        requiredAccess: agentResult.requiredAccess.length ? agentResult.requiredAccess : localIssue.requiredAccess,
        risks: agentResult.risks.length ? agentResult.risks : localIssue.risks,
        recommendedBuildTasks: agentResult.recommendedBuildTasks.length
          ? agentResult.recommendedBuildTasks
          : localIssue.recommendedBuildTasks,
        agentSource: agentResponse.source,
        agentModel: agentResponse.model,
        agentError: agentResponse.error,
      };
      setState((current) => ({
        ...current,
        runIssues: [issue, ...(current.runIssues || [])],
      }));
      setSelectedRunIssueId(issue.id);
      setRunIssueInput("");
    } finally {
      setRunningWithAgent(false);
    }
  }

  function startRunQuickAction(label: string) {
    setRunIssueInput(`${label}: `);
  }

  function createBuildTaskFromRunIssue(issue: RunIssue) {
    const task = {
      ...createDevelopmentTaskFromRunIssue({
        issue,
        project: activeProject,
        memory: activeMemory,
      }),
      serviceId: activeService.id,
    };
    setState((current) => ({
      ...current,
      developmentTasks: [task, ...(current.developmentTasks || [])],
    }));
    setSelectedDevTaskId(task.id);
    setActiveTab("Build");
  }

  async function dispatchDevelopmentTask(task: DevelopmentTask) {
    setDispatchingDevelopmentTaskId(task.id);
    setDevelopmentTaskDispatchMessage("");
    setState((current) => ({
      ...current,
      developmentTasks: (current.developmentTasks || []).map((item) =>
        item.id === task.id ? updateDevelopmentTaskStatus(item, "dispatching", "User clicked Send to Codex.") : item,
      ),
    }));

    try {
      const response = await fetch("/api/brainpress/codex/dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        configured?: boolean;
        runId?: string;
        status?: string;
        externalRunUrl?: string;
        message?: string;
      };
      const configured = Boolean(payload.configured && payload.runId);
      setState((current) => ({
        ...current,
        developmentTasks: (current.developmentTasks || []).map((item) => {
          if (item.id !== task.id) return item;
          const next = updateDevelopmentTaskStatus(
            item,
            configured ? developmentStatusFromCodingAgentStatus(payload.status || "queued") : "ready_to_dispatch",
            payload.message || (configured ? "Task dispatched to Codex." : "Codex dispatch not configured yet."),
          );
          return {
            ...next,
            codexRunId: configured ? payload.runId : item.codexRunId,
            externalRunUrl: configured ? payload.externalRunUrl : item.externalRunUrl,
          };
        }),
      }));
      setDevelopmentTaskDispatchMessage(payload.message || (configured ? "Task dispatched to Codex." : "Codex dispatch not configured yet."));
    } catch (error) {
      setState((current) => ({
        ...current,
        developmentTasks: (current.developmentTasks || []).map((item) =>
          item.id === task.id
            ? updateDevelopmentTaskStatus(
                item,
                "ready_to_dispatch",
                error instanceof Error ? error.message : "Codex dispatch failed before a run was created.",
              )
            : item,
        ),
      }));
      setDevelopmentTaskDispatchMessage(error instanceof Error ? error.message : "Codex dispatch failed before a run was created.");
    } finally {
      setDispatchingDevelopmentTaskId(null);
    }
  }

  function importDevelopmentTaskResult(task: DevelopmentTask) {
    if (!devTaskResultInput.trim()) return;
    const raw = devTaskResultInput.trim();
    const now = new Date().toISOString();
    const parsedResult = parseDevelopmentTaskResult(task, raw, "manual_import", now);
    setState((current) => ({
      ...current,
      developmentTaskResults: [parsedResult, ...(current.developmentTaskResults || [])],
      developmentTasks: (current.developmentTasks || []).map((item) =>
        item.id === task.id
          ? {
              ...updateDevelopmentTaskResult(item, raw, now),
              resultSummary: parsedResult.summary,
              prUrl: parsedResult.prUrl || item.prUrl,
            }
          : item,
      ),
    }));
    setDevTaskResultInput("");
  }

  function applyDevelopmentTaskResultRecommendation(task: DevelopmentTask, result: DevelopmentTaskResult) {
    setState((current) => ({
      ...current,
      developmentTasks: (current.developmentTasks || []).map((item) =>
        item.id === task.id ? applyRecommendedDevelopmentTaskStatus(item, result) : item,
      ),
    }));
    setDevelopmentTaskDispatchMessage(`Applied recommendation: ${result.recommendedStatus}.`);
  }

  async function copyGithubIssueBody(task: DevelopmentTask) {
    const githubPackage = prepareGithubDispatch(task, activeProject);
    await navigator.clipboard.writeText(githubPackage.issueBody);
    setCopiedGithubIssueTaskId(task.id);
    setState((current) => ({
      ...current,
      developmentTasks: (current.developmentTasks || []).map((item) =>
        item.id === task.id
          ? applyGithubDispatchResult(
              item,
              {
                configured: false,
                message: "GitHub issue body copied. Create the issue manually when ready.",
              },
            )
          : item,
      ),
    }));
    setDevelopmentTaskDispatchMessage("GitHub issue body copied. Task is prepared for GitHub but not dispatched.");
    setTimeout(() => setCopiedGithubIssueTaskId((current) => (current === task.id ? null : current)), 1400);
  }

  async function createGithubIssueForTask(task: DevelopmentTask) {
    const githubPackage = prepareGithubDispatch(task, activeProject);
    setGithubDispatchingTaskId(task.id);
    setDevelopmentTaskDispatchMessage("");
    try {
      const response = await fetch("/api/brainpress/github/issues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task,
          project: activeProject,
          repository: githubPackage.repository,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as GithubIssueCreationResult;
      const result: GithubIssueCreationResult = {
        configured: Boolean(payload.configured),
        issueUrl: payload.issueUrl,
        issueNumber: payload.issueNumber,
        message:
          payload.message ||
          (payload.issueUrl
            ? "GitHub issue created."
            : "GitHub issue creation is not configured. Copy the issue body and create it manually."),
      };
      setState((current) => ({
        ...current,
        developmentTasks: (current.developmentTasks || []).map((item) =>
          item.id === task.id ? applyGithubDispatchResult(item, result) : item,
        ),
      }));
      setDevelopmentTaskDispatchMessage(result.message);
    } catch (error) {
      const message = error instanceof Error ? error.message : "GitHub issue creation failed.";
      setState((current) => ({
        ...current,
        developmentTasks: (current.developmentTasks || []).map((item) =>
          item.id === task.id ? applyGithubDispatchResult(item, { configured: true, message }) : item,
        ),
      }));
      setDevelopmentTaskDispatchMessage(message);
    } finally {
      setGithubDispatchingTaskId(null);
    }
  }

  return (
    <main className="min-h-screen bg-[#03050b] text-white">
      <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-6 px-5 py-6 sm:px-8 lg:px-10">
        <header className="rounded-lg border border-white/10 bg-white/[0.035] p-4 shadow-2xl shadow-black/20 backdrop-blur">
          <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <Link href="/" className="flex h-9 w-9 items-center justify-center rounded-md border border-white/10 bg-white/[0.05] text-slate-300 hover:border-blue-300/50 hover:text-blue-100">
                <ArrowLeft className="h-4 w-4" />
              </Link>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-semibold text-white">{activeService.name}</h1>
                  <span className="rounded-md border border-blue-300/20 bg-blue-400/10 px-2 py-1 text-xs font-medium text-blue-100">
                    Agent-native Service
                  </span>
                  <span className="rounded-md border border-emerald-300/20 bg-emerald-300/10 px-2 py-1 text-xs font-medium text-emerald-100">
                    Human approval required
                  </span>
                </div>
                <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-400">{activeService.servicePromise}</p>
              </div>
            </div>
            <div className="min-w-[280px] rounded-lg border border-white/10 bg-slate-950/70 p-3 text-sm text-slate-300">
              <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wide text-blue-200">
                <ShieldCheck className="h-3.5 w-3.5" />
                {storageSourceLabel}
              </div>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                {!session && supabaseConfigured ? "Stored on this browser. Sync is optional." : storageSourceReason}
              </p>
              {session ? (
                <div className="mt-3 flex items-center justify-between gap-3">
                  <span className="truncate text-xs text-slate-400">{session.user.email || "Signed in"}</span>
                  <Button className="h-8 border-white/10 bg-white/[0.04] text-xs text-slate-200 hover:bg-white/[0.08]" onClick={signOut} disabled={authLoading}>
                    Sign out
                  </Button>
                </div>
              ) : supabaseConfigured ? (
                <div className="mt-3 space-y-3">
                  {!syncPromptDismissed ? (
                    <div className="rounded-md border border-blue-300/15 bg-blue-400/10 p-3">
                      <p className="text-xs leading-5 text-blue-100">Working locally. Sign in to sync across devices.</p>
                      <p className="mt-1 text-xs leading-5 text-blue-200/70">
                        Local workspace is stored on this browser only. To use the same workspace from another device, sign in to enable cloud sync.
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          className="h-8 border-blue-300/20 bg-blue-400/15 text-xs text-blue-100 hover:bg-blue-400/20"
                          onClick={() => setShowCloudSignInForm(true)}
                        >
                          Sign in to sync
                        </Button>
                        <Button
                          className="h-8 border-white/10 bg-white/[0.04] text-xs text-slate-300 hover:bg-white/[0.08]"
                          onClick={() => setSyncPromptDismissed(true)}
                        >
                          Dismiss
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs leading-5 text-slate-500">Local workspace is stored on this browser only.</p>
                      <Button
                        className="h-8 border-white/10 bg-white/[0.04] text-xs text-slate-200 hover:bg-white/[0.08]"
                        onClick={() => setShowCloudSignInForm(true)}
                      >
                        Sign in to sync
                      </Button>
                    </div>
                  )}
                  {showCloudSignInForm ? (
                    <div className="flex gap-2">
                      <TextInput
                        className="h-8 border-white/10 bg-white/[0.05] text-xs text-white placeholder:text-slate-500"
                        value={cloudEmail}
                        onChange={(event) => setCloudEmail(event.target.value)}
                        placeholder="email@company.com"
                      />
                      <Button
                        className="h-8 shrink-0 border-white/10 bg-white/[0.04] text-xs text-slate-200 hover:bg-white/[0.08]"
                        onClick={() => signIn(cloudEmail)}
                        disabled={authLoading || !cloudEmail.trim()}
                      >
                        Send link
                      </Button>
                    </div>
                  ) : null}
                </div>
              ) : null}
              {authMessage ? <p className="mt-2 text-xs leading-5 text-slate-500">{authMessage}</p> : null}
            </div>
          </div>

          <nav className="flex gap-1 overflow-x-auto rounded-lg border border-white/10 bg-black/30 p-1">
            {tabs.map((tab) => (
              <button
                key={tab}
                className={cx(
                  "h-9 shrink-0 rounded-md px-3 text-sm font-medium transition",
                  activeTab === tab
                    ? "bg-white text-slate-950 shadow-sm"
                    : "text-slate-400 hover:bg-white/[0.07] hover:text-white",
                )}
                onClick={() => setActiveTab(tab)}
              >
                {tab}
              </button>
            ))}
          </nav>
        </header>

        {activeTab === "Overview" ? (
          <ServiceOverviewTab
            service={activeService}
            agents={serviceAgents}
            specs={specs}
            plans={plans}
            tasks={developmentTasks}
            runIssues={runIssues}
            serviceWindow={serviceWindow}
            onGenerateServiceBlueprint={generateServiceBlueprintForWorkspace}
            onGenerateServiceWindow={generateServiceUi}
            onCopyCodexPrompt={copyServiceUiPrompt}
            copied={serviceWindowCopied}
          />
        ) : null}

        {activeTab === "Agent Team" ? (
          <AgentTeamTab service={activeService} agents={serviceAgents} />
        ) : null}

        {activeTab === "ServiceWindow" ? (
          <ServiceWindowTab
            service={activeService}
            agents={serviceAgents}
            serviceWindow={serviceWindow}
            onGenerate={generateServiceUi}
            onCopyCodexPrompt={copyServiceUiPrompt}
            copied={serviceWindowCopied}
          />
        ) : null}

        {activeTab === "Think" ? (
          <ThinkOperatingTab
            projectName={activeService.name}
            service={activeService}
            agents={serviceAgents}
            directionInput={thinkDirectionInput}
            sessions={thinkSessions}
            productWindows={productWindows}
            specs={specs}
            clarifyingQuestions={clarifyingQuestions}
            selectedSessionId={selectedThinkSessionId}
            mode={thinkMode}
            artifactType={thinkArtifactType}
            onDirectionInputChange={setThinkDirectionInput}
            onModeChange={setThinkMode}
            onArtifactTypeChange={setThinkArtifactType}
            onSelectSession={setSelectedThinkSessionId}
            onCreateProductDirection={createProductDirection}
            onCreateBuildTask={createBuildTaskFromThinkSession}
            onRegenerateProductWindow={regenerateProductWindow}
            onApproveProductWindow={approveProductWindow}
            onCreateProductWindowBuildTask={createBuildTaskFromProductWindow}
            onGenerateServiceBlueprint={generateServiceBlueprintForWorkspace}
            onGenerateBuildPlan={createPlanAndTasksFromSpec}
            thinkingWithAgent={thinkingWithAgent}
          />
        ) : null}

        {activeTab === "Build" ? (
          <BuildOperatingTab
            tasksContent={
              <DevelopmentTasksTab
                project={activeProject}
                tasks={developmentTasks}
                taskResults={developmentTaskResults}
                specs={specs}
                plans={plans}
                taskLists={taskLists}
                inboxValue={devTaskInput}
                selectedTaskId={selectedDevTaskId}
                resultInput={devTaskResultInput}
                dispatchingTaskId={dispatchingDevelopmentTaskId}
                githubDispatchingTaskId={githubDispatchingTaskId}
                dispatchMessage={developmentTaskDispatchMessage}
                copiedGoalTaskId={copiedGoalTaskId}
                copiedGithubIssueTaskId={copiedGithubIssueTaskId}
                localBridgeHealth={localBridgeHealth}
                checkingLocalBridge={checkingLocalBridge}
                refreshingBridgeTaskId={refreshingBridgeTaskId}
                buildingWithAgent={buildingWithAgent}
                onInboxChange={setDevTaskInput}
                onGeneratePlanFromSpec={createPlanAndTasksFromSpec}
                onCreateTask={createDevelopmentTask}
                onSelectTask={(task) => {
                  setSelectedDevTaskId(task.id);
                  setDevTaskResultInput(task.resultRaw || "");
                }}
                onUpdateTask={updateDevelopmentTask}
                onRegenerateGoal={regenerateDevelopmentTaskGoal}
                onCopyGoal={copyDevelopmentTaskGoal}
                onCheckLocalBridge={checkLocalBridge}
                onDispatchTask={dispatchDevelopmentTask}
                onCreateGithubIssue={createGithubIssueForTask}
                onCopyGithubIssueBody={copyGithubIssueBody}
                onRefreshBridgeStatus={refreshDevelopmentTaskBridgeStatus}
                onImportBridgeResult={importDevelopmentTaskBridgeResult}
                onApplyRecommendedResultStatus={applyDevelopmentTaskResultRecommendation}
                onResultInputChange={setDevTaskResultInput}
                onImportResult={importDevelopmentTaskResult}
              />
            }
          />
        ) : null}

        {activeTab === "Run" ? (
          <RunOperatingTab
            input={runIssueInput}
            issues={runIssues}
            selectedIssueId={selectedRunIssueId}
            onInputChange={setRunIssueInput}
            onReview={() => reviewRunIssue()}
            onQuickAction={startRunQuickAction}
            onSelectIssue={setSelectedRunIssueId}
            onCreateBuildTask={createBuildTaskFromRunIssue}
            runningWithAgent={runningWithAgent}
          />
        ) : null}
      </div>
    </main>
  );
}

function ArchivedThinkOperatingTab({
  directionInput,
  sessions,
  productWindows,
  selectedSessionId,
  mode,
  artifactType,
  onDirectionInputChange,
  onModeChange,
  onArtifactTypeChange,
  onSelectSession,
  onCreateProductDirection,
  onCreateBuildTask,
  onRegenerateProductWindow,
  onApproveProductWindow,
  onCreateProductWindowBuildTask,
  thinkingWithAgent,
}: {
  directionInput: string;
  sessions: ThinkSession[];
  productWindows: ProductWindow[];
  selectedSessionId: string;
  mode: ThinkMode;
  artifactType: ThinkArtifactType;
  onDirectionInputChange: (value: string) => void;
  onModeChange: (value: ThinkMode) => void;
  onArtifactTypeChange: (value: ThinkArtifactType) => void;
  onSelectSession: (id: string) => void;
  onCreateProductDirection: () => void;
  onCreateBuildTask: (session: ThinkSession, recommendation: RecommendedBuildTask) => void;
  onRegenerateProductWindow: (session: ThinkSession) => void;
  onApproveProductWindow: (productWindow: ProductWindow) => void;
  onCreateProductWindowBuildTask: (session: ThinkSession, productWindow: ProductWindow) => void;
  thinkingWithAgent: boolean;
}) {
  const quickStarts = [
    { title: "Clarify idea", description: "Turn messy input into clear product direction.", mode: "clarify_idea" },
    { title: "Define MVP", description: "Cut scope into the first useful version.", mode: "define_mvp" },
    { title: "Create feature spec", description: "Turn an idea into build-ready detail.", mode: "create_feature_spec" },
    { title: "Plan roadmap", description: "Sequence what should happen first, next, and later.", mode: "plan_roadmap" },
    { title: "Make decision", description: "Compare options and choose a path.", mode: "make_decision" },
    { title: "Analyze risk", description: "Find weak spots before building.", mode: "analyze_risk" },
  ] as const;
  const artifacts = [
    { title: "Product Brief", description: "What are we building, for whom, and why?", artifactType: "product_brief" },
    { title: "Roadmap", description: "What should happen first, next, and later?", artifactType: "roadmap" },
    { title: "Decisions", description: "Track important product choices.", artifactType: "decision_memo" },
    { title: "Feature Specs", description: "Turn ideas into Build-ready work.", artifactType: "feature_spec" },
  ] as const;
  const selectedSession = sessions.find((session) => session.id === selectedSessionId) || sessions[0];
  const selectedProductWindow = selectedSession
    ? productWindows.find((window) => window.thinkSessionId === selectedSession.id)
    : undefined;

  function startThinking(label: string, nextMode: ThinkMode) {
    onModeChange(nextMode);
    onDirectionInputChange(`${label}: `);
  }

  function startArtifact(label: string, nextArtifactType: ThinkArtifactType) {
    onArtifactTypeChange(nextArtifactType);
    onDirectionInputChange(`${label}: `);
  }

  return (
    <div className="space-y-6">
      <Panel>
        <PanelBody>
          <div className="mx-auto max-w-4xl py-6 text-center">
            <p className="font-mono text-xs font-semibold uppercase text-electric">Think</p>
            <h2 className="mt-3 text-4xl font-semibold tracking-normal text-ink md:text-5xl">
              Shape the product before you build it.
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-slateText">
              Think with Brainpress to clarify ideas, define the MVP, make product decisions, and turn messy founder thinking into buildable direction.
            </p>
          </div>

          <div className="mx-auto max-w-4xl rounded-lg border border-blue-100 bg-blue-50/60 p-4">
            <FieldLabel>What are we trying to figure out?</FieldLabel>
            <TextArea
              className="mt-3 min-h-36 bg-white text-base"
              value={directionInput}
              onChange={(event) => onDirectionInputChange(event.target.value)}
              placeholder="Describe an idea, user problem, feature, technical tradeoff, competitor insight, or risk..."
            />
            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm leading-6 text-blue-900">
                Example: "I want Brainpress to help founders manage Codex without copy-pasting prompts."
              </p>
              <Button variant="primary" onClick={onCreateProductDirection} disabled={thinkingWithAgent || !directionInput.trim()}>
                <Sparkles className="h-4 w-4" />
                {thinkingWithAgent ? "Thinking..." : "Think with Brainpress"}
              </Button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <TaskChip>Mode: {formatThinkMode(mode)}</TaskChip>
              <TaskChip>Artifact: {formatThinkArtifactType(artifactType)}</TaskChip>
            </div>
          </div>
        </PanelBody>
      </Panel>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {quickStarts.map(({ title, description, mode: quickMode }, index) => (
          <button
            key={`quick-start-${index}-${title}`}
            className={cx(
              "rounded-lg border bg-white p-5 text-left transition hover:border-electric/40 hover:bg-blue-50/40 hover:shadow-sm",
              mode === quickMode ? "border-electric/50 ring-4 ring-electric/10" : "border-line",
            )}
            onClick={() => startThinking(title, quickMode)}
          >
            <p className="font-semibold text-ink">{title}</p>
            <p className="mt-2 text-sm leading-6 text-slateText">{description}</p>
          </button>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
        <Panel>
          <PanelBody>
            <SectionHeader title="Co-create artifacts" eyebrow="Direction" />
            <div className="grid gap-3 md:grid-cols-2">
              {artifacts.map(({ title, description, artifactType: nextArtifactType }, index) => (
                <div
                  key={`artifact-${index}-${title}`}
                  className={cx(
                    "rounded-lg border bg-white p-4",
                    artifactType === nextArtifactType ? "border-electric/50 ring-4 ring-electric/10" : "border-line",
                  )}
                >
                  <p className="font-semibold text-ink">{title}</p>
                  <p className="mt-2 min-h-12 text-sm leading-6 text-slateText">{description}</p>
                  <Button className="mt-4" onClick={() => startArtifact(title, nextArtifactType)}>
                    <Wand2 className="h-4 w-4" />
                    Start
                  </Button>
                </div>
              ))}
            </div>
          </PanelBody>
        </Panel>

        <Panel>
          <PanelBody>
            <SectionHeader title="Recent thinking" eyebrow="Learn" />
            {sessions.length ? (
              <div className="space-y-3">
                {sessions.map((session) => (
                  <button
                    key={session.id}
                    className={cx(
                      "w-full rounded-lg border bg-white p-4 text-left transition hover:border-electric/40 hover:bg-blue-50/30",
                      selectedSession?.id === session.id ? "border-electric/50" : "border-line",
                    )}
                    onClick={() => onSelectSession(session.id)}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium text-ink">{session.title}</p>
                      <TaskChip>{formatThinkMode(session.mode)}</TaskChip>
                    </div>
                    <p className="mt-2 line-clamp-3 text-sm leading-6 text-slateText">{session.summary}</p>
                  </button>
                ))}
              </div>
            ) : (
              <EmptyState title="No decisions yet" detail="Start by describing what you are trying to figure out." />
            )}
          </PanelBody>
        </Panel>
      </div>

      {selectedSession ? (
        <Panel>
          <PanelBody>
            <ThinkSessionReview
              session={selectedSession}
              productWindow={selectedProductWindow}
              onCreateBuildTask={onCreateBuildTask}
              onRegenerateProductWindow={onRegenerateProductWindow}
              onApproveProductWindow={onApproveProductWindow}
              onCreateProductWindowBuildTask={onCreateProductWindowBuildTask}
            />
          </PanelBody>
        </Panel>
      ) : null}
    </div>
  );
}
function ThinkSessionReview({
  session,
  productWindow,
  onCreateBuildTask,
  onRegenerateProductWindow,
  onApproveProductWindow,
  onCreateProductWindowBuildTask,
}: {
  session: ThinkSession;
  productWindow?: ProductWindow;
  onCreateBuildTask: (session: ThinkSession, recommendation: RecommendedBuildTask) => void;
  onRegenerateProductWindow: (session: ThinkSession) => void;
  onApproveProductWindow: (productWindow: ProductWindow) => void;
  onCreateProductWindowBuildTask: (session: ThinkSession, productWindow: ProductWindow) => void;
}) {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-xs font-semibold uppercase text-electric">Generated product direction</p>
          <h3 className="mt-2 text-2xl font-semibold text-ink">{session.title}</h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slateText">{session.summary}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <AgentSourceBadge source={session.agentSource} model={session.agentModel} error={session.agentError} />
          <TaskChip>{formatThinkMode(session.mode)}</TaskChip>
          <TaskChip>{formatThinkArtifactType(session.artifactType)}</TaskChip>
          <TaskChip>{session.status.replaceAll("_", " ")}</TaskChip>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ThinkTextCard title="Product direction" value={session.productDirection} />
        <ThinkTextCard title="User problem" value={session.userProblem} />
        <ThinkTextCard title="Target user" value={session.targetUser} />
        <ThinkTextCard title="Proposed solution" value={session.proposedSolution} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SummaryList title="MVP scope" items={session.mvpScope} />
        <SummaryList title="Feature ideas" items={session.featureIdeas} />
        <SummaryList title="Decisions" items={session.decisions} />
        <SummaryList title="Risks" items={session.risks} />
        <SummaryList title="Open questions" items={session.openQuestions} />
      </div>

      {productWindow ? (
        <ProductWindowPreview
          productWindow={productWindow}
          onRegenerate={() => onRegenerateProductWindow(session)}
          onApprove={() => onApproveProductWindow(productWindow)}
          onCreateBuildTask={() => onCreateProductWindowBuildTask(session, productWindow)}
        />
      ) : (
        <div className="rounded-lg border border-dashed border-blue-200 bg-blue-50/40 p-5">
          <p className="font-semibold text-ink">Product Window</p>
          <p className="mt-2 text-sm leading-6 text-slateText">
            Brainpress can generate a browser-style concept preview from this Think session before you commit agent build work.
          </p>
          <Button className="mt-4" onClick={() => onRegenerateProductWindow(session)}>
            <Wand2 className="h-4 w-4" />
            Generate Product Window
          </Button>
        </div>
      )}

      <div className="rounded-lg border border-blue-100 bg-blue-50/50 p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="font-semibold text-ink">Recommended Build tasks</p>
            <p className="mt-1 text-sm leading-6 text-slateText">Convert only the tasks you want agents to build next.</p>
          </div>
        </div>
        {session.recommendedBuildTasks.length ? (
          <div className="grid gap-3 lg:grid-cols-2">
            {session.recommendedBuildTasks.map((recommendation, index) => (
              <div key={`recommendation-${session.id}-${index}-${recommendation.title}`} className="rounded-lg border border-line bg-white p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium text-ink">{recommendation.title}</p>
                  <TaskChip>{recommendation.taskType.replaceAll("_", " ")}</TaskChip>
                  <TaskChip>{recommendation.priority}</TaskChip>
                </div>
                <p className="mt-2 text-sm leading-6 text-slateText">{recommendation.reason}</p>
                <SummaryList title="Acceptance checks" items={recommendation.acceptanceCriteria} />
                <Button className="mt-4" variant="primary" onClick={() => onCreateBuildTask(session, recommendation)}>
                  <Plus className="h-4 w-4" />
                  Create Build Task
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="No Build task recommended yet" detail="Add a little more product direction and Brainpress will suggest the next buildable task." />
        )}
      </div>
    </div>
  );
}

function ProductWindowPreview({
  productWindow,
  onRegenerate,
  onApprove,
  onCreateBuildTask,
}: {
  productWindow: ProductWindow;
  onRegenerate: () => void;
  onApprove: () => void;
  onCreateBuildTask: () => void;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-slate-50 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-rose-300" />
            <span className="h-2.5 w-2.5 rounded-full bg-amber-300" />
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-300" />
          </div>
          <div className="min-w-0 rounded-md border border-line bg-white px-3 py-1 font-mono text-xs text-slate-500">
            {productWindow.route}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <TaskChip>{productWindow.previewType.replaceAll("_", " ")}</TaskChip>
          <TaskChip>{productWindow.status.replaceAll("_", " ")}</TaskChip>
          <TaskChip>Concept preview</TaskChip>
        </div>
      </div>

      <div className="space-y-5 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="font-mono text-xs font-semibold uppercase text-electric">Product Window</p>
            <h3 className="mt-2 text-2xl font-semibold text-ink">{productWindow.title}</h3>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slateText">{productWindow.screenDescription}</p>
            <p className="mt-2 text-xs font-medium text-slate-500">
              This is a visual thinking artifact, not live production code.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={onRegenerate}>
              <Wand2 className="h-4 w-4" />
              Regenerate Product Window
            </Button>
            <Button onClick={onApprove}>
              <CheckCircle2 className="h-4 w-4" />
              Approve Direction
            </Button>
            <Button variant="primary" onClick={onCreateBuildTask}>
              <Plus className="h-4 w-4" />
              Create Build Task from Product Window
            </Button>
          </div>
        </div>

        <div className="rounded-lg border border-blue-100 bg-blue-50/60 p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase text-blue-700">First screen</p>
              <h4 className="mt-2 text-xl font-semibold text-ink">{productWindow.title}</h4>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-blue-950">{productWindow.userScenario}</p>
            </div>
            <Button variant="primary">{productWindow.primaryCTA}</Button>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {productWindow.sections.map((section) => (
            <div key={section.id} className={cx("rounded-lg border bg-white p-4", productWindowSectionTone(section.componentType))}>
              <div className="mb-3 flex items-center justify-between gap-2">
                <p className="font-semibold text-ink">{section.title}</p>
                <TaskChip>{section.componentType.replaceAll("_", " ")}</TaskChip>
              </div>
              <p className="text-xs font-medium uppercase text-slate-500">{section.purpose}</p>
              <p className="mt-2 text-sm leading-6 text-slateText">{section.content}</p>
            </div>
          ))}
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <SummaryList title="User flow" items={productWindow.userFlow} />
          <SummaryList title="UI principles" items={productWindow.uiPrinciples} />
          <SummaryList title="Open questions" items={productWindow.openQuestions} />
        </div>
      </div>
    </div>
  );
}

function productWindowSectionTone(type: ProductWindow["sections"][number]["componentType"]) {
  if (type === "hero" || type === "input_console") return "border-blue-100";
  if (type === "dashboard_metric" || type === "status_panel") return "border-emerald-100";
  if (type === "qa_panel" || type === "infrastructure_panel") return "border-amber-100";
  return "border-line";
}

function archivedApplyProductWindowSuggestion(
  productWindow: ProductWindow,
  suggestion: ThinkAgentResult["productWindowSuggestion"],
): ProductWindow {
  if (!suggestion) return productWindow;
  const suggestedSections = suggestion.sections.filter(Boolean);
  return {
    ...productWindow,
    title: suggestion.title || productWindow.title,
    route: suggestion.route || productWindow.route,
    primaryCTA: suggestion.primaryCTA || productWindow.primaryCTA,
    sections: productWindow.sections.map((section, index) => ({
      ...section,
      title: suggestedSections[index] || section.title,
      content: suggestedSections[index] ? `Founder-facing preview section: ${suggestedSections[index]}` : section.content,
    })),
  };
}

function ThinkTextCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-lg border border-line bg-white p-4">
      <p className="text-xs font-semibold uppercase text-blue-700">{title}</p>
      <p className="mt-2 text-sm leading-6 text-slateText">{value || "Not enough signal yet."}</p>
    </div>
  );
}

function formatThinkMode(mode: ThinkMode) {
  const labels: Record<ThinkMode, string> = {
    open_thinking: "Open thinking",
    clarify_idea: "Clarify idea",
    define_mvp: "Define MVP",
    create_feature_spec: "Create feature spec",
    plan_roadmap: "Plan roadmap",
    make_decision: "Make decision",
    analyze_risk: "Analyze risk",
  };
  return labels[mode];
}

function formatThinkArtifactType(type: ThinkArtifactType) {
  const labels: Record<ThinkArtifactType, string> = {
    product_brief: "Product Brief",
    roadmap: "Roadmap",
    decision_memo: "Decisions",
    feature_spec: "Feature Specs",
    risk_analysis: "Risk Analysis",
    mvp_scope: "MVP Scope",
  };
  return labels[type];
}

function BuildOperatingTab({
  tasksContent,
}: {
  tasksContent: ReactNode;
}) {
  return <>{tasksContent}</>;
}

function ServiceOverviewTab({
  service,
  agents,
  specs,
  plans,
  tasks,
  runIssues,
  serviceWindow,
  onGenerateServiceBlueprint,
  onGenerateServiceWindow,
  onCopyCodexPrompt,
  copied,
}: {
  service: BrainpressService;
  agents: ServiceAgent[];
  specs: BrainpressSpec[];
  plans: BrainpressPlan[];
  tasks: DevelopmentTask[];
  runIssues: RunIssue[];
  serviceWindow?: ServiceWindow;
  onGenerateServiceBlueprint: () => void;
  onGenerateServiceWindow: () => void;
  onCopyCodexPrompt: () => void;
  copied: boolean;
}) {
  const latestSpec = specs[0];
  const openQuestionsCount = specs.reduce((count, spec) => count + spec.openQuestions.length, 0);
  const mainAgent = agents.find((agent) => agent.id === service.mainAgentId) || agents[0];
  const subAgentCount = Math.max(agents.length - (mainAgent ? 1 : 0), 0);
  const hasBlueprint = Boolean(service.serviceWorkflow.length && service.successMetrics.length && agents.length > 1);
  const hasServiceWindow = serviceWindow?.status === "generated" && serviceWindow.screens.length > 0;
  const nextAction = !hasBlueprint
    ? "Generate the Service Blueprint so Brainpress can define the promise, agent team, workflow, approvals, and success metrics."
    : openQuestionsCount
      ? `Answer ${openQuestionsCount} open question${openQuestionsCount === 1 ? "" : "s"} before deeper Build work.`
      : !hasServiceWindow
        ? "Generate UI/UX so ServiceWindow shows what users will actually interact with."
        : latestSpec
          ? "Export a Codex Build Prompt or generate ordered Build tasks from the Service Spec."
          : "Start in Think to refine the Service Spec and next Build direction.";
  return (
    <section className="rounded-lg border border-slate-800 bg-[#05070d] p-5 text-white shadow-2xl">
      <CanvasSurfaceBackdrop />
      <div className="relative z-10 grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-lg border border-white/10 bg-white/[0.045] p-6">
          <p className="font-mono text-xs font-semibold uppercase tracking-wide text-blue-300">Service Overview</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-normal">Create and operate this agent-based Service.</h2>
          <p className="mt-4 text-sm leading-6 text-slate-400">{service.description}</p>
          <div className="mt-6 grid gap-3 md:grid-cols-2">
            <ServiceMetric title="Service Promise" value={service.servicePromise} />
            <ServiceMetric title="Target Customer" value={service.targetCustomer} />
            <ServiceMetric title="Desired Outcome" value={service.desiredOutcome} />
            <ServiceMetric title="Main Agent" value={mainAgent?.name || "Main agent not configured yet"} />
            <ServiceMetric title="Sub-agents" value={`${subAgentCount} supporting agent${subAgentCount === 1 ? "" : "s"}`} />
            <ServiceMetric title="ServiceWindow" value={hasServiceWindow ? "generated" : "empty"} />
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button variant="primary" onClick={onGenerateServiceBlueprint}>
              <Wand2 className="h-4 w-4" />
              Generate Service Blueprint
            </Button>
            <Button onClick={onGenerateServiceWindow}>
              <Sparkles className="h-4 w-4" />
              Generate UI/UX
            </Button>
            <Button onClick={onCopyCodexPrompt} disabled={!hasServiceWindow}>
              <Clipboard className="h-4 w-4" />
              {copied ? "Copied" : "Export Codex Build Prompt"}
            </Button>
          </div>
        </div>

        <div className="grid gap-4">
          <div className="rounded-lg border border-white/10 bg-white/[0.045] p-5">
            <p className="font-mono text-xs font-semibold uppercase tracking-wide text-blue-300">Think / Build / Run Status</p>
            <div className="mt-4 grid gap-3">
              <ServiceMetric title="Spec" value={latestSpec ? latestSpec.clarificationStatus.replace("_", " ") : "No Service Spec yet"} />
              <ServiceMetric title="Current Stage" value={service.currentStage.replace("_", " ")} />
              <ServiceMetric title="Build Plans" value={`${plans.length} technical plan${plans.length === 1 ? "" : "s"}`} />
              <ServiceMetric title="Build Tasks" value={`${tasks.length} Codex-ready task${tasks.length === 1 ? "" : "s"}`} />
              <ServiceMetric title="Run Reviews" value={`${runIssues.length} service operation review${runIssues.length === 1 ? "" : "s"}`} />
            </div>
          </div>
          <div className="rounded-lg border border-amber-300/20 bg-amber-300/10 p-5">
            <p className="font-mono text-xs font-semibold uppercase tracking-wide text-amber-100">Next recommended action</p>
            <p className="mt-2 text-sm leading-6 text-amber-50">
              {nextAction}
            </p>
          </div>
          <SummaryList title="Service Workflow" items={service.serviceWorkflow.slice(0, 5)} />
          <SummaryList title="Success Metrics" items={service.successMetrics.slice(0, 5)} />
        </div>
      </div>
    </section>
  );
}

function AgentTeamTab({ service, agents }: { service: BrainpressService; agents: ServiceAgent[] }) {
  const mainAgent = agents.find((agent) => agent.id === service.mainAgentId) || agents[0];
  const subAgents = agents.filter((agent) => agent.id !== mainAgent?.id);
  return (
    <section className="rounded-lg border border-slate-800 bg-[#05070d] p-5 text-white shadow-2xl">
      <div className="mb-5">
        <p className="font-mono text-xs font-semibold uppercase tracking-wide text-blue-300">Agent Team</p>
        <h2 className="mt-2 text-3xl font-semibold tracking-normal">Agents that operate this Service.</h2>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
          Agents are structured definitions for now. Codex is the first execution provider; autonomous execution comes later.
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        {mainAgent ? <ServiceAgentCard agent={mainAgent} title="Main Agent" prominent /> : null}
        <div className="grid gap-4">
          {subAgents.length ? subAgents.map((agent) => <ServiceAgentCard key={agent.id} agent={agent} title="Sub-agent" />) : (
            <div className="rounded-lg border border-dashed border-white/15 bg-white/[0.03] p-5 text-sm leading-6 text-slate-400">
              No sub-agents yet. Think can propose sub-agents as the service workflow becomes clearer.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function ServiceWindowTab({
  service,
  agents,
  serviceWindow,
  onGenerate,
  onCopyCodexPrompt,
  copied,
}: {
  service: BrainpressService;
  agents: ServiceAgent[];
  serviceWindow?: ServiceWindow;
  onGenerate: () => void;
  onCopyCodexPrompt: () => void;
  copied: boolean;
}) {
  const isGenerated = serviceWindow?.status === "generated" && serviceWindow.screens.length > 0;
  return (
    <section className="overflow-hidden rounded-lg border border-slate-800 bg-[#05070d] text-white shadow-2xl">
      <div className="border-b border-white/10 bg-white/[0.035] p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="font-mono text-xs font-semibold uppercase tracking-wide text-blue-300">ServiceWindow</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-normal">Generated UI/UX for the agent service.</h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
              ServiceWindow shows the front office customers or founders use to interact with this agent-based Service.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={onGenerate}>
              <Sparkles className="h-4 w-4" />
              Generate UI/UX
            </Button>
            <Button variant="primary" onClick={onCopyCodexPrompt} disabled={!isGenerated}>
              <Clipboard className="h-4 w-4" />
              {copied ? "Copied" : "Export Codex Build Prompt"}
            </Button>
          </div>
        </div>
      </div>

      {!isGenerated ? (
        <div className="p-8">
          <div className="rounded-lg border border-dashed border-white/15 bg-white/[0.03] p-8 text-center">
            <p className="text-xl font-semibold text-white">No service UI generated yet.</p>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-400">
              Generate the first interface for this agent service based on the current Service Spec, Agent Team, and Build Plan.
            </p>
            <Button className="mt-5" variant="primary" onClick={onGenerate}>
              <Sparkles className="h-4 w-4" />
              Generate UI/UX
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid gap-5 p-5 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="overflow-hidden rounded-lg border border-cyan-300/20 bg-[#101827] shadow-2xl shadow-cyan-950/20">
            <div className="flex items-center justify-between border-b border-white/10 bg-white/[0.04] px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="flex gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-rose-300" />
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-300" />
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-300" />
                </div>
                <span className="font-mono text-xs text-slate-400">/{service.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}</span>
              </div>
              <TaskChip>Service UI</TaskChip>
            </div>
            <div className="bg-[#f8fafc] p-5 text-slate-950">
              <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">{service.targetCustomer}</p>
              <h3 className="mt-3 text-3xl font-semibold tracking-normal">{service.name}</h3>
              <p className="mt-3 text-sm leading-6 text-slate-600">{service.servicePromise}</p>
              <div className="mt-6 grid gap-3 md:grid-cols-3">
                {serviceWindow.screens.map((screen, index) => (
                  <div key={`service-window-screen-${index}-${screen.id}`} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="mb-3 h-1.5 w-12 rounded-full bg-blue-600" />
                    <p className="font-semibold">{screen.name}</p>
                    <p className="mt-2 text-xs leading-5 text-slate-500">{screen.purpose}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="grid gap-4">
            <SummaryList title="Primary Flow" items={serviceWindow.primaryFlow} />
            <SummaryList title="Agent Interaction Points" items={serviceWindow.agentInteractionPoints} />
            <SummaryList title="Human Approval Points" items={serviceWindow.humanApprovalPoints} />
            <SummaryList title="Agent Team" items={agents.map((agent) => `${agent.name}: ${agent.role}`)} />
          </div>
        </div>
      )}
    </section>
  );
}

function ServiceMetric({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-slate-950/60 p-4">
      <p className="font-mono text-[11px] uppercase tracking-wide text-slate-500">{title}</p>
      <p className="mt-2 text-sm leading-6 text-slate-200">{value}</p>
    </div>
  );
}

function ServiceAgentCard({ agent, title, prominent = false }: { agent: ServiceAgent; title: string; prominent?: boolean }) {
  return (
    <div className={cx("rounded-lg border p-5 shadow-2xl", prominent ? "border-blue-300/25 bg-blue-400/10" : "border-white/10 bg-white/[0.045]")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-xs font-semibold uppercase tracking-wide text-blue-300">{title}</p>
          <h3 className="mt-2 text-xl font-semibold text-white">{agent.name}</h3>
          <p className="mt-2 text-sm leading-6 text-slate-400">{agent.goal}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <TaskChip>{agent.permissionLevel}</TaskChip>
          <TaskChip>{agent.status}</TaskChip>
        </div>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <SummaryList title="Inputs" items={agent.inputs} />
        <SummaryList title="Outputs" items={agent.outputs} />
        <SummaryList title="Tools" items={agent.tools} />
        <SummaryList title="Escalation" items={agent.escalationRules} />
      </div>
      <p className="mt-4 text-sm leading-6 text-slate-400">Success metric: {agent.successMetric}</p>
    </div>
  );
}

function RunOperatingTab({
  input,
  issues,
  selectedIssueId,
  onInputChange,
  onReview,
  onQuickAction,
  onSelectIssue,
  onCreateBuildTask,
  runningWithAgent,
}: {
  input: string;
  issues: RunIssue[];
  selectedIssueId: string;
  onInputChange: (value: string) => void;
  onReview: () => void;
  onQuickAction: (label: string) => void;
  onSelectIssue: (id: string) => void;
  onCreateBuildTask: (issue: RunIssue) => void;
  runningWithAgent: boolean;
}) {
  const [mobilePane, setMobilePane] = useState<"chat" | "canvas">("chat");
  const selectedIssue = issues.find((issue) => issue.id === selectedIssueId) || issues[0];

  return (
    <section className="overflow-hidden rounded-lg border border-slate-800 bg-[#05070d] text-white shadow-2xl">
      <MobileWorkSwitch active={mobilePane} onChange={setMobilePane} leftLabel="Chat" rightLabel="Ops Board" />
      <div className="grid min-h-[780px] lg:grid-cols-[380px_minmax(0,1fr)]">
        <aside className={cx("min-h-[780px] flex-col border-b border-white/10 bg-[#090d16] lg:flex lg:border-b-0 lg:border-r", mobilePane === "chat" ? "flex" : "hidden")}>
          <div className="border-b border-white/10 p-5">
            <p className="font-mono text-xs font-semibold uppercase tracking-wide text-blue-300">Brainpress</p>
            <h2 className="mt-1 text-xl font-semibold text-white">AI Operations Agent</h2>
            <p className="mt-3 text-sm leading-6 text-slate-400">
              Tell Brainpress what happened in the Service. It will sort infrastructure, QA, release, and feedback work into safe next steps.
            </p>
          </div>

          <div className="border-b border-white/10 p-4">
            <label className="text-sm font-medium text-slate-200">What do we need to run, verify, or fix?</label>
            <TextArea
              className="mt-3 min-h-36 border-white/10 bg-white/[0.05] text-sm text-white placeholder:text-slate-500 focus:border-blue-300/60 focus:ring-blue-400/10"
              value={input}
              onChange={(event) => onInputChange(event.target.value)}
              placeholder="Describe an infrastructure issue, deployment failure, Supabase problem, Vercel error, QA note, user feedback, or service bug..."
            />
            <Button className="mt-3" variant="primary" onClick={onReview} disabled={runningWithAgent || !input.trim()}>
              <ShieldCheck className="h-4 w-4" />
              {runningWithAgent ? "Reviewing..." : "Review with Run Agent"}
            </Button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="font-mono text-[11px] font-semibold uppercase tracking-wide text-slate-500">Recent run reviews</p>
              <span className="rounded-md border border-white/10 bg-white/[0.05] px-2 py-1 font-mono text-[11px] text-slate-400">
                {issues.length} captured
              </span>
            </div>
            {issues.length ? (
              <div className="space-y-3">
                {issues.map((issue) => (
                  <button
                    key={issue.id}
                    className={cx(
                      "w-full rounded-lg border p-4 text-left transition",
                      selectedIssue?.id === issue.id
                        ? "border-blue-300/50 bg-blue-400/10 shadow-lg shadow-blue-950/20"
                        : "border-white/10 bg-white/[0.04] hover:border-blue-300/40",
                    )}
                    onClick={() => onSelectIssue(issue.id)}
                  >
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium text-white">{issue.title}</p>
                      <div className="flex flex-wrap gap-2">
                        <AgentSourceBadge source={issue.agentSource} model={issue.agentModel} error={issue.agentError} />
                        <TaskChip>{issue.type}</TaskChip>
                      </div>
                    </div>
                    <p className="line-clamp-2 text-sm leading-6 text-slate-400">{issue.summary}</p>
                    {issue.provider ? <p className="mt-2 font-mono text-xs uppercase text-blue-300">{issue.provider}</p> : null}
                  </button>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-white/15 bg-white/[0.03] p-5 text-sm leading-6 text-slate-400">
                No run reviews yet. Describe an infrastructure issue, QA note, deployment failure, or user feedback item.
              </div>
            )}
          </div>
        </aside>

        <div className={cx("relative min-h-[780px] overflow-hidden bg-[#05070d] p-4 md:p-6 lg:block", mobilePane === "canvas" ? "block" : "hidden")}>
          <CanvasSurfaceBackdrop />

          <div className="relative z-10 mb-5 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="font-mono text-xs font-semibold uppercase tracking-wide text-blue-300">Run Canvas</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-normal text-white md:text-4xl">Run the Service after agents build it.</h2>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
                Use Brainpress to verify service flows, debug infrastructure, review feedback, and turn real service issues back into Build tasks.
              </p>
            </div>
            <div className="rounded-lg border border-amber-300/20 bg-amber-300/10 p-3 text-sm text-amber-100">
              <p className="font-mono text-[11px] uppercase tracking-wide">Approval gate</p>
              <p className="mt-1 text-xs leading-5 text-amber-200/80">No deploy, merge, or verified state without explicit approval.</p>
            </div>
          </div>

          <div className="relative z-10 grid gap-4 xl:grid-cols-4">
            <RunAgentCard
              title="Infrastructure Agent"
              description="Set up and debug the infrastructure this Service depends on."
              handles={[
                "Supabase setup",
                "database tables and migrations",
                "auth redirect URLs",
                "storage buckets",
                "row-level security policies",
                "environment variables",
                "Vercel deployment",
                "build settings",
                "custom domains",
                "preview vs production config",
                "API keys and webhooks",
              ]}
              actions={["Set up infrastructure", "Fix deployment", "Configure Supabase", "Configure Vercel"]}
              onAction={onQuickAction}
            />
            <RunAgentCard
              title="QA Agent"
              description="Verify that what agents built actually works in the browser."
              handles={["browser checks", "critical flows", "acceptance criteria", "manual QA", "regression checks"]}
              actions={["Run QA", "Create QA checklist"]}
              onAction={onQuickAction}
            />
            <RunAgentCard
              title="Release Agent"
              description="Prepare safe releases and catch blockers before shipping."
              handles={["release readiness", "changelog", "deployment checklist", "rollback risks", "production checks"]}
              actions={["Prepare Release", "Check Readiness"]}
              onAction={onQuickAction}
            />
            <RunAgentCard
              title="Feedback / Issue Agent"
              description="Turn user feedback and service issues into clear Build tasks."
              handles={["bug reports", "user feedback", "failed flows", "support notes", "feature requests from users"]}
              actions={["Analyze Feedback", "Create Build Task"]}
              onAction={onQuickAction}
            />
          </div>

          <div className="relative z-10 mt-5 rounded-lg border border-white/10 bg-slate-950/70 p-5 shadow-2xl shadow-black/20">
            {selectedIssue ? (
              <RunIssueReview issue={selectedIssue} onCreateBuildTask={() => onCreateBuildTask(selectedIssue)} />
            ) : (
              <div className="rounded-lg border border-dashed border-white/15 bg-white/[0.03] p-8 text-center">
                <p className="text-lg font-semibold text-white">Review with the Run Agent</p>
                <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-400">
                  Brainpress will turn service operations problems into likely causes, steps, risks, and Build tasks.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function RunAgentCard({
  title,
  description,
  handles,
  actions,
  onAction,
}: {
  title: string;
  description: string;
  handles: string[];
  actions: string[];
  onAction: (label: string) => void;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.045] p-5 shadow-2xl shadow-black/10 backdrop-blur">
      <p className="font-semibold text-white">{title}</p>
      <p className="mt-2 text-sm leading-6 text-slate-400">{description}</p>
      <p className="mt-4 font-mono text-xs font-semibold uppercase text-blue-300">Handles</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {handles.slice(0, 4).map((item, index) => (
          <span key={`run-agent-handle-${title}-${index}-${item}`} className="rounded-md border border-white/10 bg-white/[0.05] px-2 py-1 text-xs text-slate-300">
            {item}
          </span>
        ))}
        {handles.length > 4 ? (
          <span className="rounded-md border border-blue-300/20 bg-blue-400/10 px-2 py-1 text-xs text-blue-100">
            +{handles.length - 4}
          </span>
        ) : null}
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        {actions.map((action, index) => (
          <Button key={`run-agent-action-${title}-${index}-${action}`} onClick={() => onAction(action)}>
            {action}
          </Button>
        ))}
      </div>
    </div>
  );
}

function MobileWorkSwitch({
  active,
  onChange,
  leftLabel,
  rightLabel,
}: {
  active: "chat" | "canvas";
  onChange: (value: "chat" | "canvas") => void;
  leftLabel: string;
  rightLabel: string;
}) {
  return (
    <div className="border-b border-white/10 bg-[#070a12] p-2 lg:hidden">
      <div className="grid grid-cols-2 gap-1 rounded-md border border-white/10 bg-black/30 p-1">
        <button
          className={cx(
            "h-9 rounded-md text-sm font-medium transition",
            active === "chat" ? "bg-white text-slate-950" : "text-slate-400 hover:bg-white/[0.07] hover:text-white",
          )}
          onClick={() => onChange("chat")}
        >
          {leftLabel}
        </button>
        <button
          className={cx(
            "h-9 rounded-md text-sm font-medium transition",
            active === "canvas" ? "bg-white text-slate-950" : "text-slate-400 hover:bg-white/[0.07] hover:text-white",
          )}
          onClick={() => onChange("canvas")}
        >
          {rightLabel}
        </button>
      </div>
    </div>
  );
}

function RunIssueReview({ issue, onCreateBuildTask }: { issue: RunIssue; onCreateBuildTask: () => void }) {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-xs font-semibold uppercase text-blue-300">Detected issue type</p>
          <h3 className="mt-2 text-xl font-semibold text-white">{issue.title}</h3>
          <p className="mt-2 text-sm leading-6 text-slate-400">{issue.summary}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <AgentSourceBadge source={issue.agentSource} model={issue.agentModel} error={issue.agentError} />
          <TaskChip>{issue.type}</TaskChip>
          {issue.provider ? <TaskChip>{issue.provider}</TaskChip> : null}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <RunReviewList title="Likely causes" items={issue.likelyCauses} />
        <RunReviewList title="Recommended steps" items={issue.recommendedSteps} />
        <RunReviewList title="Required access" items={issue.requiredAccess} />
        <RunReviewList title="Verification steps" items={issue.verificationSteps} />
        <RunReviewList title="Risks" items={issue.risks} />
        <RunReviewList title="Suggested Build tasks" items={issue.recommendedBuildTasks} />
      </div>

      <Button variant="primary" onClick={onCreateBuildTask}>
        <Plus className="h-4 w-4" />
        Create Build Task
      </Button>
    </div>
  );
}

function RunReviewList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
      <p className="font-semibold text-white">{title}</p>
      {items.length ? (
        <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-400">
          {items.map((item, index) => (
            <li key={`run-review-${title}-${index}-${item}`}>- {item}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm leading-6 text-slate-500">Not enough signal yet.</p>
      )}
    </div>
  );
}

function CanvasSurfaceBackdrop() {
  return (
    <div
      className="pointer-events-none absolute inset-0 opacity-80"
      style={{
        backgroundImage:
          "linear-gradient(rgba(148,163,184,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.06) 1px, transparent 1px), radial-gradient(circle at 50% 24%, rgba(37,99,235,0.18), transparent 42%), radial-gradient(circle at 84% 68%, rgba(20,184,166,0.10), transparent 34%)",
        backgroundSize: "36px 36px, 36px 36px, 100% 100%, 100% 100%",
      }}
    />
  );
}

function DevelopmentTasksTab({
  project,
  tasks,
  taskResults,
  specs,
  plans,
  taskLists,
  inboxValue,
  selectedTaskId,
  resultInput,
  dispatchingTaskId,
  githubDispatchingTaskId,
  dispatchMessage,
  copiedGoalTaskId,
  copiedGithubIssueTaskId,
  localBridgeHealth,
  checkingLocalBridge,
  refreshingBridgeTaskId,
  buildingWithAgent,
  onInboxChange,
  onGeneratePlanFromSpec,
  onCreateTask,
  onSelectTask,
  onUpdateTask,
  onRegenerateGoal,
  onCopyGoal,
  onCheckLocalBridge,
  onDispatchTask,
  onCreateGithubIssue,
  onCopyGithubIssueBody,
  onRefreshBridgeStatus,
  onImportBridgeResult,
  onApplyRecommendedResultStatus,
  onResultInputChange,
  onImportResult,
}: {
  project: Project;
  tasks: DevelopmentTask[];
  taskResults: DevelopmentTaskResult[];
  specs: BrainpressSpec[];
  plans: BrainpressPlan[];
  taskLists: BrainpressTaskList[];
  inboxValue: string;
  selectedTaskId: string;
  resultInput: string;
  dispatchingTaskId: string | null;
  githubDispatchingTaskId: string | null;
  dispatchMessage: string;
  copiedGoalTaskId: string | null;
  copiedGithubIssueTaskId: string | null;
  localBridgeHealth: LocalBridgeUiState | null;
  checkingLocalBridge: boolean;
  refreshingBridgeTaskId: string | null;
  buildingWithAgent: boolean;
  onInboxChange: (value: string) => void;
  onGeneratePlanFromSpec: (spec: BrainpressSpec) => void;
  onCreateTask: () => void;
  onSelectTask: (task: DevelopmentTask) => void;
  onUpdateTask: (taskId: string, patch: Partial<DevelopmentTask>) => void;
  onRegenerateGoal: (task: DevelopmentTask) => void;
  onCopyGoal: (task: DevelopmentTask) => void;
  onCheckLocalBridge: () => void;
  onDispatchTask: (task: DevelopmentTask) => void;
  onCreateGithubIssue: (task: DevelopmentTask) => void;
  onCopyGithubIssueBody: (task: DevelopmentTask) => void;
  onRefreshBridgeStatus: (task: DevelopmentTask) => void;
  onImportBridgeResult: (task: DevelopmentTask) => void;
  onApplyRecommendedResultStatus: (task: DevelopmentTask, result: DevelopmentTaskResult) => void;
  onResultInputChange: (value: string) => void;
  onImportResult: (task: DevelopmentTask) => void;
}) {
  const [mobilePane, setMobilePane] = useState<"chat" | "canvas">("chat");
  const selectedTask = tasks.find((task) => task.id === selectedTaskId) || tasks[0];
  const selectedTaskResult = selectedTask ? taskResults.find((result) => result.taskId === selectedTask.id) : undefined;

  return (
    <section className="overflow-hidden rounded-lg border border-slate-800 bg-[#05070d] text-white shadow-2xl">
      <MobileWorkSwitch active={mobilePane} onChange={setMobilePane} leftLabel="Chat / Tasks" rightLabel="Canvas / Detail" />
      <div className="grid min-h-[780px] lg:grid-cols-[380px_minmax(0,1fr)]">
        <aside className={cx("min-h-[780px] flex-col border-b border-white/10 bg-[#090d16] lg:flex lg:border-b-0 lg:border-r", mobilePane === "chat" ? "flex" : "hidden")}>
          <div className="border-b border-white/10 p-5">
            <p className="font-mono text-xs font-semibold uppercase tracking-wide text-blue-300">Brainpress</p>
            <h2 className="mt-1 text-xl font-semibold text-white">AI Build Agent</h2>
            <p className="mt-3 text-sm leading-6 text-slate-400">
              Turn approved Service direction into agent-executable work with Codex goals, validation checks, and review gates.
            </p>
          </div>

          <div className="border-b border-white/10 p-4">
            <label className="text-sm font-medium text-slate-200">What should the agent build, fix, or improve?</label>
            <TextArea
              className="mt-3 min-h-36 border-white/10 bg-white/[0.05] text-sm text-white placeholder:text-slate-500 focus:border-blue-300/60 focus:ring-blue-400/10"
              value={inboxValue}
              onChange={(event) => onInboxChange(event.target.value)}
              placeholder="Describe a feature, bug, refactor, test, build failure, or improvement..."
            />
            <Button className="mt-3" variant="primary" onClick={onCreateTask} disabled={buildingWithAgent || !inboxValue.trim()}>
              <Wand2 className="h-4 w-4" />
              {buildingWithAgent ? "Creating..." : "Create Build Task"}
            </Button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="font-mono text-[11px] font-semibold uppercase tracking-wide text-slate-500">Agent task board</p>
              <span className="rounded-md border border-white/10 bg-white/[0.05] px-2 py-1 font-mono text-[11px] text-slate-400">
                {tasks.length} tracked
              </span>
            </div>
            {tasks.length ? (
              <div className="space-y-3">
                {tasks.map((task) => (
                  <button
                    key={task.id}
                    onClick={() => onSelectTask(task)}
                    className={cx(
                      "w-full rounded-lg border p-4 text-left transition",
                      selectedTask?.id === task.id
                        ? "border-blue-300/50 bg-blue-400/10 shadow-lg shadow-blue-950/20"
                        : "border-white/10 bg-white/[0.04] hover:border-blue-300/40",
                    )}
                  >
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium text-white">{task.title}</p>
                      <StatusPill value={task.status} />
                    </div>
                    <p className="line-clamp-1 text-sm leading-6 text-slate-500">
                      {task.taskType.replace("_", " ")} / {task.priority}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <AgentSourceBadge source={task.agentSource} model={task.agentModel} error={task.agentError} />
                      <TaskChip>{task.dispatchTarget}</TaskChip>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-white/15 bg-white/[0.03] p-5 text-sm leading-6 text-slate-400">
                No development tasks yet. Create the first Build task from founder intent or approved Service direction.
              </div>
            )}
          </div>
        </aside>

        <div className={cx("relative min-h-[780px] overflow-hidden bg-[#05070d] p-4 md:p-6 lg:block", mobilePane === "canvas" ? "block" : "hidden")}>
          <CanvasSurfaceBackdrop />
          <div className="relative z-10 mb-5 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="font-mono text-xs font-semibold uppercase tracking-wide text-blue-300">Task Execution Canvas</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-normal text-white md:text-4xl">Build software with agents.</h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
                Brainpress packages intent into Codex-ready goals, validates the work, and keeps approval explicit before anything ships.
              </p>
            </div>
            <div className="rounded-lg border border-emerald-300/20 bg-emerald-300/10 p-3 text-sm text-emerald-100">
              <p className="font-mono text-[11px] uppercase tracking-wide">Human approval</p>
              <p className="mt-1 text-xs leading-5 text-emerald-200/80">Dispatch, merge, deploy, and verified status require a person.</p>
            </div>
          </div>

          <SpecLoopBuildPanel
            specs={specs}
            plans={plans}
            taskLists={taskLists}
            onGeneratePlanFromSpec={onGeneratePlanFromSpec}
          />

          {selectedTask ? (
            <DevelopmentTaskDetail
              project={project}
              task={selectedTask}
              latestResult={selectedTaskResult}
              resultInput={resultInput}
              dispatching={dispatchingTaskId === selectedTask.id}
              githubDispatching={githubDispatchingTaskId === selectedTask.id}
              dispatchMessage={dispatchMessage}
              goalCopied={copiedGoalTaskId === selectedTask.id}
              githubIssueCopied={copiedGithubIssueTaskId === selectedTask.id}
              localBridgeHealth={localBridgeHealth}
              checkingLocalBridge={checkingLocalBridge}
              refreshingBridge={refreshingBridgeTaskId === selectedTask.id}
              onUpdate={(patch) => onUpdateTask(selectedTask.id, patch)}
              onRegenerateGoal={() => onRegenerateGoal(selectedTask)}
              onCopyGoal={() => onCopyGoal(selectedTask)}
              onCheckLocalBridge={onCheckLocalBridge}
              onDispatch={() => onDispatchTask(selectedTask)}
              onCreateGithubIssue={() => onCreateGithubIssue(selectedTask)}
              onCopyGithubIssueBody={() => onCopyGithubIssueBody(selectedTask)}
              onRefreshBridgeStatus={() => onRefreshBridgeStatus(selectedTask)}
              onImportBridgeResult={() => onImportBridgeResult(selectedTask)}
              onApplyRecommendedResultStatus={() => selectedTaskResult && onApplyRecommendedResultStatus(selectedTask, selectedTaskResult)}
              onResultInputChange={onResultInputChange}
              onImportResult={() => onImportResult(selectedTask)}
            />
          ) : (
            <div className="rounded-lg border border-dashed border-white/15 bg-white/[0.03] p-8 text-center">
              <p className="text-lg font-semibold text-white">Select or create a task</p>
              <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-400">
                Brainpress will show the structured task, dispatch target, result review, preview environment, and status history here.
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function SpecLoopBuildPanel({
  specs,
  plans,
  taskLists,
  onGeneratePlanFromSpec,
}: {
  specs: BrainpressSpec[];
  plans: BrainpressPlan[];
  taskLists: BrainpressTaskList[];
  onGeneratePlanFromSpec: (spec: BrainpressSpec) => void;
}) {
  const latestSpec = specs[0];
  const latestPlan = latestSpec ? plans.find((plan) => plan.specId === latestSpec.id) : undefined;
  const latestTaskList = latestPlan ? taskLists.find((taskList) => taskList.planId === latestPlan.id) : undefined;

  return (
    <div className="mb-5 rounded-lg border border-violet-300/20 bg-violet-300/[0.07] p-4 shadow-2xl shadow-violet-950/10">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="font-mono text-xs font-semibold uppercase tracking-wide text-violet-200">Spec Loop</p>
          <h3 className="mt-1 text-lg font-semibold text-white">
            {latestSpec ? latestSpec.title : "Create a Service Spec in Think first"}
          </h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
            {latestSpec
              ? "Brainpress plans the technical path and ordered agent tasks from the founder-facing Service Spec before implementation."
              : "Think creates the Service Spec. Build turns it into a technical plan, ordered tasks, Codex goals, and dispatch-ready DevelopmentTasks."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {latestSpec ? <TaskChip>{latestSpec.clarificationStatus.replace("_", " ")}</TaskChip> : null}
          {latestPlan ? <TaskChip>plan ready</TaskChip> : null}
          {latestTaskList ? <TaskChip>{latestTaskList.tasks.length} ordered tasks</TaskChip> : null}
        </div>
      </div>

      {latestSpec ? (
        <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_1fr_auto]">
          <div className="rounded-lg border border-white/10 bg-slate-950/60 p-3">
            <p className="font-mono text-[11px] uppercase text-violet-200">What</p>
            <p className="mt-1 text-sm leading-6 text-slate-300">{latestSpec.what}</p>
          </div>
          <div className="rounded-lg border border-white/10 bg-slate-950/60 p-3">
            <p className="font-mono text-[11px] uppercase text-violet-200">Why</p>
            <p className="mt-1 text-sm leading-6 text-slate-300">{latestSpec.why}</p>
          </div>
          <Button className="self-stretch" variant="primary" onClick={() => onGeneratePlanFromSpec(latestSpec)}>
            <Wand2 className="h-4 w-4" />
            Generate Plan + Tasks
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function DevelopmentTaskDetail({
  project,
  task,
  latestResult,
  resultInput,
  dispatching,
  githubDispatching,
  dispatchMessage,
  goalCopied,
  githubIssueCopied,
  localBridgeHealth,
  checkingLocalBridge,
  refreshingBridge,
  onUpdate,
  onRegenerateGoal,
  onCopyGoal,
  onCheckLocalBridge,
  onDispatch,
  onCreateGithubIssue,
  onCopyGithubIssueBody,
  onRefreshBridgeStatus,
  onImportBridgeResult,
  onApplyRecommendedResultStatus,
  onResultInputChange,
  onImportResult,
}: {
  project: Project;
  task: DevelopmentTask;
  latestResult?: DevelopmentTaskResult;
  resultInput: string;
  dispatching: boolean;
  githubDispatching: boolean;
  dispatchMessage: string;
  goalCopied: boolean;
  githubIssueCopied: boolean;
  localBridgeHealth: LocalBridgeUiState | null;
  checkingLocalBridge: boolean;
  refreshingBridge: boolean;
  onUpdate: (patch: Partial<DevelopmentTask>) => void;
  onRegenerateGoal: () => void;
  onCopyGoal: () => void;
  onCheckLocalBridge: () => void;
  onDispatch: () => void;
  onCreateGithubIssue: () => void;
  onCopyGithubIssueBody: () => void;
  onRefreshBridgeStatus: () => void;
  onImportBridgeResult: () => void;
  onApplyRecommendedResultStatus: () => void;
  onResultInputChange: (value: string) => void;
  onImportResult: () => void;
}) {
  const usesLocalBridge = task.dispatchTarget === "codex_cli" && task.dispatchMode === "local_bridge";
  const localBridgeReady = !usesLocalBridge || localBridgeHealth?.ok === true;
  const canSendToCodex = ["codex_cloud", "codex_cli"].includes(task.dispatchTarget) && localBridgeReady;
  const githubDispatch = prepareGithubDispatch(task, project);
  const isGithubDispatch = task.dispatchTarget === "github_issue";
  const canCreateGithubIssue = Boolean(githubDispatch.repository) && isGithubDispatch && !githubDispatching;

  return (
    <div className="space-y-5 text-white">
      <div className="rounded-lg border border-white/10 bg-slate-950/70 p-5 shadow-2xl shadow-black/20">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase text-blue-300">Task Detail</p>
          <h2 className="mt-1 text-2xl font-semibold text-white">{task.title}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">{task.description}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <AgentSourceBadge source={task.agentSource} model={task.agentModel} error={task.agentError} />
          <StatusPill value={task.status} />
        </div>
        </div>
      </div>

      <div className="grid gap-3 rounded-lg border border-white/10 bg-white/[0.035] p-4 md:grid-cols-3">
        <FormField label="Task type">
          <Select value={task.taskType} onChange={(event) => onUpdate({ taskType: event.target.value as DevelopmentTaskType })}>
            {developmentTaskTypes.map((type) => (
              <option key={type}>{type}</option>
            ))}
          </Select>
        </FormField>
        <FormField label="Priority">
          <Select value={task.priority} onChange={(event) => onUpdate({ priority: event.target.value as DevelopmentTaskPriority })}>
            {developmentTaskPriorities.map((priority) => (
              <option key={priority}>{priority}</option>
            ))}
          </Select>
        </FormField>
        <FormField label="Status">
          <Select value={task.status} onChange={(event) => onUpdate(updateDevelopmentTaskStatus(task, event.target.value as DevelopmentTaskStatus))}>
            {developmentTaskStatuses.map((status) => (
              <option key={status}>{status}</option>
            ))}
          </Select>
        </FormField>
      </div>

      <div className="grid gap-3 rounded-lg border border-white/10 bg-white/[0.035] p-4 md:grid-cols-2">
        <FormField label="Repo">
          <TextInput value={task.repo} onChange={(event) => onUpdate({ repo: event.target.value })} placeholder={project.repoPathOrUrl || "Repository path or URL"} />
        </FormField>
        <FormField label="Branch">
          <TextInput value={task.branch} onChange={(event) => onUpdate({ branch: event.target.value })} placeholder="feature/task-branch" />
        </FormField>
      </div>

      <div className="grid gap-3 rounded-lg border border-white/10 bg-white/[0.035] p-4 md:grid-cols-2">
        <FormField label="Dispatch target">
          <Select
            value={task.dispatchTarget}
            onChange={(event) => onUpdate({ dispatchTarget: event.target.value as DevelopmentTaskDispatchTarget })}
          >
            {developmentTaskDispatchTargets.map((target) => (
              <option key={target}>{target}</option>
            ))}
          </Select>
        </FormField>
        <FormField label="Dispatch mode">
          <TextInput value={task.dispatchMode} readOnly />
        </FormField>
      </div>

      <div className="rounded-lg border border-white/10 bg-white/[0.035] p-4">
        <FormField label="PR URL">
          <TextInput value={task.prUrl || ""} onChange={(event) => onUpdate({ prUrl: event.target.value })} placeholder="https://github.com/org/repo/pull/123" />
        </FormField>
      </div>

      <div className="rounded-lg border border-blue-300/20 bg-blue-400/10 p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="font-semibold text-blue-100">Dispatch</p>
            <p className="mt-1 text-sm leading-6 text-blue-200/80">
              Choose how Brainpress hands this structured task to Codex. GitHub Dispatch is the mobile-safe path; Local Bridge is for a desktop repo.
            </p>
            <p className="mt-2 text-xs leading-5 text-blue-200/70">
              Human approval is required before dispatch, merge, deploy, or marking verified.
            </p>
          </div>
          <Button variant="primary" onClick={onDispatch} disabled={dispatching || !canSendToCodex}>
            <Send className="h-4 w-4" />
            {dispatching ? "Sending..." : "Send to Codex"}
          </Button>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          <DispatchOptionCard
            title="Local Bridge"
            target="codex_cli"
            active={task.dispatchTarget === "codex_cli"}
            description="Desktop only. Best when your local repo and Brainpress bridge are running."
            onSelect={() => onUpdate({ dispatchTarget: "codex_cli" })}
          />
          <DispatchOptionCard
            title="GitHub Dispatch"
            target="github_issue"
            active={task.dispatchTarget === "github_issue"}
            description="Best for phone. Creates a GitHub issue/task package Codex can work from."
            onSelect={() => onUpdate({ dispatchTarget: "github_issue" })}
          />
          <DispatchOptionCard
            title="Codex Cloud"
            target="codex_cloud"
            active={task.dispatchTarget === "codex_cloud"}
            description="Use Codex web/iOS or GitHub @codex until direct API dispatch is configured."
            onSelect={() => onUpdate({ dispatchTarget: "codex_cloud" })}
          />
        </div>

        {usesLocalBridge ? (
          <div className="mt-4 rounded-lg border border-white/10 bg-slate-950/70 p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-semibold text-blue-100">Local Codex Bridge</p>
                <p className="mt-1 text-sm leading-6 text-blue-200/80">
                  Default URL: <span className="font-mono text-xs">{localBridgeHealth?.url || "http://localhost:4317"}</span>
                </p>
                <p className={cx("mt-2 text-sm leading-6", localBridgeHealth?.ok ? "text-emerald-700" : "text-amber-800")}>
                  {localBridgeHealth
                    ? localBridgeHealth.message
                    : "Check the local bridge before sending this task to Codex."}
                </p>
                {localBridgeHealth?.ok ? (
                  <p className="mt-1 font-mono text-xs text-slate-400">
                    {localBridgeHealth.name} {localBridgeHealth.version}
                  </p>
                ) : (
                  <p className="mt-1 text-sm text-slate-400">Setup: run <span className="font-mono text-xs">node scripts/brainpress-codex-bridge.js</span>.</p>
                )}
              </div>
              <Button onClick={onCheckLocalBridge} disabled={checkingLocalBridge}>
                <ShieldCheck className="h-4 w-4" />
                {checkingLocalBridge ? "Checking..." : "Check Local Bridge"}
              </Button>
            </div>
          </div>
        ) : null}

        {isGithubDispatch ? (
          <div className="mt-4 space-y-4 rounded-lg border border-white/10 bg-slate-950/70 p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-sm font-semibold text-blue-100">GitHub Dispatch</p>
                <p className="mt-1 text-sm leading-6 text-blue-200/80">
                  Phone and web-safe task handoff. Brainpress creates a GitHub-ready issue package and only marks dispatched after an issue URL exists.
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-400">{githubDispatch.guidance}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={onCopyGithubIssueBody}>
                  <Clipboard className="h-4 w-4" />
                  {githubIssueCopied ? "Copied" : "Copy GitHub Issue Body"}
                </Button>
                <Button variant="primary" onClick={onCreateGithubIssue} disabled={!canCreateGithubIssue}>
                  <Send className="h-4 w-4" />
                  {githubDispatching ? "Creating..." : "Create GitHub Issue"}
                </Button>
              </div>
            </div>

            <FormField label="Repository">
              <TextInput
                value={task.repo}
                onChange={(event) => onUpdate({ repo: event.target.value })}
                placeholder="owner/repo or https://github.com/owner/repo"
              />
            </FormField>
            {!githubDispatch.repository ? (
              <p className="rounded-md border border-amber-300/20 bg-amber-300/10 p-3 text-sm text-amber-100">
                Add a GitHub repository before Brainpress can create an issue directly. You can still copy the issue body.
              </p>
            ) : null}
            <div className="rounded-lg border border-white/10 bg-white/[0.04] p-3">
              <p className="text-xs font-semibold uppercase text-slate-500">Issue title preview</p>
              <p className="mt-2 font-medium text-white">{githubDispatch.issueTitle}</p>
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase text-slate-500">Issue body preview</p>
              <MonoBlock value={githubDispatch.issueBody} className="max-h-96" />
            </div>
          </div>
        ) : null}

        {task.dispatchTarget === "codex_cloud" ? (
          <div className="mt-4 rounded-lg border border-white/10 bg-slate-950/70 p-4">
            <p className="text-sm font-semibold text-blue-100">Codex Cloud</p>
            <p className="mt-1 text-sm leading-6 text-blue-200/80">
              Direct Codex Cloud dispatch is intentionally a placeholder until secure server-side configuration exists.
            </p>
          </div>
        ) : null}

        {dispatchMessage ? <p className="mt-3 rounded-md border border-white/10 bg-slate-950/70 p-3 text-sm text-blue-100">{dispatchMessage}</p> : null}
        {task.codexRunId || task.externalRunUrl ? (
          <div className="mt-3 rounded-md border border-white/10 bg-slate-950/70 p-3">
            {task.codexRunId ? <p className="font-mono text-xs text-blue-100">Local run ID: {task.codexRunId}</p> : null}
            {task.externalRunUrl ? (
              <a className="mt-1 block text-sm font-medium text-blue-200 hover:underline" href={task.externalRunUrl} target="_blank" rel="noreferrer">
                {task.externalRunUrl}
              </a>
            ) : null}
            {task.codexRunId ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <Button onClick={onRefreshBridgeStatus} disabled={refreshingBridge}>
                  <History className="h-4 w-4" />
                  {refreshingBridge ? "Refreshing..." : "Refresh Run Status"}
                </Button>
                <Button onClick={onImportBridgeResult} disabled={refreshingBridge}>
                  <Clipboard className="h-4 w-4" />
                  Import Bridge Result
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
        <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-semibold text-white">Codex Goal Function</p>
            <p className="mt-1 text-sm leading-6 text-slate-400">
              Durable `/goal` objective generated from the task, Service context, saved sources, validation loop, permission-safe guidance, and final summary contract.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={onRegenerateGoal}>
              <Wand2 className="h-4 w-4" />
              Regenerate
            </Button>
            <Button onClick={onCopyGoal}>
              <Clipboard className="h-4 w-4" />
              {goalCopied ? "Copied" : "Copy /goal"}
            </Button>
          </div>
        </div>
        <MonoBlock value={task.codexGoal || "No Codex goal generated yet."} className="max-h-72" />
        {task.codexGoalUpdatedAt ? (
          <p className="mt-2 font-mono text-xs text-slate-500">Updated {new Date(task.codexGoalUpdatedAt).toLocaleString()}</p>
        ) : null}
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <SummaryList title="Context" items={task.context} />
        <SummaryList title="Affected areas" items={task.affectedAreas} />
        <SummaryList title="Acceptance criteria" items={task.acceptanceCriteria} />
        <SummaryList title="Verification commands" items={task.verificationCommands} mono />
        <SummaryList title="Manual QA steps" items={task.manualQaSteps} />
        <SummaryList title="Constraints" items={task.constraints} />
      </div>

      <div className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
        <p className="mb-2 text-sm font-medium text-white">Result Review</p>
        <TextArea
          className="min-h-36"
          value={resultInput}
          onChange={(event) => onResultInputChange(event.target.value)}
          placeholder="Paste Codex result, PR notes, build output, or QA findings..."
        />
        <Button className="mt-3" onClick={onImportResult} disabled={!resultInput.trim()}>
          <Save className="h-4 w-4" />
          Import Result
        </Button>
        {latestResult ? (
          <StructuredTaskResultReview
            result={latestResult}
            onApplyRecommendedStatus={onApplyRecommendedResultStatus}
          />
        ) : task.resultSummary ? (
          <div className="mt-4 rounded-lg border border-white/10 bg-slate-950/70 p-4">
            <p className="mb-2 text-sm font-medium text-white">Result summary</p>
            <p className="whitespace-pre-line text-sm leading-6 text-slate-400">{task.resultSummary}</p>
            <p className="mt-3 text-xs text-slate-500">Structured acceptance review will appear after importing a new bridge or manual result.</p>
          </div>
        ) : null}
      </div>

      <div className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
        <p className="mb-3 text-sm font-medium text-white">Status history</p>
        <div className="space-y-2">
          {(task.statusHistory || []).map((event, index) => (
            <div key={`status-history-${index}-${event.at}-${event.status}`} className="flex flex-col gap-1 rounded-md bg-white/[0.04] px-3 py-2 text-sm md:flex-row md:items-center md:justify-between">
              <span className="text-slate-400">{event.note}</span>
              <span className="font-mono text-xs text-slate-500">{event.status} / {new Date(event.at).toLocaleString()}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function DispatchOptionCard({
  title,
  target,
  description,
  active,
  onSelect,
}: {
  title: string;
  target: DevelopmentTaskDispatchTarget;
  description: string;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      className={cx(
        "rounded-lg border p-4 text-left transition hover:border-blue-300/40 hover:bg-blue-400/10",
        active ? "border-blue-300/50 bg-blue-400/10 shadow-sm ring-4 ring-blue-400/10" : "border-white/10 bg-white/[0.04]",
      )}
      onClick={onSelect}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="font-semibold text-white">{title}</p>
        <TaskChip>{target}</TaskChip>
      </div>
      <p className="mt-2 text-sm leading-6 text-slate-400">{description}</p>
    </button>
  );
}

function StructuredTaskResultReview({
  result,
  onApplyRecommendedStatus,
}: {
  result: DevelopmentTaskResult;
  onApplyRecommendedStatus: () => void;
}) {
  const metCount = result.acceptanceCriteriaReview.filter((review) => review.status === "met").length;
  const targetStatus = taskStatusFromRecommendedResult(result.recommendedStatus);

  return (
    <div className="mt-4 space-y-4 rounded-lg border border-blue-300/20 bg-blue-400/10 p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-sm font-semibold text-blue-100">Structured Result Review</p>
          <p className="mt-1 text-sm leading-6 text-blue-200/80">
            Brainpress parsed the imported result and checked it against the task acceptance criteria. Verified is still a user decision.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <TaskChip>{result.source}</TaskChip>
          <TaskChip>recommended: {result.recommendedStatus}</TaskChip>
        </div>
      </div>

      {result.summary ? (
        <div className="rounded-lg border border-white/10 bg-slate-950/70 p-3">
          <p className="text-xs font-semibold uppercase text-blue-300">Summary</p>
          <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-400">{result.summary}</p>
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2">
        <ResultList title="Changed files" items={result.changedFiles} mono />
        <ResultList title="Commands run" items={result.commandsRun} mono />
        <ResultList
          title="Verification results"
          items={result.verificationResults.map((item) => `${item.command}: ${item.status}`)}
          mono
        />
        <ResultList
          title="Manual QA results"
          items={result.manualQaResults.map((item) => `${item.step}: ${item.status}`)}
        />
        <ResultList title="Risks" items={result.risks} />
        <ResultList title="Remaining issues" items={result.remainingIssues} />
        <ResultList title="Next tasks" items={result.nextTasks} />
        {result.prUrl ? <ResultList title="PR" items={[result.prUrl]} mono /> : null}
      </div>

      <div className="rounded-lg border border-white/10 bg-slate-950/70 p-3">
        <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-semibold text-white">Acceptance criteria review</p>
            <p className="text-xs text-slate-500">
              {metCount}/{result.acceptanceCriteriaReview.length} met. Missing evidence stays unknown instead of being treated as done.
            </p>
          </div>
          <Button onClick={onApplyRecommendedStatus}>
            <CheckCircle2 className="h-4 w-4" />
            Apply Recommended Status: {targetStatus}
          </Button>
        </div>
        <div className="overflow-hidden rounded-md border border-white/10">
          <div className="hidden grid-cols-[1fr_120px_1.1fr] bg-white/[0.04] px-3 py-2 text-xs font-semibold uppercase text-slate-500 md:grid">
            <span>Criterion</span>
            <span>Status</span>
            <span>Evidence / follow-up</span>
          </div>
          {result.acceptanceCriteriaReview.map((review, index) => (
            <div
              key={`criteria-review-${index}-${review.status}-${review.criterion}`}
              className="grid gap-2 border-t border-white/10 px-3 py-3 text-sm md:grid-cols-[1fr_120px_1.1fr] md:gap-3"
            >
              <span className="leading-6 text-slate-200">{review.criterion}</span>
              <span className={cx("font-mono text-xs font-semibold", criteriaStatusTone(review.status))}>{review.status}</span>
              <span className="leading-6 text-slate-400">
                {review.evidence}
                {review.requiredFollowUp ? <span className="mt-1 block text-amber-700">{review.requiredFollowUp}</span> : null}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ResultList({ title, items, mono = false }: { title: string; items: string[]; mono?: boolean }) {
  return (
    <div className="rounded-lg border border-white/10 bg-slate-950/70 p-3">
      <p className="text-xs font-semibold uppercase text-blue-300">{title}</p>
      {items.length ? (
        <ul className="mt-2 space-y-1 text-sm leading-6 text-slate-400">
          {items.map((item, index) => (
            <li key={`result-list-${title}-${index}-${item}`} className={mono ? "font-mono text-xs" : ""}>
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-slate-500">No explicit evidence found.</p>
      )}
    </div>
  );
}

function criteriaStatusTone(status: DevelopmentTaskResult["acceptanceCriteriaReview"][number]["status"]) {
  if (status === "met") return "text-emerald-300";
  if (status === "unmet") return "text-red-300";
  if (status === "partial") return "text-amber-300";
  return "text-slate-500";
}

function AgentSourceBadge({
  source,
  model,
  error,
}: {
  source?: BrainpressAgentSource;
  model?: string;
  error?: string;
}) {
  if (!source) return null;
  return (
    <span
      title={error || undefined}
      className={cx(
        "rounded-md border px-2 py-1 font-mono text-xs font-semibold",
        source === "openai"
          ? "border-emerald-300/20 bg-emerald-300/10 text-emerald-200"
          : "border-amber-300/20 bg-amber-300/10 text-amber-200",
      )}
    >
      {source === "openai" ? "Live AI" : "Local fallback"}
      {model ? ` - ${model}` : ""}
    </span>
  );
}

function TaskChip({ children }: { children: ReactNode }) {
  return <span className="rounded-md border border-white/10 bg-white/[0.06] px-2 py-1 font-mono text-xs text-slate-300">{children}</span>;
}

function SummaryList({ title, items, mono = false }: { title: string; items: string[]; mono?: boolean }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
      <p className="mb-2 text-sm font-medium text-white">{title}</p>
      {items.length ? (
        <ul className={cx("space-y-1 text-sm leading-6 text-slate-400", mono && "font-mono text-xs")}>
          {items.map((item, index) => (
            <li key={`summary-list-${title}-${index}-${item}`}>- {item}</li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-slate-500">None detected.</p>
      )}
    </div>
  );
}

function FormField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="text-sm font-medium text-slate-200">{label}</label>
      <div className="mt-2">{children}</div>
    </div>
  );
}
