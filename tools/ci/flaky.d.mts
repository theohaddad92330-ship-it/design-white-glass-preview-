// Types de `flaky.mjs`, pour le test qui le garde (`apps/web/src/test/ci-quarantaine.test.ts`).
import type { QuarantineEntry, VitestLikeReport } from './quarantine.mjs'

export declare const EXIT_AFTER_GREEN_NIGHTS: number
export declare function repoRelative(file: string): string
export declare function resultsFromReport(report: VitestLikeReport, prefix?: string): Map<string, 'pass' | 'fail'>
export declare function updateQuarantine(
  existing: readonly QuarantineEntry[],
  nights: ReadonlyArray<{ date: string; results: Map<string, 'pass' | 'fail'> }>,
  today: string,
): { entries: QuarantineEntry[]; entered: QuarantineEntry[]; exited: QuarantineEntry[] }
