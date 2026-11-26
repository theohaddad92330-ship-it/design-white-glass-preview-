// Types de `hot-files.mjs`, pour le test qui le garde (`apps/web/src/test/porte-locale.test.ts`).
export declare const HOT_FILES: RegExp[]
export declare function isLotBranch(branch: string): boolean
export declare function hotFileViolations(branch: string, changed: readonly string[]): string[]
