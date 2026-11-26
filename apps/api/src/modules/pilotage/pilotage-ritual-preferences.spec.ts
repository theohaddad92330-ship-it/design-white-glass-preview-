import { BadRequestException } from '@nestjs/common'
import { RITUAL_CATALOG } from '@bellum/contracts'
import { REQUIRE_PERMISSION_KEY } from '../workspace/require-permission.decorator'
import { PilotageController } from './pilotage.controller'

/**
 * BEL-SC-242 (#3271.10, .12) — `GET /pilotage/rituals` porte désormais les
 * préférences de masquage de l'espace ACTIF de l'appelant, et
 * `PUT /pilotage/rituals/:key/preference` les règle. Même patron que
 * `pilotage-kpi-focus.spec.ts` : le contrôleur est construit par NOM, avec
 * UNIQUEMENT les dépendances que ces deux routes touchent.
 *
 * #3298 — `rituals()` compose désormais AUSSI `ritualLastHeld` et
 * `stockSnapshots` (`effectiveness`/`lastHeld`, voir
 * `pilotage.controller.rituals.spec.ts` pour leur comportement PROPRE) :
 * deux doubles VIDES ici, ce test-ci ne regarde que `items`/`preferences`.
 */
function controllerUnderTest(preferences: Array<{ ritualKey: string; disabled: boolean }>) {
  const set = jest.fn(async (_ws: string, ritualKey: string, disabled: boolean) => ({ ritualKey, disabled }))
  const ritualPreferences = { forWorkspace: async () => preferences, set }
  const ritualLastHeld = { forWorkspace: async () => [], markHeld: jest.fn() }
  const ritualActions = { forWorkspace: async () => [] }
  const stockSnapshots = { seriesFor: async () => ({ series: [], monthsCovered: 0 }) }
  const workspaceContext = { resolveActiveWorkspace: async () => ({ workspaceId: 'ws-1' }) }
  const controller = Object.create(PilotageController.prototype) as PilotageController
  Object.assign(controller, { ritualPreferences, ritualLastHeld, ritualActions, stockSnapshots, workspaceContext })
  return { controller, set }
}

describe('GET /pilotage/rituals — porte les préférences de l’espace actif', () => {
  it('la garde LIT quelque chose — la méthode existe sur le contrôleur', () => {
    expect(typeof (PilotageController.prototype as unknown as Record<string, unknown>).rituals).toBe('function')
  })

  it('rend le catalogue COMPLET (les cinq rituels), et les préférences RÉGLÉES à côté', async () => {
    const { controller } = controllerUnderTest([{ ritualKey: 'weekly', disabled: true }])
    const response = await controller.rituals({ userId: 'user-1' } as never)
    expect(response.items).toHaveLength(RITUAL_CATALOG.length)
    expect(response.preferences).toEqual([{ ritualKey: 'weekly', disabled: true }])
  })

  it('sans aucun réglage, `preferences` est VIDE — aucun rituel désactivé par défaut', async () => {
    const { controller } = controllerUnderTest([])
    const response = await controller.rituals({ userId: 'user-1' } as never)
    expect(response.preferences).toEqual([])
  })
})

describe('PUT /pilotage/rituals/:key/preference — masquer, jamais supprimer', () => {
  it('la garde LIT quelque chose — la méthode existe sur le contrôleur', () => {
    expect(typeof (PilotageController.prototype as unknown as Record<string, unknown>).setRitualPreference).toBe(
      'function',
    )
  })

  it('exige `team:manage` — un réglage d’équipe, pas une préférence personnelle', () => {
    const handler = (PilotageController.prototype as unknown as Record<string, object>).setRitualPreference
    expect(Reflect.getMetadata(REQUIRE_PERMISSION_KEY, handler)).toEqual(['team:manage'])
  })

  it('règle la préférence sur l’espace ACTIF de l’appelant, jamais un identifiant reçu', async () => {
    const { controller, set } = controllerUnderTest([])
    await controller.setRitualPreference({ userId: 'user-1' } as never, 'weekly', { disabled: true } as never)
    expect(set).toHaveBeenCalledWith('ws-1', 'weekly', true, 'user-1')
  })

  it('refuse une clé de rituel qui n’existe pas — jamais une préférence orpheline', async () => {
    const { controller } = controllerUnderTest([])
    await expect(
      controller.setRitualPreference({ userId: 'user-1' } as never, 'yearly', { disabled: true } as never),
    ).rejects.toBeInstanceOf(BadRequestException)
  })
})
