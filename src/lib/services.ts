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
  ServiceThinkingArtifact,
  ServiceWindow,
  ServiceWindowComponentSpec,
  ServiceWindowInformationArchitecture,
  ServiceWindowScreen,
  ServiceWindowStatus,
  ServiceWindowUxStrategy,
  ServiceWindowVisualSystem,
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
    designAgentName: "Brainpress Design Agent",
    designBrief: "",
    screens: [],
    primaryFlow: [],
    agentInteractionPoints: [],
    humanApprovalPoints: [],
    componentSystem: [],
    interactionStates: [],
    responsiveBehavior: [],
    accessibilityNotes: [],
    implementationNotes: [],
    codexImplementationPrompt: "",
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
  const designContext = [service.name, service.description, service.servicePromise, service.targetCustomer, spec?.what, plan?.architectureNotes.join(" ")].join(" ");
  const domain = inferServiceDesignDomain(designContext);
  const uxStrategy = createUxStrategy(service, domain);
  const informationArchitecture = createInformationArchitecture(service, domain);
  const screens = createDesignAgentScreens({ service, agents, mainAgent, spec, plan, domain });
  const visualSystem = createVisualSystem(domain);
  const componentSystem = createComponentSystem(domain, screens);
  const primaryFlow = createPrimaryFlow(service, mainAgent, domain);
  const agentInteractionPoints = [
    `${mainAgent?.name || "Main agent"} owns the request, trust framing, and final recommendation.`,
    ...agents.filter((agent) => agent.id !== mainAgent?.id).slice(0, 5).map((agent) => `${agent.name} contributes ${agent.outputs[0] || agent.goal}.`),
  ];
  const humanApprovalPoints = service.humanApprovalPoints.length ? service.humanApprovalPoints : defaultHumanApprovalPoints();
  const baseWindow: ServiceWindow = {
    id: `service_window_${service.id}`,
    serviceId: service.id,
    status: "design_generated",
    designAgentName: "Brainpress Design Agent",
    designBrief: [
      `Design a premium ${domain.label.toLowerCase()} for ${service.targetCustomer || "the target user"}.`,
      `The interface must make agent work, evidence, risks, and human approval visible before the service output is trusted.`,
      spec?.what ? `Service Spec: ${spec.what}` : "",
    ].filter(Boolean).join(" "),
    uxStrategy,
    informationArchitecture,
    screens,
    primaryFlow,
    agentInteractionPoints,
    humanApprovalPoints,
    visualSystem,
    componentSystem,
    interactionStates: [
      "Empty: explain what input the agent needs and show one primary intake action.",
      "Loading: show agent/sub-agent activity with the current step and expected next artifact.",
      "Needs approval: freeze risky actions behind explicit approve/reject controls.",
      "Error: explain what failed, what evidence is missing, and the safest next action.",
      "Success: show the recommendation, evidence, approvals, and follow-up Build or Run task.",
    ],
    responsiveBehavior: [
      "Desktop: left command/intake rail with a right-side work canvas for evidence, approvals, and recommendations.",
      "Tablet: keep the agent activity and approval queue visible above detailed evidence.",
      "Mobile: stack intake, agent status, recommendation, and approvals; make GitHub Dispatch or copy fallback reachable without horizontal scrolling.",
    ],
    accessibilityNotes: [
      "Every agent status and risk indicator must have text labels, not color alone.",
      "Approval controls must be keyboard reachable and clearly describe consequences.",
      "Evidence and source panels need readable contrast and collapsible long text.",
    ],
    implementationNotes: [
      "Implement this as the ServiceWindow front office for the selected agent service, not a generic SaaS dashboard.",
      "Keep Brainpress service/state engines intact and preserve Think / Build / Run navigation.",
      "Codex is the only execution provider for this build pass.",
      ...(plan?.validationPlan || []).slice(0, 3),
    ],
    generatedAt: now,
    updatedAt: now,
  };

  return {
    ...baseWindow,
    codexImplementationPrompt: createServiceWindowCodexPrompt({
      service,
      agents,
      serviceWindow: baseWindow,
      spec,
      plan,
    }),
  };
}

interface ServiceDesignDomain {
  key: "procurement" | "support" | "research" | "coding" | "lead_generation" | "general";
  label: string;
}

