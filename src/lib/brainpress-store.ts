"use client";

import { initialState } from "@/lib/seed";
import { loadBrainpressState, saveBrainpressState } from "@/lib/storage";
import { getSupabasePublicConfig, supabaseHeaders, type SupabaseSession } from "@/lib/supabase-browser";
import type {
  BrainpressConstitution,
  BrainpressPlan,
  BrainpressState,
  BrainpressSpec,
  BrainpressTaskList,
  ClarifyingQuestion,
  DevelopmentTask,
  DevelopmentTaskResult,
  ProductWindow,
  Project,
  RunIssue,
  BrainpressService,
  ServiceAgent,
  ServiceWindow,
  ThinkSession,
} from "@/lib/types";

export type BrainpressStoreMode = "local" | "cloud";

export interface BrainpressStore {
  mode: BrainpressStoreMode;
  listProjects(): Promise<Project[]>;
  getProject(projectId: string): Promise<Project | null>;
  saveProject(project: Project): Promise<void>;
  listServices(): Promise<BrainpressService[]>;
  saveService(service: BrainpressService): Promise<void>;
  listServiceAgents(serviceId: string): Promise<ServiceAgent[]>;
  saveServiceAgent(agent: ServiceAgent): Promise<void>;
  listServiceWindows(serviceId: string): Promise<ServiceWindow[]>;
  saveServiceWindow(window: ServiceWindow): Promise<void>;
  listThinkSessions(projectId: string): Promise<ThinkSession[]>;
  saveThinkSession(session: ThinkSession): Promise<void>;
  listProductWindows(projectId: string): Promise<ProductWindow[]>;
  saveProductWindow(window: ProductWindow): Promise<void>;
  listConstitutions(projectId: string): Promise<BrainpressConstitution[]>;
  saveConstitution(constitution: BrainpressConstitution): Promise<void>;
  listSpecs(projectId: string): Promise<BrainpressSpec[]>;
  saveSpec(spec: BrainpressSpec): Promise<void>;
  listClarifyingQuestions(specIds: string[]): Promise<ClarifyingQuestion[]>;
  saveClarifyingQuestion(question: ClarifyingQuestion): Promise<void>;
  listPlans(projectId: string): Promise<BrainpressPlan[]>;
  savePlan(plan: BrainpressPlan): Promise<void>;
  listTaskLists(projectId: string): Promise<BrainpressTaskList[]>;
  saveTaskList(taskList: BrainpressTaskList): Promise<void>;
  listDevelopmentTasks(projectId: string): Promise<DevelopmentTask[]>;
  saveDevelopmentTask(task: DevelopmentTask): Promise<void>;
  listDevelopmentTaskResults(projectId: string): Promise<DevelopmentTaskResult[]>;
  saveDevelopmentTaskResult(result: DevelopmentTaskResult): Promise<void>;
  listRunIssues(projectId: string): Promise<RunIssue[]>;
  saveRunIssue(issue: RunIssue): Promise<void>;
}

export interface BrainpressStoreSelection {
  store: BrainpressStore;
  sourceLabel: "Cloud synced" | "Local workspace";
  reason: string;
}

export function selectBrainpressStore(session: SupabaseSession | null): BrainpressStoreSelection {
  const config = getSupabasePublicConfig();
  if (config && session?.accessToken) {
    return {
      store: new SupabaseBrainpressStore(session),
      sourceLabel: "Cloud synced",
      reason: "Signed in with Supabase. Brainpress data can sync across devices.",
    };
  }

  return {
    store: new LocalStorageBrainpressStore(),
    sourceLabel: "Local workspace",
    reason: config
      ? "Working locally. Sign in to sync across devices."
      : "Local workspace is stored on this browser only.",
  };
}

export class LocalStorageBrainpressStore implements BrainpressStore {
  mode: BrainpressStoreMode = "local";

  async listProjects() {
    return loadBrainpressState().projects;
  }

  async getProject(projectId: string) {
    return loadBrainpressState().projects.find((project) => project.id === projectId) || null;
  }

  async saveProject(project: Project) {
    const state = loadBrainpressState();
    saveBrainpressState({
      ...state,
      projects: upsertById(state.projects, project),
    });
  }

  async listServices() {
    return loadBrainpressState().services || [];
  }

  async saveService(service: BrainpressService) {
    const state = loadBrainpressState();
    saveBrainpressState({ ...state, services: upsertById(state.services || [], service) });
  }

  async listServiceAgents(serviceId: string) {
    return (loadBrainpressState().serviceAgents || []).filter((agent) => agent.serviceId === serviceId);
  }

  async saveServiceAgent(agent: ServiceAgent) {
    const state = loadBrainpressState();
    saveBrainpressState({ ...state, serviceAgents: upsertById(state.serviceAgents || [], agent) });
  }

  async listServiceWindows(serviceId: string) {
    return (loadBrainpressState().serviceWindows || []).filter((window) => window.serviceId === serviceId);
  }

  async saveServiceWindow(window: ServiceWindow) {
    const state = loadBrainpressState();
    saveBrainpressState({ ...state, serviceWindows: upsertById(state.serviceWindows || [], window) });
  }

  async listThinkSessions(projectId: string) {
    return loadBrainpressState().thinkSessions.filter((session) => session.projectId === projectId);
  }

  async saveThinkSession(session: ThinkSession) {
    const state = loadBrainpressState();
    saveBrainpressState({ ...state, thinkSessions: upsertById(state.thinkSessions || [], session) });
  }

