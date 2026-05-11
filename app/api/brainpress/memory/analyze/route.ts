import { NextResponse } from "next/server";
import { analyzeProjectHistoryWithOptionalOpenAI } from "@/lib/ai/openai-memory-analyzer";
import type { ExtractedPage, Memory, MemoryInputType, Project, ProjectImportSourceType } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface AnalyzeMemoryRequest {
  project?: Project;
  currentMemory?: Memory;
  sourceType?: ProjectImportSourceType;
  title?: string;
  fileName?: string;
  fileSize?: number;
  pageCount?: number;
  extractedPages?: ExtractedPage[];
  inputType?: MemoryInputType;
  extractedText?: string;
}

export async function POST(request: Request) {
  let body: AnalyzeMemoryRequest;

  try {
    body = (await request.json()) as AnalyzeMemoryRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body.project || !body.currentMemory) {
    return NextResponse.json({ error: "project and currentMemory are required." }, { status: 400 });
  }

  if (!body.extractedText?.trim()) {
    return NextResponse.json({ error: "extractedText is required." }, { status: 400 });
  }

  const analysis = await analyzeProjectHistoryWithOptionalOpenAI(body.extractedText, {
    project: body.project,
    currentMemory: body.currentMemory,
    sourceType: body.sourceType || "PDF",
    title: body.title || body.fileName || "Imported project history",
    fileName: body.fileName,
    fileSize: body.fileSize,
    pageCount: body.pageCount,
    extractedPages: body.extractedPages,
    inputType: body.inputType,
  });

  return NextResponse.json({ analysis });
}
