import { uid } from "@/lib/brainpress";
import { defaultPermissionSafetyRules } from "@/lib/safety";
import type {
  BrainpressTaskList,
  DevelopmentTask,
  BrainpressPlan,
  BrainpressService,
  BrainpressSpec,
  BrainpressServiceStage,
  Memory,
  Project,
  ServiceAgent,
  ServiceAgentPermissionLevel,
  ServiceAgentStatus,
  ServiceWindow,
  ServiceWindowScreen,
  ServiceWindowStatus,
} from "@/lib/types";

export function createServiceFromProject(project: Project, now = new Date().toISOString()): BrainpressService {
  const mainAgentId = `agent_${project.id}_main`;
  const servicePromise = project.primaryGoal || `Help a founder operate ${project.name} with agents.`;
  return {
    id: project.id,
    name: serviceNameFromProject(project.name),
    description: project.description || "Agent-native service operated through Think, Build, and Run.",
    servicePromise,
    targetCustomer: "Founder-builders and product operators",
    desiredOutcome: servicePromise,
    currentStage: inferServiceStage(project),
    mainAgentId,
    agentIds: [mainAgentId],
    serviceWorkflow: defaultServiceWorkflow(),
    humanApprovalPoints: defaultHumanApprovalPoints(),
    successMetrics: defaultSuccessMetrics(),
    openQuestions: [],
    createdAt: project.createdAt || now,
    updatedAt: now,
  };
}

export function createProjectFromServiceInput({
  serviceName,
  targetCustomer,
  outcome,
  now = new Date().toISOString(),
}: {
  serviceName: string;
  targetCustomer: string;
  outcome: string;
  now?: string;
}): Project {
  return {
    id: uid("service"),
    name: serviceName.trim() || "Untitled Service",
    description: targetCustomer.trim()
      ? `AI-powered service for ${targetCustomer.trim()}.`
      : "AI-powered service operated by agents.",
    repoPathOrUrl: "",
    preferredAgent: "Codex",
    primaryGoal: outcome.trim() || "Deliver a clear outcome through an agent-operated service.",
    constraints: [
      "Codex is the first execution provider.",
      "Human approval is required before dispatch, merge, deploy, or marking work verified.",
    ],
    verificationCommands: ["npm run typecheck", "npm test", "npm run build"],
    safetyRules: defaultPermissionSafetyRules,
    createdAt: now,
  };
}

export function createServiceFromInput({
  project,
  serviceName,
  targetCustomer,
  outcome,
  now = new Date().toISOString(),
}: {
  project: Project;
  serviceName: string;
  targetCustomer: string;
  outcome: string;
  now?: string;
}): BrainpressService {
  const base = createServiceFromProject(project, now);
  return {
    ...base,
    name: serviceName.trim() || base.name,
    description: targetCustomer.trim() ? `AI-powered service for ${targetCustomer.trim()}.` : base.description,
    servicePromise: outcome.trim() || base.servicePromise,
    targetCustomer: targetCustomer.trim() || base.targetCustomer,
    desiredOutcome: outcome.trim() || base.desiredOutcome,
    currentStage: outcome.trim().length > 20 ? "idea" : "needs_clarification",
  };
}

