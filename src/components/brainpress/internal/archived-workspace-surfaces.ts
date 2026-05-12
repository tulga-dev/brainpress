/**
 * Archived workspace surfaces from the pre-Think/Build/Run Brainpress UI.
 *
 * These entries are intentionally not imported by the main workspace. The
 * underlying engines and storage normalization remain in lib files, while the
 * visible product now mounts only Think, Build, and Run.
 */
export const archivedWorkspaceSurfaces = [
  "OverviewTab",
  "MemoryTab",
  "PdfImportReview",
  "ImportsPanel",
  "ProjectRoadmapDashboard",
  "OutcomesTab",
  "PromptsTab",
  "BuildLogsTab",
  "SettingsTab",
] as const;

export type ArchivedWorkspaceSurface = (typeof archivedWorkspaceSurfaces)[number];