  async listProductWindows(projectId: string) {
    return loadBrainpressState().productWindows.filter((window) => window.projectId === projectId);
  }

  async saveProductWindow(window: ProductWindow) {
    const state = loadBrainpressState();
    saveBrainpressState({ ...state, productWindows: upsertById(state.productWindows || [], window) });
  }

  async listConstitutions(projectId: string) {
    return (loadBrainpressState().constitutions || []).filter((constitution) => constitution.projectId === projectId);
  }

  async saveConstitution(constitution: BrainpressConstitution) {
    const state = loadBrainpressState();
    saveBrainpressState({ ...state, constitutions: upsertById(state.constitutions || [], constitution) });
  }

  async listSpecs(projectId: string) {
    return (loadBrainpressState().specs || []).filter((spec) => spec.projectId === projectId);
  }

  async saveSpec(spec: BrainpressSpec) {
    const state = loadBrainpressState();
    saveBrainpressState({ ...state, specs: upsertById(state.specs || [], spec) });
  }

  async listClarifyingQuestions(specIds: string[]) {
    const specIdSet = new Set(specIds);
    return (loadBrainpressState().clarifyingQuestions || []).filter((question) => specIdSet.has(question.specId));
  }

  async saveClarifyingQuestion(question: ClarifyingQuestion) {
    const state = loadBrainpressState();
    saveBrainpressState({ ...state, clarifyingQuestions: upsertById(state.clarifyingQuestions || [], question) });
  }

  async listPlans(projectId: string) {
    return (loadBrainpressState().plans || []).filter((plan) => plan.projectId === projectId);
  }

  async savePlan(plan: BrainpressPlan) {
    const state = loadBrainpressState();
    saveBrainpressState({ ...state, plans: upsertById(state.plans || [], plan) });
  }

  async listTaskLists(projectId: string) {
    return (loadBrainpressState().taskLists || []).filter((taskList) => taskList.projectId === projectId);
  }

  async saveTaskList(taskList: BrainpressTaskList) {
    const state = loadBrainpressState();
    saveBrainpressState({ ...state, taskLists: upsertById(state.taskLists || [], taskList) });
  }

  async listDevelopmentTasks(projectId: string) {
    return loadBrainpressState().developmentTasks.filter((task) => task.projectId === projectId);
  }

  async saveDevelopmentTask(task: DevelopmentTask) {
    const state = loadBrainpressState();
    saveBrainpressState({ ...state, developmentTasks: upsertById(state.developmentTasks || [], task) });
  }

  async listDevelopmentTaskResults(projectId: string) {
    const state = loadBrainpressState();
    const taskIds = new Set(state.developmentTasks.filter((task) => task.projectId === projectId).map((task) => task.id));
    return state.developmentTaskResults.filter((result) => taskIds.has(result.taskId));
  }

  async saveDevelopmentTaskResult(result: DevelopmentTaskResult) {
    const state = loadBrainpressState();
    saveBrainpressState({ ...state, developmentTaskResults: upsertById(state.developmentTaskResults || [], result) });
  }

  async listRunIssues(projectId: string) {
    return loadBrainpressState().runIssues.filter((issue) => issue.projectId === projectId);
  }

  async saveRunIssue(issue: RunIssue) {
    const state = loadBrainpressState();
    saveBrainpressState({ ...state, runIssues: upsertById(state.runIssues || [], issue) });
  }
}

export class SupabaseBrainpressStore implements BrainpressStore {
  mode: BrainpressStoreMode = "cloud";
  private config = getSupabasePublicConfig();

  constructor(private session: SupabaseSession) {
    if (!this.config) throw new Error("Supabase is not configured.");
  }

  async listProjects() {
    return this.listRows<ProjectRow>("projects").then((rows) => rows.map(projectFromRow));
  }

  async getProject(projectId: string) {
    const rows = await this.listRows<ProjectRow>("projects", `id=eq.${encodeURIComponent(projectId)}`);
    return rows[0] ? projectFromRow(rows[0]) : null;
  }

  async saveProject(project: Project) {
    await this.upsertRow("projects", projectToRow(project, this.session.user.id));
  }

  async listServices() {
    const rows = await this.listRows<ServiceRow>("services");
    return rows.map(serviceFromRow);
  }

  async saveService(service: BrainpressService) {
    await this.upsertRow("services", serviceToRow(service, this.session.user.id));
  }

  async listServiceAgents(serviceId: string) {
    const rows = await this.listRows<ServiceAgentRow>("service_agents", `service_id=eq.${encodeURIComponent(serviceId)}`);
    return rows.map(serviceAgentFromRow);
  }

  async saveServiceAgent(agent: ServiceAgent) {
    await this.upsertRow("service_agents", serviceAgentToRow(agent, this.session.user.id));
  }

  async listServiceWindows(serviceId: string) {
    const rows = await this.listRows<ServiceWindowRow>("service_windows", `service_id=eq.${encodeURIComponent(serviceId)}`);
    return rows.map(serviceWindowFromRow);
  }

  async saveServiceWindow(window: ServiceWindow) {
    await this.upsertRow("service_windows", serviceWindowToRow(window, this.session.user.id));
  }

  async listThinkSessions(projectId: string) {
    const rows = await this.listRows<ThinkSessionRow>("think_sessions", `project_id=eq.${encodeURIComponent(projectId)}`);
    return rows.map(thinkSessionFromRow);
  }