function inferServiceDesignDomain(input: string): ServiceDesignDomain {
  if (/(procurement|construction|vendor|quote|purchase order|supplier|budget|materials)/i.test(input)) {
    return { key: "procurement", label: "Procurement Command Center" };
  }
  if (/(support|ticket|customer service|help desk|inbox)/i.test(input)) return { key: "support", label: "Support Operations Console" };
  if (/(research|memo|analyst|document|pdf|sources)/i.test(input)) return { key: "research", label: "Research Analyst Workspace" };
  if (/(codex|build|software|qa|github|deploy|vercel|supabase)/i.test(input)) return { key: "coding", label: "Agent Build Command Center" };
  if (/(lead|sales|clinic|real estate|prospect|campaign)/i.test(input)) return { key: "lead_generation", label: "Lead Generation Control Room" };
  return { key: "general", label: "Agent Service Workspace" };
}

function createUxStrategy(service: BrainpressService, domain: ServiceDesignDomain): ServiceWindowUxStrategy {
  const trustConcernByDomain: Record<ServiceDesignDomain["key"], string> = {
    procurement: "The founder must trust vendor comparisons, budget flags, and purchase recommendations before approving spend.",
    support: "Operators must trust which messages the agent answered, escalated, or left unresolved.",
    research: "Founders must see sources and uncertainty before relying on synthesized findings.",
    coding: "Founders must understand what Codex will change, how it will be verified, and what needs approval.",
    lead_generation: "Founders must trust lead quality, follow-up status, and conversion risk before outreach.",
    general: "Users must understand what the agent is doing, what evidence it used, and what needs approval.",
  };
  return {
    targetUser: service.targetCustomer || "Founder or operator",
    jobToBeDone: service.desiredOutcome || service.servicePromise,
    trustConcern: trustConcernByDomain[domain.key],
    emotionalTone: domain.key === "procurement" ? "calm, exact, commercially confident" : "calm, premium, transparent, and agentic",
    complexityLevel: domain.key === "general" ? "medium" : "high-context service work made simple",
    successMoment: `The user approves a clear ${domain.label.toLowerCase()} recommendation with evidence, risk notes, and next steps.`,
  };
}

function createInformationArchitecture(service: BrainpressService, domain: ServiceDesignDomain): ServiceWindowInformationArchitecture {
  const domainNav: Record<ServiceDesignDomain["key"], string[]> = {
    procurement: ["Intake", "Quotes", "Vendors", "Approvals", "Evidence", "Activity"],
    support: ["Inbox", "Triage", "Responses", "Escalations", "Evidence", "Activity"],
    research: ["Question", "Sources", "Findings", "Risks", "Recommendations", "Activity"],
    coding: ["Intake", "Spec", "Build Tasks", "Verification", "Approvals", "Activity"],
    lead_generation: ["Campaign", "Leads", "Qualification", "Follow-up", "Approvals", "Activity"],
    general: ["Intake", "Workflow", "Recommendation", "Evidence", "Approvals", "Activity"],
  };
  return {
    mainNavigation: domainNav[domain.key],
    screenHierarchy: [`${domain.label} home`, "Work queue", "Evidence detail", "Approval detail", "Result review"],
    keyObjects: dedupeStrings([
      "Service request",
      "Agent run",
      "Evidence source",
      "Approval decision",
      "Risk flag",
      "Recommendation",
      ...(service.serviceWorkflow || []).slice(0, 3),
    ]),
    serviceStates: ["Draft intake", "Agent working", "Needs clarification", "Needs approval", "Ready to act", "Completed with evidence"],
  };
}

