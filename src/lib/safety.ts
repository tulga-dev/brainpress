import type { Project } from "@/lib/types";

export const defaultPermissionSafetyRules = `## Permission Safety Rules

- Work only inside the selected project folder.
- You may read, edit, create, and delete files only inside this project folder.
- You may run normal verification commands:
  - npm run typecheck
  - npm test
  - npm run build
  - npm run lint
  - git diff
  - git status
- You may install packages only if necessary for the requested task. Explain why before doing it.
- Do not access files outside the project folder.
- Do not read or print secret values from .env files unless absolutely required.
- Do not run destructive commands such as rm -rf, del /s /q, format, database reset, or force push.
- Do not push to GitHub unless explicitly instructed.
- Do not run unknown downloaded scripts, curl | bash, Invoke-WebRequest | iex, or system-level PowerShell commands.
- If a command needs elevated permission, internet execution, broad deletion, database reset, or access outside the project folder, stop and explain the risk instead of asking the founder to approve blindly.`;

export function getProjectSafetyRules(project: Pick<Project, "safetyRules"> | Partial<Pick<Project, "safetyRules">>) {
  return project.safetyRules?.trim() || defaultPermissionSafetyRules;
}

export function ensurePermissionSafetyRules(content: string, safetyRules: string) {
  if (content.includes("## Permission Safety Rules")) return content;
  return `${content.trim()}\n\n${safetyRules.trim()}`;
}
