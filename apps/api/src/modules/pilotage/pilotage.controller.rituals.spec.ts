import { BadRequestException } from '@nestjs/common'
import { RITUAL_CATALOG } from '@bellum/contracts'
import { PilotageController } from './pilotage.controller'

/**
 * #3298 (suite #3271.11, .12, .8) — CE QUE `rituals()` AJOUTE À LA
 * COMPOSITION EXISTANTE : `effectiveness` (détection sans second calcul,
 * `detectRitualEffectiveness` déjà testé sur `ritual.test.ts`) et `lastHeld`
 * à côté des rituels et préférences déjà servis. Les pièces individuelles
 * (`RitualPreferencesService`, `RitualLastHeldService`, `StockSnapshotService`)
 * ont chacune leur propre suite ; ici on vérifie seulement le CÂBLAGE neuf.
 */
function controller(overrides: { series?: unknown; lastHeld?: unknown[]; actions?: unknown[] } = {}) {
  const stockSnapshots = {
    seriesFor: jest.fn().mockResolvedValue(overrides.series ?? { series: [], monthsCovered: 0 }),
  }
  const ritualPreferences = { forWorkspace: jest.fn().mockResolvedValue([]) }
  const ritualLastHeld = {
    forWorkspace: jest.fn().mockResolvedValue(overrides.lastHeld ?? []),
    markHeld: jest.fn().mockResolvedValue({ ritualKey: 'monthly', heldAt: '2026-09-29T10:00:00.000Z', heldBy: 'u1' }),
  }
  const ritualActions = { forWorkspace: jest.fn().mockResolvedValue(overrides.actions ?? []) }
  const workspaceContext = { resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1' }) }

  const instance = new PilotageController(
    {} as never,
    {} as never,
    {} as never,
    stockSnapshots as never,
    {} as never,
    workspaceContext as never,
    ritualPreferences as never,
    ritualLastHeld as never,
    ritualActions as never,
    {} as never,
  )
  return { instance, stockSnapshots, ritualPreferences, ritualLastHeld, ritualActions, workspaceContext }
}

describe('PilotageController — rituals() sert actionsCreated (#3298 / #3271.8)', () => {
  it("sert le compte des actions taguées, lu pour l'espace actif", async () => {
    const { instance, ritualActions } = controller({ actions: [{ ritualKey: 'monthly', count: 2 }] })
    const result = await instance.rituals({ userId: 'u1' } as never)
    expect(result.actionsCreated).toEqual([{ ritualKey: 'monthly', count: 2 }])
    expect(ritualActions.forWorkspace).toHaveBeenCalledWith('ws-1')
  })

  it('aucune action taguée → liste vide, jamais un « 0 » par rituel', async () => {
    const { instance } = controller()
    expect((await instance.rituals({ userId: 'u1' } as never)).actionsCreated).toEqual([])
  })
})

describe('PilotageController — rituals() sert effectiveness et lastHeld (#3298)', () => {
  it('rend les cinq rituels, jamais filtrés — sans photo, les rituels monthly/quarterly restent not_evaluable', async () => {
    const { instance } = controller()
    const result = await instance.rituals({ userId: 'u1' } as never)
    expect(result.items).toHaveLength(5)
    expect(result.effectiveness.every(report => report.verdict === 'not_evaluable')).toBe(true)
    expect(result.lastHeld).toEqual([])
  })

  it('un rituel monthly avec un indicateur qu’il observe réellement, figé sur trois photos → no_measurable_effect', async () => {
    const monthly = RITUAL_CATALOG.find(r => r.key === 'monthly')
    const watchedKey = monthly?.agenda.flatMap(item => item.watch)[0]
    const { instance } = controller({
      series: {
        series: [
          {
            metricKey: watchedKey,
            unit: 'count',
            points: [
              { month: '2026-06', value: 7 },
              { month: '2026-07', value: 7 },
              { month: '2026-08', value: 7 },
            ],
          },
        ],
        monthsCovered: 3,
      },
    })
    const result = await instance.rituals({ userId: 'u1' } as never)
    const report = result.effectiveness.find(r => r.ritualKey === 'monthly')
    expect(report?.verdict).toBe('no_measurable_effect')
  })

  it('un rituel daily/weekly/rank1 n’apparaît JAMAIS dans effectiveness — hors périmètre, pas un verdict', async () => {
    const { instance } = controller()
    const result = await instance.rituals({ userId: 'u1' } as never)
    const keys = result.effectiveness.map(report => report.ritualKey)
    expect(keys).not.toContain('daily')
    expect(keys).not.toContain('weekly')
    expect(keys).not.toContain('rank1')
  })

  it('markRitualHeld rejette une clé inconnue, jamais un marquage silencieux', async () => {
    const { instance } = controller()
    await expect(instance.markRitualHeld({ userId: 'u1' } as never, 'inconnu')).rejects.toBeInstanceOf(
      BadRequestException,
    )
  })

  it('markRitualHeld délègue au service avec l’espace actif et l’auteur', async () => {
    const { instance, ritualLastHeld } = controller()
    const result = await instance.markRitualHeld({ userId: 'u1' } as never, 'monthly')
    expect(ritualLastHeld.markHeld).toHaveBeenCalledWith('ws-1', 'monthly', 'u1')
    expect(result).toEqual({ ritualKey: 'monthly', heldAt: '2026-09-29T10:00:00.000Z', heldBy: 'u1' })
  })
})