  async saveThinkSession(session: ThinkSession) {
    await this.upsertRow("think_sessions", thinkSessionToRow(session, this.session.user.id));
  }

  async listProductWindows(projectId: string) {
    const rows = await this.listRows<ProductWindowRow>("product_windows", `project_id=eq.${encodeURIComponent(projectId)}`);
    return rows.map(productWindowFromRow);
  }

  async saveProductWindow(window: ProductWindow) {
    await this.upsertRow("product_windows", productWindowToRow(window, this.session.user.id));
  }

  async listConstitutions(projectId: string) {
    const rows = await this.listRows<ConstitutionRow>("brainpress_constitutions", `project_id=eq.${encodeURIComponent(projectId)}`);
    return rows.map(constitutionFromRow);
  }

  async saveConstitution(constitution: BrainpressConstitution) {
    await this.upsertRow("brainpress_constitutions", constitutionToRow(constitution, this.session.user.id));
  }

  async listSpecs(projectId: string) {
    const rows = await this.listRows<SpecRow>("brainpress_specs", `project_id=eq.${encodeURIComponent(projectId)}`);
    return rows.map(specFromRow);
  }

  async saveSpec(spec: BrainpressSpec) {
    await this.upsertRow("brainpress_specs", specToRow(spec, this.session.user.id));
  }

  async listClarifyingQuestions(specIds: string[]) {
    if (!specIds.length) return [];
    const rows = await this.listRows<ClarifyingQuestionRow>(
      "clarifying_questions",
      `spec_id=in.(${specIds.map((id) => `"${id}"`).join(",")})`,
    );
    return rows.map(clarifyingQuestionFromRow);
  }

  async saveClarifyingQuestion(question: ClarifyingQuestion) {
    await this.upsertRow("clarifying_questions", clarifyingQuestionToRow(question, this.session.user.id));
  }

  async listPlans(projectId: string) {
    const rows = await this.listRows<PlanRow>("brainpress_plans", `project_id=eq.${encodeURIComponent(projectId)}`);
    return rows.map(planFromRow);
  }

  async savePlan(plan: BrainpressPlan) {
    await this.upsertRow("brainpress_plans", planToRow(plan, this.session.user.id));
  }

  async listTaskLists(projectId: string) {
    const rows = await this.listRows<TaskListRow>("brainpress_task_lists", `project_id=eq.${encodeURIComponent(projectId)}`);
    return rows.map(taskListFromRow);
  }

  async saveTaskList(taskList: BrainpressTaskList) {
    await this.upsertRow("brainpress_task_lists", taskListToRow(taskList, this.session.user.id));
  }

  async listDevelopmentTasks(projectId: string) {
    const rows = await this.listRows<DevelopmentTaskRow>("development_tasks", `project_id=eq.${encodeURIComponent(projectId)}`);
    return rows.map(developmentTaskFromRow);
  }

  async saveDevelopmentTask(task: DevelopmentTask) {
    await this.upsertRow("development_tasks", developmentTaskToRow(task, this.session.user.id));
  }

  async listDevelopmentTaskResults(projectId: string) {
    const rows = await this.listRows<DevelopmentTaskResultRow>("development_task_results", `project_id=eq.${encodeURIComponent(projectId)}`);
    return rows.map(developmentTaskResultFromRow);
  }

  async saveDevelopmentTaskResult(result: DevelopmentTaskResult) {
    await this.upsertRow("development_task_results", developmentTaskResultToRow(result, this.session.user.id));
  }

  async listRunIssues(projectId: string) {
    const rows = await this.listRows<RunIssueRow>("run_issues", `project_id=eq.${encodeURIComponent(projectId)}`);
    return rows.map(runIssueFromRow);
  }

  async saveRunIssue(issue: RunIssue) {
    await this.upsertRow("run_issues", runIssueToRow(issue, this.session.user.id));
  }

  private async listRows<T>(table: string, filter = ""): Promise<T[]> {
    const config = this.requireConfig();
    const order =
      table === "development_task_results"
        ? "created_at.desc"
        : table === "clarifying_questions"
          ? "id.asc"
          : "updated_at.desc.nullslast,created_at.desc";
    const query = filter ? `?${filter}&order=${order}` : `?order=${order}`;
    const response = await fetch(`${config.url}/rest/v1/${table}${query}`, {
      headers: {
        apikey: config.anonKey,
        Authorization: `Bearer ${this.session.accessToken}`,
      },
    });
    if (!response.ok) throw new Error(`Supabase could not load ${table}.`);
    return (await response.json()) as T[];
  }

  private async upsertRow(table: string, row: Record<string, unknown>) {
    const config = this.requireConfig();
    const response = await fetch(`${config.url}/rest/v1/${table}?on_conflict=id`, {
      method: "POST",
      headers: {
        ...supabaseHeaders(config.anonKey),
        Authorization: `Bearer ${this.session.accessToken}`,
        Prefer: "resolution=merge-duplicates",
      },
      body: JSON.stringify(row),
    });
    if (!response.ok) throw new Error(`Supabase could not save ${table}.`);
  }

  private requireConfig() {
    if (!this.config) throw new Error("Supabase is not configured.");
    return this.config;
  }
}

