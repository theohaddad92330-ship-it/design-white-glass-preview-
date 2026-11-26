import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { TERRITORY_INDICATOR_PANELS, TERRITORY_MEASURE_KEYS, TERRITORY_MEASURE_TARGETS } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'

/**
 * UN INDICATEUR DE TERRITOIRE MÈNE À QUELQUE CHOSE QUI EXISTE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA RÈGLE QU'ELLE PROTÈGE
 * ─────────────────────────────────────────────────────────────────────────────
 * « Un indicateur qui ne mène nulle part ne sert à rien. » L'écran Marché posait
 * trois nombres nus — « Offres IT 100 · ESN implantées 1316 · Appels d'offres
 * ouverts 8 » —, et aucun n'ouvrait ce qu'il comptait. Chaque mesure porte
 * désormais sa destination dans {@link TERRITORY_MEASURE_TARGETS}, et une
 * destination écrite à la main dans une table de constantes est une CHAÎNE DE
 * CARACTÈRES : rien, dans le typage, n'empêche `/decouvrir`.
 *
 * Elle vérifie les DEUX formes de destination, parce qu'elles échouent
 * différemment :
 *  · une `route` doit figurer dans l'arbre de routes RÉEL (`routeTree.gen.ts`,
 *    généré par le plugin de routage) — sinon la tuile mène à « Page
 *    introuvable », ce qui fait douter du produit entier ;
 *  · un `panel` doit être RENDU par l'écran — sinon le clic n'ouvre rien du
 *    tout, ce qui est le même défaut en plus discret : silencieux.
 *
 * Même raisonnement que `adv-blockers-lead-somewhere.test.ts`, qui garde la
 * même règle sur les motifs de blocage ADV.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE NE PRÉTEND PAS SAVOIR
 * ─────────────────────────────────────────────────────────────────────────────
 * Elle ne dit pas que l'écran d'arrivée montre bien CE QUE le chiffre compte —
 * ça demanderait de reconnaître une population dans du JSX. Ce qu'elle sait dire
 * est exact : la porte existe, ou elle n'existe pas.
 */

const SRC = join(__dirname, '..')
const ROUTE_TREE = readFileSync(join(SRC, 'routeTree.gen.ts'), 'utf8')
const SCREEN = readFileSync(join(SRC, 'features', 'market-watch', 'view', 'MarketWatch.tsx'), 'utf8')

/** Les chemins déclarés par l'arbre — jamais une liste tenue à la main. */
function declaredRoutes(): Set<string> {
  return new Set([...ROUTE_TREE.matchAll(/^\s*path: '([^']+)'/gm)].map(match => match[1] as string))
}

/** Les panneaux que l'écran rend RÉELLEMENT, lus sur leur marqueur. */
function renderedPanels(): Set<string> {
  return new Set([...SCREEN.matchAll(/data-panel="([a-z]+)"/g)].map(match => match[1] as string))
}

describe('les indicateurs de territoire mènent à un écran qui existe', () => {
  const routes = declaredRoutes()
  const panels = renderedPanels()

  it('la garde LIT quelque chose — un arbre vide passerait au vert pour toujours', () => {
    // Sans ce contrôle, un `routeTree.gen.ts` tronqué, un écran renommé ou un
    // motif d'extraction cassé rendrait tous les tests ci-dessous verts en ne
    // vérifiant plus rien. C'est le motif exact des gardes borgnes du dépôt.
    expect(routes.size).toBeGreaterThan(20)
    expect(routes.has('/accounts/marches')).toBe(true)
    expect(panels.size).toBeGreaterThan(0)
    expect(TERRITORY_MEASURE_KEYS.length).toBe(4)
  })

  it('chaque mesure a une destination — aucune n’est un chiffre nu', () => {
    // La faute d'origine : trois nombres, zéro destination.
    const orphans = TERRITORY_MEASURE_KEYS.filter(key => !TERRITORY_MEASURE_TARGETS[key])
    expect(orphans).toEqual([])
  })

  it('chaque destination `route` figure dans l’arbre de routes RÉEL', () => {
    const dangling = TERRITORY_MEASURE_KEYS.filter(key => {
      const target = TERRITORY_MEASURE_TARGETS[key]
      return target.kind === 'route' && !routes.has(target.route)
    })
    expect(dangling).toEqual([])
  })

  it('chaque destination `panel` est RENDUE par l’écran', () => {
    const unrendered = TERRITORY_MEASURE_KEYS.filter(key => {
      const target = TERRITORY_MEASURE_TARGETS[key]
      return target.kind === 'panel' && !panels.has(target.panel)
    })
    expect(unrendered).toEqual([])
  })

  it('chaque panneau DÉCLARÉ existe à l’écran — un panneau fantôme ment sur ce qui est atteignable', () => {
    // La taxonomie et l'écran peuvent diverger dans les deux sens. Celui-ci est
    // le plus discret : un panneau nommé dans les contrats que plus rien ne
    // rend se lit, en relecture, comme une capacité livrée.
    const missing = TERRITORY_INDICATOR_PANELS.filter(panel => !panels.has(panel))
    expect(missing).toEqual([])
  })

  it('elle sait dire NON — une destination inventée est refusée', () => {
    // La preuve qu'elle mord, des deux côtés : sans ces assertions, on ne
    // saurait pas distinguer « toutes les destinations sont bonnes » de
    // « les ensembles sont vides ».
    // Le témoin était `/decouvrir` — devenu une VRAIE route le 29/10/2026 (alias
    // français du lot 94, #4710). Un témoin négatif ne doit pas être un chemin
    // plausible : celui-ci a la forme que le dépôt réserve à l'écran qui n'existe
    // pas (`dossier-cta-interdits.test.ts`), et qu'aucun alias ne réclamera.
    expect(routes.has('/ecran/qui/nexiste/pas')).toBe(false)
    expect(panels.has('inexistant')).toBe(false)
  })

  it('l’écran suit la destination qu’on lui donne, il n’en invente pas', () => {
    // Le défaut symétrique : une table de destinations juste, et un écran qui
    // code son lien en dur à côté. La tuile lit `measure.target`, et c'est
    // vérifiable à la lecture.
    expect(SCREEN).toContain('measure.target.kind')
    expect(SCREEN).toContain('to={measure.target.route}')
    expect(SCREEN).toContain('search={measure.target.search')
  })
})
