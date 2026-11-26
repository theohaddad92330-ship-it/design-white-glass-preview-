// Types de `shard-ia.mjs`, pour le test qui le garde (`apps/web/src/test/ci-shard-ia.test.ts`).
export declare function planIaShards(files: readonly { path: string; size: number }[], count: number): string[][]
export declare function listIaTestFiles(root?: string): { path: string; size: number }[]
