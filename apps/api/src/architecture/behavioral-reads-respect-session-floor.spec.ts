import { MIN_DISTINCT_SESSIONS_FOR_A_METRIC } from '@bellum/contracts'
import { createMockRepository } from '../database/test-utils'
import { ProductEventEntity } from '../database/entities/product-event.entity'
import { ProductAnalyticsReadService } from '../modules/analytics/product-analytics-read.service'
import { LauraUnroutedIntentsService } from '../modules/laura-unrouted-intents/laura-unrouted-intents.service'

/**
 * GA-267 (suite) — #1949.23 : la trace anonyme des demandes que Laura n'a pas
 * su router (décision Louis 13/09 batch 12) porte un TEXTE. Le plancher des
 * occurrences DISTINCTES s'y applique à la LECTURE, exactement comme aux
 * agrégats comportementaux : on EXÉCUTE le vrai service, on regarde ce qui SORT.
 */
describe('GA-267 (suite) — #1949.23 : aucun texte de demande sous le plancher', () => {
  const NOW = new Date('2026-09-13T08:00:00.000Z')

  function serviceWith(distinct: number) {
    const query = jest.fn(async (sql: string) =>
      sql.includes('GROUP BY')
        ? [
            {
              textNormalized: 'reserve un train pour lyon',
              sample: 'Réserve un train pour Lyon',
              occurrences: distinct + 2,
              distinctOccurrences: distinct,
              surfaces: ['chat'],
              categories: ['hors_perimetre'],
              languages: ['fr'],
            },
          ]
        : [{ recorded: distinct + 2 }],
    )
    return new LauraUnroutedIntentsService({ insert: jest.fn(), manager: { query } } as never)
  }

  it('LIT quelque chose — au plancher, le texte est publié', async () => {
    const report = await serviceWith(MIN_DISTINCT_SESSIONS_FOR_A_METRIC).report(30, NOW)
    expect(report.groups.map(group => group.text)).toEqual(['Réserve un train pour Lyon'])
  })

  it('sait dire NON — une occurrence distincte de moins, le texte ne sort de NULLE PART dans la réponse', async () => {
    const report = await serviceWith(MIN_DISTINCT_SESSIONS_FOR_A_METRIC - 1).report(30, NOW)
    expect(report.groups).toEqual([])
    expect(JSON.stringify(report)).not.toContain('train')
    expect(report.withheldGroups).toBe(1)
  })

  it('n’attrape pas ce qu’elle ne vise pas — le COMPTE brut sort sous le plancher, jamais « 0 »', async () => {
    const report = await serviceWith(MIN_DISTINCT_SESSIONS_FOR_A_METRIC - 1).report(30, NOW)
    expect(report.recorded).toBe(MIN_DISTINCT_SESSIONS_FOR_A_METRIC + 1)
    expect(report.minDistinctOccurrences).toBe(MIN_DISTINCT_SESSIONS_FOR_A_METRIC)
  })
})

/**
 * GA-267 — la lecture comportementale n'expose AUCUN agrégat sous le seuil de
 * sessions.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE PROTÈGE
 * ─────────────────────────────────────────────────────────────────────────────
 * Règle 1 de `c64_analytique_produit` : aucune métrique comportementale n'est
 * publiée sous {@link MIN_DISTINCT_SESSIONS_FOR_A_METRIC} sessions DISTINCTES —
 * « sous ce seuil, une moyenne désigne quelqu'un ».
 *
 * Le service de lecture (#1683/#1684/#1687/#1688) applique le seuil à SEPT
 * endroits : l'usage par écran, le détail d'une sortie, la liste des sorties,
 * les parcours, les parcours interrompus, les trois blocs de friction, les
 * recherches vides. Sept portes, c'est six portes le jour où quelqu'un en
 * déplace une.
 *
 * #1946 (14/09/2026) en ajoute CINQ : l'amorce, les réponses, les brouillons,
 * la chaîne d'action préparée, les suites d'une proposition. La décision de
 * Louis élargit l'union d'écriture ; elle ne lève PAS la règle 1, et c'est ici
 * que ça se prouve — un cinquième rapport publiant un taux sur trois sessions
 * dirait « chez ces gens-là, Laura est générique » à propos de trois personnes.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ELLE EXÉCUTE LE VRAI SERVICE, ELLE NE LIT PAS SON TEXTE
 * ─────────────────────────────────────────────────────────────────────────────
 * Une garde qui chercherait `hasEnoughSessionsToPublish` dans la source serait
 * verte tant que l'appel EXISTE quelque part — y compris s'il ne commandait plus
 * rien. Celle-ci alimente le service avec des données SOUS le seuil et regarde
 * ce qui SORT : aucune clé de mesure DÉRIVÉE ne doit apparaître dans les quatre
 * rapports.
 *
 * ⚠️ « Sous le seuil » ne veut pas dire « rapport vide ». Les COMPTES BRUTS
 * (vues, sessions, occurrences) sortent : ce sont eux qui permettent de dire
 * « 3 sessions — pas encore de quoi en tirer une mesure » au lieu de « 0 % ».
 * Ce que la garde interdit, ce sont les valeurs CALCULÉES SUR un effectif : un
 * taux, une moyenne, une médiane, un rythme.
 */

