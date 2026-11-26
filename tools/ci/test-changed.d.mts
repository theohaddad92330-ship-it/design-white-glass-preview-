// Types de `test-changed.mjs`, pour le test qui le garde
// (`apps/web/src/test/test-changed.test.ts`).
export declare function planChangedRuns(
  changed: readonly string[],
  iaTests: readonly string[],
  readSource: (file: string) => string,
): { web: string[]; contracts: string[]; api: boolean; ia: string[] | 'all'; notRunLocally: string[] }

export declare function ciGuardTests(changed: readonly string[], allTests: readonly string[]): string[]
export declare function generatedListSpecs(diffText: string, allTests: readonly string[]): string[]
export declare const CHANGELOG_DIR: RegExp
export declare const FULL_SUITE_LABEL: string
export declare const TRAIN_LABEL: string
export declare function forcesFullSuite(labels: readonly string[]): boolean
export declare function foundationReason(changed: readonly string[], legacy?: boolean): string | null
export declare function selectorLegacy(env?: Record<string, string | undefined>): boolean
export declare function changelogReaders(
  changed: readonly string[],
  allTests: readonly string[],
  readSource: (file: string) => string,
): string[]
export declare function isAlwaysRunTest(
  file: string,
  readSource: (file: string) => string,
  changed?: readonly string[],
): boolean
export interface CiSelection {
  mode: 'concernes' | 'complet'
  reason: string
  files: string[]
  total: number
}
export declare function decideCiSelection(input: {
  changed: readonly string[]
  allTests: readonly string[]
  relatedTests: readonly string[]
  alwaysRun: readonly string[]
  labels: readonly string[]
  planError: string | null
  legacy?: boolean
}): CiSelection
export declare function summaryLine(plan: CiSelection): string
export declare function shardFiles(files: readonly string[], index: number, count: number): string[]
export declare function shardFilesByDuration(
  files: readonly string[],
  index: number,
  count: number,
  durationsFile: string | undefined,
  appPrefix: string,
): string[]
