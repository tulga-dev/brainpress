import { NextResponse } from "next/server";
import { codexUnavailableResult } from "@/lib/codex-bridge";
import { runFileCommand } from "@/lib/server-runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const result = await runFileCommand("codex", ["--version"]);

  if (result.exitCode !== 0) {
    return NextResponse.json({
      ...codexUnavailableResult(result.exitCode, result.stderr, result.stdout),
      durationMs: result.durationMs,
    });
  }

  return NextResponse.json({
    available: true,
    versionText: result.stdout.trim() || result.stderr.trim(),
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
    durationMs: result.durationMs,
  });
}
