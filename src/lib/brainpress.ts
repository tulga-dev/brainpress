import type {
  BuildLog,
  ExtractedPage,
  Memory,
  MemoryAnalysis,
  MemoryInputType,
  Outcome,
  Project,
  ProjectImport,
  ProjectImportSourceType,
  SuggestedOutcome,
  TargetAgent,
  VerificationResult,
  VerificationStatus,
} from "@/lib/types";
import {
  repairSuggestionsFromVerification,
  summarizeVerificationResults,
  verificationStatusFromResults,
} from "@/lib/verification";
import { getProjectSafetyRules } from "@/lib/safety";

const decisionTerms = ["decision", "must", "should", "avoid", "do not", "constraint"];
const completedTerms = ["built", "added", "implemented", "completed", "done", "fixed", "shipped", "released"];
const issueTerms = ["bug", "issue", "broken", "missing", "problem", "error", "failed", "failing", "risk"];
const roadmapTerms = ["next", "todo", "need to", "build", "add", "later", "follow up", "future", "roadmap"];
const technicalTerms = [
  "api",
  "agent",
  "codex",
  "component",
  "database",
  "integration",
  "model",
  "schema",
  "next.js",
  "postgres",
  "react",
  "route",
  "supabase",
  "typescript",
  "tailwind",
  "dashboard",
  "state",
  "test",
];

export interface ProjectHistoryMetadata {
  project: Project;
  currentMemory: Memory;
  sourceType: ProjectImportSourceType;
  title: string;
  fileName?: string;
  fileSize?: number;
  pageCount?: number;
  extractedPages?: ExtractedPage[];
  inputType?: MemoryInputType;
}

export interface ProjectHistoryAnalysis extends MemoryAnalysis {
  source: ProjectImport;
  cleanedText: string;
  previewText: string;
  detectedThemes: string[];
  analysisSummary: string;
  suggestedOutcomes: SuggestedOutcome[];
}

