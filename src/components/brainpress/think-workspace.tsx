"use client";

import { CheckCircle2, CornerDownRight, Plus, Send, Sparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { ThinkAgentResult } from "@/lib/agent-gateway";
import type {
  BrainpressService,
  BrainpressSpec,
  BrainpressAgentSource,
  ClarifyingQuestion,
  ProductWindow,
  RecommendedBuildTask,
  ServiceAgent,
  ThinkArtifactType,
  ThinkMode,
  ThinkSession,
} from "@/lib/types";
import { Button, TextArea, cx } from "@/components/brainpress/ui";

interface ThinkOperatingTabProps {
  projectName: string;
  service: BrainpressService;
  agents: ServiceAgent[];
  directionInput: string;
  sessions: ThinkSession[];
  productWindows: ProductWindow[];
  specs: BrainpressSpec[];
  clarifyingQuestions: ClarifyingQuestion[];
  selectedSessionId: string;
  mode: ThinkMode;
  artifactType: ThinkArtifactType;
  onDirectionInputChange: (value: string) => void;
  onModeChange: (value: ThinkMode) => void;
  onArtifactTypeChange: (value: ThinkArtifactType) => void;
  onSelectSession: (id: string) => void;
  onCreateProductDirection: () => Promise<ThinkCreationResult | null>;
  onCreateBuildTask: (session: ThinkSession, recommendation: RecommendedBuildTask) => void;
  onRegenerateProductWindow: (session: ThinkSession) => void;
  onApproveProductWindow: (productWindow: ProductWindow) => void;
  onCreateProductWindowBuildTask: (session: ThinkSession, productWindow: ProductWindow) => void;
  onGenerateServiceBlueprint: () => void;
  onGenerateBuildPlan: (spec: BrainpressSpec) => void;
  thinkingWithAgent: boolean;
}

export interface ThinkCreationResult {
  session: ThinkSession;
  productWindow: ProductWindow;
}

export interface ThinkChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  source?: BrainpressAgentSource;
  model?: string;
  error?: string;
  pending?: boolean;
  createdAt: string;
}

const quickStarts = [
  { title: "Clarify idea", mode: "clarify_idea" },
  { title: "Define MVP", mode: "define_mvp" },
  { title: "Create service spec", mode: "create_feature_spec" },
  { title: "Plan build path", mode: "plan_roadmap" },
  { title: "Make decision", mode: "make_decision" },
  { title: "Analyze risk", mode: "analyze_risk" },
] as const;

const artifactOptions = [
  { title: "Service Brief", artifactType: "product_brief" },
  { title: "Build Path", artifactType: "roadmap" },
  { title: "Decisions", artifactType: "decision_memo" },
  { title: "Service Spec", artifactType: "feature_spec" },
] as const;

