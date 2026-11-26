// Types de `stage-gate.mjs`, pour le test qui le garde (`apps/web/src/test/ci-etages.test.ts`).
export declare const FAST_JOB_PREFIXES: readonly string[]
export declare const FAST_BUILD_STEPS: readonly string[]
export declare function redFastJob(
  jobs:
    | readonly {
        name?: string
        conclusion?: string | null
        steps?: readonly { name: string; conclusion?: string | null }[]
      }[]
    | undefined,
): string | null