/** Les clés que seule une mesure DÉRIVÉE porte. Recopiées depuis le contrat de
 *  l'issue, jamais importées du service gardé. */
const DERIVED_MEASURE_KEYS = [
  'ratio',
  'viewsPerWeek',
  'medianDuration',
  'bounceRate',
  'actionRate',
  'closeRate',
  'idleRate',
  'interruptionRate',
  'emptyRate',
  // #1946 — les clés dérivées du rapport de VALEUR. Sans elles, la garde serait
  // restée verte sur un cinquième rapport publiant des taux sous le seuil :
  // exactement la garde borgne que le dépôt a payée six fois en deux jours.
  'usefulRate',
  'medianTimeToUseful',
  'utileRate',
  'generiqueRate',
  'inexacteRate',
  'telQuelRate',
  'retoucheRate',
  'reecritRate',
  'executionRate',
  'correctionRate',
  'interventionIgnoredRate',
  // #2108.63/#2208.85 — le délai médian ouverture → première action, dérivé de
  // deux instants déjà journalisés (aucun nouvel événement émis).
  'medianTimeToFirstAction',
]

/** Toutes les clés présentes dans un objet, en profondeur. */
function allKeys(value: unknown, into = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) allKeys(item, into)
    return into
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      into.add(key)
      allKeys(child, into)
    }
  }
  return into
}

function derivedKeysIn(report: unknown): string[] {
  const keys = allKeys(report)
  return DERIVED_MEASURE_KEYS.filter(key => keys.has(key))
}

/** Toutes les valeurs d'un champ `kind`, en profondeur — c'est l'étiquette que
 *  chaque enveloppe de mesure porte (`measured` / `below_threshold` /
 *  `not_instrumented` / `unmeasured`). */
function kindsIn(value: unknown, into = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) kindsIn(item, into)
    return into
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      if (key === 'kind' && typeof child === 'string') into.add(child)
      kindsIn(child, into)
    }
  }
  return into
}

const BASE = Date.parse('2026-09-09T09:00:00.000Z')

type Seeded = { eventName: string; sessionId: string; occurredAt: Date; properties: Record<string, unknown> }

/**
 * `sessions` sessions distinctes, chacune produisant de quoi alimenter LES SIX
 * agrégats : deux vues (donc un parcours et une sortie), une action jamais
 * terminée et répétée trois fois en moins de 30 s, une erreur, une recherche
 * vide, et un aller-retour A → B → A.
 */