export function ThinkOperatingTab({
  projectName,
  service,
  agents,
  directionInput,
  sessions,
  productWindows,
  specs,
  clarifyingQuestions,
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
  onGenerateServiceBlueprint,
  onGenerateBuildPlan,
  thinkingWithAgent,
}: ThinkOperatingTabProps) {
  const selectedSession = sessions.find((session) => session.id === selectedSessionId) || sessions[0];
  const selectedProductWindow = selectedSession
    ? productWindows.find((window) => window.thinkSessionId === selectedSession.id)
    : undefined;
  const selectedSpec = selectedSession
    ? specs.find((spec) => spec.thinkSessionId === selectedSession.id || spec.productWindowId === selectedProductWindow?.id)
    : specs[0];
  const selectedClarifyingQuestions = selectedSpec
    ? clarifyingQuestions.filter((question) => question.specId === selectedSpec.id)
    : [];

  async function createProductDirectionFromChat() {
    return onCreateProductDirection();
  }

  return (
    <section className="overflow-hidden rounded-lg border border-slate-800 bg-[#05070d] text-white shadow-2xl">
      <div className="border-b border-white/10 bg-[#070a12] px-5 py-4">
        <p className="font-mono text-xs font-semibold uppercase tracking-wide text-blue-300">Think Canvas</p>
        <div className="mt-2 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-normal text-white md:text-3xl">
              Shape the Service before Codex builds it.
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
              Move from founder idea to Service Spec, Agent Blueprint, approval points, and build-ready direction.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {selectedSession ? <CanvasTag>{formatThinkArtifactType(selectedSession.artifactType)}</CanvasTag> : null}
            <CanvasTag>{selectedSpec?.clarificationStatus === "needs_clarification" ? "Needs clarification" : selectedSpec ? "Build direction ready" : "Draft"}</CanvasTag>
          </div>
        </div>
      </div>

      <div className="grid min-h-[760px] lg:grid-cols-[360px_minmax(0,1.15fr)_minmax(320px,0.9fr)]">
        <ThinkCofounderSidebar
          projectName={projectName}
          service={service}
          directionInput={directionInput}
          sessions={sessions}
          selectedSessionId={selectedSession?.id || ""}
          selectedSpec={selectedSpec}
          clarifyingQuestions={selectedClarifyingQuestions}
          mode={mode}
          artifactType={artifactType}
          thinkingWithAgent={thinkingWithAgent}
          onDirectionInputChange={onDirectionInputChange}
          onModeChange={onModeChange}
          onArtifactTypeChange={onArtifactTypeChange}
          onSelectSession={onSelectSession}
          onCreateProductDirection={createProductDirectionFromChat}
        />
        <ThinkCanvas
          service={service}
          agents={agents}
          selectedSession={selectedSession}
          spec={selectedSpec}
          clarifyingQuestions={selectedClarifyingQuestions}
          onCreateBuildTask={onCreateBuildTask}
          onGenerateServiceBlueprint={onGenerateServiceBlueprint}
          onGenerateBuildPlan={onGenerateBuildPlan}
        />
      </div>
    </section>
  );
}

