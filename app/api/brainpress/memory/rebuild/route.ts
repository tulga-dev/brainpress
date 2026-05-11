import { NextResponse } from "next/server";
import { rebuildProjectMemoryWithOptionalOpenAI } from "@/lib/ai/openai-memory-analyzer";
import type { Memory, Project, ProjectImport } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RebuildMemoryRequest {
  project?: Project;
  currentMemory?: Memory;
  sources?: ProjectImport[];
}

export async function POST(request: Request) {
  let body: RebuildMemoryRequest;

  try {
    body = (await request.json()) as RebuildMemoryRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body.project || !body.currentMemory) {
    return NextResponse.json({ error: "project and currentMemory are required." }, { status: 400 });
  }

  const sources = (body.sources || []).filter((source) => source.projectId === body.project?.id);
  if (!sources.length) {
    return NextResponse.json({ error: "At least one saved source is required to rebuild memory." }, { status: 400 });
  }

  const result = await rebuildProjectMemoryWithOptionalOpenAI({
    project: body.project,
    currentMemory: body.currentMemory,
    sources,
  });

  return NextResponse.json(result);
}
