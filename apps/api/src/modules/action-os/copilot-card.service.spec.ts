import { APPROVAL_TTL_MS, defaultSnoozeUntil, type ActionIntent, type PendingChatAction } from '@bellum/contracts'
import type { ApprovalRequestEntity } from '../../database/entities/approval-request.entity'
import type { CreditReservationEntity } from '../../database/entities/credit-reservation.entity'
import type { ProfileEntity } from '../../database/entities/profile.entity'
import type { WorkflowRunEntity } from '../../database/entities/workflow-run.entity'
import type { WorkspaceEntity } from '../../database/entities/workspace.entity'
import { CopilotCardService } from './copilot-card.service'
import { CreditReservationService } from './credit-reservation.service'
import { inMemoryRepository } from './testing/in-memory-repository'
import { WorkflowRunnerService } from './workflow-runner.service'

/**
 * #1931 L2 — les six gestes d'une carte de Laura, contre un dépôt qui GARDE ses
 * lignes (un second clic trouve la ligne changée, pas un mock complaisant).
 */

const WS = '7a0c2f10-0000-4000-8000-000000000002'
const OTHER_WS = '7a0c2f10-0000-4000-8000-000000000099'
const AUTHOR = '9d359267-0000-4000-8000-000000000001'
const TEAMMATE = '9d359267-0000-4000-8000-000000000003'
const STRANGER = '9d359267-0000-4000-8000-000000000004'
const CONTACT = '11111111-1111-4111-8111-111111111111'
const FOREIGN_CONTACT = '11111111-1111-4111-8111-999999999999'
const TURN = '33333333-3333-4333-8333-333333333333'
const author = { userId: AUTHOR, email: 'rep@esn.fr' }

const MAIL_DRAFT: PendingChatAction = {
  action: 'prepare_mail_draft',
  to: 'claire@acme.example',
  subject: 'Suite',
  body: 'Bonjour Claire,',
}
const ENRICH: PendingChatAction = {
  action: 'enrich_contact',
  contact_id: CONTACT,
  contact_name: 'Claire Dubois',
  organization_name: 'ACME',
}
const MESSAGE: PendingChatAction = { action: 'prepare_message', contact_id: CONTACT, channel: 'email' }

function harness(
  options: {
    dispatch?: jest.Mock
    spendThreshold?: number
    role?: string
    activities?: { ingest: jest.Mock }
    outreachMessages?: { create: jest.Mock }
    delegations?: { awaitIfMandated: jest.Mock }
  } = {},
) {
  const runs = inMemoryRepository<WorkflowRunEntity>({
    unique: {
      name: 'workflow_runs_idempotency_idx',
      clash: (rows, candidate) =>
        rows.some(
          row => row.workspace_id === candidate.workspace_id && row.idempotency_key === candidate.idempotency_key,
        ),
    },
  })
  const approvals = inMemoryRepository<ApprovalRequestEntity>()
  const workspaces = inMemoryRepository<WorkspaceEntity>()
  workspaces.rows.push({
    id: WS,
    approval_spend_threshold: options.spendThreshold ?? null,
  } as unknown as WorkspaceEntity)
  const reservationRows = inMemoryRepository<CreditReservationEntity>()
  const reservations = new CreditReservationService(reservationRows as never)
  const accounts = inMemoryRepository<{ id: string; workspace_id: string }>()
  const contacts = inMemoryRepository<{ id: string; workspace_id: string }>()
  contacts.rows.push({ id: CONTACT, workspace_id: WS }, { id: FOREIGN_CONTACT, workspace_id: OTHER_WS })
  // #1931.12 — le nom RÉEL de l'auteur, seule source dont `actorName` a le droit
  // de venir (jamais l'e-mail du principal en repli).
  const profiles = inMemoryRepository<ProfileEntity>()
  profiles.rows.push({ user_id: AUTHOR, first_name: 'Camille', last_name: 'Nguyen' } as unknown as ProfileEntity)

  const dispatch =
    options.dispatch ??
    jest.fn(async (intent: ActionIntent) => ({
      type: intent.type,
      status: 'done',
      externalRef: 'draft-1',
      reason: "Le brouillon a été créé dans votre messagerie. Aucun message n'a été envoyé.",
    }))
  const router = { dispatch, observe: jest.fn() }
  const workspaceContext = {
    resolveActiveWorkspace: jest.fn(async (userId: string) => ({
      workspaceId: userId === STRANGER ? OTHER_WS : WS,
      role: options.role ?? 'owner',
    })),
    isDemoWorkspace: jest.fn(async () => false),
  }
  const runner = new WorkflowRunnerService(
    runs as never,
    approvals as never,
    workspaces as never,
    router as never,
    reservations,
    workspaceContext as never,
  )
  const cards = new CopilotCardService(
    runs as never,
    approvals as never,
    runner,
    reservations,
    accounts as never,
    contacts as never,
    undefined,
    profiles as never,
    options.activities as never,
    options.outreachMessages as never,
    options.delegations as never,
  )
  const propose = async (action: PendingChatAction, index = 0) => {
    const proposed = await cards.propose({
      principal: author,
      conversationId: 'conv-1',
      turnId: TURN,
      proposalIndex: index,
      action,
    })
    return proposed?.run.id as string
  }
  return { cards, runner, runs, approvals, dispatch, reservationRows, propose, profiles }
}