export function generateServiceBlueprint({
  service,
  agents,
  spec,
  memory,
  now = new Date().toISOString(),
}: {
  service: BrainpressService;
  agents: ServiceAgent[];
  spec?: BrainpressSpec;
  memory?: Memory;
  now?: string;
}): { service: BrainpressService; agents: ServiceAgent[] } {
  const servicePromise = bestText(
    spec?.what,
    memory?.consolidated?.productSnapshot,
    memory?.productSummary,
    service.servicePromise,
    `Operate ${service.name} as an agent-powered service.`,
  );
  const targetCustomer = bestText(
    extractTargetCustomerFromSpec(spec),
    memory?.targetUsers,
    service.targetCustomer,
    "Founder-builders and product operators",
  );
  const desiredOutcome = bestText(
    spec?.why,
    memory?.consolidated?.suggestedNextOutcome?.goal,
    service.desiredOutcome,
    servicePromise,
  );
  const serviceWorkflow = dedupeStrings([
    ...service.serviceWorkflow,
    ...defaultServiceWorkflow(),
    spec ? `Clarify the Service Spec: ${shortText(spec.what, 140)}` : "",
    memory?.consolidated?.whatToDoNext?.[0] ? `Turn the next recommended action into Build work: ${memory.consolidated.whatToDoNext[0]}` : "",
  ]).slice(0, 8);
  const humanApprovalPoints = dedupeStrings([
    ...service.humanApprovalPoints,
    ...defaultHumanApprovalPoints(),
    "Before sending customer-facing output or changing production data.",
  ]).slice(0, 8);
  const successMetrics = dedupeStrings([
    ...service.successMetrics,
    ...defaultSuccessMetrics(),
    ...arrayFromMaybe(spec?.successCriteria),
  ]).slice(0, 8);
  const openQuestions = dedupeStrings([
    ...service.openQuestions,
    ...arrayFromMaybe(spec?.openQuestions),
    ...linesFromText(memory?.openQuestions),
  ]).slice(0, 8);

  const mainAgentId = service.mainAgentId || `agent_${service.id}_main`;
  const updatedService: BrainpressService = {
    ...service,
    servicePromise,
    targetCustomer,
    desiredOutcome,
    serviceWorkflow,
    humanApprovalPoints,
    successMetrics,
    openQuestions,
    mainAgentId,
    currentStage: openQuestions.length ? "needs_clarification" : spec ? "spec_ready" : service.currentStage,
    updatedAt: now,
  };
  const generatedAgents = createBlueprintAgents(updatedService, agents, spec, memory, now);
  return {
    service: {
      ...updatedService,
      agentIds: generatedAgents.map((agent) => agent.id),
    },
    agents: generatedAgents,
  };
}

export function createDefaultServiceAgents(service: BrainpressService, now = new Date().toISOString()): ServiceAgent[] {
  const mainAgent = createServiceAgent({
    id: service.mainAgentId || `agent_${service.id}_main`,
    serviceId: service.id,
    name: `${service.name.replace(/\s+Service$/i, "")} Orchestrator`,
    role: "Main agent",
    goal: `Coordinate the ${service.name} so it delivers: ${service.servicePromise}`,
    inputs: ["Founder intent", "Customer request", "Service memory", "Approval decisions"],
    outputs: ["Structured service plan", "Build tasks", "Approval requests", "Run status"],
    tools: ["Brainpress Think", "Brainpress Build", "Brainpress Run", "Codex"],
    memoryScope: "Service-wide memory, specs, plans, tasks, and run reviews.",
    permissionLevel: "founder_approval_required",
    escalationRules: ["Ask the founder before dispatching Codex.", "Ask the founder before merge, deploy, or verified status."],
    successMetric: "The service delivers the promised outcome with clear verification evidence.",
    status: "active",
    now,
  });

  const qaAgent = createServiceAgent({
    id: `agent_${service.id}_qa`,
    serviceId: service.id,
    name: "Service QA Agent",
    role: "Sub-agent",
    goal: "Verify that agent-built service flows work before the founder relies on them.",
    inputs: ["Acceptance criteria", "Build results", "Run issues"],
    outputs: ["QA checklist", "Verification gaps", "Fix tasks"],
    tools: ["Browser QA", "Verification commands", "Result review"],
    memoryScope: "QA results, risks, and remaining issues for this service.",
    permissionLevel: "medium",
    escalationRules: ["Escalate unknown verification evidence.", "Escalate broken production flows."],
    successMetric: "Critical flows have explicit pass/fail evidence.",
    status: "proposed",
    now,
  });

  return [mainAgent, qaAgent];
}

export function createEmptyServiceWindow(serviceId: string, now = new Date().toISOString()): ServiceWindow {
  return {
    id: `service_window_${serviceId}`,
    serviceId,
    status: "empty",
    screens: [],
    primaryFlow: [],
    agentInteractionPoints: [],
    humanApprovalPoints: [],
    updatedAt: now,
  };
}

