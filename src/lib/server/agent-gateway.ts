import {
  defaultBrainpressOpenAIModel,
  fallbackToDeterministicEngine,
  maxAgentInputCharacters,
  normalizeAgentResponse,
  shouldUseOpenAI,
  type BrainpressAgentRequest,
  type BrainpressAgentResponse,
  type BrainpressAgentSurface,
} from "@/lib/agent-gateway";
import { developmentTaskDispatchTargets, developmentTaskPriorities, developmentTaskTypes } from "@/lib/development-tasks";

export interface BrainpressAgentOptions {
  env?: Partial<NodeJS.ProcessEnv>;
  fetcher?: typeof fetch;
}

const openAIThinkSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "summary",
    "productDirection",
    "userProblem",
    "targetUser",
    "proposedSolution",
    "mvpScope",
    "featureIdeas",
    "decisions",
    "risks",
    "openQuestions",
    "recommendedBuildTasks",
    "productWindowSuggestion",
  ],
  properties: {
    summary: { type: "string" },
    productDirection: { type: "string" },
    userProblem: { type: "string" },
    targetUser: { type: "string" },
    proposedSolution: { type: "string" },
    mvpScope: { type: "array", items: { type: "string" } },
    featureIdeas: { type: "array", items: { type: "string" } },
    decisions: { type: "array", items: { type: "string" } },
    risks: { type: "array", items: { type: "string" } },
    openQuestions: { type: "array", items: { type: "string" } },
    recommendedBuildTasks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "taskType", "priority", "reason", "acceptanceCriteria"],
        properties: {
          title: { type: "string" },
          taskType: { type: "string", enum: developmentTaskTypes },
          priority: { type: "string", enum: developmentTaskPriorities },
          reason: { type: "string" },
          acceptanceCriteria: { type: "array", items: { type: "string" } },
        },
      },
    },
    productWindowSuggestion: {
      type: "object",
      additionalProperties: false,
      required: ["title", "route", "primaryCTA", "sections"],
      properties: {
        title: { type: "string" },
        route: { type: "string" },
        primaryCTA: { type: "string" },
        sections: { type: "array", items: { type: "string" } },
      },
    },
  },
} as const;

const openAIBuildSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "title",
    "taskType",
    "priority",
    "context",
    "affectedAreas",
    "acceptanceCriteria",
    "verificationCommands",
    "manualQaSteps",
    "constraints",
    "recommendedDispatchTarget",
  ],
  properties: {
    title: { type: "string" },
    taskType: { type: "string", enum: developmentTaskTypes },
    priority: { type: "string", enum: developmentTaskPriorities },
    context: { type: "array", items: { type: "string" } },
    affectedAreas: { type: "array", items: { type: "string" } },
    acceptanceCriteria: { type: "array", items: { type: "string" } },
    verificationCommands: { type: "array", items: { type: "string" } },
    manualQaSteps: { type: "array", items: { type: "string" } },
    constraints: { type: "array", items: { type: "string" } },
    recommendedDispatchTarget: { type: "string", enum: developmentTaskDispatchTargets },
  },
} as const;

const openAIRunSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "type",
    "title",
    "summary",
    "provider",
    "likelyCauses",
    "recommendedSteps",
    "verificationSteps",
    "requiredAccess",
    "risks",
    "recommendedBuildTasks",
  ],
  properties: {
    type: { type: "string", enum: ["infrastructure", "deployment", "supabase", "vercel", "qa", "release", "feedback", "bug"] },
    title: { type: "string" },
    summary: { type: "string" },
    provider: { type: "string", enum: ["supabase", "vercel", "github", "domain", "custom", ""] },
    likelyCauses: { type: "array", items: { type: "string" } },
    recommendedSteps: { type: "array", items: { type: "string" } },
    verificationSteps: { type: "array", items: { type: "string" } },
    requiredAccess: { type: "array", items: { type: "string" } },
    risks: { type: "array", items: { type: "string" } },
    recommendedBuildTasks: { type: "array", items: { type: "string" } },
  },
} as const;