describe('CopilotCardService — proposer', () => {
  it('une carte de navigation n’est pas persistée', async () => {
    const { cards, runs } = harness()
    expect(
      await cards.propose({
        principal: author,
        conversationId: 'conv-1',
        turnId: TURN,
        proposalIndex: 0,
        action: { action: 'open_screen', route: '/pipeline', label: 'Pipeline' },
      }),
    ).toBeNull()
    expect(runs.rows).toHaveLength(0)
  })

  it('persiste la carte AVANT tout clic : `copilot_proposal`, clé `card:<tour>:<rang>`, proposition gardée', async () => {
    const { runs, propose } = harness()
    await propose(MAIL_DRAFT, 2)
    expect(runs.rows[0]).toMatchObject({
      trigger: 'copilot_proposal',
      status: 'planned',
      idempotency_key: `card:${TURN}:2`,
      conversation_id: 'conv-1',
      turn_id: TURN,
      proposal_index: 2,
      proposal: MAIL_DRAFT,
    })
  })

  it('un contact HORS de l’espace ne donne pas d’intent : carte « Suggérée », non confirmable', async () => {
    const { cards, propose } = harness()
    const runId = await propose({ ...ENRICH, contact_id: FOREIGN_CONTACT })
    const view = await cards.view(runId, author)
    expect(view.state).toBe('suggested')
    expect(view.allowedGestures).not.toContain('confirm')
    await expect(cards.confirm(runId, author)).rejects.toThrow(/ne se confirme plus|n’a rien d’exécutable/)
  })
})

