import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  canAbsorbAgentRun,
  createAgentRun,
  createVerificationRepairOutcome,
  generateHandoffPackage,
} from "../src/lib/agent-runs";
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
import { initialState, seedMemory, seedOutcome, seedProject } from "../src/lib/seed";
import { loadBrainpressState } from "../src/lib/storage";
import { validateVerificationCommands } from "../src/lib/verification";

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

test("Sources panel exposes saved source count and names", () => {
  const componentSource = readFileSync("src/components/brainpress/project-workspace.tsx", "utf8");

  assert.match(savedSourcesLabel(2), /2 sources saved/);
  assert.match(componentSource, /savedSourcesLabel\(imports\.length\)/);
  assert.match(componentSource, /Saved sources:/);
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