export function generateServiceWindow({
  service,
  agents,
  spec,
  plan,
  now = new Date().toISOString(),
}: {
  service: BrainpressService;
  agents: ServiceAgent[];
  spec?: BrainpressSpec;
  plan?: BrainpressPlan;
  now?: string;
}): ServiceWindow {
  const mainAgent = agents.find((agent) => agent.id === service.mainAgentId) || agents[0];
  const planComponents = plan?.technologyChoices?.slice(0, 3) || [];
  const screens: ServiceWindowScreen[] = [
    {
      id: uid("screen"),
      name: "Service Intake",
      purpose: `Capture what the ${service.targetCustomer || "user"} needs from the service.`,
      keyComponents: dedupeStrings(["Outcome input", "Context upload area", "Service promise panel", ...planComponents]).slice(0, 6),
      userInputs: ["Service request", "Relevant context", "Constraints"],
      serviceOutputs: ["Structured intake summary", "Clarifying questions"],
      agentInteractions: [`${mainAgent?.name || "Main agent"} reviews the request and frames the service workflow.`],
      approvalPoints: [service.humanApprovalPoints[0] || "Founder approves moving from intake to Build or Run."],
    },
    {
      id: uid("screen"),
      name: "Agent Workbench",
      purpose: "Show what the agent team is doing and what requires human approval.",
      keyComponents: ["Agent team status", "Workflow steps", "Approval queue", "Codex task handoff", "Service workflow state"],
      userInputs: ["Approval decisions", "Priority changes", "Follow-up notes"],
      serviceOutputs: ["Build tasks", "Codex prompt package", "Run checklist", "Agent handoff state"],
      agentInteractions: agents.map((agent) => `${agent.name}: ${agent.role}`),
      approvalPoints: service.humanApprovalPoints.length ? service.humanApprovalPoints.slice(0, 3) : ["Founder approval before Codex dispatch.", "Founder approval before merge, deploy, or verified status."],
    },
    {
      id: uid("screen"),
      name: "Human Approval",
      purpose: "Make risky service actions explicit before Codex, production, or customer-impacting work happens.",
      keyComponents: ["Approval queue", "Risk explanation", "Permission policy", "Decision history"],
      userInputs: ["Approve", "Reject", "Request clarification"],
      serviceOutputs: ["Approved work package", "Blocked action", "Clarifying question"],
      agentInteractions: agents.slice(0, 3).map((agent) => `${agent.name} explains what needs approval.`),
      approvalPoints: service.humanApprovalPoints.length ? service.humanApprovalPoints : defaultHumanApprovalPoints(),
    },
    {
      id: uid("screen"),
      name: "Service Results",
      purpose: "Review the service output, verification, risks, and next action.",
      keyComponents: ["Result summary", "Verification evidence", "Risks", "Next action"],
      userInputs: ["Accept result", "Request fix", "Create next Build task"],
      serviceOutputs: ["Verified service output", "Fix task", "Run monitoring note"],
      agentInteractions: ["QA Agent checks acceptance criteria and missing evidence."],
      approvalPoints: ["Founder marks result accepted only after reviewing evidence."],
    },
  ];

  return {
    id: `service_window_${service.id}`,
    serviceId: service.id,
    status: "generated",
    screens,
    primaryFlow: [
      `${service.targetCustomer || "User"} describes the desired outcome.`,
      `${mainAgent?.name || "Main agent"} clarifies the request and routes work to Think, Build, or Run.`,
      ...service.serviceWorkflow.slice(0, 3),
      "Codex receives approved Build tasks when implementation is needed.",
      "Brainpress verifies the result and asks for human approval before marking work complete.",
    ].filter(Boolean),
    agentInteractionPoints: [
      `${mainAgent?.name || "Main agent"} owns orchestration.`,
      ...agents.filter((agent) => agent.id !== mainAgent?.id).slice(0, 4).map((agent) => `${agent.name} supports ${agent.goal}`),
    ],
    humanApprovalPoints: service.humanApprovalPoints.length ? service.humanApprovalPoints : defaultHumanApprovalPoints(),
    generatedAt: now,
    updatedAt: now,
  };
}

