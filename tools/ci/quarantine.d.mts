// Types de `quarantine.mjs`, pour le test qui le garde (`apps/web/src/test/ci-quarantaine.test.ts`).
export interface QuarantineEntry {
  file: string
  test: string
  since: string
  last_fail: string
  green_nights: number
}
export interface TestRef {
  file: string
  test: string
}
export interface VitestLikeReport {
  testResults?: Array<{
    name: string
    status?: string
    assertionResults?: Array<{ fullName?: string; title?: string; status: string }>
  }>
}
export declare const QUARANTINE_FILE: string
export declare function readQuarantine(file?: string): QuarantineEntry[]
export declare function sameFile(reportFile: string, entryFile: string): boolean
export declare function failedTests(report: VitestLikeReport | null | undefined): { tests: TestRef[]; suites: string[] }
export declare function decide(input: {
  report: VitestLikeReport | null
  rc: number
  quarantine: readonly { file: string; test: string }[]
}): { block: boolean; reason: string; quarantined: TestRef[]; blocking: TestRef[] }
