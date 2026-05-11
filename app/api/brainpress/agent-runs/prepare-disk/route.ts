import { existsSync, statSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { generateHandoffPackage } from "@/lib/agent-runs";
import { buildCodexCommandPreview } from "@/lib/codex-shared";
import { getRunDirectory, isPathInside, validateLocalProjectPath, validateRunDirectory } from "@/lib/codex-bridge";
import type { AgentRun, Outcome, Project } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface PrepareDiskRequest {
  project?: Project;
  outcome?: Outcome;
  agentRun?: AgentRun;
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as PrepareDiskRequest;
  const { project, agentRun } = body;

  if (!project || !agentRun) {
    return NextResponse.json({ error: "project and agentRun are required." }, { status: 400 });
  }

  const repoPath = project.repoPathOrUrl.trim();
  const localValidation = validateLocalProjectPath(repoPath);
  if (!localValidation.ok) {
    return NextResponse.json(
      { error: `${localValidation.error} Put a local repo path in Settings before preparing a direct Codex package.` },
      { status: 400 },
    );
  }
  if (!existsSync(/*turbopackIgnore: true*/ repoPath) || !statSync(/*turbopackIgnore: true*/ repoPath).isDirectory()) {
    return NextResponse.json({ error: "repoPathOrUrl does not exist or is not a directory." }, { status: 400 });
  }

  const runDirectory = getRunDirectory(repoPath, agentRun.id);
  const directoryValidation = validateRunDirectory(repoPath, agentRun.id, runDirectory);
  if (!directoryValidation.ok) return NextResponse.json({ error: directoryValidation.error }, { status: 400 });
  if (!isPathInside(repoPath, runDirectory)) {
    return NextResponse.json({ error: "Refusing to write outside the selected project folder." }, { status: 400 });
  }

  const handoff = generateHandoffPackage(agentRun, project);
  const context = JSON.parse(handoff.contextJson) as Record<string, unknown>;
  const contextWithDisk = {
    ...context,
    diskPackage: {
      runDirectory,
      files: ["prompt.md", "context.json", "verification.json", "safety-rules.md"],
    },
  };
  const files = [
    { name: "prompt.md", content: handoff.promptMarkdown },
    { name: "context.json", content: `${JSON.stringify(contextWithDisk, null, 2)}\n` },
    { name: "verification.json", content: handoff.verificationJson },
    { name: "safety-rules.md", content: `${agentRun.safetyRulesSnapshot || project.safetyRules}\n` },
  ];

  await mkdir(/*turbopackIgnore: true*/ runDirectory, { recursive: true });
  for (const file of files) {
    const filePath = path.join(/*turbopackIgnore: true*/ runDirectory, file.name);
    if (!isPathInside(runDirectory, filePath)) {
      return NextResponse.json({ error: `Refusing to write unsafe file path: ${file.name}` }, { status: 400 });
    }
    await writeFile(/*turbopackIgnore: true*/ filePath, file.content, "utf8");
  }

  return NextResponse.json({
    handoffDirectory: path.relative(/*turbopackIgnore: true*/ repoPath, runDirectory).replace(/\\/g, "/"),
    absoluteHandoffDirectory: runDirectory,
    promptPath: path.join(/*turbopackIgnore: true*/ runDirectory, "prompt.md"),
    writtenFiles: files.map((file) => path.join(/*turbopackIgnore: true*/ runDirectory, file.name)),
    commandPreview: buildCodexCommandPreview(agentRun.id),
  });
}