function createDesignAgentScreens({
  service,
  agents,
  mainAgent,
  spec,
  plan,
  domain,
}: {
  service: BrainpressService;
  agents: ServiceAgent[];
  mainAgent?: ServiceAgent;
  spec?: BrainpressSpec;
  plan?: BrainpressPlan;
  domain: ServiceDesignDomain;
}): ServiceWindowScreen[] {
  const planComponents = plan?.technologyChoices?.slice(0, 3) || [];
  if (domain.key === "procurement") {
    return [
      designScreen({
        name: "Procurement Intake",
        purpose: "Capture the material, service, budget, deadline, and approval constraints for a construction purchase.",
        userGoal: "Submit a purchase need without writing a procurement brief manually.",
        keyComponents: ["Scope intake", "Budget target", "Deadline selector", "Required evidence", "Approval policy"],
        userInputs: ["Item or service needed", "Quantity", "Budget", "Deadline", "Known vendors", "Constraints"],
        serviceOutputs: ["Normalized procurement request", "Missing information questions", "Research plan"],
        agentInteractions: [`${mainAgent?.name || "Main agent"} checks whether the request is ready for vendor research.`],
        subAgentOutputs: agents.map((agent) => `${agent.name}: ${agent.outputs[0] || agent.goal}`),
        approvalPoints: ["Founder approves vendor research scope before external outreach or purchase recommendation."],
      }),
      designScreen({
        name: "Vendor / Quote Comparison",
        purpose: "Compare vendor options, quotes, delivery timing, and risk in one decision surface.",
        userGoal: "Understand which vendor is best and why.",
        keyComponents: ["Quote comparison table", "Vendor reliability score", "Budget variance", "Delivery risk", "Evidence panel"],
        components: ["EvidencePanel", "RiskBadge", "RecommendationCard", "AgentActivityTimeline"],
        userInputs: ["Shortlist preference", "Reject vendor", "Request more evidence"],
        serviceOutputs: ["Ranked vendor recommendation", "Risk flags", "Evidence-backed rationale"],
        agentInteractions: ["Vendor Research Agent summarizes evidence and tradeoffs.", "Budget Agent flags cost variance."],
        subAgentOutputs: ["Vendor summaries", "Budget flags", "Delivery risk notes"],
        approvalPoints: ["Founder approves the recommended vendor before purchase or outreach."],
      }),
      designScreen({
        name: "Request Pipeline",
        purpose: "Show procurement requests by stage so operators know what is blocked, active, or approved.",
        userGoal: "Track every purchase request without losing context.",
        keyComponents: ["Pipeline columns", "Agent status cards", "Approval queue", "SLA indicators", "Activity timeline"],
        components: ["AgentStatusCard", "ApprovalQueue", "AgentActivityTimeline", "BuildReadinessPanel"],
        userInputs: ["Prioritize", "Approve", "Pause", "Ask for clarification"],
        serviceOutputs: ["Pipeline state", "Next action", "Blocked request explanation"],
        agentInteractions: ["Main agent updates stage and next action.", "QA Agent checks missing approval evidence."],
        subAgentOutputs: ["Status updates", "Clarification requests", "Approval recommendations"],
        approvalPoints: service.humanApprovalPoints,
      }),
      designScreen({
        name: "Purchase Recommendation",
        purpose: "Present the final procurement decision with evidence, risks, and approval actions.",
        userGoal: "Approve or reject the safest purchase decision.",
        keyComponents: ["Recommendation summary", "Budget and risk flags", "Evidence/source documents", "Approval actions", "Next steps"],
        components: ["RecommendationCard", "EvidencePanel", "ApprovalQueue", "RiskBadge"],
        userInputs: ["Approve purchase", "Reject", "Request new quote", "Add note"],
        serviceOutputs: ["Approved purchase package", "Rejected recommendation", "Follow-up task"],
        agentInteractions: ["Main agent explains the decision.", "Risk agent highlights unknowns."],
        subAgentOutputs: ["Evidence list", "Risk notes", "Follow-up tasks"],
        approvalPoints: ["Founder approval required before purchase, vendor commitment, or budget change."],
      }),
    ];
  }

  return [
    designScreen({
      name: "Service Intake",
      purpose: `Capture what the ${service.targetCustomer || "user"} needs from the service.`,
      userGoal: "Start the service with enough context for the agent team to act safely.",
      keyComponents: dedupeStrings(["Outcome input", "Context upload area", "Service promise panel", "Trust and permission note", ...planComponents]).slice(0, 7),
      userInputs: ["Service request", "Relevant context", "Constraints", "Approval preference"],
      serviceOutputs: ["Structured intake summary", "Clarifying questions", "Next recommended action"],
      agentInteractions: [`${mainAgent?.name || "Main agent"} reviews the request and frames the service workflow.`],
      subAgentOutputs: agents.slice(1, 4).map((agent) => `${agent.name}: ${agent.outputs[0] || agent.goal}`),
      approvalPoints: [service.humanApprovalPoints[0] || "Founder approves moving from intake to Build or Run."],
    }),
    designScreen({
      name: `${domain.label} Board`,
      purpose: "Show the service workflow, agent work state, and human approval queue in one operating surface.",
      userGoal: "Know what the agent is doing and what needs human judgment.",
      keyComponents: ["Agent team status", "Workflow steps", "Approval queue", "Evidence drawer", "Risk flags", "Next action"],
      userInputs: ["Approval decisions", "Priority changes", "Follow-up notes"],
      serviceOutputs: ["Build tasks", "Codex prompt package", "Run checklist", "Agent handoff state"],
      agentInteractions: agents.map((agent) => `${agent.name}: ${agent.role}`),
      subAgentOutputs: agents.slice(1, 5).map((agent) => `${agent.name} output: ${agent.outputs[0] || agent.goal}`),
      approvalPoints: service.humanApprovalPoints.length ? service.humanApprovalPoints.slice(0, 3) : defaultHumanApprovalPoints(),
    }),
    designScreen({
      name: "Evidence & Approval Detail",
      purpose: "Make sources, reasoning, risk, and approval consequences explicit.",
      userGoal: "Decide whether to trust the agent recommendation.",
      keyComponents: ["Evidence panel", "Source memory", "Risk explanation", "Approval controls", "Decision history"],
      userInputs: ["Approve", "Reject", "Request clarification"],
      serviceOutputs: ["Approved work package", "Blocked action", "Clarifying question"],
      agentInteractions: agents.slice(0, 3).map((agent) => `${agent.name} explains what needs approval.`),
      subAgentOutputs: agents.slice(1, 4).map((agent) => agent.outputs[0] || agent.goal),
      approvalPoints: service.humanApprovalPoints.length ? service.humanApprovalPoints : defaultHumanApprovalPoints(),
    }),
    designScreen({
      name: "Service Results",
      purpose: "Review the service output, verification, risks, and next action.",
      userGoal: "Accept a result only when the evidence is clear.",
      keyComponents: ["Result summary", "Verification evidence", "Risks", "Next action", "Follow-up task"],
      userInputs: ["Accept result", "Request fix", "Create next Build task"],
      serviceOutputs: ["Verified service output", "Fix task", "Run monitoring note"],
      agentInteractions: ["QA Agent checks acceptance criteria and missing evidence."],
      subAgentOutputs: ["Verification result", "Risk note", "Suggested follow-up"],
      approvalPoints: ["Founder marks result accepted only after reviewing evidence."],
    }),
  ];
}

