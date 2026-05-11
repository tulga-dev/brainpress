import { generateAgentPrompt, generateOutcomePlan } from "@/lib/brainpress";
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

export const initialState: BrainpressState = {
  projects: [seedProject],
  memories: {
    [seedProject.id]: seedMemory,
  },
  outcomes: [seedOutcome],
  prompts: [seedPrompt],
  agentRuns: [],
  buildLogs: [],
  imports: [],
};