export async function loadStateFromStore(store: BrainpressStore): Promise<BrainpressState> {
  if (store.mode === "local") return loadBrainpressState();
  const projects = await store.listProjects();
  const projectList = projects.length ? projects : initialState.projects;
  const [servicesFromStore, thinkSessions, productWindows, constitutions, specs, plans, taskLists, developmentTasks, developmentTaskResults, runIssues] = await Promise.all([
    store.listServices(),
    Promise.all(projectList.map((project) => store.listThinkSessions(project.id))).then((items) => items.flat()),
    Promise.all(projectList.map((project) => store.listProductWindows(project.id))).then((items) => items.flat()),
    Promise.all(projectList.map((project) => store.listConstitutions(project.id))).then((items) => items.flat()),
    Promise.all(projectList.map((project) => store.listSpecs(project.id))).then((items) => items.flat()),
    Promise.all(projectList.map((project) => store.listPlans(project.id))).then((items) => items.flat()),
    Promise.all(projectList.map((project) => store.listTaskLists(project.id))).then((items) => items.flat()),
    Promise.all(projectList.map((project) => store.listDevelopmentTasks(project.id))).then((items) => items.flat()),
    Promise.all(projectList.map((project) => store.listDevelopmentTaskResults(project.id))).then((items) => items.flat()),
    Promise.all(projectList.map((project) => store.listRunIssues(project.id))).then((items) => items.flat()),
  ]);
  const serviceList = servicesFromStore.length ? servicesFromStore : initialState.services;
  const [serviceAgents, serviceWindows] = await Promise.all([
    Promise.all(serviceList.map((service) => store.listServiceAgents(service.id))).then((items) => items.flat()),
    Promise.all(serviceList.map((service) => store.listServiceWindows(service.id))).then((items) => items.flat()),
  ]);
  const clarifyingQuestions = await store.listClarifyingQuestions(specs.map((spec) => spec.id));

  return {
    ...initialState,
    services: serviceList,
    serviceAgents,
    serviceWindows,
    projects: projectList,
    thinkSessions,
    productWindows,
    constitutions,
    specs,
    clarifyingQuestions,
    plans,
    taskLists,
    developmentTasks,
    developmentTaskResults,
    runIssues,
  };
}

export async function saveStateToStore(store: BrainpressStore, state: BrainpressState) {
  if (store.mode === "local") {
    saveBrainpressState(state);
    return;
  }

  await Promise.all([
    ...state.projects.map((project) => store.saveProject(project)),
    ...(state.services || []).map((service) => store.saveService(service)),
    ...(state.serviceAgents || []).map((agent) => store.saveServiceAgent(agent)),
    ...(state.serviceWindows || []).map((window) => store.saveServiceWindow(window)),
    ...(state.thinkSessions || []).map((session) => store.saveThinkSession(session)),
    ...(state.productWindows || []).map((window) => store.saveProductWindow(window)),
    ...(state.constitutions || []).map((constitution) => store.saveConstitution(constitution)),
    ...(state.specs || []).map((spec) => store.saveSpec(spec)),
    ...(state.clarifyingQuestions || []).map((question) => store.saveClarifyingQuestion(question)),
    ...(state.plans || []).map((plan) => store.savePlan(plan)),
    ...(state.taskLists || []).map((taskList) => store.saveTaskList(taskList)),
    ...(state.developmentTasks || []).map((task) => store.saveDevelopmentTask(task)),
    ...(state.developmentTaskResults || []).map((result) => store.saveDevelopmentTaskResult(result)),
    ...(state.runIssues || []).map((issue) => store.saveRunIssue(issue)),
  ]);
}

function upsertById<T extends { id: string }>(items: T[], item: T) {
  const exists = items.some((current) => current.id === item.id);
  return exists ? items.map((current) => (current.id === item.id ? item : current)) : [item, ...items];
}

type ProjectRow = Record<string, unknown>;
type ServiceRow = Record<string, unknown>;
type ServiceAgentRow = Record<string, unknown>;
type ServiceWindowRow = Record<string, unknown>;
type ThinkSessionRow = Record<string, unknown>;
type ProductWindowRow = Record<string, unknown>;
type ConstitutionRow = Record<string, unknown>;
type SpecRow = Record<string, unknown>;
type ClarifyingQuestionRow = Record<string, unknown>;
type PlanRow = Record<string, unknown>;
type TaskListRow = Record<string, unknown>;
type DevelopmentTaskRow = Record<string, unknown>;
type DevelopmentTaskResultRow = Record<string, unknown>;
type RunIssueRow = Record<string, unknown>;

function projectToRow(project: Project, ownerId: string) {
  return {
    id: project.id,
    owner_id: ownerId,
    name: project.name,
    description: project.description,
    repo_path_or_url: project.repoPathOrUrl,
    preferred_agent: project.preferredAgent,
    primary_goal: project.primaryGoal,
    constraints: project.constraints,
    verification_commands: project.verificationCommands,
    safety_rules: project.safetyRules,
    created_at: project.createdAt,
    updated_at: new Date().toISOString(),
  };
}

function projectFromRow(row: ProjectRow): Project {
  return {
    id: stringField(row.id),
    name: stringField(row.name),
    description: stringField(row.description),
    repoPathOrUrl: stringField(row.repo_path_or_url),
    preferredAgent: stringField(row.preferred_agent, "Codex") as Project["preferredAgent"],
    primaryGoal: stringField(row.primary_goal),
    constraints: arrayField<string>(row.constraints),
    verificationCommands: arrayField<string>(row.verification_commands),
    safetyRules: stringField(row.safety_rules),
    createdAt: stringField(row.created_at, new Date().toISOString()),
  };
}

