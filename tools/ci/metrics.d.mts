export function parseArgs(argv: string[]): { days: number; logs: number; out: string }
export function percentile(values: Array<number | null>, p: number): number | null
export function cancelCause(run: unknown, jobs: CiJob[], laterRunExists: boolean): string
export function realVerdict(run: { conclusion: string | null }, jobs: CiJob[]): string
export function parseSelection(
  log: string,
): { files: number; total: number; mode: 'concernes' | 'complet'; reason: string } | null
export function jobKind(name: string): string
export function readHostClasses(runbook: string): Record<string, string>
export function hostClass(runnerName: string | null, classes?: Record<string, string>): string

interface CiJob {
  conclusion: string | null
  started_at?: string | null
  completed_at?: string | null
  steps?: Array<{ conclusion: string | null }>
}
