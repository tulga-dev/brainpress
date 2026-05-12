"use client";

import { CheckCircle2, CornerDownRight, Plus, Send, Sparkles, Wand2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { ThinkAgentResult } from "@/lib/agent-gateway";
import type {
  BrainpressAgentSource,
  ProductWindow,
  RecommendedBuildTask,
  ThinkArtifactType,
  ThinkMode,
  ThinkSession,
} from "@/lib/types";
import { Button, TextArea, cx } from "@/components/brainpress/ui";

interface ThinkOperatingTabProps {
  projectName: string;
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
  onCreateProductDirection: () => Promise<ThinkCreationResult | null>;
  onCreateBuildTask: (session: ThinkSession, recommendation: RecommendedBuildTask) => void;
  onRegenerateProductWindow: (session: ThinkSession) => void;
  onApproveProductWindow: (productWindow: ProductWindow) => void;
  onCreateProductWindowBuildTask: (session: ThinkSession, productWindow: ProductWindow) => void;
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
  { title: "Create feature spec", mode: "create_feature_spec" },
  { title: "Plan roadmap", mode: "plan_roadmap" },
  { title: "Make decision", mode: "make_decision" },
  { title: "Analyze risk", mode: "analyze_risk" },
] as const;

const artifactOptions = [
  { title: "Product Brief", artifactType: "product_brief" },
  { title: "Roadmap", artifactType: "roadmap" },
  { title: "Decisions", artifactType: "decision_memo" },
  { title: "Feature Specs", artifactType: "feature_spec" },
] as const;

export function ThinkOperatingTab({
  projectName,
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
}: ThinkOperatingTabProps) {
  const [mobilePane, setMobilePane] = useState<"chat" | "canvas">("chat");
  const selectedSession = sessions.find((session) => session.id === selectedSessionId) || sessions[0];
  const selectedProductWindow = selectedSession
    ? productWindows.find((window) => window.thinkSessionId === selectedSession.id)
    : undefined;

  async function createProductDirectionFromChat() {
    return onCreateProductDirection();
  }

  return (
    <section className="overflow-hidden rounded-lg border border-slate-800 bg-[#05070d] text-white shadow-2xl">
      <MobilePaneSwitch active={mobilePane} onChange={setMobilePane} />
      <div className="grid min-h-[760px] lg:grid-cols-[360px_minmax(0,1fr)]">
        <div className={cx(mobilePane === "chat" ? "block" : "hidden", "lg:block")}>
          <ThinkCofounderSidebar
            projectName={projectName}
            directionInput={directionInput}
            sessions={sessions}
            selectedSessionId={selectedSession?.id || ""}
            mode={mode}
            artifactType={artifactType}
            thinkingWithAgent={thinkingWithAgent}
            onDirectionInputChange={onDirectionInputChange}
            onModeChange={onModeChange}
            onArtifactTypeChange={onArtifactTypeChange}
            onSelectSession={onSelectSession}
            onCreateProductDirection={createProductDirectionFromChat}
          />
        </div>
        <div className={cx(mobilePane === "canvas" ? "block" : "hidden", "lg:block")}>
          <ThinkCanvas
            selectedSession={selectedSession}
            productWindow={selectedProductWindow}
            onCreateBuildTask={onCreateBuildTask}
            onRegenerateProductWindow={onRegenerateProductWindow}
            onApproveProductWindow={onApproveProductWindow}
            onCreateProductWindowBuildTask={onCreateProductWindowBuildTask}
          />
        </div>
      </div>
    </section>
  );
}

function MobilePaneSwitch({
  active,
  onChange,
}: {
  active: "chat" | "canvas";
  onChange: (value: "chat" | "canvas") => void;
}) {
  return (
    <div className="border-b border-white/10 bg-[#070a12] p-2 lg:hidden">
      <div className="grid grid-cols-2 gap-1 rounded-md border border-white/10 bg-black/30 p-1">
        {(["chat", "canvas"] as const).map((pane) => (
          <button
            key={`mobile-pane-${pane}`}
            className={cx(
              "h-9 rounded-md text-sm font-medium capitalize transition",
              active === pane ? "bg-white text-slate-950" : "text-slate-400 hover:bg-white/[0.07] hover:text-white",
            )}
            onClick={() => onChange(pane)}
          >
            {pane === "chat" ? "Chat" : "Canvas"}
          </button>
        ))}
      </div>
    </div>
  );
}

function ThinkCofounderSidebar({
  projectName,
  directionInput,
  sessions,
  selectedSessionId,
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
  directionInput: string;
  sessions: ThinkSession[];
  selectedSessionId: string;
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
      content: "Brainpress is thinking through the product direction...",
      pending: true,
      createdAt: new Date().toISOString(),
    };
    setChatMessages((current) => [...current, userMessage, pendingMessage]);

    try {
      const result = await onCreateProductDirection();
      if (!result) {
        setChatMessages((current) => replaceChatMessage(current, pendingMessage.id, {
          content: "I need a little more detail before I can shape this into product direction. Try adding the user, problem, or feature you are thinking about.",
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
            <h2 className="mt-1 text-xl font-semibold text-white">AI Cofounder</h2>
          </div>
          <span className="rounded-md border border-blue-400/20 bg-blue-400/10 px-2 py-1 font-mono text-xs text-blue-200">
            Think mode
          </span>
        </div>
        <p className="mt-3 text-sm leading-6 text-slate-400">{projectName}</p>
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
          placeholder="Ask Brainpress about your product idea..."
        />
        <div className="mt-3 flex items-center justify-between gap-3">
          <span className="truncate font-mono text-[11px] uppercase text-slate-500">
            {formatThinkMode(mode)} / {formatThinkArtifactType(artifactType)}
          </span>
          <Button variant="primary" onClick={sendThinkMessage} disabled={thinkingWithAgent || !directionInput.trim()}>
            {thinkingWithAgent ? <Sparkles className="h-4 w-4 animate-pulse" /> : <Send className="h-4 w-4" />}
            {thinkingWithAgent ? "Thinking" : "Send"}
          </Button>
        </div>
      </div>
    </aside>
  );
}

function ThinkCanvas({
  selectedSession,
  productWindow,
  onCreateBuildTask,
  onRegenerateProductWindow,
  onApproveProductWindow,
  onCreateProductWindowBuildTask,
}: {
  selectedSession?: ThinkSession;
  productWindow?: ProductWindow;
  onCreateBuildTask: (session: ThinkSession, recommendation: RecommendedBuildTask) => void;
  onRegenerateProductWindow: (session: ThinkSession) => void;
  onApproveProductWindow: (productWindow: ProductWindow) => void;
  onCreateProductWindowBuildTask: (session: ThinkSession, productWindow: ProductWindow) => void;
}) {
  const hasSession = Boolean(selectedSession);
  const features = selectedSession?.featureIdeas.length ? selectedSession.featureIdeas : ["Feature ideas will appear here."];
  const roadmap = selectedSession?.mvpScope.length ? selectedSession.mvpScope : ["Define the smallest useful version."];
  const risks = selectedSession?.risks.length ? selectedSession.risks : ["Risks and unknowns will be mapped as you think."];
  const firstRecommendation = selectedSession?.recommendedBuildTasks[0];

  return (
    <div className="relative min-h-[760px] overflow-hidden bg-[#05070d] p-4 md:p-6">
      <CanvasBackdrop />

      <div className="relative z-10 mb-5 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="font-mono text-xs font-semibold uppercase tracking-wide text-blue-300">Think Canvas</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-normal text-white md:text-4xl">
            Shape the product before you build it.
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
            Think with Brainpress to clarify ideas, define the MVP, make product decisions, and turn messy founder thinking into buildable direction.
          </p>
        </div>
        {selectedSession ? (
          <div className="flex flex-wrap gap-2">
            <CanvasTag>{formatThinkArtifactType(selectedSession.artifactType)}</CanvasTag>
            <CanvasTag>{selectedSession.status.replaceAll("_", " ")}</CanvasTag>
          </div>
        ) : null}
      </div>

      <div className="relative z-10 grid gap-4 xl:hidden">
        <ThinkCanvasNode title="Vision" eyebrow="Direction" summary={selectedSession?.productDirection || "Your product direction will land here."} />
        <ProductWindowNode
          session={selectedSession}
          productWindow={productWindow}
          onRegenerateProductWindow={onRegenerateProductWindow}
          onApproveProductWindow={onApproveProductWindow}
          onCreateProductWindowBuildTask={onCreateProductWindowBuildTask}
        />
        <ThinkCanvasNode title="Features" eyebrow="Ideas" summary={features[0]} items={features.slice(0, 4)} />
        <ThinkCanvasNode title="Design" eyebrow="Feel" summary={productWindow?.uiPrinciples[0] || "UI principles will appear after the Product Window is generated."} items={productWindow?.uiPrinciples.slice(0, 3)} />
        <ThinkCanvasNode title="Roadmap" eyebrow="MVP" summary={roadmap[0]} items={roadmap.slice(0, 4)} />
        <BuildNextNode session={selectedSession} recommendation={firstRecommendation} onCreateBuildTask={onCreateBuildTask} />
      </div>

      <div className="relative z-10 hidden min-h-[650px] xl:block">
        <Connector className="left-[27%] top-[34%] w-[30%] rotate-6" />
        <Connector className="left-[52%] top-[35%] w-[26%] -rotate-6" />
        <Connector className="left-[37%] top-[63%] w-[28%] rotate-90" />

        <ThinkCanvasNode
          className="absolute left-[34%] top-0 w-[34%]"
          title="Vision"
          eyebrow="Direction"
          summary={selectedSession?.productDirection || "Your product direction will land here."}
          dormant={!hasSession}
        />
        <ThinkCanvasNode
          className="absolute left-0 top-[27%] w-[28%]"
          title="Features"
          eyebrow="Ideas"
          summary={features[0]}
          items={features.slice(0, 4)}
          dormant={!hasSession}
        />
        <ProductWindowNode
          className="absolute left-[31%] top-[27%] w-[38%]"
          session={selectedSession}
          productWindow={productWindow}
          onRegenerateProductWindow={onRegenerateProductWindow}
          onApproveProductWindow={onApproveProductWindow}
          onCreateProductWindowBuildTask={onCreateProductWindowBuildTask}
        />
        <ThinkCanvasNode
          className="absolute right-0 top-[28%] w-[27%]"
          title="Design"
          eyebrow="Product feel"
          summary={productWindow?.uiPrinciples[0] || "Design direction will appear as the Product Window forms."}
          items={productWindow?.uiPrinciples.slice(0, 3)}
          dormant={!productWindow}
        />
        <ThinkCanvasNode
          className="absolute bottom-[4%] left-[31%] w-[34%]"
          title="Roadmap"
          eyebrow="MVP"
          summary={roadmap[0]}
          items={roadmap.slice(0, 4)}
          dormant={!hasSession}
        />
        <ThinkCanvasNode
          className="absolute bottom-[1%] left-0 w-[25%]"
          title="Risks"
          eyebrow="Watch"
          summary={risks[0]}
          items={risks.slice(0, 3)}
          dormant={!hasSession}
        />
        <BuildNextNode
          className="absolute bottom-[1%] right-0 w-[28%]"
          session={selectedSession}
          recommendation={firstRecommendation}
          onCreateBuildTask={onCreateBuildTask}
        />
      </div>
    </div>
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

function ThinkCanvasNode({
  title,
  eyebrow,
  summary,
  items = [],
  dormant = false,
  className,
}: {
  title: string;
  eyebrow: string;
  summary: string;
  items?: string[];
  dormant?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cx(
        "rounded-lg border p-4 shadow-2xl backdrop-blur",
        dormant
          ? "border-white/10 bg-white/[0.035] text-slate-400"
          : "border-blue-300/20 bg-slate-950/80 text-white shadow-blue-950/30",
        className,
      )}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="font-mono text-[11px] font-semibold uppercase tracking-wide text-blue-300">{eyebrow}</p>
        <span className="h-2 w-2 rounded-full bg-blue-300/70" />
      </div>
      <h3 className="text-lg font-semibold tracking-normal">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-300">{shortText(summary)}</p>
      {items.length ? (
        <ul className="mt-4 space-y-2 text-xs leading-5 text-slate-400">
          {items.slice(0, 4).map((item, index) => (
            <li key={`canvas-node-${title}-${index}-${item}`} className="flex gap-2">
              <CornerDownRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-300/70" />
              <span>{shortText(item, 96)}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function ProductWindowNode({
  session,
  productWindow,
  onRegenerateProductWindow,
  onApproveProductWindow,
  onCreateProductWindowBuildTask,
  className,
}: {
  session?: ThinkSession;
  productWindow?: ProductWindow;
  onRegenerateProductWindow: (session: ThinkSession) => void;
  onApproveProductWindow: (productWindow: ProductWindow) => void;
  onCreateProductWindowBuildTask: (session: ThinkSession, productWindow: ProductWindow) => void;
  className?: string;
}) {
  const sections = productWindow?.sections.slice(0, 4) || [];

  return (
    <div className={cx("overflow-hidden rounded-lg border border-cyan-300/25 bg-[#101827]/95 shadow-2xl shadow-cyan-950/20", className)}>
      <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-white/[0.04] px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-rose-300" />
            <span className="h-2.5 w-2.5 rounded-full bg-amber-300" />
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-300" />
          </div>
          <span className="truncate font-mono text-xs text-slate-400">{productWindow?.route || "/product-window/draft"}</span>
        </div>
        <CanvasTag>Product UI</CanvasTag>
      </div>

      <div className="p-4">
        <p className="font-mono text-[11px] font-semibold uppercase tracking-wide text-cyan-200">Product UI Example Window</p>
        <h3 className="mt-2 text-xl font-semibold text-white">{productWindow?.title || "Product UI Example Window"}</h3>
        <p className="mt-2 text-sm leading-6 text-slate-300">
          {productWindow?.screenDescription || "A conceptual browser preview will appear here after the first Think session."}
        </p>

        <div className="mt-4 overflow-hidden rounded-xl border border-cyan-300/15 bg-slate-950/80">
          <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-cyan-300/[0.06] px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-cyan-200">Agent-built preview page</p>
            <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-2.5 py-1 text-[11px] text-cyan-100">
              Concept
            </span>
          </div>

          <div className="p-4">
            <div className="overflow-hidden rounded-lg border border-white/10 bg-[#f8fafc] text-slate-950 shadow-2xl shadow-cyan-950/20">
              <div className="flex items-center justify-between border-b border-slate-200 bg-white/90 px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-slate-900" />
                  <span className="text-xs font-semibold">{productWindow?.title || "Draft product"}</span>
                </div>
                <span className="rounded-md bg-slate-950 px-3 py-1.5 text-[11px] font-semibold text-white">
                  {productWindow?.primaryCTA || "Think with Brainpress"}
                </span>
              </div>

              <div className="grid gap-0 md:grid-cols-[1.05fr_0.95fr]">
                <div className="min-h-56 bg-white p-5">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-blue-600">Product UI</p>
                  <h4 className="mt-3 text-2xl font-semibold tracking-normal">
                    {sections[0]?.title || productWindow?.title || "Shape the product"}
                  </h4>
                  <p className="mt-3 text-sm leading-6 text-slate-600">
                    {shortText(sections[0]?.content || productWindow?.screenDescription || "A clean first screen will appear here after the first Think session.", 150)}
                  </p>
                  <div className="mt-5 flex gap-2">
                    <span className="rounded-md bg-blue-600 px-3 py-2 text-xs font-semibold text-white">
                      {productWindow?.primaryCTA || "Start"}
                    </span>
                    <span className="rounded-md border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600">Preview flow</span>
                  </div>
                </div>

                <div className="grid gap-2 bg-slate-100 p-4">
                  {(sections.length ? sections.slice(1, 4) : [
                    { id: "draft-1", title: "Vision", content: "Direction card" },
                    { id: "draft-2", title: "Flow", content: "Founder path" },
                    { id: "draft-3", title: "Next", content: "Build task" },
                  ]).map((section, index) => (
                    <div key={`product-window-page-card-${index}-${section.id}`} className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
                      <div className="mb-2 h-1.5 w-12 rounded-full bg-blue-500/80" />
                      <p className="text-xs font-semibold">{section.title}</p>
                      <p className="mt-1 text-[11px] leading-4 text-slate-500">{shortText(section.content, 70)}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {!sections.length ? (
              <p className="mt-3 text-xs text-slate-500">Draft preview. Start a conversation to generate the Product Window.</p>
            ) : null}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {session ? (
            <Button onClick={() => onRegenerateProductWindow(session)}>
              <Wand2 className="h-4 w-4" />
              Regenerate
            </Button>
          ) : null}
          {productWindow ? (
            <>
              <Button onClick={() => onApproveProductWindow(productWindow)}>
                <CheckCircle2 className="h-4 w-4" />
                Approve
              </Button>
              {session ? (
                <Button variant="primary" onClick={() => onCreateProductWindowBuildTask(session, productWindow)}>
                  <Plus className="h-4 w-4" />
                  Create Build Task
                </Button>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </div>
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
      <p className="font-mono text-[11px] font-semibold uppercase tracking-wide text-emerald-200">Build Next</p>
      <h3 className="mt-2 text-lg font-semibold">{recommendation?.title || "Recommended Build task"}</h3>
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

function Connector({ className }: { className: string }) {
  return <div className={cx("absolute h-px bg-gradient-to-r from-transparent via-blue-300/25 to-transparent", className)} />;
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
    `I shaped this into a product direction: ${result.session.summary}`,
    `I also updated the canvas with Vision, Roadmap, Features, Risks, and a Product Window preview.`,
    taskCount
      ? `I found ${taskCount} possible Build ${taskCount === 1 ? "task" : "tasks"}. You can create ${taskCount === 1 ? "it" : "them"} from the canvas.`
      : "I did not find a Build task yet. Add more detail and I will turn it into agent-ready work.",
    result.productWindow ? "I also created a Product Window preview so you can see the product direction before building." : "",
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

function formatThinkMode(mode: ThinkMode) {
  const labels: Record<ThinkMode, string> = {
    open_thinking: "Open thinking",
    clarify_idea: "Clarify idea",
    define_mvp: "Define MVP",
    create_feature_spec: "Feature spec",
    plan_roadmap: "Roadmap",
    make_decision: "Decision",
    analyze_risk: "Risk",
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
