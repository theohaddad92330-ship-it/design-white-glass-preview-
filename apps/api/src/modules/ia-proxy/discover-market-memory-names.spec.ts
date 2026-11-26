import { DiscoverMarketMemoryService } from './discover-market-memory.service'
import type { MarketMemoryService } from '../market-memory/market-memory.service'

/**
 * #4791.2 — Market Memory comme SOURCE de candidats : le service rend des NOMS (jamais un SIREN), datés du MOIS
 * partagé quand l'entrée en porte un ; la date « propre à l'espace » n'en sort pas (aucune fuite entre espaces).
 */
const memory = (matches: unknown[]) =>
  ({
    searchByFilters: jest.fn().mockResolvedValue({ status: 'ok', matches, truncated: false }),
  }) as unknown as MarketMemoryService

describe('#4791.2 — DiscoverMarketMemoryService.namesFor', () => {
  it('rend le nom, le libellé de la compétence cherchée et le mois partagé', async () => {
    const service = new DiscoverMarketMemoryService(
      memory([
        { companyName: 'Acme Conseil', currentSignal: { nature: 'shared', observedMonth: '2026-08' } },
        { companyName: 'Sans Date' },
        { companyName: 'Date Propre', currentSignal: { nature: 'own', observedOn: '2026-09-02T10:00:00.000Z' } },
      ]),
    )
    await expect(service.namesFor({ technologiesObserved: ['Java'] }, 10)).resolves.toEqual([
      { name: 'Acme Conseil', label: 'Java', date: '2026-08', nature: 'mission' },
      { name: 'Sans Date', label: 'Java' },
      { name: 'Date Propre', label: 'Java' },
    ])
  })

  it('#5203 — le filtre de période RETIRE : sans date, un nom ne passe ni « récents » ni « anciens »', async () => {
    const rows = [
      { companyName: 'Récent', currentSignal: { nature: 'shared', observedMonth: '2026-10' } },
      { companyName: 'Ancien', currentSignal: { nature: 'shared', observedMonth: '2022-03' } },
      { companyName: 'Sans Date' },
    ]
    const now = new Date('2026-11-03T00:00:00Z')
    const names = async (needsPeriod: 'all' | 'recent' | 'old') =>
      (await new DiscoverMarketMemoryService(memory(rows)).namesFor({ keywords: ['Java'], needsPeriod }, 10, now)).map(
        n => n.name,
      )
    expect(await names('all')).toEqual(['Récent', 'Ancien', 'Sans Date'])
    expect(await names('recent')).toEqual(['Récent'])
    expect(await names('old')).toEqual(['Ancien'])
  })

  it('#5203 — un filtre de nature sans « mission » ne laisse aucun parcours observé', async () => {
    const service = new DiscoverMarketMemoryService(
      memory([{ companyName: 'Acme', currentSignal: { nature: 'shared', observedMonth: '2026-08' } }]),
    )
    await expect(service.namesFor({ keywords: ['Java'], needsNature: ['recrutement'] }, 10)).resolves.toEqual([])
  })

  it('sans compétence, ne lit rien (jamais « tout le corpus »)', async () => {
    const mm = memory([])
    const service = new DiscoverMarketMemoryService(mm)
    await expect(service.namesFor({}, 10)).resolves.toEqual([])
    expect((mm as unknown as { searchByFilters: jest.Mock }).searchByFilters).not.toHaveBeenCalled()
  })

  it('une lecture indisponible ou en échec rend [] (best-effort)', async () => {
    const down = { searchByFilters: jest.fn().mockResolvedValue({ status: 'unavailable', reason: 'x' }) }
    await expect(
      new DiscoverMarketMemoryService(down as unknown as MarketMemoryService).namesFor({ keywords: ['Java'] }, 5),
    ).resolves.toEqual([])
    const boom = { searchByFilters: jest.fn().mockRejectedValue(new Error('x')) }
    await expect(
      new DiscoverMarketMemoryService(boom as unknown as MarketMemoryService).namesFor({ keywords: ['Java'] }, 5),
    ).resolves.toEqual([])
  })
})