export function uid(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}_${Date.now().toString(36)}`;
}

export function splitLines(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-*]\s*/, "").trim())
    .filter(Boolean);
}

export function linesToText(lines: string[]) {
  return dedupe(lines).map((line) => `- ${line}`).join("\n");
}

export function dedupe(lines: string[]) {
  const seen = new Set<string>();
  return lines.filter((line) => {
    const key = line.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function fieldLines(value: string) {
  return splitLines(value).map((line) => line.replace(/^\d+\.\s*/, "").trim());
}

export function projectSummary(project: Project, themes: string[] = []) {
  const detectedThemes = dedupe(themes)
    .slice(0, 4)
    .map((theme) => theme.toLowerCase())
    .join(", ");
  const themeClause = detectedThemes ? ` Current themes include ${detectedThemes}.` : "";

  return `${project.name} is ${project.description.trim() || "a product in active development"}. Its primary goal is to ${project.primaryGoal.trim() || "turn product intent into verified execution"}.${themeClause}`;
}

export function analyzeMemoryInput(
  input: string,
  inputType: MemoryInputType,
  project: Project,
  currentMemory: Memory,
): MemoryAnalysis {
  const rawLines = splitLines(input);
  const warnings: string[] = [];

  const detected = {
    decisions: collectLines(rawLines, decisionTerms),
    completedWork: collectLines(rawLines, completedTerms),
    knownIssues: collectLines(rawLines, issueTerms),
    roadmap: collectLines(rawLines, roadmapTerms),
    technicalSignals: collectLines(rawLines, technicalTerms),
  };

  if (rawLines.length < 4) {
    warnings.push("Input is short, so Brainpress kept useful placeholders and only upgraded high-confidence memory.");
  }

  if (!detected.decisions.length && !detected.completedWork.length && !detected.knownIssues.length && !detected.roadmap.length) {
    warnings.push("No strong execution signals were detected. Add decisions, completed work, known issues, or next tasks for better organization.");
  }

  const inputSummary =
    rawLines.length > 0
      ? `Imported ${rawLines.length} ${inputType.toLowerCase()} line${rawLines.length === 1 ? "" : "s"} for the current project memory.`
      : "";

  const themes = [
    ...detected.technicalSignals.map((line) => keywordFromLine(line)),
    ...detected.roadmap.map((line) => keywordFromLine(line)),
  ].filter(Boolean);

  const nextMemory: Memory = {
    ...currentMemory,
    productSummary: projectSummary(project, themes),
    currentBuildState: mergeText(currentMemory.currentBuildState, inputSummary),
    technicalArchitecture: mergeListText(currentMemory.technicalArchitecture, detected.technicalSignals),
    activeDecisions: mergeListText(currentMemory.activeDecisions, detected.decisions),
    completedWork: mergeListText(currentMemory.completedWork, detected.completedWork),
    knownIssues: mergeListText(currentMemory.knownIssues, detected.knownIssues),
    roadmap: mergeListText(currentMemory.roadmap, detected.roadmap),
  };

  const projectConstraints = dedupe([
    ...project.constraints,
    ...detected.decisions.filter((line) => hasAny(line, ["must", "should", "avoid", "do not", "constraint"])),
  ]);

  return {
    memory: nextMemory,
    projectConstraints,
    warnings,
    detected,
  };
}

export function analyzeProjectHistory(inputText: string, metadata: ProjectHistoryMetadata): ProjectHistoryAnalysis {
  const cleanedText = normalizeProjectHistoryText(inputText);
  const safeText = cleanedText.slice(0, 120_000);
  const warnings: string[] = [];
  if (cleanedText.length > safeText.length) {
    warnings.push("This source is long, so Brainpress analyzed the first 120,000 characters for memory signals while preserving the extracted text.");
  }
  const storedText = cleanedText.slice(0, 500_000);
  if (cleanedText.length > storedText.length) {
    warnings.push("This source is very large, so Brainpress capped the stored source text to protect localStorage.");
  }

  const analysis = analyzeMemoryInput(
    safeText,
    metadata.inputType || (metadata.sourceType === "PDF" ? "Research notes" : "Other"),
    metadata.project,
    metadata.currentMemory,
  );
  const detectedThemes = dedupe([
    ...analysis.detected.technicalSignals.map(keywordFromLine),
    ...analysis.detected.roadmap.map(keywordFromLine),
    ...analysis.detected.decisions.map(keywordFromLine),
  ])
    .filter(Boolean)
    .slice(0, 8);
  const suggestedOutcomes = generateSuggestedOutcomesFromHistory(
    analysis,
    metadata.project,
    metadata.currentMemory,
  );
  const analysisSummary = summarizeProjectHistoryAnalysis(metadata.sourceType, analysis, detectedThemes, metadata.pageCount);
  const source: ProjectImport = {
    id: uid("import"),
    projectId: metadata.project.id,
    sourceType: metadata.sourceType,
    title: metadata.title.trim() || (metadata.fileName ? metadata.fileName.replace(/\.pdf$/i, "") : "Imported project history"),
    fileName: metadata.fileName,
    fileSize: metadata.fileSize,
    pageCount: metadata.pageCount,
    extractedText: storedText,
    extractedPages: capExtractedPages(metadata.extractedPages || [{ pageNumber: 1, text: cleanedText }]),
    detectedThemes,
    analysisSummary,
    suggestedOutcomes,
    createdAt: new Date().toISOString(),
  };

  return {
    ...analysis,
    warnings: dedupe([...analysis.warnings, ...warnings]),
    source,
    cleanedText,
    previewText: safePreview(cleanedText),
    detectedThemes,
    analysisSummary,
    suggestedOutcomes,
  };
}

function capExtractedPages(pages: ExtractedPage[]) {
  let remaining = 500_000;
  return pages.map((page) => {
    const text = page.text.slice(0, Math.max(0, remaining));
    remaining -= text.length;
    return { ...page, text };
  });
}

export function createProjectImport({
  project,
  sourceType,
  title,
  extractedText,
  extractedPages = [{ pageNumber: 1, text: extractedText }],
  fileName,
  fileSize,
  pageCount,
  detectedThemes = [],
  analysisSummary = "",
  suggestedOutcomes = [],
}: {
  project: Project;
  sourceType: ProjectImportSourceType;
  title: string;
  extractedText: string;
  extractedPages?: ExtractedPage[];
  fileName?: string;
  fileSize?: number;
  pageCount?: number;
  detectedThemes?: string[];
  analysisSummary?: string;
  suggestedOutcomes?: SuggestedOutcome[];
}): ProjectImport {
  return {
    id: uid("import"),
    projectId: project.id,
    sourceType,
    title,
    fileName,
    fileSize,
    pageCount,
    extractedText,
    extractedPages,
    detectedThemes,
    analysisSummary,
    suggestedOutcomes,
    createdAt: new Date().toISOString(),
  };
}

export function mergeMemoryWithProjectHistory(
  currentMemory: Memory,
  analysis: Pick<ProjectHistoryAnalysis, "memory" | "detected" | "analysisSummary">,
  options: { updateProductSummary?: boolean } = {},
): Memory {
  return {
    ...currentMemory,
    productSummary:
      options.updateProductSummary || !currentMemory.productSummary.trim()
        ? analysis.memory.productSummary
        : currentMemory.productSummary,
    currentBuildState: mergeText(currentMemory.currentBuildState, analysis.analysisSummary),
    technicalArchitecture: mergeListText(
      currentMemory.technicalArchitecture,
      fieldLines(analysis.memory.technicalArchitecture),
    ),
    activeDecisions: mergeListText(currentMemory.activeDecisions, analysis.detected.decisions),
    completedWork: mergeListText(currentMemory.completedWork, analysis.detected.completedWork),
    knownIssues: mergeListText(currentMemory.knownIssues, analysis.detected.knownIssues),
    roadmap: mergeListText(currentMemory.roadmap, analysis.detected.roadmap),
  };
}

export function normalizeProjectHistoryText(input: string) {
  const lines = input
    .replace(/\u0000/g, "")
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim());

  return stripRepeatedHeadersFooters(lines).join("\n").trim();
}

export function stripRepeatedHeadersFooters(lines: string[]) {
  const candidates = lines.filter((line) => line && line.length < 120);
  const counts = new Map<string, number>();
  candidates.forEach((line) => counts.set(line.toLowerCase(), (counts.get(line.toLowerCase()) || 0) + 1));
  const repeated = new Set(
    [...counts.entries()]
      .filter(([line, count]) => count >= 3 && !hasAny(line, [...decisionTerms, ...completedTerms, ...issueTerms, ...roadmapTerms, ...technicalTerms]))
      .map(([line]) => line),
  );
  return lines.filter((line) => line && !repeated.has(line.toLowerCase()));
}

export function pdfTextExtractionFailureMessage() {
  return "Brainpress could not extract readable text from this PDF. It may be scanned/image-only. Try exporting as text or uploading a text-based PDF.";
}

export function generateOutcomePlan(project: Project, memory: Memory, outcome: Outcome) {
  const areas = inferImplementationAreas(outcome, memory);
  const risks = inferRisks(outcome, memory, project);
  const criteria = outcome.acceptanceCriteria.length
    ? outcome.acceptanceCriteria
    : ["Define measurable acceptance criteria before marking this ready."];
  const commands = outcome.verificationCommands.length
    ? outcome.verificationCommands
    : project.verificationCommands;

  return [
    "## Likely Implementation Areas",
    bulletList(areas),
    "",
    "## Risks",
    bulletList(risks),
    "",
    "## Step-by-Step Plan",
    numberedList([
      "Read the current project memory and confirm the intended outcome boundaries.",
      "Identify the files or product surfaces that map directly to the acceptance criteria.",
      "Implement the smallest cohesive change that satisfies the outcome without expanding scope.",
      "Update empty, loading, and error handling where the outcome creates a visible workflow.",
      "Run verification commands and capture any failures as follow-up issues.",
    ]),
    "",
    "## Acceptance Focus",
    bulletList(criteria),
    "",
    "## Verification Strategy",
    bulletList(commands.map((command) => `Run \`${command}\` and record the status in the build log.`)),
  ].join("\n");
}

