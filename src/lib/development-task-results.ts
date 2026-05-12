import { fieldLines, uid } from "@/lib/brainpress";
import { updateDevelopmentTaskStatus } from "@/lib/development-tasks";
import type {
  AcceptanceCriteriaReview,
  AcceptanceCriteriaReviewStatus,
  DevelopmentTask,
  DevelopmentTaskCommandResult,
  DevelopmentTaskManualQaResult,
  DevelopmentTaskRecommendedStatus,
  DevelopmentTaskResult,
  DevelopmentTaskResultSource,
  DevelopmentTaskStatus,
  DevelopmentTaskVerificationResultStatus,
} from "@/lib/types";

const filePathPattern =
  /\b(?:[\w.-]+[\\/])+[\w.@+-]+\.(?:tsx|ts|jsx|js|json|md|mdx|css|scss|html|prisma|sql|yml|yaml|mjs|cjs|txt|log)\b|\b[\w.@+-]+\.(?:tsx|ts|jsx|js|json|md|mdx|css|scss|prisma|sql|yml|yaml|mjs|cjs)\b/g;
const commandPattern =
  /\b(?:(?:npm|pnpm|yarn)\s+(?:run\s+)?[\w:-]+(?:\s+[\w:./=-]+)*|npm\s+test|npx\s+[\w@./:-]+(?:\s+[\w:./=-]+)*|node\s+[\w./-]+(?:\s+[\w:./=-]+)*|tsx\s+[\w./-]+(?:\s+[\w:./=-]+)*|tsc(?:\.cmd)?\s+--noEmit|next(?:\.cmd)?\s+build|playwright\s+test(?:\s+[\w:./=-]+)*)/gi;
const prUrlPattern = /https:\/\/github\.com\/[^\s)]+\/pull\/\d+/i;
const passPattern = /\b(passed|pass|success|successful|succeeded|green|ok|verified|completed)\b/i;
const failPattern = /\b(failed|failure|error|errored|broken|could not run|cannot run|did not pass|red|blocked)\b/i;
const skippedPattern = /\b(skipped|not run|did not run|was not run|intentionally skipped)\b/i;
const browserEvidencePattern = /\b(browser|manual qa|manual verification|verified in browser|checked in browser|playwright|localhost|reload|uploaded pdf|pdf a|pdf b|same-name|same name|localstorage|sources ui|source count|re-analysis|reanalysis)\b/i;

export function parseDevelopmentTaskResult(
  task: DevelopmentTask,
  rawText: string,
  source: DevelopmentTaskResultSource,
  now = new Date().toISOString(),
): DevelopmentTaskResult {
  const cleanRaw = rawText.trim();
  const lines = fieldLines(cleanRaw);
  const changedFiles = extractChangedFiles(cleanRaw);
  const verificationResults = extractCommandResults(lines);
  const commandsRun = verificationResults.map((result) => result.command);
  const manualQaResults = extractManualQaResults(task, lines, cleanRaw);
  const risks = uniqueCompact([
    ...extractSectionItems(lines, ["risk", "risks", "caveat", "caveats"]),
    ...lines.filter((line) => /\brisk|caveat|danger|regression\b/i.test(line)),
  ]).slice(0, 8);
  const remainingIssues = uniqueCompact([
    ...extractSectionItems(lines, ["remaining issue", "remaining issues", "known issue", "known issues", "issue", "issues", "blocker", "blockers"]),
    ...lines.filter((line) => /\bremaining|issue|bug|broken|blocked|could not|missing\b/i.test(line)),
  ]).slice(0, 10);
  const nextTasks = uniqueCompact([
    ...extractSectionItems(lines, ["next", "next task", "next tasks", "follow-up", "follow up", "followups", "remaining"]),
    ...lines.filter((line) => /\bnext|follow-up|follow up|todo|remaining task|continue\b/i.test(line)),
  ]).slice(0, 10);
  const acceptanceCriteriaReview = reviewAcceptanceCriteria(task, {
    rawText: cleanRaw,
    verificationResults,
    manualQaResults,
  });
  const recommendedStatus = recommendDevelopmentTaskStatus(acceptanceCriteriaReview, verificationResults);
  const summary = summarizeParsedResult(lines, changedFiles, verificationResults, risks, remainingIssues);
  const prUrl = cleanRaw.match(prUrlPattern)?.[0];

  return {
    id: uid("taskresult"),
    taskId: task.id,
    source,
    rawText: cleanRaw,
    summary,
    changedFiles,
    commandsRun,
    verificationResults,
    manualQaResults,
    risks,
    remainingIssues,
    nextTasks,
    prUrl,
    recommendedStatus,
    acceptanceCriteriaReview,
    createdAt: now,
  };
}