function serviceToRow(service: BrainpressService, ownerId: string) {
  return {
    id: service.id,
    owner_id: ownerId,
    name: service.name,
    description: service.description,
    service_promise: service.servicePromise,
    target_customer: service.targetCustomer,
    desired_outcome: service.desiredOutcome,
    current_stage: service.currentStage,
    main_agent_id: service.mainAgentId,
    agent_ids: service.agentIds,
    service_workflow: service.serviceWorkflow,
    human_approval_points: service.humanApprovalPoints,
    success_metrics: service.successMetrics,
    open_questions: service.openQuestions,
    created_at: service.createdAt,
    updated_at: service.updatedAt,
  };
}

function serviceFromRow(row: ServiceRow): BrainpressService {
  return {
    id: stringField(row.id),
    name: stringField(row.name),
    description: stringField(row.description),
    servicePromise: stringField(row.service_promise),
    targetCustomer: stringField(row.target_customer),
    desiredOutcome: stringField(row.desired_outcome || row.service_promise),
    currentStage: stringField(row.current_stage, "idea") as BrainpressService["currentStage"],
    mainAgentId: stringField(row.main_agent_id),
    agentIds: arrayField<string>(row.agent_ids),
    serviceWorkflow: arrayField<string>(row.service_workflow),
    humanApprovalPoints: arrayField<string>(row.human_approval_points),
    successMetrics: arrayField<string>(row.success_metrics),
    openQuestions: arrayField<string>(row.open_questions),
    createdAt: stringField(row.created_at, new Date().toISOString()),
    updatedAt: stringField(row.updated_at, new Date().toISOString()),
  };
}

function serviceAgentToRow(agent: ServiceAgent, ownerId: string) {
  return {
    id: agent.id,
    service_id: agent.serviceId,
    owner_id: ownerId,
    name: agent.name,
    role: agent.role,
    goal: agent.goal,
    inputs: agent.inputs,
    outputs: agent.outputs,
    tools: agent.tools,
    memory_scope: agent.memoryScope,
    permission_level: agent.permissionLevel,
    escalation_rules: agent.escalationRules,
    success_metric: agent.successMetric,
    status: agent.status,
    created_at: agent.createdAt,
    updated_at: agent.updatedAt,
  };
}

function serviceAgentFromRow(row: ServiceAgentRow): ServiceAgent {
  return {
    id: stringField(row.id),
    serviceId: stringField(row.service_id),
    name: stringField(row.name),
    role: stringField(row.role),
    goal: stringField(row.goal),
    inputs: arrayField<string>(row.inputs),
    outputs: arrayField<string>(row.outputs),
    tools: arrayField<string>(row.tools),
    memoryScope: stringField(row.memory_scope),
    permissionLevel: stringField(row.permission_level, "founder_approval_required") as ServiceAgent["permissionLevel"],
    escalationRules: arrayField<string>(row.escalation_rules),
    successMetric: stringField(row.success_metric),
    status: stringField(row.status, "proposed") as ServiceAgent["status"],
    createdAt: stringField(row.created_at, new Date().toISOString()),
    updatedAt: stringField(row.updated_at, new Date().toISOString()),
  };
}

function serviceWindowToRow(window: ServiceWindow, ownerId: string) {
  return {
    id: window.id,
    service_id: window.serviceId,
    owner_id: ownerId,
    status: window.status,
    screens: window.screens,
    primary_flow: window.primaryFlow,
    agent_interaction_points: window.agentInteractionPoints,
    human_approval_points: window.humanApprovalPoints,
    generated_at: window.generatedAt,
    updated_at: window.updatedAt,
  };
}

function serviceWindowFromRow(row: ServiceWindowRow): ServiceWindow {
  return {
    id: stringField(row.id),
    serviceId: stringField(row.service_id),
    status: stringField(row.status, "empty") as ServiceWindow["status"],
    screens: arrayField(row.screens),
    primaryFlow: arrayField<string>(row.primary_flow),
    agentInteractionPoints: arrayField<string>(row.agent_interaction_points),
    humanApprovalPoints: arrayField<string>(row.human_approval_points),
    generatedAt: optionalString(row.generated_at),
    updatedAt: stringField(row.updated_at, new Date().toISOString()),
  };
}

function thinkSessionToRow(session: ThinkSession, ownerId: string) {
  return {
    id: session.id,
    project_id: session.projectId,
    owner_id: ownerId,
    title: session.title,
    input: session.input,
    mode: session.mode,
    artifact_type: session.artifactType,
    summary: session.summary,
    product_direction: session.productDirection,
    user_problem: session.userProblem,
    target_user: session.targetUser,
    proposed_solution: session.proposedSolution,
    mvp_scope: session.mvpScope,
    feature_ideas: session.featureIdeas,
    decisions: session.decisions,
    risks: session.risks,
    open_questions: session.openQuestions,
    recommended_build_tasks: session.recommendedBuildTasks,
    status: session.status,
    agent_source: session.agentSource,
    agent_model: session.agentModel,
    agent_error: session.agentError,
    created_at: session.createdAt,
    updated_at: session.updatedAt,
  };
}