export function generateAgentPrompt(project: Project, memory: Memory, outcome: Outcome, targetAgent: TargetAgent) {
  const constraints = dedupe([...project.constraints, ...outcome.constraints]);
  const verification = outcome.verificationCommands.length
    ? outcome.verificationCommands
    : project.verificationCommands;
  const safetyRules = getProjectSafetyRules(project);

  return `# Outcome: ${outcome.title}

Target agent: ${targetAgent}
Project: ${project.name}

## Project Context
Use the project memory below:
- Product summary: ${memory.productSummary || "Not yet defined."}
- Current build state: ${memory.currentBuildState || "Not yet defined."}
- Active decisions: ${inlineList(memory.activeDecisions)}
- Constraints: ${constraints.length ? constraints.join("; ") : "No extra constraints recorded."}
- Roadmap: ${inlineList(memory.roadmap)}

## Goal
${outcome.goal}

## Acceptance Criteria
${bulletList(outcome.acceptanceCriteria)}

## Constraints
${bulletList(constraints)}

${safetyRules}

## Implementation Requirements
${outcome.generatedPlan || generateOutcomePlan(project, memory, outcome)}

## Verification
Run:
${bulletList(verification.map((command) => `\`${command}\``))}

## After Completion
Report:
- changed files
- commands run
- tests/build status
- remaining issues
- next recommended task

