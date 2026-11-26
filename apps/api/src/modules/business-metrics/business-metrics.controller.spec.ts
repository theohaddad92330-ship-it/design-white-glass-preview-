import { BadRequestException } from '@nestjs/common'
import { BusinessMetricsController } from './business-metrics.controller'
import type { BusinessMetricsService } from './business-metrics.service'
import { monthOf } from './mrr-movements'

/**
 * LA PORTE DU BOUTON « FIGER <MOIS> » (arbitrage de Louis du 07/09/2026).
 *
 * Ce qui est testé ici n'est PAS le calcul — il a sa propre suite — mais le
 * refus : un instantané range la position D'AUJOURD'HUI sous une étiquette de
 * mois, et il ne se recalcule jamais. Le seul mois pour lequel cette
 * approximation est honnête est celui qui vient de finir.
 *
 * ⚠️ `now` est fabriqué dans chaque test, jamais lu à l'horloge : un test qui
 * lit l'heure passe à Paris et échoue dans une CI en UTC — et celui-ci
 * changerait de verdict le 1er du mois.
 */
describe('BusinessMetricsController — quel mois se fige', () => {
  /** Le mois qui vient de finir, tel que le service le calcule. */
  function controleurAu(aujourdhui: string) {
    const gele = jest.fn(async (month: string) => ({ frozen: true, month, snapshot: { month } }))
    const service = {
      monthToFreeze: (now: Date) => {
        const [annee = 0, mois = 0] = monthOf(now).split('-').map(Number)
        return mois === 1 ? `${annee - 1}-12` : `${annee}-${String(mois - 1).padStart(2, '0')}`
      },
      takeSnapshot: gele,
    } as unknown as BusinessMetricsService

    jest.useFakeTimers().setSystemTime(new Date(aujourdhui))
    return { controleur: new BusinessMetricsController(service), gele }
  }

  afterEach(() => {
    jest.useRealTimers()
  })

  it('fige le mois qui vient de finir quand aucun mois n’est demandé', async () => {
    const { controleur, gele } = controleurAu('2026-09-08T10:00:00Z')

    await controleur.takeSnapshot({ month: undefined })

    expect(gele).toHaveBeenCalledWith('2026-08')
  })

  it('fige le mois qui vient de finir quand il est demandé explicitement', async () => {
    const { controleur, gele } = controleurAu('2026-09-08T10:00:00Z')

    await controleur.takeSnapshot({ month: '2026-08' })

    expect(gele).toHaveBeenCalledWith('2026-08')
  })

  it('refuse de RATTRAPER un mois manqué — ce serait une position fausse, pour toujours', () => {
    const { controleur, gele } = controleurAu('2026-09-08T10:00:00Z')

    // ⚠️ Le refus est SYNCHRONE : `takeSnapshot` n'est pas `async`, il rend une
    // promesse ou il jette. `rejects` passerait à côté et le test serait vert.
    expect(() => controleur.takeSnapshot({ month: '2026-03' })).toThrow(BadRequestException)
    expect(gele).not.toHaveBeenCalled()
  })

  it('refuse le mois EN COURS — sa position est incomplète par construction', () => {
    const { controleur, gele } = controleurAu('2026-09-08T10:00:00Z')

    expect(() => controleur.takeSnapshot({ month: '2026-09' })).toThrow(BadRequestException)
    expect(gele).not.toHaveBeenCalled()
  })

  it('garde une phrase DISTINCTE pour le mois à venir — « pas encore » n’est pas « plus jamais »', () => {
    const { controleur } = controleurAu('2026-09-08T10:00:00Z')

    expect(() => controleur.takeSnapshot({ month: '2026-11' })).toThrow(/n’existe pas encore/)
    expect(() => controleur.takeSnapshot({ month: '2026-03' })).toThrow(/trou nommé/)
  })

  it('traverse le passage d’année : en janvier, le mois figeable est décembre', async () => {
    const { controleur, gele } = controleurAu('2027-01-03T10:00:00Z')

    await controleur.takeSnapshot({ month: '2026-12' })

    expect(gele).toHaveBeenCalledWith('2026-12')
  })
})

describe('BusinessMetricsController — les mouvements du mois (#1646.6)', () => {
  it('délègue tel quel au service, sans reformater la ligne', async () => {
    const monthlyClientMovements = jest.fn(async (month: string) => [
      { client: 'Acme ESN', nature: 'expansion' as const, montantCents: 5000, month },
    ])
    const service = { monthlyClientMovements } as unknown as BusinessMetricsService
    const controleur = new BusinessMetricsController(service)

    const rows = await controleur.movements('2026-09')

    expect(monthlyClientMovements).toHaveBeenCalledWith('2026-09')
    expect(rows).toEqual([{ client: 'Acme ESN', nature: 'expansion', montantCents: 5000, month: '2026-09' }])
  })

  it('refuse un mois qui ne s’écrit pas AAAA-MM — refus SYNCHRONE, comme `saveTreasury`', () => {
    const service = { monthlyClientMovements: jest.fn() } as unknown as BusinessMetricsService
    const controleur = new BusinessMetricsController(service)

    expect(() => controleur.movements('2026-9')).toThrow(BadRequestException)
    expect(service.monthlyClientMovements).not.toHaveBeenCalled()
  })
})
