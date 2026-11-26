import { describe, expect, it } from 'vitest'

import { PAGES } from './pages'
import { ROUTE_EXCEPTIONS } from './route-exceptions'
import { findDoubleCovered, findMissingCoverage, findStaleExceptions, realRoutesOnDisk } from './route-coverage'

/**
 * La garde de couverture des routes — la maquette Figma ne peut PAS être
 * écrite par la CI (l'API REST de Figma ne crée pas de nœuds), donc la seule
 * façon de savoir qu'une route a été oubliée est de comparer le disque au
 * registre `PAGES` avant même d'ouvrir le plugin.
 *
 * Une route réelle (un fichier de page/route des trois surfaces) DOIT être
 * couverte par une `PageSpec.route`, ou nommée dans `route-exceptions.ts`
 * avec sa raison. Ni l'un ni l'autre = la route n'existe pour personne, en
 * silence — exactement le défaut que ce dépôt a déjà payé ailleurs
 * (« du code juste que personne n'appelle »).
 */
describe('la garde de couverture des routes', () => {
  const specRoutes = PAGES.map(p => p.route)
  const exceptionRoutes = ROUTE_EXCEPTIONS.map(e => e.route)
  const realRoutes = realRoutesOnDisk()

  it('lit un corpus réel — sinon la garde est aveugle', () => {
    // Contrôle positif : si le disque devenait illisible ou le dossier vide,
    // toutes les listes seraient vides et la garde rendrait un vert qui ne
    // prouve rien. Les trois surfaces doivent apparaître.
    expect(realRoutes.length).toBeGreaterThan(140)
    expect(realRoutes.some(r => r.startsWith('apps/web/src/routes/'))).toBe(true)
    expect(realRoutes.some(r => r.startsWith('apps/website/src/app/'))).toBe(true)
    expect(realRoutes.some(r => r.startsWith('apps/dashboard-manager/src/app/'))).toBe(true)
    expect(specRoutes.length).toBeGreaterThan(140)
    expect(exceptionRoutes.length).toBeGreaterThan(0)
  })

  it('chaque route réelle a une spec ou une exception nommée', () => {
    const missing = findMissingCoverage(realRoutes, specRoutes, exceptionRoutes)
    if (missing.length > 0) {
      throw new Error(
        [
          `${missing.length} route(s) sans spec ni exception :`,
          ...missing.map(r => `  - ${r}`),
          '',
          'Chaque route ci-dessus a besoin soit d’une spec dans `src/spec/pages/<surface>/`,',
          'soit d’une entrée dans `src/spec/route-exceptions.ts` avec sa raison.',
        ].join('\n'),
      )
    }
    expect(missing).toEqual([])
  })

  it('aucune exception n’est périmée (route déplacée ou supprimée)', () => {
    expect(findStaleExceptions(realRoutes, exceptionRoutes)).toEqual([])
  })

  it('aucune route n’est à la fois maquettée et listée en exception', () => {
    expect(findDoubleCovered(specRoutes, exceptionRoutes)).toEqual([])
  })

  // Qu'une `PageSpec.route` pointe vers un fichier qui existe encore est déjà
  // gardé par `validate.test.ts` (« le registre des pages » — chaque route et
  // chaque source de note UX pointe un fichier qui existe), sur TOUT chemin de
  // fichier réel, pas seulement les `page.tsx` que cette garde-ci recense
  // (une spec peut légitimement citer `not-found.tsx`, hors du glob des
  // routes). Le redire ici avec le glob plus étroit de `realRoutesOnDisk`
  // produirait un faux rouge sur ce cas — pas une couverture en plus.
})

describe('la garde de couverture des routes sait dire NON', () => {
  it('accuse une route fictive sans spec ni exception', () => {
    const realRoutesFixture = [
      'apps/web/src/routes/accounts/index.tsx',
      'apps/web/src/routes/une-route-fictive-jamais-maquettee.tsx',
    ]
    const specRoutesFixture = ['apps/web/src/routes/accounts/index.tsx']
    const exceptionRoutesFixture: string[] = []

    const missing = findMissingCoverage(realRoutesFixture, specRoutesFixture, exceptionRoutesFixture)

    expect(missing).toEqual(['apps/web/src/routes/une-route-fictive-jamais-maquettee.tsx'])
  })

  it('ne dit pas NON à une route couverte par une exception', () => {
    const realRoutesFixture = ['apps/web/src/routes/technique/route.tsx']
    const specRoutesFixture: string[] = []
    const exceptionRoutesFixture = ['apps/web/src/routes/technique/route.tsx']

    expect(findMissingCoverage(realRoutesFixture, specRoutesFixture, exceptionRoutesFixture)).toEqual([])
  })

  it('signale une exception périmée (fichier disparu du disque)', () => {
    expect(findStaleExceptions(['apps/web/src/routes/a.tsx'], ['apps/web/src/routes/b-disparue.tsx'])).toEqual([
      'apps/web/src/routes/b-disparue.tsx',
    ])
  })

  it('signale une route à la fois spec et exception', () => {
    expect(findDoubleCovered(['apps/web/src/routes/a.tsx'], ['apps/web/src/routes/a.tsx'])).toEqual([
      'apps/web/src/routes/a.tsx',
    ])
  })
})
