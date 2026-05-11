import {
  analyzeProjectHistory,
  dedupe,
  fieldLines,
  linesToText,
  type ProjectHistoryAnalysis,
  type ProjectHistoryMetadata,
} from "@/lib/brainpress";
import type { ProjectImportMemorySections, SuggestedOutcome } from "@/lib/types";

export interface OpenAIMemoryAnalysis {
  analysisSummary: string;
  plainEnglishSummary: string;
  productSummary: string;
  currentBuildState: string[];
  technicalArchitecture: string[];
  activeDecisions: string[];
  completedWork: string[];
  knownIssues: string[];
  openQuestions: string[];
  roadmap: string[];
  nextRecommendedOutcome: {
    title: string;
    description: string;
    acceptanceChecks: string[];
  };
  keyFacts: string[];
  discardedNoise: string[];
}

export interface OpenAIMemoryAnalyzerOptions {
  env?: Partial<NodeJS.ProcessEnv>;
  fetcher?: typeof fetch;
}

interface OpenAIMemoryAnalyzerSuccess {
  status: "success";
  analysis: OpenAIMemoryAnalysis;
}

interface OpenAIMemoryAnalyzerFailure {
  status: "missing_key" | "request_failed" | "invalid_response";
  warning: string;
}

type OpenAIMemoryAnalyzerResult = OpenAIMemoryAnalyzerSuccess | OpenAIMemoryAnalyzerFailure;

export const maxOpenAIInputCharacters = 60_000;
const defaultOpenAIModel = "gpt-4o-mini";

export const openAIMemoryAnalysisSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "analysisSummary",
    "plainEnglishSummary",
    "productSummary",
    "currentBuildState",
    "technicalArchitecture",
    "activeDecisions",
    "completedWork",
    "knownIssues",
    "openQuestions",
    "roadmap",
    "nextRecommendedOutcome",
    "keyFacts",
    "discardedNoise",
  ],
  properties: {
    analysisSummary: { type: "string" },
    plainEnglishSummary: { type: "string" },
    productSummary: { type: "string" },
    currentBuildState: { type: "array", items: { type: "string" } },
    technicalArchitecture: { type: "array", items: { type: "string" } },
    activeDecisions: { type: "array", items: { type: "string" } },
    completedWork: { type: "array", items: { type: "string" } },
    knownIssues: { type: "array", items: { type: "string" } },
    openQuestions: { type: "array", items: { type: "string" } },
    roadmap: { type: "array", items: { type: "string" } },
    nextRecommendedOutcome: {
      type: "object",
      additionalProperties: false,
      required: ["title", "description", "acceptanceChecks"],
      properties: {
        title: { type: "string" },
        description: { type: "string" },
        acceptanceChecks: { type: "array", items: { type: "string" } },
      },
    },
    keyFacts: { type: "array", items: { type: "string" } },
    discardedNoise: { type: "array", items: { type: "string" } },
  },
} as const;

export async function analyzeProjectHistoryWithOptionalOpenAI(
  inputText: string,
  metadata: ProjectHistoryMetadata,
  options: OpenAIMemoryAnalyzerOptions = {},
): Promise<ProjectHistoryAnalysis> {
  const localAnalysis = analyzeProjectHistory(inputText, metadata);
  const openAIResult = await requestOpenAIMemoryAnalysis(
    {
      projectName: metadata.project.name,
      projectGoal: metadata.project.primaryGoal,
      sourceTitle: metadata.title,
      fileName: metadata.fileName,
      extractedText: inputText,
    },
    options,
  );

  if (openAIResult.status !== "success") {
    return markLocalFallback(localAnalysis, openAIResult.warning);
  }

  return applyOpenAIMemoryAnalysis(localAnalysis, openAIResult.analysis, metadata);
}

