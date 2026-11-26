// Types de `fetch-durations.mjs`, pour le test qui le garde (`apps/web/src/test/ci-durations.test.ts`).
export declare const REPORT_PREFIX: string
export declare const API_REPORT_PREFIX: string
export declare const MAX_REPORTS: number
type Report = { testResults?: Array<{ name: string; startTime?: number; endTime?: number }> }
export declare function mergeReports(reports: readonly Report[], root?: string): Record<string, number>
export declare function pruneToExisting(
  durations: Readonly<Record<string, number>>,
  existingFiles: readonly string[],
): Record<string, number>
export declare function latestRunArtifacts(
  artifacts: ReadonlyArray<{
    name?: string
    expired?: boolean
    created_at: string
    archive_download_url?: string
    workflow_run?: { id: number; head_branch: string }
  }>,
  branch?: string,
  prefix?: string,
): Array<{ name?: string; archive_download_url?: string; workflow_run?: { id: number; head_branch: string } }>
export declare function fetchLatestDurations(options: {
  repo: string
  token: string
  branch?: string
  fetchImpl?: (
    url: string,
    init?: unknown,
  ) => Promise<{ ok: boolean; status: number; json(): Promise<any>; arrayBuffer(): Promise<ArrayBuffer> }>
  readZip?: (bytes: Buffer) => Report
  prefix?: string
  root?: string
}): Promise<{ durations: Record<string, number>; runId: number; count: number } | null>
