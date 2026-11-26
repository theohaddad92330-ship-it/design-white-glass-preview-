import { readdirSync, statSync } from 'node:fs'
import { basename, join, relative, resolve } from 'node:path'

import { REPO_ROOT } from '../extract/tokens'

/**
 * La garde de couverture des routes (voir `route-coverage.test.ts`) : une
 * route RÉELLE (un fichier de page/route sur le disque) doit être couverte
 * par une `PageSpec.route`, ou nommée dans `route-exceptions.ts` avec sa
 * raison. Ce module ne fait que LIRE le disque et COMPARER des listes de
 * chemins — la logique est volontairement pure pour être testable sur un
 * corpus fabriqué (« la garde sait dire NON »), sans dépendre du disque.
 */

interface SurfaceGlob {
  /** Le dossier racine des routes de la surface, relatif à la racine du dépôt. */
  dir: string
  /** Quels fichiers, sous ce dossier, comptent comme une route « réelle ». */
  isRouteFile: (basename: string) => boolean
}

/**
 * Les trois surfaces maquettées, et comment chacune nomme ses pages :
 * - `app`   : TanStack Router file-based — CHAQUE `.tsx` sous `routes/` est une route
 *   (fichiers `route.tsx`/layouts inclus : ils entrent dans `route-exceptions.ts`,
 *   pas dans un filtre qui les rendrait invisibles à la garde).
 * - `site`  : Next.js App Router — seul `page.tsx` rend un écran.
 * - `dm`    : idem site ; les `route.ts` d'API sous `app/api/**` ne sont pas des pages.
 */
const SURFACES: readonly SurfaceGlob[] = [
  { dir: 'apps/web/src/routes', isRouteFile: name => name.endsWith('.tsx') },
  { dir: 'apps/website/src/app', isRouteFile: name => name === 'page.tsx' },
  { dir: 'apps/dashboard-manager/src/app', isRouteFile: name => name === 'page.tsx' },
]

function walk(absDir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(absDir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue
    const full = join(absDir, entry)
    if (statSync(full).isDirectory()) walk(full, found)
    else found.push(full)
  }
  return found
}

/** Les routes réelles des trois surfaces, chemins relatifs à la racine du dépôt, triés. */
export function realRoutesOnDisk(root: string = REPO_ROOT): string[] {
  const routes: string[] = []
  for (const surface of SURFACES) {
    const absDir = resolve(root, surface.dir)
    for (const file of walk(absDir)) {
      if (surface.isRouteFile(basename(file))) routes.push(relative(root, file).split('\\').join('/'))
    }
  }
  return routes.sort()
}

/**
 * Les routes réelles qui n'ont ni spec (`specRoutes`) ni exception
 * (`exceptionRoutes`) — la LISTE, jamais la première seule, pour qu'un lot
 * qui touche plusieurs écrans voie tout d'un coup.
 */
export function findMissingCoverage(
  realRoutes: readonly string[],
  specRoutes: readonly string[],
  exceptionRoutes: readonly string[],
): string[] {
  const covered = new Set<string>([...specRoutes, ...exceptionRoutes])
  return realRoutes.filter(route => !covered.has(route)).sort()
}

/** Une exception qui ne correspond plus à aucun fichier réel — la route a bougé ou disparu, l'entrée est périmée. */
export function findStaleExceptions(realRoutes: readonly string[], exceptionRoutes: readonly string[]): string[] {
  const real = new Set<string>(realRoutes)
  return exceptionRoutes.filter(route => !real.has(route)).sort()
}

/** Une route à la fois maquettée ET listée en exception — ambigu, la garde le signale plutôt que de trancher pour l'auteur. */
export function findDoubleCovered(specRoutes: readonly string[], exceptionRoutes: readonly string[]): string[] {
  const exceptions = new Set<string>(exceptionRoutes)
  return specRoutes.filter(route => exceptions.has(route)).sort()
}
