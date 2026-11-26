import {
  CLOSED_STAGES,
  DECIDED_STAGES,
  INTAKE_STAGES,
  PROJECT_STAGES,
  projectStageInSql,
  TRIAGED_STAGES,
} from '@bellum/contracts'
import { createMockRepository } from '../../database/test-utils'
import { PilotageService } from './pilotage.service'

/**
 * Ce que le service a le droit d'affirmer.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT DU 27/08, TROUVÉ EN RECETTE LIVE SUR LA PRODUCTION
 * ─────────────────────────────────────────────────────────────────────────────
 * `GET /pilotage/chain` rendait `meetings`, `benchAvailable` et `activeClients`
 * en `value: 0` avec `status: 'non_mesure'` — un chiffre et un aveu d'ignorance
 * dans le même objet. La cause était ici : chaque lecture finissait par `?? 0`,
 * si bien qu'une requête en échec affirmait « aucun client actif ».
 *
 * Les deux sens sont vérifiés, parce que le défaut symétrique existe aussi :
 * tout rendre `null` « par prudence » effacerait un zéro que l'espace connaît
 * parfaitement.
 */

type Row = Record<string, unknown>
type Source = Row[] | Error

const CONTACTS: Row = { total: 40, contacted: 12, replied: 0, meeting: 0, emailsSent: 0 }
const NEEDS: Row = { triaged: 0, qualified: 0, decided: 0, converted: 0 }
const ACCOUNTS: Row = { activeClients: 0, rejected: 0, signals: 5 }
const CONSULTANTS: Row = { total: 0, known: 0, bench: 0 }

/** Rend les lignes d'une source, ou lève quand le scénario la déclare en panne. */
function answer(source: Source, fallback: Row): Row[] {
  if (source instanceof Error) throw source
  return source.length > 0 ? source : [fallback]
}

