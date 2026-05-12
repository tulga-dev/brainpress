import { updateDevelopmentTaskStatus } from "@/lib/development-tasks";
import type { DevelopmentTask, Project } from "@/lib/types";

export interface GithubDispatchPackage {
  repository: string;
  issueTitle: string;
  issueBody: string;
  guidance: string;
}

export interface GithubIssueCreationResult {
  configured: boolean;
  issueUrl?: string;
  issueNumber?: number;
  message: string;
}

export function createGithubIssueTitle(task: DevelopmentTask) {
  return `[Brainpress] ${task.title}`;
}

export function createGithubIssueBody(task: DevelopmentTask, project: Project) {
  const sourceLines = [
    task.sourceThinkSessionId ? `- Think Session ID: ${task.sourceThinkSessionId}` : "",
    task.sourceProductWindowId ? `- Product Window ID: ${task.sourceProductWindowId}` : "",
    task.runIssueId ? `- Run Issue ID: ${task.runIssueId}` : "",
  ].filter(Boolean);

  return [
    "# Brainpress Development Task",
    "",
    "## Goal",
    task.codexGoal || task.description || task.title,
    "",
    "## Context",
    bulletList(task.context),
    "",
    "## Task Type",
    task.taskType,
    "",
    "## Priority",
    task.priority,
    "",
    "## Source",
    sourceLines.length ? sourceLines.join("\n") : "- No linked Think, Product Window, or Run source.",
    "",
    "## Affected Areas",
    bulletList(task.affectedAreas),
    "",
    "## Acceptance Criteria",
    checkboxList(task.acceptanceCriteria),
    "",
    "## Verification Commands",
    codeBlock(task.verificationCommands),
    "",
    "## Manual QA",
    checkboxList(task.manualQaSteps),
    "",
    "## Constraints",
    bulletList(task.constraints),
    "",
    "## Expected Final Summary",
    "Codex should reply with:",
    "- Changed files",
    "- Commands run",
    "- Verification results",
    "- Manual/browser QA results",
    "- Risks",
    "- Remaining issues",
    "- Next recommended tasks",
    "",
    "## Brainpress Metadata",
    `- Task ID: ${task.id}`,
    `- Project ID: ${project.id}`,
  ].join("\n");
}

export function prepareGithubDispatch(task: DevelopmentTask, project: Project): GithubDispatchPackage {
  return {
    repository: inferGithubRepository(task.repo || project.repoPathOrUrl),
    issueTitle: createGithubIssueTitle(task),
    issueBody: createGithubIssueBody(task, project),
    guidance: "Use this issue with Codex or tag @codex if your GitHub/Codex setup supports it.",
  };
}

export function applyGithubDispatchResult(
  task: DevelopmentTask,
  result: GithubIssueCreationResult,
  now = new Date().toISOString(),
): DevelopmentTask {
  if (result.issueUrl) {
    return {
      ...updateDevelopmentTaskStatus(task, "dispatched", result.message || "GitHub issue created.", now),
      externalRunUrl: result.issueUrl,
    };
  }

  if (!result.configured) {
    return updateDevelopmentTaskStatus(task, "prepared_for_github", result.message || "GitHub issue package prepared for manual copy.", now);
  }

  return updateDevelopmentTaskStatus(task, "ready_to_dispatch", result.message || "GitHub issue was not created.", now);
}

export function inferGithubRepository(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const httpsMatch = trimmed.match(/github\.com[/:]([^/\s]+)\/([^/\s?#]+)(?:[?#].*)?$/i);
  if (httpsMatch) return `${httpsMatch[1]}/${httpsMatch[2].replace(/\.git$/i, "")}`;
  const ownerRepoMatch = trimmed.match(/^([^/\s]+)\/([^/\s]+)$/);
  if (ownerRepoMatch) return `${ownerRepoMatch[1]}/${ownerRepoMatch[2].replace(/\.git$/i, "")}`;
  return "";
}

function bulletList(items: string[]) {
  return items.length ? items.map((item) => `- ${item}`).join("\n") : "- Not specified.";
}

function checkboxList(items: string[]) {
  return items.length ? items.map((item) => `- [ ] ${item}`).join("\n") : "- [ ] Not specified.";
}

function codeBlock(commands: string[]) {
  if (!commands.length) return "```bash\n# No verification commands specified.\n```";
  return ["```bash", ...commands, "```"].join("\n");
}
