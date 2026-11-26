import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * GA-288 — une route ENFANT n'existe que si son parent rend un `<Outlet />`.
 *
 * Le défaut, mesuré en production le 11/09/2026 sur
 * `/consultants/$id/reverse-market` : le routeur avait fait de la page un ENFANT
 * de `/consultants/$id`, dont le composant rend la fiche du consultant et n'a
 * aucun `<Outlet />`. L'URL matchait, le titre de l'onglet changeait, et le
 * composant ne s'affichait NULLE PART — c'est la fiche du parent qu'on voyait.
 *
 * Rien ne pouvait l'attraper : aucune erreur console, et le composant a ses
 * propres tests, qui passent tous puisqu'ils le montent directement. C'est la
 * famille « du code juste que personne n'appelle », dans sa version la plus
 * silencieuse : ici même l'APPELANT existe, c'est le rendu qui n'arrive pas.
 *
 * Le geste, quand cette garde tombe : soit le parent est une vraie coque et il
 * rend `<Outlet />`, soit l'enfant n'en est pas un — et le nom de son fichier
 * porte l'underscore final (`$id_.ma-page.tsx`), comme `/accounts/$id_/brief`.
 */

const ROUTES_DIR = join(__dirname, '..', 'routes')
const ROUTE_TREE = join(__dirname, '..', 'routeTree.gen.ts')

/** Le fichier source d'une route, à partir de son identifiant dans l'arbre. */
function routeFile(id: string): string | null {
  // '/consultants/$id' → 'routes/consultants/$id.tsx' ou '.../$id/index.tsx'
  const rel = id.replace(/^\//, '')
  for (const candidate of [`${rel}.tsx`, join(rel, 'index.tsx'), `${rel}/route.tsx`]) {
    try {
      readFileSync(join(ROUTES_DIR, candidate), 'utf8')
      return join(ROUTES_DIR, candidate)
    } catch {
      /* le candidat suivant */
    }
  }
  return null
}

/** Les couples (enfant, parent) déclarés par l'arbre généré. */
function parentedRoutes(): { child: string; parent: string }[] {
  const tree = readFileSync(ROUTE_TREE, 'utf8')
  const out: { child: string; parent: string }[] = []
  const block =
    /'([^']+)': \{\s*id: '[^']*'\s*path: '[^']*'\s*fullPath: '[^']*'\s*preLoaderRoute: typeof \w+\s*parentRoute: typeof (\w+)/g
  for (let m = block.exec(tree); m !== null; m = block.exec(tree)) {
    const [, child, parentSymbol] = m
    if (!child || !parentSymbol || parentSymbol === 'rootRouteImport') continue
    out.push({ child, parent: parentSymbol })
  }
  return out
}

/** Le chemin de route d'un symbole d'import de l'arbre (`ConsultantsIdRoute` → '/consultants/$id'). */
function pathOfSymbol(symbol: string): string | null {
  const tree = readFileSync(ROUTE_TREE, 'utf8')
  const declaration = new RegExp(`import \\{ Route as ${symbol}Import \\} from '\\.(/routes/[^']+)'`)
  const found = declaration.exec(tree)
  return found?.[1]?.replace('/routes', '') ?? null
}

/**
 * Un parent rend ses enfants de DEUX façons légitimes, et n'en oublier aucune
 * est la troisième preuve de cette garde : `<Outlet />` dans du JSX, et
 * `component: Outlet` — une coque qui ne fait QUE laisser passer. Ne chercher
 * que la première forme accusait six routes parfaitement correctes.
 */
function rendersOutlet(source: string): boolean {
  return source.includes('<Outlet') || /component:\s*Outlet\b/.test(source)
}

describe('GA-288 — une route enfant n’est rendue que si son parent a un `<Outlet />`', () => {
  const couples = parentedRoutes()

  it('LIT quelque chose — l’arbre généré déclare bien des routes imbriquées', () => {
    expect(couples.length).toBeGreaterThan(0)
  })

  it('tout parent de route rend un `<Outlet />`', () => {
    const offenders: string[] = []
    for (const { child, parent } of couples) {
      const parentPath = pathOfSymbol(parent)
      if (!parentPath) continue
      const file = routeFile(parentPath)
      if (!file) continue
      if (!rendersOutlet(readFileSync(file, 'utf8'))) {
        offenders.push(`${child} → parent ${parentPath} sans <Outlet />`)
      }
    }
    // Si cette liste cesse d’être vide : soit le parent devient une coque et
    // rend `<Outlet />`, soit l’enfant n’en est pas un et son fichier prend
    // l’underscore final (`$id_.ma-page.tsx`).
    expect(offenders.sort()).toEqual([])
  })

  it('SAIT DIRE NON — un parent sans `<Outlet />` est détecté', () => {
    const sansOutlet = `
      export const Route = createFileRoute('/consultants/$id')({ component: Fiche })
      function Fiche() { return <ConsultantSheet /> }
    `
    expect(rendersOutlet(sansOutlet)).toBe(false)
  })

  it('n’attrape pas ce qu’elle ne vise pas — les DEUX formes de passe-plat comptent', () => {
    // Témoin 1 : le JSX explicite.
    expect(rendersOutlet('function Coque() { return (<Shell><Outlet /></Shell>) }')).toBe(true)
    // Témoin 2 : la coque qui ne fait QUE laisser passer — six routes réelles
    // du dépôt (`settings/profile/route.tsx`, `onboarding/$id/$stage/route.tsx`)
    // l'écrivent ainsi, et la première version de cette garde les accusait.
    expect(rendersOutlet("import { createFileRoute, Outlet } from '@tanstack/react-router'\ncomponent: Outlet,")).toBe(
      true,
    )
  })

  it('n’attrape pas ce qu’elle ne vise pas — une route de premier niveau n’a pas de parent à contrôler', () => {
    const tree = readFileSync(ROUTE_TREE, 'utf8')
    // Le témoin : la page réparée par ce lot est rattachée à la RACINE, donc
    // elle n’entre jamais dans le contrôle ci-dessus — et c’est correct.
    expect(tree).toContain("'/consultants/$id_/reverse-market'")
    expect(couples.some(c => c.child === '/consultants/$id_/reverse-market')).toBe(false)
  })
})
