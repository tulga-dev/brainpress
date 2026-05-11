import { exec } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { promisify } from "node:util";
import { NextResponse } from "next/server";
import { createRunEvent } from "@/lib/run-events";
import { appendRunEvent } from "@/lib/server-run-logs";
import { isLikelyLocalRepoPath, validateVerificationCommands } from "@/lib/verification";
import type { VerificationResult } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const execAsync = promisify(exec);

interface VerifyRequest {
  repoPath?: string;
  commands?: string[];
  runId?: string;
}

export async function POST(request: Request) {
  let body: VerifyRequest;

  try {
    body = (await request.json()) as VerifyRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const repoPath = body.repoPath?.trim() || "";
  const commands = body.commands || [];
  const runId = body.runId?.trim() || "";
  const validation = validateVerificationCommands(commands);

  if (!repoPath) {
    return NextResponse.json({ error: "repoPath is required." }, { status: 400 });
  }

  if (!isLikelyLocalRepoPath(repoPath)) {
    return NextResponse.json(
      {
        error: "repoPath must be a local filesystem path. URLs and network paths are not executed.",
      },
      { status: 400 },
    );
  }

  const resolvedPath = repoPath;
  if (!existsSync(/*turbopackIgnore: true*/ resolvedPath) || !statSync(/*turbopackIgnore: true*/ resolvedPath).isDirectory()) {
    return NextResponse.json(
      {
        error: "repoPath does not exist or is not a directory.",
        repoPath: resolvedPath,
      },
      { status: 400 },
    );
  }

  if (!commands.length) {
    return NextResponse.json({ error: "At least one verification command is required." }, { status: 400 });
  }

  if (!validation.isValid) {
    return NextResponse.json(
      {
        error: "One or more commands are outside the Brainpress v1 allowlist.",
        rejectedCommands: validation.rejectedCommands,
        allowedCommands: validation.allowedCommands,
      },
      { status: 400 },
    );
  }

  const results: VerificationResult[] = [];
  if (runId) {
    await appendRunEvent(resolvedPath, createRunEvent(runId, "verification_started", { commands: validation.allowedCommands }));
  }

  for (const command of validation.allowedCommands) {
    const startedAt = performance.now();
    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: resolvedPath,
        timeout: 120_000,
        maxBuffer: 1024 * 1024 * 4,
        windowsHide: true,
      });
      results.push({
        command,
        stdout,
        stderr,
        exitCode: 0,
        durationMs: Math.round(performance.now() - startedAt),
        status: "passed",
      });
    } catch (error) {
      const execError = error as {
        stdout?: string;
        stderr?: string;
        code?: number;
        signal?: string;
        message?: string;
      };

      results.push({
        command,
        stdout: execError.stdout || "",
        stderr: execError.stderr || execError.message || execError.signal || "",
        exitCode: typeof execError.code === "number" ? execError.code : 1,
        durationMs: Math.round(performance.now() - startedAt),
        status: "failed",
      });
    }
  }

  if (runId) {
    await appendRunEvent(resolvedPath, createRunEvent(runId, "verification_completed", { results }));
  }

  return NextResponse.json({ results });
}
