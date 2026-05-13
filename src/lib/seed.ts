import { generateAgentPrompt, generateOutcomePlan } from "@/lib/brainpress";
import { createDefaultServiceAgents, createEmptyServiceWindow, createServiceFromProject } from "@/lib/services";
import { defaultPermissionSafetyRules } from "@/lib/safety";
import type { AgentPrompt, BrainpressState, Memory, Outcome, Project } from "@/lib/types";

const createdAt = "2026-05-11T00:00:00.000Z";

export const seedProject: Project = {
  id: "gensecai",
  name: "GensecAI",
  description: "AI command center for SMEs.",
  repoPathOrUrl: "https://github.com/gensecai/app",
  preferredAgent: "Both",
  primaryGoal:
    "Make business operations understandable and actionable through dashboards, deterministic intelligence, and proactive agent recommendations.",
  constraints: [
    "Do not build auth.",
    "Do not integrate real Codex execution yet.",
    "Do not integrate real AI API yet.",
    "Do not overbuild.",
    "Focus on polished UX and the core loop.",
  ],
  verificationCommands: ["npm run typecheck", "npm test", "npm run build"],
  safetyRules: defaultPermissionSafetyRules,
  createdAt,
};

export const brainpressCoreProject: Project = {
  id: "brainpress-core",
  name: "Brainpress Core",
  description: "AI software development task orchestrator.",
  repoPathOrUrl: "",
  preferredAgent: "Codex",
  primaryGoal:
    "Turn messy founder intent into structured development tasks that can be safely dispatched to Codex, reviewed, verified, and absorbed.",
  constraints: [
    "No autonomous merge.",
    "No automatic production deployment.",
    "No frontend API keys.",
    "User approval is required before merge or deploy.",
  ],
  verificationCommands: ["npm run typecheck", "npm test", "npm run build"],
  safetyRules: defaultPermissionSafetyRules,
  createdAt,
};

export const seedMemory: Memory = {
  projectId: seedProject.id,
  productSummary:
    "GensecAI is an AI command center for SMEs. It makes business operations understandable and actionable through dashboards, deterministic intelligence, and proactive agent recommendations.",
  vision:
    "Give SME owners a calm command center that translates operational noise into clear status, useful recommendations, and verifiable agent work.",
  targetUsers:
    "SME founders, operators, and managers who need to understand business performance without becoming analysts.",
  currentBuildState:
    "Current focus is PC center operations intelligence using RiseX-like data. The product should emphasize owner-grade clarity over vague automation language.",
  technicalArchitecture:
    "Dashboard-first web app with deterministic intelligence, structured memory, verification commands, and future agent execution handoff.",
  activeDecisions: [
    "Deterministic intelligence first.",
    "PC usage is primary.",
    "Show top users.",
    "Avoid vague super-agent framing.",
  ]
    .map((item) => `- ${item}`)
    .join("\n"),
  deprecatedIdeas: "- Full note editor is out of scope for the MVP.\n- Real AI API integration is out of scope for the MVP.",
  completedWork:
    "- Seeded product memory exists.\n- Seeded outcome captures the PC center dashboard improvement loop.",
  openQuestions:
    "- Which RiseX-like fields are guaranteed in the first imported dataset?\n- What threshold should trigger a proactive offer card?",
  knownIssues:
    "- No local agent execution is connected yet.\n- Verification results are represented, not executed by Brainpress.",
  roadmap: [
    "Improve PC center dashboard.",
    "Add last 7 days view.",
    "Add last 3 months trend.",
    "Add top users leaderboard.",
    "Add proactive offer cards.",
    "Add agent work ledger.",
  ]
    .map((item) => `- ${item}`)
    .join("\n"),
};

