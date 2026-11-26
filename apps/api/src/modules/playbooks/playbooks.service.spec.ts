import { BadRequestException, NotFoundException } from '@nestjs/common'
import { PLAYBOOK_DAILY_CAP } from '@bellum/contracts'
import { PlaybooksService } from './playbooks.service'

const WORKSPACE = 'w0000000-0000-4000-8000-000000000001'
const USER = 'u0000000-0000-4000-8000-000000000001'
const TARGET = 't0000000-0000-4000-8000-000000000001'

/** Un mardi 10 h — dans les heures d'envoi. */
const OK_TIME = new Date('2026-08-18T10:00:00')
const NIGHT = new Date('2026-08-18T03:00:00')

function makeService(overrides: Record<string, unknown> = {}) {
  const queries: { sql: string; params: unknown[] }[] = []
  const manager = {
    query: jest.fn(async (sql: string, params: unknown[] = []) => {
      queries.push({ sql, params })
      if (sql.includes('SELECT count(*)')) return [{ count: String(overrides['sentToday'] ?? 0) }]
      if (sql.includes('INSERT INTO playbook_sends')) return overrides['sendExists'] === true ? [] : [{ id: 's1' }]
      if (sql.includes('INSERT INTO interventions'))
        return overrides['interventionExists'] === true ? [] : [{ id: 'i1' }]
      if (sql.includes('FROM interventions i')) return (overrides['interventionRows'] as unknown[]) ?? []
      return []
    }),
  }
  const subscriptions = {
    manager,
    find: jest.fn(async () => (overrides['subscriptionRows'] as unknown[]) ?? []),
    findOne: jest.fn(async () =>
      overrides['subscription'] === undefined
        ? {
            workspace_id: WORKSPACE,
            playbook: 'submission_no_reply',
            enabled: true,
            silence_days: 7,
            updated_at: new Date(),
          }
        : (overrides['subscription'] as unknown),
    ),
  }
  const sends = {
    manager,
    findOne: jest.fn(async () =>
      overrides['pendingSend'] !== undefined
        ? (overrides['pendingSend'] as unknown)
        : overrides['alreadySent'] === true
          ? { id: 's0' }
          : null,
    ),
    find: jest.fn(
      async () => (overrides['pendingApprovalRows'] as unknown[]) ?? (overrides['pendingRows'] as unknown[]) ?? [],
    ),
    update: jest.fn(async () => ({ affected: overrides['sendUpdateMissing'] === true ? 0 : 1 })),
  }
  const interventions = {
    manager,
    update: jest.fn(async () => ({ affected: overrides['interventionMissing'] === true ? 0 : 1 })),
  }
  const workspaceContext = {
    resolveActiveWorkspace: jest.fn(async () => ({ workspaceId: WORKSPACE })),
    getMembership: jest.fn(async () =>
      overrides['membership'] === undefined ? { user_id: TARGET } : overrides['membership'],
    ),
  }
  // La simulation a besoin d'une source de cibles et de l'opt-out. Les deux
  // sont des doublures inertes ici : ces tests portent sur les garde-fous, et
  // la simulation a sa propre couverture.
  const targets = { collect: jest.fn(async () => (overrides['targets'] as unknown[]) ?? []) }
  const suppression = { isSuppressed: jest.fn(async () => overrides['optedOut'] === true) }

  const service = new PlaybooksService(
    subscriptions as never,
    sends as never,
    interventions as never,
    workspaceContext as never,
    targets as never,
    suppression as never,
  )
  return { service, subscriptions, sends, interventions, queries, targets, suppression, workspaceContext }
}

const TARGET_OK = { id: TARGET, hasReply: false, optedOut: false, silenceDays: 10, recipient: 'marie@acme.fr' }

describe('PlaybooksService.list', () => {
  it('rend TOUJOURS les trois playbooks, même sans ligne en base', async () => {
    // Un écran qui n'afficherait que les playbooks déjà touchés cacherait ceux
    // qu'on n'a jamais armés — c'est-à-dire tous, au premier passage.
    const { service } = makeService({ subscriptionRows: [] })
    const list = await service.list(USER)
    expect(list).toHaveLength(3)
    expect(list.every(entry => entry.enabled === false)).toBe(true)
  })
})