function designScreen(params: Omit<ServiceWindowScreen, "id" | "emptyState" | "loadingState" | "errorState" | "successState">): ServiceWindowScreen {
  return {
    id: uid("screen"),
    components: params.components || params.keyComponents,
    approvalActions: ["Approve", "Reject", "Request clarification"],
    evidenceDisplay: ["Source list", "Agent reasoning summary", "Risk and uncertainty notes"],
    emptyState: `No ${params.name.toLowerCase()} data yet. Start with a service request or generated agent output.`,
    loadingState: "Agent team is working. Show current step, active sub-agent, and expected output.",
    errorState: "Show what failed, what evidence is missing, and the safest next action.",
    successState: "Show final recommendation, evidence used, approval status, and next task.",
    ...params,
  };
}

function createVisualSystem(domain: ServiceDesignDomain): ServiceWindowVisualSystem {
  return {
    productFeel: domain.key === "procurement" ? "premium operations cockpit with financial trust cues" : "minimal agent command center with visible trust and approval moments",
    typographyDirection: "Inter or Geist-style sans for UI, compact mono labels for agent state, commands, evidence IDs, and verification details.",
    spacingDensity: "Spacious first screen, denser evidence and queue sections for repeated operator use.",
    cardStyle: "Thin bordered cards, 8px radius, quiet depth, clear section hierarchy, no decorative clutter.",
    tableListStyle: domain.key === "procurement" ? "Comparison tables with sticky vendor names, budget variance, delivery risk, and evidence links." : "Scan-friendly lists with status, owner agent, risk, evidence, and next action.",
    formStyle: "One primary intake path with progressive disclosure for constraints, sources, and approval requirements.",
    statusBadgeStyle: "Plain-language status badges for agent state, risk, approval, evidence, and verification.",
    motionNotes: "Use subtle transitions for agent activity, approval state changes, and evidence drawer expansion; avoid flashy animation.",
    premiumPolishNotes: [
      "Make the main recommendation visually dominant only after evidence exists.",
      "Keep approval actions fixed near the relevant risk explanation.",
      "Use empty states to teach what the service needs next.",
    ],
  };
}

