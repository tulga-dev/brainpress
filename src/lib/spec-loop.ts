import { uid } from "@/lib/brainpress";
import { generateCodexGoalText } from "@/lib/codex-goal";
import { createDevelopmentTaskFromIntent } from "@/lib/development-tasks";
import type {
  BrainpressConstitution,
  BrainpressPlan,
  BrainpressSpec,
  BrainpressSpecClarificationStatus,
  BrainpressTaskList,
  ClarifyingQuestion,
  ClarifyingQuestionStatus,
  DevelopmentTask,
  Memory,
  ProductWindow,
  Project,
  SpecTask,
  SpecTaskStatus,
  ThinkSession,
} from "@/lib/types";

export function createConstitution(project: Project, now = new Date().toISOString()): BrainpressConstitution {
  return {
    id: uid("constitution"),
    projectId: project.id,
    principles: [
      `${project.name} turns founder intent into clear, verifiable software work before agents implement.`,
      "Every Build task must connect to a product reason, acceptance criteria, and validation loop.",
      "Human approval stays explicit before dispatch, merge, deploy, or verified status.",
    ],
    qualityRules: [
      "Prefer small, reviewable changes over broad rewrites.",
      "Keep founder-facing language clear before exposing technical detail.",
      "Preserve existing architecture and product direction unless a spec explicitly changes it.",
    ],
    testingRules: unique([
      ...project.verificationCommands.map((command) => `${command} should pass when relevant.`),
      "Browser or manual QA evidence is required for user-facing workflows.",
      "Missing verification evidence should remain unknown, not silently treated as done.",
    ]),
    architectureRules: [
      "Separate product direction, technical planning, dispatch adapters, result review, and persistence.",
      "Do not store server-only keys in frontend code or browser storage.",
      "Keep deterministic fallback engines available when Live AI is unavailable.",
    ],
    uxRules: [
      "Think, Build, and Run stay minimal and canvas-based.",
      "Non-technical founders should understand the next safe action without reading raw implementation logs.",
      "Product Window previews remain conceptual until converted into Build work.",
    ],
    safetyRules: unique([
      ...project.constraints,
      "Do not auto-commit, push, merge, deploy, or mark verified.",
      "Do not bypass Permission Safety Rules.",
    ]),
    approvalRules: [
      "Founder approval is required before agent dispatch.",
      "Founder approval is required before merge, deploy, or marking work verified.",
      "Risky commands require explanation instead of blind approval.",
    ],
    createdAt: now,
    updatedAt: now,
  };
}

export function createSpecFromThinkSession({
  session,
  productWindow,
  project,
  now = new Date().toISOString(),
}: {
  session: ThinkSession;
  productWindow?: ProductWindow;
  project: Project;
  now?: string;
}): BrainpressSpec {
  const openQuestions = unique([...(session.openQuestions || []), ...(productWindow?.openQuestions || [])]).slice(0, 8);
  const successCriteria = unique([
    ...session.mvpScope.map((item) => `${item} is represented in the founder-facing flow.`),
    ...(productWindow ? [`Product Window preview exists for ${productWindow.title}.`] : []),
    ...(productWindow?.userFlow || []).slice(0, 3).map((step) => `User can complete: ${step}`),
    "The next Build task has explicit acceptance criteria.",
  ]).slice(0, 8);
  const clarificationStatus = inferClarificationStatus(session, openQuestions);

  return {
    id: uid("spec"),
    projectId: project.id,
    serviceId: project.id,
    thinkSessionId: session.id,
    productWindowId: productWindow?.id,
    title: session.title || `${project.name} product spec`,
    what: session.proposedSolution || session.productDirection || `Define the next product step for ${project.name}.`,
    why: session.userProblem || session.summary || project.primaryGoal,
    userStories: createUserStories(session, productWindow),
    successCriteria,
    nonGoals: unique([
      ...project.constraints.filter((constraint) => /do not|no |avoid|without/i.test(constraint)),
      "Do not skip clarification when the product direction is ambiguous.",
      "Do not treat Product Window preview as production implementation.",
    ]).slice(0, 6),
    assumptions: unique([
      session.targetUser ? `Primary user: ${session.targetUser}.` : "",
      productWindow ? `The founder can judge direction from the ${productWindow.previewType.replaceAll("_", " ")} Product Window.` : "",
      "Build work will happen through DevelopmentTasks, not raw prompt copy/paste.",
    ]).slice(0, 6),
    openQuestions,
    clarificationStatus,
    createdAt: now,
    updatedAt: now,
  };
}

