// Types de `ci-status.mjs`, pour le test qui le garde (`apps/web/src/test/ci-status-diagnostic.test.ts`).
export declare function diagnoseNeeds(
  needs: Record<string, { result?: string }>,
  ciYml: string,
): { failed: string[]; cancelled: string[]; lines: string[] }
