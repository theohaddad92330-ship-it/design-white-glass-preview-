// Types de `claude-hook-push.mjs`, pour le test qui le garde (`apps/web/src/test/porte-locale.test.ts`).
export declare function parsePush(command: string): { dir: string | null } | null
export declare function pushVerdict(input: { head: string | null; witness: string | null }): {
  allow: boolean
  message: string
}