export async function runBrainpressAgent(
  request: BrainpressAgentRequest,
  options: BrainpressAgentOptions = {},
): Promise<BrainpressAgentResponse> {
  const env = options.env || process.env;
  if (!shouldUseOpenAI(env)) return fallbackToDeterministicEngine(request, "OPENAI_API_KEY is not set. Local fallback used.");

  const model = env.BRAINPRESS_OPENAI_MODEL?.trim() || env.OPENAI_MODEL?.trim() || defaultBrainpressOpenAIModel;
  const fetcher = options.fetcher || fetch;

  try {
    const response = await fetcher("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        input: buildOpenAIInput(request),
        text: {
          format: {
            type: "json_schema",
            name: `brainpress_${request.surface}_agent`,
            strict: true,
            schema: schemaForSurface(request.surface),
          },
        },
        max_output_tokens: 2200,
      }),
    });

    if (!response.ok) {
      return fallbackToDeterministicEngine(request, `OpenAI request failed (${response.status}). Local fallback used.`);
    }

    const payload = await response.json();
    const outputText = extractOpenAIOutputText(payload);
    const parsed = parseJson(outputText);
    const normalized = normalizeAgentResponse(request.surface, {
      ok: true,
      source: "openai",
      surface: request.surface,
      result: parsed,
      model,
    });
    if (!normalized) return fallbackToDeterministicEngine(request, "OpenAI returned malformed output. Local fallback used.");

    return normalized;
  } catch (error) {
    return fallbackToDeterministicEngine(
      request,
      `OpenAI request could not complete. Local fallback used. ${error instanceof Error ? error.message : ""}`.trim(),
    );
  }
}

function buildOpenAIInput(request: BrainpressAgentRequest) {
  return [
    {
      role: "system",
      content: [
        {
          type: "input_text",
          text: [
            "You are Brainpress, an agentic product operating system for non-technical founders.",
            "Return concise structured JSON only.",
            "Do not invent facts. Put uncertainty in questions, risks, or verification steps.",
            "Keep founder-facing language clear. Keep Build tasks explicit and verifiable.",
            "Never suggest auto-merge, auto-deploy, secret exposure, or hidden destructive actions.",
          ].join("\n"),
        },
      ],
    },
    {
      role: "user",
      content: [
        {
          type: "input_text",
          text: buildSurfacePrompt(request),
        },
      ],
    },
  ];
}

function buildSurfacePrompt(request: BrainpressAgentRequest) {
  return [
    `Surface: ${request.surface}`,
    `Project: ${request.project.name}`,
    `Project goal: ${request.project.primaryGoal || request.project.description || "Not provided"}`,
    `Preferred agent: ${request.project.preferredAgent}`,
    `Verification commands: ${request.project.verificationCommands.join("; ") || "npm run typecheck; npm test; npm run build"}`,
    `Constraints: ${request.project.constraints.join("; ") || "None provided"}`,
    request.mode ? `Think mode: ${request.mode}` : "",
    request.artifactType ? `Artifact type: ${request.artifactType}` : "",
    request.taskContext ? `Task context: ${JSON.stringify(request.taskContext).slice(0, 3000)}` : "",
    request.runContext ? `Run context: ${JSON.stringify(request.runContext).slice(0, 3000)}` : "",
    "",
    "Founder input:",
    request.input.slice(0, maxAgentInputCharacters),
  ].filter(Boolean).join("\n");
}

function schemaForSurface(surface: BrainpressAgentSurface) {
  if (surface === "think") return openAIThinkSchema;
  if (surface === "build") return openAIBuildSchema;
  return openAIRunSchema;
}

function parseJson(outputText: string) {
  try {
    return JSON.parse(outputText);
  } catch {
    return null;
  }
}

function extractOpenAIOutputText(payload: unknown) {
  if (isRecord(payload) && typeof payload.output_text === "string") return payload.output_text;
  const chunks: string[] = [];
  if (isRecord(payload) && Array.isArray(payload.output)) {
    payload.output.forEach((item) => {
      if (!isRecord(item) || !Array.isArray(item.content)) return;
      item.content.forEach((content) => {
        if (isRecord(content) && typeof content.text === "string") chunks.push(content.text);
      });
    });
  }
  return chunks.join("");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