export async function requestOpenAIMemoryAnalysis(
  input: {
    projectName: string;
    projectGoal: string;
    sourceTitle: string;
    fileName?: string;
    extractedText: string;
  },
  options: OpenAIMemoryAnalyzerOptions = {},
): Promise<OpenAIMemoryAnalyzerResult> {
  const env = options.env || process.env;
  const apiKey = env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return {
      status: "missing_key",
      warning: "AI analysis unavailable: OPENAI_API_KEY is not set. Local analysis used.",
    };
  }

  const fetcher = options.fetcher || fetch;
  const model = env.OPENAI_MEMORY_MODEL?.trim() || defaultOpenAIModel;

  try {
    const response = await fetcher("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        input: [
          {
            role: "system",
            content: [
              {
                type: "input_text",
                text: [
                  "You are Brainpress, a project-memory analyst for non-technical founders.",
                  "Return concise JSON only.",
                  "Write for a founder who needs clear project understanding, not raw transcript fragments.",
                  "Prefer 3 to 6 bullets per section. Remove duplicates, broken fragments, duplicated URLs, and repeated commands.",
                  "Preserve important facts, URLs, commands, file paths, errors, decisions, and next steps only when they matter.",
                  "Do not invent implementation facts. Put unclear facts in openQuestions.",
                  "Use simple labels mentally: what is done, what is broken, what to do next.",
                ].join("\n"),
              },
            ],
          },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: buildOpenAIMemoryPrompt(input),
              },
            ],
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "brainpress_pdf_memory_analysis",
            strict: true,
            schema: openAIMemoryAnalysisSchema,
          },
        },
        max_output_tokens: 2500,
      }),
    });

    if (!response.ok) {
      return {
        status: "request_failed",
        warning: `AI analysis request failed (${response.status}). Local analysis used.`,
      };
    }

    const payload = await response.json();
    const outputText = extractOpenAIOutputText(payload);
    const parsed = parseOpenAIJson(outputText);
    if (!parsed) {
      return {
        status: "invalid_response",
        warning: "AI analysis returned invalid JSON. Local analysis used.",
      };
    }

    return {
      status: "success",
      analysis: parsed,
    };
  } catch (error) {
    return {
      status: "request_failed",
      warning: `AI analysis could not complete. Local analysis used. ${error instanceof Error ? error.message : ""}`.trim(),
    };
  }
}

export function validateOpenAIMemoryAnalysis(value: unknown): OpenAIMemoryAnalysis | null {
  if (!isRecord(value)) return null;
  const nextRecommendedOutcome = value.nextRecommendedOutcome;
  if (!isRecord(nextRecommendedOutcome)) return null;

  const analysis: OpenAIMemoryAnalysis = {
    analysisSummary: cleanText(value.analysisSummary),
    plainEnglishSummary: cleanText(value.plainEnglishSummary),
    productSummary: cleanText(value.productSummary),
    currentBuildState: cleanStringArray(value.currentBuildState, 6),
    technicalArchitecture: cleanStringArray(value.technicalArchitecture, 6),
    activeDecisions: cleanStringArray(value.activeDecisions, 6),
    completedWork: cleanStringArray(value.completedWork, 6),
    knownIssues: cleanStringArray(value.knownIssues, 6),
    openQuestions: cleanStringArray(value.openQuestions, 6),
    roadmap: cleanStringArray(value.roadmap, 6),
    nextRecommendedOutcome: {
      title: cleanText(nextRecommendedOutcome.title),
      description: cleanText(nextRecommendedOutcome.description),
      acceptanceChecks: cleanStringArray(nextRecommendedOutcome.acceptanceChecks, 6),
    },
    keyFacts: cleanStringArray(value.keyFacts, 10),
    discardedNoise: cleanStringArray(value.discardedNoise, 8),
  };

  if (!analysis.analysisSummary || !analysis.plainEnglishSummary || !analysis.productSummary) {
    return null;
  }

  return analysis;
}

export function applyOpenAIMemoryAnalysis(
  localAnalysis: ProjectHistoryAnalysis,
  aiAnalysis: OpenAIMemoryAnalysis,
  metadata: ProjectHistoryMetadata,
): ProjectHistoryAnalysis {
  const memorySections: ProjectImportMemorySections = {
    productSummary: aiAnalysis.productSummary || localAnalysis.memorySections.productSummary,
    currentBuildState: linesToText(aiAnalysis.currentBuildState),
    technicalArchitecture: aiAnalysis.technicalArchitecture,
    activeDecisions: aiAnalysis.activeDecisions,
    completedWork: aiAnalysis.completedWork,
    knownIssues: aiAnalysis.knownIssues,
    openQuestions: aiAnalysis.openQuestions,
    roadmap: aiAnalysis.roadmap,
  };
  const suggestedOutcomes = dedupeSuggestedOutcomes([
    outcomeFromOpenAINextStep(aiAnalysis, metadata),
    ...localAnalysis.suggestedOutcomes,
  ]);
  const analysisBullets = [
    aiAnalysis.analysisSummary,
    aiAnalysis.plainEnglishSummary,
    aiAnalysis.completedWork.length ? `What is done: ${aiAnalysis.completedWork[0]}` : "",
    aiAnalysis.knownIssues.length ? `What is broken or risky: ${aiAnalysis.knownIssues[0]}` : "",
    aiAnalysis.roadmap.length ? `What to do next: ${aiAnalysis.roadmap[0]}` : "",
  ].filter(Boolean);
  const projectConstraints = dedupe([
    ...localAnalysis.projectConstraints,
    ...aiAnalysis.activeDecisions.filter((decision) => /must|should|avoid|do not|constraint/i.test(decision)),
  ]);
  const memory = {
    ...localAnalysis.memory,
    productSummary: memorySections.productSummary,
    currentBuildState: memorySections.currentBuildState,
    technicalArchitecture: linesToText(memorySections.technicalArchitecture),
    activeDecisions: linesToText(memorySections.activeDecisions),
    completedWork: linesToText(memorySections.completedWork),
    knownIssues: linesToText(memorySections.knownIssues),
    openQuestions: linesToText(memorySections.openQuestions),
    roadmap: linesToText(memorySections.roadmap),
  };
  const source = {
    ...localAnalysis.source,
    analyzer: "AI" as const,
    analysisSummary: aiAnalysis.analysisSummary,
    analysisBullets,
    plainEnglishSummary: aiAnalysis.plainEnglishSummary,
    keyFacts: aiAnalysis.keyFacts,
    discardedNoise: aiAnalysis.discardedNoise,
    memorySections,
    suggestedOutcomes,
  };

  return {
    ...localAnalysis,
    analyzer: "AI",
    memory,
    projectConstraints,
    source,
    analysisSummary: aiAnalysis.analysisSummary,
    analysisBullets,
    plainEnglishSummary: aiAnalysis.plainEnglishSummary,
    keyFacts: aiAnalysis.keyFacts,
    discardedNoise: aiAnalysis.discardedNoise,
    memorySections,
    suggestedOutcomes,
  };
}