export function normalizeDevelopmentTaskResult(result: Partial<DevelopmentTaskResult>): DevelopmentTaskResult {
  const now = new Date().toISOString();
  const verificationResults = Array.isArray(result.verificationResults)
    ? result.verificationResults.map(normalizeCommandResult)
    : [];
  const acceptanceCriteriaReview = Array.isArray(result.acceptanceCriteriaReview)
    ? result.acceptanceCriteriaReview.map(normalizeCriteriaReview)
    : [];

  return {
    id: result.id || uid("taskresult"),
    taskId: result.taskId || "",
    source: isResultSource(result.source) ? result.source : "manual_import",
    rawText: result.rawText || "",
    summary: result.summary || summarizeParsedResult(fieldLines(result.rawText || ""), result.changedFiles || [], verificationResults, result.risks || [], result.remainingIssues || []),
    changedFiles: Array.isArray(result.changedFiles) ? uniqueCompact(result.changedFiles).slice(0, 40) : [],
    commandsRun: Array.isArray(result.commandsRun) ? uniqueCompact(result.commandsRun).slice(0, 20) : verificationResults.map((item) => item.command),
    verificationResults,
    manualQaResults: Array.isArray(result.manualQaResults) ? result.manualQaResults.map(normalizeManualQaResult) : [],
    risks: Array.isArray(result.risks) ? uniqueCompact(result.risks).slice(0, 12) : [],
    remainingIssues: Array.isArray(result.remainingIssues) ? uniqueCompact(result.remainingIssues).slice(0, 12) : [],
    nextTasks: Array.isArray(result.nextTasks) ? uniqueCompact(result.nextTasks).slice(0, 12) : [],
    prUrl: result.prUrl,
    recommendedStatus: isRecommendedStatus(result.recommendedStatus) ? result.recommendedStatus : "needs_review",
    acceptanceCriteriaReview,
    createdAt: result.createdAt || now,
  };
}

export function applyRecommendedDevelopmentTaskStatus(
  task: DevelopmentTask,
  result: DevelopmentTaskResult,
  now = new Date().toISOString(),
): DevelopmentTask {
  const nextStatus = taskStatusFromRecommendedResult(result.recommendedStatus);
  return updateDevelopmentTaskStatus(
    {
      ...task,
      resultRaw: result.rawText,
      resultSummary: result.summary,
      prUrl: result.prUrl || task.prUrl,
    },
    nextStatus,
    `Applied result review recommendation: ${result.recommendedStatus}.`,
    now,
  );
}

export function taskStatusFromRecommendedResult(status: DevelopmentTaskRecommendedStatus): DevelopmentTaskStatus {
  if (status === "verified") return "verified";
  if (status === "failed") return "failed";
  return "needs_review";
}

export function reviewAcceptanceCriteria(
  task: Pick<DevelopmentTask, "acceptanceCriteria" | "manualQaSteps">,
  evidence: {
    rawText: string;
    verificationResults: DevelopmentTaskCommandResult[];
    manualQaResults: DevelopmentTaskManualQaResult[];
  },
): AcceptanceCriteriaReview[] {
  return task.acceptanceCriteria.map((criterion) => reviewOneCriterion(criterion, evidence));
}

export function recommendDevelopmentTaskStatus(
  reviews: AcceptanceCriteriaReview[],
  verificationResults: DevelopmentTaskCommandResult[],
): DevelopmentTaskRecommendedStatus {
  if (!reviews.length) {
    return verificationResults.some((result) => result.status === "failed") ? "failed" : "needs_review";
  }

  const hasFailedCommand = verificationResults.some((result) => result.status === "failed");
  const hasUnmet = reviews.some((review) => review.status === "unmet");
  const hasUnknown = reviews.some((review) => review.status === "unknown");
  const hasPartial = reviews.some((review) => review.status === "partial");
  const allMet = reviews.every((review) => review.status === "met");

  if (hasFailedCommand || hasUnmet) return "failed";
  if (allMet) return "verified";
  if (hasPartial || hasUnknown) return reviews.some((review) => review.status === "met") ? "partially_verified" : "needs_review";
  return "needs_review";
}

