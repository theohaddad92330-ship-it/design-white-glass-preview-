import { ChatTurnCostEstimateService } from './chat-turn-cost-estimate.service'

/**
 * #2448.8 / #2882.11 (épopée #2882) — « Vérifié estime coût et durée avant le
 * run », sur des mesures RÉELLES du même palier, jamais un chiffre deviné.
 *
 * Garanties tenues ici (même patron que `EnrichmentDurationService`) :
 *  - moins de 5 mesures ⇒ `null` (non mesuré ≠ 0, GA-18/GA-19) ;
 *  - la durée est la MÉDIANE, insensible à une cascade exceptionnelle ;
 *  - le coût est la MOYENNE des seules lignes TARIFÉES (`cost_usd` non nul) —
 *    une fenêtre sans AUCUNE ligne tarifée rend `cost.measured === false`,
 *    jamais un `0` qui prétendrait avoir mesuré un prix.
 */
describe('ChatTurnCostEstimateService', () => {
  function setup(rows: { duration_ms: number; cost_usd: string | null }[] = []) {
    const samples = {
      find: jest.fn().mockResolvedValue(rows),
      insert: jest.fn().mockResolvedValue({}),
    }
    return { service: new ChatTurnCostEstimateService(samples as never), samples }
  }

  describe('estimate()', () => {
    it('rend null avec moins de 5 mesures — non mesuré n’est jamais 0', async () => {
      const { service } = setup([
        { duration_ms: 8_000, cost_usd: '0.01' },
        { duration_ms: 9_000, cost_usd: '0.02' },
      ])

      expect(await service.estimate('deep')).toBeNull()
    })

    it('rend null sans aucune mesure', async () => {
      const { service } = setup([])

      expect(await service.estimate('fast')).toBeNull()
    })

    it('rend la médiane de durée et la moyenne des coûts TARIFÉS', async () => {
      const { service } = setup([
        { duration_ms: 10_000, cost_usd: '0.02' },
        { duration_ms: 20_000, cost_usd: '0.04' },
        { duration_ms: 30_000, cost_usd: null },
        { duration_ms: 40_000, cost_usd: '0.06' },
        { duration_ms: 50_000, cost_usd: null },
      ])

      const estimate = await service.estimate('deep')

      expect(estimate).toEqual({
        tier: 'deep',
        durationMs: 30_000,
        sampleSize: 5,
        cost: { measured: true, avgCostUsd: 0.04 },
      })
    })

    it('aucune ligne tarifée sur la fenêtre ⇒ cost.measured est false, jamais 0', async () => {
      const { service } = setup([
        { duration_ms: 5_000, cost_usd: null },
        { duration_ms: 6_000, cost_usd: null },
        { duration_ms: 7_000, cost_usd: null },
        { duration_ms: 8_000, cost_usd: null },
        { duration_ms: 9_000, cost_usd: null },
      ])

      const estimate = await service.estimate('fast')

      expect(estimate?.cost).toEqual({ measured: false })
    })

    it('lit au plus les 50 dernières mesures du PALIER demandé, les plus récentes', async () => {
      const { service, samples } = setup(Array.from({ length: 5 }, () => ({ duration_ms: 10_000, cost_usd: '0.01' })))

      await service.estimate('deep')

      expect(samples.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tier: 'deep' }, order: { measured_at: 'DESC' }, take: 50 }),
      )
    })
  })

  describe('record()', () => {
    it('journalise la durée et le coût mesurés pour ce palier', async () => {
      const { service, samples } = setup()

      await service.record('deep', 42_500, 0.03)

      expect(samples.insert).toHaveBeenCalledWith({ tier: 'deep', duration_ms: 42_500, cost_usd: '0.03' })
    })

    it('journalise un coût NON mesuré (`null`) tel quel — jamais 0', async () => {
      const { service, samples } = setup()

      await service.record('fast', 1_200, null)

      expect(samples.insert).toHaveBeenCalledWith({ tier: 'fast', duration_ms: 1_200, cost_usd: null })
    })

    it('ne lève jamais — un échec d’écriture reste best-effort', async () => {
      const samples = { find: jest.fn(), insert: jest.fn().mockRejectedValue(new Error('db down')) }
      const service = new ChatTurnCostEstimateService(samples as never)

      await expect(service.record('deep', 1_000, 0.01)).resolves.toBeUndefined()
    })

    it('ignore une durée négative sans lever ni écrire', async () => {
      const { service, samples } = setup()

      await service.record('deep', -5, 0.01)

      expect(samples.insert).not.toHaveBeenCalled()
    })
  })
})
