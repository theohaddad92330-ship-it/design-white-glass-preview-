import type { DataSource } from 'typeorm'
import type { MarketMemoryService } from '../market-memory/market-memory.service'
import { CockpitPerspectiveService } from './cockpit-perspective.service'

/**
 * GARDE PERF (29/09/2026, mesuré en prod : `GET /dashboard/me` 4,0-5,4 s).
 *
 * Le recul du cockpit lance 7 requêtes SQL agrégées + une lecture de mémoire
 * marché à CHAQUE ouverture du tableau de bord ; il change peu (couverture,
 * trajectoire, séries hebdomadaires). Lu 60 s au plus, et la clé porte
 * l'utilisateur, l'espace ET le droit financier : deux personnes, deux espaces
 * ou deux droits ne partagent jamais une entrée.
 */
function build() {
  const query = jest.fn(async () => [] as unknown[])
  const memory = { pathsFor: jest.fn(async () => ({ status: 'ok', paths: new Map() })) }
  const service = new CockpitPerspectiveService(
    { query } as unknown as DataSource,
    memory as unknown as MarketMemoryService,
  )
  return { service, query }
}

describe('CockpitPerspectiveService — budget de requêtes', () => {
  it('une seconde lecture dans la minute ne refait AUCUNE requête (même personne, même espace, même droit)', async () => {
    const { service, query } = build()
    await service.getPerspective('u1', 'ws1', true)
    const afterFirst = query.mock.calls.length
    expect(afterFirst).toBeGreaterThan(0)
    // Plafond chiffré : 7 requêtes SQL au plus pour un recul complet.
    expect(afterFirst).toBeLessThanOrEqual(8)
    await service.getPerspective('u1', 'ws1', true)
    expect(query.mock.calls.length).toBe(afterFirst)
  })

  it('trois appels simultanés partagent UNE lecture', async () => {
    const { service, query } = build()
    await Promise.all([
      service.getPerspective('u1', 'ws1', true),
      service.getPerspective('u1', 'ws1', true),
      service.getPerspective('u1', 'ws1', true),
    ])
    const single = build()
    await single.service.getPerspective('u1', 'ws1', true)
    expect(query.mock.calls.length).toBe(single.query.mock.calls.length)
  })

  it('une autre personne, un autre espace ou un autre droit relisent (jamais de fuite entre clés)', async () => {
    const { service, query } = build()
    await service.getPerspective('u1', 'ws1', true)
    const one = query.mock.calls.length
    await service.getPerspective('u2', 'ws1', true)
    await service.getPerspective('u1', 'ws2', true)
    await service.getPerspective('u1', 'ws1', false)
    // Trois relectures : la dernière (sans droit financier) saute la lecture du
    // facturé, donc au plus `one * 4` et strictement plus que `one * 3`.
    expect(query.mock.calls.length).toBeGreaterThan(one * 3)
    expect(query.mock.calls.length).toBeLessThanOrEqual(one * 4)
  })
})
