# Brainpress PDF Intake

## Purpose

PDF Intake lets founders bring long project history into Brainpress without turning it into another note editor. A text-based PDF can become structured project memory, saved source history, and suggested outcomes.

This is a memory feature only. It does not run Codex, run Claude Code, edit repos, deploy, push, or start autonomous loops.

## Supported Source Types

- Pasted text
- Text-based PDFs

Good PDF candidates:

- ChatGPT project exports
- product specs
- research memos
- investor memos
- meeting notes
- repo summaries
- saved Codex or agent results

Scanned/image-only PDFs are not supported yet.

## Data Model

`ProjectImport` stores imported source history in localStorage-compatible state:

- `id`
- `projectId`
- `sourceType`: `TextPaste` or `PDF`
- `title`
- `fileName`
- `fileSize`
- `pageCount`
- `extractedText`
- `extractedPages`: `{ pageNumber, text }[]`
- `detectedThemes`
- `analysisSummary`
- `analysisBullets`
- `keyFacts`
- `memorySections`
- `suggestedOutcomes`
- `createdAt`

## Extraction Behavior

PDF text extraction runs client-side with `pdfjs-dist`. Brainpress reads each page, extracts text content, preserves page numbers, and shows progress such as:

```text
Extracting page 3 of 18
```

If extraction returns no useful text, Brainpress shows:

```text
Brainpress could not extract readable text from this PDF. It may be scanned/image-only. Try exporting as text or uploading a text-based PDF.
```

OCR is intentionally not implemented in this version.

## Memory Analysis

PDF text is passed through the project history analyzer. If `OPENAI_API_KEY` is available, Brainpress first asks a server-side OpenAI analyzer for structured JSON. The key is read from `process.env.OPENAI_API_KEY` only inside the backend route and is never exposed to the browser.

The OpenAI analyzer is optional. If the key is missing, the request fails, or the response fails JSON validation, Brainpress falls back to the local heuristic parser and shows "AI unavailable, local analysis used."

The AI analyzer is instructed to:

- write for a non-technical founder
- prefer 3-6 bullets per section
- remove duplicates, broken fragments, repeated URLs, and noisy commands
- preserve important facts, URLs, commands, file paths, errors, decisions, and next steps only when they matter
- put unclear facts in Open Questions
- keep raw extracted text separate from primary memory

The local analyzer remains available and adds long-input handling:

- light repeated header/footer removal
- safe analysis cap for extremely long text
- full extracted text preserved when reasonable
- decision extraction from phrases like `decision`, `we decided`, `must`, `should`, `avoid`, `do not`, `constraint`
- completed-work extraction from `built`, `implemented`, `added`, `completed`, `released`, `done`
- issue extraction from `issue`, `bug`, `problem`, `broken`, `missing`, `risk`
- roadmap extraction from `next`, `todo`, `need to`, `build`, `add`, `future`, `roadmap`
- architecture extraction from `Next.js`, `TypeScript`, `Supabase`, `Postgres`, `API`, `schema`, `component`, `route`, `database`, `model`, `integration`, `Codex`, `agent`
- key fact extraction from routes, repo paths, file paths, commands, build results, Git/Vercel settings, decisions, warnings, and next steps
- concise section caps so long PDFs do not become copy-paste memory blocks

## Review UX

After extraction, Brainpress shows a review screen:

- Analyzer state: `AI analysis used`, `Local analysis used`, or `AI unavailable, local analysis used`
- Founder Review: Plain English Summary, What is done, What is broken / risky, What to do next, and Suggested next outcome
- Analysis Summary: 5-8 bullets, source file name, page count, and detected theme chips
- Structured Memory Review: Product Summary, Key Facts, Current Build State, Technical Architecture, Active Decisions, Completed Work, Known Issues, Open Questions, Roadmap, and Suggested Outcomes
- Raw Source Text: collapsed by default, with a short preview and an expand button

The user can:

- Save to Memory
- Save as Source Only
- Generate Outcome from PDF
- Discard

## Memory Merge Behavior

Saving to memory appends, it does not blindly replace:

- Active Decisions: append detected decisions
- Completed Work: append detected completed work
- Known Issues: append detected issues
- Open Questions: append detected questions and unresolved decisions
- Roadmap: append detected roadmap/next-task lines
- Technical Architecture: append detected architecture lines
- Product Summary: update only if empty, unless the user explicitly chooses `Save + Update Summary`

Simple deduplication removes repeated imported lines.

The raw extracted text remains in `ProjectImport.extractedText` and can be viewed from the source history. It is not pasted into the main import textarea and is not saved directly into memory cards.

## OpenAI Setup

Create `.env.local` from `.env.example` and add:

```text
OPENAI_API_KEY=
```

Restart the Next.js dev server after changing environment variables. Do not prefix the key with `NEXT_PUBLIC_`; Brainpress only reads it from the server.

## Suggested Outcomes

Brainpress generates 3-5 suggested outcomes from imported content. Suggestions use:

- imported roadmap lines
- known issue signals
- technical architecture signals
- open decision/question patterns
- project constraints
- project verification commands

Suggested outcomes are created as normal Brainpress outcomes with title, goal, acceptance criteria, constraints, and verification commands.

## Limitations

- No OCR for scanned/image-only PDFs.
- PDF extraction is client-side and depends on readable text embedded in the PDF.
- Very large PDFs are analyzed with a safe text cap, though extracted text is stored when practical.
- Source history is localStorage-backed in the MVP.
- Suggested outcomes are heuristic, not AI-generated.

## Future OCR Support

A future version can add OCR behind an explicit import action. OCR should remain separate from execution features and should clearly label lower-confidence extracted text.
