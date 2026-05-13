import type {
  BrainpressPlan,
  BrainpressService,
  BrainpressSpec,
  Memory,
  ServiceAgent,
  ServiceThinkingArtifact,
  ThinkCanvasStatus,
  ThinkCanvasType,
  ThinkSession,
} from "@/lib/types";

interface GenerateThinkingArtifactsInput {
  service: BrainpressService;
  agents?: ServiceAgent[];
  input?: string;
  sessions?: ThinkSession[];
  specs?: BrainpressSpec[];
  plans?: BrainpressPlan[];
  memory?: Memory;
  existingArtifacts?: ServiceThinkingArtifact[];
  sourceMessageIds?: string[];
  now?: string;
}

interface ArtifactDraft {
  type: ThinkCanvasType;
  title: string;
  purpose: string;
  content: string[];
  confidence: number;
  status: ThinkCanvasStatus;
}

export function generateThinkingArtifacts({
  service,
  agents = [],
  input = "",
  sessions = [],
  specs = [],
  plans = [],
  memory,
  existingArtifacts = [],
  sourceMessageIds,
  now = new Date().toISOString(),
}: GenerateThinkingArtifactsInput): ServiceThinkingArtifact[] {
  const latestSession = sessions[0];
  const latestSpec = specs[0];
  const latestPlan = plans[0];
  const sourceText = [
    service.name,
    service.description,
    service.servicePromise,
    service.targetCustomer,
    service.desiredOutcome,
    service.serviceWorkflow.join(" "),
    service.openQuestions.join(" "),
    input,
    latestSession?.input,
    latestSession?.summary,
    latestSession?.productDirection,
    latestSession?.featureIdeas.join(" "),
    latestSession?.mvpScope.join(" "),
    latestSession?.risks.join(" "),
    latestSession?.openQuestions.join(" "),
    latestSpec?.what,
    latestSpec?.why,
    latestSpec?.successCriteria.join(" "),
    latestPlan?.architectureNotes.join(" "),
    memory?.productSummary,
    memory?.consolidated?.plainEnglishSummary,
  ].filter(Boolean).join("\n");
  const normalized = sourceText.toLowerCase();
  const ids = sourceMessageIds?.length ? sourceMessageIds : latestSession ? [latestSession.id] : [];
  const hasUsefulContext = meaningfulWordCount(sourceText) >= 8 || Boolean(service.servicePromise || service.desiredOutcome || latestSession);
  const drafts = hasUsefulContext
    ? createArtifactDrafts({ service, agents, input, latestSession, latestSpec, latestPlan, normalized })
    : [clarifyingQuestionsDraft(service)];
  const usefulDrafts = drafts.length ? drafts : [clarifyingQuestionsDraft(service)];
  return mergeArtifactDrafts({
    serviceId: service.id,
    existingArtifacts,
    drafts: usefulDrafts,
    sourceMessageIds: ids,
    now,
  });
}

export function normalizeThinkingArtifact(value: Partial<ServiceThinkingArtifact>, serviceId = ""): ServiceThinkingArtifact {
  const now = new Date().toISOString();
  return {
    id: value.id || uid("think_canvas"),
    serviceId: value.serviceId || serviceId,
    type: isThinkCanvasType(value.type) ? value.type : "custom",
    title: value.title || "Thinking Canvas",
    purpose: value.purpose || "Capture useful service thinking.",
    content: arrayField(value.content),
    sourceMessageIds: arrayField(value.sourceMessageIds),
    confidence: typeof value.confidence === "number" ? Math.max(0, Math.min(1, value.confidence)) : 0.65,
    status: isThinkCanvasStatus(value.status) ? value.status : "active",
    createdByAgent: value.createdByAgent || "Agent Development Agent",
    createdAt: value.createdAt || now,
    updatedAt: value.updatedAt || value.createdAt || now,
  };
}