Also update or propose updates for:
- build log
- roadmap
- known issues
- decisions`;
}

export function ingestAgentResult(
  projectId: string,
  outcomeId: string | undefined,
  rawResult: string,
  options: {
    linkedAgentRunId?: string;
    verificationResults?: VerificationResult[];
    skippedVerificationReason?: string;
  } = {},
): BuildLog {
  const lines = splitLines(rawResult);
  const completedChanges = collectLines(lines, completedTerms);
  const filesChanged = extractFiles(rawResult);
  const newIssues = collectLines(lines, issueTerms);
  const decisionsExtracted = collectLines(lines, decisionTerms);
  const verificationResults = options.verificationResults || [];
  const repairSuggestions = repairSuggestionsFromVerification(verificationResults);
  const nextOutcomes = dedupe([...collectLines(lines, roadmapTerms), ...repairSuggestions]);
  const verificationStatus = verificationResults.length
    ? verificationStatusFromResults(verificationResults)
    : detectVerificationStatus(rawResult);
  const verificationSummary = verificationResults.length
    ? summarizeVerificationResults(verificationResults)
    : `Verification status inferred from agent result: ${verificationStatus}.`;

  return {
    id: uid("log"),
    projectId,
    outcomeId,
    linkedAgentRunId: options.linkedAgentRunId,
    rawResult,
    summary: summarizeResult(lines, completedChanges, filesChanged, verificationStatus),
    completedChanges,
    filesChanged,
    verificationStatus,
    verificationResults,
    verificationSummary,
    skippedVerificationReason: options.skippedVerificationReason,
    newIssues,
    decisionsExtracted,
    nextOutcomes,
    createdAt: new Date().toISOString(),
  };
}

export function memoryCompleteness(memory: Memory) {
  const fields: Array<keyof Memory> = [
    "productSummary",
    "vision",
    "targetUsers",
    "currentBuildState",
    "technicalArchitecture",
    "activeDecisions",
    "completedWork",
    "knownIssues",
    "roadmap",
  ];
  const filled = fields.filter((field) => String(memory[field]).trim().length > 12).length;
  return Math.round((filled / fields.length) * 100);
}

export function agentReadiness(project: Project, memory: Memory, outcomes: Outcome[]) {
  let score = 0;
  if (project.repoPathOrUrl.trim()) score += 20;
  if (project.preferredAgent) score += 15;
  if (memory.productSummary.trim()) score += 15;
  if (memory.currentBuildState.trim()) score += 15;
  if (memory.activeDecisions.trim()) score += 15;
  if (outcomes.some((outcome) => outcome.generatedPrompt.trim())) score += 20;
  return Math.min(score, 100);
}

export function verificationReadiness(project: Project, outcomes: Outcome[]) {
  const projectCommands = project.verificationCommands.length ? 50 : 0;
  const outcomeCommands = outcomes.some((outcome) => outcome.verificationCommands.length) ? 30 : 0;
  const readyOutcome = outcomes.some((outcome) => ["Ready", "Running", "Needs Review", "Verified"].includes(outcome.status))
    ? 20
    : 0;
  return projectCommands + outcomeCommands + readyOutcome;
}

function collectLines(lines: string[], terms: string[]) {
  return lines.filter((line) => hasAny(line, terms));
}

function hasAny(value: string, terms: string[]) {
  const lower = value.toLowerCase();
  return terms.some((term) => lower.includes(term));
}

function mergeText(existing: string, next: string) {
  if (!next.trim()) return existing;
  if (!existing.trim()) return next;
  if (existing.toLowerCase().includes(next.toLowerCase())) return existing;
  return `${existing.trim()}\n${next.trim()}`;
}

function mergeListText(existing: string, incoming: string[]) {
  const merged = dedupe([...fieldLines(existing), ...incoming]);
  return linesToText(merged);
}

function keywordFromLine(line: string) {
  const lower = line.toLowerCase();
  return technicalTerms.find((term) => lower.includes(term)) || line.split(/\s+/).slice(0, 3).join(" ");
}

function summarizeProjectHistoryAnalysis(
  sourceType: ProjectImportSourceType,
  analysis: MemoryAnalysis,
  detectedThemes: string[],
  pageCount?: number,
) {
  const sections = [
    `${analysis.detected.decisions.length} decision signal${analysis.detected.decisions.length === 1 ? "" : "s"}`,
    `${analysis.detected.completedWork.length} completed-work signal${analysis.detected.completedWork.length === 1 ? "" : "s"}`,
    `${analysis.detected.knownIssues.length} issue signal${analysis.detected.knownIssues.length === 1 ? "" : "s"}`,
    `${analysis.detected.roadmap.length} roadmap signal${analysis.detected.roadmap.length === 1 ? "" : "s"}`,
    `${analysis.detected.technicalSignals.length} architecture signal${analysis.detected.technicalSignals.length === 1 ? "" : "s"}`,
  ];
  const pageText = sourceType === "PDF" && pageCount ? ` across ${pageCount} page${pageCount === 1 ? "" : "s"}` : "";
  const themeText = detectedThemes.length ? ` Themes: ${detectedThemes.slice(0, 5).join(", ")}.` : "";
  return `Brainpress analyzed ${sourceType === "PDF" ? "a PDF" : "pasted text"}${pageText} and found ${sections.join(", ")}.${themeText}`;
}

function generateSuggestedOutcomesFromHistory(
  analysis: MemoryAnalysis,
  project: Project,
  currentMemory: Memory,
): SuggestedOutcome[] {
  const constraints = dedupe([...project.constraints, ...fieldLines(currentMemory.activeDecisions)]);
  const verificationCommands = project.verificationCommands.length
    ? project.verificationCommands
    : ["npm run typecheck", "npm test", "npm run build"];
  const suggestions: SuggestedOutcome[] = [];

  if (analysis.detected.roadmap.length) {
    suggestions.push({
      title: titleFromSignal(analysis.detected.roadmap[0], "Clarify product roadmap from imported source"),
      goal: "Turn the imported roadmap signals into a focused, verifiable product outcome.",
      acceptanceCriteria: [
        "Roadmap item is narrowed to one buildable outcome.",
        "Acceptance criteria are explicit and measurable.",
        "Verification commands are represented before agent handoff.",
      ],
      constraints,
      verificationCommands,
    });
  }

  if (analysis.detected.knownIssues.length) {
    suggestions.push({
      title: titleFromSignal(analysis.detected.knownIssues[0], "Fix known issues extracted from project history"),
      goal: "Resolve the clearest issue found in the imported project history without expanding scope.",
      acceptanceCriteria: [
        "The extracted issue is reproduced or clearly understood.",
        "A minimal fix is implemented.",
        "Verification output is captured in a build log.",
      ],
      constraints,
      verificationCommands,
    });
  }

  if (analysis.detected.technicalSignals.length) {
    suggestions.push({
      title: "Create Codex task from imported technical architecture",
      goal: "Convert the imported architecture notes into a safe, agent-ready implementation task.",
      acceptanceCriteria: [
        "Relevant files or architecture areas are identified.",
        "The task keeps to the selected project constraints.",
        "Verification commands are included in the prompt.",
      ],
      constraints,
      verificationCommands,
    });
  }

  if (analysis.memory.openQuestions.trim() || analysis.detected.decisions.length) {
    suggestions.push({
      title: "Turn open questions into product decisions",
      goal: "Review imported decisions and unresolved questions, then convert them into explicit product direction.",
      acceptanceCriteria: [
        "Open questions are listed and grouped by product area.",
        "At least one decision is proposed for each high-impact question.",
        "Decisions are added back to Brainpress memory.",
      ],
      constraints,
      verificationCommands,
    });
  }

  suggestions.push({
    title: "Clarify product roadmap from imported research",
    goal: "Summarize the imported source into a short roadmap update and next execution step.",
    acceptanceCriteria: [
      "Imported themes are summarized.",
      "Next outcome is written with goal, acceptance criteria, and constraints.",
      "Memory updates are reviewed before saving.",
    ],
    constraints,
    verificationCommands,
  });

  return dedupeSuggestions(suggestions).slice(0, 5);
}

function dedupeSuggestions(suggestions: SuggestedOutcome[]) {
  const seen = new Set<string>();
  return suggestions.filter((suggestion) => {
    const key = suggestion.title.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function titleFromSignal(signal: string, fallback: string) {
  const cleaned = signal
    .replace(/^(next|todo|need to|build|add|issue|bug|problem|risk)[:\s-]*/i, "")
    .replace(/[.。]$/, "")
    .trim();
  if (!cleaned) return fallback;
  const words = cleaned.split(/\s+/).slice(0, 9).join(" ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function safePreview(value: string) {
  const preview = value.slice(0, 4_000);
  return value.length > preview.length ? `${preview}\n\n[Preview truncated. Full extracted text is stored in the source.]` : preview;
}

function inferImplementationAreas(outcome: Outcome, memory: Memory) {
  const text = `${outcome.title} ${outcome.goal} ${outcome.acceptanceCriteria.join(" ")} ${memory.technicalArchitecture}`.toLowerCase();
  const areas = ["Product surface mapped to the outcome", "State/data handling for acceptance criteria"];
  if (text.includes("dashboard")) areas.push("Dashboard layout, metrics, and visual hierarchy");
  if (text.includes("chart") || text.includes("trend")) areas.push("Charts, trend calculations, and empty states");
  if (text.includes("leaderboard") || text.includes("user")) areas.push("Ranking/table components and user-facing labels");
  if (text.includes("test") || text.includes("build")) areas.push("Verification scripts and build configuration");
  return dedupe(areas);
}

function inferRisks(outcome: Outcome, memory: Memory, project: Project) {
  const risks = [
    "Expanding beyond the requested outcome instead of closing the loop.",
    "Producing a prompt that lacks concrete verification steps.",
  ];
  if (memory.knownIssues.trim()) risks.push("Known issues may mask whether this outcome is actually verified.");
  if (!project.repoPathOrUrl.trim()) risks.push("Repo path is missing, so an agent may need extra handoff context.");
  if (!outcome.acceptanceCriteria.length) risks.push("Acceptance criteria are thin, making verification subjective.");
  return risks;
}

function detectVerificationStatus(raw: string): VerificationStatus {
  const lower = raw.toLowerCase();
  const hasPass = /(pass|passed|success|successful|typecheck passed|build passed|tests passed)/.test(lower);
  const hasFail = /(fail|failed|error|broken|type error|test failed|build failed)/.test(lower);
  if (hasPass && hasFail) return "Mixed";
  if (hasPass) return "Passing";
  if (hasFail) return "Failing";
  if (lower.includes("not run") || lower.includes("did not run")) return "Not run";
  return "Unknown";
}

function extractFiles(raw: string) {
  const matches = raw.match(/\b[\w./\\-]+\.(?:tsx|ts|jsx|js|css|scss|md|json|mjs|cjs|html|yml|yaml)\b/g) || [];
  return dedupe(matches.map((file) => file.replace(/\\/g, "/")));
}

function summarizeResult(
  lines: string[],
  completedChanges: string[],
  filesChanged: string[],
  verificationStatus: VerificationStatus,
) {
  if (!lines.length) {
    return "No result text was provided. Paste an agent completion report to generate a structured build log.";
  }

  const firstUsefulLine = lines.find((line) => line.length > 20) || lines[0];
  const changeCount = completedChanges.length || filesChanged.length;
  return `${firstUsefulLine} ${changeCount ? `Brainpress detected ${changeCount} concrete change signal${changeCount === 1 ? "" : "s"}.` : "No concrete change signals were detected."} Verification status: ${verificationStatus}.`;
}

function bulletList(items: string[]) {
  if (!items.length) return "- Not specified yet.";
  return items.map((item) => `- ${item}`).join("\n");
}

function numberedList(items: string[]) {
  return items.map((item, index) => `${index + 1}. ${item}`).join("\n");
}

function inlineList(value: string) {
  const lines = fieldLines(value);
  return lines.length ? lines.join("; ") : "Not yet defined.";
}
