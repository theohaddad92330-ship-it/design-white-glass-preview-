import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PRODUCT_SCREENS, normalizeScreenRoute } from '@bellum/contracts'

/**
 * GA-265 — le catalogue des écrans (#1683) dit TOUTES les routes du produit, et
 * seulement elles.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE PROTÈGE
 * ─────────────────────────────────────────────────────────────────────────────
 * `PRODUCT_SCREENS` (`@bellum/contracts`) est la table qui donne un NOM à chaque
 * route du produit client. Quatre écrans d'analytique produit (#1683, #1684,
 * #1687, #1688) la lisent, et un écran absent du catalogue leur est INVISIBLE :
 * il ne sortirait pas « jamais ouvert », il ne sortirait pas du tout. C'est
 * exactement le défaut que le dépôt a déjà payé — une liste écrite à la main ne
 * voit jamais ce qui n'y est pas.
 *
 * La source de vérité n'est donc PAS le catalogue : c'est `apps/web/src/routes/`,
 * lu ici à travers la dérivation que TanStack Router en fait lui-même
 * (`FileRoutesByFullPath`, dans `apps/web/src/routeTree.gen.ts`). Réimplémenter
 * les conventions de nommage de TanStack (`$id_.brief.tsx`, `route.tsx`,
 * `index.tsx`, `needs_.$needId.tsx`) donnerait une SECONDE dérivation, qui
 * divergerait le jour où le routeur change de convention.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ELLE COMPARE DANS LES DEUX SENS, ET C'EST DÉLIBÉRÉ
 * ─────────────────────────────────────────────────────────────────────────────
 *  · une route SANS entrée → un écran qu'aucun tableau ne nommera ;
 *  · une entrée SANS route → un écran fantôme, listé « jamais ouvert » pendant
 *    des mois alors qu'il a été supprimé. Un catalogue périmé ment plus
 *    tranquillement qu'un catalogue incomplet.
 */

const ROUTE_TREE = join(__dirname, '..', '..', '..', '..', 'apps', 'web', 'src', 'routeTree.gen.ts')

/**
 * Les chemins COMPLETS déclarés par le routeur, normalisés comme le catalogue
 * les écrit.
 *
 * ⚠️ `FileRoutesByFullPath` porte des DOUBLONS après normalisation : TanStack y
 * déclare à la fois la route de mise en page (`/settings/profile`, issue de
 * `route.tsx`) et son index (`/settings/profile/`, issue de `index.tsx`). Les
 * deux rendent le MÊME écran. Le `Set` de sortie les réunit — c'est le
 * comportement voulu, pas une perte d'information.
 */
function declaredRoutes(source: string): Set<string> {
  const start = source.indexOf('export interface FileRoutesByFullPath {')
  if (start === -1) return new Set()
  const end = source.indexOf('\n}', start)
  if (end === -1) return new Set()
  const block = source.slice(start, end)

  const routes = new Set<string>()
  for (const line of block.split('\n')) {
    // Une entrée est `  '<chemin>': typeof XRoute`. On refuse tout le reste :
    // une ligne de commentaire ou une accolade ne doit pas devenir une route.
    const match = /^\s*'([^']+)':\s*typeof\s/.exec(line)
    const path = match?.[1]
    if (!path || !path.startsWith('/')) continue
    routes.add(normalizeScreenRoute(path))
  }
  return routes
}

/** Ce que la garde REPROCHE, dans les deux sens. La fonction est isolée pour
 *  qu'on puisse lui donner un corpus FABRIQUÉ et vérifier qu'elle sait dire non. */
function compare(
  declared: ReadonlySet<string>,
  catalogued: ReadonlySet<string>,
): { missing: string[]; stale: string[] } {
  return {
    missing: [...declared].filter(route => !catalogued.has(route)).sort(),
    stale: [...catalogued].filter(route => !declared.has(route)).sort(),
  }
}

describe('GA-265 — le catalogue des écrans couvre les routes réelles', () => {
  const source = readFileSync(ROUTE_TREE, 'utf8')
  const declared = declaredRoutes(source)
  const catalogued = new Set(PRODUCT_SCREENS.map(screen => screen.route))

  it('LIT quelque chose — le corpus de routes n’est pas vide', () => {
    // Sans cette ligne, un `routeTree.gen.ts` renommé ou une interface renommée
    // rendrait la garde verte en ne lisant RIEN. Le produit a plus de cinquante
    // routes : un corpus plus petit est un corpus cassé, pas un petit produit.
    expect(declared.size).toBeGreaterThan(50)
    expect(catalogued.size).toBeGreaterThan(50)
  })

  it('aucune route du produit n’est absente du catalogue', () => {
    const { missing } = compare(declared, catalogued)
    // Le message porte la liste : une garde qui dit « 1 ≠ 0 » fait rouvrir le
    // fichier, une garde qui NOMME la route se corrige en trente secondes.
    expect(`routes sans entrée → ${missing.join(', ')}`).toBe('routes sans entrée → ')
  })

  it('aucune entrée du catalogue ne survit à sa route', () => {
    const { stale } = compare(declared, catalogued)
    expect(`entrées sans route → ${stale.join(', ')}`).toBe('entrées sans route → ')
  })

  // ⚠️ Les deux témoins ci-dessous travaillent sur des ensembles FABRIQUÉS, pas
  // sur le catalogue réel : sinon ils rougiraient EN MÊME TEMPS que la règle
  // qu'ils sont censés qualifier, et on ne saurait plus lequel des deux a
  // vraiment quelque chose à dire.
  it('sait dire NON — une route ajoutée sans entrée est REPROCHÉE', () => {
    expect(compare(new Set(['/a', '/b']), new Set(['/a']))).toEqual({ missing: ['/b'], stale: [] })
  })

  it('sait dire NON — une entrée dont la route a disparu est REPROCHÉE', () => {
    expect(compare(new Set(['/a']), new Set(['/a', '/b']))).toEqual({ missing: [], stale: ['/b'] })
  })

  it('n’attrape pas ce qu’elle ne vise pas — la barre finale du routeur n’est pas une route de plus', () => {
    // Le témoin du cas LÉGITIME voisin. `FileRoutesByFullPath` déclare
    // `/accounts` (motif) ET `/accounts/` (index) ; `/settings/profile` (mise en
    // page) ET `/settings/profile/` (index). Une garde qui compterait ces
    // formes séparément exigerait des entrées en double dans le catalogue.
    expect(source).toContain("'/accounts/': typeof AccountsIndexRoute")
    expect(declared.has('/accounts')).toBe(true)
    expect(declared.has('/accounts/')).toBe(false)
    expect(compare(declared, catalogued).missing).toEqual([])
  })

  it('n’attrape pas ce qu’elle ne vise pas — une ligne qui n’est pas une route n’en devient pas une', () => {
    // Le bloc lu contient sa propre ligne d'ouverture et des lignes de type. Le
    // motif exige `'<chemin>': typeof ` : rien d'autre ne passe.
    const fabricated = declaredRoutes(
      [
        'export interface FileRoutesByFullPath {',
        "  '/vrai': typeof VraiRoute",
        "  'pas-un-chemin': typeof AutreRoute",
        "  '/faux': string",
        '  // /commentaire',
        '}',
      ].join('\n'),
    )
    expect([...fabricated]).toEqual(['/vrai'])
  })
})
