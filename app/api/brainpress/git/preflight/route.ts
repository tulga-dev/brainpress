import { existsSync, statSync } from "node:fs";
import { NextResponse } from "next/server";
import { validateLocalProjectPath } from "@/lib/codex-bridge";
import { isProtectedBranch } from "@/lib/execution-readiness";
import { runFileCommand } from "@/lib/server-runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface GitPreflightRequest {
  repoPath?: string;
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as GitPreflightRequest;
  const repoPath = body.repoPath?.trim() || "";
  const validation = validateLocalProjectPath(repoPath);

  if (!validation.ok) return NextResponse.json({ error: validation.error }, { status: 400 });
  if (!existsSync(/*turbopackIgnore: true*/ repoPath) || !statSync(/*turbopackIgnore: true*/ repoPath).isDirectory()) {
    return NextResponse.json({ error: "repoPath does not exist or is not a directory." }, { status: 400 });
  }

  const insideRepo = await runFileCommand("git", ["rev-parse", "--is-inside-work-tree"], repoPath);
  if (/enoent|not recognized|not found/i.test(insideRepo.stderr)) {
    return NextResponse.json(
      { error: "Git is not installed or is not on PATH. Install Git, then run Git Preflight again." },
      { status: 400 },
    );
  }
  if (insideRepo.exitCode !== 0 || !insideRepo.stdout.toLowerCase().includes("true")) {
    return NextResponse.json({
      isGitRepo: false,
      branch: "",
      statusShort: "",
      isClean: false,
      warnings: ["Selected path is not a Git repository. Direct Codex execution should use an isolated Git branch or worktree."],
    });
  }

  const [status, branch] = await Promise.all([
    runFileCommand("git", ["status", "--short"], repoPath),
    runFileCommand("git", ["rev-parse", "--abbrev-ref", "HEAD"], repoPath),
  ]);
  const statusShort = status.stdout.trim();
  const branchName = branch.stdout.trim();
  const warnings = statusShort
    ? ["Workspace is not clean. Brainpress recommends a clean branch or worktree before running Codex."]
    : [];
  if (isProtectedBranch(branchName)) {
    warnings.push("You are on master/main. Brainpress recommends creating a feature branch or worktree before running Codex.");
  }

  return NextResponse.json({
    isGitRepo: true,
    branch: branchName,
    statusShort,
    isClean: statusShort.length === 0,
    warnings,
  });
}