function createArtifactDrafts({
  service,
  agents,
  input,
  latestSession,
  latestSpec,
  latestPlan,
  normalized,
}: {
  service: BrainpressService;
  agents: ServiceAgent[];
  input: string;
  latestSession?: ThinkSession;
  latestSpec?: BrainpressSpec;
  latestPlan?: BrainpressPlan;
  normalized: string;
}) {
  const drafts: ArtifactDraft[] = [];
  const clearPurpose = Boolean(service.servicePromise || service.desiredOutcome || latestSession?.productDirection || latestSpec?.what);
  const vague = isVagueIdea(input || latestSession?.input || "", normalized, clearPurpose);
  if (vague) return [clarifyingQuestionsDraft(service, latestSession)];

  if (clearPurpose) {
    drafts.push({
      type: "service_brief",
      title: "Service Brief",
      purpose: "Define what this agent service promises, who it serves, and why it exists.",
      content: concise([
        service.servicePromise || latestSession?.productDirection || latestSpec?.what || service.description,
        service.targetCustomer ? `Target customer: ${service.targetCustomer}` : latestSession?.targetUser ? `Target customer: ${latestSession.targetUser}` : "",
        service.desiredOutcome ? `Desired outcome: ${service.desiredOutcome}` : latestSession?.proposedSolution ? `Desired outcome: ${latestSession.proposedSolution}` : "",
        latestSpec?.why ? `Why it matters: ${latestSpec.why}` : latestSession?.userProblem ? `Problem: ${latestSession.userProblem}` : "",
      ]),
      confidence: 0.82,
      status: "active",
    });
  }

  if (hasProcurementSignal(normalized)) {
    drafts.push(...procurementDrafts(service, agents, latestSession, latestPlan));
  } else {
    if (hasFeatureSignal(normalized, latestSession)) {
      drafts.push({
        type: "feature_map",
        title: "Service Capabilities",
        purpose: "Map the capabilities the service may need before any Codex implementation work starts.",
        content: concise([
          ...(latestSession?.featureIdeas || []),
          ...keywordCapabilities(normalized),
          service.servicePromise ? `Primary capability: deliver ${service.servicePromise}` : "",
        ]).slice(0, 7),
        confidence: 0.74,
        status: "active",
      });
    }
    if (hasWorkflowSignal(normalized, service)) {
      drafts.push({
        type: "workflow",
        title: "Service Workflow",
        purpose: "Show how the user request moves through agents, evidence, approval, and output.",
        content: concise([
          ...service.serviceWorkflow,
          ...(latestSession?.mvpScope || []),
          "Keep founder approval visible before external action, merge, deploy, or verified status.",
        ]).slice(0, 7),
        confidence: 0.76,
        status: "active",
      });
    }
    if (hasAgentSignal(normalized, agents)) {
      drafts.push(agentTeamDraft(service, agents));
    }
    if (hasApprovalSignal(normalized, service)) {
      drafts.push(approvalPolicyDraft(service));
    }
    if (hasRiskSignal(normalized, latestSession)) {
      drafts.push(riskMapDraft(service, latestSession, latestSpec));
    }
    if (hasRoadmapSignal(normalized, latestSession, latestPlan)) {
      drafts.push({
        type: "roadmap",
        title: "Build Path",
        purpose: "Sequence what should be clarified, designed, built, and verified next.",
        content: concise([
          ...(latestSession?.mvpScope || []),
          ...(latestPlan?.validationPlan || []),
          "Generate the build plan only after the service promise, workflow, and approval policy are clear.",
        ]).slice(0, 6),
        confidence: 0.72,
        status: latestSpec?.clarificationStatus === "clear_enough" ? "ready_for_build" : "needs_review",
      });
    }
  }

  if (hasUiSignal(normalized)) {
    drafts.push({
      type: "ui_ux_brief",
      title: "UI/UX Brief",
      purpose: "Capture the service interface direction and hand it to the Design Agent in ServiceWindow.",
      content: concise([
        "Show what the agent is doing, what evidence it used, and what needs human approval.",
        service.targetCustomer ? `Design for ${service.targetCustomer}.` : "",
        "Run the Design Agent in ServiceWindow for premium UI/UX screens and implementation-ready structure.",
      ]),
      confidence: 0.78,
      status: "needs_review",
    });
  }

  if (!drafts.length) drafts.push(clarifyingQuestionsDraft(service, latestSession));
  return drafts;
}