describe('PlaybooksService.evaluate — les six garde-fous', () => {
  it('laisse partir quand tout est vert', async () => {
    const { service } = makeService()
    await expect(service.evaluate(WORKSPACE, 'submission_no_reply', TARGET_OK, OK_TIME)).resolves.toEqual({
      allowed: true,
      reason: null,
    })
  })

  it('n’envoie RIEN tant que l’espace n’a pas armé', async () => {
    const { service } = makeService({ subscription: null })
    const verdict = await service.evaluate(WORKSPACE, 'submission_no_reply', TARGET_OK, OK_TIME)
    expect(verdict).toEqual({ allowed: false, reason: 'not_enabled' })
  })

  it('ARRÊTE dès qu’il y a une réponse', async () => {
    const { service } = makeService()
    const verdict = await service.evaluate(WORKSPACE, 'submission_no_reply', { ...TARGET_OK, hasReply: true }, OK_TIME)
    expect(verdict).toEqual({ allowed: false, reason: 'replied' })
  })

  it('n’envoie qu’UNE fois par cible', async () => {
    const { service } = makeService({ alreadySent: true })
    const verdict = await service.evaluate(WORKSPACE, 'submission_no_reply', TARGET_OK, OK_TIME)
    expect(verdict).toEqual({ allowed: false, reason: 'already_sent' })
  })

  it('respecte le désabonnement', async () => {
    const { service } = makeService()
    const verdict = await service.evaluate(WORKSPACE, 'submission_no_reply', { ...TARGET_OK, optedOut: true }, OK_TIME)
    expect(verdict).toEqual({ allowed: false, reason: 'opted_out' })
  })

  it('respecte les heures calmes', async () => {
    const { service } = makeService()
    const verdict = await service.evaluate(WORKSPACE, 'submission_no_reply', TARGET_OK, NIGHT)
    expect(verdict).toEqual({ allowed: false, reason: 'quiet_hours' })
  })

  it('s’arrête au plafond quotidien de l’espace', async () => {
    const { service } = makeService({ sentToday: PLAYBOOK_DAILY_CAP })
    const verdict = await service.evaluate(WORKSPACE, 'submission_no_reply', TARGET_OK, OK_TIME)
    expect(verdict).toEqual({ allowed: false, reason: 'daily_cap' })
  })

  it('ne relance pas sur un silence INCONNU', async () => {
    const { service } = makeService()
    const verdict = await service.evaluate(
      WORKSPACE,
      'submission_no_reply',
      { ...TARGET_OK, silenceDays: null },
      OK_TIME,
    )
    expect(verdict).toEqual({ allowed: false, reason: 'not_silent_enough' })
  })
})

describe('PlaybooksService.requestApproval', () => {
  const REQUEST = {
    targetId: TARGET,
    recipient: 'marie@acme.fr',
    ownerId: 'owner-1',
    subject: 'Profil de Karim — as-tu pu le regarder ?',
    body: 'Bonjour Marie,',
  }

  it('RÉSERVE avant de demander, et refuse le second', async () => {
    // Deux balayages concurrents passeraient tous deux un contrôle préalable :
    // le doublon serait un second e-mail chez un client.
    const { service, queries } = makeService()
    await expect(service.requestApproval(WORKSPACE, 'submission_no_reply', REQUEST)).resolves.toBe(true)
    const insert = queries.find(entry => entry.sql.includes('INSERT INTO playbook_sends'))
    expect(insert?.sql).toContain('ON CONFLICT (workspace_id, playbook, target_id) DO NOTHING')
  })

  it('pose l’état « en attente » et FIGE le texte', async () => {
    // Recomposer à l'approbation ferait valider un message et en envoyer un
    // autre : le dossier a pu changer entre-temps.
    const { service, queries } = makeService()
    await service.requestApproval(WORKSPACE, 'submission_no_reply', REQUEST)
    const insert = queries.find(entry => entry.sql.includes('INSERT INTO playbook_sends'))
    expect(insert?.sql).toContain("'pending_approval'")
    expect(insert?.params).toEqual(
      expect.arrayContaining([REQUEST.subject, REQUEST.body, REQUEST.ownerId, expect.any(Date)]),
    )
  })

  it('rend faux quand la trace existe déjà', async () => {
    const { service } = makeService({ sendExists: true })
    await expect(service.requestApproval(WORKSPACE, 'submission_no_reply', REQUEST)).resolves.toBe(false)
  })
})