export function createServiceWindowCodexPrompt({
  service,
  agents,
  serviceWindow,
  spec,
  plan,
  taskLists = [],
  developmentTasks = [],
  memory,
}: {
  service: BrainpressService;
  agents: ServiceAgent[];
  serviceWindow: ServiceWindow;
  spec?: BrainpressSpec;
  plan?: BrainpressPlan;
  taskLists?: BrainpressTaskList[];
  developmentTasks?: DevelopmentTask[];
  memory?: Memory;
}) {
  const specTasks = taskLists.flatMap((taskList) => taskList.tasks);
  return [
    `# Codex Build Prompt: ${service.name} UI/UX`,
    "",
    "## Service Context",
    `Service Promise: ${service.servicePromise}`,
    `Target Customer: ${service.targetCustomer}`,
    `Desired Outcome: ${service.desiredOutcome}`,
    service.serviceWorkflow.length ? ["", "## Service Workflow", ...service.serviceWorkflow.map((item) => `- ${item}`)].join("\n") : "",
    service.humanApprovalPoints.length ? ["", "## Human Approval Points", ...service.humanApprovalPoints.map((item) => `- ${item}`)].join("\n") : "",
    service.successMetrics.length ? ["", "## Success Metrics", ...service.successMetrics.map((item) => `- ${item}`)].join("\n") : "",
    spec ? `Spec: ${spec.what}` : "",
    spec?.why ? `Why: ${spec.why}` : "",
    spec?.successCriteria?.length ? ["", "## Spec Success Criteria", ...spec.successCriteria.map((item) => `- ${item}`)].join("\n") : "",
    plan ? `Plan: ${plan.architectureNotes.join(" ")}` : "",
    specTasks.length ? ["", "## Ordered Spec Tasks", ...specTasks.map((task) => `- ${task.title}: ${task.description}`)].join("\n") : "",
    developmentTasks.length ? ["", "## Existing DevelopmentTasks", ...developmentTasks.slice(0, 8).map((task) => `- ${task.title} (${task.status})`)].join("\n") : "",
    developmentTasks.length ? ["", "## Acceptance Criteria", ...dedupeStrings(developmentTasks.flatMap((task) => task.acceptanceCriteria)).slice(0, 12).map((item) => `- ${item}`)].join("\n") : "",
    memory?.consolidated?.whatIsBrokenOrRisky?.length ? ["", "## Relevant Memory Risks", ...memory.consolidated.whatIsBrokenOrRisky.map((item) => `- ${item}`)].join("\n") : "",
    "",
    "## Agent Team",
    ...agents.map((agent) => `- ${agent.name}: ${agent.goal} Permission: ${agent.permissionLevel}. Inputs: ${agent.inputs.join(", ")}. Outputs: ${agent.outputs.join(", ")}.`),
    "",
    "## Generated Service UI/UX",
    ...serviceWindow.screens.flatMap((screen) => [
      `### ${screen.name}`,
      `Purpose: ${screen.purpose}`,
      `Components: ${screen.keyComponents.join(", ")}`,
      `Inputs: ${screen.userInputs.join(", ")}`,
      `Outputs: ${screen.serviceOutputs.join(", ")}`,
      `Agent interactions: ${screen.agentInteractions.join(", ")}`,
      `Approval points: ${screen.approvalPoints.join(", ")}`,
      "",
    ]),
    "## Requirements",
    "- Implement the service front office, not generic dashboard filler.",
    "- Implement the agent infrastructure surfaces needed to show main agent, sub-agents, workflow state, approvals, and result review.",
    "- Preserve existing PDF upload, memory/sources, Spec Loop, DevelopmentTasks, GitHub Dispatch, Local Bridge, and local/cloud storage behavior.",
    "- Make human approval explicit before Codex dispatch, merge, deploy, or verified status.",
    "- Preserve Think / Build / Run architecture and existing storage behavior.",
    "- Do not add multi-provider execution support yet; Codex remains the execution provider.",
    "- Run typecheck, tests, and build before reporting completion.",
  ].filter(Boolean).join("\n");
}

