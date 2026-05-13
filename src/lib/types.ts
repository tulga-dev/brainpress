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
export type ProjectHistoryAnalyzer = "AI" | "Local" | "AIUnavailable";
export type DevelopmentTaskType =
  | "bug_fix"
  | "feature"
  | "refactor"
  | "test"
  | "build_fix"
  | "qa"
  | "code_review"
  | "documentation";
export type DevelopmentTaskStatus =
  | "draft"
  | "ready_to_dispatch"
  | "prepared_for_github"
  | "dispatching"
  | "dispatched"
  | "running"
  | "completed"
  | "needs_review"
  | "verified"
  | "failed"
  | "cancelled"
  | "merged";
export type DevelopmentTaskPriority = "low" | "medium" | "high" | "urgent";
export type DevelopmentTaskDispatchTarget = "codex_cloud" | "codex_cli" | "github_issue" | "manual" | "none";
export type DevelopmentTaskDispatchMode = "direct" | "local_bridge" | "github_based" | "manual_copy";
export type DevelopmentTaskResultSource = "local_bridge" | "manual_import" | "codex_cloud" | "github_pr";
export type AcceptanceCriteriaReviewStatus = "met" | "unmet" | "unknown" | "partial";
export type DevelopmentTaskRecommendedStatus = "needs_review" | "verified" | "failed" | "partially_verified";
export type DevelopmentTaskVerificationResultStatus = "passed" | "failed" | "unknown" | "skipped";
export type BrainpressAgentSource = "openai" | "fallback";
export type RunIssueType = "infrastructure" | "deployment" | "supabase" | "vercel" | "qa" | "release" | "feedback" | "bug";
export type RunIssueProvider = "supabase" | "vercel" | "github" | "domain" | "custom";
export type ThinkMode =
  | "open_thinking"
  | "clarify_idea"
  | "define_mvp"
  | "create_feature_spec"
  | "plan_roadmap"
  | "make_decision"
  | "analyze_risk";
export type ThinkArtifactType =
  | "product_brief"
  | "roadmap"
  | "decision_memo"
  | "feature_spec"
  | "risk_analysis"
  | "mvp_scope";
export type ThinkSessionStatus = "draft" | "generated" | "accepted" | "converted_to_build";
export type ProductWindowPreviewType =
  | "landing_page"
  | "dashboard"
  | "app_workspace"
  | "mobile_app"
  | "admin_panel"
  | "agent_console"
  | "onboarding"
  | "custom";
export type ProductWindowSectionType =
  | "hero"
  | "input_console"
  | "card_grid"
  | "workflow_steps"
  | "status_panel"
  | "artifact_list"
  | "agent_result"
  | "dashboard_metric"
  | "qa_panel"
  | "infrastructure_panel"
  | "feedback_panel";
export type ProductWindowStatus = "draft" | "generated" | "approved" | "converted_to_build";
export type BrainpressSpecClarificationStatus = "clear_enough" | "needs_clarification";
export type ClarifyingQuestionStatus = "open" | "answered";
export type SpecTaskStatus = "draft" | "ready" | "in_progress" | "done";
export type BrainpressServiceStage = "idea" | "needs_clarification" | "spec_ready" | "build_ready" | "running";
export type ServiceAgentPermissionLevel = "low" | "medium" | "high" | "founder_approval_required";
export type ServiceAgentStatus = "proposed" | "active" | "needs_setup" | "paused";
export type ServiceWindowStatus = "empty" | "generated" | "needs_refinement";
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