describe('PlaybooksService — l’expiration d’une demande', () => {
  it('ne remet JAMAIS une demande périmée en attente : elle est close', async () => {
    // Le prix assumé est qu'une relance ignorée est perdue. Le prix inverse
    // serait de reproposer indéfiniment ce que quelqu'un a laissé passer.
    const { service, queries } = makeService()
    await service.expireStale(new Date('2026-08-26T10:00:00.000Z'))
    const update = queries.find(entry => entry.sql.includes("SET state = 'expired'"))
    expect(update?.sql).toContain("state = 'pending_approval'")
    expect(update?.sql).toContain('expires_at IS NULL OR expires_at <=')
  })
})

/**
 * #2855 (#2201.14) — `target.source` NOMME la PROVENANCE : quelle routine a
 * composé cette relance. Dérivée de la colonne EXISTANTE `row.playbook`
 * (aucune migration) — la recommandation déjà écrite au registre du 16/09.
 */
describe('PlaybooksService.pendingApprovals — provenance (#2855)', () => {
  it('nomme la routine qui a composé chaque relance en attente', async () => {
    const { service } = makeService({
      pendingApprovalRows: [
        {
          id: 's1',
          playbook: 'submission_no_reply',
          recipient: 'marie@acme.fr',
          subject: 'Suivi de ta candidature',
          body: 'Bonjour Marie,',
          sent_at: new Date('2026-08-18T10:00:00'),
          expires_at: new Date('2026-08-21T10:00:00'),
        },
      ],
    })
    const approvals = await service.pendingApprovals(USER, OK_TIME)
    expect(approvals).toHaveLength(1)
    expect(approvals[0]?.target?.source).toEqual({ kind: 'routine', ref: 'submission_no_reply' })
  })
})

