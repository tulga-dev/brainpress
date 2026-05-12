import { uid } from "@/lib/brainpress";
import { generateCodexGoalText } from "@/lib/codex-goal";
import { createDevelopmentTaskFromIntent } from "@/lib/development-tasks";
import type {
  DevelopmentTask,
  Memory,
  Project,
  RecommendedBuildTask,
  ThinkArtifactType,
  ThinkMode,
  ThinkSession,
  ThinkSessionStatus,
} from "@/lib/types";

export const thinkModes: ThinkMode[] = [
  "open_thinking",
  "clarify_idea",
  "define_mvp",
  "create_feature_spec",
  "plan_roadmap",
  "make_decision",
  "analyze_risk",
];

export const thinkArtifactTypes: ThinkArtifactType[] = [
  "product_brief",
  "roadmap",
  "decision_memo",
  "feature_spec",
  "risk_analysis",
  "mvp_scope",
];

export function createThinkSession({
  input,
  mode = "open_thinking",
  artifactType = "product_brief",
  project,
  now = new Date().toISOString(),
}: {
  input: string;
  mode?: ThinkMode;
  artifactType?: ThinkArtifactType;
  project: Project;
  now?: string;
}): ThinkSession {
  const cleanInput = normalizeInput(input);
  const sentences = splitSignals(cleanInput);
  const title = inferTitle(cleanInput, mode, artifactType);
  const userProblem = inferUserProblem(sentences, cleanInput, project);
  const targetUser = inferTargetUser(sentences, cleanInput);
  const proposedSolution = inferProposedSolution(sentences, cleanInput, project);
  const risks = inferRisks(sentences, cleanInput, mode);
  const openQuestions = inferOpenQuestions(sentences, cleanInput, mode, artifactType);
  const mvpScope = inferMvpScope(sentences, cleanInput, mode, artifactType);
  const featureIdeas = inferFeatureIdeas(sentences, cleanInput, mode, artifactType);
  const decisions = inferDecisions(sentences, cleanInput, mode, artifactType);
  const productDirection = `${project.name} should ${proposedSolution.toLowerCase()} for ${targetUser.toLowerCase()} while staying focused on ${artifactLabel(artifactType).toLowerCase()}.`;
  const summary = `Brainpress organized this into ${artifactLabel(artifactType).toLowerCase()} direction: ${stripTrailingPeriod(userProblem)}; ${stripTrailingPeriod(proposedSolution)}.`;
  const recommendedBuildTasks = inferRecommendedBuildTasks({
    title,
    input: cleanInput,
    mode,
    artifactType,
    mvpScope,
    featureIdeas,
    risks,
  });

  return {
    id: uid("think"),
    projectId: project.id,
    title,
    input: cleanInput,
    mode,
    artifactType,
    summary,
    productDirection,
    userProblem,
    targetUser,
    proposedSolution,
    mvpScope,
    featureIdeas,
    decisions,
    risks,
    openQuestions,
    recommendedBuildTasks,
    status: "generated",
    createdAt: now,
    updatedAt: now,
  };
}

export function normalizeThinkSession(session: Partial<ThinkSession>): ThinkSession {
  const now = new Date().toISOString();
  const input = session.input || "";
  const mode = thinkModes.includes(session.mode as ThinkMode) ? (session.mode as ThinkMode) : "open_thinking";
  const artifactType = thinkArtifactTypes.includes(session.artifactType as ThinkArtifactType)
    ? (session.artifactType as ThinkArtifactType)
    : "product_brief";
  const status: ThinkSessionStatus = ["draft", "generated", "accepted", "converted_to_build"].includes(session.status || "")
    ? (session.status as ThinkSessionStatus)
    : "generated";

  return {
    id: session.id || uid("think"),
    projectId: session.projectId || "",
    title: session.title || inferTitle(input || "Product direction", mode, artifactType),
    input,
    mode,
    artifactType,
    summary: session.summary || "Brainpress organized this founder input into product direction.",
    productDirection: session.productDirection || "",
    userProblem: session.userProblem || "",
    targetUser: session.targetUser || "",
    proposedSolution: session.proposedSolution || "",
    mvpScope: normalizeList(session.mvpScope),
    featureIdeas: normalizeList(session.featureIdeas),
    decisions: normalizeList(session.decisions),
    risks: normalizeList(session.risks),
    openQuestions: normalizeList(session.openQuestions),
    recommendedBuildTasks: normalizeRecommendedBuildTasks(session.recommendedBuildTasks),
    agentSource: session.agentSource === "openai" || session.agentSource === "fallback" ? session.agentSource : undefined,
    agentModel: session.agentModel,
    agentError: session.agentError,
    status,
    createdAt: session.createdAt || now,
    updatedAt: session.updatedAt || session.createdAt || now,
  };
}