function ThinkCofounderSidebar({
  projectName,
  service,
  directionInput,
  sessions,
  selectedSessionId,
  selectedSpec,
  clarifyingQuestions,
  mode,
  artifactType,
  thinkingWithAgent,
  onDirectionInputChange,
  onModeChange,
  onArtifactTypeChange,
  onSelectSession,
  onCreateProductDirection,
}: {
  projectName: string;
  service: BrainpressService;
  directionInput: string;
  sessions: ThinkSession[];
  selectedSessionId: string;
  selectedSpec?: BrainpressSpec;
  clarifyingQuestions: ClarifyingQuestion[];
  mode: ThinkMode;
  artifactType: ThinkArtifactType;
  thinkingWithAgent: boolean;
  onDirectionInputChange: (value: string) => void;
  onModeChange: (value: ThinkMode) => void;
  onArtifactTypeChange: (value: ThinkArtifactType) => void;
  onSelectSession: (id: string) => void;
  onCreateProductDirection: () => Promise<ThinkCreationResult | null>;
}) {
  const [chatMessages, setChatMessages] = useState<ThinkChatMessage[]>([]);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const persistedMessages = useMemo(() => sessionHistoryToMessages(sessions), [sessions]);
  const visibleMessages = chatMessages.length ? chatMessages : persistedMessages;
  const openQuestions = clarifyingQuestions.filter((question) => question.status !== "answered");

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: "end" });
  }, [visibleMessages.length, thinkingWithAgent]);

  async function sendThinkMessage() {
    const content = directionInput.trim();
    if (!content || thinkingWithAgent) return;
    const userMessage: ThinkChatMessage = {
      id: createThinkChatMessageId("user"),
      role: "user",
      content,
      createdAt: new Date().toISOString(),
    };
    const pendingMessage: ThinkChatMessage = {
      id: createThinkChatMessageId("assistant"),
      role: "assistant",
      content: "Brainpress is thinking through the service direction...",
      pending: true,
      createdAt: new Date().toISOString(),
    };
    setChatMessages((current) => [...current, userMessage, pendingMessage]);

    try {
      const result = await onCreateProductDirection();
      if (!result) {
        setChatMessages((current) => replaceChatMessage(current, pendingMessage.id, {
          content: "I need a little more detail before I can shape this into service direction. Try adding the user, problem, or feature you are thinking about.",
          pending: false,
          source: "fallback",
        }));
        return;
      }
      setChatMessages((current) => replaceChatMessage(current, pendingMessage.id, {
        content: assistantResponseFromThinkResult(result),
        pending: false,
        source: result.session.agentSource,
        model: result.session.agentModel,
        error: result.session.agentError,
      }));
    } catch (error) {
      setChatMessages((current) => replaceChatMessage(current, pendingMessage.id, {
        content: "I couldn't complete that Think session. Try again or use Local fallback.",
        pending: false,
        source: "fallback",
        error: error instanceof Error ? error.message : "Think session failed.",
      }));
    }
  }

  return (
    <aside className="flex min-h-[760px] flex-col border-b border-white/10 bg-[#090d16] lg:border-b-0 lg:border-r">
      <div className="border-b border-white/10 p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-mono text-xs font-semibold uppercase tracking-wide text-blue-300">Brainpress</p>
            <h2 className="mt-1 text-xl font-semibold text-white">Founder Input</h2>
          </div>
          <span className="rounded-md border border-blue-400/20 bg-blue-400/10 px-2 py-1 font-mono text-xs text-blue-200">
            Think mode
          </span>
        </div>
        <p className="mt-3 text-sm leading-6 text-slate-400">{projectName}</p>
        <p className="mt-2 text-xs leading-5 text-slate-500">
          {shortText(service.servicePromise || service.description || "Describe the Service and Brainpress will shape the spec.", 120)}
        </p>
      </div>

      <div className="border-b border-white/10 p-4">
        <p className="font-mono text-[11px] font-semibold uppercase tracking-wide text-slate-500">Current lens</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <select
            className="h-9 rounded-md border border-white/10 bg-white/[0.04] px-2 text-xs text-slate-200 outline-none"
            value={mode}
            onChange={(event) => onModeChange(event.target.value as ThinkMode)}
          >
            {quickStarts.map((prompt) => (
              <option key={`think-mode-option-${prompt.mode}`} value={prompt.mode}>
                {prompt.title}
              </option>
            ))}
          </select>
          <select
            className="h-9 rounded-md border border-white/10 bg-white/[0.04] px-2 text-xs text-slate-200 outline-none"
            value={artifactType}
            onChange={(event) => onArtifactTypeChange(event.target.value as ThinkArtifactType)}
          >
            {artifactOptions.map((option) => (
              <option key={`think-artifact-option-${option.artifactType}`} value={option.artifactType}>
                {option.title}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-4 rounded-lg border border-white/10 bg-white/[0.035] p-3">
          <div className="flex items-center justify-between gap-3">
            <p className="font-mono text-[11px] font-semibold uppercase tracking-wide text-amber-200">Clarifying Questions</p>
            <span className="rounded-md bg-amber-300/10 px-2 py-1 font-mono text-[10px] text-amber-100">
              {openQuestions.length}
            </span>
          </div>
          {openQuestions.length ? (
            <ul className="mt-3 space-y-2 text-xs leading-5 text-slate-300">
              {openQuestions.slice(0, 3).map((question, index) => (
                <li key={`sidebar-question-${index}-${question.id}`} className="flex gap-2">
                  <CornerDownRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-200/80" />
                  <span>{shortText(question.question, 96)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-xs leading-5 text-slate-500">No open questions yet.</p>
          )}
        </div>

        <div className="mt-3 rounded-lg border border-white/10 bg-black/20 p-3">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-wide text-slate-500">Relevant Context</p>
          <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-400">
            <span>{sessions.length} Think {sessions.length === 1 ? "session" : "sessions"}</span>
            <span>{selectedSpec ? selectedSpec.clarificationStatus.replaceAll("_", " ") : "No spec yet"}</span>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {visibleMessages.length ? (
          <div className="space-y-4">
            {visibleMessages.map((message, index) => (
              <ChatBubble
                key={`think-chat-message-${index}-${message.id}`}
                role={message.role}
                text={message.content}
                source={message.source}
                model={message.model}
                error={message.error}
                pending={message.pending}
              />
            ))}
            <div ref={messagesEndRef} />
          </div>
        ) : (
          <div className="rounded-lg border border-white/10 bg-white/[0.035] p-4">
            <p className="text-sm font-medium text-white">No decisions yet.</p>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              Start by describing what you are trying to figure out. Brainpress will organize the thinking on the canvas.
            </p>
          </div>
        )}
      </div>

      <div className="border-t border-white/10 bg-[#070a12] p-4">
        <TextArea
          className="min-h-28 border-white/10 bg-white/[0.05] text-sm text-white placeholder:text-slate-500 focus:border-blue-300/60 focus:ring-blue-400/10"
          value={directionInput}
          onChange={(event) => onDirectionInputChange(event.target.value)}
          placeholder="Ask Brainpress about your service idea..."
        />
        <div className="mt-3 flex items-center justify-between gap-3">
          <span className="truncate font-mono text-[11px] uppercase text-slate-500">
            {formatThinkMode(mode)} / {formatThinkArtifactType(artifactType)}
          </span>
          <Button variant="primary" onClick={sendThinkMessage} disabled={thinkingWithAgent || !directionInput.trim()}>
            {thinkingWithAgent ? <Sparkles className="h-4 w-4 animate-pulse" /> : <Send className="h-4 w-4" />}
            {thinkingWithAgent ? "Thinking" : "Refine Service"}
          </Button>
        </div>
      </div>
    </aside>
  );
}

function ThinkCanvas({
  service,
  agents,
  selectedSession,
  spec,
  clarifyingQuestions,
  onCreateBuildTask,
  onGenerateServiceBlueprint,
  onGenerateBuildPlan,
}: {
  service: BrainpressService;
  agents: ServiceAgent[];
  selectedSession?: ThinkSession;
  spec?: BrainpressSpec;
  clarifyingQuestions: ClarifyingQuestion[];
  onCreateBuildTask: (session: ThinkSession, recommendation: RecommendedBuildTask) => void;
  onGenerateServiceBlueprint: () => void;
  onGenerateBuildPlan: (spec: BrainpressSpec) => void;
}) {
  const serviceCapabilities = selectedSession?.featureIdeas.length ? selectedSession.featureIdeas : ["Service capabilities will appear as the spec becomes clearer."];
  const workflow = service.serviceWorkflow.length
    ? service.serviceWorkflow
    : selectedSession?.mvpScope.length
      ? selectedSession.mvpScope
      : ["Capture the request.", "Clarify the outcome.", "Route build work only after founder approval.", "Verify before marking work ready."];
  const risks = uniqueText([
    ...(selectedSession?.risks || []),
    ...(spec?.assumptions.map((assumption) => `Assumption: ${assumption}`) || []),
    ...(service.openQuestions || []),
  ]);
  const constraints = uniqueText([
    ...(spec?.nonGoals.map((item) => `Not now: ${item}`) || []),
    ...(selectedSession?.decisions || []),
  ]);
  const firstRecommendation = selectedSession?.recommendedBuildTasks[0];

  return (
    <>
      <main className="relative min-h-[760px] overflow-hidden border-b border-white/10 bg-[#05070d] p-4 md:p-5 lg:border-b-0 lg:border-r">
        <CanvasBackdrop />
        <div className="relative z-10 space-y-4">
          <ServiceSpecCard service={service} session={selectedSession} spec={spec} clarifyingQuestions={clarifyingQuestions} />
          <ServiceWorkflowCard workflow={workflow} capabilities={serviceCapabilities} approvalPoints={service.humanApprovalPoints} />
          <RisksUnknownsCard risks={risks} constraints={constraints} openQuestions={spec?.openQuestions || service.openQuestions} />
        </div>
      </main>

      <aside className="relative min-h-[760px] overflow-hidden bg-[#060914] p-4 md:p-5">
        <CanvasBackdrop />
        <div className="relative z-10 space-y-4">
          <AgentBlueprintCard service={service} agents={agents} />
          <ApprovalPointsCard approvalPoints={service.humanApprovalPoints} successMetrics={service.successMetrics} />
          <BuildReadinessNode
            spec={spec}
            questionCount={clarifyingQuestions.filter((question) => question.status !== "answered").length}
            onGenerateServiceBlueprint={onGenerateServiceBlueprint}
            onGenerateBuildPlan={onGenerateBuildPlan}
          />
          <BuildNextNode session={selectedSession} recommendation={firstRecommendation} onCreateBuildTask={onCreateBuildTask} />
        </div>
      </aside>
    </>
  );
}

function ServiceSpecCard({
  service,
  session,
  spec,
  clarifyingQuestions,
}: {
  service: BrainpressService;
  session?: ThinkSession;
  spec?: BrainpressSpec;
  clarifyingQuestions: ClarifyingQuestion[];
}) {
  const openQuestionCount = spec ? Math.max(spec.openQuestions.length, clarifyingQuestions.filter((question) => question.status !== "answered").length) : 0;
  const status = spec ? (spec.clarificationStatus === "needs_clarification" ? "needs clarification" : "ready") : "draft";
  return (
    <ThinkPanel accent="violet">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[11px] font-semibold uppercase tracking-wide text-violet-200">Center Column</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-normal text-white">Service Spec</h2>
        </div>
        <span className={cx("rounded-md px-2 py-1 font-mono text-[10px] uppercase", status === "ready" ? "bg-emerald-300/15 text-emerald-200" : status === "draft" ? "bg-white/10 text-slate-300" : "bg-amber-300/15 text-amber-200")}>
          {status}
        </span>
      </div>
      <div className="mt-5 grid gap-3">
        <SpecField label="Service Promise" value={service.servicePromise || session?.productDirection || "No service promise generated yet."} />
        <SpecField label="Target Customer" value={service.targetCustomer || session?.targetUser || "Target customer is not clear yet."} />
        <SpecField label="Desired Outcome" value={service.desiredOutcome || session?.proposedSolution || "Desired outcome will appear after Brainpress understands the Service."} />
        <SpecField label="What" value={spec?.what || session?.summary || "The Service Spec will define what the agent service must accomplish."} />
        <SpecField label="Why" value={spec?.why || session?.userProblem || "The Service Spec will capture why this should exist."} />
      </div>
      <div className="mt-4 rounded-lg border border-violet-300/15 bg-violet-300/[0.06] p-3">
        <p className="font-mono text-[11px] uppercase tracking-wide text-violet-100">{openQuestionCount} open questions</p>
        <p className="mt-1 text-xs leading-5 text-slate-400">Answer open questions before turning this into a build plan.</p>
      </div>
    </ThinkPanel>
  );
}

function ServiceWorkflowCard({
  workflow,
  capabilities,
  approvalPoints,
}: {
  workflow: string[];
  capabilities: string[];
  approvalPoints: string[];
}) {
  return (
    <ThinkPanel accent="blue">
      <p className="font-mono text-[11px] font-semibold uppercase tracking-wide text-blue-300">Service Workflow</p>
      <h3 className="mt-2 text-xl font-semibold text-white">How the Service should work</h3>
      <CompactList label="workflow" items={workflow} />
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <MiniSummary title="Service Capabilities" items={capabilities} />
        <MiniSummary title="Approval Points" items={approvalPoints} />
      </div>
    </ThinkPanel>
  );
}

function RisksUnknownsCard({
  risks,
  constraints,
  openQuestions,
}: {
  risks: string[];
  constraints: string[];
  openQuestions: string[];
}) {
  return (
    <ThinkPanel accent="amber">
      <p className="font-mono text-[11px] font-semibold uppercase tracking-wide text-amber-200">Risks & Unknowns</p>
      <h3 className="mt-2 text-xl font-semibold text-white">What still needs judgment</h3>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <MiniSummary title="Unresolved Risks" items={risks} emptyText="No major risks captured yet." />
        <MiniSummary title="Constraints" items={constraints} emptyText="No explicit constraints yet." />
        <MiniSummary title="Open Questions" items={openQuestions} emptyText="No open questions yet." />
      </div>
    </ThinkPanel>
  );
}

function CanvasBackdrop() {
  return (
    <div
      className="pointer-events-none absolute inset-0 opacity-80"
      style={{
        backgroundImage:
          "linear-gradient(rgba(148,163,184,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.07) 1px, transparent 1px), radial-gradient(circle at 50% 35%, rgba(37,99,235,0.16), transparent 42%)",
        backgroundSize: "36px 36px, 36px 36px, 100% 100%",
      }}
    />
  );
}

function AgentBlueprintCard({
  service,
  agents,
}: {
  service: BrainpressService;
  agents: ServiceAgent[];
}) {
  const mainAgent = agents.find((agent) => agent.id === service.mainAgentId) || agents[0];
  const subAgents = agents.filter((agent) => agent.id !== mainAgent?.id);
  return (
    <ThinkPanel accent="emerald">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[11px] font-semibold uppercase tracking-wide text-emerald-200">Agent Blueprint</p>
          <h3 className="mt-2 text-xl font-semibold text-white">Agent Team</h3>
        </div>
        <span className="rounded-md bg-emerald-300/10 px-2 py-1 font-mono text-[10px] uppercase text-emerald-100">
          {agents.length || 0} agents
        </span>
      </div>
      {mainAgent ? (
        <div className="mt-4 rounded-lg border border-emerald-300/15 bg-emerald-300/[0.06] p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold text-white">{mainAgent.name}</p>
            <PermissionBadge level={mainAgent.permissionLevel} />
          </div>
          <p className="mt-1 text-xs uppercase tracking-wide text-emerald-100">Main Agent</p>
          <p className="mt-2 text-sm leading-6 text-slate-300">{shortText(mainAgent.goal, 140)}</p>
        </div>
      ) : (
        <p className="mt-4 rounded-lg border border-white/10 bg-white/[0.035] p-3 text-sm text-slate-400">
          No main agent generated yet. Generate the Service Blueprint to propose the agent team.
        </p>
      )}
      <div className="mt-4 space-y-2">
        {subAgents.length ? (
          subAgents.slice(0, 4).map((agent, index) => (
            <div key={`agent-blueprint-${index}-${agent.id}`} className="rounded-lg border border-white/10 bg-white/[0.035] p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-white">{agent.name}</p>
                <PermissionBadge level={agent.permissionLevel} />
              </div>
              <p className="mt-1 text-xs text-slate-500">{agent.role}</p>
            </div>
          ))
        ) : (
          <p className="text-sm leading-6 text-slate-400">Sub-agents will appear when the Service needs specialized roles.</p>
        )}
      </div>
    </ThinkPanel>
  );
}

function ApprovalPointsCard({
  approvalPoints,
  successMetrics,
}: {
  approvalPoints: string[];
  successMetrics: string[];
}) {
  return (
    <ThinkPanel accent="blue">
      <p className="font-mono text-[11px] font-semibold uppercase tracking-wide text-blue-300">Approval Points</p>
      <h3 className="mt-2 text-xl font-semibold text-white">Human gates</h3>
      <CompactList label="approval-points" items={approvalPoints} emptyText="Approval points will appear with the Service Blueprint." />
      <MiniSummary title="Success Metrics" items={successMetrics} emptyText="No success metrics generated yet." />
    </ThinkPanel>
  );
}

function BuildReadinessNode({
  spec,
  questionCount,
  onGenerateServiceBlueprint,
  onGenerateBuildPlan,
}: {
  spec?: BrainpressSpec;
  questionCount: number;
  onGenerateServiceBlueprint: () => void;
  onGenerateBuildPlan: (spec: BrainpressSpec) => void;
}) {
  const ready = Boolean(spec && spec.clarificationStatus !== "needs_clarification" && questionCount === 0);
  return (
    <ThinkPanel accent={ready ? "emerald" : "amber"}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className={cx("font-mono text-[11px] font-semibold uppercase tracking-wide", ready ? "text-emerald-200" : "text-amber-200")}>
            Build Readiness
          </p>
          <h3 className="mt-2 text-xl font-semibold text-white">{ready ? "Ready for Build" : "Needs clarification"}</h3>
        </div>
        {ready ? <CheckCircle2 className="h-5 w-5 text-emerald-200" /> : <Sparkles className="h-5 w-5 text-amber-200" />}
      </div>
      <p className="mt-3 text-sm leading-6 text-slate-300">
        {ready
          ? "The Service Spec is clear enough to generate the technical plan and ordered Codex tasks."
          : "Generate or refine the Service Blueprint before handing work to Build."}
      </p>
      <div className="mt-4">
        {ready && spec ? (
          <Button variant="primary" onClick={() => onGenerateBuildPlan(spec)}>
            Generate Build Plan
          </Button>
        ) : (
          <Button variant="primary" onClick={onGenerateServiceBlueprint}>
            Generate Service Blueprint
          </Button>
        )}
      </div>
    </ThinkPanel>
  );
}

function BuildNextNode({
  session,
  recommendation,
  onCreateBuildTask,
  className,
}: {
  session?: ThinkSession;
  recommendation?: RecommendedBuildTask;
  onCreateBuildTask: (session: ThinkSession, recommendation: RecommendedBuildTask) => void;
  className?: string;
}) {
  return (
    <div className={cx("rounded-lg border border-emerald-300/20 bg-emerald-300/[0.07] p-4 text-white shadow-2xl shadow-emerald-950/10", className)}>
      <p className="font-mono text-[11px] font-semibold uppercase tracking-wide text-emerald-200">Next Build Step</p>
      <h3 className="mt-2 text-lg font-semibold">{recommendation?.title || "No Build step selected yet"}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-300">
        {recommendation?.reason || "Brainpress will suggest the next agent-ready task after it understands the direction."}
      </p>
      {session && recommendation ? (
        <Button className="mt-4" variant="primary" onClick={() => onCreateBuildTask(session, recommendation)}>
          <Plus className="h-4 w-4" />
          Create Build Task
        </Button>
      ) : null}
    </div>
  );
}

function ThinkPanel({
  children,
  accent = "blue",
}: {
  children: ReactNode;
  accent?: "blue" | "violet" | "emerald" | "amber";
}) {
  const styles = {
    blue: "border-blue-300/20 bg-slate-950/80 shadow-blue-950/20",
    violet: "border-violet-300/20 bg-violet-300/[0.07] shadow-violet-950/20",
    emerald: "border-emerald-300/20 bg-emerald-300/[0.07] shadow-emerald-950/20",
    amber: "border-amber-300/20 bg-amber-300/[0.06] shadow-amber-950/10",
  };
  return <div className={cx("rounded-lg border p-4 text-white shadow-2xl backdrop-blur", styles[accent])}>{children}</div>;
}

function SpecField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/20 p-3">
      <p className="font-mono text-[10px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-sm leading-6 text-slate-300">{shortText(value, 180)}</p>
    </div>
  );
}

function MiniSummary({ title, items, emptyText = "Not enough service context yet." }: { title: string; items: string[]; emptyText?: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.035] p-3">
      <p className="font-mono text-[10px] uppercase tracking-wide text-slate-500">{title}</p>
      <CompactList label={title} items={items} emptyText={emptyText} compact />
    </div>
  );
}

function CompactList({
  label,
  items,
  emptyText = "Nothing captured yet.",
  compact = false,
}: {
  label: string;
  items: string[];
  emptyText?: string;
  compact?: boolean;
}) {
  const visibleItems = uniqueText(items).slice(0, compact ? 3 : 5);
  if (!visibleItems.length) return <p className="mt-2 text-xs leading-5 text-slate-500">{emptyText}</p>;
  return (
    <ul className={cx("mt-3 space-y-2", compact ? "text-xs leading-5 text-slate-400" : "text-sm leading-6 text-slate-300")}>
      {visibleItems.map((item, index) => (
        <li key={`compact-list-${label}-${index}-${item}`} className="flex gap-2">
          <CornerDownRight className="mt-1 h-3.5 w-3.5 shrink-0 text-blue-300/70" />
          <span>{shortText(item, compact ? 90 : 130)}</span>
        </li>
      ))}
    </ul>
  );
}

function PermissionBadge({ level }: { level: ServiceAgent["permissionLevel"] }) {
  const label = level.replaceAll("_", " ");
  const tone = level === "founder_approval_required" ? "bg-amber-300/15 text-amber-100" : level === "high" ? "bg-rose-300/15 text-rose-100" : "bg-blue-300/15 text-blue-100";
  return <span className={cx("rounded-md px-2 py-1 font-mono text-[10px] uppercase", tone)}>{label}</span>;
}

function ChatBubble({
  role,
  text,
  source,
  model,
  error,
  pending = false,
}: {
  role: "user" | "assistant" | "system";
  text: string;
  source?: BrainpressAgentSource;
  model?: string;
  error?: string;
  pending?: boolean;
}) {
  return (
    <div
      title={error || undefined}
      className={cx(
        "mb-2 rounded-lg px-3 py-2 text-sm leading-5",
        role === "user"
          ? "ml-6 bg-blue-400/15 text-blue-50"
          : role === "system"
            ? "bg-amber-300/10 text-amber-100"
            : "mr-6 bg-white/[0.06] text-slate-300",
      )}
    >
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <p className="font-mono text-[10px] uppercase tracking-wide text-slate-500">
          {role === "user" ? "Founder" : role === "system" ? "System" : "Brainpress"}
        </p>
        {source ? <AgentSourcePill source={source} model={model} /> : null}
      </div>
      <p className={cx("whitespace-pre-line", pending && "animate-pulse text-slate-400")}>{text}</p>
    </div>
  );
}

function CanvasTag({ children }: { children: ReactNode }) {
  return <span className="rounded-md border border-white/10 bg-white/[0.06] px-2 py-1 font-mono text-[11px] uppercase text-slate-300">{children}</span>;
}

function AgentSourcePill({ source, model }: { source?: BrainpressAgentSource; model?: string }) {
  if (!source) return null;
  return (
    <span className={cx("rounded-md px-2 py-1 font-mono text-[10px] uppercase", source === "openai" ? "bg-emerald-300/15 text-emerald-200" : "bg-amber-300/15 text-amber-200")}>
      {source === "openai" ? "Live AI" : "Local fallback"}
      {model ? ` / ${model}` : ""}
    </span>
  );
}

function sessionHistoryToMessages(sessions: ThinkSession[]): ThinkChatMessage[] {
  return sessions
    .slice(0, 6)
    .reverse()
    .flatMap((session) => [
      {
        id: `history-user-${session.id}`,
        role: "user" as const,
        content: session.input,
        createdAt: session.createdAt,
      },
      {
        id: `history-assistant-${session.id}`,
        role: "assistant" as const,
        content: assistantResponseFromThinkResult({ session }),
        source: session.agentSource,
        model: session.agentModel,
        error: session.agentError,
        createdAt: session.updatedAt,
      },
    ]);
}

function assistantResponseFromThinkResult(result: { session: ThinkSession; productWindow?: ProductWindow }) {
  const taskCount = result.session.recommendedBuildTasks.length;
  const pieces = [
    `I shaped this into a service direction: ${result.session.summary}`,
    `I also updated the canvas with Service Spec, Service Workflow, Risks, Agent Blueprint, and Build Readiness.`,
    taskCount
      ? `I found ${taskCount} possible Next Build ${taskCount === 1 ? "step" : "steps"}. You can create ${taskCount === 1 ? "it" : "them"} from the canvas.`
      : "I did not find a Build task yet. Add more detail and I will turn it into agent-ready work.",
    result.productWindow ? "I also prepared ServiceWindow data. Open the ServiceWindow tab when you want to generate or review UI/UX." : "",
  ].filter(Boolean);
  return pieces.join("\n\n");
}

function replaceChatMessage(messages: ThinkChatMessage[], id: string, patch: Partial<ThinkChatMessage>) {
  return messages.map((message) =>
    message.id === id
      ? {
          ...message,
          ...patch,
        }
      : message,
  );
}

function createThinkChatMessageId(role: ThinkChatMessage["role"]) {
  return `thinkmsg_${role}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function shortText(value: string, max = 140) {
  const clean = value.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 3).trim()}...`;
}

function uniqueText(items: string[]) {
  const seen = new Set<string>();
  return items
    .map((item) => item.replace(/\s+/g, " ").trim())
    .filter((item) => {
      const key = item.toLowerCase();
      if (!item || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function formatThinkMode(mode: ThinkMode) {
  const labels: Record<ThinkMode, string> = {
    open_thinking: "Open thinking",
    clarify_idea: "Clarify idea",
    define_mvp: "Define MVP",
    create_feature_spec: "Service spec",
    plan_roadmap: "Build path",
    make_decision: "Decision",
    analyze_risk: "Risk",
  };
  return labels[mode];
}

function formatThinkArtifactType(type: ThinkArtifactType) {
  const labels: Record<ThinkArtifactType, string> = {
    product_brief: "Service Brief",
    roadmap: "Build Path",
    decision_memo: "Decisions",
    feature_spec: "Service Spec",
    risk_analysis: "Risk Analysis",
    mvp_scope: "MVP Scope",
  };
  return labels[type];
}

export function applyProductWindowSuggestion(
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