export function createClarifyingQuestions(spec: BrainpressSpec, now = new Date().toISOString()): ClarifyingQuestion[] {
  const sourceQuestions = spec.openQuestions.length
    ? spec.openQuestions
    : [
        "What is the smallest proof that this helps the founder?",
        "Which acceptance check would prove this is ready for Build?",
      ];

  return sourceQuestions.slice(0, spec.clarificationStatus === "needs_clarification" ? 5 : 2).map((question) => ({
    id: uid("clarify"),
    specId: spec.id,
    question: ensureQuestion(question),
    reason: spec.clarificationStatus === "needs_clarification"
      ? "This answer reduces ambiguity before planning implementation."
      : "This keeps the spec honest before Build work starts.",
    status: "open" as ClarifyingQuestionStatus,
  }));
}

export function createPlanFromSpec({
  spec,
  project,
  now = new Date().toISOString(),
}: {
  spec: BrainpressSpec;
  project: Project;
  now?: string;
}): BrainpressPlan {
  return {
    id: uid("plan"),
    projectId: project.id,
    serviceId: spec.serviceId || project.id,
    specId: spec.id,
    technologyChoices: [
      "Use the existing Next.js App Router, TypeScript, Tailwind, and Brainpress component patterns.",
      "Keep deterministic engines available; Live AI remains optional and server-side.",
      "Use existing local/cloud storage adapters before adding new persistence surfaces.",
    ],
    architectureNotes: [
      `Spec goal: ${spec.what}`,
      "Keep Think as product direction, Build as task execution, and Run as verification/operations.",
      "Convert spec work into ordered DevelopmentTasks with traceability back to the spec.",
    ],
    dataModel: [
      "BrainpressSpec stores what, why, user stories, success criteria, assumptions, non-goals, and open questions.",
      "BrainpressPlan stores technical choices, architecture notes, risks, and validation plan.",
      "BrainpressTaskList stores ordered SpecTasks that can become DevelopmentTasks.",
    ],
    apiContracts: [
      "No new execution API is required for the spec loop.",
      "Future Live AI can enrich specs and plans through the existing agent gateway.",
      "GitHub Dispatch and Local Bridge continue to receive DevelopmentTasks.",
    ],
    risks: unique([
      ...spec.openQuestions.map((question) => `Unanswered: ${question}`),
      "Agents may implement too early if acceptance criteria are weak.",
      "Technical details may overwhelm founders if surfaced too prominently.",
    ]).slice(0, 8),
    validationPlan: unique([
      ...project.verificationCommands,
      "Confirm Product Window still communicates the founder-facing outcome.",
      "Confirm every DevelopmentTask references a spec, plan, or ordered task when created from the spec loop.",
    ]),
    createdAt: now,
    updatedAt: now,
  };
}