function createComponentSystem(domain: ServiceDesignDomain, screens: ServiceWindowScreen[]): ServiceWindowComponentSpec[] {
  const common: ServiceWindowComponentSpec[] = [
    {
      name: "AgentStatusCard",
      purpose: "Show what each agent or sub-agent is doing right now.",
      usedIn: screens.map((screen) => screen.name).filter((name) => /board|pipeline|workbench|intake/i.test(name)),
      dataShown: ["Agent name", "Current step", "Output expected", "Risk state"],
      states: ["idle", "working", "needs_input", "blocked", "complete"],
    },
    {
      name: "ApprovalQueue",
      purpose: "Collect decisions that need explicit human approval.",
      usedIn: screens.map((screen) => screen.name).filter((name) => /approval|pipeline|board|recommendation/i.test(name)),
      dataShown: ["Action requested", "Reason", "Risk", "Consequence", "Approve/reject controls"],
      states: ["empty", "pending", "approved", "rejected", "needs_clarification"],
    },
    {
      name: "EvidencePanel",
      purpose: "Show sources, documents, reasoning, and confidence behind the output.",
      usedIn: screens.map((screen) => screen.name),
      dataShown: ["Source title", "Relevant excerpt", "Agent note", "Risk or uncertainty"],
      states: ["collapsed", "expanded", "missing_evidence"],
    },
    {
      name: "ServiceIntakeForm",
      purpose: "Capture the minimum useful context before agents work.",
      usedIn: screens.map((screen) => screen.name).filter((name) => /intake/i.test(name)),
      dataShown: ["Request", "Constraints", "Sources", "Approval boundaries"],
      states: ["empty", "draft", "needs_more_context", "ready"],
    },
    {
      name: "AgentActivityTimeline",
      purpose: "Explain what happened without exposing noisy logs.",
      usedIn: screens.map((screen) => screen.name),
      dataShown: ["Timestamp", "Agent", "Action", "Output", "Next step"],
      states: ["live", "completed", "filtered"],
    },
    {
      name: "RecommendationCard",
      purpose: "Present the final service recommendation with confidence, evidence, risks, and next action.",
      usedIn: screens.map((screen) => screen.name).filter((name) => /recommendation|results|comparison/i.test(name)),
      dataShown: ["Recommendation", "Why", "Evidence", "Risk", "Approval action"],
      states: ["draft", "ready_for_review", "approved", "rejected"],
    },
    {
      name: "RiskBadge",
      purpose: "Make unknowns and operational risks visible without alarmism.",
      usedIn: screens.map((screen) => screen.name),
      dataShown: ["Risk label", "Severity", "Reason", "Follow-up"],
      states: ["low", "medium", "high", "unknown"],
    },
    {
      name: "SourceMemoryPanel",
      purpose: "Keep relevant source memory accessible but secondary.",
      usedIn: screens.map((screen) => screen.name).filter((name) => /evidence|intake|recommendation/i.test(name)),
      dataShown: ["Source", "Summary", "Why it matters", "Last updated"],
      states: ["collapsed", "expanded", "empty"],
    },
    {
      name: "BuildReadinessPanel",
      purpose: "Show whether the service output is ready for Codex, Run, or human action.",
      usedIn: screens.map((screen) => screen.name),
      dataShown: ["Readiness state", "Missing inputs", "Verification needed", "Next action"],
      states: ["needs_clarification", "ready", "blocked", "verified"],
    },
  ];
  if (domain.key !== "procurement") return common;
  return [
    {
      name: "QuoteComparisonTable",
      purpose: "Compare vendors, quotes, budget variance, delivery timing, and evidence.",
      usedIn: ["Vendor / Quote Comparison", "Purchase Recommendation"],
      dataShown: ["Vendor", "Quote", "Delivery date", "Budget variance", "Risk", "Evidence"],
      states: ["loading_quotes", "ready", "missing_quote", "selected"],
    },
    ...common,
  ];
}

