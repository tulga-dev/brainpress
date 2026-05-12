import type { DevelopmentTask, Memory, Project, ProjectImport } from "@/lib/types";

export interface CodexGoalObjective {
  targetOutcome: string;
  validationLoop: string;
  permissionGuidance: string;
  requiredChecks: string[];
  finalSummaryFormat: string[];
  goalText: string;
}

export function generateCodexGoalObjective({
  project,
  task,
  memory,
  sources = [],
}: {
  project: Project;
  task: Pick<
    DevelopmentTask,
    | "title"
    | "description"
    | "affectedAreas"
    | "acceptanceCriteria"
    | "verificationCommands"
    | "manualQaSteps"
    | "constraints"
    | "taskType"
  >;
  memory?: Memory;
  sources?: ProjectImport[];
}): CodexGoalObjective {
  const targetOutcome = buildTargetOutcome(project, task, memory, sources);
  const requiredChecks = buildRequiredChecks(task);
  const validationLoop = buildValidationLoop(task, requiredChecks);
  const permissionGuidance = buildPermissionGuidance(project, task);
  const finalSummaryFormat = [
    "changed files",
    "commands run",
    "verification results",
    "browser/manual QA results where applicable",
    "risks",
    "remaining issues",
    "next tasks",
  ];
  const summarySentence = `Summarize ${finalSummaryFormat.join(", ")}.`;

  return {
    targetOutcome,
    validationLoop,
    permissionGuidance,
    requiredChecks,
    finalSummaryFormat,
    goalText: [
      `/goal Continue building ${project.name}.`,
      targetOutcome,
      permissionGuidance,
      validationLoop,
      `Run ${requiredChecks.join(", ")}.`,
      "Stop only when the checks pass or when a blocker requires founder input.",
      summarySentence,
    ].join(" "),
  };
}

export function generateCodexGoalText(input: Parameters<typeof generateCodexGoalObjective>[0]) {
  return generateCodexGoalObjective(input).goalText;
}

function buildTargetOutcome(
  project: Project,
  task: Pick<DevelopmentTask, "title" | "description" | "affectedAreas" | "acceptanceCriteria" | "taskType">,
  memory?: Memory,
  sources: ProjectImport[] = [],
) {
  const architecture = memory?.technicalArchitecture ? ` Preserve the existing architecture: ${sentence(memory.technicalArchitecture)}` : "";
  const sourceContext = sources.length
    ? ` Use saved project sources as context, including ${sources.slice(0, 3).map((source) => source.fileName || source.title).join(", ")}.`
    : "";
  const affectedAreas = task.affectedAreas.length ? ` Verify ${task.affectedAreas.join(", ")}.` : "";
  const acceptance = task.acceptanceCriteria.length ? ` Success means ${task.acceptanceCriteria.slice(0, 4).join(" ")}` : "";

  return [
    `Target outcome: ${task.title}.`,
    sentence(task.description),
    architecture,
    sourceContext,
    affectedAreas,
    acceptance,
    `Keep the work scoped to this ${task.taskType.replace(/_/g, " ")} task.`,
  ]
    .filter(Boolean)
    .join(" ");
}

function buildValidationLoop(task: Pick<DevelopmentTask, "acceptanceCriteria" | "manualQaSteps">, requiredChecks: string[]) {
  const acceptance = task.acceptanceCriteria.length
    ? `Check the implementation against acceptance criteria: ${task.acceptanceCriteria.join(" ")}`
    : "Check the implementation against the requested behavior.";
  const manualQa = task.manualQaSteps.length ? ` Perform manual/browser verification: ${task.manualQaSteps.join(" ")}` : "";
  return `${acceptance} Iterate until the criteria and checks are satisfied.${manualQa} Required checks are ${requiredChecks.join(", ")}.`;
}

function buildPermissionGuidance(project: Project, task: Pick<DevelopmentTask, "constraints">) {
  const constraints = [...project.constraints, ...task.constraints]
    .filter(Boolean)
    .slice(0, 6)
    .join(" ");
  return [
    "Work only inside the selected project folder.",
    "Do not access secrets, run destructive commands, push, deploy, auto-commit, or merge.",
    "If elevated permission, internet execution, broad deletion, database reset, or access outside the project is required, stop and explain the risk.",
    constraints ? `Respect constraints: ${constraints}` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function buildRequiredChecks(task: Pick<DevelopmentTask, "verificationCommands" | "manualQaSteps" | "affectedAreas" | "description">) {
  const checks = new Set<string>();
  const baseCommands = task.verificationCommands.length ? task.verificationCommands : ["npm run typecheck", "npm test", "npm run build"];
  for (const command of baseCommands) checks.add(command);
  checks.add("npm run typecheck");
  checks.add("npm test");
  checks.add("npm run build");
  checks.add("npm run lint if available");
  if (needsBrowserVerification(task)) checks.add("browser verification");
  return Array.from(checks);
}

function needsBrowserVerification(task: Pick<DevelopmentTask, "manualQaSteps" | "affectedAreas" | "description">) {
  const value = [task.description, ...task.affectedAreas, ...task.manualQaSteps].join(" ").toLowerCase();
  return ["ui", "browser", "upload", "pdf", "memory", "dashboard", "screen", "button", "flow"].some((term) => value.includes(term));
}

function sentence(value: string) {
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (!trimmed) return "";
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}
