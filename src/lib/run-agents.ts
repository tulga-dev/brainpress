import { uid } from "@/lib/brainpress";
import { createDevelopmentTaskFromIntent } from "@/lib/development-tasks";
import type { DevelopmentTask, Memory, Project, RunIssue, RunIssueProvider, RunIssueType } from "@/lib/types";

const supabaseTerms = ["supabase", "rls", "auth redirect", "redirect url", "anon key", "service role", "storage bucket", "database", "migration", "postgres"];
const vercelTerms = ["vercel", "deploy", "deployment", "build failed", "build error", "environment variable", "env var", "domain", "preview", "production"];
const feedbackTerms = ["user", "customer", "feedback", "support", "complaint", "feature request"];
const releaseTerms = ["release", "ship", "launch", "changelog", "rollback"];
const qaTerms = ["qa", "browser", "manual", "acceptance", "regression", "flow"];
const bugTerms = ["bug", "broken", "does not work", "doesn't work", "not working", "failed", "error"];

export function createRunIssue({
  projectId,
  input,
  now = new Date().toISOString(),
}: {
  projectId: string;
  input: string;
  now?: string;
}): RunIssue {
  const text = input.trim() || "Review product operations and identify the highest-risk next action.";
  const lower = text.toLowerCase();
  const type = classifyRunIssueType(lower);
  const provider = inferProvider(type, lower);
  const loginProduction = lower.includes("login") && lower.includes("production");
  const title = inferTitle(text, type, provider);

  return {
    id: uid("runissue"),
    projectId,
    type,
    title,
    summary: text,
    provider,
    likelyCauses: likelyCausesFor(type, provider, loginProduction),
    recommendedSteps: recommendedStepsFor(type, provider, loginProduction),
    verificationSteps: verificationStepsFor(type, provider, loginProduction),
    requiredAccess: requiredAccessFor(type, provider),
    risks: risksFor(type, provider),
    recommendedBuildTasks: recommendedBuildTasksFor(type, provider, text),
    createdAt: now,
  };
}

export function normalizeRunIssue(issue: Partial<RunIssue>): RunIssue {
  const now = new Date().toISOString();
  return {
    id: issue.id || uid("runissue"),
    projectId: issue.projectId || "",
    type: isRunIssueType(issue.type) ? issue.type : "infrastructure",
    title: issue.title || "Review product operations issue",
    summary: issue.summary || "",
    provider: isRunIssueProvider(issue.provider) ? issue.provider : undefined,
    likelyCauses: Array.isArray(issue.likelyCauses) ? issue.likelyCauses : [],
    recommendedSteps: Array.isArray(issue.recommendedSteps) ? issue.recommendedSteps : [],
    verificationSteps: Array.isArray(issue.verificationSteps) ? issue.verificationSteps : [],
    requiredAccess: Array.isArray(issue.requiredAccess) ? issue.requiredAccess : [],
    risks: Array.isArray(issue.risks) ? issue.risks : [],
    recommendedBuildTasks: Array.isArray(issue.recommendedBuildTasks) ? issue.recommendedBuildTasks : [],
    agentSource: issue.agentSource === "openai" || issue.agentSource === "fallback" ? issue.agentSource : undefined,
    agentModel: issue.agentModel,
    agentError: issue.agentError,
    createdAt: issue.createdAt || now,
  };
}

export function createDevelopmentTaskFromRunIssue({
  issue,
  project,
  memory,
  now = new Date().toISOString(),
}: {
  issue: RunIssue;
  project: Project;
  memory?: Memory;
  now?: string;
}): DevelopmentTask {
  const task = createDevelopmentTaskFromIntent({
    input: buildTaskIntentFromRunIssue(issue),
    project,
    memory,
    now,
  });

  return {
    ...task,
    runIssueId: issue.id,
    title: issue.recommendedBuildTasks[0] || task.title,
    context: [
      ...task.context,
      `Run issue: ${issue.title}`,
      `Run issue type: ${issue.type}`,
      issue.provider ? `Provider: ${issue.provider}` : "",
      `Recommended steps: ${issue.recommendedSteps.join("; ")}`,
      `Verification steps: ${issue.verificationSteps.join("; ")}`,
    ].filter(Boolean),
    acceptanceCriteria: [
      ...issue.verificationSteps.slice(0, 5),
      ...task.acceptanceCriteria.filter((criterion) => /typecheck|test|build/i.test(criterion)).slice(0, 3),
    ],
    manualQaSteps: issue.verificationSteps,
    status: "ready_to_dispatch",
    statusHistory: [
      ...task.statusHistory,
      { status: "ready_to_dispatch", note: `Build task created from Run issue ${issue.id}.`, at: now },
    ],
    updatedAt: now,
  };
}