function markLocalFallback(localAnalysis: ProjectHistoryAnalysis, warning: string): ProjectHistoryAnalysis {
  return {
    ...localAnalysis,
    analyzer: "AIUnavailable",
    warnings: dedupe([...localAnalysis.warnings, warning]),
    source: {
      ...localAnalysis.source,
      analyzer: "AIUnavailable",
    },
  };
}

function buildOpenAIMemoryPrompt(input: {
  projectName: string;
  projectGoal: string;
  sourceTitle: string;
  fileName?: string;
  extractedText: string;
}) {
  const truncatedText = input.extractedText.slice(0, maxOpenAIInputCharacters);
  const truncationNote =
    input.extractedText.length > truncatedText.length
      ? "\n\n[Brainpress note: The source was very large, so this analysis uses the first safe chunk. Mention any uncertainty in openQuestions.]"
      : "";

  return [
    `Project: ${input.projectName}`,
    `Project goal: ${input.projectGoal || "Not provided"}`,
    `Source title: ${input.sourceTitle}`,
    `File name: ${input.fileName || "Not provided"}`,
    "",
    "Extracted PDF text:",
    truncatedText,
    truncationNote,
  ].join("\n");
}

function parseOpenAIJson(outputText: string) {
  try {
    return validateOpenAIMemoryAnalysis(JSON.parse(outputText));
  } catch {
    return null;
  }
}

function extractOpenAIOutputText(payload: unknown) {
  if (isRecord(payload) && typeof payload.output_text === "string") {
    return payload.output_text;
  }

  const chunks: string[] = [];
  if (isRecord(payload) && Array.isArray(payload.output)) {
    payload.output.forEach((item) => {
      if (!isRecord(item) || !Array.isArray(item.content)) return;
      item.content.forEach((content) => {
        if (!isRecord(content)) return;
        if (typeof content.text === "string") chunks.push(content.text);
        if (typeof content.refusal === "string") chunks.push("");
      });
    });
  }
  return chunks.join("");
}

function outcomeFromOpenAINextStep(aiAnalysis: OpenAIMemoryAnalysis, metadata: ProjectHistoryMetadata): SuggestedOutcome {
  const next = aiAnalysis.nextRecommendedOutcome;
  return {
    title: next.title || "Clarify next project outcome from imported PDF",
    goal: next.description || "Turn the imported PDF analysis into a focused, verifiable Brainpress outcome.",
    acceptanceCriteria: next.acceptanceChecks.length
      ? next.acceptanceChecks
      : ["Outcome is clear to a non-technical founder.", "Acceptance checks are explicit.", "Verification commands are represented."],
    constraints: dedupe([...metadata.project.constraints, ...fieldLines(metadata.currentMemory.activeDecisions)]),
    verificationCommands: metadata.project.verificationCommands.length
      ? metadata.project.verificationCommands
      : ["npm run typecheck", "npm test", "npm run build"],
  };
}

function dedupeSuggestedOutcomes(suggestions: SuggestedOutcome[]) {
  const seen = new Set<string>();
  return suggestions.filter((suggestion) => {
    const key = suggestion.title.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 5);
}

function cleanStringArray(value: unknown, limit: number) {
  if (!Array.isArray(value)) return [];
  return dedupe(value.map(cleanText).filter(Boolean)).slice(0, limit);
}

function cleanText(value: unknown) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