describe('PlaybooksService — file d’intervention', () => {
  it('n’ouvre PAS deux fois le même problème', async () => {
    // Une file qui se remplit toute seule devient une seconde boîte de
    // réception, et une seconde boîte de réception ne se lit pas.
    const { service, queries } = makeService({ interventionExists: true })
    const opened = await service.open({
      workspaceId: WORKSPACE,
      kind: 'renewal_at_risk',
      subjectType: 'mission',
      subjectId: TARGET,
      ownerId: null,
      detail: 'Fin dans 12 jours, aucun renouvellement ouvert',
    })
    expect(opened).toBe(false)
    const insert = queries.find(entry => entry.sql.includes('INSERT INTO interventions'))
    expect(insert?.sql).toContain('DO NOTHING')
  })

  // #3671 (recette prod 10/10 : « retard de 69 jours » sur la carte, « échéance dépassée depuis 31
  // jours » sur l'intervention de la MÊME facture 2026-06) — `detail` est écrit à l'ouverture puis
  // figé par `DO NOTHING` : le nombre de jours de la phrase s'arrêtait le jour du premier balayage.
  it('#3671 — un retard déjà ouvert RAFRAÎCHIT sa phrase (le nombre de jours ne se fige pas)', async () => {
    const { service, queries } = makeService({ interventionExists: true })
    const opened = await service.open({
      workspaceId: WORKSPACE,
      kind: 'payment_overdue',
      subjectType: 'mission',
      subjectId: TARGET,
      ownerId: null,
      detail: 'M — facture du mois 2026-06 : échéance dépassée depuis 69 jours, aucun encaissement enregistré.',
    })
    expect(opened).toBe(false)
    const refresh = queries.find(entry => entry.sql.includes('UPDATE interventions'))
    expect(refresh?.sql).toContain("state <> 'resolved'")
    expect(refresh?.params).toContain(
      'M — facture du mois 2026-06 : échéance dépassée depuis 69 jours, aucun encaissement enregistré.',
    )
  })

  it('#3671 — sait dire NON : les autres natures gardent leur phrase d’ouverture', async () => {
    const { service, queries } = makeService({ interventionExists: true })
    await service.open({
      workspaceId: WORKSPACE,
      kind: 'renewal_at_risk',
      subjectType: 'mission',
      subjectId: TARGET,
      ownerId: null,
      detail: 'Fin dans 12 jours',
    })
    expect(queries.some(entry => entry.sql.includes('UPDATE interventions'))).toBe(false)
  })

  // #3671 (recette 11/10, prod 3e15515f7a) — le rafraîchissement au balayage ne suffit pas : tant que
  // le balayage n'est pas repassé, « Ce qui attend ta décision » lit la phrase figée (31 jours) à côté
  // du brief (69). Au LISTAGE, le nombre de jours se relit de l'échéance vivante, avec la formule
  // unique `overdueDaysFromDueOn` — jamais du texte stocké.
  describe('#3671 — l’ancienneté d’un retard se relit à la lecture', () => {
    const NOW_FIXED = new Date('2026-10-11T09:00:00Z')
    const row = (over: Record<string, unknown>) => ({
      id: 'i1',
      kind: 'payment_overdue',
      subject_type: 'mission',
      subject_id: TARGET,
      owner_id: null,
      detail: 'M — facture du mois 2026-06 : échéance dépassée depuis 31 jours, aucun encaissement enregistré.',
      state: 'open',
      opened_at: '2026-08-01T00:00:00Z',
      resolved_at: null,
      first_name: null,
      last_name: null,
      email: null,
      live_due_on: '2026-08-03',
      ...over,
    })

    beforeEach(() => {
      jest.useFakeTimers().setSystemTime(NOW_FIXED)
    })
    afterEach(() => {
      jest.useRealTimers()
    })

    it('réécrit « depuis N jours » avec la formule unique, pas avec le texte stocké', async () => {
      const { service } = makeService({ interventionRows: [row({})] })
      const [item] = await service.listInterventions(USER)
      // 2026-08-03 → 2026-10-11 09:00Z = 69 jours pleins (la valeur du brief).
      expect(item?.detail).toContain('depuis 69 jours')
      expect(item?.detail).not.toContain('31 jours')
    })

    it('sait dire NON : sans échéance vivante, ou pour une autre nature, la phrase reste', async () => {
      const { service } = makeService({
        interventionRows: [
          row({ id: 'i2', live_due_on: null }),
          row({ id: 'i3', kind: 'renewal_at_risk', detail: 'Fin dans 31 jours', live_due_on: '2026-08-03' }),
        ],
      })
      const items = await service.listInterventions(USER)
      expect(items.find(i => i.id === 'i2')?.detail).toContain('depuis 31 jours')
      expect(items.find(i => i.id === 'i3')?.detail).toBe('Fin dans 31 jours')
    })
  })

  it('ne liste QUE ce qui n’est pas résolu, le plus ancien d’abord', async () => {
    const { service, queries } = makeService()
    await service.listInterventions(USER)
    const read = queries.find(entry => entry.sql.includes('FROM interventions i'))
    expect(read?.sql).toContain("i.state <> 'resolved'")
    expect(read?.sql).toContain('ORDER BY i.opened_at ASC')
  })

  it('ne DATE PAS de résolution sur une simple prise en compte', async () => {
    // Lui poser une date la ferait disparaître d'une file où elle doit rester
    // tant que le problème existe.
    const { service, interventions } = makeService()
    await service.decide(USER, 'i1', { state: 'acknowledged' })
    expect(interventions.update).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ state: 'acknowledged', resolved_at: null }),
    )
  })

  it('date la résolution quand c’est résolu', async () => {
    const { service, interventions } = makeService()
    await service.decide(USER, 'i1', { state: 'resolved' })
    expect(interventions.update).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ state: 'resolved', resolved_at: expect.any(Date) }),
    )
  })

  it('404 sur une intervention d’un autre espace', async () => {
    const { service } = makeService({ interventionMissing: true })
    await expect(service.decide(USER, 'i1', { state: 'resolved' })).rejects.toBeInstanceOf(NotFoundException)
  })
})