function procurementDrafts(
  service: BrainpressService,
  agents: ServiceAgent[],
  session?: ThinkSession,
  plan?: BrainpressPlan,
): ArtifactDraft[] {
  return [
    {
      type: "workflow",
      title: "Vendor Workflow",
      purpose: "Define how procurement requests move from intake to vendor research, quote comparison, approval, and purchase recommendation.",
      content: concise([
        "Capture request details: material/service, budget, deadline, site constraints, and required evidence.",
        "Research vendors and collect comparable quotes with delivery timelines.",
        "Compare quotes by price, availability, reliability, and budget risk.",
        "Prepare a purchase recommendation with evidence and open risks.",
        "Require human approval before contacting vendors, spending money, or committing to a purchase.",
      ]),
      confidence: 0.9,
      status: "active",
    },
    {
      type: "feature_map",
      title: "Quote Comparison Features",
      purpose: "Identify the service capabilities needed for construction procurement decisions.",
      content: concise([
        "Procurement intake form for request, quantity, deadline, and budget.",
        "Vendor and quote comparison table.",
        "Budget, delivery, and reliability risk flags.",
        "Evidence panel for source documents, vendor notes, and quote attachments.",
        "Approval queue for founder or operations manager review.",
        ...(session?.featureIdeas || []),
      ]).slice(0, 7),
      confidence: 0.88,
      status: "active",
    },
    {
      type: "approval_policy",
      title: "Procurement Approval Policy",
      purpose: "Make spending and vendor commitments explicit human approval gates.",
      content: concise([
        "Founder approval is required before vendor outreach that represents commitment.",
        "Founder approval is required before purchase recommendation is accepted.",
        "High budget variance, missing evidence, or single-vendor quotes require escalation.",
        ...service.humanApprovalPoints,
      ]).slice(0, 6),
      confidence: 0.86,
      status: "needs_review",
    },
    {
      type: "risk_map",
      title: "Procurement Risk Map",
      purpose: "Surface risks before the agent recommends a vendor or purchase decision.",
      content: concise([
        "Missing vendor evidence can make recommendations unreliable.",
        "Delivery delays can create downstream construction schedule risk.",
        "Low quote price may hide quality, availability, or scope mismatch.",
        "RLS, storage, and document intake need verification if quote PDFs or invoices are uploaded.",
      ]),
      confidence: 0.82,
      status: "needs_review",
    },
    {
      type: "roadmap",
      title: "Build Roadmap",
      purpose: "Order the first useful procurement service implementation work.",
      content: concise([
        "Start with procurement intake and quote comparison.",
        "Add evidence display and vendor risk flags.",
        "Add approval queue before any external action.",
        "Connect document upload and storage only after the core flow is verified.",
        ...(plan?.validationPlan || []),
      ]).slice(0, 6),
      confidence: 0.8,
      status: "ready_for_build",
    },
    agentTeamDraft(service, agents, "Procurement Agent Team"),
  ];
}

function clarifyingQuestionsDraft(service: BrainpressService, session?: ThinkSession): ArtifactDraft {
  return {
    type: "clarifying_questions",
    title: "Clarifying Questions",
    purpose: "Ask only what is needed before Brainpress creates deeper service canvases.",
    content: concise([
      service.targetCustomer ? "" : "Who will use this service first?",
      service.servicePromise ? "" : "What outcome should the service reliably deliver?",
      "What should the agent be allowed to do without founder approval?",
      "What evidence or sources should the agent use?",
      ...(session?.openQuestions || []),
    ]).slice(0, 5),
    confidence: 0.62,
    status: "needs_review",
  };
}

function agentTeamDraft(service: BrainpressService, agents: ServiceAgent[], title = "Agent Team Plan"): ArtifactDraft {
  const mainAgent = agents.find((agent) => agent.id === service.mainAgentId) || agents[0];
  return {
    type: "agent_team",
    title,
    purpose: "Define which agents are needed and what each one is allowed to do.",
    content: concise([
      mainAgent ? `Main agent: ${mainAgent.name} - ${mainAgent.role}.` : "Main agent should own the service outcome and coordinate sub-agents.",
      ...agents.filter((agent) => agent.id !== mainAgent?.id).slice(0, 4).map((agent) => `${agent.name}: ${agent.role}. Permission: ${agent.permissionLevel.replaceAll("_", " ")}.`),
      "Founder approval should remain required for destructive, external, payment, merge, deploy, or verified-status actions.",
    ]),
    confidence: agents.length ? 0.82 : 0.66,
    status: agents.length ? "active" : "needs_review",
  };
}

function approvalPolicyDraft(service: BrainpressService): ArtifactDraft {
  return {
    type: "approval_policy",
    title: "Approval Policy",
    purpose: "Define what the service may do and what must be escalated to the founder.",
    content: concise([
      ...service.humanApprovalPoints,
      "Human approval is required before Codex dispatch, merge, deploy, production changes, or external commitments.",
      "The service should show evidence and risk before asking for approval.",
    ]).slice(0, 6),
    confidence: 0.8,
    status: "needs_review",
  };
}

function riskMapDraft(service: BrainpressService, session?: ThinkSession, spec?: BrainpressSpec): ArtifactDraft {
  return {
    type: "risk_map",
    title: "Risks & Unknowns",
    purpose: "Keep uncertainty visible before the service moves into Build.",
    content: concise([
      ...(session?.risks || []),
      ...(spec?.assumptions || []).map((item) => `Assumption: ${item}`),
      ...service.openQuestions,
      "Unknowns should become clarifying questions instead of hidden implementation assumptions.",
    ]).slice(0, 7),
    confidence: 0.76,
    status: "needs_review",
  };
}

