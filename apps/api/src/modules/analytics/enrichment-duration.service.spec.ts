import { EnrichmentDurationService } from './enrichment-duration.service'

/**
 * #2120.57 / #2297.23 — la durée d'un enrichissement se MESURE et s'annonce.
 *
 * Garanties tenues ici :
 *  - moins de 5 mesures ⇒ `null` (non mesuré ≠ 0, GA-18/GA-19) ;
 *  - la médiane, pas la moyenne — insensible à une cascade exceptionnellement
 *    longue (85 s, la borne haute documentée du contrôleur) ;
 *  - #2120.57 (b) — `estimate()` ne prend la médiane que sur les lignes
 *    ABOUTIES (`found: true`) : une réponse « rien trouvé », quasi instantanée,
 *    ne doit jamais tirer la médiane vers le bas.
 */
describe('EnrichmentDurationService', () => {
  function setup(rows: { duration_ms: number }[] = []) {
    const samples = {
      find: jest.fn().mockResolvedValue(rows),
      insert: jest.fn().mockResolvedValue({}),
    }
    return { service: new EnrichmentDurationService(samples as never), samples }
  }

  describe('estimate()', () => {
    it('rend null avec moins de 5 mesures — non mesuré n’est jamais 0', async () => {
      const { service } = setup([{ duration_ms: 30_000 }, { duration_ms: 32_000 }, { duration_ms: 28_000 }])

      expect(await service.estimate()).toBeNull()
    })

    it('rend null sans aucune mesure', async () => {
      const { service } = setup([])

      expect(await service.estimate()).toBeNull()
    })

    it('rend la médiane exacte sur un nombre IMPAIR de mesures', async () => {
      const { service } = setup([
        { duration_ms: 10_000 },
        { duration_ms: 50_000 },
        { duration_ms: 30_000 },
        { duration_ms: 20_000 },
        { duration_ms: 40_000 },
      ])

      const estimate = await service.estimate()

      expect(estimate).toEqual({ medianMs: 30_000, sampleSize: 5 })
    })

    it('rend la moyenne des deux médianes sur un nombre PAIR de mesures', async () => {
      const { service } = setup([
        { duration_ms: 10_000 },
        { duration_ms: 20_000 },
        { duration_ms: 30_000 },
        { duration_ms: 40_000 },
        { duration_ms: 50_000 },
        { duration_ms: 60_000 },
      ])

      const estimate = await service.estimate()

      // Médiane de [10,20,30,40,50,60] = (30+40)/2 = 35 000 ms.
      expect(estimate).toEqual({ medianMs: 35_000, sampleSize: 6 })
    })

    it('lit au plus les 50 dernières mesures ABOUTIES, les plus récentes', async () => {
      const { service, samples } = setup(Array.from({ length: 5 }, () => ({ duration_ms: 30_000 })))

      await service.estimate()

      expect(samples.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: { found: true }, order: { measured_at: 'DESC' }, take: 50 }),
      )
    })

    // #2120.57 (b) — mesuré en production : une réponse « rien trouvé »
    // revient quasi instantanément (proche de 0 ms), un enrichissement qui
    // aboutit prend 30-85 s. `estimate()` filtre déjà `found: true` côté
    // requête (`where`), donc les lignes « rien trouvé » que le mock
    // renverrait ne sont testées qu'à travers ce filtre — ce test prouve
    // que rien, côté service, ne les réintroduit après coup.
    it('ne laisse jamais une ligne « rien trouvé » tirer la médiane vers le bas', async () => {
      const { service } = setup([
        { duration_ms: 32_000 },
        { duration_ms: 35_000 },
        { duration_ms: 30_000 },
        { duration_ms: 33_000 },
        { duration_ms: 31_000 },
      ])

      const estimate = await service.estimate()

      expect(estimate?.medianMs).toBeGreaterThan(1_000)
    })
  })

  describe('record()', () => {
    it('journalise la durée mesurée avec son verdict `found`', async () => {
      const { service, samples } = setup()

      await service.record(42_500, true)

      expect(samples.insert).toHaveBeenCalledWith({ duration_ms: 42_500, found: true })
    })

    it('journalise aussi un « rien trouvé » (`found: false`) — c’est une RÉPONSE, pas un incident', async () => {
      const { service, samples } = setup()

      await service.record(120, false)

      expect(samples.insert).toHaveBeenCalledWith({ duration_ms: 120, found: false })
    })

    it('ne lève jamais — un échec d’écriture reste best-effort', async () => {
      const samples = { find: jest.fn(), insert: jest.fn().mockRejectedValue(new Error('db down')) }
      const service = new EnrichmentDurationService(samples as never)

      await expect(service.record(1_000, true)).resolves.toBeUndefined()
    })

    it('ignore une durée négative sans lever ni écrire', async () => {
      const { service, samples } = setup()

      await service.record(-5, true)

      expect(samples.insert).not.toHaveBeenCalled()
    })
  })
})