describe('CopilotCardService — qui peut agir (la règle de `canDecide`, gardée)', () => {
  it('un coéquipier du même espace VOIT la carte mais ne la confirme pas', async () => {
    const { cards, propose, dispatch } = harness()
    const runId = await propose(MAIL_DRAFT)
    const teammate = { userId: TEAMMATE, email: 'mate@esn.fr' }
    expect((await cards.view(runId, teammate)).state).toBe('prepared')
    await expect(cards.confirm(runId, teammate)).rejects.toThrow(/Seul l'auteur/)
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('la carte exige le MÊME droit que la route qu’elle remplace : pas d’enrichissement sans `contacts:enrich`', async () => {
    // `POST contacts/:id/enrich` porte `@RequirePermission('contacts:enrich')` :
    // un rôle qui n'a pas ce droit ne l'obtient pas en passant par une carte.
    const { cards, propose, dispatch } = harness({ role: 'viewer' })
    const runId = await propose(ENRICH)
    await expect(cards.confirm(runId, author)).rejects.toThrow(/rôle/)
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('n’attrape pas ce qu’elle ne vise pas : le SERVICE n’exige rien là où la route remplacée n’exigeait rien (brouillon)', async () => {
    // La porte grossière `records:write` vit sur la ROUTE (contrôleur) ; ce test
    // ne mesure que la règle propre à l'effet, portée par le service.
    const { cards, propose, dispatch } = harness({ role: 'viewer' })
    const runId = await propose(MAIL_DRAFT)
    await cards.confirm(runId, author)
    expect(dispatch).toHaveBeenCalledTimes(1)
  })

  it('un autre espace ne la trouve même pas (jamais un run lu par son seul id)', async () => {
    const { cards, propose } = harness()
    const runId = await propose(MAIL_DRAFT)
    await expect(cards.view(runId, { userId: STRANGER, email: 'x@y.fr' })).rejects.toThrow(/introuvable/)
  })
})

describe('CopilotCardService — confirmer', () => {
  it('le clic EST la décision : approbation `approved` par l’auteur, origine `user`, clé `<run>:effect:1`', async () => {
    const { cards, approvals, dispatch, propose } = harness()
    const runId = await propose(MAIL_DRAFT)
    const view = await cards.confirm(runId, author)

    expect(view.state).toBe('executed')
    expect(approvals.rows).toEqual([expect.objectContaining({ state: 'approved', decided_by: AUTHOR, run_id: runId })])
    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(dispatch.mock.calls[0][0]).toMatchObject({ type: 'create_mail_draft', idempotencyKey: `${runId}:effect:1` })
    expect(dispatch.mock.calls[0][1]).toMatchObject({ userId: AUTHOR, origin: 'user' })
    expect(view.result?.outcome).toMatch(/Aucun message n'a été envoyé/)
  })

  // #2896 / #2449.35 — le niveau RÉGLÉ (lu par le contrôleur) accompagne le
  // clic jusqu'à la porte du routeur.
  it('le niveau d’action réglé part avec le clic jusqu’au routeur (#2449.35)', async () => {
    const { cards, dispatch, propose } = harness()
    const runId = await propose(MAIL_DRAFT)
    await cards.confirm(runId, { ...author, actionLevel: 'respond_only' })

    expect(dispatch.mock.calls[0][1]).toMatchObject({ userId: AUTHOR, origin: 'user', actionLevel: 'respond_only' })
  })

  it('sans niveau réglé, le clic ne porte AUCUN mandat — chemin inchangé', async () => {
    const { cards, dispatch, propose } = harness()
    const runId = await propose(MAIL_DRAFT)
    await cards.confirm(runId, author)

    expect(dispatch.mock.calls[0][1]).not.toHaveProperty('actionLevel')
  })

  it('le résultat NOMME qui a agi — l’auteur du run, jamais l’e-mail en repli (#1931.12)', async () => {
    const { cards, propose } = harness()
    const runId = await propose(MAIL_DRAFT)
    const view = await cards.confirm(runId, author)
    expect(view.result?.actorName).toBe('Camille Nguyen')
  })

  it('sans profil lisible, le résultat ne nomme personne — jamais l’e-mail à la place du nom', async () => {
    const { cards, propose, profiles } = harness()
    profiles.rows.length = 0
    const runId = await propose(MAIL_DRAFT)
    const view = await cards.confirm(runId, author)
    expect(view.result?.actorName).toBeNull()
  })

  /**
   * #1931.20 — LE RÉSULTAT REND AUSSI DANS ACTIONS ET LA TIMELINE.
   *
   * `settleResult` est le seul endroit qui écrit `result` pour la PREMIÈRE
   * fois (`refresh` ne le rappelle jamais une fois `run.result` posé) : c'est
   * donc le seul moment sûr pour ingérer une ligne d'historique, sans en
   * écrire une par lecture — `ExecutedActionsList` et `TimelinePanel` la
   * lisent tous deux depuis la MÊME table (`activities`, #2124.41).
   */
  it('confirmer une carte liée à un contact ingère une ligne dans l’historique', async () => {
    const ingest = jest.fn(async (..._args: unknown[]) => ({ ingested: 1, duplicates: 0 }))
    const { cards, propose } = harness({ activities: { ingest } })
    const runId = await propose(MESSAGE)
    await cards.confirm(runId, author)
    expect(ingest).toHaveBeenCalledTimes(1)
    expect(ingest.mock.calls[0]?.[0]).toBe(WS)
    expect(ingest.mock.calls[0]?.[2]).toEqual([
      expect.objectContaining({
        kind: 'workflow',
        source: 'system',
        direction: 'internal',
        contactId: CONTACT,
        accountId: null,
        externalId: `workflow:${runId}`,
      }),
    ])
  })

  it('un run sans compte ni contact n’ingère rien : nulle part où apparaître', async () => {
    const ingest = jest.fn()
    const { cards, propose } = harness({ activities: { ingest } })
    const runId = await propose(MAIL_DRAFT)
    await cards.confirm(runId, author)
    expect(ingest).not.toHaveBeenCalled()
  })

  it('une trace qui échoue à s’écrire ne bloque pas le règlement du résultat', async () => {
    const ingest = jest.fn(async () => {
      throw new Error('table indisponible')
    })
    const { cards, propose } = harness({ activities: { ingest } })
    const runId = await propose(MESSAGE)
    const view = await cards.confirm(runId, author)
    expect(view.state).toBe('executed')
  })

  it('deux clics, un effet : le second relit la carte déjà exécutée', async () => {
    const { cards, dispatch, propose } = harness()
    const runId = await propose(MAIL_DRAFT)
    await cards.confirm(runId, author)
    const second = await cards.confirm(runId, author)
    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(second.state).toBe('executed')
  })

  it('une carte EXPIRÉE (3 jours) ne se confirme pas', async () => {
    const { cards, runs, dispatch, propose } = harness()
    const runId = await propose(MAIL_DRAFT)
    const row = runs.rows[0] as WorkflowRunEntity
    row.created_at = new Date(Date.now() - APPROVAL_TTL_MS - 60_000)
    await expect(cards.confirm(runId, author)).rejects.toThrow(/expired/)
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('une carte que la dépense monte à `n3` attend un responsable — le clic de l’auteur ouvre une demande', async () => {
    const { cards, approvals, dispatch, propose } = harness({ spendThreshold: 1 })
    const runId = await propose(ENRICH)
    const view = await cards.confirm(runId, author)
    expect(view.state).toBe('awaiting_review')
    expect(approvals.rows).toEqual([
      expect.objectContaining({ state: 'pending', required_level: 'n3_manager_approval' }),
    ])
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('le brouillon GÉNÉRÉ par une carte « préparer un message » reste lisible dans son résultat', async () => {
    const dispatch = jest.fn(async () => ({
      type: 'generate_message',
      status: 'done',
      reason: "Brouillon généré — rien n'a été envoyé.",
      artifact: { kind: 'message_draft', channel: 'email', subject: 'Suite', body: 'Bonjour Claire, suite à…' },
    }))
    const { cards, propose } = harness({ dispatch })
    const runId = await propose(MESSAGE)
    const view = await cards.confirm(runId, author)
    expect(view.result?.content).toContain('Bonjour Claire, suite à…')
    // …et il SURVIT à la relecture (D1, un cran plus bas : sinon il disparaît au rechargement).
    expect((await cards.view(runId, author)).result?.content).toContain('Bonjour Claire, suite à…')
  })

  /**
   * #2366.2 — Laura ne garde jamais une SECONDE version du message : le
   * brouillon généré par `generate_message` devient AUSSI le message
   * canonique (`outreach_messages`, source `laura`), le MÊME objet que lit la
   * fiche Contact et le centre d'approbation Outreach (#2366.1).
   */
  it('un brouillon « préparer un message » devient AUSSI un message canonique, source laura', async () => {
    const dispatch = jest.fn(async () => ({
      type: 'generate_message',
      status: 'done',
      reason: "Brouillon généré — rien n'a été envoyé.",
      artifact: { kind: 'message_draft', channel: 'email', subject: 'Suite', body: 'Bonjour Claire, suite à…' },
    }))
    const create = jest.fn(async () => ({ id: 'outreach-msg-1' }))
    const { cards, propose } = harness({ dispatch, outreachMessages: { create } })
    const runId = await propose(MESSAGE)
    await cards.confirm(runId, author)

    expect(create).toHaveBeenCalledTimes(1)
    const [ctx, dto] = create.mock.calls[0] as unknown as [unknown, Record<string, unknown>]
    expect(ctx).toEqual(expect.objectContaining({ userId: AUTHOR, workspaceId: WS }))
    expect(dto).toEqual(
      expect.objectContaining({
        contact_id: CONTACT,
        channel: 'email',
        source: 'laura',
        subject: 'Suite',
        body: 'Bonjour Claire, suite à…',
      }),
    )
  })

  // #3234 (#3211.11) — l'angle du brouillon devient la RAISON du message
  // canonique : le champ que `fetch_recent_outreach_for_contact` (apps/ia)
  // relit pour refuser une relance identique sans angle nouveau (#3211.1).
  it('l’angle du brouillon devient la `reason` du message canonique', async () => {
    const dispatch = jest.fn(async () => ({
      type: 'generate_message',
      status: 'done',
      reason: "Brouillon généré — rien n'a été envoyé.",
      artifact: {
        kind: 'message_draft',
        channel: 'email',
        subject: 'Suite',
        body: 'Bonjour Claire, suite à…',
        angle: 'Suite POC',
      },
    }))
    const create = jest.fn(async () => ({ id: 'outreach-msg-1' }))
    const { cards, propose } = harness({ dispatch, outreachMessages: { create } })
    const runId = await propose(MESSAGE)
    await cards.confirm(runId, author)

    const [, dto] = create.mock.calls[0] as unknown as [unknown, Record<string, unknown>]
    expect(dto).toEqual(expect.objectContaining({ reason: 'Suite POC' }))
  })

  it('sans angle sur le brouillon, aucune `reason` inventée', async () => {
    const dispatch = jest.fn(async () => ({
      type: 'generate_message',
      status: 'done',
      reason: "Brouillon généré — rien n'a été envoyé.",
      artifact: {
        kind: 'message_draft',
        channel: 'email',
        subject: 'Suite',
        body: 'Bonjour Claire, suite à…',
        angle: null,
      },
    }))
    const create = jest.fn(async () => ({ id: 'outreach-msg-1' }))
    const { cards, propose } = harness({ dispatch, outreachMessages: { create } })
    const runId = await propose(MESSAGE)
    await cards.confirm(runId, author)

    const [, dto] = create.mock.calls[0] as unknown as [unknown, Record<string, unknown>]
    expect(dto['reason']).toBeUndefined()
  })

  /**
   * #2366.1 / #2366.2 — le résultat porte l'identifiant du message canonique
   * créé : c'est CE lien qui permet à la fiche Contact et au fil Laura de
   * relire le MÊME objet (jamais une seconde version figée dans le résultat
   * de la carte, qui ne bougerait plus après coup).
   */
  it('le résultat de la carte porte l’identifiant du message canonique créé — survit à la relecture', async () => {
    const dispatch = jest.fn(async () => ({
      type: 'generate_message',
      status: 'done',
      reason: "Brouillon généré — rien n'a été envoyé.",
      artifact: { kind: 'message_draft', channel: 'email', subject: 'Suite', body: 'Bonjour Claire, suite à…' },
    }))
    const create = jest.fn(async () => ({ id: 'outreach-msg-1' }))
    const { cards, propose } = harness({ dispatch, outreachMessages: { create } })
    const runId = await propose(MESSAGE)
    const confirmed = await cards.confirm(runId, author)
    expect(confirmed.result?.outreachMessageId).toBe('outreach-msg-1')
    // …et il SURVIT à la relecture, comme `content` juste au-dessus (D1).
    expect((await cards.view(runId, author)).result?.outreachMessageId).toBe('outreach-msg-1')
  })

  it('la création du message canonique ÉCHOUE sans bloquer le règlement de la carte (best-effort)', async () => {
    const dispatch = jest.fn(async () => ({
      type: 'generate_message',
      status: 'done',
      reason: "Brouillon généré — rien n'a été envoyé.",
      artifact: { kind: 'message_draft', channel: 'email', subject: 'Suite', body: 'Bonjour Claire, suite à…' },
    }))
    const create = jest.fn(async () => {
      throw new Error('outreach indisponible')
    })
    const { cards, propose } = harness({ dispatch, outreachMessages: { create } })
    const runId = await propose(MESSAGE)
    const view = await cards.confirm(runId, author)
    expect(view.state).toBe('executed')
    // best-effort échoué = pas de lien à relire, jamais un identifiant inventé.
    expect(view.result?.outreachMessageId).toBeUndefined()
  })

  /*
   * #4016 L5 (reprise 20/10) — Laura qui envoie, SOUS mandat seulement. Le
   * brouillon e-mail qu'elle vient de préparer est rattaché à la portée
   * `laura_send` (le service décide : seulement si un mandat est signé et
   * vivant). Rien ne part ici — c'est le dispatcher qui relit tout à l'envoi.
   */
  it('un brouillon e-mail de Laura est proposé au mandat `laura_send`, daté de sa préparation', async () => {
    const dispatch = jest.fn(async () => ({
      type: 'generate_message',
      status: 'done',
      reason: "Brouillon généré — rien n'a été envoyé.",
      artifact: { kind: 'message_draft', channel: 'email', subject: 'Suite', body: 'Bonjour Claire, suite à…' },
    }))
    const create = jest.fn(async () => ({ id: 'outreach-msg-1' }))
    const awaitIfMandated = jest.fn(async () => true)
    const { cards, propose } = harness({ dispatch, outreachMessages: { create }, delegations: { awaitIfMandated } })
    const runId = await propose(MESSAGE)
    await cards.confirm(runId, author)
    expect(awaitIfMandated).toHaveBeenCalledWith(WS, 'outreach-msg-1', 'laura_send', expect.any(Date))
  })

  it('un brouillon LinkedIn de Laura ne s’attache à aucun mandat — seul l’e-mail a un connecteur d’envoi', async () => {
    const dispatch = jest.fn(async () => ({
      type: 'generate_message',
      status: 'done',
      reason: "Brouillon généré — rien n'a été envoyé.",
      artifact: { kind: 'message_draft', channel: 'linkedin', subject: null, body: 'Bonjour Claire' },
    }))
    const create = jest.fn(async () => ({ id: 'outreach-msg-1' }))
    const awaitIfMandated = jest.fn(async () => true)
    const { cards, propose } = harness({ dispatch, outreachMessages: { create }, delegations: { awaitIfMandated } })
    const runId = await propose(MESSAGE)
    await cards.confirm(runId, author)
    expect(create).toHaveBeenCalledTimes(1)
    expect(awaitIfMandated).not.toHaveBeenCalled()
  })

  it('un brouillon de messagerie (`prepare_mail_draft`) ne crée AUCUN message canonique — canal différent', async () => {
    const create = jest.fn(async () => ({ id: 'outreach-msg-1' }))
    const { cards, propose } = harness({ outreachMessages: { create } })
    const runId = await propose(MAIL_DRAFT)
    await cards.confirm(runId, author)
    expect(create).not.toHaveBeenCalled()
  })
})

describe('CopilotCardService — refuser, reporter, modifier, annuler, réessayer', () => {
  it('refuser : approbation `rejected` + run `cancelled` — la carte reste visible', async () => {
    const { cards, approvals, propose, runs } = harness()
    const runId = await propose(MAIL_DRAFT)
    const view = await cards.reject(runId, author, 'Pas maintenant')
    expect(view.state).toBe('rejected')
    expect(runs.rows[0]?.status).toBe('cancelled')
    expect(approvals.rows).toEqual([
      expect.objectContaining({ state: 'rejected', decided_by: AUTHOR, reason: 'Pas maintenant' }),
    ])
  })

  it('reporter sans date : demain 9 h ; une date passée est refusée', async () => {
    const { cards, propose, runs } = harness()
    const runId = await propose(MAIL_DRAFT)
    const now = new Date('2026-09-13T15:00:00.000Z')
    const view = await cards.snooze(runId, author, undefined, now)
    expect(view.state).toBe('snoozed')
    expect(runs.rows[0]?.snoozed_until?.toISOString()).toBe(defaultSnoozeUntil(now).toISOString())
    await expect(cards.snooze(runId, author, '2026-09-01T09:00:00.000Z', now)).rejects.toThrow(/futur/)
  })

  // #2856 — « Réveiller » efface le report : même stockage (`snoozed_until`),
  // même geste (`snooze`), `until: null` au lieu d'une date.
  it('réveiller (`until: null`) efface le report : la carte redevient à valider', async () => {
    const { cards, propose, runs } = harness()
    const runId = await propose(MAIL_DRAFT)
    const now = new Date('2026-09-13T15:00:00.000Z')
    await cards.snooze(runId, author, undefined, now)
    expect(runs.rows[0]?.status).toBe('snoozed')

    const view = await cards.snooze(runId, author, null, now)

    expect(view.state).toBe('prepared')
    expect(view.snoozedUntil).toBeNull()
    expect(runs.rows[0]?.status).toBe('planned')
    expect(runs.rows[0]?.snoozed_until).toBeNull()
  })

  it('réveiller refuse hors espace : seul l’auteur de la carte la réveille', async () => {
    const { cards, propose } = harness()
    const runId = await propose(MAIL_DRAFT)
    await cards.snooze(runId, author, undefined, new Date('2026-09-13T15:00:00.000Z'))
    const teammate = { userId: TEAMMATE, email: 'mate@esn.fr' }

    await expect(cards.snooze(runId, teammate, null)).rejects.toThrow(/Seul l'auteur/)
  })

  it('une carte reportée dont la date est passée se confirme — 3 jours comptés depuis le report', async () => {
    const { cards, propose, runs, dispatch } = harness()
    const runId = await propose(MAIL_DRAFT)
    const row = runs.rows[0] as WorkflowRunEntity
    row.created_at = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000)
    row.status = 'snoozed'
    row.snoozed_until = new Date(Date.now() - 60_000)
    expect((await cards.view(runId, author)).state).toBe('prepared')
    await cards.confirm(runId, author)
    expect(dispatch).toHaveBeenCalledTimes(1)
  })

  it('modifier : la prévisualisation ET les intents sont recalculés et re-figés', async () => {
    const { cards, propose, runs } = harness()
    const runId = await propose(MAIL_DRAFT)
    await cards.modify(runId, author, { body: 'Bonjour Claire, voici le devis.' })
    expect(runs.rows[0]?.preview?.content).toBe('Bonjour Claire, voici le devis.')
    expect(runs.rows[0]?.intents?.['effect']).toMatchObject({ body: 'Bonjour Claire, voici le devis.' })
  })

  it('modifier : ni le TYPE d’une carte, ni une valeur invalide, ni une carte déjà partie', async () => {
    const { cards, propose } = harness()
    const runId = await propose(MAIL_DRAFT)
    await expect(cards.modify(runId, author, { action: 'enrich_contact' })).rejects.toThrow(/type/)
    await expect(cards.modify(runId, author, { to: '' })).rejects.toThrow()
    await cards.confirm(runId, author)
    await expect(cards.modify(runId, author, { body: 'Trop tard' })).rejects.toThrow(/modify/)
  })

  it('réessayer après un ÉCHEC : une nouvelle tentative, une clé neuve', async () => {
    const dispatch = jest
      .fn()
      .mockResolvedValueOnce({ type: 'create_mail_draft', status: 'failed', reason: 'Messagerie indisponible.' })
      .mockResolvedValueOnce({ type: 'create_mail_draft', status: 'done', externalRef: 'draft-2' })
    const { cards, propose } = harness({ dispatch })
    const runId = await propose(MAIL_DRAFT)
    expect((await cards.confirm(runId, author)).state).toBe('failed')
    const retried = await cards.retry(runId, author)
    expect(retried.state).toBe('executed')
    expect(dispatch.mock.calls[1][0]).toMatchObject({ idempotencyKey: `${runId}:effect:2` })
  })

  it('sait dire NON — réessayer un résultat INCONNU est refusé (un timeout n’est pas un échec)', async () => {
    const dispatch = jest.fn().mockResolvedValue({ type: 'create_mail_draft', status: 'unknown', reason: 'timeout' })
    const { cards, propose } = harness({ dispatch })
    const runId = await propose(MAIL_DRAFT)
    const view = await cards.confirm(runId, author)
    expect(view.state).toBe('unknown_outcome')
    expect(view.result?.creditsSpent).toBeNull()
    await expect(cards.retry(runId, author)).rejects.toThrow(/retry/)
    expect(dispatch).toHaveBeenCalledTimes(1)
  })

  /**
   * #2384.2 — LE CLIC MANUEL EST CAPPÉ À `DEFAULT_RETRY_POLICY.maxAttempts` (3).
   *
   * Le retry reste un geste manuel (#1943, aucune reprise automatique) : la
   * politique numérique (`retryPolicySchema`, `action-os.ts`) était posée sur
   * chaque définition de carte (`copilot-card-catalog.ts` : `retry:
   * DEFAULT_RETRY_POLICY`) mais jamais LUE — un échec pouvait se retenter à
   * l'infini. Reco appliquée (decisions §12, version conservatrice) : capper
   * le clic, pas automatiser la reprise (question du webhook bounce hors
   * périmètre, non tranchée ici).
   */
  it('sait dire NON — réessayer une 4ᵉ fois dépasse `maxAttempts` (3) et est refusé', async () => {
    const dispatch = jest
      .fn()
      .mockResolvedValue({ type: 'create_mail_draft', status: 'failed', reason: 'Messagerie indisponible.' })
    const { cards, propose } = harness({ dispatch })
    const runId = await propose(MAIL_DRAFT)
    expect((await cards.confirm(runId, author)).state).toBe('failed') // tentative 1
    expect((await cards.retry(runId, author)).state).toBe('failed') // tentative 2
    expect((await cards.retry(runId, author)).state).toBe('failed') // tentative 3 — DEFAULT_RETRY_POLICY.maxAttempts
    await expect(cards.retry(runId, author)).rejects.toThrow(/tentative/) // 4ᵉ — refusée AVANT tout dispatch
    expect(dispatch).toHaveBeenCalledTimes(3)
  })

  it('annuler : l’auteur retire une carte qui attend un responsable ; la demande devient refusée', async () => {
    const { cards, approvals, propose } = harness({ spendThreshold: 1 })
    const runId = await propose(ENRICH)
    await cards.confirm(runId, author)
    const view = await cards.cancel(runId, author, 'Je retire')
    expect(view.state).toBe('rejected')
    expect(approvals.rows[0]).toMatchObject({ state: 'rejected', decided_by: AUTHOR })
  })

  it('annuler une carte simplement préparée est refusé — c’est « refuser »', async () => {
    const { cards, propose } = harness()
    const runId = await propose(MAIL_DRAFT)
    await expect(cards.cancel(runId, author)).rejects.toThrow(/cancel/)
  })

  it('obsolète : un fait plus récent la rend sans objet, sans acteur nommé — personne n’a agi (#1931.12)', async () => {
    const { cards, propose } = harness()
    const runId = await propose(MAIL_DRAFT)
    const view = await cards.supersede(runId, author, 'Le contact a déjà été enrichi.')
    expect(view.state).toBe('superseded')
    expect(view.result?.actorName).toBeNull()
  })
})

describe('CopilotCardService — une carte `n3` tranchée par un responsable', () => {
  it('exécutée par `POST action-os/approvals/:id` (D2), elle porte son résultat à la relecture', async () => {
    const { cards, propose, runner, approvals, dispatch } = harness({ spendThreshold: 1 })
    const runId = await propose(ENRICH)
    await cards.confirm(runId, author)
    const pending = approvals.rows.find(row => row.state === 'pending') as ApprovalRequestEntity
    // Un responsable (ici `owner`) qui n'est pas le demandeur tranche.
    await runner.decideApprovalRequest({
      approvalId: pending.id,
      principal: { userId: TEAMMATE, email: 'lead@esn.fr' },
      decision: 'approve',
    })
    expect(dispatch).toHaveBeenCalledTimes(1)
    const view = await cards.view(runId, author)
    expect(view.state).toBe('executed')
    expect(view.result).not.toBeNull()
  })
})

describe('CopilotCardService — R9 : le brouillon d’un coéquipier reste masqué avant validation', () => {
  const teammate = { userId: TEAMMATE, email: 'mate@esn.fr' }
  const MASKED_TO = '[destinataire masqué]'
  const MASKED_SUBJECT = '[objet masqué]'
  const MASKED_BODY = '[brouillon masqué — visible une fois validé]'

  /** Les trois données que R9 vise, telles qu'elles voyagent dans la vue. */
  const leaked = (view: Awaited<ReturnType<CopilotCardService['view']>>) => ({
    to: view.action?.action === 'prepare_mail_draft' ? view.action.to : null,
    subject: view.action?.action === 'prepare_mail_draft' ? view.action.subject : null,
    body: view.action?.action === 'prepare_mail_draft' ? view.action.body : null,
    previewTarget: view.preview?.targetObject ?? null,
    previewDestination: view.preview?.destination ?? null,
    previewContent: view.preview?.content ?? null,
  })

  it('l’AUTEUR lit son propre brouillon en clair (`prepared`), par `view` comme par `list`', async () => {
    const { cards, propose } = harness()
    const runId = await propose(MAIL_DRAFT)
    const view = await cards.view(runId, author)
    expect(view.state).toBe('prepared')
    expect(leaked(view)).toEqual({
      to: 'claire@acme.example',
      subject: 'Suite',
      body: 'Bonjour Claire,',
      previewTarget: 'Suite',
      previewDestination: 'claire@acme.example',
      previewContent: 'Bonjour Claire,',
    })
    const listed = (await cards.list(author, {})).find(card => card.id === runId)
    expect(leaked(listed as never).to).toBe('claire@acme.example')
  })

  it('un COÉQUIPIER ne voit ni le destinataire, ni l’objet, ni le corps — `view` ET `list`', async () => {
    const { cards, propose } = harness()
    const runId = await propose(MAIL_DRAFT)
    const masked = {
      to: MASKED_TO,
      subject: MASKED_SUBJECT,
      body: MASKED_BODY,
      previewTarget: MASKED_SUBJECT,
      previewDestination: MASKED_TO,
      previewContent: MASKED_BODY,
    }
    expect(leaked(await cards.view(runId, teammate))).toEqual(masked)
    const listed = (await cards.list(teammate, {})).find(card => card.id === runId)
    expect(leaked(listed as never)).toEqual(masked)
    // Ce qui n'est PAS une donnée personnelle reste lisible : l'état, les crédits, le fil.
    const view = await cards.view(runId, teammate)
    expect(view.state).toBe('prepared')
    expect(view.conversationId).toBe('conv-1')
  })

  it('une fois VALIDÉE (`confirm` → `running`/`executed`), le coéquipier lit le brouillon en clair', async () => {
    const { cards, propose } = harness()
    const runId = await propose(MAIL_DRAFT)
    await cards.confirm(runId, author)
    const view = await cards.view(runId, teammate)
    expect(view.state).toBe('executed')
    expect(leaked(view)).toEqual({
      to: 'claire@acme.example',
      subject: 'Suite',
      body: 'Bonjour Claire,',
      previewTarget: 'Suite',
      previewDestination: 'claire@acme.example',
      previewContent: 'Bonjour Claire,',
    })
  })

  it('refusée ou reportée — jamais validée, donc toujours masquée, RÉSULTAT compris', async () => {
    const { cards, propose } = harness()
    const rejected = await propose(MAIL_DRAFT, 0)
    await cards.reject(rejected, author, 'Pas maintenant')
    const rejectedView = await cards.view(rejected, teammate)
    expect(rejectedView.state).toBe('rejected')
    expect(leaked(rejectedView).to).toBe(MASKED_TO)
    // `reject` écrit un résultat (`settleResult`) qui RECOPIE le destinataire.
    expect(rejectedView.result?.targetObject).toBe(MASKED_SUBJECT)
    expect(rejectedView.result?.destination).toBe(MASKED_TO)

    const snoozed = await propose({ ...MAIL_DRAFT, subject: 'Autre' }, 1)
    await cards.snooze(snoozed, author)
    const snoozedView = await cards.view(snoozed, teammate)
    expect(snoozedView.state).toBe('snoozed')
    expect(leaked(snoozedView).body).toBe(MASKED_BODY)
  })

  it('le contenu produit (`result.content`) est masqué lui aussi tant que rien n’est validé', async () => {
    const { cards, propose, runs } = harness()
    const runId = await propose(MAIL_DRAFT)
    const row = runs.rows[0] as WorkflowRunEntity
    row.status = 'cancelled'
    row.result = {
      outcome: 'Carte refusée.',
      occurredAt: null,
      actorName: null,
      targetObject: 'claire@acme.example',
      destination: 'claire@acme.example',
      connectionUsed: null,
      externalRef: null,
      creditsSpent: null,
      nextStep: null,
      content: 'Suite\n\nBonjour Claire,',
    }
    expect((await cards.view(runId, teammate)).result?.content).toBe(MASKED_BODY)
    expect((await cards.view(runId, author)).result?.content).toBe('Suite\n\nBonjour Claire,')
  })

  it('n’attrape pas ce qu’elle ne vise pas : une carte d’un AUTRE type reste en clair pour tout l’espace', async () => {
    const { cards, propose } = harness()
    const enrich = await propose(ENRICH, 0)
    const message = await propose(MESSAGE, 1)
    const enrichView = await cards.view(enrich, teammate)
    expect(enrichView.action).toEqual(ENRICH)
    expect(enrichView.preview?.targetObject).not.toBe(MASKED_TO)
    const messageView = await cards.view(message, teammate)
    expect(messageView.action).toEqual(MESSAGE)
    expect(messageView.preview?.targetObject).not.toBe(MASKED_TO)
    // ... et une fois refusée non plus (l'état ne change rien pour un autre type).
    await cards.reject(enrich, author)
    expect((await cards.view(enrich, teammate)).action).toEqual(ENRICH)
  })

  it('la même règle sur la relecture d’un FIL (`listForThread`), qui est la même lecture d’espace', async () => {
    const { cards, propose } = harness()
    const runId = await propose(MAIL_DRAFT)
    const mine = await cards.listForThread(author, { conversationId: 'conv-1', turnIds: [] })
    expect(leaked(mine[0] as never).to).toBe('claire@acme.example')
    const theirs = await cards.listForThread(teammate, { conversationId: 'conv-1', turnIds: [] })
    expect(theirs.map(card => card.id)).toEqual([runId])
    expect(leaked(theirs[0] as never).to).toBe(MASKED_TO)
  })
})

describe('CopilotCardService — les lectures de l’écran Actions', () => {
  it('filtre sur l’ÉTAT calculé : « en cours » ne montre pas une simple proposition', async () => {
    const { cards, propose } = harness()
    const proposed = await propose(MAIL_DRAFT, 0)
    const launched = await propose({ ...MAIL_DRAFT, subject: 'Autre' }, 1)
    await cards.confirm(launched, author)
    const current = await cards.list(author, { states: ['running', 'executed', 'awaiting_review'] })
    expect(current.map(card => card.id)).toEqual([launched])
    const thread = await cards.list(author, { conversationId: 'conv-1' })
    expect(thread.map(card => card.id).sort()).toEqual([proposed, launched].sort())
  })
})

/**
 * #1955.22 — « les actions confirmées pendant le fil », pour l'export.
 *
 * Réutilise `DRAFT_VALIDATED_STATES` (`running`/`executed`/`partial`/`failed`/
 * `unknown_outcome`) — le MÊME ensemble déjà tenu par la règle R9 pour dire
 * « l'auteur a cliqué » : deux dérivations de « confirmée » divergeraient.
 */
describe('CopilotCardService — confirmedForThread (#1955.22, export d’un fil)', () => {
  it('rend une carte CONFIRMÉE, avec son aperçu et son résultat', async () => {
    const { cards, propose } = harness()
    const runId = await propose(MAIL_DRAFT)
    await cards.confirm(runId, author)
    const confirmed = await cards.confirmedForThread(author, 'conv-1')
    expect(confirmed.map(card => card.id)).toEqual([runId])
    expect(confirmed[0]?.preview?.whatWillHappen).toBeTruthy()
    expect(confirmed[0]?.result?.outcome).toMatch(/Aucun message n'a été envoyé/)
  })

  it('sait dire NON : une carte SUGGÉRÉE (jamais cliquée) n’est pas « confirmée »', async () => {
    const { cards, propose } = harness()
    await propose(MAIL_DRAFT)
    expect(await cards.confirmedForThread(author, 'conv-1')).toEqual([])
  })

  it('sans fil désigné, rien ne sort — jamais « toutes les cartes de l’espace »', async () => {
    const { cards } = harness()
    expect(await cards.confirmedForThread(author, null)).toEqual([])
  })
})