function reviewOneCriterion(
  criterion: string,
  evidence: {
    rawText: string;
    verificationResults: DevelopmentTaskCommandResult[];
    manualQaResults: DevelopmentTaskManualQaResult[];
  },
): AcceptanceCriteriaReview {
  const normalizedCriterion = normalizeText(criterion);
  const command = commandForCriterion(normalizedCriterion, evidence.verificationResults);
  if (command) {
    if (command.status === "passed") {
      return { criterion, status: "met", evidence: command.evidence || `${command.command} passed.` };
    }
    if (command.status === "failed") {
      return {
        criterion,
        status: "unmet",
        evidence: command.evidence || `${command.command} failed.`,
        requiredFollowUp: `Fix failing verification for: ${command.command}`,
      };
    }
    if (command.status === "skipped") {
      return {
        criterion,
        status: "unknown",
        evidence: command.evidence || `${command.command} was skipped.`,
        requiredFollowUp: `Run ${command.command} or explain why it was intentionally skipped.`,
      };
    }
    return {
      criterion,
      status: "unknown",
      evidence: `No pass/fail evidence found for ${command.command}.`,
      requiredFollowUp: `Run ${command.command}.`,
    };
  }

  if (requiresManualEvidence(normalizedCriterion)) {
    return reviewManualCriterion(criterion, normalizedCriterion, evidence);
  }

  return reviewGenericCriterion(criterion, normalizedCriterion, evidence.rawText);
}

function reviewManualCriterion(
  criterion: string,
  normalizedCriterion: string,
  evidence: {
    rawText: string;
    manualQaResults: DevelopmentTaskManualQaResult[];
  },
): AcceptanceCriteriaReview {
  const matchingQa = evidence.manualQaResults.find((result) => hasMeaningfulOverlap(normalizedCriterion, normalizeText(result.step)));
  if (matchingQa?.status === "passed") {
    return { criterion, status: "met", evidence: matchingQa.evidence || matchingQa.step };
  }
  if (matchingQa?.status === "failed") {
    return {
      criterion,
      status: "unmet",
      evidence: matchingQa.evidence || matchingQa.step,
      requiredFollowUp: "Fix the failed manual/browser verification.",
    };
  }

  const rawEvidence = findEvidenceLine(evidence.rawText, normalizedCriterion);
  if (!rawEvidence || !browserEvidencePattern.test(rawEvidence)) {
    return {
      criterion,
      status: "unknown",
      evidence: "No explicit browser or manual QA evidence was found.",
      requiredFollowUp: "Run the browser/manual QA flow and record the result.",
    };
  }
  if (failPattern.test(rawEvidence)) {
    return {
      criterion,
      status: "unmet",
      evidence: rawEvidence,
      requiredFollowUp: "Fix the failed browser/manual verification.",
    };
  }
  if (passPattern.test(rawEvidence)) {
    return { criterion, status: "met", evidence: rawEvidence };
  }
  return {
    criterion,
    status: "partial",
    evidence: rawEvidence,
    requiredFollowUp: "Add explicit pass/fail browser verification evidence.",
  };
}

function reviewGenericCriterion(criterion: string, normalizedCriterion: string, rawText: string): AcceptanceCriteriaReview {
  const evidenceLine = findEvidenceLine(rawText, normalizedCriterion);
  if (!evidenceLine) {
    return {
      criterion,
      status: "unknown",
      evidence: "No direct evidence found in the imported result.",
      requiredFollowUp: "Ask the agent to report this acceptance check explicitly.",
    };
  }
  if (failPattern.test(evidenceLine)) {
    return {
      criterion,
      status: "unmet",
      evidence: evidenceLine,
      requiredFollowUp: "Repair the failed acceptance criterion.",
    };
  }
  if (passPattern.test(evidenceLine)) {
    return { criterion, status: "met", evidence: evidenceLine };
  }
  return {
    criterion,
    status: "partial",
    evidence: evidenceLine,
    requiredFollowUp: "Confirm this criterion with explicit pass/fail evidence.",
  };
}

function extractChangedFiles(rawText: string) {
  const matches = rawText.match(filePathPattern) || [];
  return uniqueCompact(matches.map((value) => trimPunctuation(value))).slice(0, 40);
}

function extractCommandResults(lines: string[]): DevelopmentTaskCommandResult[] {
  const results = new Map<string, DevelopmentTaskCommandResult>();

  for (const line of lines) {
    for (const match of line.matchAll(commandPattern)) {
      const command = normalizeCommand(match[0]);
      const status = inferStatusFromText(line);
      const existing = results.get(command);
      results.set(command, {
        command,
        status: combineStatuses(existing?.status, status),
        evidence: existing?.evidence ? `${existing.evidence}\n${line}` : line,
      });
    }
  }

  return [...results.values()].slice(0, 20);
}

