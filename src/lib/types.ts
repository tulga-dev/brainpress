export type PreferredAgent = "Codex" | "Claude Code" | "Both";
export type TargetAgent = "Codex" | "Claude Code" | "Generic";

export type OutcomeStatus =
  | "Draft"
  | "Planned"
  | "Ready"
  | "Running"
  | "Needs Fix"
  | "Needs Review"
  | "Verified"
  | "Absorbed";

export type PromptStatus = "Draft" | "Sent" | "Completed";

export type VerificationStatus = "Not run" | "Passing" | "Failing" | "Mixed" | "Unknown";
export type VerificationResultStatus = "passed" | "failed";
export type ProjectImportSourceType = "TextPaste" | "PDF";
export type AgentRunStatus =
  | "Draft"
  | "Prepared"
  | "ReadyToRun"
  | "RunningCodex"
  | "CodexCompleted"
  | "CodexFailed"
  | "Verification Running"
  | "Verification Passed"
  | "Verification Failed"
  | "VerificationRunning"
  | "VerificationPassed"
  | "VerificationFailed"
  | "DiffReviewRequired"
  | "Cancelled"
  | "TimedOut"
  | "Result Ingested"
  | "Absorbed";
export type AgentRunExecutionMode = "HandoffOnly" | "CodexLocal";
export type AgentRunApprovalState = "NotRequested" | "AwaitingApproval" | "Approved" | "Denied";

export type MemoryInputType =
  | "Chat history"
  | "Agent result"
  | "Research notes"
  | "Repo summary"
  | "Other";

export interface Project {
  id: string;
  name: string;
  description: string;
  repoPathOrUrl: string;
  preferredAgent: PreferredAgent;
  primaryGoal: string;
  constraints: string[];
  verificationCommands: string[];
  safetyRules: string;
  createdAt: string;
}

export interface Memory {
  projectId: string;
  productSummary: string;
  vision: string;
  targetUsers: string;
  currentBuildState: string;
  technicalArchitecture: string;
  activeDecisions: string;
  deprecatedIdeas: string;
  completedWork: string;
  openQuestions: string;
  knownIssues: string;
  roadmap: string;
}

export interface Outcome {
  id: string;
  projectId: string;
  title: string;
  goal: string;
  acceptanceCriteria: string[];
  constraints: string[];
  verificationCommands: string[];
  maxIterations: number;
  status: OutcomeStatus;
  generatedPlan: string;
  generatedPrompt: string;
  createdAt: string;
}

export interface AgentPrompt {
  id: string;
  outcomeId: string;
  targetAgent: TargetAgent;
  prompt: string;
  status: PromptStatus;
  createdAt: string;
}

export interface VerificationResult {
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
  status: VerificationResultStatus;
}

export interface AgentRun {
  id: string;
  projectId: string;
  outcomeId: string;
  promptId?: string;
  targetAgent: TargetAgent;
  status: AgentRunStatus;
  executionMode: AgentRunExecutionMode;
  approvalState: AgentRunApprovalState;
  repoPathOrUrl: string;
  handoffDirectory?: string;
  promptSnapshot: string;
  safetyRulesSnapshot: string;
  memorySnapshot: Memory;
  outcomeSnapshot: Outcome;
  verificationCommands: string[];
  verificationResults: VerificationResult[];
  codexCommandPreview: string;
  codexAvailable: boolean | null;
  codexExitCode: number | null;
  codexStdout: string;
  codexStderr: string;
  codexDurationMs: number | null;
  codexTimedOut: boolean;
  codexCancelled: boolean;
  codexStartedAt?: string;
  codexEndedAt?: string;
  gitStatusBefore: string;
  gitStatusAfter: string;
  gitBranch: string;
  gitIsClean: boolean | null;
  isGitRepo: boolean | null;
  gitStatusChecked: boolean;
  gitPreflightWarnings: string[];
  gitDiffStat: string;
  gitDiffTextPreview: string;
  gitDiffPreviewLength: number;
  gitDiffPreviewTruncated: boolean;
  changedFilesSummary: string[];
  diskPackagePrepared: boolean;
  promptPath: string;
  verificationSummary: string;
  requiresDiffReview: boolean;
  diffReviewedAt?: string;
  absorbedAt?: string;
  failureReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface BuildLog {
  id: string;
  projectId: string;
  outcomeId?: string;
  linkedAgentRunId?: string;
  rawResult: string;
  summary: string;
  completedChanges: string[];
  filesChanged: string[];
  verificationStatus: VerificationStatus;
  verificationResults: VerificationResult[];
  verificationSummary: string;
  skippedVerificationReason?: string;
  newIssues: string[];
  decisionsExtracted: string[];
  nextOutcomes: string[];
  createdAt: string;
}

export interface ExtractedPage {
  pageNumber: number;
  text: string;
}

export interface SuggestedOutcome {
  title: string;
  goal: string;
  acceptanceCriteria: string[];
  constraints: string[];
  verificationCommands: string[];
}

export interface ProjectImport {
  id: string;
  projectId: string;
  sourceType: ProjectImportSourceType;
  title: string;
  fileName?: string;
  fileSize?: number;
  pageCount?: number;
  extractedText: string;
  extractedPages: ExtractedPage[];
  detectedThemes: string[];
  analysisSummary: string;
  suggestedOutcomes: SuggestedOutcome[];
  createdAt: string;
}

export interface BrainpressState {
  projects: Project[];
  memories: Record<string, Memory>;
  outcomes: Outcome[];
  prompts: AgentPrompt[];
  agentRuns: AgentRun[];
  buildLogs: BuildLog[];
  imports: ProjectImport[];
}

export interface MemoryAnalysis {
  memory: Memory;
  projectConstraints: string[];
  warnings: string[];
  detected: {
    decisions: string[];
    completedWork: string[];
    knownIssues: string[];
    roadmap: string[];
    technicalSignals: string[];
  };
}