export function normalizeService(value: Partial<BrainpressService>, project?: Project): BrainpressService {
  const now = new Date().toISOString();
  const fallback = project ? createServiceFromProject(project, now) : undefined;
  const id = value.id || fallback?.id || uid("service");
  const mainAgentId = value.mainAgentId || fallback?.mainAgentId || `agent_${id}_main`;
  return {
    id,
    name: value.name || fallback?.name || "Untitled Service",
    description: value.description || fallback?.description || "Agent-native service operated through Think, Build, and Run.",
    servicePromise: value.servicePromise || fallback?.servicePromise || "Deliver a clear outcome through an agent-operated service.",
    targetCustomer: value.targetCustomer || fallback?.targetCustomer || "Founder-builders",
    desiredOutcome: value.desiredOutcome || fallback?.desiredOutcome || value.servicePromise || fallback?.servicePromise || "Deliver a clear service outcome.",
    currentStage: isServiceStage(value.currentStage) ? value.currentStage : fallback?.currentStage || "idea",
    mainAgentId,
    agentIds: arrayField(value.agentIds).length ? arrayField(value.agentIds) : [mainAgentId],
    serviceWorkflow: arrayField(value.serviceWorkflow).length ? arrayField(value.serviceWorkflow) : fallback?.serviceWorkflow || defaultServiceWorkflow(),
    humanApprovalPoints: arrayField(value.humanApprovalPoints).length ? arrayField(value.humanApprovalPoints) : fallback?.humanApprovalPoints || defaultHumanApprovalPoints(),
    successMetrics: arrayField(value.successMetrics).length ? arrayField(value.successMetrics) : fallback?.successMetrics || defaultSuccessMetrics(),
    openQuestions: arrayField(value.openQuestions),
    createdAt: value.createdAt || fallback?.createdAt || now,
    updatedAt: value.updatedAt || value.createdAt || fallback?.updatedAt || now,
  };
}

export function normalizeServiceAgent(value: Partial<ServiceAgent>, serviceId?: string): ServiceAgent {
  const now = new Date().toISOString();
  return {
    id: value.id || uid("agent"),
    serviceId: value.serviceId || serviceId || "",
    name: value.name || "Service Agent",
    role: value.role || "Sub-agent",
    goal: value.goal || "Help the service deliver its promised outcome.",
    inputs: arrayField(value.inputs),
    outputs: arrayField(value.outputs),
    tools: arrayField(value.tools),
    memoryScope: value.memoryScope || "Service memory.",
    permissionLevel: isPermissionLevel(value.permissionLevel) ? value.permissionLevel : "founder_approval_required",
    escalationRules: arrayField(value.escalationRules),
    successMetric: value.successMetric || "Service outcome is delivered and verified.",
    status: isAgentStatus(value.status) ? value.status : "proposed",
    createdAt: value.createdAt || now,
    updatedAt: value.updatedAt || value.createdAt || now,
  };
}

export function normalizeServiceWindow(value: Partial<ServiceWindow>, serviceId?: string): ServiceWindow {
  const now = new Date().toISOString();
  return {
    id: value.id || `service_window_${value.serviceId || serviceId || uid("service")}`,
    serviceId: value.serviceId || serviceId || "",
    status: isServiceWindowStatus(value.status) ? value.status : "empty",
    screens: Array.isArray(value.screens) ? value.screens.map(normalizeServiceWindowScreen) : [],
    primaryFlow: arrayField(value.primaryFlow),
    agentInteractionPoints: arrayField(value.agentInteractionPoints),
    humanApprovalPoints: arrayField(value.humanApprovalPoints),
    generatedAt: value.generatedAt,
    updatedAt: value.updatedAt || now,
  };
}

function normalizeServiceWindowScreen(value: Partial<ServiceWindowScreen>): ServiceWindowScreen {
  return {
    id: value.id || uid("screen"),
    name: value.name || "Service screen",
    purpose: value.purpose || "",
    keyComponents: arrayField(value.keyComponents),
    userInputs: arrayField(value.userInputs),
    serviceOutputs: arrayField(value.serviceOutputs),
    agentInteractions: arrayField(value.agentInteractions),
    approvalPoints: arrayField(value.approvalPoints),
  };
}

function createServiceAgent(params: Omit<ServiceAgent, "createdAt" | "updatedAt"> & { now: string }): ServiceAgent {
  const { now, ...agent } = params;
  return {
    ...agent,
    createdAt: now,
    updatedAt: now,
  };
}