describe('PlaybooksService.assign', () => {
  it('pose le propriétaire quand le membre appartient à l’espace', async () => {
    const { service, interventions } = makeService()
    await service.assign(USER, 'i1', { ownerId: TARGET })
    expect(interventions.update).toHaveBeenCalledWith({ id: 'i1', workspace_id: WORKSPACE }, { owner_id: TARGET })
  })

  it('libère la ligne sans vérifier de membre', async () => {
    const { service, interventions, workspaceContext } = makeService()
    await service.assign(USER, 'i1', { ownerId: null })
    expect(workspaceContext.getMembership).not.toHaveBeenCalled()
    expect(interventions.update).toHaveBeenCalledWith({ id: 'i1', workspace_id: WORKSPACE }, { owner_id: null })
  })

  it('refuse un membre qui n’appartient pas à l’espace', async () => {
    const { service } = makeService({ membership: null })
    await expect(service.assign(USER, 'i1', { ownerId: TARGET })).rejects.toBeInstanceOf(BadRequestException)
  })

  it('404 sur une intervention d’un autre espace', async () => {
    const { service } = makeService({ interventionMissing: true })
    await expect(service.assign(USER, 'i1', { ownerId: null })).rejects.toBeInstanceOf(NotFoundException)
  })
})

/** Une cible telle que `PlaybookTargetsService` la rend. */
function target(overrides: Record<string, unknown> = {}) {
  return {
    targetId: TARGET,
    workspaceId: WORKSPACE,
    ownerId: USER,
    recipient: 'marie@acme.example',
    label: 'Karim Benali — ACME',
    silenceDays: 12,
    hasReply: false,
    subject: 'Profil de Karim Benali — as-tu pu le regarder ?',
    body: 'Bonjour Marie,',
    ...overrides,
  }
}

describe('simulation — ce qui partirait, sans que rien ne parte', () => {
  it('juge COMME SI le playbook était armé', async () => {
    // Sans cette hypothèse, chaque ligne rendrait `not_enabled` : exact, et
    // parfaitement inutile — la seule question qu'on se pose avant d'armer est
    // ce qui se passerait APRÈS.
    const { service } = makeService({ subscription: null, targets: [target()] })
    const result = await service.dryRun(USER, 'submission_no_reply', OK_TIME)
    expect(result.wouldSend).toBe(1)
    expect(result.entries[0]!.reason).toBeNull()
  })

  it('dit l’état RÉEL de l’abonnement, pas celui qu’elle a supposé', async () => {
    // L'écran doit afficher « éteint » même quand la simulation montre des
    // envois possibles : sinon il annonce une automatisation qui ne tourne pas.
    const { service } = makeService({ subscription: null, targets: [target()] })
    const result = await service.dryRun(USER, 'submission_no_reply', OK_TIME)
    expect(result.enabled).toBe(false)
  })

  it('n’écrit RIEN — ni réservation, ni armement', async () => {
    const { service, queries } = makeService({ subscription: null, targets: [target()] })
    await service.dryRun(USER, 'submission_no_reply', OK_TIME)
    const writes = queries.filter(entry => /INSERT|UPDATE|DELETE/i.test(entry.sql))
    expect(writes).toHaveLength(0)
  })

  it('nomme chaque refus et les compte par motif', async () => {
    const { service } = makeService({
      subscription: null,
      targets: [target(), target({ targetId: 'other', hasReply: true })],
    })
    const result = await service.dryRun(USER, 'submission_no_reply', OK_TIME)
    expect(result.wouldSend).toBe(1)
    expect(result.blocked).toEqual({ replied: 1 })
  })

  it('refuse tout la nuit, sans prétendre que c’est définitif', async () => {
    const { service } = makeService({ subscription: null, targets: [target()] })
    const result = await service.dryRun(USER, 'submission_no_reply', NIGHT)
    expect(result.wouldSend).toBe(0)
    expect(result.blocked).toEqual({ quiet_hours: 1 })
  })

  it('montre l’objet du message — la seule façon de juger le ton avant d’armer', async () => {
    const { service } = makeService({ subscription: null, targets: [target()] })
    const result = await service.dryRun(USER, 'submission_no_reply', OK_TIME)
    expect(result.entries[0]!.subject).toContain('Karim Benali')
  })

  it('ne consulte pas l’opt-out d’une cible sans adresse', async () => {
    const { service, suppression } = makeService({ subscription: null, targets: [target({ recipient: null })] })
    const result = await service.dryRun(USER, 'submission_no_reply', OK_TIME)
    expect(suppression.isSuppressed).not.toHaveBeenCalled()
    expect(result.blocked).toEqual({ no_recipient: 1 })
  })

  it('rend une simulation vide plutôt qu’une erreur quand il n’y a aucune cible', async () => {
    const { service } = makeService({ subscription: null, targets: [] })
    const result = await service.dryRun(USER, 'submission_no_reply', OK_TIME)
    expect(result).toMatchObject({ wouldSend: 0, entries: [], blocked: {} })
  })
})

