import { SAVED_VIEW_SCOPES } from '@bellum/contracts'
import type { QueryRunner } from 'typeorm'
import { SavedViewsProjectsPipeReissued1796001506182 } from '../1796001506182-SavedViewsProjectsPipeReissued'

async function upQueries(): Promise<string[]> {
  const queries: string[] = []
  const runner = {
    query: jest.fn(async (sql: string) => {
      queries.push(sql.replace(/\s+/g, ' ').trim())
      return []
    }),
  } as unknown as QueryRunner
  await new SavedViewsProjectsPipeReissued1796001506182().up(runner)
  return queries
}

/**
 * #2170.52 — la contrainte s'ÉLARGIT avant le code qui écrit (GA-11 / GA-12).
 * Même patron de test que `1793700500000-DiscoverSavedSearches.spec.ts`.
 *
 * ⚠️ RÉÉMISE le 25/09/2026 (issue #3001, CI de contrôle vague 40) sous un
 * horodatage PLUS GRAND que la série : l'originale, `SavedViewsProjectsPipe
 * 1790289084455`, portait un horodatage plus ANCIEN que
 * `DiscoverSavedSearches1793700500000` alors que son SQL suppose ce dernier
 * déjà appliqué (elle liste `discover` ET `projects_pipe`). Triée par
 * horodatage, TypeORM l'exécutait AVANT Discover, qui rétrécissait ensuite la
 * contrainte en la redéclarant sans `projects_pipe` — GA-11 (rétrécissement),
 * GA-12 (contrainte n'accepte pas tout l'enum) et GA-372 (pas la plus grande
 * de la série) rouges tous les trois. Voir aussi le nouveau commentaire de
 * `up()` sur l'idempotence : l'ANCIENNE version a déjà tourné en production
 * sous son ancien nom, cette réémission doit pouvoir rejouer sans dégât.
 */
describe('SavedViewsProjectsPipeReissued1796001506182', () => {
  it('élargit `saved_views_scope_check` à TOUTE la taxonomie, `projects_pipe` compris (GA-12)', async () => {
    const sql = (await upQueries()).join('\n')
    const constraint = sql.split('CONSTRAINT ').find(part => part.startsWith('saved_views_scope_check')) ?? ''
    for (const scope of SAVED_VIEW_SCOPES) expect(constraint).toContain(`'${scope}'`)
  })

  it('n’enlève AUCUN scope existant — une contrainte ne rétrécit jamais (GA-11)', async () => {
    const sql = (await upQueries()).join('\n')
    const constraint = sql.split('CONSTRAINT ').find(part => part.startsWith('saved_views_scope_check')) ?? ''
    for (const scope of ['accounts', 'contacts', 'projects', 'talents', 'missions', 'discover']) {
      expect(constraint).toContain(`'${scope}'`)
    }
  })
})