function createPrimaryFlow(service: BrainpressService, mainAgent: ServiceAgent | undefined, domain: ServiceDesignDomain) {
  if (domain.key === "procurement") {
    return [
      "Construction operator submits a procurement request with budget, deadline, and constraints.",
      `${mainAgent?.name || "Main agent"} checks missing context and plans vendor or quote research.`,
      "Sub-agents collect quotes, compare vendors, flag budget or delivery risk, and attach evidence.",
      "Founder reviews the recommendation, evidence, risks, and approval queue.",
      "Approved purchase recommendation becomes the next operational action or Build task if software changes are required.",
    ];
  }
  return [
    `${service.targetCustomer || "User"} describes the desired outcome.`,
    `${mainAgent?.name || "Main agent"} clarifies the request and routes work to Think, Build, or Run.`,
    ...service.serviceWorkflow.slice(0, 3),
    "Agents expose evidence, risks, and approval moments before action.",
    "Codex receives approved Build tasks when implementation is needed.",
    "Brainpress verifies the result and asks for human approval before marking work complete.",
  ].filter(Boolean);
}

export function createServiceWindowCodexPrompt({
  service,
  agents,
  serviceWindow,
  spec,
  plan,
  taskLists = [],
  developmentTasks = [],
  thinkingArtifacts = [],
  memory,
}: {
  service: BrainpressService;
  agents: ServiceAgent[];
  serviceWindow: ServiceWindow;
  spec?: BrainpressSpec;
  plan?: BrainpressPlan;
  taskLists?: BrainpressTaskList[];
  developmentTasks?: DevelopmentTask[];
  thinkingArtifacts?: ServiceThinkingArtifact[];
  memory?: Memory;
}) {
  const specTasks = taskLists.flatMap((taskList) => taskList.tasks);
  return [
    `# Codex Build Prompt: ${service.name} Design Agent UI`,
    "",
    "Implement a premium, production-quality ServiceWindow UI for this agent-based Service. This is not a static mockup or generic SaaS dashboard.",
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
    thinkingArtifacts.length ? [
      "",
      "## Think Dynamic Canvases",
      ...thinkingArtifacts
        .filter((artifact) => artifact.status !== "archived")
        .slice(0, 8)
        .flatMap((artifact) => [
          `### ${artifact.title} (${artifact.type})`,
          `Purpose: ${artifact.purpose}`,
          ...artifact.content.slice(0, 6).map((item) => `- ${item}`),
        ]),
    ].join("\n") : "",
    specTasks.length ? ["", "## Ordered Spec Tasks", ...specTasks.map((task) => `- ${task.title}: ${task.description}`)].join("\n") : "",
    developmentTasks.length ? ["", "## Existing DevelopmentTasks", ...developmentTasks.slice(0, 8).map((task) => `- ${task.title} (${task.status})`)].join("\n") : "",
    developmentTasks.length ? ["", "## Acceptance Criteria", ...dedupeStrings(developmentTasks.flatMap((task) => task.acceptanceCriteria)).slice(0, 12).map((item) => `- ${item}`)].join("\n") : "",
    memory?.consolidated?.whatIsBrokenOrRisky?.length ? ["", "## Relevant Memory Risks", ...memory.consolidated.whatIsBrokenOrRisky.map((item) => `- ${item}`)].join("\n") : "",
    "",
    "## Agent Team",
    ...agents.map((agent) => `- ${agent.name}: ${agent.goal} Permission: ${agent.permissionLevel}. Inputs: ${agent.inputs.join(", ")}. Outputs: ${agent.outputs.join(", ")}.`),
    "",
    "## Design Agent Output",
    `Design Agent: ${serviceWindow.designAgentName || "Brainpress Design Agent"}`,
    serviceWindow.designBrief ? `Design Brief: ${serviceWindow.designBrief}` : "",
    serviceWindow.uxStrategy ? [
      "",
      "### UX Strategy",
      `Target user: ${serviceWindow.uxStrategy.targetUser}`,
      `Job to be done: ${serviceWindow.uxStrategy.jobToBeDone}`,
      `Trust concern: ${serviceWindow.uxStrategy.trustConcern}`,
      `Emotional tone: ${serviceWindow.uxStrategy.emotionalTone}`,
      `Complexity level: ${serviceWindow.uxStrategy.complexityLevel}`,
      `Success moment: ${serviceWindow.uxStrategy.successMoment}`,
    ].join("\n") : "",
    serviceWindow.informationArchitecture ? [
      "",
      "### Information Architecture",
      `Main navigation: ${serviceWindow.informationArchitecture.mainNavigation.join(", ")}`,
      `Screen hierarchy: ${serviceWindow.informationArchitecture.screenHierarchy.join(" > ")}`,
      `Key objects: ${serviceWindow.informationArchitecture.keyObjects.join(", ")}`,
      `Service states: ${serviceWindow.informationArchitecture.serviceStates.join(", ")}`,
    ].join("\n") : "",
    "",
    "### Screen Map",
    ...serviceWindow.screens.flatMap((screen) => [
      `### ${screen.name}`,
      `Purpose: ${screen.purpose}`,
      screen.userGoal ? `User goal: ${screen.userGoal}` : "",
      `Key sections: ${screen.keyComponents.join(", ")}`,
      `Components: ${(screen.components?.length ? screen.components : screen.keyComponents).join(", ")}`,
      `Inputs: ${screen.userInputs.join(", ")}`,
      `Outputs: ${screen.serviceOutputs.join(", ")}`,
      screen.subAgentOutputs?.length ? `Sub-agent outputs: ${screen.subAgentOutputs.join(", ")}` : "",
      `Agent interactions: ${screen.agentInteractions.join(", ")}`,
      `Approval points: ${screen.approvalPoints.join(", ")}`,
      screen.evidenceDisplay?.length ? `Evidence/source display: ${screen.evidenceDisplay.join(", ")}` : "",
      screen.emptyState ? `Empty state: ${screen.emptyState}` : "",
      screen.loadingState ? `Loading state: ${screen.loadingState}` : "",
      screen.errorState ? `Error state: ${screen.errorState}` : "",
      screen.successState ? `Success state: ${screen.successState}` : "",
      "",
    ]),
    serviceWindow.visualSystem ? [
      "",
      "## Visual System",
      `Product feel: ${serviceWindow.visualSystem.productFeel}`,
      `Typography: ${serviceWindow.visualSystem.typographyDirection}`,
      `Spacing/density: ${serviceWindow.visualSystem.spacingDensity}`,
      `Cards: ${serviceWindow.visualSystem.cardStyle}`,
      `Tables/lists: ${serviceWindow.visualSystem.tableListStyle}`,
      `Forms: ${serviceWindow.visualSystem.formStyle}`,
      `Status badges: ${serviceWindow.visualSystem.statusBadgeStyle}`,
      `Motion: ${serviceWindow.visualSystem.motionNotes}`,
      ...serviceWindow.visualSystem.premiumPolishNotes.map((note) => `- ${note}`),
    ].join("\n") : "",
    serviceWindow.componentSystem?.length ? [
      "",
      "## Component System",
      ...serviceWindow.componentSystem.map((component) => `- ${component.name}: ${component.purpose}. Used in: ${component.usedIn.join(", ")}. Data: ${component.dataShown.join(", ")}. States: ${component.states.join(", ")}.`),
    ].join("\n") : "",
    serviceWindow.interactionStates?.length ? ["", "## Interaction States", ...serviceWindow.interactionStates.map((item) => `- ${item}`)].join("\n") : "",
    serviceWindow.responsiveBehavior?.length ? ["", "## Responsive Behavior", ...serviceWindow.responsiveBehavior.map((item) => `- ${item}`)].join("\n") : "",
    serviceWindow.accessibilityNotes?.length ? ["", "## Accessibility Notes", ...serviceWindow.accessibilityNotes.map((item) => `- ${item}`)].join("\n") : "",
    serviceWindow.implementationNotes?.length ? ["", "## Implementation Notes", ...serviceWindow.implementationNotes.map((item) => `- ${item}`)].join("\n") : "",
    "## Requirements",
    "- Implement the service front office and Design Agent output, not generic dashboard filler.",
    "- Make the UI specific to this Service, target customer, agent team, workflow, evidence, approval moments, and risk model.",
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
    designAgentName: value.designAgentName || "Brainpress Design Agent",
    designBrief: value.designBrief || "",
    uxStrategy: normalizeUxStrategy(value.uxStrategy),
    informationArchitecture: normalizeInformationArchitecture(value.informationArchitecture),
    visualSystem: normalizeVisualSystem(value.visualSystem),
    componentSystem: Array.isArray(value.componentSystem) ? value.componentSystem.map(normalizeComponentSpec) : [],
    interactionStates: arrayField(value.interactionStates),
    responsiveBehavior: arrayField(value.responsiveBehavior),
    accessibilityNotes: arrayField(value.accessibilityNotes),
    implementationNotes: arrayField(value.implementationNotes),
    codexImplementationPrompt: value.codexImplementationPrompt || "",
    generatedAt: value.generatedAt,
    updatedAt: value.updatedAt || now,
  };
}