function extractManualQaResults(task: Pick<DevelopmentTask, "manualQaSteps">, lines: string[], rawText: string): DevelopmentTaskManualQaResult[] {
  const directQa = lines
    .filter((line) => browserEvidencePattern.test(line) || /\bmanual qa|browser verification|qa\b/i.test(line))
    .map((line) => ({
      step: stripListMarker(line),
      status: inferStatusFromText(line),
      evidence: line,
    }));
  const qaFromSteps = task.manualQaSteps
    .map((step) => {
      const evidence = findEvidenceLine(rawText, normalizeText(step));
      return evidence
        ? {
            step,
            status: inferStatusFromText(evidence),
            evidence,
          }
        : null;
    })
    .filter(Boolean) as DevelopmentTaskManualQaResult[];

  const byStep = new Map<string, DevelopmentTaskManualQaResult>();
  for (const result of [...directQa, ...qaFromSteps]) {
    const key = normalizeText(result.step).slice(0, 80);
    const existing = byStep.get(key);
    byStep.set(key, {
      step: result.step,
      status: combineStatuses(existing?.status, result.status),
      evidence: existing?.evidence && existing.evidence !== result.evidence ? `${existing.evidence}\n${result.evidence}` : result.evidence,
    });
  }

  return [...byStep.values()].slice(0, 12);
}

function extractSectionItems(lines: string[], headingTerms: string[]) {
  const items: string[] = [];
  let active = false;

  for (const line of lines) {
    const stripped = stripListMarker(line);
    const normalized = normalizeHeading(stripped);
    const isHeading = /^[A-Z][\w\s/&-]{1,40}:?$/.test(stripped) || /^#{1,4}\s+/.test(line);
    if (isHeading) {
      active = headingTerms.some((term) => normalized.includes(term));
      continue;
    }
    if (active) {
      if (/^\s*$/.test(line)) continue;
      if (/^[A-Z][\w\s/&-]{1,40}:$/.test(stripped)) {
        active = false;
        continue;
      }
      items.push(stripped);
    }
  }

  return items;
}

function summarizeParsedResult(
  lines: string[],
  changedFiles: string[],
  verificationResults: DevelopmentTaskCommandResult[],
  risks: string[],
  remainingIssues: string[],
) {
  const summaryLines = extractSectionItems(lines, ["summary", "result summary", "what changed"]).slice(0, 4);
  if (summaryLines.length) return summaryLines.join("\n");

  const changes = lines.filter((line) => /\bimplemented|fixed|added|updated|changed|completed\b/i.test(line)).slice(0, 3);
  const commandSummary = verificationResults.slice(0, 3).map((result) => `${result.command}: ${result.status}`);
  const riskSummary = [...risks, ...remainingIssues].slice(0, 2);
  return [...changes, ...commandSummary, ...riskSummary, changedFiles.length ? `${changedFiles.length} changed file(s) detected.` : ""]
    .filter(Boolean)
    .slice(0, 7)
    .join("\n");
}

function commandForCriterion(criterion: string, results: DevelopmentTaskCommandResult[]) {
  const wantedCommand = extractCommandFromCriterion(criterion);
  if (wantedCommand) {
    return results.find((result) => commandsEquivalent(result.command, wantedCommand)) || {
      command: wantedCommand,
      status: "unknown" as const,
      evidence: "",
    };
  }

  const keyword = commandKeywordForCriterion(criterion);
  if (!keyword) return undefined;
  return results.find((result) => normalizeText(result.command).includes(keyword)) || {
    command: keyword === "test" ? "npm test" : `npm run ${keyword}`,
    status: "unknown" as const,
    evidence: "",
  };
}

function extractCommandFromCriterion(criterion: string) {
  if (criterion.includes("npm run typecheck")) return "npm run typecheck";
  if (criterion.includes("npm test")) return "npm test";
  if (criterion.includes("npm run build")) return "npm run build";
  if (criterion.includes("npm run lint")) return "npm run lint";
  return "";
}

function commandKeywordForCriterion(criterion: string) {
  if (/\btypecheck\b/.test(criterion)) return "typecheck";
  if (/\btests?\b/.test(criterion)) return "test";
  if (/\bbuild\b/.test(criterion)) return "build";
  if (/\blint\b/.test(criterion)) return "lint";
  return "";
}

function commandsEquivalent(a: string, b: string) {
  const left = normalizeCommand(a);
  const right = normalizeCommand(b);
  return left === right || left.includes(right) || right.includes(left);
}