function thinkSessionFromRow(row: ThinkSessionRow): ThinkSession {
  return {
    id: stringField(row.id),
    projectId: stringField(row.project_id),
    title: stringField(row.title),
    input: stringField(row.input),
    mode: stringField(row.mode, "open_thinking") as ThinkSession["mode"],
    artifactType: stringField(row.artifact_type, "product_brief") as ThinkSession["artifactType"],
    summary: stringField(row.summary),
    productDirection: stringField(row.product_direction),
    userProblem: stringField(row.user_problem),
    targetUser: stringField(row.target_user),
    proposedSolution: stringField(row.proposed_solution),
    mvpScope: arrayField<string>(row.mvp_scope),
    featureIdeas: arrayField<string>(row.feature_ideas),
    decisions: arrayField<string>(row.decisions),
    risks: arrayField<string>(row.risks),
    openQuestions: arrayField<string>(row.open_questions),
    recommendedBuildTasks: arrayField(row.recommended_build_tasks),
    status: stringField(row.status, "generated") as ThinkSession["status"],
    agentSource: optionalString(row.agent_source) as ThinkSession["agentSource"],
    agentModel: optionalString(row.agent_model),
    agentError: optionalString(row.agent_error),
    createdAt: stringField(row.created_at, new Date().toISOString()),
    updatedAt: stringField(row.updated_at, new Date().toISOString()),
  };
}

function productWindowToRow(window: ProductWindow, ownerId: string) {
  return {
    id: window.id,
    project_id: window.projectId,
    think_session_id: window.thinkSessionId,
    owner_id: ownerId,
    title: window.title,
    route: window.route,
    preview_type: window.previewType,
    user_scenario: window.userScenario,
    screen_description: window.screenDescription,
    primary_cta: window.primaryCTA,
    sections: window.sections,
    ui_principles: window.uiPrinciples,
    user_flow: window.userFlow,
    open_questions: window.openQuestions,
    status: window.status,
    created_at: window.createdAt,
    updated_at: window.updatedAt,
  };
}

function productWindowFromRow(row: ProductWindowRow): ProductWindow {
  return {
    id: stringField(row.id),
    projectId: stringField(row.project_id),
    thinkSessionId: stringField(row.think_session_id),
    title: stringField(row.title),
    route: stringField(row.route),
    previewType: stringField(row.preview_type, "app_workspace") as ProductWindow["previewType"],
    userScenario: stringField(row.user_scenario),
    screenDescription: stringField(row.screen_description),
    primaryCTA: stringField(row.primary_cta),
    sections: arrayField(row.sections),
    uiPrinciples: arrayField<string>(row.ui_principles),
    userFlow: arrayField<string>(row.user_flow),
    openQuestions: arrayField<string>(row.open_questions),
    status: stringField(row.status, "generated") as ProductWindow["status"],
    createdAt: stringField(row.created_at, new Date().toISOString()),
    updatedAt: stringField(row.updated_at, new Date().toISOString()),
  };
}

function constitutionToRow(constitution: BrainpressConstitution, ownerId: string) {
  return {
    id: constitution.id,
    project_id: constitution.projectId,
    owner_id: ownerId,
    principles: constitution.principles,
    quality_rules: constitution.qualityRules,
    testing_rules: constitution.testingRules,
    architecture_rules: constitution.architectureRules,
    ux_rules: constitution.uxRules,
    safety_rules: constitution.safetyRules,
    approval_rules: constitution.approvalRules,
    created_at: constitution.createdAt,
    updated_at: constitution.updatedAt,
  };
}

function constitutionFromRow(row: ConstitutionRow): BrainpressConstitution {
  return {
    id: stringField(row.id),
    projectId: stringField(row.project_id),
    principles: arrayField<string>(row.principles),
    qualityRules: arrayField<string>(row.quality_rules),
    testingRules: arrayField<string>(row.testing_rules),
    architectureRules: arrayField<string>(row.architecture_rules),
    uxRules: arrayField<string>(row.ux_rules),
    safetyRules: arrayField<string>(row.safety_rules),
    approvalRules: arrayField<string>(row.approval_rules),
    createdAt: stringField(row.created_at, new Date().toISOString()),
    updatedAt: stringField(row.updated_at, new Date().toISOString()),
  };
}

function specToRow(spec: BrainpressSpec, ownerId: string) {
  return {
    id: spec.id,
    project_id: spec.projectId,
    service_id: spec.serviceId || spec.projectId,
    owner_id: ownerId,
    think_session_id: spec.thinkSessionId,
    product_window_id: spec.productWindowId,
    title: spec.title,
    what: spec.what,
    why: spec.why,
    user_stories: spec.userStories,
    success_criteria: spec.successCriteria,
    non_goals: spec.nonGoals,
    assumptions: spec.assumptions,
    open_questions: spec.openQuestions,
    clarification_status: spec.clarificationStatus,
    created_at: spec.createdAt,
    updated_at: spec.updatedAt,
  };
}

function specFromRow(row: SpecRow): BrainpressSpec {
  return {
    id: stringField(row.id),
    projectId: stringField(row.project_id),
    serviceId: optionalString(row.service_id),
    thinkSessionId: optionalString(row.think_session_id),
    productWindowId: optionalString(row.product_window_id),
    title: stringField(row.title),
    what: stringField(row.what),
    why: stringField(row.why),
    userStories: arrayField<string>(row.user_stories),
    successCriteria: arrayField<string>(row.success_criteria),
    nonGoals: arrayField<string>(row.non_goals),
    assumptions: arrayField<string>(row.assumptions),
    openQuestions: arrayField<string>(row.open_questions),
    clarificationStatus: stringField(row.clarification_status, "needs_clarification") as BrainpressSpec["clarificationStatus"],
    createdAt: stringField(row.created_at, new Date().toISOString()),
    updatedAt: stringField(row.updated_at, new Date().toISOString()),
  };
}