function normalizeServiceWindowScreen(value: Partial<ServiceWindowScreen>): ServiceWindowScreen {
  return {
    id: value.id || uid("screen"),
    name: value.name || "Service screen",
    purpose: value.purpose || "",
    userGoal: value.userGoal || "",
    keyComponents: arrayField(value.keyComponents),
    components: arrayField(value.components),
    userInputs: arrayField(value.userInputs),
    serviceOutputs: arrayField(value.serviceOutputs),
    agentInteractions: arrayField(value.agentInteractions),
    subAgentOutputs: arrayField(value.subAgentOutputs),
    approvalPoints: arrayField(value.approvalPoints),
    approvalActions: arrayField(value.approvalActions),
    evidenceDisplay: arrayField(value.evidenceDisplay),
    emptyState: value.emptyState || "",
    loadingState: value.loadingState || "",
    errorState: value.errorState || "",
    successState: value.successState || "",
  };
}

function normalizeUxStrategy(value: unknown): ServiceWindowUxStrategy | undefined {
  if (!isRecord(value)) return undefined;
  return {
    targetUser: stringField(value.targetUser),
    jobToBeDone: stringField(value.jobToBeDone),
    trustConcern: stringField(value.trustConcern),
    emotionalTone: stringField(value.emotionalTone),
    complexityLevel: stringField(value.complexityLevel),
    successMoment: stringField(value.successMoment),
  };
}