export function createTaskListFromPlan(plan: BrainpressPlan, now = new Date().toISOString()): BrainpressTaskList {
  const tasks: SpecTask[] = [
    {
      id: uid("spectask"),
      title: "Confirm the founder-facing behavior",
      description: "Review the spec and clarify any open questions that would change the user-facing outcome.",
      dependsOn: [],
      acceptanceCriteria: ["Open questions are answered or intentionally deferred.", "The what and why are clear enough for Build."],
      verificationCommands: [],
      status: plan.risks.length ? "draft" : "ready",
    },
    {
      id: uid("spectask"),
      title: "Implement the smallest buildable slice",
      description: "Make the smallest product change that satisfies the spec success criteria.",
      dependsOn: [],
      acceptanceCriteria: plan.architectureNotes.slice(0, 2),
      verificationCommands: plan.validationPlan.filter((item) => /^npm |^pnpm |^yarn |^node /.test(item)).slice(0, 4),
      status: "ready",
    },
    {
      id: uid("spectask"),
      title: "Verify and prepare review evidence",
      description: "Run validation checks and collect manual QA evidence before marking the task verified.",
      dependsOn: [],
      acceptanceCriteria: plan.validationPlan.slice(0, 5),
      verificationCommands: plan.validationPlan.filter((item) => /^npm |^pnpm |^yarn |^node /.test(item)).slice(0, 4),
      status: "ready",
    },
  ];

  const linkedTasks = tasks.map((task, index) => ({
    ...task,
    dependsOn: index === 0 ? [] : [tasks[index - 1].id],
  }));

  return {
    id: uid("tasklist"),
    projectId: plan.projectId,
    serviceId: plan.serviceId || plan.projectId,
    planId: plan.id,
    tasks: linkedTasks,
    dependencyOrder: linkedTasks.map((task) => task.id),
    createdAt: now,
    updatedAt: now,
  };
}

export function createDevelopmentTasksFromSpecTasks({
  taskList,
  project,
  memory,
  spec,
  plan,
  now = new Date().toISOString(),
}: {
  taskList: BrainpressTaskList;
  project: Project;
  memory?: Memory;
  spec?: BrainpressSpec;
  plan?: BrainpressPlan;
  now?: string;
}): DevelopmentTask[] {
  return taskList.tasks.map((specTask) => {
    const base = createDevelopmentTaskFromIntent({
      input: [
        specTask.title,
        specTask.description,
        spec?.what ? `Spec: ${spec.what}` : "",
        ...specTask.acceptanceCriteria,
      ].filter(Boolean).join("\n"),
      project,
      memory,
      now,
    });
    const task: DevelopmentTask = {
      ...base,
      title: specTask.title,
      description: specTask.description,
      sourceSpecId: spec?.id,
      sourcePlanId: plan?.id || taskList.planId,
      sourceSpecTaskId: specTask.id,
      serviceId: spec?.serviceId || plan?.serviceId || taskList.serviceId || project.id,
      status: "ready_to_dispatch",
      acceptanceCriteria: unique([...specTask.acceptanceCriteria, ...base.acceptanceCriteria]).slice(0, 10),
      verificationCommands: unique([...specTask.verificationCommands, ...base.verificationCommands]),
      context: unique([
        ...base.context,
        spec ? `Spec: ${spec.title}` : "",
        plan ? `Plan: ${plan.id}` : "",
        `Ordered task: ${specTask.title}`,
      ]),
      statusHistory: [
        ...base.statusHistory,
        { status: "ready_to_dispatch", note: `Build task created from Spec task ${specTask.id}.`, at: now },
      ],
      updatedAt: now,
    };

    return {
      ...task,
      codexGoal: generateCodexGoalText({ project, memory, task }),
      codexGoalUpdatedAt: now,
    };
  });
}

export function normalizeConstitution(value: Partial<BrainpressConstitution>): BrainpressConstitution {
  const now = new Date().toISOString();
  return {
    id: value.id || uid("constitution"),
    projectId: value.projectId || "",
    principles: arrayField(value.principles),
    qualityRules: arrayField(value.qualityRules),
    testingRules: arrayField(value.testingRules),
    architectureRules: arrayField(value.architectureRules),
    uxRules: arrayField(value.uxRules),
    safetyRules: arrayField(value.safetyRules),
    approvalRules: arrayField(value.approvalRules),
    createdAt: value.createdAt || now,
    updatedAt: value.updatedAt || value.createdAt || now,
  };
}

export function normalizeSpec(value: Partial<BrainpressSpec>): BrainpressSpec {
  const now = new Date().toISOString();
  return {
    id: value.id || uid("spec"),
    projectId: value.projectId || "",
    serviceId: value.serviceId || value.projectId,
    thinkSessionId: value.thinkSessionId,
    productWindowId: value.productWindowId,
    title: value.title || "Product spec",
    what: value.what || "",
    why: value.why || "",
    userStories: arrayField(value.userStories),
    successCriteria: arrayField(value.successCriteria),
    nonGoals: arrayField(value.nonGoals),
    assumptions: arrayField(value.assumptions),
    openQuestions: arrayField(value.openQuestions),
    clarificationStatus: value.clarificationStatus === "clear_enough" ? "clear_enough" : "needs_clarification",
    createdAt: value.createdAt || now,
    updatedAt: value.updatedAt || value.createdAt || now,
  };
}