// #2856 — reste du lot précédent : le report (`snoozed_until`) ne couvrait
// que approval_requests, outbound_write_requests, ats_write_requests. PAS de
// délégation ici (D58, messagerie personnelle) — le scope `owner_id: userId`
// EST la règle, pas un `canSnooze` multi-acteur.
describe('PlaybooksService.snooze', () => {
  const pendingRow = (over: Record<string, unknown> = {}) => ({
    id: 's1',
    owner_id: USER,
    state: 'pending_approval',
    expires_at: new Date(Date.now() + 3600_000),
    ...over,
  })

  it('reporte la relance — elle reste `pending_approval`, rien n’est décidé', async () => {
    const { service } = makeService({ pendingSend: pendingRow() })
    const until = new Date(Date.now() + 1800_000)

    const snoozed = await service.snooze(USER, 's1', until)

    expect(snoozed.snoozed_until).toEqual(until)
    expect(snoozed.state).toBe('pending_approval')
  })

  it('`null` réveille la relance', async () => {
    const { service } = makeService({ pendingSend: pendingRow({ snoozed_until: new Date(Date.now() + 1800_000) }) })

    const snoozed = await service.snooze(USER, 's1', null)

    expect(snoozed.snoozed_until).toBeNull()
  })

  it('refuse un report qui dépasse l’expiration de la relance', async () => {
    const { service } = makeService({ pendingSend: pendingRow({ expires_at: new Date(Date.now() + 1800_000) }) })

    await expect(service.snooze(USER, 's1', new Date(Date.now() + 3600_000))).rejects.toBeInstanceOf(
      BadRequestException,
    )
  })

  it('un COLLÈGUE ne trouve pas la relance — jamais de délégation sur une messagerie personnelle (D58)', async () => {
    // `findOne` est scopé `owner_id: userId` dans le service RÉEL ; ici, le
    // double simule ce même scope en rendant `null` pour un autre appelant.
    const { service } = makeService({ pendingSend: null })

    await expect(service.snooze('u-collegue', 's1', new Date(Date.now() + 1800_000))).rejects.toBeInstanceOf(
      NotFoundException,
    )
  })
})

// #2856 — reste : la file active ne disait jamais qu'une ligne était
// reportée (`snoozed_until` posé par `.snooze`, jamais rendu par
// `.pendingApprovals`) — l'écran ne pouvait ni la sortir de la file active
// ni proposer « Réveiller ». Ce test décrit le contrat qui manquait.
describe('PlaybooksService.pendingApprovals — expose le report', () => {
  const row = (over: Record<string, unknown> = {}) => ({
    id: 's1',
    playbook: 'submission_no_reply',
    recipient: 'marie@acme.fr',
    subject: 'Objet',
    body: 'Corps',
    sent_at: new Date('2026-08-18T09:00:00Z'),
    expires_at: new Date(Date.now() + 3600_000),
    snoozed_until: null,
    ...over,
  })

  it('rend `snoozedUntil` à `null` pour une relance active', async () => {
    const { service } = makeService({ pendingApprovalRows: [row()] })

    const [approval] = await service.pendingApprovals(USER)

    expect(approval.snoozedUntil).toBeNull()
  })

  it('rend `snoozedUntil` posé pour une relance reportée — la file active ne peut pas le taire', async () => {
    const until = new Date(Date.now() + 1800_000)
    const { service } = makeService({ pendingApprovalRows: [row({ snoozed_until: until })] })

    const [approval] = await service.pendingApprovals(USER)

    expect(approval.snoozedUntil).toBe(until.toISOString())
  })
})