function normalizeInformationArchitecture(value: unknown): ServiceWindowInformationArchitecture | undefined {
  if (!isRecord(value)) return undefined;
  return {
    mainNavigation: arrayField(value.mainNavigation),
    screenHierarchy: arrayField(value.screenHierarchy),
    keyObjects: arrayField(value.keyObjects),
    serviceStates: arrayField(value.serviceStates),
  };
}

function normalizeVisualSystem(value: unknown): ServiceWindowVisualSystem | undefined {
  if (!isRecord(value)) return undefined;
  return {
    productFeel: stringField(value.productFeel),
    typographyDirection: stringField(value.typographyDirection),
    spacingDensity: stringField(value.spacingDensity),
    cardStyle: stringField(value.cardStyle),
    tableListStyle: stringField(value.tableListStyle),
    formStyle: stringField(value.formStyle),
    statusBadgeStyle: stringField(value.statusBadgeStyle),
    motionNotes: stringField(value.motionNotes),
    premiumPolishNotes: arrayField(value.premiumPolishNotes),
  };
}

function normalizeComponentSpec(value: Partial<ServiceWindowComponentSpec>): ServiceWindowComponentSpec {
  return {
    name: value.name || "Service component",
    purpose: value.purpose || "",
    usedIn: arrayField(value.usedIn),
    dataShown: arrayField(value.dataShown),
    states: arrayField(value.states),
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

function stringField(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
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
  return value === "empty" || value === "generated" || value === "design_generated" || value === "implementation_ready" || value === "built" || value === "needs_refinement";
}
