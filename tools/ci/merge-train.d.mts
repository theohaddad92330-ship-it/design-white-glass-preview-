// Types de `merge-train.mjs`, pour le test qui le garde (`apps/web/src/test/merge-train.test.ts`).
type TrainPr = { number: number; state: string; draft: boolean; labels: readonly string[]; labeledAt?: string | null }
type CheckRun = {
  id: number
  name: string
  status?: string
  conclusion?: string | null
  started_at?: string | null
  created_at?: string | null
}
type StepAction = 'eject' | 'update' | 'reopen' | 'wait' | 'merge' | 'skip'

export declare const TRAIN_LABEL: string
export declare const STATUS_CHECK: string
export declare function orderQueue<T extends TrainPr>(prs: readonly T[], options?: { all?: boolean }): T[]
export declare function latestStatus<T extends CheckRun>(checkRuns: readonly T[]): T | null
export declare function failedJobs(checkRuns: readonly CheckRun[]): string[]
export declare function decideStep(input: {
  pr: { behind?: boolean; mergeable?: boolean | null; labeledAt?: string | null; headSha?: string }
  status: unknown
  canUpdate: boolean
}): { action: StepAction; reason: string }
export declare function ejectionComment(input: { reason: string; failed: readonly string[] }): string
export declare function runTrain(input: {
  api: (method: string, path: string, body?: unknown) => Promise<{ ok: boolean; status: number; data: unknown }>
  all: boolean
  dryRun: boolean
  canUpdate: boolean
  dispatch: readonly string[]
  log?: (message: string) => void
}): Promise<void>