export interface BrainpressService {
  id: string;
  name: string;
  description: string;
  servicePromise: string;
  targetCustomer: string;
  desiredOutcome: string;
  currentStage: BrainpressServiceStage;
  mainAgentId: string;
  agentIds: string[];
  serviceWorkflow: string[];
  humanApprovalPoints: string[];
  successMetrics: string[];
  openQuestions: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ServiceAgent {
  id: string;
  serviceId: string;
  name: string;
  role: string;
  goal: string;
  inputs: string[];
  outputs: string[];
  tools: string[];
  memoryScope: string;
  permissionLevel: ServiceAgentPermissionLevel;
  escalationRules: string[];
  successMetric: string;
  status: ServiceAgentStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ServiceWindowScreen {
  id: string;
  name: string;
  purpose: string;
  keyComponents: string[];
  userInputs: string[];
  serviceOutputs: string[];
  agentInteractions: string[];
  approvalPoints: string[];
}

export interface ServiceWindow {
  id: string;
  serviceId: string;
  status: ServiceWindowStatus;
  screens: ServiceWindowScreen[];
  primaryFlow: string[];
  agentInteractionPoints: string[];
  humanApprovalPoints: string[];
  generatedAt?: string;
  updatedAt: string;
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
  consolidated?: ConsolidatedProjectMemory;
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

export interface DevelopmentTaskStatusEvent {
  status: DevelopmentTaskStatus;
  note: string;
  at: string;
}

export interface DevelopmentTask {
  id: string;
  projectId: string;
  title: string;
  description: string;
  taskType: DevelopmentTaskType;
  status: DevelopmentTaskStatus;
  priority: DevelopmentTaskPriority;
  repo: string;
  branch: string;
  context: string[];
  affectedAreas: string[];
  acceptanceCriteria: string[];
  verificationCommands: string[];
  manualQaSteps: string[];
  constraints: string[];
  dispatchTarget: DevelopmentTaskDispatchTarget;
  dispatchMode: DevelopmentTaskDispatchMode;
  codexGoal: string;
  codexGoalUpdatedAt?: string;
  codexRunId?: string;
  externalRunUrl?: string;
  runIssueId?: string;
  serviceId?: string;
  sourceThinkSessionId?: string;
  sourceProductWindowId?: string;
  sourceSpecId?: string;
  sourcePlanId?: string;
  sourceSpecTaskId?: string;
  agentSource?: BrainpressAgentSource;
  agentModel?: string;
  agentError?: string;
  prUrl?: string;
  resultSummary: string;
  resultRaw: string;
  statusHistory: DevelopmentTaskStatusEvent[];
  createdAt: string;
  updatedAt: string;
}

export interface RecommendedBuildTask {
  title: string;
  taskType: DevelopmentTaskType;
  priority: DevelopmentTaskPriority;
  reason: string;
  acceptanceCriteria: string[];
}

export interface ThinkSession {
  id: string;
  projectId: string;
  title: string;
  input: string;
  mode: ThinkMode;
  artifactType: ThinkArtifactType;
  summary: string;
  productDirection: string;
  userProblem: string;
  targetUser: string;
  proposedSolution: string;
  mvpScope: string[];
  featureIdeas: string[];
  decisions: string[];
  risks: string[];
  openQuestions: string[];
  recommendedBuildTasks: RecommendedBuildTask[];
  agentSource?: BrainpressAgentSource;
  agentModel?: string;
  agentError?: string;
  status: ThinkSessionStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ProductWindowSection {
  id: string;
  title: string;
  purpose: string;
  content: string;
  componentType: ProductWindowSectionType;
}

export interface ProductWindow {
  id: string;
  projectId: string;
  thinkSessionId: string;
  title: string;
  route: string;
  previewType: ProductWindowPreviewType;
  userScenario: string;
  screenDescription: string;
  primaryCTA: string;
  sections: ProductWindowSection[];
  uiPrinciples: string[];
  userFlow: string[];
  openQuestions: string[];
  status: ProductWindowStatus;
  createdAt: string;
  updatedAt: string;
}

export interface BrainpressConstitution {
  id: string;
  projectId: string;
  principles: string[];
  qualityRules: string[];
  testingRules: string[];
  architectureRules: string[];
  uxRules: string[];
  safetyRules: string[];
  approvalRules: string[];
  createdAt: string;
  updatedAt: string;
}

export interface BrainpressSpec {
  id: string;
  projectId: string;
  serviceId?: string;
  thinkSessionId?: string;
  productWindowId?: string;
  title: string;
  what: string;
  why: string;
  userStories: string[];
  successCriteria: string[];
  nonGoals: string[];
  assumptions: string[];
  openQuestions: string[];
  clarificationStatus: BrainpressSpecClarificationStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ClarifyingQuestion {
  id: string;
  specId: string;
  question: string;
  reason: string;
  answer?: string;
  status: ClarifyingQuestionStatus;
}

export interface BrainpressPlan {
  id: string;
  projectId: string;
  serviceId?: string;
  specId: string;
  technologyChoices: string[];
  architectureNotes: string[];
  dataModel: string[];
  apiContracts: string[];
  risks: string[];
  validationPlan: string[];
  createdAt: string;
  updatedAt: string;
}

export interface SpecTask {
  id: string;
  title: string;
  description: string;
  dependsOn: string[];
  acceptanceCriteria: string[];
  verificationCommands: string[];
  status: SpecTaskStatus;
}

export interface BrainpressTaskList {
  id: string;
  projectId: string;
  serviceId?: string;
  planId: string;
  tasks: SpecTask[];
  dependencyOrder: string[];
  createdAt: string;
  updatedAt: string;
}

export interface AcceptanceCriteriaReview {
  criterion: string;
  status: AcceptanceCriteriaReviewStatus;
  evidence: string;
  requiredFollowUp?: string;
}

export interface DevelopmentTaskCommandResult {
  command: string;
  status: DevelopmentTaskVerificationResultStatus;
  evidence: string;
}

export interface DevelopmentTaskManualQaResult {
  step: string;
  status: DevelopmentTaskVerificationResultStatus;
  evidence: string;
}

export interface DevelopmentTaskResult {
  id: string;
  taskId: string;
  source: DevelopmentTaskResultSource;
  rawText: string;
  summary: string;
  changedFiles: string[];
  commandsRun: string[];
  verificationResults: DevelopmentTaskCommandResult[];
  manualQaResults: DevelopmentTaskManualQaResult[];
  risks: string[];
  remainingIssues: string[];
  nextTasks: string[];
  prUrl?: string;
  recommendedStatus: DevelopmentTaskRecommendedStatus;
  acceptanceCriteriaReview: AcceptanceCriteriaReview[];
  createdAt: string;
}

export interface RunIssue {
  id: string;
  projectId: string;
  type: RunIssueType;
  title: string;
  summary: string;
  provider?: RunIssueProvider;
  likelyCauses: string[];
  recommendedSteps: string[];
  verificationSteps: string[];
  requiredAccess: string[];
  risks: string[];
  recommendedBuildTasks: string[];
  agentSource?: BrainpressAgentSource;
  agentModel?: string;
  agentError?: string;
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

export interface ConsolidatedProjectMemory {
  productSnapshot: string;
  plainEnglishSummary: string;
  whatIsDone: string[];
  whatIsBrokenOrRisky: string[];
  whatToDoNext: string[];
  roadmapNow: string[];
  roadmapNext: string[];
  roadmapLater: string[];
  suggestedNextOutcome: SuggestedOutcome | null;
  technicalDetails: string[];
  openQuestions: string[];
  sourceIds: string[];
  sourceCount: number;
  analyzer: ProjectHistoryAnalyzer;
  updatedAt: string;
}

export interface ProjectImportMemorySections {
  productSummary: string;
  currentBuildState: string;
  technicalArchitecture: string[];
  activeDecisions: string[];
  completedWork: string[];
  knownIssues: string[];
  openQuestions: string[];
  roadmap: string[];
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
  analyzer: ProjectHistoryAnalyzer;
  analysisSummary: string;
  analysisBullets: string[];
  plainEnglishSummary: string;
  keyFacts: string[];
  discardedNoise: string[];
  memorySections: ProjectImportMemorySections;
  suggestedOutcomes: SuggestedOutcome[];
  createdAt: string;
}

export interface BrainpressState {
  services: BrainpressService[];
  serviceAgents: ServiceAgent[];
  serviceWindows: ServiceWindow[];
  projects: Project[];
  memories: Record<string, Memory>;
  outcomes: Outcome[];
  prompts: AgentPrompt[];
  thinkSessions: ThinkSession[];
  productWindows: ProductWindow[];
  constitutions: BrainpressConstitution[];
  specs: BrainpressSpec[];
  clarifyingQuestions: ClarifyingQuestion[];
  plans: BrainpressPlan[];
  taskLists: BrainpressTaskList[];
  developmentTasks: DevelopmentTask[];
  developmentTaskResults: DevelopmentTaskResult[];
  runIssues: RunIssue[];
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
