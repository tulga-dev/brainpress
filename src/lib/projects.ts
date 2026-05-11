import { uid } from "@/lib/brainpress";
import { defaultPermissionSafetyRules } from "@/lib/safety";
import type { Project } from "@/lib/types";

export function createBlankProject(now = new Date().toISOString()): Project {
  return {
    id: uid("project"),
    name: "Untitled Project",
    description: "Outcome-managed AI build workspace.",
    repoPathOrUrl: "",
    preferredAgent: "Codex",
    primaryGoal: "Define a clear product outcome and turn it into verified agent work.",
    constraints: ["No auth for this MVP.", "No real AI API integration yet."],
    verificationCommands: ["npm run typecheck", "npm test", "npm run build"],
    safetyRules: defaultPermissionSafetyRules,
    createdAt: now,
  };
}