function classifyRunIssueType(input: string): RunIssueType {
  if (hasAny(input, supabaseTerms)) return "supabase";
  if (input.includes("vercel")) return "vercel";
  if (hasAny(input, vercelTerms)) return "deployment";
  if (hasAny(input, releaseTerms)) return "release";
  if (hasAny(input, feedbackTerms)) return "feedback";
  if (hasAny(input, qaTerms)) return "qa";
  if (hasAny(input, bugTerms)) return "bug";
  return "infrastructure";
}

function inferProvider(type: RunIssueType, input: string): RunIssueProvider | undefined {
  if (type === "supabase") return "supabase";
  if (type === "vercel" || type === "deployment") return input.includes("domain") ? "domain" : "vercel";
  if (input.includes("github")) return "github";
  return undefined;
}

function inferTitle(input: string, type: RunIssueType, provider?: RunIssueProvider) {
  const clean = input.replace(/\s+/g, " ").trim();
  if (clean.length > 12) return clean.length > 80 ? `${clean.slice(0, 77)}...` : clean;
  if (provider === "supabase") return "Review Supabase setup";
  if (provider === "vercel") return "Review Vercel deployment";
  return `Review ${type} issue`;
}

function likelyCausesFor(type: RunIssueType, provider?: RunIssueProvider, loginProduction = false) {
  if (provider === "supabase" || type === "supabase") {
    return [
      loginProduction ? "Supabase auth Site URL or redirect URLs may not include the production domain." : "",
      "Vercel environment variables may be missing or set in the wrong environment.",
      "RLS policies may block reads or writes in production.",
      "Required tables, migrations, or storage buckets may not exist in the target project.",
    ].filter(Boolean);
  }
  if (provider === "vercel" || type === "deployment" || type === "vercel") {
    return [
      "Build command, framework, or Node/runtime version may not match the app.",
      "Environment variables may be missing in Preview or Production.",
      "Domain or preview configuration may point to the wrong deployment.",
      "Serverless/API route errors may only appear after deployment.",
    ];
  }
  if (type === "qa" || type === "bug") {
    return ["A critical browser flow may be untested.", "Acceptance criteria may be missing explicit pass/fail evidence.", "Recent agent changes may have introduced a regression."];
  }
  if (type === "feedback") return ["User feedback may describe a product gap.", "A support note may map to a bug or missing feature.", "The issue may need a Build task before release."];
  if (type === "release") return ["Release checklist may be incomplete.", "Rollback risk may not be understood.", "Production checks may not have been run."];
  return ["Infrastructure requirements may be incomplete.", "A required service may be unconfigured.", "Secrets or provider settings may be missing."];
}

function recommendedStepsFor(type: RunIssueType, provider?: RunIssueProvider, loginProduction = false) {
  if (provider === "supabase" || type === "supabase") {
    return [
      "Confirm Supabase project URL and anon key.",
      "Confirm Vercel environment variables exist in the correct environment.",
      "Confirm Supabase auth Site URL.",
      "Confirm auth redirect URLs include preview and production domains.",
      "Confirm RLS policies match the required user flows.",
      "Confirm required tables and migrations are applied.",
      "Confirm storage bucket permissions if file uploads are involved.",
      "Redeploy after environment variable changes.",
      loginProduction ? "Test the production login flow end to end." : "Test the affected production flow end to end.",
    ];
  }
  if (provider === "vercel" || type === "deployment" || type === "vercel") {
    return [
      "Inspect Vercel build logs.",
      "Confirm framework and build command.",
      "Confirm environment variables are set in the correct environment.",
      "Redeploy after environment variable changes.",
      "Confirm domain configuration.",
      "Compare Preview versus Production behavior.",
      "Confirm serverless/API route errors.",
      "Confirm Node/runtime version if relevant.",
    ];
  }
  if (type === "qa" || type === "bug") return ["Reproduce the flow in the browser.", "Record expected and actual behavior.", "Check acceptance criteria evidence.", "Create a Build task for code changes."];
  if (type === "feedback") return ["Group feedback by theme.", "Decide whether it is a bug, feature, or product decision.", "Create a Build task for actionable changes."];
  if (type === "release") return ["Prepare release checklist.", "Review changelog.", "Check rollback risks.", "Run production smoke checks."];
  return ["List required services.", "Confirm owner access.", "Document missing configuration.", "Create Build tasks for code or config changes."];
}