export function normalizeClarifyingQuestion(value: Partial<ClarifyingQuestion>): ClarifyingQuestion {
  return {
    id: value.id || uid("clarify"),
    specId: value.specId || "",
    question: value.question || "What should Brainpress clarify before planning?",
    reason: value.reason || "This question reduces ambiguity before Build work.",
    answer: value.answer,
    status: value.status === "answered" ? "answered" : "open",
  };
}

export function normalizePlan(value: Partial<BrainpressPlan>): BrainpressPlan {
  const now = new Date().toISOString();
  return {
    id: value.id || uid("plan"),
    projectId: value.projectId || "",
    serviceId: value.serviceId || value.projectId,
    specId: value.specId || "",
    technologyChoices: arrayField(value.technologyChoices),
    architectureNotes: arrayField(value.architectureNotes),
    dataModel: arrayField(value.dataModel),
    apiContracts: arrayField(value.apiContracts),
    risks: arrayField(value.risks),
    validationPlan: arrayField(value.validationPlan),
    createdAt: value.createdAt || now,
    updatedAt: value.updatedAt || value.createdAt || now,
  };
}

export function normalizeTaskList(value: Partial<BrainpressTaskList>): BrainpressTaskList {
  const now = new Date().toISOString();
  const tasks = Array.isArray(value.tasks) ? value.tasks.map(normalizeSpecTask) : [];
  return {
    id: value.id || uid("tasklist"),
    projectId: value.projectId || "",
    planId: value.planId || "",
    tasks,
    dependencyOrder: arrayField(value.dependencyOrder).length ? arrayField(value.dependencyOrder) : tasks.map((task) => task.id),
    createdAt: value.createdAt || now,
    updatedAt: value.updatedAt || value.createdAt || now,
  };
}

export function normalizeSpecTask(value: Partial<SpecTask>): SpecTask {
  return {
    id: value.id || uid("spectask"),
    title: value.title || "Spec task",
    description: value.description || "",
    dependsOn: arrayField(value.dependsOn),
    acceptanceCriteria: arrayField(value.acceptanceCriteria),
    verificationCommands: arrayField(value.verificationCommands),
    status: isSpecTaskStatus(value.status) ? value.status : "draft",
  };
}

function createUserStories(session: ThinkSession, productWindow?: ProductWindow) {
  const target = session.targetUser || "Founder";
  return unique([
    `As ${target}, I want ${session.proposedSolution || session.productDirection}, so I can make progress without vague agent work.`,
    ...session.featureIdeas.slice(0, 3).map((idea) => `As ${target}, I want ${idea}, so the product direction becomes buildable.`),
    productWindow ? `As ${target}, I want to preview ${productWindow.title}, so I can approve direction before Build.` : "",
  ]).slice(0, 5);
}

function inferClarificationStatus(session: ThinkSession, openQuestions: string[]): BrainpressSpecClarificationStatus {
  const input = `${session.input} ${session.summary}`.toLowerCase();
  if (session.input.trim().length < 80) return "needs_clarification";
  if (/[?]|maybe|not sure|unclear|figure out|tradeoff|risk|unknown/.test(input)) return "needs_clarification";
  if (openQuestions.length > 3) return "needs_clarification";
  return "clear_enough";
}

function ensureQuestion(value: string) {
  const clean = value.trim();
  if (!clean) return "What should Brainpress clarify before planning?";
  return clean.endsWith("?") ? clean : `${clean}?`;
}

function arrayField(value: unknown): string[] {
  return Array.isArray(value)
    ? unique(value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim()))
    : [];
}

function unique(items: string[]) {
  return Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)));
}

function isSpecTaskStatus(value: unknown): value is SpecTaskStatus {
  return value === "draft" || value === "ready" || value === "in_progress" || value === "done";
}