export function createDevelopmentTaskFromThinkRecommendation({
  session,
  recommendation,
  project,
  memory,
  now = new Date().toISOString(),
}: {
  session: ThinkSession;
  recommendation: RecommendedBuildTask;
  project: Project;
  memory?: Memory;
  now?: string;
}): DevelopmentTask {
  const base = createDevelopmentTaskFromIntent({
    input: [
      recommendation.title,
      recommendation.reason,
      session.productDirection,
      session.proposedSolution,
      ...recommendation.acceptanceCriteria,
    ].join("\n"),
    project,
    memory,
    now,
  });
  const task: DevelopmentTask = {
    ...base,
    title: recommendation.title,
    taskType: recommendation.taskType,
    priority: recommendation.priority,
    sourceThinkSessionId: session.id,
    status: "ready_to_dispatch",
    acceptanceCriteria: recommendation.acceptanceCriteria,
    context: [
      ...base.context,
      `Think session: ${session.title}`,
      `Product direction: ${session.productDirection}`,
      `Founder problem: ${session.userProblem}`,
    ].filter(Boolean),
    statusHistory: [
      ...base.statusHistory,
      { status: "ready_to_dispatch", note: `Build task created from Think session ${session.id}.`, at: now },
    ],
    updatedAt: now,
  };

  return {
    ...task,
    codexGoal: generateCodexGoalText({ project, memory, task }),
    codexGoalUpdatedAt: now,
  };
}

function normalizeInput(input: string) {
  return input.trim().replace(/\s+/g, " ") || "Clarify the next product direction.";
}

function splitSignals(input: string) {
  return input
    .split(/(?<=[.!?])\s+|\n+/)
    .map((line) => line.trim().replace(/^[-*]\s*/, ""))
    .filter((line) => line.length > 3)
    .slice(0, 14);
}

function inferTitle(input: string, mode: ThinkMode, artifactType: ThinkArtifactType) {
  const compact = stripTrailingPeriod(input.split(/[.!?]/)[0] || input).slice(0, 72).trim();
  if (compact.length > 12) return compact;
  return `${modeLabel(mode)}: ${artifactLabel(artifactType)}`;
}