function buildService(
  overrides: { contacts?: Source; accounts?: Source; consultants?: Source; needs?: Source } = {},
): PilotageService {
  const contacts = createMockRepository()
  const opportunities = createMockRepository()
  // Les trois requêtes brutes passent par le même repository — c'est le SQL qui
  // dit laquelle des trois tables on lit.
  contacts.query.mockImplementation(async (sql: string) => {
    if (sql.includes('FROM contacts')) return answer(overrides.contacts ?? [], CONTACTS)
    if (sql.includes('FROM accounts')) return answer(overrides.accounts ?? [], ACCOUNTS)
    if (sql.includes('FROM consultants')) return answer(overrides.consultants ?? [], CONSULTANTS)
    throw new Error(`requête non routée : ${sql}`)
  })
  opportunities.query.mockImplementation(async () => answer(overrides.needs ?? [], NEEDS))
  const workspaceContext = { resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1' }) }
  return new PilotageService(contacts as never, opportunities as never, workspaceContext as never)
}

async function metric(service: PilotageService, key: string) {
  const report = await service.getChain('u-1')
  return report.levels.flatMap(level => level.metrics).find(m => m.key === key)
}

describe('PilotageService.getChain', () => {
  it('un zéro LU reste un zéro : « aucun client actif » est un fait', async () => {
    // `commercial_status` porte toujours une valeur ; un compte non marqué
    // `customer` n'est pas un client. La requête est revenue, donc on sait.
    // Idem pour les rendez-vous : ils se comptent sur les fiches CONTACT, pas
    // sur un agenda — aucun connecteur ne s'interpose.
    const service = buildService()
    expect((await metric(service, 'activeClients'))?.value).toBe(0)
    expect((await metric(service, 'meetings'))?.value).toBe(0)
  })

  it('une source ILLISIBLE ne rend aucun chiffre — surtout pas zéro', async () => {
    const service = buildService({ accounts: new Error('relation accounts indisponible') })
    const activeClients = await metric(service, 'activeClients')
    expect(activeClients?.value).toBeNull()
    expect(activeClients?.status).toBe('non_mesure')
  })

  it('une source illisible n’efface pas les autres maillons', async () => {
    // Un `consultants` en panne ne doit pas vider la chaîne entière : c'est la
    // leçon de la vue Qualité, où une seule requête ratée faisait disparaître
    // les huit lignes.
    const service = buildService({ consultants: new Error('boom') })
    expect((await metric(service, 'benchAvailable'))?.value).toBeNull()
    expect((await metric(service, 'contactsTargeted'))?.value).toBe(40)
  })

  it('un vivier VIDE compte bien zéro poussable — c’est une mesure', async () => {
    const service = buildService({ consultants: [{ total: 0, known: 0, bench: 0 }] })
    expect((await metric(service, 'benchAvailable'))?.value).toBe(0)
  })

  it('un vivier dont PERSONNE n’a renseigné sa disponibilité ne compte pas zéro', async () => {
    // L'entité le dit : « `inconnu` n'est JAMAIS présenté comme disponible ».
    // Vingt consultants sans disponibilité saisie, ce n'est pas « je n'ai
    // personne à pousser », c'est « je ne sais pas ».
    const service = buildService({ consultants: [{ total: 20, known: 0, bench: 0 }] })
    expect((await metric(service, 'benchAvailable'))?.value).toBeNull()
  })

  it('un vivier partiellement renseigné compte ce qu’il sait', async () => {
    const service = buildService({ consultants: [{ total: 20, known: 6, bench: 2 }] })
    expect((await metric(service, 'benchAvailable'))?.value).toBe(2)
  })

  it('les taux sans dénominateur ne s’affichent pas « 0 % »', async () => {
    // Aucun besoin pris en charge, aucun besoin décidé : les deux taux n'ont
    // pas de dénominateur. Ils sortaient à 0, en couleur d'alerte.
    const service = buildService()
    expect((await metric(service, 'qualificationRate'))?.value).toBeNull()
    expect((await metric(service, 'conversionRate'))?.value).toBeNull()
  })

  it('mais un vrai décrochage sort bien 0 %', async () => {
    const service = buildService({ needs: [{ triaged: 12, qualified: 0, btmmp_known: 5, decided: 4, converted: 0 }] })
    const qualification = await metric(service, 'qualificationRate')
    expect(qualification?.value).toBe(0)
    expect(qualification?.status).toBe('alerte')
    expect((await metric(service, 'conversionRate'))?.value).toBe(0)
  })

  it('#4191 R22 — aucun BTMMP saisi sur les besoins pris en charge : « non mesuré », jamais « 0 % » (21 besoins)', async () => {
    const service = buildService({ needs: [{ triaged: 21, qualified: 0, btmmp_known: 0, decided: 4, converted: 0 }] })
    const rate = await metric(service, 'qualificationRate')
    expect(rate?.value).toBeNull()
    expect((await metric(service, 'needsQualified'))?.value).toBeNull()
  })

  it('le taux de conversion se mesure sur les besoins DÉCIDÉS', async () => {
    // Le dénominateur historique (« besoins ouverts ») excluait le numérateur :
    // le taux ne pouvait mathématiquement jamais atteindre 100 %.
    const service = buildService({ needs: [{ triaged: 5, qualified: 3, decided: 4, converted: 3 }] })
    expect((await metric(service, 'conversionRate'))?.value).toBe(0.75)
  })

  /**
   * D37 (28/08/2026) — le Pilotage DEMANDE la définition, il ne la refait pas.
   *
   * Il calculait « pris en charge » par le complément : `NOT IN (intake ∪
   * clos)`. Le résultat est le même qu'aujourd'hui — c'est vérifié ci-dessous,
   * et c'est pour ça qu'AUCUN chiffre de cette page ne bouge. Ce qui change,
   * c'est qu'un dixième stade ajouté demain n'entrerait plus ici en silence :
   * il faudrait le ranger dans « en jeu » ou dans « clos », et la garde du
   * contrat le réclame.
   */
  describe('D37 — la population « prise en charge » vient du contrat', () => {
    async function needsSql(): Promise<string> {
      const contacts = createMockRepository()
      const opportunities = createMockRepository()
      contacts.query.mockResolvedValue([])
      opportunities.query.mockResolvedValue([])
      const workspaceContext = { resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1' }) }
      await new PilotageService(contacts as never, opportunities as never, workspaceContext as never).getChain('u-1')
      const [sql] = opportunities.query.mock.calls[0] as [string]
      return sql.replace(/\s+/g, ' ')
    }

    it('le dénominateur du taux de qualification EST `TRIAGED_STAGES`', async () => {
      expect(await needsSql()).toContain(projectStageInSql('stage', TRIAGED_STAGES))
    })

    it('les besoins DÉCIDÉS viennent du contrat, la veille n’en est pas', async () => {
      const sql = await needsSql()
      expect(sql).toContain(projectStageInSql('stage', DECIDED_STAGES))
      expect(projectStageInSql('stage', DECIDED_STAGES)).not.toContain("'dormant'")
    })

    it('rend EXACTEMENT la même population que le complément d’avant — rien ne bouge à l’écran', () => {
      const before = PROJECT_STAGES.filter(
        stage =>
          !(INTAKE_STAGES as readonly string[]).includes(stage) &&
          !(CLOSED_STAGES as readonly string[]).includes(stage),
      )
      expect([...TRIAGED_STAGES]).toEqual(before)
    })
  })

  // Recette 14/10 : la chaîne codait « non mesuré » en dur pour la marge et le DSO que Finance mesure.
  // La LECTURE de Finance vit dans le contrôleur (cliquet GA-07) ; ici : la chaîne applique ce qu'on lui donne.
  describe('marge et DSO — branchés sur les mesures de Finance', () => {
    function build() {
      const contacts = createMockRepository()
      const opportunities = createMockRepository()
      contacts.query.mockImplementation(async (sql: string) => {
        if (sql.includes('FROM contacts')) return [CONTACTS]
        if (sql.includes('FROM accounts')) return [ACCOUNTS]
        if (sql.includes('FROM consultants')) return [CONSULTANTS]
        throw new Error(`requête non routée : ${sql}`)
      })
      opportunities.query.mockImplementation(async () => [NEEDS])
      const workspaceContext = { resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1' }) }
      return new PilotageService(contacts as never, opportunities as never, workspaceContext as never)
    }
    const metricOf = (report: Awaited<ReturnType<PilotageService['getChain']>>, key: string) =>
      report.levels.flatMap(l => l.metrics).find(m => m.key === key)

    it('branche la chaîne sur les mesures de Finance quand on les lui donne', async () => {
      const report = await build().getChain('u-1', 'ws-1', { marginPercent: 18.5, dsoDays: 37 })
      expect(metricOf(report, 'margin')).toMatchObject({ value: 0.185, status: 'ok' })
      expect(metricOf(report, 'dso')).toMatchObject({ value: 37, status: 'ok' })
    })

    it('sait dire NON : sans mesures de Finance, marge et DSO restent « non mesuré »', async () => {
      const report = await build().getChain('u-1', 'ws-1')
      expect(metricOf(report, 'margin')?.value).toBeNull()
      expect(metricOf(report, 'dso')?.value).toBeNull()
    })

    it('une mesure absente reste « non mesuré », jamais 0', async () => {
      const report = await build().getChain('u-1', 'ws-1', { marginPercent: null, dsoDays: null })
      expect(metricOf(report, 'margin')).toMatchObject({ value: null, status: 'non_mesure' })
      expect(metricOf(report, 'dso')).toMatchObject({ value: null, status: 'non_mesure' })
    })
  })

  it('le workspace introuvable ne rend AUCUN chiffre', async () => {
    const contacts = createMockRepository()
    const opportunities = createMockRepository()
    const workspaceContext = { resolveActiveWorkspace: jest.fn().mockRejectedValue(new Error('no workspace')) }
    const service = new PilotageService(contacts as never, opportunities as never, workspaceContext as never)
    const report = await service.getChain('u-1')
    expect(report.levels.flatMap(l => l.metrics).every(m => m.value === null)).toBe(true)
    expect(report.levels.every(l => l.status === 'non_mesure')).toBe(true)
  })
})

/**
 * #3262.24-28 (épopée #3262, lot R11 29/09) — LES SIGNAUX DE REVUE
 * (`reviewSignals`), pour la bande de décision (`DecisionStrip.tsx`).
 */
describe('reviewSignals (#3262.24-28)', () => {
  function buildReviewSignalsService(overrides: {
    counts?: Row[] | Error
    parked?: Row[] | Error
    watch?: Row[] | Error
  }): {
    service: PilotageService
    contacts: ReturnType<typeof createMockRepository>
  } {
    const contacts = createMockRepository()
    const opportunities = createMockRepository()
    contacts.query.mockImplementation(async (sql: string) => {
      if (sql.includes('"staleFocusCount"')) {
        if (overrides.counts instanceof Error) throw overrides.counts
        return overrides.counts ?? []
      }
      if (sql.includes('gate_reason, gate_decided_at')) {
        if (overrides.parked instanceof Error) throw overrides.parked
        return overrides.parked ?? []
      }
      // #3407.5 — « veille à réveiller » : routée seulement quand le test la demande ;
      // sinon non routée, donc lecture en échec, donc `null` (jamais un zéro deviné).
      if (sql.includes('"watchToWakeCount"') && overrides.watch !== undefined) {
        if (overrides.watch instanceof Error) throw overrides.watch
        return overrides.watch
      }
      throw new Error(`requête non routée : ${sql}`)
    })
    const workspaceContext = { resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1' }) }
    return {
      service: new PilotageService(contacts as never, opportunities as never, workspaceContext as never),
      contacts,
    }
  }

  it('rend les cinq comptages mesurés', async () => {
    const { service } = buildReviewSignalsService({
      counts: [
        {
          staleFocusCount: 3,
          accountsWithoutOwnerCount: 5,
          accountsWithoutDateCount: 2,
          accountsWithoutMovementCount: 4,
        },
      ],
      parked: [
        // motif définitif (`do_not_contact`) : jamais dû, quelle que soit la date.
        { gate_reason: 'do_not_contact', gate_decided_at: '2020-01-01T00:00:00.000Z' },
        // `no_budget` (6 mois) décidé il y a plus d'un an : dû.
        { gate_reason: 'no_budget', gate_decided_at: '2020-01-01T00:00:00.000Z' },
      ],
    })

    const signals = await service.reviewSignals('ws-1')

    expect(signals).toEqual({
      staleFocusCount: 3,
      accountsWithoutOwnerCount: 5,
      accountsWithoutDateCount: 2,
      accountsWithoutMovementCount: 4,
      noGoToRevisitCount: 1,
      // Non routées par ce mock (#3277.5, décrit dans son propre describe) —
      // une lecture non routée est une lecture en échec, donc `null`.
      strategyNoGoCount: null,
      strategyBlockedCount: null,
      watchToWakeCount: null,
    })
  })

  // #3407.5 (recette 30/09) — « veille qui devrait remonter après un signal » :
  // la RÈGLE existait (`shouldSwitch('watch', 'strong_signal')`) sans personne
  // pour la poser sur le portefeuille. On PROPOSE (un compteur cliquable),
  // on ne bascule jamais seul.
  it('#3407.5 — compte les comptes en veille dont un signal est arrivé APRÈS leur entrée en veille', async () => {
    const { service, contacts } = buildReviewSignalsService({
      counts: [{ staleFocusCount: 0, accountsWithoutOwnerCount: 0, accountsWithoutDateCount: 0 }],
      parked: [],
      watch: [{ watchToWakeCount: 2 }],
    })
    const signals = await service.reviewSignals('ws-1')
    expect(signals.watchToWakeCount).toBe(2)
    const watchCall = contacts.query.mock.calls.find(([sql]) => String(sql).includes('"watchToWakeCount"'))
    const [sql, params] = watchCall as [string, unknown[]]
    expect(sql).toContain("a.sprint = 'watch'")
    expect(sql).toContain('o.first_detected_at > a.sprint_entered_at')
    expect(sql).toContain("o.kind = 'signal'")
    expect(sql).toContain('o.archived_at IS NULL')
    expect(sql).toContain("commercial_status <> 'archived'")
    expect(params).toEqual(['ws-1'])
  })

  it('#3407.5 — aucun compte à réveiller = un VRAI zéro ; une lecture en échec = `null`, jamais 0', async () => {
    const ok = buildReviewSignalsService({ counts: [], parked: [], watch: [{ watchToWakeCount: 0 }] })
    expect((await ok.service.reviewSignals('ws-1')).watchToWakeCount).toBe(0)
    const ko = buildReviewSignalsService({ counts: [], parked: [], watch: new Error('opportunities illisible') })
    expect((await ko.service.reviewSignals('ws-1')).watchToWakeCount).toBeNull()
  })

  it('scope les deux requêtes sur l’espace, hors comptes supprimés/archivés, avec le seuil FOCUS_STALE_DAYS nommé', async () => {
    const { service, contacts } = buildReviewSignalsService({ counts: [], parked: [] })
    await service.reviewSignals('ws-1')

    const [countsSql, countsParams] = contacts.query.mock.calls[0] as [string, unknown[]]
    expect(countsSql).toContain("workspace_id = $1 AND status <> 'deleted' AND commercial_status <> 'archived'")
    expect(countsParams).toEqual(['ws-1', 30])

    const [parkedSql, parkedParams] = contacts.query.mock.calls[1] as [string, unknown[]]
    expect(parkedSql).toContain("workspace_id = $1 AND status <> 'deleted' AND commercial_status <> 'archived'")
    expect(parkedSql).toContain("priority_gate = 'parked'")
    expect(parkedParams).toEqual(['ws-1'])
  })

  /**
   * #3262.24 (épopée #3284, ce lot) — « compte actif sans mouvement ».
   * Tranché sans Louis : « actif » = la file EXÉCUTION de `SPRINT_LANE_LEVELS`
   * (`extension`/`volume`) — les comptes en ARBITRAGE (`focus`/`no_go`/
   * `watch`/`partner_route`) sont déjà couverts par `staleFocusCount`/
   * `noGoToRevisitCount` et ne comptent pas une seconde fois ici. « Sans
   * mouvement » réutilise `FOCUS_STALE_DAYS` (même cadence que l'événement
   * `thirty_days_idle`, GA-26) sur `MAX(activities.occurred_at)`, jamais un
   * second seuil recopié.
   */
  it('nomme la file exécution et le seuil FOCUS_STALE_DAYS pour "sans mouvement"', async () => {
    const { service, contacts } = buildReviewSignalsService({ counts: [], parked: [] })
    await service.reviewSignals('ws-1')

    const [countsSql] = contacts.query.mock.calls[0] as [string, unknown[]]
    expect(countsSql).toContain("sprint IN ('extension', 'volume')")
    expect(countsSql).toContain('LEFT JOIN')
    expect(countsSql).toContain('activities')
  })

  it('une lecture des comptages en échec rend `null` pour les quatre, sans casser la revue No-Go', async () => {
    const { service } = buildReviewSignalsService({
      counts: new Error('accounts illisible'),
      parked: [{ gate_reason: 'no_budget', gate_decided_at: '2020-01-01T00:00:00.000Z' }],
    })

    const signals = await service.reviewSignals('ws-1')

    expect(signals.staleFocusCount).toBeNull()
    expect(signals.accountsWithoutOwnerCount).toBeNull()
    expect(signals.accountsWithoutDateCount).toBeNull()
    expect(signals.accountsWithoutMovementCount).toBeNull()
    expect(signals.noGoToRevisitCount).toBe(1)
  })

  it('une lecture des comptes écartés en échec rend `null` pour noGoToRevisitCount seul', async () => {
    const { service } = buildReviewSignalsService({
      counts: [
        {
          staleFocusCount: 0,
          accountsWithoutOwnerCount: 0,
          accountsWithoutDateCount: 0,
          accountsWithoutMovementCount: 0,
        },
      ],
      parked: new Error('accounts illisible'),
    })

    const signals = await service.reviewSignals('ws-1')

    expect(signals.noGoToRevisitCount).toBeNull()
    expect(signals.staleFocusCount).toBe(0)
  })
})

/**
 * #3277.5 (épopée #3277, lot E22 30/09) — READINESS AccountStrategy5P, AU
 * NIVEAU PORTEFEUILLE, pour `DecisionStrip.tsx`. Même discipline que
 * `/pilotage/marche` (#1633/#1635) : une seule route pour plusieurs écrans,
 * jamais un second moteur — `deriveAccountStrategy5P` (le même que
 * `AccountStrategy5PService.strategyFor`) est appelé tel quel, sur une lecture
 * en masse plutôt qu'un appel par compte (N+1 sur un portefeuille entier).
 */
describe('reviewSignals — readiness AccountStrategy5P (#3277.5)', () => {
  // #3277.6/.7 — Pilotage et fiche Compte lisent les MÊMES missions (même source P4/P5).
  it('lit les missions des comptes (statut + consultants), comme la fiche Compte', async () => {
    const { service, contacts } = buildReadinessService({
      counts: [{ staleFocusCount: 0, accountsWithoutOwnerCount: 0, accountsWithoutDateCount: 0 }],
      parked: [],
      accounts: [{ id: 'acc-1', raw_analysis: {} }],
      contacts: [],
      missions: [{ account_id: 'acc-1', label: 'Refonte SI', status: 'active', full_name: 'Awa Diallo' }],
    })

    const signals = await service.reviewSignals('ws-1')

    const missionSql = contacts.query.mock.calls
      .map(call => String(call[0]))
      .find(sql => sql.includes('FROM missions m'))
    expect(missionSql).toMatch(/account_id = ANY/)
    // Une mission en cours donne une preuve ET une voie : trois dimensions vides sur cinq
    // ne font plus un NO-GO — le chiffre baisse parce qu'une SOURCE est branchée.
    expect(signals.strategyNoGoCount).toBe(0)
    expect(signals.strategyBlockedCount).toBe(0)
  })

  it('lit les ESN non écartées de chaque compte (partner / rang 2)', async () => {
    const { service, contacts } = buildReadinessService({
      counts: [{ staleFocusCount: 0, accountsWithoutOwnerCount: 0, accountsWithoutDateCount: 0 }],
      parked: [],
      accounts: [{ id: 'acc-1', raw_analysis: {} }],
      contacts: [],
      partners: [{ account_id: 'acc-1', name: 'ALTEN', rank: 'rank1', relationship: 'partner' }],
    })

    await service.reviewSignals('ws-1')

    const sql = contacts.query.mock.calls.map(call => String(call[0])).find(q => q.includes('FROM account_partners ap'))
    expect(sql).toMatch(/dismissed_at IS NULL/)
  })

  it('une lecture des missions en échec rend `null`, jamais un compte « sans mission » deviné', async () => {
    const { service } = buildReadinessService({
      counts: [{ staleFocusCount: 0, accountsWithoutOwnerCount: 0, accountsWithoutDateCount: 0 }],
      parked: [],
      accounts: [{ id: 'acc-1', raw_analysis: {} }],
      contacts: [],
      missions: new Error('missions illisible'),
    })

    const signals = await service.reviewSignals('ws-1')

    expect(signals.strategyNoGoCount).toBeNull()
  })

  function buildReadinessService(overrides: {
    counts?: Row[] | Error
    parked?: Row[] | Error
    accounts?: Row[] | Error
    contacts?: Row[] | Error
    missions?: Row[] | Error
    partners?: Row[]
  }): { service: PilotageService; contacts: ReturnType<typeof createMockRepository> } {
    const contacts = createMockRepository()
    const opportunities = createMockRepository()
    contacts.query.mockImplementation(async (sql: string) => {
      if (sql.includes('"staleFocusCount"')) {
        if (overrides.counts instanceof Error) throw overrides.counts
        return overrides.counts ?? []
      }
      if (sql.includes('gate_reason, gate_decided_at')) {
        if (overrides.parked instanceof Error) throw overrides.parked
        return overrides.parked ?? []
      }
      if (sql.includes('id, raw_analysis')) {
        if (overrides.accounts instanceof Error) throw overrides.accounts
        return overrides.accounts ?? []
      }
      if (sql.includes('account_id, decision_role')) {
        if (overrides.contacts instanceof Error) throw overrides.contacts
        return overrides.contacts ?? []
      }
      if (sql.includes('FROM missions m')) {
        if (overrides.missions instanceof Error) throw overrides.missions
        return overrides.missions ?? []
      }
      if (sql.includes('FROM account_partners ap')) return overrides.partners ?? []
      throw new Error(`requête non routée : ${sql}`)
    })
    const workspaceContext = { resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1' }) }
    return {
      service: new PilotageService(contacts as never, opportunities as never, workspaceContext as never),
      contacts,
    }
  }

  // Une analyse vide rend les cinq dimensions `missing` → NO_GO (garde-fou
  // vérifié par `account-strategy-5p.test.ts` — jamais redérivé ici).
  const EMPTY_ANALYSIS = {}

  it('compte les comptes NO_GO sur le portefeuille, sans toucher aux quatre signaux existants', async () => {
    const { service } = buildReadinessService({
      counts: [{ staleFocusCount: 0, accountsWithoutOwnerCount: 0, accountsWithoutDateCount: 0 }],
      parked: [],
      accounts: [
        { id: 'acc-1', raw_analysis: EMPTY_ANALYSIS },
        { id: 'acc-2', raw_analysis: EMPTY_ANALYSIS },
      ],
      contacts: [],
    })

    const signals = await service.reviewSignals('ws-1')

    expect(signals.staleFocusCount).toBe(0)
    expect(signals.strategyNoGoCount).toBe(2)
    expect(signals.strategyBlockedCount).toBe(0)
  })

  // Recette prod 01/10 : le Pilotage et la fiche Compte doivent compter les MÊMES personnes —
  // un contact supprimé n'en est plus une (même règle que `findByAccount`).
  it('ne lit que les contacts non supprimés, comme la fiche Compte', async () => {
    const { service, contacts } = buildReadinessService({
      counts: [{ staleFocusCount: 0, accountsWithoutOwnerCount: 0, accountsWithoutDateCount: 0 }],
      parked: [],
      accounts: [{ id: 'acc-1', raw_analysis: EMPTY_ANALYSIS }],
      contacts: [],
    })

    await service.reviewSignals('ws-1')

    const contactSql = contacts.query.mock.calls
      .map(call => String(call[0]))
      .find(sql => sql.includes('account_id, decision_role'))
    expect(contactSql).toMatch(/deleted_at IS NULL/)
  })

  it('une lecture des comptes en échec rend `null` pour les deux comptages readiness, sans casser les quatre autres', async () => {
    const { service } = buildReadinessService({
      counts: [{ staleFocusCount: 2, accountsWithoutOwnerCount: 0, accountsWithoutDateCount: 0 }],
      parked: [],
      accounts: new Error('accounts (raw_analysis) illisible'),
      contacts: [],
    })

    const signals = await service.reviewSignals('ws-1')

    expect(signals.staleFocusCount).toBe(2)
    expect(signals.strategyNoGoCount).toBeNull()
    expect(signals.strategyBlockedCount).toBeNull()
  })

  it('un portefeuille sans compte rend deux vrais zéros, pas `null`', async () => {
    const { service } = buildReadinessService({
      counts: [{ staleFocusCount: 0, accountsWithoutOwnerCount: 0, accountsWithoutDateCount: 0 }],
      parked: [],
      accounts: [],
      contacts: [],
    })

    const signals = await service.reviewSignals('ws-1')

    expect(signals.strategyNoGoCount).toBe(0)
    expect(signals.strategyBlockedCount).toBe(0)
  })
})

/**
 * #3262.23 (épopée #3284, lot P05 29/09) — LA PHRASE DE LAURA sur UN compte
 * Focus qui stagne (`focusReviewForAccount`) — même règle que `reviewSignals`
 * (`staleFocusCount`), appliquée à un compte nommé plutôt qu'agrégée.
 */
describe('focusReviewForAccount (#3262.23)', () => {
  function buildService(row: Row | undefined): {
    service: PilotageService
    contacts: ReturnType<typeof createMockRepository>
  } {
    const contacts = createMockRepository()
    const opportunities = createMockRepository()
    contacts.query.mockImplementation(async () => (row ? [row] : []))
    const workspaceContext = { resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1' }) }
    return {
      service: new PilotageService(contacts as never, opportunities as never, workspaceContext as never),
      contacts,
    }
  }

  it('`null` quand le compte est introuvable dans l’espace', async () => {
    const { service } = buildService(undefined)
    expect(await service.focusReviewForAccount('ws-1', 'acc-missing')).toBeNull()
  })

  it('non applicable quand le compte n’est pas en Focus', async () => {
    const { service } = buildService({
      company_name: 'Acme',
      sprint: 'volume',
      sprint_entered_at: '2026-01-01T00:00:00.000Z',
    })
    const now = new Date('2026-09-29T00:00:00.000Z')
    expect(await service.focusReviewForAccount('ws-1', 'acc-1', now)).toEqual({
      applicable: false,
      companyName: 'Acme',
      stale: null,
      daysInFocus: null,
      recommendation: null,
      suggestedLevel: null,
      nextReview: null,
      reactivation: [],
    })
  })

  it('non applicable quand la date d’entrée en Focus est inconnue', async () => {
    const { service } = buildService({ company_name: 'Acme', sprint: 'focus', sprint_entered_at: null })
    expect(await service.focusReviewForAccount('ws-1', 'acc-1')).toMatchObject({ applicable: false, stale: null })
  })

  it('Focus récent — pas encore stagnant, sous FOCUS_STALE_DAYS', async () => {
    const { service } = buildService({
      company_name: 'Acme',
      sprint: 'focus',
      sprint_entered_at: '2026-09-20T00:00:00.000Z',
    })
    const now = new Date('2026-09-29T00:00:00.000Z')
    const result = await service.focusReviewForAccount('ws-1', 'acc-1', now)
    expect(result).toEqual({
      applicable: true,
      companyName: 'Acme',
      stale: false,
      daysInFocus: 9,
      recommendation: null,
      suggestedLevel: null,
      nextReview: null,
      reactivation: [],
    })
  })

  it('Focus stagnant — la phrase de Laura, relayée depuis `shouldSwitch`', async () => {
    const { service } = buildService({
      company_name: 'Acme',
      sprint: 'focus',
      sprint_entered_at: '2026-08-01T00:00:00.000Z',
    })
    const now = new Date('2026-09-29T00:00:00.000Z')
    const result = await service.focusReviewForAccount('ws-1', 'acc-1', now)
    expect(result?.applicable).toBe(true)
    expect(result?.stale).toBe(true)
    expect(result?.daysInFocus).toBe(59)
    expect(result?.suggestedLevel).toBe('extension')
    expect(result?.recommendation).toMatch(/trente jours/i)
  })

  it('#3262.20 — la date posée à la main gagne sur le délai calculé de la porte', async () => {
    const { service } = buildService({
      company_name: 'Acme',
      sprint: 'volume',
      sprint_entered_at: null,
      priority_gate: 'parked',
      gate_reason: 'budget',
      gate_decided_at: '2026-06-01T00:00:00.000Z',
      next_review_at: '2026-11-15T00:00:00.000Z',
    })
    const result = await service.focusReviewForAccount('ws-1', 'acc-1', new Date('2026-10-02T00:00:00.000Z'))
    expect(result?.nextReview).toEqual({ dueAt: '2026-11-15T00:00:00.000Z', source: 'relationship_memory' })
  })

  it('#3262.20 — aucune date posée ni calculable : null, jamais une date devinée', async () => {
    const { service } = buildService({
      company_name: 'Acme',
      sprint: 'volume',
      sprint_entered_at: null,
      priority_gate: 'pending',
      gate_reason: null,
      gate_decided_at: null,
      next_review_at: null,
    })
    expect((await service.focusReviewForAccount('ws-1', 'acc-1'))?.nextReview).toBeNull()
  })

  it('#3262.21 — un compte écarté nomme les évènements qui peuvent le réactiver', async () => {
    const { service } = buildService({
      company_name: 'Acme',
      sprint: 'no_go',
      sprint_entered_at: null,
      priority_gate: 'parked',
      gate_reason: 'budget',
      gate_decided_at: '2026-06-01T00:00:00.000Z',
      next_review_at: null,
    })
    const result = await service.focusReviewForAccount('ws-1', 'acc-1')
    expect(result?.reactivation?.map(option => option.event).sort()).toEqual(['positive_reply', 'strong_signal'])
    expect(result?.reactivation?.every(option => option.reopensGate)).toBe(true)
  })

  it('#3262.21 — un compte actif n’a aucune réactivation à proposer', async () => {
    const { service } = buildService({
      company_name: 'Acme',
      sprint: 'volume',
      sprint_entered_at: null,
      priority_gate: 'pending',
      gate_reason: null,
      gate_decided_at: null,
      next_review_at: null,
    })
    expect((await service.focusReviewForAccount('ws-1', 'acc-1'))?.reactivation).toEqual([])
  })

  it('scope la lecture sur l’espace et le compte, hors comptes supprimés/archivés', async () => {
    const { service, contacts } = buildService({ company_name: 'Acme', sprint: 'volume', sprint_entered_at: null })
    await service.focusReviewForAccount('ws-1', 'acc-1')
    const [sql, params] = contacts.query.mock.calls[0] as [string, unknown[]]
    expect(sql).toContain("workspace_id = $1 AND id = $2 AND status <> 'deleted' AND commercial_status <> 'archived'")
    expect(params).toEqual(['ws-1', 'acc-1'])
  })
})

/**
 * P5 (29/09) — `GET /pilotage/chain` mesuré à 1,6-2,9 s : les quatre lectures
 * (contacts, besoins, comptes, consultants) s'enchaînaient. Plafond chiffré : 4
 * requêtes, en vol ENSEMBLE (pic 4 ; l'ancien code donnait 1), et l'espace déjà
 * résolu par le contrôleur n'est PAS résolu une seconde fois.
 */
describe('PilotageService.getChain — perf P5', () => {
  it('4 requêtes en vol ensemble, et aucune résolution d’espace de plus quand il est connu', async () => {
    let inFlight = 0
    let peak = 0
    let started = 0
    const slow = async (): Promise<Row[]> => {
      started += 1
      inFlight += 1
      peak = Math.max(peak, inFlight)
      await new Promise(resolve => setImmediate(resolve))
      inFlight -= 1
      return [{ total: 1, known: 1, bench: 1, triaged: 1, qualified: 1, decided: 1, converted: 1, activeClients: 1 }]
    }
    const contacts = createMockRepository()
    const opportunities = createMockRepository()
    contacts.query.mockImplementation(slow)
    opportunities.query.mockImplementation(slow)
    const workspaceContext = { resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1' }) }
    const service = new PilotageService(contacts as never, opportunities as never, workspaceContext as never)

    await service.getChain('u-1', 'ws-1')

    expect(started).toBe(4)
    expect(peak).toBe(4)
    expect(workspaceContext.resolveActiveWorkspace).not.toHaveBeenCalled()
  })
})
