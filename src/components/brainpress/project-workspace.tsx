"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Eye,
  CheckCircle2,
  Clipboard,
  FileCode2,
  History,
  Layers3,
  ListChecks,
  Plus,
  Save,
  Send,
  ShieldCheck,
  Sparkles,
  Upload,
  Wand2,
  X,
} from "lucide-react";
import { applyVerificationResults, canAbsorbAgentRun, createAgentRun, createVerificationRepairOutcome } from "@/lib/agent-runs";
import { buildCodexCommandPreview } from "@/lib/codex-shared";
import { requiresVerificationSkippedReason } from "@/lib/execution-readiness";
import { nextTaskForInterruptedRun, type CodexRunEvent, type CodexRunState } from "@/lib/run-events";
import {
  agentReadiness,
  analyzeProjectHistory,
  dedupe,
  fieldLines,
  generateAgentPrompt,
  generateOutcomePlan,
  ingestAgentResult,
  linesToText,
  mergeMemoryWithProjectHistory,
  pdfTextExtractionFailureMessage,
  type ProjectHistoryAnalysis,
  memoryCompleteness,
  uid,
  verificationReadiness,
} from "@/lib/brainpress";
import { extractPdfText, formatFileSize } from "@/lib/pdf-intake";
import type {
  AgentPrompt,
  BuildLog,
  Memory,
  MemoryInputType,
  Outcome,
  OutcomeStatus,
  PreferredAgent,
  ProjectImport,
  Project,
  PromptStatus,
  SuggestedOutcome,
  TargetAgent,
  AgentRun,
  VerificationResult,
} from "@/lib/types";
import { summarizeVerificationResults } from "@/lib/verification";
import { AgentRunsTab } from "@/components/brainpress/agent-runs-tab";
import { useBrainpress } from "@/components/brainpress/use-brainpress";
import {
  Button,
  EmptyState,
  FieldLabel,
  Meter,
  Metric,
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

const tabs = ["Overview", "Memory", "Outcomes", "Prompts", "Agent Runs", "Build Logs", "Settings"] as const;
type Tab = (typeof tabs)[number];
type MemoryImportMode = "Paste text" | "Upload PDF";
const rawSourcePreviewLimit = 1_000;
const rawSourceExpandedDisplayLimit = 20_000;

const outcomeStatuses: OutcomeStatus[] = [
  "Draft",
  "Planned",
  "Ready",
  "Running",
  "Needs Fix",
  "Needs Review",
  "Verified",
  "Absorbed",
];

const memoryInputTypes: MemoryInputType[] = ["Chat history", "Agent result", "Research notes", "Repo summary", "Other"];
const targetAgents: TargetAgent[] = ["Codex", "Claude Code", "Generic"];
const preferredAgents: PreferredAgent[] = ["Codex", "Claude Code", "Both"];

interface LiveRunLog {
  stdout: string;
  stderr: string;
  events: CodexRunEvent[];
  message?: string;
}

const memoryFields: Array<{ key: keyof Omit<Memory, "projectId">; title: string }> = [
  { key: "productSummary", title: "Product Summary" },
  { key: "vision", title: "Vision" },
  { key: "targetUsers", title: "Target Users" },
  { key: "currentBuildState", title: "Current Build State" },
  { key: "technicalArchitecture", title: "Technical Architecture" },
  { key: "activeDecisions", title: "Active Decisions" },
  { key: "deprecatedIdeas", title: "Deprecated Ideas" },
  { key: "completedWork", title: "Completed Work" },
  { key: "openQuestions", title: "Open Questions" },
  { key: "knownIssues", title: "Known Issues" },
  { key: "roadmap", title: "Roadmap" },
];

const emptyOutcomeForm = {
  title: "",
  goal: "",
  acceptanceCriteria: "",
  constraints: "",
  verificationCommands: "npm run typecheck\nnpm test\nnpm run build",
  maxIterations: 3,
};

export function ProjectWorkspace({ projectId }: { projectId: string }) {
  const router = useRouter();
  const { state, setState } = useBrainpress();
  const [activeTab, setActiveTab] = useState<Tab>("Overview");
  const [memoryImportMode, setMemoryImportMode] = useState<MemoryImportMode>("Paste text");
  const [importType, setImportType] = useState<MemoryInputType>("Chat history");
  const [importText, setImportText] = useState("");
  const [selectedPdfFile, setSelectedPdfFile] = useState<File | null>(null);
  const [pdfExtractionStatus, setPdfExtractionStatus] = useState("");
  const [pdfExtractionError, setPdfExtractionError] = useState("");
  const [projectHistoryAnalysis, setProjectHistoryAnalysis] = useState<ProjectHistoryAnalysis | null>(null);
  const [viewingImport, setViewingImport] = useState<ProjectImport | null>(null);
  const [analysisWarnings, setAnalysisWarnings] = useState<string[]>([]);
  const [outcomeForm, setOutcomeForm] = useState(emptyOutcomeForm);
  const [targetAgent, setTargetAgent] = useState<TargetAgent>("Codex");
  const [copiedPromptId, setCopiedPromptId] = useState<string | null>(null);
  const [copiedHandoffKey, setCopiedHandoffKey] = useState<string | null>(null);
  const [rawResult, setRawResult] = useState("");
  const [draftLog, setDraftLog] = useState<BuildLog | null>(null);
  const [logOutcomeId, setLogOutcomeId] = useState("");
  const [logAgentRunId, setLogAgentRunId] = useState("");
  const [selectedRunId, setSelectedRunId] = useState("");
  const [selectedRunCommands, setSelectedRunCommands] = useState<Record<string, string[]>>({});
  const [verifyingRunId, setVerifyingRunId] = useState<string | null>(null);
  const [verificationError, setVerificationError] = useState("");
  const [bridgeError, setBridgeError] = useState("");
  const [bridgeBusyId, setBridgeBusyId] = useState<string | null>(null);
  const [streamingRunId, setStreamingRunId] = useState<string | null>(null);
  const [streamStartedAtByRun, setStreamStartedAtByRun] = useState<Record<string, string>>({});
  const [liveLogsByRun, setLiveLogsByRun] = useState<Record<string, LiveRunLog>>({});

  const project = state.projects.find((item) => item.id === projectId);
  const memory = project ? state.memories[project.id] : undefined;
  const outcomes = useMemo(
    () => state.outcomes.filter((outcome) => outcome.projectId === projectId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [projectId, state.outcomes],
  );
  const prompts = useMemo(
    () => state.prompts.filter((prompt) => outcomes.some((outcome) => outcome.id === prompt.outcomeId)),
    [outcomes, state.prompts],
  );
  const buildLogs = useMemo(
    () => state.buildLogs.filter((log) => log.projectId === projectId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [projectId, state.buildLogs],
  );
  const agentRuns = useMemo(
    () => state.agentRuns.filter((run) => run.projectId === projectId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [projectId, state.agentRuns],
  );
  const projectImports = useMemo(
    () => (state.imports || []).filter((source) => source.projectId === projectId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [projectId, state.imports],
  );

  if (!project || !memory) {
    return (
      <main className="min-h-screen bg-mist px-5 py-8 text-ink">
        <div className="mx-auto max-w-3xl">
          <Panel>
            <PanelBody>
              <SectionHeader title="Project not found" eyebrow="Brainpress" />
              <p className="text-slateText">This local workspace does not contain that project. Return to the dashboard and create a new one.</p>
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
  const memoryScore = memoryCompleteness(activeMemory);
  const agentScore = agentReadiness(activeProject, activeMemory, outcomes);
  const verificationScore = verificationReadiness(activeProject, outcomes);
  const currentFocus =
    outcomes.find((outcome) => ["Running", "Ready", "Planned", "Needs Fix"].includes(outcome.status)) || outcomes[0];
  const recommendedOutcome = nextRecommendation(activeMemory, buildLogs);

  function updateProject(patch: Partial<Project>) {
    setState((current) => ({
      ...current,
      projects: current.projects.map((item) => (item.id === activeProject.id ? { ...item, ...patch } : item)),
    }));
  }

  function updateMemory(patch: Partial<Memory>) {
    setState((current) => ({
      ...current,
      memories: {
        ...current.memories,
        [activeProject.id]: {
          ...current.memories[activeProject.id],
          ...patch,
        },
      },
    }));
  }

  function updateOutcome(outcomeId: string, patch: Partial<Outcome>) {
    setState((current) => ({
      ...current,
      outcomes: current.outcomes.map((outcome) => (outcome.id === outcomeId ? { ...outcome, ...patch } : outcome)),
    }));
  }

  function updatePrompt(promptId: string, patch: Partial<AgentPrompt>) {
    setState((current) => ({
      ...current,
      prompts: current.prompts.map((prompt) => (prompt.id === promptId ? { ...prompt, ...patch } : prompt)),
    }));
  }

  function updateAgentRun(runId: string, patch: Partial<AgentRun>) {
    setState((current) => ({
      ...current,
      agentRuns: current.agentRuns.map((run) =>
        run.id === runId ? { ...run, ...patch, updatedAt: new Date().toISOString() } : run,
      ),
    }));
  }

  function runMemoryAnalysis() {
    const analysis = analyzeProjectHistory(importText, {
      project: activeProject,
      currentMemory: activeMemory,
      sourceType: "TextPaste",
      title: `${importType} import`,
      inputType: importType,
    });
    setAnalysisWarnings(analysis.warnings);
    setProjectHistoryAnalysis(analysis);
    setPdfExtractionError("");
  }

  async function extractAndAnalyzePdf() {
    if (!selectedPdfFile) {
      setPdfExtractionError("Choose a text-based PDF before extracting.");
      return;
    }

    setPdfExtractionError("");
    setPdfExtractionStatus("Preparing PDF extraction");
    setProjectHistoryAnalysis(null);
    try {
      const extraction = await extractPdfText(selectedPdfFile, (message) => setPdfExtractionStatus(message));
      setPdfExtractionStatus("Converting PDF into project memory");
      const metadata = {
        project: activeProject,
        currentMemory: activeMemory,
        sourceType: "PDF",
        title: selectedPdfFile.name.replace(/\.pdf$/i, ""),
        fileName: selectedPdfFile.name,
        fileSize: selectedPdfFile.size,
        pageCount: extraction.pageCount,
        extractedPages: extraction.pages,
      } as const;
      const analysis = await analyzeExtractedHistory(extraction.text, metadata);
      setProjectHistoryAnalysis(analysis);
      setAnalysisWarnings(analysis.warnings);
      setPdfExtractionStatus(`Extracted ${extraction.pageCount} page${extraction.pageCount === 1 ? "" : "s"}`);
    } catch (error) {
      setPdfExtractionError(error instanceof Error ? error.message : pdfTextExtractionFailureMessage());
      setPdfExtractionStatus("");
    }
  }

  function saveImportToMemory(updateProductSummary = false) {
    if (!projectHistoryAnalysis) return;
    const mergedMemory = mergeMemoryWithProjectHistory(activeMemory, projectHistoryAnalysis, { updateProductSummary });
    setState((current) => ({
      ...current,
      projects: current.projects.map((item) =>
        item.id === activeProject.id ? { ...item, constraints: projectHistoryAnalysis.projectConstraints } : item,
      ),
      memories: {
        ...current.memories,
        [activeProject.id]: mergedMemory,
      },
      imports: addProjectImportIfMissing(current.imports || [], projectHistoryAnalysis.source),
    }));
    setImportText("");
  }

  function saveImportSourceOnly() {
    if (!projectHistoryAnalysis) return;
    setState((current) => ({
      ...current,
      imports: addProjectImportIfMissing(current.imports || [], projectHistoryAnalysis.source),
    }));
  }

  function discardImportReview() {
    setProjectHistoryAnalysis(null);
    setPdfExtractionError("");
    setPdfExtractionStatus("");
  }

  async function reAnalyzeImport(source: ProjectImport) {
    const metadata = {
      project: activeProject,
      currentMemory: activeMemory,
      sourceType: source.sourceType,
      title: source.title,
      fileName: source.fileName,
      fileSize: source.fileSize,
      pageCount: source.pageCount,
      extractedPages: source.extractedPages,
    } as const;
    const analysis = source.sourceType === "PDF"
      ? await analyzeExtractedHistory(source.extractedText, metadata)
      : analyzeProjectHistory(source.extractedText, metadata);
    setProjectHistoryAnalysis({ ...analysis, source: { ...analysis.source, id: source.id, createdAt: source.createdAt } });
    setAnalysisWarnings(analysis.warnings);
    setViewingImport(null);
  }

  async function analyzeExtractedHistory(
    extractedText: string,
    metadata: Parameters<typeof analyzeProjectHistory>[1],
  ): Promise<ProjectHistoryAnalysis> {
    try {
      const response = await fetch("/api/brainpress/memory/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...metadata,
          extractedText,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as { analysis?: ProjectHistoryAnalysis; error?: string };
      if (response.ok && payload.analysis) return payload.analysis;

      const fallback = analyzeProjectHistory(extractedText, metadata);
      return {
        ...fallback,
        analyzer: "AIUnavailable",
        warnings: [...fallback.warnings, payload.error || "AI analysis unavailable. Local analysis used."],
        source: { ...fallback.source, analyzer: "AIUnavailable" },
      };
    } catch (error) {
      const fallback = analyzeProjectHistory(extractedText, metadata);
      return {
        ...fallback,
        analyzer: "AIUnavailable",
        warnings: [
          ...fallback.warnings,
          error instanceof Error ? `AI analysis unavailable. Local analysis used. ${error.message}` : "AI analysis unavailable. Local analysis used.",
        ],
        source: { ...fallback.source, analyzer: "AIUnavailable" },
      };
    }
  }

  function createOutcomeFromImportSuggestion(suggestion: SuggestedOutcome) {
    const nextOutcome: Outcome = {
      id: uid("outcome"),
      projectId: activeProject.id,
      title: suggestion.title,
      goal: suggestion.goal,
      acceptanceCriteria: suggestion.acceptanceCriteria,
      constraints: suggestion.constraints,
      verificationCommands: suggestion.verificationCommands,
      maxIterations: 2,
      status: "Draft",
      generatedPlan: "",
      generatedPrompt: "",
      createdAt: new Date().toISOString(),
    };

    setState((current) => ({
      ...current,
      outcomes: [nextOutcome, ...current.outcomes],
      imports: projectHistoryAnalysis
        ? addProjectImportIfMissing(current.imports || [], projectHistoryAnalysis.source)
        : current.imports || [],
    }));
    setActiveTab("Outcomes");
  }

  function createOutcomeFromForm() {
    if (!outcomeForm.title.trim()) return;

    const nextOutcome: Outcome = {
      id: uid("outcome"),
      projectId: activeProject.id,
      title: outcomeForm.title.trim(),
      goal: outcomeForm.goal.trim() || "Create a verified product improvement.",
      acceptanceCriteria: fieldLines(outcomeForm.acceptanceCriteria),
      constraints: fieldLines(outcomeForm.constraints),
      verificationCommands: fieldLines(outcomeForm.verificationCommands),
      maxIterations: Number(outcomeForm.maxIterations) || 3,
      status: "Draft",
      generatedPlan: "",
      generatedPrompt: "",
      createdAt: new Date().toISOString(),
    };

    setState((current) => ({
      ...current,
      outcomes: [nextOutcome, ...current.outcomes],
    }));
    setOutcomeForm(emptyOutcomeForm);
  }

  function createRecommendedOutcome() {
    const title = recommendedOutcome || "Define next verified product outcome";
    const nextOutcome: Outcome = {
      id: uid("outcome"),
      projectId: activeProject.id,
      title,
      goal: `Turn "${title}" into a small, verifiable implementation pass.`,
      acceptanceCriteria: ["Scope is clear.", "Implementation path is identified.", "Verification commands are represented."],
      constraints: activeProject.constraints,
      verificationCommands: activeProject.verificationCommands,
      maxIterations: 2,
      status: "Draft",
      generatedPlan: "",
      generatedPrompt: "",
      createdAt: new Date().toISOString(),
    };

    setState((current) => ({
      ...current,
      outcomes: [nextOutcome, ...current.outcomes],
    }));
    setActiveTab("Outcomes");
  }

  function generatePlanFor(outcome: Outcome) {
    const generatedPlan = generateOutcomePlan(activeProject, activeMemory, outcome);
    updateOutcome(outcome.id, {
      generatedPlan,
      status: outcome.status === "Draft" ? "Planned" : outcome.status,
    });
  }

  function generatePromptFor(outcome: Outcome) {
    const plan = outcome.generatedPlan || generateOutcomePlan(activeProject, activeMemory, outcome);
    const promptOutcome = { ...outcome, generatedPlan: plan };
    const prompt = generateAgentPrompt(activeProject, activeMemory, promptOutcome, targetAgent);
    const nextPrompt: AgentPrompt = {
      id: uid("prompt"),
      outcomeId: outcome.id,
      targetAgent,
      prompt,
      status: "Draft",
      createdAt: new Date().toISOString(),
    };

    setState((current) => ({
      ...current,
      outcomes: current.outcomes.map((item) =>
        item.id === outcome.id
          ? {
              ...item,
              generatedPlan: plan,
              generatedPrompt: prompt,
              status: item.status === "Draft" || item.status === "Planned" ? "Ready" : item.status,
            }
          : item,
      ),
      prompts: [nextPrompt, ...current.prompts],
    }));
    setActiveTab("Prompts");
  }

  async function copyPrompt(prompt: AgentPrompt) {
    await navigator.clipboard.writeText(prompt.prompt);
    setCopiedPromptId(prompt.id);
    window.setTimeout(() => setCopiedPromptId(null), 1400);
  }

  async function copyHandoff(key: string, value: string) {
    await navigator.clipboard.writeText(value);
    setCopiedHandoffKey(key);
    window.setTimeout(() => setCopiedHandoffKey(null), 1400);
  }

  function downloadTextFile(filename: string, value: string, mimeType: string) {
    const blob = new Blob([value], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function prepareHandoff(outcome: Outcome, prompt?: AgentPrompt) {
    const run = createAgentRun({
      project: activeProject,
      memory: activeMemory,
      outcome,
      prompt,
      targetAgent: prompt?.targetAgent || targetAgent,
    });

    setState((current) => ({
      ...current,
      agentRuns: [run, ...current.agentRuns],
    }));
    setSelectedRunId(run.id);
    setSelectedRunCommands((current) => ({
      ...current,
      [run.id]: run.verificationCommands,
    }));
    setVerificationError("");
    setActiveTab("Agent Runs");
  }

  function prepareCurrentHandoff() {
    const outcome = currentFocus || outcomes[0];
    if (!outcome) return;
    const prompt = prompts.find((item) => item.outcomeId === outcome.id);
    prepareHandoff(outcome, prompt);
  }

  function toggleRunCommand(runId: string, command: string, checked: boolean) {
    setSelectedRunCommands((current) => {
      const existing = current[runId] || [];
      const next = checked ? [...existing, command] : existing.filter((item) => item !== command);
      return {
        ...current,
        [runId]: Array.from(new Set(next)),
      };
    });
  }

  async function runVerification(run: AgentRun, commands: string[]) {
    setVerificationError("");
    setVerifyingRunId(run.id);
    updateAgentRun(run.id, { status: "VerificationRunning" });

    try {
      const response = await fetch("/api/brainpress/verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          repoPath: run.repoPathOrUrl,
          commands,
          runId: run.id,
        }),
      });
      const payload = (await response.json()) as { results?: VerificationResult[]; error?: string };

      if (!response.ok || !payload.results) {
        setVerificationError(payload.error || "Verification failed before commands could run.");
        updateAgentRun(run.id, { status: "Prepared" });
        return;
      }

      const nextRun = applyVerificationResults(run, payload.results);
      setState((current) => ({
        ...current,
        agentRuns: current.agentRuns.map((item) => (item.id === run.id ? nextRun : item)),
        outcomes: payload.results?.some((result) => result.status === "failed")
          ? addRepairOutcomeIfMissing(
              current.outcomes,
              createVerificationRepairOutcome(activeProject, activeMemory, nextRun),
            )
          : current.outcomes,
      }));
    } catch (error) {
      setVerificationError(error instanceof Error ? error.message : "Verification request failed.");
      updateAgentRun(run.id, { status: "Prepared" });
    } finally {
      setVerifyingRunId(null);
    }
  }

  async function checkCodex(run: AgentRun) {
    setBridgeError("");
    setBridgeBusyId(run.id);
    try {
      const response = await fetch("/api/brainpress/codex/check");
      const payload = (await response.json()) as {
        available: boolean;
        versionText?: string;
        stdout?: string;
        stderr?: string;
        exitCode?: number | null;
      };

      updateAgentRun(run.id, {
        codexAvailable: payload.available,
        codexStdout: payload.stdout || payload.versionText || "",
        codexStderr: payload.stderr || "",
        codexExitCode: typeof payload.exitCode === "number" ? payload.exitCode : null,
        failureReason: payload.available ? undefined : payload.stderr || payload.versionText || "Codex CLI is unavailable.",
      });
      if (!payload.available) setBridgeError("Codex CLI is unavailable. Handoff/export still works.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not check Codex availability.";
      setBridgeError(message);
      updateAgentRun(run.id, { codexAvailable: false, failureReason: message });
    } finally {
      setBridgeBusyId(null);
    }
  }

  async function prepareDiskPackage(run: AgentRun) {
    setBridgeError("");
    setBridgeBusyId(run.id);
    try {
      const response = await fetch("/api/brainpress/agent-runs/prepare-disk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project: activeProject,
          outcome: run.outcomeSnapshot,
          agentRun: run,
        }),
      });
      const payload = (await response.json()) as {
        handoffDirectory?: string;
        promptPath?: string;
        commandPreview?: string;
        error?: string;
      };

      if (!response.ok) {
        setBridgeError(payload.error || "Could not prepare disk package.");
        updateAgentRun(run.id, { failureReason: payload.error || "Could not prepare disk package." });
        return;
      }

      updateAgentRun(run.id, {
        executionMode: "CodexLocal",
        status: "ReadyToRun",
        handoffDirectory: payload.handoffDirectory || run.handoffDirectory,
        promptPath: payload.promptPath || localPromptPath({ ...run, handoffDirectory: payload.handoffDirectory || run.handoffDirectory }),
        diskPackagePrepared: true,
        codexCommandPreview: payload.commandPreview || buildCodexCommandPreview(run.id),
        failureReason: undefined,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not prepare disk package.";
      setBridgeError(message);
      updateAgentRun(run.id, { failureReason: message });
    } finally {
      setBridgeBusyId(null);
    }
  }

  async function runGitPreflight(run: AgentRun) {
    setBridgeError("");
    setBridgeBusyId(run.id);
    try {
      const response = await fetch("/api/brainpress/git/preflight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoPath: run.repoPathOrUrl }),
      });
      const payload = (await response.json()) as {
        isGitRepo?: boolean;
        branch?: string;
        statusShort?: string;
        isClean?: boolean;
        warnings?: string[];
        error?: string;
      };

      if (!response.ok) {
        setBridgeError(payload.error || "Git preflight failed.");
        updateAgentRun(run.id, { failureReason: payload.error || "Git preflight failed." });
        return;
      }

      const warningText = payload.warnings?.join(" ") || "";
      updateAgentRun(run.id, {
        isGitRepo: Boolean(payload.isGitRepo),
        gitBranch: payload.branch || "",
        gitIsClean: typeof payload.isClean === "boolean" ? payload.isClean : null,
        gitStatusChecked: true,
        gitPreflightWarnings: payload.warnings || [],
        gitStatusBefore: payload.statusShort || "",
        failureReason: warningText || undefined,
      });
      if (warningText) setBridgeError(warningText);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Git preflight failed.";
      setBridgeError(message);
      updateAgentRun(run.id, { failureReason: message });
    } finally {
      setBridgeBusyId(null);
    }
  }

  async function approveAndRunCodex(run: AgentRun, options: { protectedBranchConfirmed?: boolean } = {}) {
    setBridgeError("");
    setBridgeBusyId(run.id);
    setStreamingRunId(run.id);
    const startedAt = new Date().toISOString();
    setStreamStartedAtByRun((current) => ({ ...current, [run.id]: startedAt }));
    setLiveLogsByRun((current) => ({ ...current, [run.id]: { stdout: "", stderr: "", events: [] } }));
    updateAgentRun(run.id, {
      approvalState: "Approved",
      status: "RunningCodex",
      executionMode: "CodexLocal",
      codexStdout: "",
      codexStderr: "",
      codexExitCode: null,
      codexDurationMs: null,
      codexTimedOut: false,
      codexCancelled: false,
      codexStartedAt: startedAt,
      codexEndedAt: undefined,
      failureReason: undefined,
    });

    try {
      const promptPath = localPromptPath(run);
      const response = await fetch("/api/brainpress/codex/run-stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repoPath: run.repoPathOrUrl,
          runId: run.id,
          promptPath,
          approvalConfirmed: true,
          protectedBranchConfirmed: Boolean(options.protectedBranchConfirmed),
          runStatus: run.status,
        }),
      });

      if (!response.ok || !response.body) {
        const payload = (await response.json().catch(() => ({}))) as {
          error?: string;
          codexAvailable?: boolean;
          codexStdout?: string;
          codexStderr?: string;
          codexExitCode?: number;
        };
        const message = payload.error || "Codex run failed before completion.";
        setBridgeError(message);
        updateAgentRun(run.id, {
          status: "CodexFailed",
          codexAvailable: payload.codexAvailable === false ? false : run.codexAvailable,
          codexStdout: payload.codexStdout || "",
          codexStderr: payload.codexStderr || "",
          codexExitCode: typeof payload.codexExitCode === "number" ? payload.codexExitCode : null,
          codexEndedAt: new Date().toISOString(),
          failureReason: message,
        });
        return;
      }

      await readCodexEventStream(run.id, response.body);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Codex run failed.";
      setBridgeError(message);
      updateAgentRun(run.id, { status: "CodexFailed", codexEndedAt: new Date().toISOString(), failureReason: message });
    } finally {
      setBridgeBusyId(null);
      setStreamingRunId(null);
    }
  }

  async function cancelCodexRun(run: AgentRun) {
    setBridgeError("");
    try {
      const response = await fetch("/api/brainpress/codex/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoPath: run.repoPathOrUrl, runId: run.id }),
      });
      const payload = (await response.json()) as { cancelled?: boolean; message?: string; error?: string };
      if (!response.ok) {
        setBridgeError(payload.error || "Cancel request failed.");
        return;
      }
      setBridgeError(payload.message || "Cancel request sent.");
    } catch (error) {
      setBridgeError(error instanceof Error ? error.message : "Cancel request failed.");
    }
  }

  async function loadPersistedRunLogs(run: AgentRun) {
    setBridgeError("");
    setBridgeBusyId(run.id);
    try {
      const params = new URLSearchParams({ repoPath: run.repoPathOrUrl, runId: run.id });
      const response = await fetch(`/api/brainpress/agent-runs/logs?${params.toString()}`);
      const payload = (await response.json()) as {
        stdout?: string;
        stderr?: string;
        events?: CodexRunEvent[];
        runState?: CodexRunState | null;
        message?: string;
        error?: string;
      };
      if (!response.ok) {
        setBridgeError(payload.error || "Could not load persisted logs.");
        return;
      }

      setLiveLogsByRun((current) => ({
        ...current,
        [run.id]: {
          stdout: payload.stdout || "",
          stderr: payload.stderr || "",
          events: payload.events || [],
          message: payload.message,
        },
      }));

      if (payload.runState) {
        updateAgentRun(run.id, {
          status: payload.runState.status,
          codexStdout: payload.stdout || run.codexStdout,
          codexStderr: payload.stderr || run.codexStderr,
          codexExitCode: payload.runState.exitCode,
          codexDurationMs: payload.runState.durationMs,
          codexTimedOut: payload.runState.timedOut,
          codexCancelled: payload.runState.cancelled,
          codexStartedAt: payload.runState.startedAt,
          codexEndedAt: payload.runState.endedAt,
          gitStatusBefore: payload.runState.gitStatusBefore,
          gitStatusAfter: payload.runState.gitStatusAfter,
          gitDiffStat: payload.runState.gitDiffStat,
          gitDiffPreviewLength: payload.runState.diffPreviewMetadata.length,
          gitDiffPreviewTruncated: payload.runState.diffPreviewMetadata.truncated,
          changedFilesSummary: payload.runState.diffPreviewMetadata.changedFiles,
          requiresDiffReview: ["DiffReviewRequired", "Cancelled", "TimedOut"].includes(payload.runState.status),
        });
      }
      if (payload.message) setBridgeError(payload.message);
    } catch (error) {
      setBridgeError(error instanceof Error ? error.message : "Could not load persisted logs.");
    } finally {
      setBridgeBusyId(null);
    }
  }

  async function readCodexEventStream(runId: string, body: ReadableStream<Uint8Array>) {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const chunks = buffer.split("\n\n");
      buffer = chunks.pop() || "";
      chunks.forEach((chunk) => processCodexSseChunk(runId, chunk));
    }

    if (buffer.trim()) processCodexSseChunk(runId, buffer);
  }

  function processCodexSseChunk(runId: string, chunk: string) {
    const data = chunk
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.replace(/^data:\s?/, ""))
      .join("\n");
    if (!data) return;

    try {
      const event = JSON.parse(data) as CodexRunEvent;
      setLiveLogsByRun((current) => {
        const existing = current[runId] || { stdout: "", stderr: "", events: [] };
        const text = typeof event.payload.text === "string" ? event.payload.text : "";
        return {
          ...current,
          [runId]: {
            ...existing,
            stdout: event.type === "stdout" ? `${existing.stdout}${text}` : existing.stdout,
            stderr: event.type === "stderr" ? `${existing.stderr}${text}` : existing.stderr,
            events: [...existing.events, event],
          },
        };
      });

      if (["run_completed", "run_failed", "run_cancelled", "run_timed_out"].includes(event.type)) {
        const payload = event.payload as {
          status?: AgentRun["status"];
          codexStdout?: string;
          codexStderr?: string;
          codexExitCode?: number;
          codexDurationMs?: number;
          codexTimedOut?: boolean;
          codexCancelled?: boolean;
          gitStatusBefore?: string;
          gitStatusAfter?: string;
          gitDiffStat?: string;
          gitDiffTextPreview?: string;
          gitDiffPreviewLength?: number;
          gitDiffPreviewTruncated?: boolean;
          changedFilesSummary?: string[];
          requiresDiffReview?: boolean;
          failureReason?: string;
          runState?: CodexRunState;
        };
        updateAgentRun(runId, {
          status: payload.status || (payload.codexExitCode === 0 ? "DiffReviewRequired" : "CodexFailed"),
          codexAvailable: true,
          codexExitCode: payload.codexExitCode ?? null,
          codexStdout: payload.codexStdout || "",
          codexStderr: payload.codexStderr || "",
          codexDurationMs: payload.codexDurationMs ?? null,
          codexTimedOut: Boolean(payload.codexTimedOut),
          codexCancelled: Boolean(payload.codexCancelled),
          codexStartedAt: payload.runState?.startedAt,
          codexEndedAt: payload.runState?.endedAt || new Date().toISOString(),
          gitStatusBefore: payload.gitStatusBefore || "",
          gitStatusAfter: payload.gitStatusAfter || "",
          gitDiffStat: payload.gitDiffStat || "",
          gitDiffTextPreview: payload.gitDiffTextPreview || "",
          gitDiffPreviewLength: payload.gitDiffPreviewLength || (payload.gitDiffTextPreview || "").length,
          gitDiffPreviewTruncated: Boolean(payload.gitDiffPreviewTruncated),
          changedFilesSummary: payload.changedFilesSummary || [],
          requiresDiffReview: true,
          failureReason: payload.status === "DiffReviewRequired" ? undefined : payload.failureReason,
        });
      }
    } catch {
      setBridgeError("Brainpress received a malformed Codex stream event. Persisted logs may still be available from disk.");
    }
  }

  function markDiffReviewed(run: AgentRun) {
    updateAgentRun(run.id, {
      diffReviewedAt: new Date().toISOString(),
      status: run.codexExitCode === 0 ? "CodexCompleted" : run.status,
    });
  }

  function absorbRunResult(run: AgentRun, skippedVerificationReason: string) {
    if (!canAbsorbAgentRun(run)) {
      setBridgeError("Review the diff before absorbing this AgentRun.");
      return;
    }
    if (requiresVerificationSkippedReason(run) && !skippedVerificationReason.trim()) {
      setBridgeError("Add a reason for skipping successful verification before absorbing.");
      return;
    }

    const log = ingestAgentResult(activeProject.id, run.outcomeId, codexResultText(run), {
      linkedAgentRunId: run.id,
      verificationResults: run.verificationResults,
      skippedVerificationReason: skippedVerificationReason.trim() || undefined,
    });
    setState((current) => ({
      ...current,
      buildLogs: [log, ...current.buildLogs],
      outcomes: current.outcomes.map((outcome) =>
        outcome.id === run.outcomeId ? { ...outcome, status: log.verificationStatus === "Passing" ? "Verified" : "Needs Review" } : outcome,
      ),
      agentRuns: current.agentRuns.map((item) =>
        item.id === run.id
          ? { ...item, status: "Absorbed", absorbedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
          : item,
      ),
      memories: {
        ...current.memories,
        [activeProject.id]: {
          ...current.memories[activeProject.id],
          completedWork: appendLines(current.memories[activeProject.id].completedWork, log.completedChanges),
          knownIssues: appendLines(current.memories[activeProject.id].knownIssues, log.newIssues),
          activeDecisions: appendLines(current.memories[activeProject.id].activeDecisions, log.decisionsExtracted),
          roadmap: appendLines(current.memories[activeProject.id].roadmap, log.nextOutcomes),
        },
      },
    }));
  }

  function beginRunResultIngest(run: AgentRun) {
    setLogAgentRunId(run.id);
    setLogOutcomeId(run.outcomeId);
    if (run.codexStdout || run.codexStderr || run.gitDiffStat) {
      setRawResult(codexResultText(run));
    }
    setActiveTab("Build Logs");
  }

  function ingestResult() {
    if (!rawResult.trim()) return;
    const linkedRun = agentRuns.find((run) => run.id === logAgentRunId);
    setDraftLog(
      ingestAgentResult(activeProject.id, logOutcomeId || linkedRun?.outcomeId || undefined, rawResult, {
        linkedAgentRunId: linkedRun?.id,
        verificationResults: linkedRun?.verificationResults || [],
      }),
    );
  }

  function saveBuildLog() {
    if (!draftLog) return;
    const outcomeStatus: Partial<Outcome> =
      draftLog.verificationStatus === "Passing"
        ? { status: "Verified" }
        : draftLog.verificationStatus === "Failing" || draftLog.verificationStatus === "Mixed"
          ? { status: "Needs Fix" }
          : { status: "Needs Review" };

    setState((current) => ({
      ...current,
      buildLogs: [draftLog, ...current.buildLogs],
      outcomes: current.outcomes.map((outcome) =>
        outcome.id === draftLog.outcomeId ? { ...outcome, ...outcomeStatus } : outcome,
      ),
      agentRuns: current.agentRuns.map((run) =>
        run.id === draftLog.linkedAgentRunId ? { ...run, status: "Result Ingested", updatedAt: new Date().toISOString() } : run,
      ),
      memories: {
        ...current.memories,
        [activeProject.id]: {
          ...current.memories[activeProject.id],
          completedWork: appendLines(current.memories[activeProject.id].completedWork, draftLog.completedChanges),
          knownIssues: appendLines(current.memories[activeProject.id].knownIssues, draftLog.newIssues),
          activeDecisions: appendLines(current.memories[activeProject.id].activeDecisions, draftLog.decisionsExtracted),
          roadmap: appendLines(current.memories[activeProject.id].roadmap, draftLog.nextOutcomes),
        },
      },
    }));
    setRawResult("");
    setDraftLog(null);
  }

  return (
    <main className="min-h-screen bg-mist text-ink">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-5 py-6 sm:px-8 lg:px-10">
        <header className="border-b border-line pb-5">
          <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <Link href="/" className="flex h-9 w-9 items-center justify-center rounded-md border border-line bg-white text-slateText hover:text-electric">
                <ArrowLeft className="h-4 w-4" />
              </Link>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-semibold text-ink">{project.name}</h1>
                  <span className="rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700">
                    {project.preferredAgent}
                  </span>
                </div>
                <p className="mt-1 max-w-3xl text-sm leading-6 text-slateText">{project.primaryGoal}</p>
              </div>
            </div>
            <Button variant="primary" onClick={createRecommendedOutcome}>
              <Sparkles className="h-4 w-4" />
              Next Outcome
            </Button>
          </div>

          <nav className="flex gap-1 overflow-x-auto rounded-lg border border-line bg-white p-1">
            {tabs.map((tab) => (
              <button
                key={tab}
                className={cx(
                  "h-9 shrink-0 rounded-md px-3 text-sm font-medium transition",
                  activeTab === tab ? "bg-ink text-white" : "text-slateText hover:bg-slate-100 hover:text-ink",
                )}
                onClick={() => setActiveTab(tab)}
              >
                {tab}
              </button>
            ))}
          </nav>
        </header>

        {activeTab === "Overview" ? (
          <OverviewTab
            project={project}
            currentFocus={currentFocus}
            recommendedOutcome={recommendedOutcome}
            outcomes={outcomes}
            buildLogs={buildLogs}
            agentRuns={agentRuns}
            memoryScore={memoryScore}
            agentScore={agentScore}
            verificationScore={verificationScore}
            onCreateRecommendedOutcome={createRecommendedOutcome}
            onGeneratePlan={generatePlanFor}
            onGeneratePrompt={generatePromptFor}
            onPrepareHandoff={prepareCurrentHandoff}
          />
        ) : null}

        {activeTab === "Memory" ? (
          <MemoryTab
            project={activeProject}
            memory={activeMemory}
            imports={projectImports}
            importMode={memoryImportMode}
            importText={importText}
            importType={importType}
            selectedPdfFile={selectedPdfFile}
            pdfExtractionStatus={pdfExtractionStatus}
            pdfExtractionError={pdfExtractionError}
            analysis={projectHistoryAnalysis}
            viewingImport={viewingImport}
            warnings={analysisWarnings}
            onImportModeChange={setMemoryImportMode}
            onImportTextChange={setImportText}
            onImportTypeChange={setImportType}
            onPdfFileChange={setSelectedPdfFile}
            onAnalyze={runMemoryAnalysis}
            onExtractPdf={extractAndAnalyzePdf}
            onSaveToMemory={saveImportToMemory}
            onSaveSourceOnly={saveImportSourceOnly}
            onCreateOutcomeFromSuggestion={createOutcomeFromImportSuggestion}
            onDiscardReview={discardImportReview}
            onViewImport={setViewingImport}
            onReAnalyzeImport={reAnalyzeImport}
            onMemoryChange={updateMemory}
          />
        ) : null}

        {activeTab === "Outcomes" ? (
          <OutcomesTab
            outcomes={outcomes}
            outcomeForm={outcomeForm}
            targetAgent={targetAgent}
            onTargetAgentChange={setTargetAgent}
            onOutcomeFormChange={setOutcomeForm}
            onCreateOutcome={createOutcomeFromForm}
            onUpdateOutcome={updateOutcome}
            onGeneratePlan={generatePlanFor}
            onGeneratePrompt={generatePromptFor}
            onPrepareHandoff={prepareHandoff}
          />
        ) : null}

        {activeTab === "Prompts" ? (
          <PromptsTab
            prompts={prompts}
            outcomes={outcomes}
            copiedPromptId={copiedPromptId}
            onCopyPrompt={copyPrompt}
            onUpdatePrompt={updatePrompt}
            onPrepareHandoff={(prompt) => {
              const outcome = outcomes.find((item) => item.id === prompt.outcomeId);
              if (outcome) prepareHandoff(outcome, prompt);
            }}
          />
        ) : null}

        {activeTab === "Agent Runs" ? (
          <AgentRunsTab
            project={activeProject}
            outcomes={outcomes}
            agentRuns={agentRuns}
            selectedRunId={selectedRunId}
            selectedCommands={
              selectedRunCommands[selectedRunId || agentRuns[0]?.id || ""] ||
              agentRuns.find((run) => run.id === selectedRunId)?.verificationCommands ||
              agentRuns[0]?.verificationCommands ||
              []
            }
            copiedKey={copiedHandoffKey}
            verifyingRunId={verifyingRunId}
            verificationError={verificationError}
            bridgeError={bridgeError}
            bridgeBusyId={bridgeBusyId}
            streamingRunId={streamingRunId}
            streamStartedAtByRun={streamStartedAtByRun}
            liveLogsByRun={liveLogsByRun}
            onSelectRun={(runId) => {
              setSelectedRunId(runId);
              const run = agentRuns.find((item) => item.id === runId);
              if (run && !selectedRunCommands[runId]) {
                setSelectedRunCommands((current) => ({ ...current, [runId]: run.verificationCommands }));
              }
            }}
            onPrepareHandoff={prepareCurrentHandoff}
            onToggleCommand={(command, checked) => {
              const runId = selectedRunId || agentRuns[0]?.id || "";
              if (runId) toggleRunCommand(runId, command, checked);
            }}
            onRunVerification={runVerification}
            onCheckCodex={checkCodex}
            onPrepareDiskPackage={prepareDiskPackage}
            onGitPreflight={runGitPreflight}
            onRunCodex={approveAndRunCodex}
            onCancelRun={cancelCodexRun}
            onLoadLogs={loadPersistedRunLogs}
            onMarkDiffReviewed={markDiffReviewed}
            onAbsorbResult={absorbRunResult}
            onCopy={copyHandoff}
            onDownload={downloadTextFile}
            onIngestResult={beginRunResultIngest}
          />
        ) : null}

        {activeTab === "Build Logs" ? (
          <BuildLogsTab
            outcomes={outcomes}
            agentRuns={agentRuns}
            buildLogs={buildLogs}
            rawResult={rawResult}
            logOutcomeId={logOutcomeId}
            logAgentRunId={logAgentRunId}
            draftLog={draftLog}
            onRawResultChange={setRawResult}
            onLogOutcomeChange={setLogOutcomeId}
            onLogAgentRunChange={(runId) => {
              setLogAgentRunId(runId);
              const run = agentRuns.find((item) => item.id === runId);
              if (run) setLogOutcomeId(run.outcomeId);
            }}
            onIngest={ingestResult}
            onSave={saveBuildLog}
          />
        ) : null}

        {activeTab === "Settings" ? (
          <SettingsTab project={project} onUpdateProject={updateProject} />
        ) : null}
      </div>
    </main>
  );
}

function OverviewTab({
  project,
  currentFocus,
  recommendedOutcome,
  outcomes,
  buildLogs,
  agentRuns,
  memoryScore,
  agentScore,
  verificationScore,
  onCreateRecommendedOutcome,
  onGeneratePlan,
  onGeneratePrompt,
  onPrepareHandoff,
}: {
  project: Project;
  currentFocus?: Outcome;
  recommendedOutcome: string;
  outcomes: Outcome[];
  buildLogs: BuildLog[];
  agentRuns: AgentRun[];
  memoryScore: number;
  agentScore: number;
  verificationScore: number;
  onCreateRecommendedOutcome: () => void;
  onGeneratePlan: (outcome: Outcome) => void;
  onGeneratePrompt: (outcome: Outcome) => void;
  onPrepareHandoff: () => void;
}) {
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(340px,0.9fr)]">
      <div className="flex flex-col gap-5">
        <Panel>
          <PanelBody>
            <SectionHeader title="Current Focus" eyebrow="Outcome" />
            {currentFocus ? (
              <div className="space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-xl font-semibold text-ink">{currentFocus.title}</p>
                    <p className="mt-2 text-sm leading-6 text-slateText">{currentFocus.goal}</p>
                  </div>
                  <StatusPill value={currentFocus.status} />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => onGeneratePlan(currentFocus)}>
                    <ListChecks className="h-4 w-4" />
                    Generate Plan
                  </Button>
                  <Button variant="primary" onClick={() => onGeneratePrompt(currentFocus)}>
                    <Wand2 className="h-4 w-4" />
                    Generate Prompt
                  </Button>
                  <Button onClick={onPrepareHandoff}>
                    <Send className="h-4 w-4" />
                    Prepare Handoff
                  </Button>
                </div>
              </div>
            ) : (
              <EmptyState title="No focus outcome" detail="Create the next outcome to start an agent-ready pass." />
            )}
          </PanelBody>
        </Panel>

        <Panel>
          <PanelBody>
            <SectionHeader
              title="Next Recommended Outcome"
              eyebrow="Loop"
              action={
                <Button variant="primary" onClick={onCreateRecommendedOutcome}>
                  <Plus className="h-4 w-4" />
                  Create
                </Button>
              }
            />
            <p className="rounded-lg border border-line bg-white p-4 text-sm leading-6 text-slateText">{recommendedOutcome}</p>
          </PanelBody>
        </Panel>

        <Panel>
          <PanelBody>
            <SectionHeader title="Recent Outcomes" eyebrow="Progress" />
            <OutcomeList outcomes={outcomes.slice(0, 4)} />
          </PanelBody>
        </Panel>
      </div>

      <div className="flex flex-col gap-5">
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
          <ReadinessCard title="Memory Completeness" score={memoryScore} icon={<Layers3 className="h-4 w-4" />} />
          <ReadinessCard title="Agent Readiness" score={agentScore} icon={<Send className="h-4 w-4" />} />
          <ReadinessCard title="Verification Readiness" score={verificationScore} icon={<ShieldCheck className="h-4 w-4" />} />
        </div>

        <Panel>
          <PanelBody>
            <SectionHeader title="Recent Build Logs" eyebrow="Logs" />
            {buildLogs.length ? (
              <div className="space-y-3">
                {buildLogs.slice(0, 3).map((log) => (
                  <div key={log.id} className="rounded-lg border border-line bg-white p-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <StatusPill value={log.verificationStatus} />
                      <span className="text-xs text-slate-500">{new Date(log.createdAt).toLocaleString()}</span>
                    </div>
                    <p className="text-sm leading-6 text-slateText">{log.summary}</p>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState title="No build logs" detail={`Paste an agent result after working on ${project.name}.`} />
            )}
          </PanelBody>
        </Panel>

        <Panel>
          <PanelBody>
            <SectionHeader title="Recent Agent Runs" eyebrow="Handoffs" />
            {agentRuns.length ? (
              <div className="space-y-3">
                {agentRuns.slice(0, 3).map((run) => (
                  <div key={run.id} className="rounded-lg border border-line bg-white p-4">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
                      <StatusPill value={run.status} />
                      <span className="text-xs text-slate-500">{run.targetAgent}</span>
                    </div>
                    <p className="text-sm leading-6 text-slateText">{summarizeVerificationResults(run.verificationResults)}</p>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState title="No handoffs prepared" detail="Prepare a handoff to freeze prompt, context, outcome, and verification commands." />
            )}
          </PanelBody>
        </Panel>
      </div>
    </div>
  );
}

function MemoryTab({
  project,
  memory,
  imports,
  importMode,
  importText,
  importType,
  selectedPdfFile,
  pdfExtractionStatus,
  pdfExtractionError,
  analysis,
  viewingImport,
  warnings,
  onImportModeChange,
  onImportTextChange,
  onImportTypeChange,
  onPdfFileChange,
  onAnalyze,
  onExtractPdf,
  onSaveToMemory,
  onSaveSourceOnly,
  onCreateOutcomeFromSuggestion,
  onDiscardReview,
  onViewImport,
  onReAnalyzeImport,
  onMemoryChange,
}: {
  project: Project;
  memory: Memory;
  imports: ProjectImport[];
  importMode: MemoryImportMode;
  importText: string;
  importType: MemoryInputType;
  selectedPdfFile: File | null;
  pdfExtractionStatus: string;
  pdfExtractionError: string;
  analysis: ProjectHistoryAnalysis | null;
  viewingImport: ProjectImport | null;
  warnings: string[];
  onImportModeChange: (value: MemoryImportMode) => void;
  onImportTextChange: (value: string) => void;
  onImportTypeChange: (value: MemoryInputType) => void;
  onPdfFileChange: (file: File | null) => void;
  onAnalyze: () => void;
  onExtractPdf: () => void;
  onSaveToMemory: (updateProductSummary?: boolean) => void;
  onSaveSourceOnly: () => void;
  onCreateOutcomeFromSuggestion: (suggestion: SuggestedOutcome) => void;
  onDiscardReview: () => void;
  onViewImport: (source: ProjectImport | null) => void;
  onReAnalyzeImport: (source: ProjectImport) => void;
  onMemoryChange: (patch: Partial<Memory>) => void;
}) {
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(320px,0.85fr)_minmax(0,1.15fr)]">
      <div className="flex flex-col gap-5">
        <Panel>
          <PanelBody>
            <SectionHeader title="Import Project History" eyebrow="Memory" />
            <div className="mb-4 grid grid-cols-2 gap-2 rounded-lg border border-line bg-white p-1">
              {(["Paste text", "Upload PDF"] as MemoryImportMode[]).map((mode) => (
                <button
                  key={mode}
                  className={cx(
                    "h-9 rounded-md text-sm font-medium transition",
                    importMode === mode ? "bg-ink text-white" : "text-slateText hover:bg-slate-100 hover:text-ink",
                  )}
                  onClick={() => onImportModeChange(mode)}
                >
                  {mode}
                </button>
              ))}
            </div>

            {importMode === "Paste text" ? (
              <div className="space-y-4">
                <div>
                  <FieldLabel>Input type</FieldLabel>
                  <Select className="mt-2" value={importType} onChange={(event) => onImportTypeChange(event.target.value as MemoryInputType)}>
                    {memoryInputTypes.map((type) => (
                      <option key={type}>{type}</option>
                    ))}
                  </Select>
                </div>
                <div>
                  <FieldLabel>Raw context</FieldLabel>
                  <TextArea
                    className="mt-2 min-h-72 font-mono text-xs"
                    value={importText}
                    placeholder="Paste chat history, agent result, research notes, repo summary, or any other project context."
                    onChange={(event) => onImportTextChange(event.target.value)}
                  />
                </div>
                <Button variant="primary" className="w-full" onClick={onAnalyze} disabled={!importText.trim()}>
                  <Wand2 className="h-4 w-4" />
                  Analyze & Organize
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <label className="flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-line bg-white p-5 text-center transition hover:border-electric/50 hover:bg-blue-50/30">
                  <Upload className="mb-3 h-6 w-6 text-electric" />
                  <span className="font-medium text-ink">Choose a text-based PDF</span>
                  <span className="mt-1 text-sm leading-6 text-slateText">ChatGPT exports, specs, memos, meeting notes, research, or agent results.</span>
                  <input
                    className="sr-only"
                    type="file"
                    accept="application/pdf,.pdf"
                    onChange={(event) => onPdfFileChange(event.target.files?.[0] || null)}
                  />
                </label>
                {selectedPdfFile ? (
                  <div className="rounded-lg border border-line bg-white p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-ink">{selectedPdfFile.name}</p>
                        <p className="mt-1 font-mono text-xs text-slate-500">{formatFileSize(selectedPdfFile.size)}</p>
                      </div>
                      <Button variant="ghost" onClick={() => onPdfFileChange(null)}>
                        <X className="h-4 w-4" />
                        Clear
                      </Button>
                    </div>
                    {pdfExtractionStatus ? <p className="mt-3 text-sm text-slateText">{pdfExtractionStatus}</p> : null}
                  </div>
                ) : null}
                <Button variant="primary" className="w-full" onClick={onExtractPdf} disabled={!selectedPdfFile}>
                  <Wand2 className="h-4 w-4" />
                  Extract & Analyze PDF
                </Button>
                {pdfExtractionError ? (
                  <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm leading-6 text-rose-800">
                    {pdfExtractionError}
                  </div>
                ) : null}
              </div>
            )}

            {warnings.length ? (
              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-800">
                {warnings.map((warning) => (
                  <p key={warning}>{warning}</p>
                ))}
              </div>
            ) : null}
          </PanelBody>
        </Panel>

        {analysis ? (
          <PdfImportReview
            project={project}
            memory={memory}
            analysis={analysis}
            onSaveToMemory={onSaveToMemory}
            onSaveSourceOnly={onSaveSourceOnly}
            onCreateOutcomeFromSuggestion={onCreateOutcomeFromSuggestion}
            onDiscardReview={onDiscardReview}
          />
        ) : null}

        <ImportsPanel
          imports={imports}
          viewingImport={viewingImport}
          onViewImport={onViewImport}
          onReAnalyzeImport={onReAnalyzeImport}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {memoryFields.map((field) => (
          <Panel key={field.key}>
            <PanelBody>
              <FieldLabel>{field.title}</FieldLabel>
              <TextArea
                className="mt-3 min-h-44"
                value={memory[field.key]}
                onChange={(event) => onMemoryChange({ [field.key]: event.target.value })}
              />
            </PanelBody>
          </Panel>
        ))}
      </div>
    </div>
  );
}

function PdfImportReview({
  memory,
  analysis,
  onSaveToMemory,
  onSaveSourceOnly,
  onCreateOutcomeFromSuggestion,
  onDiscardReview,
}: {
  project: Project;
  memory: Memory;
  analysis: ProjectHistoryAnalysis;
  onSaveToMemory: (updateProductSummary?: boolean) => void;
  onSaveSourceOnly: () => void;
  onCreateOutcomeFromSuggestion: (suggestion: SuggestedOutcome) => void;
  onDiscardReview: () => void;
}) {
  const source = analysis.source;
  const sourceLabel = source.sourceType === "PDF" ? "PDF Import Review" : "Text Import Review";
  const firstSuggestion = analysis.suggestedOutcomes[0];

  return (
    <Panel>
      <PanelBody>
        <SectionHeader
          title={sourceLabel}
          eyebrow="SOURCE"
          action={
            <div className="flex flex-wrap gap-2">
              <Button onClick={onSaveSourceOnly}>
                <Save className="h-4 w-4" />
                Save as Source Only
              </Button>
              <Button variant="primary" onClick={() => onSaveToMemory(false)}>
                <CheckCircle2 className="h-4 w-4" />
                Save to Memory
              </Button>
            </div>
          }
        />

        <div className="mb-4 grid gap-3 md:grid-cols-3">
          <ImportMetaLine label="Source title" value={source.title} />
          <ImportMetaLine label="File name" value={source.fileName || "Text paste"} />
          <ImportMetaLine label="Pages" value={source.pageCount ? String(source.pageCount) : "n/a"} />
        </div>

        <div className="mb-4 flex flex-col gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-900 sm:flex-row sm:items-center sm:justify-between">
          <span>
            Brainpress extracted the {source.sourceType === "PDF" ? "PDF" : "source"} and converted it into structured project memory.
            Review the analysis below before saving.
          </span>
          <AnalyzerBadge value={analysis.analyzer} />
        </div>

        <FounderReviewCard analysis={analysis} nextOutcome={firstSuggestion} />

        <div className="mb-4 rounded-lg border border-line bg-white p-4">
          <p className="mb-3 text-sm font-medium text-ink">Analysis Summary</p>
          <ul className="space-y-2 text-sm leading-6 text-slateText">
            {(analysis.analysisBullets.length ? analysis.analysisBullets : [analysis.analysisSummary]).map((item) => (
              <li key={item} className="flex gap-2">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-electric" />
                <span>{item.replace(/^[-*]\s*/, "")}</span>
              </li>
            ))}
          </ul>
          {analysis.detectedThemes.length ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {analysis.detectedThemes.map((theme) => (
                <span key={theme} className="rounded-md border border-blue-200 bg-blue-50 px-2 py-1 font-mono text-xs text-blue-700">
                  {theme}
                </span>
              ))}
            </div>
          ) : null}
        </div>

        <div className="mb-4 grid gap-3 md:grid-cols-2">
          <ImportSection title="Product Summary" value={analysis.memorySections.productSummary} />
          <ImportSection title="Key Facts" value={analysis.keyFacts} />
          <ImportSection title="Active Decisions" value={analysis.memorySections.activeDecisions} />
          <ImportSection title="Completed Work" value={analysis.memorySections.completedWork} />
          <ImportSection title="Known Issues" value={analysis.memorySections.knownIssues} />
          <ImportSection title="Open Questions" value={analysis.memorySections.openQuestions} />
          <ImportSection title="Roadmap / Next Steps" value={analysis.memorySections.roadmap} />
          <ImportSection title="Current Build State" value={analysis.memorySections.currentBuildState} />
          <ImportSection title="Technical Architecture" value={analysis.memorySections.technicalArchitecture} />
        </div>

        <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-900">
          <p className="font-medium">Memory merge behavior</p>
          <p>
            Save to Memory appends decisions, completed work, issues, roadmap, and architecture signals with deduplication.
            Product Summary stays unchanged unless it is currently empty.
          </p>
          {memory.productSummary.trim() ? (
            <Button className="mt-3" onClick={() => onSaveToMemory(true)}>
              <Save className="h-4 w-4" />
              Save + Update Summary
            </Button>
          ) : null}
        </div>

        <div className="rounded-lg border border-line bg-white p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <FieldLabel>Suggested Outcomes</FieldLabel>
            <div className="flex flex-wrap gap-2">
              {firstSuggestion ? (
                <Button onClick={() => onCreateOutcomeFromSuggestion(firstSuggestion)}>
                  <Plus className="h-4 w-4" />
                  {source.sourceType === "PDF" ? "Generate Outcome from PDF" : "Generate Outcome from Source"}
                </Button>
              ) : null}
              <Button variant="ghost" onClick={onDiscardReview}>
                <X className="h-4 w-4" />
                Discard
              </Button>
            </div>
          </div>
          {analysis.suggestedOutcomes.length ? (
            <div className="space-y-3">
              {analysis.suggestedOutcomes.map((suggestion) => (
                <div key={suggestion.title} className="rounded-lg border border-line bg-mist p-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="font-medium text-ink">{suggestion.title}</p>
                      <p className="mt-1 text-sm leading-6 text-slateText">{suggestion.goal}</p>
                    </div>
                    <Button onClick={() => onCreateOutcomeFromSuggestion(suggestion)}>
                      <Plus className="h-4 w-4" />
                      Create Outcome
                    </Button>
                  </div>
                  <div className="mt-3 font-mono text-xs leading-5 text-slate-500">
                    {suggestion.verificationCommands.join(" · ")}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500">No suggested outcomes found yet.</p>
          )}
        </div>

        <RawSourceText className="mt-4" source={source} previewText={analysis.previewText} />
      </PanelBody>
    </Panel>
  );
}

function AnalyzerBadge({ value }: { value: ProjectHistoryAnalysis["analyzer"] }) {
  const label =
    value === "AI"
      ? "AI analysis used"
      : value === "AIUnavailable"
        ? "AI unavailable, local analysis used"
        : "Local analysis used";
  const className =
    value === "AI"
      ? "border-blue-200 bg-white text-blue-700"
      : value === "AIUnavailable"
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : "border-line bg-white text-slate-600";

  return (
    <span className={cx("shrink-0 rounded-md border px-2 py-1 font-mono text-xs font-semibold", className)}>
      {label}
    </span>
  );
}

function FounderReviewCard({
  analysis,
  nextOutcome,
}: {
  analysis: ProjectHistoryAnalysis;
  nextOutcome?: SuggestedOutcome;
}) {
  const whatIsDone = dedupe([...fieldLines(analysis.memorySections.currentBuildState), ...analysis.memorySections.completedWork]).slice(0, 4);
  const whatIsBroken = analysis.memorySections.knownIssues.slice(0, 4);
  const whatToDoNext = analysis.memorySections.roadmap.slice(0, 4);

  return (
    <div className="mb-4 rounded-lg border border-line bg-white p-4">
      <FieldLabel>Founder Review</FieldLabel>
      <p className="mt-3 font-mono text-xs font-semibold uppercase text-electric">Plain English Summary</p>
      <p className="mt-3 text-sm leading-6 text-slateText">
        {analysis.plainEnglishSummary || analysis.analysisSummary || "Brainpress found source history. Review the sections below before saving."}
      </p>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <FounderReviewSection title="What is done" items={whatIsDone} />
        <FounderReviewSection title="What is broken / risky" items={whatIsBroken} />
        <FounderReviewSection title="What to do next" items={whatToDoNext} />
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
          <p className="font-mono text-xs font-semibold uppercase text-blue-700">Suggested next outcome</p>
          <p className="mt-2 text-sm font-semibold text-ink">{nextOutcome?.title || "No next outcome suggested yet."}</p>
          {nextOutcome ? <p className="mt-1 text-sm leading-6 text-slateText">{nextOutcome.goal}</p> : null}
        </div>
      </div>
    </div>
  );
}

function FounderReviewSection({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-lg border border-line bg-mist p-3">
      <p className="font-mono text-xs font-semibold uppercase text-electric">{title}</p>
      {items.length ? (
        <ul className="mt-2 space-y-1 text-sm leading-6 text-slateText">
          {items.map((item) => (
            <li key={item}>- {item.replace(/^[-*]\s*/, "")}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-slate-500">No strong signal detected.</p>
      )}
    </div>
  );
}

function ImportSection({ title, value }: { title: string; value: string | string[] }) {
  const content = Array.isArray(value) ? linesToText(value) : value;

  return (
    <div className="rounded-lg border border-line bg-white p-4">
      <p className="mb-2 font-mono text-xs font-semibold uppercase text-electric">{title}</p>
      <p className="whitespace-pre-wrap text-sm leading-6 text-slateText">{content || "No strong signal detected."}</p>
    </div>
  );
}

function RawSourceText({
  source,
  previewText = sourceTextPreview(source.extractedText),
  className,
}: {
  source: ProjectImport;
  previewText?: string;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const isLong = source.extractedText.length > previewText.length;
  const isDisplayCapped = expanded && source.extractedText.length > rawSourceExpandedDisplayLimit;
  const displayText = expanded ? sourceTextExpandedPreview(source.extractedText) : previewText;

  return (
    <div className={cx("rounded-lg border border-line bg-white p-4", className)}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-medium text-ink">
            {source.sourceType === "PDF" ? "Raw extracted PDF text" : "Raw imported source text"}
          </p>
          <p className="mt-1 text-sm leading-6 text-slateText">
            This is the raw extracted source. Brainpress uses it to generate memory, but you usually do not need to edit it.
          </p>
        </div>
        <Button onClick={() => setExpanded((value) => !value)}>
          <Eye className="h-4 w-4" />
          {expanded ? "Collapse text" : source.extractedText.length > rawSourceExpandedDisplayLimit ? "Expand safe preview" : "Expand full text"}
        </Button>
      </div>
      {isLong ? (
        <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm leading-6 text-amber-800">
          Large source detected. Brainpress summarized it into memory sections. Raw text is kept as source.
        </div>
      ) : null}
      {isDisplayCapped ? (
        <div className="mb-3 rounded-md border border-line bg-mist px-3 py-2 text-sm leading-6 text-slateText">
          Browser display is capped for performance. The full raw source remains stored in this import.
        </div>
      ) : null}
      <MonoBlock className="max-h-80" value={displayText} />
    </div>
  );
}

function sourceTextPreview(value: string) {
  const preview = value.slice(0, rawSourcePreviewLimit);
  return value.length > preview.length ? `${preview}\n\n[Preview truncated. Full extracted text is stored in the source.]` : preview;
}

function sourceTextExpandedPreview(value: string) {
  const preview = value.slice(0, rawSourceExpandedDisplayLimit);
  return value.length > preview.length
    ? `${preview}\n\n[Display truncated for browser performance. Full raw source remains stored in this import.]`
    : preview;
}

function ImportMetaLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line bg-white p-3">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-ink">{value}</p>
    </div>
  );
}

function ImportsPanel({
  imports,
  viewingImport,
  onViewImport,
  onReAnalyzeImport,
}: {
  imports: ProjectImport[];
  viewingImport: ProjectImport | null;
  onViewImport: (source: ProjectImport | null) => void;
  onReAnalyzeImport: (source: ProjectImport) => void;
}) {
  return (
    <Panel>
      <PanelBody>
        <SectionHeader title="Imports" eyebrow="Sources" />
        {imports.length ? (
          <div className="space-y-3">
            {imports.slice(0, 8).map((source) => (
              <div key={source.id} className="rounded-lg border border-line bg-white p-4">
                <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <SourceBadge value={source.sourceType} />
                      <p className="font-medium text-ink">{source.title}</p>
                    </div>
                    <p className="text-sm text-slate-500">
                      {source.fileName || "Text paste"} · {new Date(source.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={() => onViewImport(viewingImport?.id === source.id ? null : source)}>
                      <Eye className="h-4 w-4" />
                      {viewingImport?.id === source.id ? "Hide" : "View text"}
                    </Button>
                    <Button onClick={() => onReAnalyzeImport(source)}>
                      <Wand2 className="h-4 w-4" />
                      Re-analyze
                    </Button>
                  </div>
                </div>
                {source.detectedThemes.length ? (
                  <div className="flex flex-wrap gap-2">
                    {source.detectedThemes.slice(0, 6).map((theme) => (
                      <span key={theme} className="rounded-md border border-line bg-mist px-2 py-1 font-mono text-xs text-slate-600">
                        {theme}
                      </span>
                    ))}
                  </div>
                ) : null}
                {viewingImport?.id === source.id ? (
                  <RawSourceText className="mt-3" source={source} />
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="No imports yet" detail="Paste text or upload a text-based PDF to create the first memory source." />
        )}
      </PanelBody>
    </Panel>
  );
}

function SourceBadge({ value }: { value: ProjectImport["sourceType"] }) {
  return (
    <span className="rounded-md border border-blue-200 bg-blue-50 px-2 py-1 font-mono text-xs font-semibold text-blue-700">
      {value === "PDF" ? "PDF" : "TEXT"}
    </span>
  );
}

function OutcomesTab({
  outcomes,
  outcomeForm,
  targetAgent,
  onTargetAgentChange,
  onOutcomeFormChange,
  onCreateOutcome,
  onUpdateOutcome,
  onGeneratePlan,
  onGeneratePrompt,
  onPrepareHandoff,
}: {
  outcomes: Outcome[];
  outcomeForm: typeof emptyOutcomeForm;
  targetAgent: TargetAgent;
  onTargetAgentChange: (value: TargetAgent) => void;
  onOutcomeFormChange: (value: typeof emptyOutcomeForm) => void;
  onCreateOutcome: () => void;
  onUpdateOutcome: (outcomeId: string, patch: Partial<Outcome>) => void;
  onGeneratePlan: (outcome: Outcome) => void;
  onGeneratePrompt: (outcome: Outcome) => void;
  onPrepareHandoff: (outcome: Outcome) => void;
}) {
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(320px,0.75fr)_minmax(0,1.25fr)]">
      <Panel>
        <PanelBody>
          <SectionHeader title="Create Outcome" eyebrow="Outcome" />
          <div className="space-y-4">
            <FormField label="Title">
              <TextInput
                value={outcomeForm.title}
                onChange={(event) => onOutcomeFormChange({ ...outcomeForm, title: event.target.value })}
                placeholder="Improve onboarding activation"
              />
            </FormField>
            <FormField label="Goal">
              <TextArea
                value={outcomeForm.goal}
                onChange={(event) => onOutcomeFormChange({ ...outcomeForm, goal: event.target.value })}
                placeholder="Make the workflow clearer and verifiable."
              />
            </FormField>
            <FormField label="Acceptance criteria">
              <TextArea
                value={outcomeForm.acceptanceCriteria}
                onChange={(event) => onOutcomeFormChange({ ...outcomeForm, acceptanceCriteria: event.target.value })}
                placeholder="One criterion per line"
              />
            </FormField>
            <FormField label="Constraints">
              <TextArea
                value={outcomeForm.constraints}
                onChange={(event) => onOutcomeFormChange({ ...outcomeForm, constraints: event.target.value })}
                placeholder="One constraint per line"
              />
            </FormField>
            <FormField label="Verification commands">
              <TextArea
                value={outcomeForm.verificationCommands}
                onChange={(event) => onOutcomeFormChange({ ...outcomeForm, verificationCommands: event.target.value })}
              />
            </FormField>
            <FormField label="Max iterations">
              <TextInput
                type="number"
                min={1}
                max={8}
                value={outcomeForm.maxIterations}
                onChange={(event) => onOutcomeFormChange({ ...outcomeForm, maxIterations: Number(event.target.value) })}
              />
            </FormField>
            <Button variant="primary" className="w-full" onClick={onCreateOutcome}>
              <Plus className="h-4 w-4" />
              Create Outcome
            </Button>
          </div>
        </PanelBody>
      </Panel>

      <div className="flex flex-col gap-5">
        <Panel>
          <PanelBody>
            <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_220px] sm:items-end">
              <SectionHeader title="Outcome Queue" eyebrow="Execution" />
              <FormField label="Prompt target">
                <Select value={targetAgent} onChange={(event) => onTargetAgentChange(event.target.value as TargetAgent)}>
                  {targetAgents.map((agent) => (
                    <option key={agent}>{agent}</option>
                  ))}
                </Select>
              </FormField>
            </div>
            <OutcomeList
              outcomes={outcomes}
              editable
              onUpdateOutcome={onUpdateOutcome}
              onGeneratePlan={onGeneratePlan}
              onGeneratePrompt={onGeneratePrompt}
              onPrepareHandoff={onPrepareHandoff}
            />
          </PanelBody>
        </Panel>
      </div>
    </div>
  );
}

function PromptsTab({
  prompts,
  outcomes,
  copiedPromptId,
  onCopyPrompt,
  onUpdatePrompt,
  onPrepareHandoff,
}: {
  prompts: AgentPrompt[];
  outcomes: Outcome[];
  copiedPromptId: string | null;
  onCopyPrompt: (prompt: AgentPrompt) => void;
  onUpdatePrompt: (promptId: string, patch: Partial<AgentPrompt>) => void;
  onPrepareHandoff: (prompt: AgentPrompt) => void;
}) {
  return (
    <Panel>
      <PanelBody>
        <SectionHeader title="Saved Prompts" eyebrow="Agent handoff" />
        {prompts.length ? (
          <div className="space-y-4">
            {prompts.map((prompt) => {
              const outcome = outcomes.find((item) => item.id === prompt.outcomeId);
              return (
                <div key={prompt.id} className="rounded-lg border border-line bg-white p-4">
                  <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-ink">{outcome?.title || "Untitled outcome"}</p>
                        <StatusPill value={prompt.status} />
                      </div>
                      <p className="mt-1 text-sm text-slate-500">Target: {prompt.targetAgent}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button onClick={() => onCopyPrompt(prompt)}>
                        <Clipboard className="h-4 w-4" />
                        {copiedPromptId === prompt.id ? "Copied" : "Copy"}
                      </Button>
                      <Button onClick={() => onUpdatePrompt(prompt.id, { status: "Sent" })}>
                        <Send className="h-4 w-4" />
                        Mark Sent
                      </Button>
                      <Button onClick={() => onUpdatePrompt(prompt.id, { status: "Completed" })}>
                        <CheckCircle2 className="h-4 w-4" />
                        Completed
                      </Button>
                      <Button variant="primary" onClick={() => onPrepareHandoff(prompt)}>
                        <Send className="h-4 w-4" />
                        Prepare Handoff
                      </Button>
                    </div>
                  </div>
                  <MonoBlock value={prompt.prompt} />
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState title="No prompts saved" detail="Generate an agent prompt from an outcome to create the first handoff." />
        )}
      </PanelBody>
    </Panel>
  );
}

function BuildLogsTab({
  outcomes,
  agentRuns,
  buildLogs,
  rawResult,
  logOutcomeId,
  logAgentRunId,
  draftLog,
  onRawResultChange,
  onLogOutcomeChange,
  onLogAgentRunChange,
  onIngest,
  onSave,
}: {
  outcomes: Outcome[];
  agentRuns: AgentRun[];
  buildLogs: BuildLog[];
  rawResult: string;
  logOutcomeId: string;
  logAgentRunId: string;
  draftLog: BuildLog | null;
  onRawResultChange: (value: string) => void;
  onLogOutcomeChange: (value: string) => void;
  onLogAgentRunChange: (value: string) => void;
  onIngest: () => void;
  onSave: () => void;
}) {
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(320px,0.85fr)_minmax(0,1.15fr)]">
      <Panel>
        <PanelBody>
          <SectionHeader title="Paste Agent Result" eyebrow="Ingest" />
          <div className="space-y-4">
            <FormField label="Outcome">
              <Select value={logOutcomeId} onChange={(event) => onLogOutcomeChange(event.target.value)}>
                <option value="">No outcome selected</option>
                {outcomes.map((outcome) => (
                  <option key={outcome.id} value={outcome.id}>
                    {outcome.title}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Linked agent run">
              <Select value={logAgentRunId} onChange={(event) => onLogAgentRunChange(event.target.value)}>
                <option value="">No agent run selected</option>
                {agentRuns.map((run) => (
                  <option key={run.id} value={run.id}>
                    {run.targetAgent} - {run.outcomeSnapshot.title}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Raw result">
              <TextArea
                className="min-h-72 font-mono text-xs"
                value={rawResult}
                onChange={(event) => onRawResultChange(event.target.value)}
                placeholder="Paste the agent report: changed files, commands run, status, remaining issues, and next task."
              />
            </FormField>
            <Button variant="primary" className="w-full" onClick={onIngest}>
              <Wand2 className="h-4 w-4" />
              Ingest Result
            </Button>
          </div>
        </PanelBody>
      </Panel>

      <div className="flex flex-col gap-5">
        <Panel>
          <PanelBody>
            <SectionHeader
              title="Structured Build Log"
              eyebrow="Verification"
              action={
                <Button variant="primary" disabled={!draftLog} onClick={onSave}>
                  <Save className="h-4 w-4" />
                  Save Build Log
                </Button>
              }
            />
            {draftLog ? <BuildLogSummary log={draftLog} /> : <EmptyState title="No draft log" detail="Ingest an agent result to generate a structured build log." />}
          </PanelBody>
        </Panel>

        <Panel>
          <PanelBody>
            <SectionHeader title="Timeline" eyebrow="Build logs" />
            {buildLogs.length ? (
              <div className="space-y-4">
                {buildLogs.map((log) => (
                  <div key={log.id} className="rounded-lg border border-line bg-white p-4">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <History className="h-4 w-4 text-electric" />
                        <StatusPill value={log.verificationStatus} />
                      </div>
                      <span className="text-xs text-slate-500">{new Date(log.createdAt).toLocaleString()}</span>
                    </div>
                    <p className="text-sm leading-6 text-slateText">{log.summary}</p>
                    <p className="mt-2 text-sm leading-6 text-slateText">{log.verificationSummary || "No verification summary recorded."}</p>
                    {log.filesChanged.length ? (
                      <p className="mt-3 font-mono text-xs leading-5 text-slate-500">{log.filesChanged.join(", ")}</p>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState title="No saved logs" detail="Saved build logs create the execution timeline for this project." />
            )}
          </PanelBody>
        </Panel>
      </div>
    </div>
  );
}

function SettingsTab({ project, onUpdateProject }: { project: Project; onUpdateProject: (patch: Partial<Project>) => void }) {
  return (
    <Panel>
      <PanelBody>
        <SectionHeader title="Project Settings" eyebrow="Workspace" />
        <div className="grid gap-5 lg:grid-cols-2">
          <FormField label="Project name">
            <TextInput value={project.name} onChange={(event) => onUpdateProject({ name: event.target.value })} />
          </FormField>
          <FormField label="Repo path / GitHub URL">
            <TextInput value={project.repoPathOrUrl} onChange={(event) => onUpdateProject({ repoPathOrUrl: event.target.value })} />
          </FormField>
          <FormField label="Description">
            <TextArea value={project.description} onChange={(event) => onUpdateProject({ description: event.target.value })} />
          </FormField>
          <FormField label="Primary goal">
            <TextArea value={project.primaryGoal} onChange={(event) => onUpdateProject({ primaryGoal: event.target.value })} />
          </FormField>
          <FormField label="Preferred agent">
            <Select value={project.preferredAgent} onChange={(event) => onUpdateProject({ preferredAgent: event.target.value as PreferredAgent })}>
              {preferredAgents.map((agent) => (
                <option key={agent}>{agent}</option>
              ))}
            </Select>
          </FormField>
          <FormField label="Default verification commands">
            <TextArea
              value={project.verificationCommands.join("\n")}
              onChange={(event) => onUpdateProject({ verificationCommands: fieldLines(event.target.value) })}
            />
          </FormField>
          <div className="lg:col-span-2">
            <FormField label="Product constraints">
              <TextArea
                value={project.constraints.join("\n")}
                onChange={(event) => onUpdateProject({ constraints: fieldLines(event.target.value) })}
              />
            </FormField>
          </div>
          <div className="lg:col-span-2">
            <FormField label="Permission safety rules">
              <TextArea
                className="min-h-72 font-mono text-xs"
                value={project.safetyRules}
                onChange={(event) => onUpdateProject({ safetyRules: event.target.value })}
              />
            </FormField>
          </div>
        </div>
      </PanelBody>
    </Panel>
  );
}

function OutcomeList({
  outcomes,
  editable = false,
  onUpdateOutcome,
  onGeneratePlan,
  onGeneratePrompt,
  onPrepareHandoff,
}: {
  outcomes: Outcome[];
  editable?: boolean;
  onUpdateOutcome?: (outcomeId: string, patch: Partial<Outcome>) => void;
  onGeneratePlan?: (outcome: Outcome) => void;
  onGeneratePrompt?: (outcome: Outcome) => void;
  onPrepareHandoff?: (outcome: Outcome) => void;
}) {
  if (!outcomes.length) {
    return <EmptyState title="No outcomes" detail="Create a desired outcome to generate a plan and agent prompt." />;
  }

  return (
    <div className="space-y-4">
      {outcomes.map((outcome) => (
        <div key={outcome.id} className="rounded-lg border border-line bg-white p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold text-ink">{outcome.title}</p>
                <StatusPill value={outcome.status} />
              </div>
              <p className="mt-2 text-sm leading-6 text-slateText">{outcome.goal}</p>
            </div>
            {editable && onUpdateOutcome ? (
              <Select
                className="w-full md:w-44"
                value={outcome.status}
                onChange={(event) => onUpdateOutcome(outcome.id, { status: event.target.value as OutcomeStatus })}
              >
                {outcomeStatuses.map((status) => (
                  <option key={status}>{status}</option>
                ))}
              </Select>
            ) : null}
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div>
              <p className="mb-2 text-xs font-medium text-slate-500">Acceptance Criteria</p>
              <ul className="space-y-1 text-sm leading-6 text-slateText">
                {outcome.acceptanceCriteria.map((criterion) => (
                  <li key={criterion} className="flex gap-2">
                    <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-emerald-600" />
                    <span>{criterion}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="mb-2 text-xs font-medium text-slate-500">Verification</p>
              <div className="space-y-2">
                {outcome.verificationCommands.map((command) => (
                  <code key={command} className="block rounded-md bg-slate-100 px-2 py-1 font-mono text-xs text-slate-700">
                    {command}
                  </code>
                ))}
              </div>
            </div>
          </div>

          {editable ? (
            <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
              <Button onClick={() => onGeneratePlan?.(outcome)}>
                <ListChecks className="h-4 w-4" />
                Generate Plan
              </Button>
              <Button variant="primary" onClick={() => onGeneratePrompt?.(outcome)}>
                <FileCode2 className="h-4 w-4" />
                Generate Agent Prompt
              </Button>
              <Button onClick={() => onPrepareHandoff?.(outcome)}>
                <Send className="h-4 w-4" />
                Prepare Handoff
              </Button>
            </div>
          ) : null}

          {editable && outcome.generatedPlan ? (
            <div className="mt-4">
              <MonoBlock value={outcome.generatedPlan} />
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function ReadinessCard({ title, score, icon }: { title: string; score: number; icon: ReactNode }) {
  return (
    <Panel>
      <PanelBody>
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-medium text-ink">
            <span className="text-electric">{icon}</span>
            {title}
          </div>
          <span className="font-mono text-sm text-slate-500">{score}%</span>
        </div>
        <Meter value={score} />
      </PanelBody>
    </Panel>
  );
}

function BuildLogSummary({ log }: { log: BuildLog }) {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-line bg-white p-4">
        <div className="mb-2 flex items-center gap-2">
          <StatusPill value={log.verificationStatus} />
          <p className="text-sm font-medium text-ink">Task attempted</p>
        </div>
        <p className="text-sm leading-6 text-slateText">{log.summary}</p>
      </div>
      <SummaryList title="Completed changes" items={log.completedChanges} />
      <SummaryList title="Files changed" items={log.filesChanged} mono />
      <div className="rounded-lg border border-line bg-white p-4">
        <p className="mb-2 text-sm font-medium text-ink">Verification summary</p>
        <p className="text-sm leading-6 text-slateText">{log.verificationSummary || "No verification summary recorded."}</p>
        {log.skippedVerificationReason ? (
          <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-900">
            Verification skipped reason: {log.skippedVerificationReason}
          </p>
        ) : null}
        {(log.verificationResults || []).length ? (
          <div className="mt-3 space-y-2">
            {(log.verificationResults || []).map((result) => (
              <div key={result.command} className="rounded-md bg-mist px-3 py-2 font-mono text-xs text-slate-700">
                {result.command} - {result.status} (exit {result.exitCode}, {result.durationMs}ms)
              </div>
            ))}
          </div>
        ) : null}
      </div>
      <SummaryList title="New issues" items={log.newIssues} />
      <SummaryList title="Decisions extracted" items={log.decisionsExtracted} />
      <SummaryList title="Next recommended outcomes" items={log.nextOutcomes} />
    </div>
  );
}

function SummaryList({ title, items, mono = false }: { title: string; items: string[]; mono?: boolean }) {
  return (
    <div className="rounded-lg border border-line bg-white p-4">
      <p className="mb-2 text-sm font-medium text-ink">{title}</p>
      {items.length ? (
        <ul className={cx("space-y-1 text-sm leading-6 text-slateText", mono && "font-mono text-xs")}>
          {items.map((item) => (
            <li key={item}>- {item}</li>
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
      <FieldLabel>{label}</FieldLabel>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function appendLines(existing: string, lines: string[]) {
  if (!lines.length) return existing;
  return linesToText([...fieldLines(existing), ...lines]);
}

function addRepairOutcomeIfMissing(outcomes: Outcome[], repairOutcome: Outcome | null) {
  if (!repairOutcome) return outcomes;
  if (outcomes.some((outcome) => outcome.title === repairOutcome.title)) return outcomes;
  return [repairOutcome, ...outcomes];
}

function addProjectImportIfMissing(imports: ProjectImport[], source: ProjectImport) {
  if (imports.some((item) => item.id === source.id)) {
    return imports.map((item) => (item.id === source.id ? source : item));
  }
  return [source, ...imports];
}

function localPromptPath(run: AgentRun) {
  const repoPath = run.repoPathOrUrl.replace(/[\\/]+$/, "");
  const separator = repoPath.includes("\\") ? "\\" : "/";
  const handoffDirectory = (run.handoffDirectory || `.brainpress/runs/${run.id}`).replace(/[\\/]/g, separator);
  return `${repoPath}${separator}${handoffDirectory}${separator}prompt.md`;
}

function codexResultText(run: AgentRun) {
  const interruptedNextTask = nextTaskForInterruptedRun(run.status, run.outcomeSnapshot.title);
  return [
    `Codex run completed for ${run.outcomeSnapshot.title}.`,
    `Codex exit code: ${run.codexExitCode ?? "unknown"}.`,
    run.codexCancelled ? "Run was cancelled by the user." : "",
    run.codexTimedOut ? "Run timed out. Partial logs were preserved." : "",
    run.codexStdout ? `stdout:\n${run.codexStdout}` : "",
    run.codexStderr ? `stderr:\n${run.codexStderr}` : "",
    run.gitDiffStat ? `git diff --stat:\n${run.gitDiffStat}` : "",
    run.gitDiffTextPreview ? `diff preview:\n${run.gitDiffTextPreview}` : "",
    run.verificationSummary ? `verification summary: ${run.verificationSummary}` : "",
    interruptedNextTask ? `next recommended task: ${interruptedNextTask}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function nextRecommendation(memory: Memory, buildLogs: BuildLog[]) {
  const latestLog = buildLogs[0];
  const logNext = latestLog?.nextOutcomes[0];
  if (logNext) return cleanRecommendation(logNext);

  const roadmapNext = fieldLines(memory.roadmap)[0];
  if (roadmapNext) return cleanRecommendation(roadmapNext);

  const issueNext = fieldLines(memory.knownIssues)[0];
  if (issueNext) return `Resolve ${issueNext.replace(/[.。]$/, "")}`;

  return "Define the next small outcome from current product memory.";
}

function cleanRecommendation(value: string) {
  return value.replace(/^(next|todo|need to|build|add)[:\s-]*/i, "").trim();
}
