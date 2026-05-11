import assert from "node:assert/strict";
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
  createProjectImport,
  dedupe,
  generateAgentPrompt,
  ingestAgentResult,
  mergeMemoryWithProjectHistory,
  pdfTextExtractionFailureMessage,
} from "../src/lib/brainpress";
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

test("PDF scanned or image-only failure message is founder-friendly", () => {
  assert.match(pdfTextExtractionFailureMessage(), /scanned\/image-only/i);
  assert.match(pdfTextExtractionFailureMessage(), /text-based PDF/i);
});