function requiresManualEvidence(criterion: string) {
  return /\b(browser|manual|qa|reload|ui|upload|pdf|source|same-name|same name|localstorage|consolidated|re-analysis|reanalysis)\b/i.test(
    criterion,
  );
}

function findEvidenceLine(rawText: string, normalizedNeedle: string) {
  const wanted = meaningfulWords(normalizedNeedle);
  if (!wanted.length) return "";
  const lines = fieldLines(rawText);
  const scored = lines
    .map((line) => {
      const normalizedLine = normalizeText(line);
      const score = wanted.filter((word) => normalizedLine.includes(word)).length;
      return { line, score };
    })
    .filter((item) => item.score >= Math.min(2, wanted.length))
    .sort((a, b) => b.score - a.score);
  return scored[0]?.line || "";
}

function hasMeaningfulOverlap(a: string, b: string) {
  const words = meaningfulWords(a);
  if (!words.length) return false;
  const haystack = normalizeText(b);
  return words.filter((word) => haystack.includes(word)).length >= Math.min(2, words.length);
}

function meaningfulWords(value: string) {
  return uniqueCompact(
    normalizeText(value)
      .split(/\s+/)
      .filter((word) => word.length > 3 && !["pass", "passes", "save", "saved", "both", "with", "from", "that", "this", "into"].includes(word)),
  ).slice(0, 8);
}

function inferStatusFromText(value: string): DevelopmentTaskVerificationResultStatus {
  if (skippedPattern.test(value)) return "skipped";
  if (failPattern.test(value)) return "failed";
  if (passPattern.test(value)) return "passed";
  return "unknown";
}

function combineStatuses(
  first: DevelopmentTaskVerificationResultStatus | undefined,
  second: DevelopmentTaskVerificationResultStatus,
): DevelopmentTaskVerificationResultStatus {
  if (first === "failed" || second === "failed") return "failed";
  if (first === "passed" || second === "passed") return "passed";
  if (first === "skipped" || second === "skipped") return "skipped";
  return first || second;
}

function normalizeCommand(command: string) {
  return command
    .replace(/\.cmd\b/gi, "")
    .replace(/\s+(?:passed|pass|failed|failure|error|errored|succeeded|success|successful|completed|skipped|not run|did not run)\b.*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9./:_-]+/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeHeading(value: string) {
  return value.toLowerCase().replace(/^#+\s*/, "").replace(/:$/, "").trim();
}

function stripListMarker(value: string) {
  return value.replace(/^\s*(?:[-*]|\d+[.)])\s*/, "").replace(/^#+\s*/, "").replace(/:$/, "").trim();
}

function trimPunctuation(value: string) {
  return value.replace(/[.,;:)]+$/g, "");
}

function uniqueCompact(values: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const clean = stripListMarker(String(value || "")).trim();
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(clean);
  }
  return result;
}

function normalizeCommandResult(result: Partial<DevelopmentTaskCommandResult>): DevelopmentTaskCommandResult {
  return {
    command: result.command || "",
    status: isVerificationStatus(result.status) ? result.status : "unknown",
    evidence: result.evidence || "",
  };
}

function normalizeManualQaResult(result: Partial<DevelopmentTaskManualQaResult>): DevelopmentTaskManualQaResult {
  return {
    step: result.step || "",
    status: isVerificationStatus(result.status) ? result.status : "unknown",
    evidence: result.evidence || "",
  };
}

function normalizeCriteriaReview(result: Partial<AcceptanceCriteriaReview>): AcceptanceCriteriaReview {
  return {
    criterion: result.criterion || "",
    status: isCriteriaStatus(result.status) ? result.status : "unknown",
    evidence: result.evidence || "",
    requiredFollowUp: result.requiredFollowUp,
  };
}

function isVerificationStatus(value: unknown): value is DevelopmentTaskVerificationResultStatus {
  return value === "passed" || value === "failed" || value === "unknown" || value === "skipped";
}

function isCriteriaStatus(value: unknown): value is AcceptanceCriteriaReviewStatus {
  return value === "met" || value === "unmet" || value === "unknown" || value === "partial";
}

function isRecommendedStatus(value: unknown): value is DevelopmentTaskRecommendedStatus {
  return value === "needs_review" || value === "verified" || value === "failed" || value === "partially_verified";
}

function isResultSource(value: unknown): value is DevelopmentTaskResultSource {
  return value === "local_bridge" || value === "manual_import" || value === "codex_cloud" || value === "github_pr";
}
