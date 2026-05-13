"use client";

import { CornerDownRight, Send, Sparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { ThinkAgentResult } from "@/lib/agent-gateway";
import type {
  BrainpressService,
  BrainpressSpec,
  BrainpressAgentSource,
  ClarifyingQuestion,
  ProductWindow,
  ServiceAgent,
  ServiceThinkingArtifact,
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
  thinkingArtifacts: ServiceThinkingArtifact[];
  clarifyingQuestions: ClarifyingQuestion[];
  selectedSessionId: string;
  mode: ThinkMode;
  artifactType: ThinkArtifactType;
  onDirectionInputChange: (value: string) => void;
  onModeChange: (value: ThinkMode) => void;
  onArtifactTypeChange: (value: ThinkArtifactType) => void;
  onSelectSession: (id: string) => void;
  onCreateProductDirection: () => Promise<ThinkCreationResult | null>;
  onGenerateServiceBlueprint: () => void;
  onGenerateThinkCanvases: () => void;
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
  thinkingArtifacts,
  clarifyingQuestions,
  selectedSessionId,
  mode,
  artifactType,
  onDirectionInputChange,
  onModeChange,
  onArtifactTypeChange,
  onSelectSession,
  onCreateProductDirection,
  onGenerateServiceBlueprint,
  onGenerateThinkCanvases,
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
        <p className="font-mono text-xs font-semibold uppercase tracking-wide text-blue-300">Agent Development Agent</p>
        <div className="mt-2 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-normal text-white md:text-3xl">
              Co-think the Service before Codex builds it.
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
              Describe the service. Brainpress will create only the thinking canvases this idea actually needs.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <CanvasTag>{thinkingArtifacts.length ? `${thinkingArtifacts.length} canvases` : "No canvases yet"}</CanvasTag>
            {selectedSession?.agentSource ? <AgentSourcePill source={selectedSession.agentSource} model={selectedSession.agentModel} /> : null}
          </div>
        </div>
      </div>

      <div className="grid min-h-[760px] lg:grid-cols-[380px_minmax(0,1fr)]">
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
        <DynamicThinkCanvas
          service={service}
          artifacts={thinkingArtifacts}
          selectedSession={selectedSession}
          onGenerateServiceBlueprint={onGenerateServiceBlueprint}
          onGenerateThinkCanvases={onGenerateThinkCanvases}
          onGenerateBuildPlan={onGenerateBuildPlan}
          spec={selectedSpec}
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
            <p className="text-sm font-medium text-white">Describe the service you want to create.</p>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              Brainpress will co-think with you and create the right canvases as the idea becomes clear.
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

function DynamicThinkCanvas({
  service,
  artifacts,
  selectedSession,
  spec,
  onGenerateServiceBlueprint,
  onGenerateThinkCanvases,
  onGenerateBuildPlan,
}: {
  service: BrainpressService;
  artifacts: ServiceThinkingArtifact[];
  selectedSession?: ThinkSession;
  spec?: BrainpressSpec;
  onGenerateServiceBlueprint: () => void;
  onGenerateThinkCanvases: () => void;
  onGenerateBuildPlan: (spec: BrainpressSpec) => void;
}) {
  const activeArtifacts = artifacts.filter((artifact) => artifact.status !== "archived");
  return (
    <main className="relative min-h-[760px] overflow-hidden bg-[#05070d] p-4 md:p-6">
      <CanvasBackdrop />
      <div className="relative z-10 mx-auto flex max-w-6xl flex-col gap-5">
        <div className="flex flex-col gap-3 rounded-lg border border-white/10 bg-slate-950/75 p-4 shadow-2xl shadow-blue-950/20 backdrop-blur md:flex-row md:items-center md:justify-between">
          <div>
            <p className="font-mono text-[11px] font-semibold uppercase tracking-wide text-blue-300">Dynamic Canvas</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-normal text-white">Let the idea decide the artifacts.</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
              Brainpress creates service briefs, workflows, approval policies, feature maps, and Build paths only when the conversation earns them.
            </p>
          </div>
          <Button variant="primary" onClick={onGenerateThinkCanvases}>
            <Sparkles className="h-4 w-4" />
            Let Brainpress organize this
          </Button>
        </div>

        {activeArtifacts.length ? (
          <div className="grid gap-4 xl:grid-cols-2">
            {activeArtifacts.map((artifact, index) => (
              <ThinkingArtifactCard
                key={`thinking-artifact-${index}-${artifact.id}`}
                artifact={artifact}
                spec={spec}
                onGenerateServiceBlueprint={onGenerateServiceBlueprint}
                onGenerateBuildPlan={onGenerateBuildPlan}
              />
            ))}
          </div>
        ) : (
          <div className="flex min-h-[460px] items-center justify-center rounded-lg border border-dashed border-white/15 bg-white/[0.025] p-8 text-center">
            <div className="max-w-lg">
              <p className="font-mono text-xs font-semibold uppercase tracking-wide text-blue-300">No canvases yet</p>
              <h3 className="mt-3 text-2xl font-semibold tracking-normal text-white">Co-think with Brainpress to generate the right artifacts for this Service.</h3>
              <p className="mt-3 text-sm leading-6 text-slate-400">
                If the idea is unclear, Brainpress will start with clarifying questions. If the idea is specific, it will create only the canvases needed for the service.
              </p>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

function ThinkingArtifactCard({
  artifact,
  spec,
  onGenerateServiceBlueprint,
  onGenerateBuildPlan,
}: {
  artifact: ServiceThinkingArtifact;
  spec?: BrainpressSpec;
  onGenerateServiceBlueprint: () => void;
  onGenerateBuildPlan: (spec: BrainpressSpec) => void;
}) {
  return (
    <ThinkPanel accent={artifactTone(artifact.type)}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[11px] font-semibold uppercase tracking-wide text-slate-400">{formatCanvasType(artifact.type)}</p>
          <h3 className="mt-2 text-xl font-semibold tracking-normal text-white">{artifact.title}</h3>
        </div>
        <span className={cx("rounded-md px-2 py-1 font-mono text-[10px] uppercase", statusTone(artifact.status))}>
          {artifact.status.replaceAll("_", " ")}
        </span>
      </div>
      <p className="mt-3 text-sm leading-6 text-slate-300">{artifact.purpose}</p>
      <CompactList label={`thinking-artifact-${artifact.id}`} items={artifact.content} emptyText="Brainpress has not added content yet." />
      {artifact.type === "agent_team" ? (
        <Button className="mt-4" variant="primary" onClick={onGenerateServiceBlueprint}>
          Generate Service Blueprint
        </Button>
      ) : null}
      {artifact.status === "ready_for_build" && spec ? (
        <Button className="mt-4" variant="primary" onClick={() => onGenerateBuildPlan(spec)}>
          Generate Build Plan
        </Button>
      ) : null}
      {artifact.type === "ui_ux_brief" ? (
        <p className="mt-4 rounded-md border border-violet-300/15 bg-violet-300/[0.06] p-3 text-xs leading-5 text-violet-100">
          Run the Design Agent in ServiceWindow when you are ready for premium UI/UX screens.
        </p>
      ) : null}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-3 text-xs text-slate-500">
        <span>Confidence {Math.round(artifact.confidence * 100)}%</span>
        <span>{formatDateTime(artifact.updatedAt)}</span>
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
    `I also updated the Dynamic Canvas with the artifacts this idea needs right now.`,
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

function artifactTone(type: ServiceThinkingArtifact["type"]): "blue" | "violet" | "emerald" | "amber" {
  if (type === "clarifying_questions" || type === "risk_map" || type === "technical_unknowns") return "amber";
  if (type === "agent_team" || type === "approval_policy") return "emerald";
  if (type === "ui_ux_brief" || type === "service_brief") return "violet";
  return "blue";
}

function statusTone(status: ServiceThinkingArtifact["status"]) {
  const tones: Record<ServiceThinkingArtifact["status"], string> = {
    draft: "bg-white/10 text-slate-300",
    active: "bg-blue-300/15 text-blue-100",
    needs_review: "bg-amber-300/15 text-amber-100",
    ready_for_build: "bg-emerald-300/15 text-emerald-100",
    archived: "bg-slate-500/15 text-slate-400",
  };
  return tones[status];
}

function formatCanvasType(type: ServiceThinkingArtifact["type"]) {
  const labels: Record<ServiceThinkingArtifact["type"], string> = {
    clarifying_questions: "Clarifying questions",
    service_brief: "Service brief",
    feature_map: "Feature map",
    roadmap: "Build path",
    workflow: "Workflow",
    agent_team: "Agent team",
    approval_policy: "Approval policy",
    risk_map: "Risk map",
    user_journey: "User journey",
    data_sources: "Data sources",
    pricing_model: "Pricing model",
    mvp_scope: "MVP scope",
    technical_unknowns: "Technical unknowns",
    ui_ux_brief: "UI/UX brief",
    custom: "Custom",
  };
  return labels[type];
}

function formatDateTime(value: string) {
  if (!value) return "Just now";
  try {
    return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
  } catch {
    return "Updated";
  }
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