function createBlueprintAgents(
  service: BrainpressService,
  existingAgents: ServiceAgent[],
  spec: BrainpressSpec | undefined,
  memory: Memory | undefined,
  now: string,
) {
  const existingById = new Map(existingAgents.map((agent) => [agent.id, agent]));
  const baseName = service.name.replace(/\s+Service$/i, "");
  const mainAgentId = service.mainAgentId || `agent_${service.id}_main`;
  const mainAgent = mergeAgent(existingById.get(mainAgentId), {
    id: mainAgentId,
    serviceId: service.id,
    name: `${baseName} Orchestrator`,
    role: "Main agent",
    goal: `Coordinate the service workflow so it delivers: ${service.servicePromise}`,
    inputs: ["Founder intent", "Customer request", "Service Spec", "Service memory", "Approval decisions"],
    outputs: ["Service plan", "Agent assignments", "Codex-ready Build tasks", "Approval requests", "Run status"],
    tools: ["Brainpress Think", "Brainpress Build", "Brainpress Run", "Codex", "GitHub Dispatch"],
    memoryScope: "Full service memory, specs, plans, tasks, sources, run reviews, and approval history.",
    permissionLevel: "founder_approval_required",
    escalationRules: ["Ask the founder before dispatching Codex.", "Ask the founder before merge, deploy, or verified status.", "Stop when access outside the service scope is needed."],
    successMetric: service.successMetrics[0] || "The service delivers the promised outcome with verification evidence.",
    status: "active",
    now,
  });

  const subAgentSeeds: Array<Omit<ServiceAgent, "createdAt" | "updatedAt"> & { now: string }> = [
    {
      id: `agent_${service.id}_intake`,
      serviceId: service.id,
      name: "Intake & Clarification Agent",
      role: "Sub-agent",
      goal: "Turn messy service requests into clear specs, open questions, and approval-ready next steps.",
      inputs: ["Founder notes", "Customer context", "Imported sources", "Open questions"],
      outputs: ["Clarifying questions", "Service Spec updates", "Service workflow notes"],
      tools: ["Brainpress Think", "Spec Loop", "Source memory"],
      memoryScope: "Service promise, target customer, source summaries, and spec decisions.",
      permissionLevel: "low",
      escalationRules: ["Escalate unclear customer outcome.", "Escalate conflicting product decisions."],
      successMetric: "The next Build step is clear before Codex receives work.",
      status: "proposed",
      now,
    },
    {
      id: `agent_${service.id}_codex`,
      serviceId: service.id,
      name: "Codex Build Agent",
      role: "Sub-agent",
      goal: "Prepare safe Codex implementation work from specs, plans, ServiceWindow UI/UX, and acceptance criteria.",
      inputs: ["Service Spec", "Build Plan", "SpecTasks", "ServiceWindow", "Permission rules"],
      outputs: ["Codex Build Prompt", "DevelopmentTasks", "Verification checklist"],
      tools: ["Brainpress Build", "Codex", "GitHub Dispatch", "Local Bridge"],
      memoryScope: "Build tasks, implementation constraints, verification commands, and agent run results.",
      permissionLevel: "founder_approval_required",
      escalationRules: ["Ask before Codex dispatch.", "Ask before package installs.", "Stop before destructive or out-of-scope commands."],
      successMetric: "Codex work is scoped, permission-safe, and verifiable.",
      status: "proposed",
      now,
    },
    {
      id: `agent_${service.id}_qa`,
      serviceId: service.id,
      name: "QA & Verification Agent",
      role: "Sub-agent",
      goal: "Verify the service behavior, compare results to acceptance criteria, and create fix tasks when evidence is missing.",
      inputs: ["Build result", "Acceptance criteria", "Manual QA notes", "Verification command output"],
      outputs: ["Result review", "Verification gaps", "Fix tasks", "Risk notes"],
      tools: ["Result Review", "Verification commands", "Browser QA"],
      memoryScope: "QA evidence, failed checks, risks, and remaining issues.",
      permissionLevel: "medium",
      escalationRules: ["Escalate unknown browser evidence.", "Escalate failed typecheck/test/build results."],
      successMetric: "Every critical criterion has pass/fail/unknown evidence.",
      status: "proposed",
      now,
    },
  ];

  if (/(supabase|vercel|deploy|production|database|auth|storage|integration)/i.test([service.description, service.servicePromise, spec?.what, memory?.technicalArchitecture].join(" "))) {
    subAgentSeeds.push({
      id: `agent_${service.id}_ops`,
      serviceId: service.id,
      name: "Service Operations Agent",
      role: "Sub-agent",
      goal: "Track infrastructure, integrations, deployments, and production issues for the running service.",
      inputs: ["Run issues", "Deployment notes", "Environment requirements", "Integration status"],
      outputs: ["Infra checklist", "Deployment diagnosis", "Run fix tasks"],
      tools: ["Brainpress Run", "Supabase checklist", "Vercel checklist", "GitHub Dispatch"],
      memoryScope: "Run issues, environment notes, deployment blockers, and integration risks.",
      permissionLevel: "founder_approval_required",
      escalationRules: ["Ask before changing production environment variables.", "Ask before database or auth policy changes."],
      successMetric: "Service operations blockers are diagnosed and converted into safe Build tasks.",
      status: "proposed",
      now,
    });
  }

  return [mainAgent, ...subAgentSeeds.map((seed) => mergeAgent(existingById.get(seed.id), seed))];
}