function seed(sessions: number): Seeded[] {
  const rows: Seeded[] = []
  for (let index = 0; index < sessions; index += 1) {
    const id = `s${index}`
    const at = BASE + index * 600_000
    const view = (route: string, offset: number): void => {
      rows.push({ eventName: 'screen_viewed', sessionId: id, occurredAt: new Date(at + offset), properties: { route } })
    }
    const leave = (route: string, offset: number, leaveMode: string): void => {
      rows.push({
        eventName: 'screen_left',
        sessionId: id,
        occurredAt: new Date(at + offset),
        properties: { route, durationMs: 3_000, leaveMode },
      })
    }
    view('/accounts', 0)
    rows.push({
      eventName: 'action_started',
      sessionId: id,
      occurredAt: new Date(at + 500),
      properties: { action: 'enrichir', screen: '/accounts' },
    })
    rows.push({
      eventName: 'action_started',
      sessionId: id,
      occurredAt: new Date(at + 900),
      properties: { action: 'enrichir', screen: '/accounts' },
    })
    rows.push({
      eventName: 'action_started',
      sessionId: id,
      occurredAt: new Date(at + 1_200),
      properties: { action: 'enrichir', screen: '/accounts' },
    })
    rows.push({
      eventName: 'error_shown',
      sessionId: id,
      occurredAt: new Date(at + 1_400),
      properties: { screen: '/accounts', errorCode: 'E_TIMEOUT' },
    })
    rows.push({
      eventName: 'search_performed',
      sessionId: id,
      occurredAt: new Date(at + 1_600),
      properties: { screen: '/accounts', resultCount: 0 },
    })
    leave('/accounts', 3_000, 'nav')
    view('/contacts', 3_500)
    leave('/contacts', 6_000, 'nav')
    view('/accounts', 6_500)
    leave('/accounts', 9_000, 'fermeture')
    view('/chat', 9_500)
    // #1946 — de quoi alimenter les CINQ blocs du rapport de valeur, dans la
    // même session : une question, deux jugements, un premier résultat utile,
    // un brouillon repris, une action préparée puis exécutée, et trois suites.
    rows.push({
      eventName: 'assistant_first_question_sent',
      sessionId: id,
      occurredAt: new Date(at + 9_600),
      properties: { screen: '/chat' },
    })
    rows.push({
      eventName: 'assistant_answer_judged',
      sessionId: id,
      occurredAt: new Date(at + 9_700),
      properties: { screen: '/chat', verdict: 'utile' },
    })
    rows.push({
      eventName: 'assistant_first_useful_result',
      sessionId: id,
      occurredAt: new Date(at + 9_700),
      properties: { screen: '/chat', durationMs: 5_000 },
    })
    rows.push({
      eventName: 'assistant_answer_judged',
      sessionId: id,
      occurredAt: new Date(at + 9_800),
      properties: { screen: '/chat', verdict: 'generique' },
    })
    rows.push({
      eventName: 'draft_reused',
      sessionId: id,
      occurredAt: new Date(at + 9_900),
      properties: { screen: '/chat', extent: 'retouche' },
    })
    rows.push({
      eventName: 'prepared_action_stage',
      sessionId: id,
      occurredAt: new Date(at + 10_000),
      properties: { action: 'relance_compte', stage: 'preparee' },
    })
    rows.push({
      eventName: 'prepared_action_stage',
      sessionId: id,
      occurredAt: new Date(at + 10_100),
      properties: { action: 'relance_compte', stage: 'executee' },
    })
    rows.push({
      eventName: 'suggestion_clicked',
      sessionId: id,
      occurredAt: new Date(at + 10_200),
      properties: { screen: '/chat', rank: 1 },
    })
    rows.push({
      eventName: 'intervention_outcome',
      sessionId: id,
      occurredAt: new Date(at + 10_300),
      properties: { intervention: 'compte_sans_prochaine_action', outcome: 'ignoree' },
    })
    rows.push({
      eventName: 'memory_added',
      sessionId: id,
      occurredAt: new Date(at + 10_400),
      properties: { screen: '/chat' },
    })
    leave('/chat', 12_000, 'fermeture')
  }
  return rows
}

function makeService(rows: Seeded[]) {
  const repo = createMockRepository<ProductEventEntity>()
  repo.manager.query.mockImplementation((sql: string) => {
    if (sql.includes('q:families')) {
      return Promise.resolve([...new Set(rows.map(row => row.eventName))].map(eventName => ({ eventName })))
    }
    if (sql.includes('q:behavioral')) return Promise.resolve(rows)
    return Promise.resolve([])
  })
  return new ProductAnalyticsReadService(repo as never)
}