function verificationStepsFor(type: RunIssueType, provider?: RunIssueProvider, loginProduction = false) {
  if (provider === "supabase" || type === "supabase") {
    return [
      "Production environment has the correct Supabase URL and anon key.",
      "Supabase auth Site URL and redirect URLs match the deployed app.",
      "RLS policies allow the intended signed-in user actions.",
      "Required migrations/tables exist in Supabase.",
      "Storage bucket policies work if uploads are part of the flow.",
      "The app is redeployed after env changes.",
      loginProduction ? "Production login succeeds from the deployed domain." : "Affected production flow passes in the browser.",
    ];
  }
  if (provider === "vercel" || type === "deployment" || type === "vercel") {
    return [
      "Vercel build logs show no blocking errors.",
      "Framework/build command and output settings are correct.",
      "Environment variables are present in Preview and/or Production as needed.",
      "Domain points to the intended deployment.",
      "Preview and Production differences are understood.",
      "Serverless/API routes return expected responses.",
    ];
  }
  if (type === "qa" || type === "bug") return ["Critical browser flow passes.", "Regression check passes.", "Acceptance criteria have explicit evidence."];
  if (type === "feedback") return ["Feedback has an owner decision.", "Actionable issue is converted to a Build task.", "Non-actionable feedback is recorded as a product decision."];
  if (type === "release") return ["Release checklist is complete.", "Rollback plan is understood.", "Production smoke test passes."];
  return ["Required service access is confirmed.", "Configuration is documented.", "Product flow works in the target environment."];
}

function requiredAccessFor(type: RunIssueType, provider?: RunIssueProvider) {
  if (provider === "supabase" || type === "supabase") return ["Supabase project", "Vercel project", "production app URL"];
  if (provider === "vercel" || type === "deployment" || type === "vercel") return ["Vercel project", "environment variable settings", "deployment logs", "domain settings"];
  if (type === "feedback") return ["user feedback source", "product workspace"];
  return ["product URL", "repo or deployment workspace"];
}

function risksFor(type: RunIssueType, provider?: RunIssueProvider) {
  if (provider === "supabase" || type === "supabase") return ["Wrong RLS changes can expose or block user data.", "Wrong keys or redirect URLs can break production auth."];
  if (provider === "vercel" || type === "deployment" || type === "vercel") return ["Environment changes require redeploys.", "Preview and Production can behave differently."];
  if (type === "release") return ["Shipping without QA can create production regressions."];
  return ["A product issue may require code and configuration changes."];
}

function recommendedBuildTasksFor(type: RunIssueType, provider: RunIssueProvider | undefined, input: string) {
  if (provider === "supabase" || type === "supabase") return [`Fix Supabase production configuration for: ${input.slice(0, 90)}`];
  if (provider === "vercel" || type === "deployment" || type === "vercel") return [`Fix Vercel deployment issue for: ${input.slice(0, 90)}`];
  if (type === "qa" || type === "bug") return [`Fix failing product flow: ${input.slice(0, 90)}`];
  if (type === "feedback") return [`Turn user feedback into product improvement: ${input.slice(0, 90)}`];
  return [`Create infrastructure checklist for: ${input.slice(0, 90)}`];
}

function buildTaskIntentFromRunIssue(issue: RunIssue) {
  return [
    issue.recommendedBuildTasks[0] || issue.title,
    "",
    `Run issue type: ${issue.type}`,
    issue.provider ? `Provider: ${issue.provider}` : "",
    `Summary: ${issue.summary}`,
    "",
    "Recommended steps:",
    ...issue.recommendedSteps.map((step) => `- ${step}`),
    "",
    "Verification:",
    ...issue.verificationSteps.map((step) => `- ${step}`),
  ].filter(Boolean).join("\n");
}

function hasAny(input: string, terms: string[]) {
  return terms.some((term) => input.includes(term));
}

function isRunIssueType(value: unknown): value is RunIssueType {
  return value === "infrastructure" || value === "deployment" || value === "supabase" || value === "vercel" || value === "qa" || value === "release" || value === "feedback" || value === "bug";
}

function isRunIssueProvider(value: unknown): value is RunIssueProvider {
  return value === "supabase" || value === "vercel" || value === "github" || value === "domain" || value === "custom";
}