function mergeArtifactDrafts({
  serviceId,
  existingArtifacts,
  drafts,
  sourceMessageIds,
  now,
}: {
  serviceId: string;
  existingArtifacts: ServiceThinkingArtifact[];
  drafts: ArtifactDraft[];
  sourceMessageIds: string[];
  now: string;
}) {
  const existingByKey = new Map(
    existingArtifacts
      .filter((artifact) => artifact.serviceId === serviceId)
      .map((artifact) => [artifactKey(artifact.type, artifact.title), artifact]),
  );
  const generated = drafts.map((draft) => {
    const existing = existingByKey.get(artifactKey(draft.type, draft.title));
    return normalizeThinkingArtifact({
      ...existing,
      ...draft,
      id: existing?.id || uid("think_canvas"),
      serviceId,
      content: concise(draft.content).slice(0, 8),
      sourceMessageIds: uniqueStrings([...(existing?.sourceMessageIds || []), ...sourceMessageIds]),
      createdByAgent: "Agent Development Agent",
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    }, serviceId);
  });
  const generatedKeys = new Set(generated.map((artifact) => artifactKey(artifact.type, artifact.title)));
  const untouched = existingArtifacts.filter((artifact) => artifact.serviceId !== serviceId || !generatedKeys.has(artifactKey(artifact.type, artifact.title)));
  return [...generated, ...untouched].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function isVagueIdea(input: string, normalized: string, clearPurpose: boolean) {
  const words = meaningfulWordCount(input);
  if (words <= 4 && !clearPurpose) return true;
  if (!clearPurpose && !/(agent|service|workflow|customer|user|build|feature|problem|procurement|tutor|approval|dashboard|automation)/i.test(normalized)) return true;
  return false;
}

function hasProcurementSignal(text: string) {
  return /(procurement|construction|vendor|quote|purchase|supplier|materials?|budget|invoice)/i.test(text);
}

function hasFeatureSignal(text: string, session?: ThinkSession) {
  return Boolean(session?.featureIdeas.length) || /(feature|capabilit|can do|add|build|support|tool)/i.test(text);
}

function hasWorkflowSignal(text: string, service: BrainpressService) {
  return service.serviceWorkflow.length > 0 || /(workflow|pipeline|process|steps|handoff|journey)/i.test(text);
}

function hasAgentSignal(text: string, agents: ServiceAgent[]) {
  return agents.length > 0 || /(agent|sub-agent|team|orchestrator|researcher|reviewer)/i.test(text);
}

function hasApprovalSignal(text: string, service: BrainpressService) {
  return service.humanApprovalPoints.length > 0 || /(approval|approve|permission|policy|human|founder|risk)/i.test(text);
}

function hasRiskSignal(text: string, session?: ThinkSession) {
  return Boolean(session?.risks.length || session?.openQuestions.length) || /(risk|unknown|unclear|broken|fails?|issue|danger|trust|safety)/i.test(text);
}

function hasRoadmapSignal(text: string, session?: ThinkSession, plan?: BrainpressPlan) {
  return Boolean(session?.mvpScope.length || plan?.validationPlan.length) || /(roadmap|next|later|mvp|launch|sequence|first|plan)/i.test(text);
}

function hasUiSignal(text: string) {
  return /(ui|ux|interface|screen|window|design|preview|front office|dashboard|page)/i.test(text);
}

function keywordCapabilities(text: string) {
  const items: string[] = [];
  if (/chat|conversation/.test(text)) items.push("Conversation intake for founder or customer requests.");
  if (/document|pdf|source/.test(text)) items.push("Source and evidence handling for uploaded documents.");
  if (/github|codex|build/.test(text)) items.push("Codex-ready Build task creation and verification.");
  if (/dashboard|status|monitor/.test(text)) items.push("Status view for service progress, risk, and next actions.");
  return items;
}

function meaningfulWordCount(value: string) {
  return value.split(/\s+/).filter((word) => word.replace(/[^a-z0-9]/gi, "").length > 2).length;
}

function artifactKey(type: ThinkCanvasType, title: string) {
  return `${type}:${title.toLowerCase().replace(/\s+/g, " ").trim()}`;
}

function concise(items: string[]) {
  return uniqueStrings(items.map((item) => item.replace(/\s+/g, " ").trim()).filter(Boolean));
}

function uniqueStrings(items: string[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function arrayField(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item || "").trim()).filter(Boolean);
}

function isThinkCanvasType(value: unknown): value is ThinkCanvasType {
  return [
    "clarifying_questions",
    "service_brief",
    "feature_map",
    "roadmap",
    "workflow",
    "agent_team",
    "approval_policy",
    "risk_map",
    "user_journey",
    "data_sources",
    "pricing_model",
    "mvp_scope",
    "technical_unknowns",
    "ui_ux_brief",
    "custom",
  ].includes(String(value));
}

function isThinkCanvasStatus(value: unknown): value is ThinkCanvasStatus {
  return ["draft", "active", "needs_review", "ready_for_build", "archived"].includes(String(value));
}

function uid(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
