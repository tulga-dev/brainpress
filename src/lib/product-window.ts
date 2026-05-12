import { uid } from "@/lib/brainpress";
import { generateCodexGoalText } from "@/lib/codex-goal";
import { createDevelopmentTaskFromIntent } from "@/lib/development-tasks";
import type {
  DevelopmentTask,
  Memory,
  ProductWindow,
  ProductWindowPreviewType,
  ProductWindowSection,
  ProductWindowSectionType,
  ProductWindowStatus,
  Project,
  ThinkSession,
} from "@/lib/types";

export const productWindowPreviewTypes: ProductWindowPreviewType[] = [
  "landing_page",
  "dashboard",
  "app_workspace",
  "mobile_app",
  "admin_panel",
  "agent_console",
  "onboarding",
  "custom",
];

export const productWindowSectionTypes: ProductWindowSectionType[] = [
  "hero",
  "input_console",
  "card_grid",
  "workflow_steps",
  "status_panel",
  "artifact_list",
  "agent_result",
  "dashboard_metric",
  "qa_panel",
  "infrastructure_panel",
  "feedback_panel",
];

export function createProductWindowFromThinkSession({
  session,
  project,
  now = new Date().toISOString(),
}: {
  session: ThinkSession;
  project: Project;
  now?: string;
}): ProductWindow {
  const previewType = inferProductWindowPreviewType([session.input, session.title, session.productDirection, session.proposedSolution].join(" "));
  const title = inferProductWindowTitle(session, project, previewType);
  const primaryCTA = inferPrimaryCta(session, previewType);
  const sections = createSections(session, previewType, primaryCTA);

  return {
    id: uid("window"),
    projectId: project.id,
    thinkSessionId: session.id,
    title,
    route: project.id === "brainpress-core" ? "/projects/brainpress-core" : `/projects/${project.id}`,
    previewType,
    userScenario: `A founder wants to understand ${session.title.toLowerCase()} before asking an agent to build.`,
    screenDescription: inferScreenDescription(session, previewType),
    primaryCTA,
    sections,
    uiPrinciples: inferUiPrinciples(previewType),
    userFlow: [
      "Founder describes the idea or problem.",
      "Brainpress shapes the product direction.",
      "Brainpress shows this Product Window preview.",
      "Founder approves the direction.",
      "Brainpress creates a Build task for the agent.",
    ],
    openQuestions: session.openQuestions.slice(0, 4),
    status: "generated",
    createdAt: now,
    updatedAt: now,
  };
}

export function normalizeProductWindow(window: Partial<ProductWindow>): ProductWindow {
  const now = new Date().toISOString();
  const previewType = productWindowPreviewTypes.includes(window.previewType as ProductWindowPreviewType)
    ? (window.previewType as ProductWindowPreviewType)
    : "app_workspace";
  const status: ProductWindowStatus = ["draft", "generated", "approved", "converted_to_build"].includes(window.status || "")
    ? (window.status as ProductWindowStatus)
    : "generated";

  return {
    id: window.id || uid("window"),
    projectId: window.projectId || "",
    thinkSessionId: window.thinkSessionId || "",
    title: window.title || "Product Window",
    route: window.route || "/preview",
    previewType,
    userScenario: window.userScenario || "Founder previews the product direction before building.",
    screenDescription: window.screenDescription || "A conceptual first screen for the product direction.",
    primaryCTA: window.primaryCTA || "Continue",
    sections: normalizeProductWindowSections(window.sections),
    uiPrinciples: normalizeList(window.uiPrinciples),
    userFlow: normalizeList(window.userFlow),
    openQuestions: normalizeList(window.openQuestions),
    status,
    createdAt: window.createdAt || now,
    updatedAt: window.updatedAt || window.createdAt || now,
  };
}

export function createDevelopmentTaskFromProductWindow({
  productWindow,
  session,
  project,
  memory,
  now = new Date().toISOString(),
}: {
  productWindow: ProductWindow;
  session: ThinkSession;
  project: Project;
  memory?: Memory;
  now?: string;
}): DevelopmentTask {
  const acceptanceCriteria = [
    `The first screen matches the ${productWindow.previewType.replaceAll("_", " ")} Product Window concept.`,
    `The route or workspace surface supports ${productWindow.route}.`,
    `The primary CTA is visible: ${productWindow.primaryCTA}.`,
    ...productWindow.sections.slice(0, 5).map((section) => `${section.title} section is represented and useful.`),
    "The user flow can be completed without confusing technical clutter.",
    "npm run typecheck passes.",
    "npm run build passes.",
  ];
  const base = createDevelopmentTaskFromIntent({
    input: [
      `Build ${productWindow.title} preview`,
      productWindow.screenDescription,
      ...productWindow.sections.map((section) => `${section.title}: ${section.content}`),
      ...productWindow.userFlow,
    ].join("\n"),
    project,
    memory,
    now,
  });
  const task: DevelopmentTask = {
    ...base,
    title: `Build ${productWindow.title} preview`,
    description: `Implement the approved Product Window concept for ${productWindow.title}.`,
    taskType: "feature",
    priority: "medium",
    sourceThinkSessionId: session.id,
    sourceProductWindowId: productWindow.id,
    status: "ready_to_dispatch",
    acceptanceCriteria,
    context: [
      ...base.context,
      `Think session: ${session.title}`,
      `Product Window: ${productWindow.title}`,
      `Preview route: ${productWindow.route}`,
      `Preview type: ${productWindow.previewType}`,
      `Concept note: Product Window is a thinking artifact, not production code.`,
    ],
    affectedAreas: unique(["Think Product Window", "Build task creation", ...base.affectedAreas]),
    manualQaSteps: [
      "Open the relevant workspace screen in the browser.",
      `Confirm the first visible screen communicates: ${productWindow.screenDescription}`,
      `Confirm the primary CTA is visible: ${productWindow.primaryCTA}`,
      "Confirm the user flow is understandable for a non-technical founder.",
    ],
    statusHistory: [
      ...base.statusHistory,
      { status: "ready_to_dispatch", note: `Build task created from Product Window ${productWindow.id}.`, at: now },
    ],
    updatedAt: now,
  };

  return {
    ...task,
    codexGoal: generateCodexGoalText({ project, memory, task }),
    codexGoalUpdatedAt: now,
  };
}