function clarifyingQuestionToRow(question: ClarifyingQuestion, ownerId: string) {
  return {
    id: question.id,
    spec_id: question.specId,
    owner_id: ownerId,
    question: question.question,
    reason: question.reason,
    answer: question.answer,
    status: question.status,
  };
}

function clarifyingQuestionFromRow(row: ClarifyingQuestionRow): ClarifyingQuestion {
  return {
    id: stringField(row.id),
    specId: stringField(row.spec_id),
    question: stringField(row.question),
    reason: stringField(row.reason),
    answer: optionalString(row.answer),
    status: stringField(row.status, "open") as ClarifyingQuestion["status"],
  };
}

function planToRow(plan: BrainpressPlan, ownerId: string) {
  return {
    id: plan.id,
    project_id: plan.projectId,
    service_id: plan.serviceId || plan.projectId,
    spec_id: plan.specId,
    owner_id: ownerId,
    technology_choices: plan.technologyChoices,
    architecture_notes: plan.architectureNotes,
    data_model: plan.dataModel,
    api_contracts: plan.apiContracts,
    risks: plan.risks,
    validation_plan: plan.validationPlan,
    created_at: plan.createdAt,
    updated_at: plan.updatedAt,
  };
}

function planFromRow(row: PlanRow): BrainpressPlan {
  return {
    id: stringField(row.id),
    projectId: stringField(row.project_id),
    serviceId: optionalString(row.service_id),
    specId: stringField(row.spec_id),
    technologyChoices: arrayField<string>(row.technology_choices),
    architectureNotes: arrayField<string>(row.architecture_notes),
    dataModel: arrayField<string>(row.data_model),
    apiContracts: arrayField<string>(row.api_contracts),
    risks: arrayField<string>(row.risks),
    validationPlan: arrayField<string>(row.validation_plan),
    createdAt: stringField(row.created_at, new Date().toISOString()),
    updatedAt: stringField(row.updated_at, new Date().toISOString()),
  };
}

function taskListToRow(taskList: BrainpressTaskList, ownerId: string) {
  return {
    id: taskList.id,
    project_id: taskList.projectId,
    service_id: taskList.serviceId || taskList.projectId,
    plan_id: taskList.planId,
    owner_id: ownerId,
    tasks: taskList.tasks,
    dependency_order: taskList.dependencyOrder,
    created_at: taskList.createdAt,
    updated_at: taskList.updatedAt,
  };
}

function taskListFromRow(row: TaskListRow): BrainpressTaskList {
  return {
    id: stringField(row.id),
    projectId: stringField(row.project_id),
    serviceId: optionalString(row.service_id),
    planId: stringField(row.plan_id),
    tasks: arrayField(row.tasks),
    dependencyOrder: arrayField<string>(row.dependency_order),
    createdAt: stringField(row.created_at, new Date().toISOString()),
    updatedAt: stringField(row.updated_at, new Date().toISOString()),
  };
}

function developmentTaskToRow(task: DevelopmentTask, ownerId: string) {
  return {
    id: task.id,
    project_id: task.projectId,
    owner_id: ownerId,
    title: task.title,
    description: task.description,
    task_type: task.taskType,
    status: task.status,
    priority: task.priority,
    repo: task.repo,
    branch: task.branch,
    context: task.context,
    affected_areas: task.affectedAreas,
    acceptance_criteria: task.acceptanceCriteria,
    verification_commands: task.verificationCommands,
    manual_qa_steps: task.manualQaSteps,
    constraints: task.constraints,
    dispatch_target: task.dispatchTarget,
    dispatch_mode: task.dispatchMode,
    codex_goal: task.codexGoal,
    codex_goal_updated_at: task.codexGoalUpdatedAt,
    codex_run_id: task.codexRunId,
    external_run_url: task.externalRunUrl,
    pr_url: task.prUrl,
    result_summary: task.resultSummary,
    result_raw: task.resultRaw,
    source_think_session_id: task.sourceThinkSessionId,
    source_product_window_id: task.sourceProductWindowId,
    source_run_issue_id: task.runIssueId,
    service_id: task.serviceId || task.projectId,
    source_spec_id: task.sourceSpecId,
    source_plan_id: task.sourcePlanId,
    source_spec_task_id: task.sourceSpecTaskId,
    agent_source: task.agentSource,
    agent_model: task.agentModel,
    agent_error: task.agentError,
    status_history: task.statusHistory,
    created_at: task.createdAt,
    updated_at: task.updatedAt,
  };
}