export const brainpressCoreMemory: Memory = {
  projectId: brainpressCoreProject.id,
  productSummary:
    "Brainpress is becoming an AI software development task orchestrator that converts messy founder intent into structured, verifiable development work.",
  vision:
    "Give founders a safe cockpit for creating development tasks, dispatching them to Codex, reviewing results, and deciding the next action without blind approvals.",
  targetUsers: "Founder-builders, product operators, and developers coordinating AI coding work.",
  currentBuildState:
    "Brainpress has project memory, PDF intake, agent runs, local verification, and a safe Codex bridge foundation. Development tasks are the next primary workflow.",
  technicalArchitecture:
    "Next.js App Router, TypeScript, Tailwind, localStorage persistence, server-side API routes, and placeholder coding-agent adapters.",
  activeDecisions:
    "- Development tasks should be structured before dispatch.\n- Dispatch adapters must stay separate from UI.\n- No API keys in frontend or localStorage.\n- User approval is required before merge or deploy.",
  deprecatedIdeas: "- Prompt copy/paste should not be the primary Codex workflow.",
  completedWork:
    "- Brainpress MVP supports memory, outcomes, PDF intake, agent handoff, verification, and local Codex execution safeguards.",
  openQuestions:
    "- Which Codex Cloud API shape should the first real adapter use?\n- Should task state eventually live in JSON files beside the repo?",
  knownIssues:
    "- Direct Codex Cloud dispatch is not configured yet.\n- Task orchestration needs a structured adapter boundary before real dispatch.",
  roadmap:
    "- Add DevelopmentTask inbox.\n- Add Codex dispatch placeholder.\n- Add task result review.\n- Add future Codex Cloud integration.\n- Add future PR/diff review workflow.",
};

const seedOutcomeBase: Outcome = {
  id: "outcome_pc_dashboard",
  projectId: seedProject.id,
  title: "Improve GensecAI PC Center Dashboard",
  goal: "Make the dashboard clean, premium, and owner-grade.",
  acceptanceCriteria: [
    "Last 7 days usage chart exists.",
    "Last 3 months trend exists.",
    "Top users leaderboard exists.",
    "PC usage is the primary metric.",
    "Empty/loading/error states exist.",
    "npm run typecheck, npm test, npm run build are represented in verification.",
  ],
  constraints: [
    "Keep PC usage as the primary metric.",
    "Avoid vague super-agent framing.",
    "Do not overbuild beyond the dashboard outcome.",
  ],
  verificationCommands: ["npm run typecheck", "npm test", "npm run build"],
  maxIterations: 3,
  status: "Ready",
  generatedPlan: "",
  generatedPrompt: "",
  createdAt,
};

export const seedOutcome: Outcome = {
  ...seedOutcomeBase,
  generatedPlan: generateOutcomePlan(seedProject, seedMemory, seedOutcomeBase),
};

seedOutcome.generatedPrompt = generateAgentPrompt(seedProject, seedMemory, seedOutcome, "Codex");

export const seedPrompt: AgentPrompt = {
  id: "prompt_pc_dashboard_codex",
  outcomeId: seedOutcome.id,
  targetAgent: "Codex",
  prompt: seedOutcome.generatedPrompt,
  status: "Draft",
  createdAt,
};

export const brainpressCoreService = createServiceFromProject(brainpressCoreProject, createdAt);
export const seedService = createServiceFromProject(seedProject, createdAt);
export const brainpressCoreServiceAgents = createDefaultServiceAgents(brainpressCoreService, createdAt);
export const seedServiceAgents = createDefaultServiceAgents(seedService, createdAt);

export const initialState: BrainpressState = {
  services: [brainpressCoreService, seedService],
  serviceAgents: [...brainpressCoreServiceAgents, ...seedServiceAgents],
  serviceWindows: [createEmptyServiceWindow(brainpressCoreService.id, createdAt), createEmptyServiceWindow(seedService.id, createdAt)],
  thinkingArtifacts: [],
  projects: [brainpressCoreProject, seedProject],
  memories: {
    [brainpressCoreProject.id]: brainpressCoreMemory,
    [seedProject.id]: seedMemory,
  },
  outcomes: [seedOutcome],
  prompts: [seedPrompt],
  thinkSessions: [],
  productWindows: [],
  constitutions: [],
  specs: [],
  clarifyingQuestions: [],
  plans: [],
  taskLists: [],
  developmentTasks: [],
  developmentTaskResults: [],
  runIssues: [],
  agentRuns: [],
  buildLogs: [],
  imports: [],
};