export function inferProductWindowPreviewType(input: string): ProductWindowPreviewType {
  const value = input.toLowerCase();
  if (hasAny(value, ["analytics", "dashboard", "metrics", "reporting"])) return "dashboard";
  if (hasAny(value, ["marketing", "landing", "homepage"])) return "landing_page";
  if (hasAny(value, ["onboarding", "setup", "first use"])) return "onboarding";
  if (hasAny(value, ["admin", "internal", "operator"])) return "admin_panel";
  if (hasAny(value, ["agent", "cofounder", "task", "orchestrator", "codex"])) return "agent_console";
  if (hasAny(value, ["workspace", "product os", "operating system"])) return "app_workspace";
  if (hasAny(value, ["mobile", "phone", "ios", "android"])) return "mobile_app";
  return "app_workspace";
}

function inferProductWindowTitle(session: ThinkSession, project: Project, previewType: ProductWindowPreviewType) {
  if (project.id === "brainpress-core") return "Brainpress Agent Workspace";
  const suffix = previewType === "dashboard" ? "Dashboard" : previewType === "landing_page" ? "Landing Page" : "Workspace";
  return `${project.name} ${suffix}`;
}

function inferPrimaryCta(session: ThinkSession, previewType: ProductWindowPreviewType) {
  if (/think|direction|idea|founder/i.test(session.input)) return "Think with Brainpress";
  if (previewType === "landing_page") return "Start building";
  if (previewType === "dashboard") return "Review status";
  if (previewType === "onboarding") return "Start setup";
  return "Create Build Task";
}

function inferScreenDescription(session: ThinkSession, previewType: ProductWindowPreviewType) {
  const typeLabel = previewType.replaceAll("_", " ");
  return `A ${typeLabel} first screen where the founder can see ${session.proposedSolution.toLowerCase()} before committing agent build work.`;
}

function createSections(session: ThinkSession, previewType: ProductWindowPreviewType, primaryCTA: string): ProductWindowSection[] {
  const baseSections: Array<Omit<ProductWindowSection, "id">> = [
    {
      title: "Hero",
      purpose: "Make the direction instantly understandable.",
      content: session.productDirection || session.summary,
      componentType: "hero",
    },
    {
      title: "Input Console",
      purpose: "Give the founder one obvious place to think out loud.",
      content: session.userProblem || "Founder describes what needs to be clarified.",
      componentType: "input_console",
    },
    {
      title: previewType === "dashboard" ? "Key Metrics" : "Main Sections",
      purpose: "Show the important product areas without clutter.",
      content: session.featureIdeas.slice(0, 3).join(" ") || session.proposedSolution,
      componentType: previewType === "dashboard" ? "dashboard_metric" : "card_grid",
    },
    {
      title: "Product Window",
      purpose: "Preview the idea before turning it into implementation work.",
      content: "See the product idea as a browser-style concept before building.",
      componentType: "artifact_list",
    },
    {
      title: "Next Action",
      purpose: "Move from direction into buildable work.",
      content: primaryCTA,
      componentType: "workflow_steps",
    },
  ];

  if (previewType === "agent_console") {
    baseSections.splice(2, 0, {
      title: "Agent Modes",
      purpose: "Show how the founder moves from thinking to building to running.",
      content: "Think, Build, and Run are visible as the core agentic workflow.",
      componentType: "status_panel",
    });
  }

  if (previewType === "onboarding") {
    baseSections.splice(2, 0, {
      title: "Setup Progress",
      purpose: "Show where the founder is in the first-use flow.",
      content: "A calm setup checklist explains what to do next.",
      componentType: "status_panel",
    });
  }

  return baseSections.slice(0, 6).map((section) => ({
    id: uid("section"),
    ...section,
  }));
}

function inferUiPrinciples(previewType: ProductWindowPreviewType) {
  const principles = [
    "One obvious primary action.",
    "Founder-friendly language before technical detail.",
    "Visible path from idea to build task.",
    "Calm browser-style layout with clear hierarchy.",
  ];
  if (previewType === "dashboard") principles.push("Metrics should explain product health, not just show numbers.");
  if (previewType === "agent_console") principles.push("Agent actions should feel reviewable and permission-safe.");
  return principles;
}

function normalizeProductWindowSections(sections: unknown): ProductWindowSection[] {
  if (!Array.isArray(sections)) return [];
  return sections.map((section) => ({
    id: typeof section?.id === "string" ? section.id : uid("section"),
    title: typeof section?.title === "string" ? section.title : "Section",
    purpose: typeof section?.purpose === "string" ? section.purpose : "Explain this part of the product preview.",
    content: typeof section?.content === "string" ? section.content : "",
    componentType: productWindowSectionTypes.includes(section?.componentType)
      ? section.componentType
      : "card_grid",
  }));
}

function normalizeList(value: unknown) {
  return Array.isArray(value)
    ? unique(value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim()))
    : [];
}

function unique(items: string[]) {
  return Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)));
}

function hasAny(value: string, terms: string[]) {
  return terms.some((term) => value.includes(term));
}