function mergeAgent(existing: ServiceAgent | undefined, next: Omit<ServiceAgent, "createdAt" | "updatedAt"> & { now: string }): ServiceAgent {
  const createdAt = existing?.createdAt || next.now;
  return {
    ...createServiceAgent(next),
    ...existing,
    name: next.name,
    role: next.role,
    goal: next.goal,
    inputs: dedupeStrings([...(existing?.inputs || []), ...next.inputs]),
    outputs: dedupeStrings([...(existing?.outputs || []), ...next.outputs]),
    tools: dedupeStrings([...(existing?.tools || []), ...next.tools]),
    memoryScope: next.memoryScope,
    permissionLevel: next.permissionLevel,
    escalationRules: dedupeStrings([...(existing?.escalationRules || []), ...next.escalationRules]),
    successMetric: next.successMetric,
    status: next.status,
    createdAt,
    updatedAt: next.now,
  };
}

function serviceNameFromProject(name: string) {
  if (/service$/i.test(name)) return name;
  if (/brainpress core/i.test(name)) return "Brainpress Agent Service";
  return `${name || "Untitled"} Service`;
}

function inferServiceStage(project: Project): BrainpressServiceStage {
  if (/running|production|operate/i.test(project.primaryGoal)) return "running";
  if (/build|implement|codex/i.test(project.primaryGoal)) return "build_ready";
  if (/spec|clarify|direction/i.test(project.primaryGoal)) return "spec_ready";
  return "idea";
}

function defaultServiceWorkflow() {
  return [
    "Capture the user or founder request.",
    "Clarify the desired outcome and missing context.",
    "Route implementation work to Codex only after approval.",
    "Verify results against acceptance criteria.",
    "Turn risks, failures, and feedback into the next Build task.",
  ];
}

function defaultHumanApprovalPoints() {
  return [
    "Before Codex dispatch.",
    "Before merge, deploy, or verified status.",
    "Before accessing secrets, production data, or services outside the selected service scope.",
  ];
}

function defaultSuccessMetrics() {
  return [
    "The service delivers its promised outcome.",
    "Verification evidence is captured before work is marked complete.",
    "The founder can see the next recommended action.",
  ];
}

function bestText(...values: Array<string | undefined>) {
  return values.find((value) => typeof value === "string" && value.trim().length > 0)?.trim() || "";
}

function extractTargetCustomerFromSpec(spec?: BrainpressSpec) {
  const story = spec?.userStories.find((item) => /as a|user|founder|customer|operator/i.test(item));
  if (!story) return "";
  return shortText(story.replace(/^as an?\s+/i, "").replace(/,.*$/g, ""), 100);
}

function linesFromText(text?: string) {
  return (text || "")
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-*]\s*/, "").trim())
    .filter(Boolean);
}

function arrayFromMaybe(value?: string[]) {
  return Array.isArray(value) ? value : [];
}

function dedupeStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function shortText(value: string, maxLength: number) {
  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1).trim()}...` : normalized;
}

function arrayField(value: unknown): string[] {
  return Array.isArray(value)
    ? Array.from(new Set(value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim())))
    : [];
}

function isServiceStage(value: unknown): value is BrainpressServiceStage {
  return value === "idea" || value === "needs_clarification" || value === "spec_ready" || value === "build_ready" || value === "running";
}

function isPermissionLevel(value: unknown): value is ServiceAgentPermissionLevel {
  return value === "low" || value === "medium" || value === "high" || value === "founder_approval_required";
}

function isAgentStatus(value: unknown): value is ServiceAgentStatus {
  return value === "proposed" || value === "active" || value === "needs_setup" || value === "paused";
}

function isServiceWindowStatus(value: unknown): value is ServiceWindowStatus {
  return value === "empty" || value === "generated" || value === "needs_refinement";
}
