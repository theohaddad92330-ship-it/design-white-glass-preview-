// Types de `shard-by-duration.mjs`, pour le test qui le garde
// (`apps/web/src/test/ci-shards.test.ts`).
export declare const WEB_ROOT: string
export declare const DURATIONS_FILE: string
export declare const API_ROOT: string
export declare const NO_DURATIONS_EXIT: number
export declare function listApiTestFiles(apiRoot?: string): string[]
export declare const PER_FILE_OVERHEAD_MS: number
export declare function listWebTestFiles(webRoot?: string): string[]
export declare function filesSelectedBy(allFiles: readonly string[], filters: readonly string[]): string[]
export declare function planShards(
  files: readonly string[],
  durations: Readonly<Record<string, number>>,
  count: number,
  overheadMs?: number,
): Array<{ files: string[]; loadMs: number }>
export declare function medianDuration(files: readonly string[], durations: Readonly<Record<string, number>>): number
export declare function resolveDurations(
  override?: string,
  committed?: string,
): { durations: Record<string, number>; source: string }
export declare function readDurations(file?: string): Record<string, number>
export declare function durationsFromVitestReport(
  report: { testResults?: Array<{ name: string; startTime?: number; endTime?: number }> },
  webRoot?: string,
): Record<string, number>