function developmentTaskFromRow(row: DevelopmentTaskRow): DevelopmentTask {
  return {
    id: stringField(row.id),
    projectId: stringField(row.project_id),
    title: stringField(row.title),
    description: stringField(row.description),
    taskType: stringField(row.task_type, "feature") as DevelopmentTask["taskType"],
    status: stringField(row.status, "ready_to_dispatch") as DevelopmentTask["status"],
    priority: stringField(row.priority, "medium") as DevelopmentTask["priority"],
    repo: stringField(row.repo),
    branch: stringField(row.branch),
    context: arrayField<string>(row.context),
    affectedAreas: arrayField<string>(row.affected_areas),
    acceptanceCriteria: arrayField<string>(row.acceptance_criteria),
    verificationCommands: arrayField<string>(row.verification_commands),
    manualQaSteps: arrayField<string>(row.manual_qa_steps),
    constraints: arrayField<string>(row.constraints),
    dispatchTarget: stringField(row.dispatch_target, "github_issue") as DevelopmentTask["dispatchTarget"],
    dispatchMode: stringField(row.dispatch_mode, "github_based") as DevelopmentTask["dispatchMode"],
    codexGoal: stringField(row.codex_goal),
    codexGoalUpdatedAt: optionalString(row.codex_goal_updated_at),
    codexRunId: optionalString(row.codex_run_id),
    externalRunUrl: optionalString(row.external_run_url),
    prUrl: optionalString(row.pr_url),
    resultSummary: stringField(row.result_summary),
    resultRaw: stringField(row.result_raw),
    sourceThinkSessionId: optionalString(row.source_think_session_id),
    sourceProductWindowId: optionalString(row.source_product_window_id),
    runIssueId: optionalString(row.source_run_issue_id),
    serviceId: optionalString(row.service_id),
    sourceSpecId: optionalString(row.source_spec_id),
    sourcePlanId: optionalString(row.source_plan_id),
    sourceSpecTaskId: optionalString(row.source_spec_task_id),
    agentSource: optionalString(row.agent_source) as DevelopmentTask["agentSource"],
    agentModel: optionalString(row.agent_model),
    agentError: optionalString(row.agent_error),
    statusHistory: arrayField(row.status_history),
    createdAt: stringField(row.created_at, new Date().toISOString()),
    updatedAt: stringField(row.updated_at, new Date().toISOString()),
  };
}

function developmentTaskResultToRow(result: DevelopmentTaskResult, ownerId: string) {
  return {
    id: result.id,
    task_id: result.taskId,
    project_id: taskProjectIdFromResult(result),
    owner_id: ownerId,
    source: result.source,
    raw_text: result.rawText,
    summary: result.summary,
    changed_files: result.changedFiles,
    commands_run: result.commandsRun,
    verification_results: result.verificationResults,
    manual_qa_results: result.manualQaResults,
    risks: result.risks,
    remaining_issues: result.remainingIssues,
    next_tasks: result.nextTasks,
    pr_url: result.prUrl,
    recommended_status: result.recommendedStatus,
    acceptance_criteria_review: result.acceptanceCriteriaReview,
    created_at: result.createdAt,
  };
}

function developmentTaskResultFromRow(row: DevelopmentTaskResultRow): DevelopmentTaskResult {
  return {
    id: stringField(row.id),
    taskId: stringField(row.task_id),
    source: stringField(row.source, "manual_import") as DevelopmentTaskResult["source"],
    rawText: stringField(row.raw_text),
    summary: stringField(row.summary),
    changedFiles: arrayField<string>(row.changed_files),
    commandsRun: arrayField<string>(row.commands_run),
    verificationResults: arrayField(row.verification_results),
    manualQaResults: arrayField(row.manual_qa_results),
    risks: arrayField<string>(row.risks),
    remainingIssues: arrayField<string>(row.remaining_issues),
    nextTasks: arrayField<string>(row.next_tasks),
    prUrl: optionalString(row.pr_url),
    recommendedStatus: stringField(row.recommended_status, "needs_review") as DevelopmentTaskResult["recommendedStatus"],
    acceptanceCriteriaReview: arrayField(row.acceptance_criteria_review),
    createdAt: stringField(row.created_at, new Date().toISOString()),
  };
}

function runIssueToRow(issue: RunIssue, ownerId: string) {
  return {
    id: issue.id,
    project_id: issue.projectId,
    owner_id: ownerId,
    type: issue.type,
    title: issue.title,
    summary: issue.summary,
    provider: issue.provider,
    likely_causes: issue.likelyCauses,
    recommended_steps: issue.recommendedSteps,
    verification_steps: issue.verificationSteps,
    required_access: issue.requiredAccess,
    risks: issue.risks,
    recommended_build_tasks: issue.recommendedBuildTasks,
    agent_source: issue.agentSource,
    agent_model: issue.agentModel,
    agent_error: issue.agentError,
    created_at: issue.createdAt,
    updated_at: new Date().toISOString(),
  };
}

function runIssueFromRow(row: RunIssueRow): RunIssue {
  return {
    id: stringField(row.id),
    projectId: stringField(row.project_id),
    type: stringField(row.type, "infrastructure") as RunIssue["type"],
    title: stringField(row.title),
    summary: stringField(row.summary),
    provider: optionalString(row.provider) as RunIssue["provider"],
    likelyCauses: arrayField<string>(row.likely_causes),
    recommendedSteps: arrayField<string>(row.recommended_steps),
    verificationSteps: arrayField<string>(row.verification_steps),
    requiredAccess: arrayField<string>(row.required_access),
    risks: arrayField<string>(row.risks),
    recommendedBuildTasks: arrayField<string>(row.recommended_build_tasks),
    agentSource: optionalString(row.agent_source) as RunIssue["agentSource"],
    agentModel: optionalString(row.agent_model),
    agentError: optionalString(row.agent_error),
    createdAt: stringField(row.created_at, new Date().toISOString()),
  };
}

function taskProjectIdFromResult(result: DevelopmentTaskResult) {
  const task = loadBrainpressState().developmentTasks.find((item) => item.id === result.taskId);
  return task?.projectId || initialState.projects[0]?.id || "";
}

function stringField(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function optionalString(value: unknown) {
  return typeof value === "string" && value ? value : undefined;
}

function arrayField<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}
