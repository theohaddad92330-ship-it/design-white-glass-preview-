// Types de `local.mjs`, pour le test qui le garde (`apps/web/src/test/porte-locale.test.ts`).
export interface WorkspacePackage {
  dir: string
  name: string
  scripts: Readonly<Record<string, string | undefined>>
}
export interface LocalStep {
  id: string
  label: string
  cmd?: string
  args: string[]
  cwd?: string
  skip?: string
  builtin?: 'claude-md' | 'format' | 'selected'
  suite?: 'web' | 'api'
  related?: string[]
}
export declare function touchedPackages(
  changed: readonly string[],
  packages: readonly WorkspacePackage[],
): WorkspacePackage[]
export declare function buildPlan(input: {
  changed: readonly string[]
  packages: readonly WorkspacePackage[]
  iaTests: readonly string[]
  readSource: (file: string) => string
  base?: string
  python?: string
  /** Machine cloud : tests et évals sautés, dits (la CI GitHub fait foi). */
  cloud?: boolean
  /** Le fichier existe-t-il encore ? Un fichier supprimé n'est pas passé au lint. */
  exists?: (file: string) => boolean
}): LocalStep[]
/** Fichiers suivis par git (suivis ou `git add`és) modifiés depuis `mergeBase` — jamais les non suivis. */
export declare function listChangedFiles(mergeBase: string, cwd?: string): { changed: string[]; changedAcmr: string[] }