function readAll(service: ProductAnalyticsReadService): Promise<unknown[]> {
  return Promise.all([
    service.screens(30),
    service.journeys(30),
    service.friction(30),
    service.demand(30),
    // #1946 — la cinquième lecture entre dans le MÊME balayage. Une route neuve
    // qui n'y entrerait pas serait exactement la manière dont un plancher se
    // perd : la garde resterait verte sur quatre rapports irréprochables.
    service.valeur(30),
  ])
}

describe('GA-267 — aucun agrégat comportemental sous le seuil de sessions', () => {
  it('LIT quelque chose — au seuil, les cinq rapports PUBLIENT', async () => {
    // Sans ce contrôle, les assertions « rien ne sort » ci-dessous seraient
    // vertes sur un service qui ne lit rien du tout, ou sur un semis vide.
    //
    // ⚠️ On vérifie l'étiquette `measured` et pas une clé de taux : les trois
    // blocs de FRICTION ne portent que des COMPTES (répétitions, allers-retours,
    // erreurs vues) — aucun ratio, par construction. Exiger un ratio partout
    // aurait fait rougir la garde sur un rapport parfaitement correct.
    const reports = await readAll(makeService(seed(MIN_DISTINCT_SESSIONS_FOR_A_METRIC)))
    for (const report of reports) {
      expect(kindsIn(report).has('measured')).toBe(true)
    }
  })

  it('sous le seuil, AUCUNE mesure dérivée ne sort des cinq rapports', async () => {
    const reports = await readAll(makeService(seed(MIN_DISTINCT_SESSIONS_FOR_A_METRIC - 1)))
    for (const report of reports) {
      expect(`clés dérivées → ${derivedKeysIn(report).join(', ')}`).toBe('clés dérivées → ')
      // …et aucune enveloppe ne se dit « mesurée ».
      expect(`étiquettes → ${[...kindsIn(report)].sort().join(', ')}`).not.toContain('measured,')
      expect(kindsIn(report).has('measured')).toBe(false)
    }
  })

  it('sous le seuil, ce qui sort DIT le seuil et le compte observé — jamais un zéro', async () => {
    const service = makeService(seed(MIN_DISTINCT_SESSIONS_FOR_A_METRIC - 1))
    const screens = await service.screens(30)
    const accounts = screens.screens.find(screen => screen.route === '/accounts')
    // L'écran EXISTE — « trop récent » doit se distinguer de « jamais ouvert ».
    expect(accounts?.sessions).toBe(MIN_DISTINCT_SESSIONS_FOR_A_METRIC - 1)
    expect(accounts?.measures).toEqual({ kind: 'below_threshold', minSessions: MIN_DISTINCT_SESSIONS_FOR_A_METRIC })

    const demand = await service.demand(30)
    expect(demand.emptySearches).toEqual({
      kind: 'below_threshold',
      sessions: MIN_DISTINCT_SESSIONS_FOR_A_METRIC - 1,
      minSessions: MIN_DISTINCT_SESSIONS_FOR_A_METRIC,
    })
  })

  it('sait dire NON — le même jeu, une session de plus, publie ses mesures', async () => {
    // Le témoin qui prouve que le contrôle ci-dessus est SENSIBLE au seuil et
    // pas à autre chose : la seule différence entre les deux est le nombre de
    // sessions.
    const reports = await readAll(makeService(seed(MIN_DISTINCT_SESSIONS_FOR_A_METRIC)))
    const [screens] = reports
    expect(derivedKeysIn(screens)).toContain('ratio')
    expect(derivedKeysIn(screens)).toContain('viewsPerWeek')
  })

  it('n’attrape pas ce qu’elle ne vise pas — les COMPTES bruts sortent sous le seuil', async () => {
    // Le témoin du cas légitime voisin : une garde qui exigerait un rapport vide
    // rendrait impossible la phrase « 4 sessions, pas encore de quoi en tirer
    // une mesure », donc pousserait l'écran à écrire « 0 % ».
    const service = makeService(seed(MIN_DISTINCT_SESSIONS_FOR_A_METRIC - 1))
    const screens = await service.screens(30)
    expect(screens.screens.length).toBeGreaterThan(0)
    expect(screens.coverage.eventsScanned).toBeGreaterThan(0)
    for (const screen of screens.screens) expect(screen.views).toBeGreaterThan(0)
  })
})
