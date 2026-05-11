"use client";

import { pdfTextExtractionFailureMessage } from "@/lib/brainpress";
import type { ExtractedPage } from "@/lib/types";

export interface PdfExtractionResult {
  pageCount: number;
  pages: ExtractedPage[];
  text: string;
}

export async function extractPdfText(
  file: File,
  onProgress?: (message: string, pageNumber: number, pageCount: number) => void,
): Promise<PdfExtractionResult> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();

  const data = new Uint8Array(await file.arrayBuffer());
  const documentTask = pdfjs.getDocument({ data });
  const pdf = await documentTask.promise;
  const pages: ExtractedPage[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    onProgress?.(`Extracting page ${pageNumber} of ${pdf.numPages}`, pageNumber, pdf.numPages);
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    pages.push({ pageNumber, text });
  }

  const text = pages
    .map((page) => `Page ${page.pageNumber}\n${page.text}`)
    .join("\n\n")
    .trim();

  if (!text || text.length < 20) {
    throw new Error(pdfTextExtractionFailureMessage());
  }

  return {
    pageCount: pdf.numPages,
    pages,
    text,
  };
}

export function formatFileSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