function inferUserProblem(sentences: string[], input: string, project: Project) {
  const match = findSignal(sentences, /(problem|pain|struggle|hard|risk|bug|broken|confusing|can't|cannot|without|instead)/i);
  return match || `${project.name} needs a clearer product direction before the team asks agents to build.`;
}

function inferTargetUser(sentences: string[], input: string) {
  const match = findSignal(sentences, /(founder|customer|user|developer|builder|team|operator|admin|buyer|owner)s?/i);
  if (match) return match;
  if (/founder|non-technical/i.test(input)) return "Non-technical founders";
  if (/developer|builder|codex|agent/i.test(input)) return "AI builders and product teams";
  return "The first users who need this product workflow";
}

function inferProposedSolution(sentences: string[], input: string, project: Project) {
  const match = findSignal(sentences, /(help|create|build|turn|manage|support|automate|organize|clarify|define|verify|track)/i);
  return match || `Help users turn messy thinking into a focused next product outcome in ${project.name}.`;
}

function inferMvpScope(sentences: string[], input: string, mode: ThinkMode, artifactType: ThinkArtifactType) {
  const scope = [
    findSignal(sentences, /(mvp|first version|scope|smallest|first useful|initial)/i),
    mode === "define_mvp" || artifactType === "mvp_scope" ? "Limit the first version to one clear founder workflow." : "",
    "Capture the founder's input and turn it into structured direction.",
    "Show the next buildable step without requiring a technical planning document.",
  ].filter(Boolean) as string[];
  return unique(scope).slice(0, 5);
}

function inferFeatureIdeas(sentences: string[], input: string, mode: ThinkMode, artifactType: ThinkArtifactType) {
  const ideas = sentences.filter((line) => /(feature|idea|could|should|add|create|build|flow|workspace|agent)/i.test(line));
  if (mode === "create_feature_spec" || artifactType === "feature_spec") ideas.push("Create a build-ready feature spec from the chosen direction.");
  if (artifactType === "roadmap") ideas.push("Sequence the idea into now, next, and later work.");
  ideas.push("Recommend one or two agent-ready Build tasks.");
  return unique(ideas).slice(0, 6);
}

function inferDecisions(sentences: string[], input: string, mode: ThinkMode, artifactType: ThinkArtifactType) {
  const decisions = sentences.filter((line) => /(decision|decide|must|should|avoid|do not|choose|priority)/i.test(line));
  if (mode === "make_decision" || artifactType === "decision_memo") decisions.push("Choose the simplest path that reduces founder confusion before adding automation.");
  return unique(decisions).slice(0, 5);
}

function inferRisks(sentences: string[], input: string, mode: ThinkMode) {
  const risks = sentences.filter((line) => /(risk|concern|danger|confusing|unclear|broken|hard|failure|overbuild|expensive)/i.test(line));
  if (mode === "analyze_risk") risks.push("The product may feel too technical if Brainpress exposes implementation details too early.");
  if (!risks.length) risks.push("The scope may stay too broad unless the next build task has explicit acceptance criteria.");
  return unique(risks).slice(0, 5);
}

function inferOpenQuestions(sentences: string[], input: string, mode: ThinkMode, artifactType: ThinkArtifactType) {
  const questions = sentences.filter((line) => line.includes("?"));
  questions.push("What is the smallest proof that this direction helps the founder?");
  if (mode === "plan_roadmap" || artifactType === "roadmap") questions.push("Which item belongs in now, next, and later?");
  if (mode === "make_decision") questions.push("What tradeoff is the founder willing to accept?");
  return unique(questions).slice(0, 5);
}

function inferRecommendedBuildTasks({
  title,
  input,
  mode,
  artifactType,
  mvpScope,
  featureIdeas,
  risks,
}: {
  title: string;
  input: string;
  mode: ThinkMode;
  artifactType: ThinkArtifactType;
  mvpScope: string[];
  featureIdeas: string[];
  risks: string[];
}): RecommendedBuildTask[] {
  const primaryTitle =
    mode === "analyze_risk" || artifactType === "risk_analysis"
      ? `Reduce product risk for ${title}`
      : mode === "plan_roadmap" || artifactType === "roadmap"
        ? `Implement the first roadmap step for ${title}`
        : `Build the first usable version of ${title}`;

  return [
    {
      title: primaryTitle,
      taskType: /bug|broken|fix|failed/i.test(input) ? "bug_fix" : "feature",
      priority: risks.length > 1 ? "high" : "medium",
      reason: "This is the most direct Build task from the current product direction.",
      acceptanceCriteria: unique([
        "The first user-facing workflow is clear and usable.",
        ...(mvpScope.length ? mvpScope.slice(0, 2) : ["MVP scope is represented in the UI."]),
        "npm run typecheck passes.",
        "npm run build passes.",
      ]),
    },
    {
      title: `Add acceptance checks for ${title}`,
      taskType: "test",
      priority: "medium",
      reason: "The agent needs explicit evidence before Brainpress should treat the work as done.",
      acceptanceCriteria: unique([
        "Acceptance criteria are visible and testable.",
        ...(featureIdeas.length ? [`The implementation covers: ${featureIdeas[0]}`] : []),
        "Manual QA steps are documented.",
      ]),
    },
  ];
}

function normalizeRecommendedBuildTasks(tasks: unknown): RecommendedBuildTask[] {
  if (!Array.isArray(tasks)) return [];
  return tasks.map((task) => ({
    title: typeof task?.title === "string" ? task.title : "Create build task",
    taskType: typeof task?.taskType === "string" ? task.taskType : "feature",
    priority: typeof task?.priority === "string" ? task.priority : "medium",
    reason: typeof task?.reason === "string" ? task.reason : "Recommended from Think session.",
    acceptanceCriteria: normalizeList(task?.acceptanceCriteria),
  })) as RecommendedBuildTask[];
}

function normalizeList(value: unknown) {
  return Array.isArray(value)
    ? unique(value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim()))
    : [];
}

function findSignal(lines: string[], pattern: RegExp) {
  return lines.find((line) => pattern.test(line));
}

function unique(items: string[]) {
  return Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)));
}

function stripTrailingPeriod(value: string) {
  return value.replace(/[.。]+$/, "");
}

function modeLabel(mode: ThinkMode) {
  return mode.split("_").map((part) => part[0].toUpperCase() + part.slice(1)).join(" ");
}

function artifactLabel(type: ThinkArtifactType) {
  return type.split("_").map((part) => part[0].toUpperCase() + part.slice(1)).join(" ");
}
