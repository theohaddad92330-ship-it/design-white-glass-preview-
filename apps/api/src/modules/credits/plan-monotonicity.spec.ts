import { ALL_PLAN_FEATURES, type PlanFeatureKey } from '@bellum/contracts'
import { PlanDefinitionEntity } from '../../database/entities/plan-definition.entity'
import { createMockRepository, type MockRepository } from '../../database/test-utils'
import {
  applyPlanFeatureMonotonicity,
  cloneDefaultCatalog,
  PLAN_CATALOG_DEFAULTS,
  PLAN_LADDER,
  type PlanDefinition,
} from './plan-catalog.defaults'
import { PlanCatalogService } from './plan-catalog.service'

/**
 * PLAN-01 (audit terrain 17/08) — « un plan supérieur est TOUJOURS un
 * sur-ensemble ». Le terrain montrait l'inverse : un espace Growth voyait des
 * écrans verrouillés qu'un ancien plan Pro ouvrait.
 */
describe('hiérarchie des paliers', () => {
  const featuresOf = (catalog: Record<string, PlanDefinition>, key: string): Set<PlanFeatureKey> =>
    new Set(catalog[key]?.features ?? [])

  it('la grille EMBARQUÉE est déjà cumulative', () => {
    const catalog = cloneDefaultCatalog()
    for (let i = 1; i < PLAN_LADDER.length; i++) {
      const lower = featuresOf(catalog, PLAN_LADDER[i - 1]!)
      const upper = featuresOf(catalog, PLAN_LADDER[i]!)
      for (const feature of lower) {
        expect({ palier: PLAN_LADDER[i], feature, porte: upper.has(feature) }).toEqual({
          palier: PLAN_LADDER[i],
          feature,
          porte: true,
        })
      }
    }
  })

  it("répare une grille en base devenue plus étroite en haut qu'en bas", () => {
    const catalog = cloneDefaultCatalog()
    // Ce qu'on observait en production : la ligne `growth` avait été écrite une
    // fois puis figée, pendant que Team continuait de gagner des clés.
    catalog.growth = { ...catalog.growth!, features: ['exports', 'public_api'] }

    const repaired = applyPlanFeatureMonotonicity(catalog)

    expect(featuresOf(repaired, 'growth').has('chat_ai')).toBe(true)
    expect(featuresOf(repaired, 'growth').has('needs')).toBe(true)
    // Ce que l'opérateur a explicitement accordé reste accordé.
    expect(featuresOf(repaired, 'growth').has('public_api')).toBe(true)
  })

  it("n'accorde JAMAIS une fonction qu'aucun palier inférieur ne porte", () => {
    const catalog = cloneDefaultCatalog()
    catalog.starter = { ...catalog.starter!, features: ['exports'] }
    catalog.team = { ...catalog.team!, features: ['exports', 'chat_ai'] }
    catalog.growth = { ...catalog.growth!, features: ['exports'] }

    const repaired = applyPlanFeatureMonotonicity(catalog)

    // Growth hérite de `chat_ai` (Team l'ouvre), mais rien de plus : la fonction
    // ne réapparaît pas parce qu'elle existe dans le contrat.
    expect([...featuresOf(repaired, 'growth')].sort()).toEqual(['chat_ai', 'exports'])
    expect(featuresOf(repaired, 'starter').has('chat_ai')).toBe(false)
  })

  it('ne touche pas aux paliers hors échelle commerciale', () => {
    const catalog = cloneDefaultCatalog()
    const before = [...catalog.beta!.features]
    applyPlanFeatureMonotonicity(catalog)
    expect(catalog.beta!.features).toEqual(before)
    expect(new Set(catalog.beta!.features)).toEqual(new Set(ALL_PLAN_FEATURES))
  })

  it('applique la règle sur ce que le service SERT, pas seulement sur le défaut', async () => {
    const repo: MockRepository<PlanDefinitionEntity> = createMockRepository<PlanDefinitionEntity>()
    const rowOf = (key: 'starter' | 'team' | 'growth', features: PlanFeatureKey[]) => {
      const base = PLAN_CATALOG_DEFAULTS[key]
      return {
        key,
        label: base.label,
        price_cents: base.price,
        accounts_limit: base.accounts_limit,
        enrichment_credits: base.enrichment_credits,
        seats: base.seats,
        extra_seat_price_cents: base.extra_seat_price,
        self_serve: base.self_serve,
        features,
        prices: {},
        sort_order: base.sort_order,
      } as unknown as PlanDefinitionEntity
    }
    repo.find.mockResolvedValue([
      rowOf('starter', ['exports']),
      rowOf('team', ['exports', 'chat_ai', 'discover']),
      // La ligne figée : Growth vend plus cher et ouvre moins.
      rowOf('growth', ['exports', 'public_api']),
    ])

    const service = new PlanCatalogService(repo as never)
    await service.refresh()
    const served = await service.getOrDefault('growth')

    expect(served.features).toEqual(expect.arrayContaining(['chat_ai', 'discover', 'exports', 'public_api']))
  })
})
