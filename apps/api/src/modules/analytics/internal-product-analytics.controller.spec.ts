import { MIN_DISTINCT_SESSIONS_FOR_A_METRIC } from '@bellum/contracts'
import { InternalSecretGuard } from '../../common/internal-secret.guard'
import { createMockRepository } from '../../database/test-utils'
import { ProductEventEntity } from '../../database/entities/product-event.entity'
import { InternalProductAnalyticsController } from './internal-product-analytics.controller'
import { ProductAnalyticsReadService } from './product-analytics-read.service'

const BASE = Date.parse('2026-09-09T09:00:00.000Z')

type Seeded = { eventName: string; sessionId: string; occurredAt: Date; properties: Record<string, unknown> }

/** Cinq sessions distinctes sur un compte NOMMÉ : le pire cas de la règle 5. */
function seededRows(): Seeded[] {
  const rows: Seeded[] = []
  for (let index = 0; index < MIN_DISTINCT_SESSIONS_FOR_A_METRIC; index += 1) {
    const at = BASE + index * 60_000
    rows.push({
      eventName: 'screen_viewed',
      sessionId: `s${index}`,
      occurredAt: new Date(at),
      properties: { route: '/accounts/3f1c2a90-7b41-4d0e-9f22-6c8b5e4a1d33' },
    })
    rows.push({
      eventName: 'screen_left',
      sessionId: `s${index}`,
      occurredAt: new Date(at + 30_000),
      properties: { route: '/accounts/3f1c2a90-7b41-4d0e-9f22-6c8b5e4a1d33', durationMs: 30_000, leaveMode: 'nav' },
    })
  }
  return rows
}

function makeController() {
  const rows = seededRows()
  const repo = createMockRepository<ProductEventEntity>()
  repo.manager.query.mockImplementation((sql: string) => {
    if (sql.includes('q:families')) {
      return Promise.resolve([...new Set(rows.map(row => row.eventName))].map(eventName => ({ eventName })))
    }
    if (sql.includes('q:behavioral')) return Promise.resolve(rows)
    return Promise.resolve([])
  })
  const service = new ProductAnalyticsReadService(repo as never)
  return { controller: new InternalProductAnalyticsController(service), service, repo }
}

describe('InternalProductAnalyticsController (#1683/#1684/#1687/#1688)', () => {
  it('est gardé par InternalSecretGuard au niveau de la CLASSE', () => {
    // Surface cross-tenant : sans ce garde, l'usage produit de toute la base
    // serait lisible sans authentification.
    const guards = Reflect.getMetadata('__guards__', InternalProductAnalyticsController) as unknown[]
    expect(guards).toContain(InternalSecretGuard)
  })

  it('T2 — AUCUNE réponse ne porte un nom d’espace client (règle 5)', async () => {
    const { controller } = makeController()
    const responses = await Promise.all([
      controller.getScreens(),
      controller.getJourneys(),
      controller.getFriction(),
      controller.getDemand(),
      // #1946 — la cinquième lecture entre dans le MÊME balayage de la règle 5 :
      // une route neuve qui aurait oublié de l'être serait exactement la
      // manière dont « rien de comportemental par espace nommé » se perd.
      controller.getValue(),
      // #2130.71 — la sixième, même balayage, même règle.
      controller.getAccountSections(),
    ])

    for (const response of responses) {
      const serialized = JSON.stringify(response)
      // Ni la clé, ni un identifiant : le flux lu n'a structurellement pas de
      // colonne d'espace, et cette assertion est ce qui l'empêche de revenir
      // par une jointure ajoutée « juste pour le tableau ».
      expect(serialized).not.toContain('"workspaceId"')
      expect(serialized).not.toContain('"workspaceName"')
      expect(serialized).not.toContain('"workspace_id"')
      // …ni l'identifiant de compte qui voyageait dans le chemin.
      expect(serialized).not.toContain('3f1c2a90')
    }
  })

  it('sait dire NON — le témoin prouve que les réponses ne sont pas VIDES', async () => {
    // Sans cette ligne, le test ci-dessus serait vert sur quatre rapports
    // n'ayant rien lu du tout.
    const { controller } = makeController()
    const screens = await controller.getScreens()
    expect(screens.screens.map(screen => screen.route)).toEqual(['/accounts/$id'])
    expect(screens.screens[0]?.sessions).toBe(MIN_DISTINCT_SESSIONS_FOR_A_METRIC)
  })

  it('passe la fenêtre demandée au service, et retombe sur SON défaut si elle est illisible', async () => {
    const { controller, service } = makeController()
    const screens = jest.spyOn(service, 'screens')

    await controller.getScreens('30')
    expect(screens).toHaveBeenLastCalledWith(30)

    await controller.getScreens('trente')
    expect(screens).toHaveBeenLastCalledWith(undefined)

    await controller.getScreens()
    expect(screens).toHaveBeenLastCalledWith(undefined)
  })

  it('les six routes délèguent chacune à SA lecture', async () => {
    const { controller, service } = makeController()
    const journeys = jest.spyOn(service, 'journeys')
    const friction = jest.spyOn(service, 'friction')
    const demand = jest.spyOn(service, 'demand')
    const valeur = jest.spyOn(service, 'valeur')
    const accountSections = jest.spyOn(service, 'accountSections')

    await controller.getJourneys('14')
    await controller.getFriction('14')
    await controller.getDemand('14')
    await controller.getValue('14')
    await controller.getAccountSections('14')

    expect(journeys).toHaveBeenCalledWith(14)
    expect(friction).toHaveBeenCalledWith(14)
    expect(demand).toHaveBeenCalledWith(14)
    expect(valeur).toHaveBeenCalledWith(14)
    expect(accountSections).toHaveBeenCalledWith(14)
  })

  it('#2130.71 — la route des sections agrège `tab_opened` sur le dossier compte, jamais une autre fiche', async () => {
    const { controller, repo } = makeController()
    const rows = [
      {
        eventName: 'tab_opened',
        sessionId: 's-extra',
        occurredAt: new Date(BASE + 500),
        properties: { screen: '/accounts/$id', tab: 'contacts' },
      },
    ]
    repo.manager.query.mockImplementation((sql: string) => {
      if (sql.includes('q:families')) return Promise.resolve([{ eventName: 'tab_opened' }])
      if (sql.includes('q:behavioral')) return Promise.resolve(rows)
      return Promise.resolve([])
    })
    const report = await controller.getAccountSections()
    expect(report.sections).toEqual({
      kind: 'below_threshold',
      sessions: 1,
      minSessions: MIN_DISTINCT_SESSIONS_FOR_A_METRIC,
    })
  })

  it('#1946 — la route de valeur nomme le résultat métier ABSENT plutôt que d’écrire 0', async () => {
    // Le témoin qui prouve que la cinquième route LIT : elle rend la forme du
    // rapport, et l'absence non dérivable y est NOMMÉE.
    const { controller } = makeController()
    const report = await controller.getValue()
    expect(report.resultatMetier).toEqual({
      kind: 'not_derivable',
      reason: 'behavioral_flow_carries_no_workspace',
    })
    // Une famille par nature comportementale lue (BEHAVIORAL_EVENT_NAMES, 37 à ce jour).
    // 38 jusqu'au 25/10/2026 : #4513 a retiré la mesure « connecteur activé après
    // recommandation » (`connector_enabled_after_hint`) — « Par quoi commencer » est parti,
    // son émetteur n'a plus d'appelant. Le compte suit la liste, il ne la contredit pas.
    expect(report.families).toHaveLength(37)
  })
})
