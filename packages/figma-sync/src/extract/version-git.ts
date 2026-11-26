import { execFileSync } from 'node:child_process'

import { REPO_ROOT } from './tokens'

/**
 * Isolé de `version.ts` (pur) : c'est le SEUL module de `extract/` que le
 * plugin ne doit JAMAIS importer en valeur — `node:child_process` n'existe
 * pas dans le bac à sable Figma, et `platform: 'neutral'` (esbuild) échoue à
 * la résolution dès qu'un module qui l'importe entre dans le graphe, même si
 * l'appelant n'utilise que d'autres exports du même fichier. Seul `cli.ts`
 * (Node, jamais bundlé pour Figma) doit importer `readShortSha`.
 */

/**
 * Le sha court du HEAD git. `inconnu` si le dossier n'est pas un dépôt git
 * (ou n'a aucun commit) — jamais une exception qui casserait `extract`,
 * jamais un sha inventé en repli.
 */
export function readShortSha(root: string = REPO_ROOT): string {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: root, encoding: 'utf8', stdio: 'pipe' }).trim()
  } catch {
    return 'inconnu'
  }
}
