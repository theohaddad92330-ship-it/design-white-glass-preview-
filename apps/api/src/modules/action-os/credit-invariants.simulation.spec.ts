import { creditCostOf, type ActionIntent, type PendingChatAction } from '@bellum/contracts'
import { failure, success } from '@bellum/utils'
import type { Job } from 'bullmq'
import type { ApprovalRequestEntity } from '../../database/entities/approval-request.entity'
import type { CreditReservationEntity } from '../../database/entities/credit-reservation.entity'
import type { WorkflowRunEntity } from '../../database/entities/workflow-run.entity'
import type { WorkspaceEntity } from '../../database/entities/workspace.entity'
import { createMockRepository } from '../../database/test-utils'
import { ActionRouterService } from '../action-router/action-router.service'
import { enrichmentJobsPortFrom } from '../action-router/card-effect-ports'
import type { ContactEnrichmentJobData, ContactEnrichmentJobResult } from '../contacts/contact-enrichment.queue'
import { ContactEnrichmentWorker } from '../contacts/contact-enrichment.worker'
import { liveReservedTotal, spendableCredits } from '../credits/credit-reservation.rules'
import { trackConversationAnalysisLaunch } from '../copilot-bridge/analysis-launch-tracking'
import { analysisLaunchObserverFrom } from './analysis-launch.port'
import { CopilotCardService } from './copilot-card.service'
import { CreditReservationService } from './credit-reservation.service'
import { inMemoryRepository } from './testing/in-memory-repository'
import { WorkflowRunnerService } from './workflow-runner.service'

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * ARRÊT OBLIGATOIRE FACTURATION — la simulation des soldes, écrite AVANT le code
 * ─────────────────────────────────────────────────────────────────────────────
 * #1931 L2. Chaque chemin qui réserve, débite ou rembourse est rejoué ici contre
 * un monde de facturation qui TIENT ses comptes :
 *
 *  - le pool (ce que le ledger a réellement débité) ;
 *  - la table `credit_reservations`, en mémoire, avec sa contrainte d'unicité ;
 *  - le solde AFFICHÉ, calculé par les MÊMES fonctions que `CreditsService.getCredits`
 *    (`liveReservedTotal`, `spendableCredits`) — jamais recopiées.
 *
 * Les sept invariants (plan lot 4) :
 *  I1 prix = grille (`creditCostOf`), aucun littéral — les attendus ci-dessous
 *     sont écrits `INITIAL - ENRICH_COST`, jamais `9` ;
 *  I2 Action OS ne débite jamais lui-même — seul le « ledger » du monde bouge,
 *     et seulement depuis les faux services métier (contacts, analyse) ;
 *  I3 jamais réservation + débit pour la même action — à chaque point
 *     d'observation, le solde ne compte jamais deux fois le même crédit ;
 *  I4 « dépensé » = débit OBSERVÉ ;
 *  I5 reprise avec la même clé = aucun second effet ;
 *  I6 démo : zéro réservation, zéro débit (et zéro écriture externe) ;
 *  I7 message, Arrêter, Réessayer = 0 crédit.
 *
 * Décisions de Louis (12/09) tenues ici : enrichissement depuis une carte =
 * RÉSERVER au clic (−1 pendant la recherche, débit si trouvé, libération sinon) ;
 * analyse depuis la conversation = suivi seul, facturation inchangée (8 débités
 * au lancement, remboursés sur échec terminal, AUCUNE réservation).
 */

const INITIAL = 10
const ENRICH_COST = creditCostOf('contact_enrichment')
const ANALYSIS_COST = creditCostOf('account_analysis')

const USER = '9d359267-0000-4000-8000-000000000001'
const WS = '7a0c2f10-0000-4000-8000-000000000002'
const CONTACT = '11111111-1111-4111-8111-111111111111'
const ACCOUNT = '22222222-2222-4222-8222-222222222222'
const TURN = '33333333-3333-4333-8333-333333333333'
const PRINCIPAL = { userId: USER, email: 'rep@esn.fr' }

const ENRICH: PendingChatAction = {
  action: 'enrich_contact',
  contact_id: CONTACT,
  contact_name: 'Claire Dubois',
  organization_name: 'ACME',
}
const EXPORT_TO_CRM: PendingChatAction = {
  action: 'export_contact_to_crm',
  contact_id: CONTACT,
  provider: 'hubspot',
  contact_name: 'Claire Dubois',
}
const MAIL_DRAFT: PendingChatAction = {
  action: 'prepare_mail_draft',
  to: 'claire@acme.example',
  subject: 'Suite à notre échange',
  body: 'Bonjour Claire,',
}
const PIN: PendingChatAction = { action: 'pin_memory_fact', fact: 'Facturation à 45 jours' }

type Scenario = {
  demo?: boolean
  enrichment?: 'found' | 'not_found' | 'provider_down'
  enqueueFault?: 'timeout_after_add'
  /** Seuil de dépense de l'espace — assez bas, une carte payante attend un responsable. */
  spendThreshold?: number
}

function billingWorld(scenario: Scenario = {}) {
  let remaining = INITIAL
  const ledger: { delta: number; kind: string }[] = []
  const debit = (amount: number, kind: string): void => {
    remaining -= amount
    ledger.push({ delta: -amount, kind })
  }
  const refund = (amount: number, kind: string): void => {
    remaining += amount
    ledger.push({ delta: amount, kind })
  }

  const reservationRows = inMemoryRepository<CreditReservationEntity>({
    unique: {
      name: 'credit_reservations_live_reference_idx',
      clash: (rows, candidate) =>
        candidate.state === 'reserved' &&
        rows.some(row => row.state === 'reserved' && row.reference === candidate.reference),
    },
  })
  const reservations = new CreditReservationService(reservationRows as never)

  const state = { enrichment: scenario.enrichment ?? 'found', enqueueFault: scenario.enqueueFault }

  // ── Le module contacts, réduit à ce qui débite (le VRAI worker tourne dessus) ──
  const contacts = {
    findOwnedForAction: jest.fn(async () =>
      success({ id: CONTACT, account_id: null, full_name: 'Claire Dubois', entity: 'ACME', email: null }),
    ),
    enrichContact: jest.fn(async () => {
      if (scenario.demo) return success({ id: CONTACT, credits_remaining: 0, credits_debited: 0 })
      if (state.enrichment === 'provider_down') {
        return failure({ code: 'enrichment_unavailable', message: 'Fournisseur indisponible.' })
      }
      if (state.enrichment === 'not_found') return success({ id: CONTACT, credits_remaining: 0, credits_debited: 0 })
      debit(ENRICH_COST, 'consume_enrichment')
      return success({ id: CONTACT, credits_remaining: remaining, credits_debited: ENRICH_COST })
    }),
    sendEmail: jest.fn(),
  }
  const worker = new ContactEnrichmentWorker(contacts as never, reservations)

  // ── La file BullMQ, en mémoire : un job par contact, comme `contactEnrichmentJobId` ──
  const jobs = new Map<
    string,
    { data: ContactEnrichmentJobData; state: 'queued' | 'completed'; returnvalue?: ContactEnrichmentJobResult }
  >()
  const enrichmentSource = {
    async enqueueWithReservation(
      contactId: string,
      userId: string,
      dto: { first_name: string; last_name?: string; organization_name: string },
      opts: { reservationReference?: string; reservationWorkspaceId?: string },
    ) {
      const jobId = `enrich-${contactId}`
      const existing = jobs.get(jobId)
      if (existing?.state === 'queued') return success({ job_id: jobId, state: 'queued', reservation_attached: false })
      jobs.set(jobId, {
        data: {
          contactId,
          userId,
          ...dto,
          // R4 — comme le vrai service : la référence n'est attachée qu'avec SON espace.
          ...(opts.reservationReference && opts.reservationWorkspaceId
            ? { reservationReference: opts.reservationReference, reservationWorkspaceId: opts.reservationWorkspaceId }
            : {}),
        },
        state: 'queued',
      })
      if (state.enqueueFault === 'timeout_after_add') {
        // La requête est PARTIE (le job existe) et la réponse s'est perdue.
        throw Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' })
      }
      return success({
        job_id: jobId,
        state: 'queued',
        reservation_attached: Boolean(opts.reservationReference && opts.reservationWorkspaceId),
      })
    },
    async status(contactId: string) {
      const jobId = `enrich-${contactId}`
      const job = jobs.get(jobId)
      if (!job) return success({ state: 'unknown', job_id: jobId })
      if (job.state === 'queued') return success({ state: 'queued', job_id: jobId })
      if (job.returnvalue?.ok) return success({ state: 'done', job_id: jobId, result: job.returnvalue.contact })
      return failure(job.returnvalue?.failure ?? { code: 'enrichment_unavailable', message: 'x' })
    },
  }
  const runJobs = async (): Promise<void> => {
    for (const job of jobs.values()) {
      if (job.state !== 'queued') continue
      job.returnvalue = await worker.process({ data: job.data } as Job<ContactEnrichmentJobData>)
      job.state = 'completed'
    }
  }

  // ── Le routeur RÉEL, ses portes externes espionnées ──
  const attempts: { key: string; status: string | null; reason: string | null; external_ref: string | null }[] = []
  const accounts = createMockRepository()
  accounts.query.mockImplementation(async (sql: string, params: unknown[] = []) => {
    const key = params[1] as string
    if (sql.includes('INSERT INTO action_dispatch_attempts')) {
      if (attempts.some(a => a.key === key)) throw Object.assign(new Error('duplicate'), { code: '23505' })
      attempts.push({ key, status: null, reason: null, external_ref: null })
      return []
    }
    if (sql.includes('UPDATE action_dispatch_attempts')) {
      const row = attempts.find(a => a.key === key)
      if (row) Object.assign(row, { status: params[2], reason: params[3], external_ref: params[4] })
      return []
    }
    const row = attempts.find(a => a.key === key)
    return row ? [{ status: row.status, reason: row.reason, external_ref: row.external_ref }] : []
  })
  const crm = {
    getStatus: jest.fn().mockResolvedValue({ configured: true, connected: true }),
    exportContact: jest.fn().mockResolvedValue({ id: 'hs-1', created: true }),
    logActivity: jest.fn(),
    findPresence: jest.fn(),
  }
  const workspaceContext = {
    resolveActiveWorkspace: jest.fn(async () => ({ workspaceId: WS, role: 'owner' })),
    isDemoWorkspace: jest.fn(async () => Boolean(scenario.demo)),
    // #2081.14 — la porte du routeur lit la règle d'espace sur l'export CRM ;
    // un propriétaire n'est jamais visé par elle.
    workspaceRuleRefusing: jest.fn(async () => null),
  }
  const userActions = inMemoryRepository<{ id?: string }>()
  const router = new ActionRouterService(
    contacts as never,
    crm as never,
    workspaceContext as never,
    userActions as never,
    accounts as never,
    [],
    null,
    { enrichmentJobs: enrichmentJobsPortFrom(enrichmentSource) },
  )

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
    is_demo: Boolean(scenario.demo),
    approval_default_level: null,
    approval_bulk_threshold: null,
    approval_spend_threshold: scenario.spendThreshold ?? null,
  } as unknown as WorkspaceEntity)

  const runner = new WorkflowRunnerService(
    runs as never,
    approvals as never,
    workspaces as never,
    router,
    reservations,
    workspaceContext as never,
  )
  // La cible d'une carte est vérifiée contre l'espace AVANT d'être persistée.
  const accountRows = inMemoryRepository<{ id: string; workspace_id: string; company_name: string }>()
  accountRows.rows.push({ id: ACCOUNT, workspace_id: WS, company_name: 'ACME' })
  const contactRows = inMemoryRepository<{ id: string; workspace_id: string }>()
  contactRows.rows.push({ id: CONTACT, workspace_id: WS })
  const cards = new CopilotCardService(
    runs as never,
    approvals as never,
    runner,
    reservations,
    accountRows as never,
    contactRows as never,
  )

  return {
    cards,
    runner,
    runs,
    approvals,
    crm,
    contacts,
    jobs,
    state,
    runJobs,
    reservationRows,
    /** Ce que `GET /credits` afficherait (même dérivation que `CreditsService.getCredits`). */
    displayed: (at = new Date()): number => spendableCredits(remaining, liveReservedTotal(reservationRows.rows, at)),
    /** Ce que le ledger a RÉELLEMENT débité, remboursements déduits. */
    // Soustraire depuis 0 (et non nier une somme) : `-0` n'est pas `0` pour `toBe`.
    debited: (): number => ledger.reduce((sum, line) => sum - line.delta, 0),
    liveReservations: (): number => reservationRows.rows.filter(row => row.state === 'reserved').length,
    /** Le vrai `AnalysisService.start` débite au lancement — simulé ici, hors Action OS. */
    billAnalysisLaunch: (): number => {
      debit(ANALYSIS_COST, 'consume_analysis')
      return ANALYSIS_COST
    },
    /** Le vrai worker d'analyse rembourse sur échec terminal. */
    refundAnalysis: (): number => {
      refund(ANALYSIS_COST, 'refund_analysis')
      return ANALYSIS_COST
    },
  }
}

async function proposeCard(world: ReturnType<typeof billingWorld>, action: PendingChatAction, index = 0) {
  const proposed = await world.cards.propose({
    principal: PRINCIPAL,
    conversationId: 'conv-1',
    turnId: TURN,
    proposalIndex: index,
    action,
  })
  if (!proposed) throw new Error('la carte aurait dû être persistée')
  return proposed.run.id
}

describe('Simulation — enrichissement depuis une carte (réservé au clic)', () => {
  it('TROUVÉ : avant 10, pendant 10−coût (réservé, 0 débité), après 10−coût (débité, réservation consommée)', async () => {
    const world = billingWorld({ enrichment: 'found' })
    const runId = await proposeCard(world, ENRICH)
    expect(world.displayed()).toBe(INITIAL) // avant — proposer ne coûte rien (I7)

    const launched = await world.cards.confirm(runId, PRINCIPAL)
    expect(launched.state).toBe('running') // D6 — un pas en file est « en cours », jamais « partiel »
    expect(world.displayed()).toBe(INITIAL - ENRICH_COST) // pendant — réservé au clic
    expect(world.debited()).toBe(0)
    expect(world.liveReservations()).toBe(1)

    await world.runJobs()
    // après — le worker a débité ET soldé : le crédit n'est compté qu'UNE fois (I3)
    expect(world.displayed()).toBe(INITIAL - ENRICH_COST)
    expect(world.debited()).toBe(ENRICH_COST)
    expect(world.liveReservations()).toBe(0)

    const settled = await world.cards.view(runId, PRINCIPAL)
    expect(settled.state).toBe('executed')
    expect(settled.spentCredits).toBe(ENRICH_COST) // I4 — observé
    expect(settled.result?.creditsSpent).toBe(ENRICH_COST)
  })

  it('NON TROUVÉ : pendant 10−coût, après 10 — libéré, 0 débité, « dépensé » 0 et non l’estimation (D3)', async () => {
    const world = billingWorld({ enrichment: 'not_found' })
    const runId = await proposeCard(world, ENRICH)
    await world.cards.confirm(runId, PRINCIPAL)
    expect(world.displayed()).toBe(INITIAL - ENRICH_COST)

    await world.runJobs()
    expect(world.displayed()).toBe(INITIAL)
    expect(world.debited()).toBe(0)
    expect(world.liveReservations()).toBe(0)

    const settled = await world.cards.view(runId, PRINCIPAL)
    expect(settled.state).toBe('executed')
    expect(settled.spentCredits).toBe(0)
    expect(settled.result?.creditsSpent).toBe(0)
  })

  it('TIMEOUT `unknown` (la requête est partie, la réponse perdue) : aucun « Réessayer », la réservation reste jusqu’au solde du worker', async () => {
    const world = billingWorld({ enrichment: 'found', enqueueFault: 'timeout_after_add' })
    const runId = await proposeCard(world, ENRICH)
    const launched = await world.cards.confirm(runId, PRINCIPAL)
    expect(launched.state).toBe('unknown_outcome')
    expect(launched.allowedGestures).toEqual([]) // un timeout n'est pas un échec
    expect(world.displayed()).toBe(INITIAL - ENRICH_COST) // pendant — prudence : le job existe peut-être
    expect(launched.result?.creditsSpent ?? null).toBeNull() // non mesuré ≠ 0

    await world.runJobs() // le job existait bien
    expect(world.displayed()).toBe(INITIAL - ENRICH_COST)
    expect(world.debited()).toBe(ENRICH_COST)
    expect(world.liveReservations()).toBe(0)
    expect((await world.cards.view(runId, PRINCIPAL)).state).toBe('unknown_outcome') // jamais résolu tout seul
  })

  it('TIMEOUT `unknown` et job PERDU : la réservation se libère d’office à son expiration (30 min), jamais gelée', async () => {
    const world = billingWorld({ enrichment: 'found', enqueueFault: 'timeout_after_add' })
    const runId = await proposeCard(world, ENRICH)
    await world.cards.confirm(runId, PRINCIPAL)
    world.jobs.clear()
    expect(world.displayed()).toBe(INITIAL - ENRICH_COST)
    expect(world.displayed(new Date(Date.now() + 31 * 60_000))).toBe(INITIAL)
    expect(world.debited()).toBe(0)
  })

  it('REPRISE avec la même clé (double clic, deux onglets) : une réservation, un job, un débit (I5)', async () => {
    const world = billingWorld({ enrichment: 'found' })
    const runId = await proposeCard(world, ENRICH)
    const [first, second] = await Promise.all([
      world.cards.confirm(runId, PRINCIPAL),
      world.cards.confirm(runId, PRINCIPAL),
    ])
    expect([first.state, second.state]).toEqual(['running', 'running'])
    await world.cards.confirm(runId, PRINCIPAL) // et un troisième, plus tard
    expect(world.reservationRows.rows).toHaveLength(1)
    expect(world.jobs.size).toBe(1)
    expect(world.displayed()).toBe(INITIAL - ENRICH_COST)

    await world.runJobs()
    expect(world.debited()).toBe(ENRICH_COST)
    expect(world.displayed()).toBe(INITIAL - ENRICH_COST)
    // Re-proposer le même tour ne crée pas une seconde carte non plus.
    const again = await world.cards.propose({
      principal: PRINCIPAL,
      conversationId: 'conv-1',
      turnId: TURN,
      proposalIndex: 0,
      action: ENRICH,
    })
    expect(again?.reused).toBe(true)
    expect(world.runs.rows).toHaveLength(1)
  })

  it('DÉMO : zéro réservation, zéro débit, et aucune écriture vers un outil externe (I6)', async () => {
    const world = billingWorld({ demo: true })
    const enrichId = await proposeCard(world, ENRICH, 0)
    await world.cards.confirm(enrichId, PRINCIPAL)
    await world.runJobs()
    expect(world.reservationRows.rows).toHaveLength(0)
    expect(world.debited()).toBe(0)
    expect(world.displayed()).toBe(INITIAL)

    const exportId = await proposeCard(world, EXPORT_TO_CRM, 1)
    await world.cards.confirm(exportId, PRINCIPAL)
    expect(world.crm.exportContact).not.toHaveBeenCalled()
    expect(world.reservationRows.rows).toHaveLength(0)
  })
})

describe('Simulation — analyse lancée depuis la conversation (suivi seul, facturation inchangée)', () => {
  it('SUCCÈS : avant 10, pendant 10−8 (débité AU LANCEMENT par l’analyse), après 10−8 — aucune réservation (I3)', async () => {
    const world = billingWorld()
    expect(world.displayed()).toBe(INITIAL)
    const tracked = await world.cards.trackAnalysisLaunch({
      principal: PRINCIPAL,
      conversationId: 'conv-1',
      turnId: TURN,
      proposalIndex: 0,
      accountId: ACCOUNT,
      jobId: 'analysis-job-1',
      debitObserved: world.billAnalysisLaunch(),
    })
    expect(tracked.state).toBe('running')
    expect(world.displayed()).toBe(INITIAL - ANALYSIS_COST)
    expect(world.reservationRows.rows).toHaveLength(0)

    const done = await world.cards.recordAnalysisOutcome({
      principal: PRINCIPAL,
      runId: tracked.id,
      outcome: 'done',
      refundObserved: 0,
    })
    expect(done.state).toBe('executed')
    expect(done.spentCredits).toBe(ANALYSIS_COST)
    expect(world.displayed()).toBe(INITIAL - ANALYSIS_COST)
    expect(world.reservationRows.rows).toHaveLength(0)
  })

  it('ÉCHEC TERMINAL : débité 8 au lancement, remboursé 8 par l’analyse — après 10, « dépensé » 0', async () => {
    const world = billingWorld()
    const tracked = await world.cards.trackAnalysisLaunch({
      principal: PRINCIPAL,
      conversationId: 'conv-1',
      turnId: TURN,
      proposalIndex: 0,
      accountId: ACCOUNT,
      jobId: 'analysis-job-1',
      debitObserved: world.billAnalysisLaunch(),
    })
    expect(world.displayed()).toBe(INITIAL - ANALYSIS_COST)

    const failed = await world.cards.recordAnalysisOutcome({
      principal: PRINCIPAL,
      runId: tracked.id,
      outcome: 'failed',
      refundObserved: world.refundAnalysis(),
    })
    expect(failed.state).toBe('failed')
    expect(failed.spentCredits).toBe(0)
    expect(world.displayed()).toBe(INITIAL)
    expect(world.debited()).toBe(0)
    expect(world.reservationRows.rows).toHaveLength(0)
  })
})

describe('Simulation — message, Arrêter, Réessayer = 0 crédit (I7)', () => {
  it('PROPOSER des cartes (le message de Laura) ne réserve ni ne débite rien', async () => {
    const world = billingWorld()
    await proposeCard(world, ENRICH, 0)
    await proposeCard(world, MAIL_DRAFT, 1)
    await proposeCard(world, PIN, 2)
    expect(world.reservationRows.rows).toHaveLength(0)
    expect(world.debited()).toBe(0)
    expect(world.displayed()).toBe(INITIAL)
  })

  it('ARRÊTER — refuser une carte préparée : 0 réservation, 0 débit', async () => {
    const world = billingWorld()
    const runId = await proposeCard(world, ENRICH)
    const rejected = await world.cards.reject(runId, PRINCIPAL, 'Pas maintenant')
    expect(rejected.state).toBe('rejected')
    expect(world.reservationRows.rows).toHaveLength(0)
    expect(world.displayed()).toBe(INITIAL)
  })

  it('ARRÊTER — annuler une carte qui attend un responsable : rien n’a été réservé, rien ne l’est', async () => {
    const world = billingWorld({ spendThreshold: ENRICH_COST })
    const runId = await proposeCard(world, ENRICH)
    const waiting = await world.cards.confirm(runId, PRINCIPAL)
    expect(waiting.state).toBe('awaiting_review')
    expect(world.displayed()).toBe(INITIAL) // la réservation se pose à l'EXÉCUTION, pas à la demande
    const cancelled = await world.cards.cancel(runId, PRINCIPAL, 'Je retire la demande')
    expect(cancelled.state).toBe('rejected')
    expect(world.reservationRows.rows).toHaveLength(0)
    expect(world.displayed()).toBe(INITIAL)
  })

  it('RÉESSAYER après un échec : l’échec n’a rien coûté, la reprise coûte le prix de l’action une seule fois', async () => {
    const world = billingWorld({ enrichment: 'provider_down' })
    const runId = await proposeCard(world, ENRICH)
    await world.cards.confirm(runId, PRINCIPAL)
    await world.runJobs()
    const failed = await world.cards.view(runId, PRINCIPAL)
    expect(failed.state).toBe('failed')
    expect(failed.allowedGestures).toContain('retry')
    expect(world.displayed()).toBe(INITIAL)
    expect(world.debited()).toBe(0)

    world.state.enrichment = 'found'
    world.jobs.clear() // le job terminé libère sa place, comme `existing.remove()`
    const retried = await world.cards.retry(runId, PRINCIPAL)
    expect(retried.state).toBe('running')
    expect(world.displayed()).toBe(INITIAL - ENRICH_COST)
    await world.runJobs()
    expect(world.debited()).toBe(ENRICH_COST) // un seul prix pour deux tentatives
    expect(world.displayed()).toBe(INITIAL - ENRICH_COST)
    expect((await world.cards.view(runId, PRINCIPAL)).spentCredits).toBe(ENRICH_COST)
  })
})

/**
 * Les workflows de l'Action Center (chemin SYNCHRONE du routeur) — les défauts
 * D3 et D5 et la fenêtre I3 existaient AVANT L2, ils se voient ici contre le
 * runner d'origine.
 */
describe('Simulation — workflow approuvé (routeur synchrone)', () => {
  const INTENTS: Record<string, ActionIntent> = {
    enrich_decision_maker: { type: 'enrich_contact', contactId: CONTACT },
    log_crm_opportunity: { type: 'create_crm_task', contactId: CONTACT, crmProvider: 'hubspot' },
    schedule_follow_up: { type: 'schedule_reminder', contactId: CONTACT, at: '2026-09-16T09:00:00.000Z' },
  }

  function workflowWorld(options: { found: boolean; demo?: boolean }) {
    const world = billingWorld({ demo: options.demo })
    let remaining = INITIAL
    const seenAtCrmStep: number[] = []
    const displayed = (): number =>
      spendableCredits(remaining, liveReservedTotal(world.reservationRows.rows, new Date()))
    const dispatch = jest.fn(async (intent: ActionIntent) => {
      if (intent.type === 'enrich_contact') {
        if (options.found && !options.demo) {
          remaining -= ENRICH_COST
          return { type: intent.type, status: 'done', creditsDebited: ENRICH_COST }
        }
        return { type: intent.type, status: 'done', creditsDebited: 0 }
      }
      if (intent.type === 'create_crm_task') seenAtCrmStep.push(displayed())
      return { type: intent.type, status: 'done' }
    })
    const workspaceContext = {
      resolveActiveWorkspace: jest.fn(async () => ({ workspaceId: WS, role: 'owner' })),
      isDemoWorkspace: jest.fn(async () => Boolean(options.demo)),
    }
    const runner = new WorkflowRunnerService(
      world.runs as never,
      world.approvals as never,
      inMemoryRepository<WorkspaceEntity>() as never,
      { dispatch } as never,
      new CreditReservationService(world.reservationRows as never),
      workspaceContext as never,
    )
    world.runs.rows.push({
      id: 'run-w',
      workspace_id: WS,
      user_id: USER,
      definition_key: 'signal_to_account_opening',
      definition_version: 1,
      trigger: 'signal_detected',
      status: 'awaiting_approval',
      account_id: ACCOUNT,
      contact_id: CONTACT,
      correlation_id: 'wf_signal_to_account_opening_k',
      idempotency_key: 'k-w',
      steps: [],
      estimated_credits: ENRICH_COST,
      spent_credits: 0,
      started_at: null,
      finished_at: null,
      intents: INTENTS,
      created_at: new Date(),
    } as unknown as WorkflowRunEntity)
    world.approvals.rows.push({
      id: 'ap-w',
      workspace_id: WS,
      run_id: 'run-w',
      step_key: null,
      required_level: 'n2_user_approval',
      state: 'pending',
      requested_by: USER,
      decided_by: null,
      decided_at: null,
      summary: 'Retrouver les coordonnées — ACME',
      estimated_credits: ENRICH_COST,
      expires_at: new Date(Date.now() + 60_000),
      reason: null,
    } as unknown as ApprovalRequestEntity)
    // D2 — plus aucun `context` : les intents sont relus sur le run PERSISTÉ.
    const approve = () =>
      runner.decideApprovalRequest({ approvalId: 'ap-w', principal: PRINCIPAL, decision: 'approve' })
    return { ...world, approve, seenAtCrmStep, displayedNow: displayed }
  }

  it('TROUVÉ : pendant le pas suivant le solde vaut 10−coût, JAMAIS 10−2×coût (I3) ; après, dépensé = coût', async () => {
    const world = workflowWorld({ found: true })
    const run = await world.approve()
    expect(world.seenAtCrmStep).toEqual([INITIAL - ENRICH_COST])
    expect(world.displayedNow()).toBe(INITIAL - ENRICH_COST)
    expect(run.spent_credits).toBe(ENRICH_COST)
    expect(world.liveReservations()).toBe(0)
  })

  it('NON TROUVÉ : dépensé 0, pas l’estimation recopiée (D3)', async () => {
    const world = workflowWorld({ found: false })
    const run = await world.approve()
    expect(run.spent_credits).toBe(0)
    expect(run.steps.find(step => step.key === 'enrich_decision_maker')?.creditsSpent).toBe(0)
    expect(world.displayedNow()).toBe(INITIAL)
  })

  it('DÉMO : le runner ne pose AUCUNE réservation (D5, I6)', async () => {
    const world = workflowWorld({ found: true, demo: true })
    await world.approve()
    expect(world.reservationRows.rows).toHaveLength(0)
  })
})

/**
 * #1943.4 (L3) — décision de Louis du 13/09 : une carte validée par un MANAGER
 * s'exécute au nom de son AUTEUR. Sur le chemin qui touche un crédit, cela veut
 * dire : la réservation, la recherche en file et le débit portent l'auteur —
 * jamais le manager.
 */
describe('Simulation — carte validée par un manager (#1943.4) : réservée et débitée au nom de l’AUTEUR', () => {
  const MANAGER = { userId: '9d359267-0000-4000-8000-000000000005', email: 'lead@esn.fr' }

  it('TROUVÉ : avant 10 ; demande 10 ; validée 10−coût (réservé, auteur) ; après 10−coût (débité, auteur) ; le manager n’est nulle part', async () => {
    const world = billingWorld({ spendThreshold: ENRICH_COST })
    const runId = await proposeCard(world, ENRICH)
    expect(world.displayed()).toBe(INITIAL)
    expect((await world.cards.confirm(runId, PRINCIPAL)).state).toBe('awaiting_review')
    expect(world.displayed()).toBe(INITIAL)

    const pending = world.approvals.rows.find(row => row.state === 'pending') as ApprovalRequestEntity
    await world.runner.decideApprovalRequest({ approvalId: pending.id, principal: MANAGER, decision: 'approve' })

    expect(world.displayed()).toBe(INITIAL - ENRICH_COST)
    expect(world.reservationRows.rows.map(row => row.user_id)).toEqual([USER])
    // La recherche part au nom de l'auteur : c'est SON pool que le worker débite.
    expect([...world.jobs.values()].map(job => job.data.userId)).toEqual([USER])
    await world.runJobs()
    expect(world.debited()).toBe(ENRICH_COST)
    expect(world.displayed()).toBe(INITIAL - ENRICH_COST)
    expect(world.liveReservations()).toBe(0)
    expect(world.approvals.rows.find(row => row.id === pending.id)).toMatchObject({
      state: 'approved',
      decided_by: MANAGER.userId,
    })
  })
})

/**
 * #1943.5 (L3) — l'analyse lancée depuis la conversation PAR LE PONT (le chemin
 * réel : `trackConversationAnalysisLaunch` au lancement, l'issue lue par
 * `analysisLaunchObserverFrom` à la relecture). Facturation inchangée : 8 débités
 * au lancement par l'analyse, remboursés sur échec terminal, AUCUNE réservation.
 */
describe('Simulation — analyse lancée par le pont (#1943.5) : suivi observé, facturation inchangée', () => {
  function analysisWorld(outcome: 'completed' | 'failed') {
    const world = billingWorld()
    const ledger: { kind: string; account_id: string; delta: number; created_at: Date }[] = []
    const readLedger = { getLedger: async () => ({ entries: [...ledger].reverse() }) }
    let status: 'active' | 'completed' | 'failed' = 'active'
    const accountRows = inMemoryRepository<{ id: string; workspace_id: string; company_name: string }>()
    accountRows.rows.push({ id: ACCOUNT, workspace_id: WS, company_name: 'ACME' })
    const cards = new CopilotCardService(
      world.runs as never,
      world.approvals as never,
      world.runner,
      new CreditReservationService(world.reservationRows as never),
      accountRows as never,
      inMemoryRepository() as never,
      // #1952.1 — le troisième argument est le nombre de phases du pipeline. Ce
      // monde ne simule aucun point de contrôle : l'avancement reste non mesuré,
      // ce qui est exactement ce que la carte doit dire.
      analysisLaunchObserverFrom({ getStatus: async () => success({ state: status }) }, readLedger, 4),
    )
    const launch = async () => {
      const startedAt = new Date()
      // Le vrai `AnalysisService.start` débite AU LANCEMENT — hors Action OS.
      world.billAnalysisLaunch()
      ledger.push({ kind: 'consume_analysis', account_id: ACCOUNT, delta: -ANALYSIS_COST, created_at: new Date() })
      await trackConversationAnalysisLaunch(
        { cards, ledger: readLedger, isDemo: async () => false },
        { userId: USER, accountId: ACCOUNT, jobId: 'analysis-job-1', launched: true, reason: null, startedAt },
      )
    }
    const finish = () => {
      status = outcome
      if (outcome === 'failed') {
        // Le vrai worker d'analyse rembourse sur échec terminal.
        world.refundAnalysis()
        ledger.push({ kind: 'refund_analysis', account_id: ACCOUNT, delta: ANALYSIS_COST, created_at: new Date() })
      }
    }
    return { world, cards, launch, finish }
  }

  it('ÉCHEC TERMINAL : avant 10 ; pendant 10−8 (débité au lancement, 0 réservé) ; après 10 — « échouée », dépensé 0', async () => {
    const { world, cards, launch, finish } = analysisWorld('failed')
    expect(world.displayed()).toBe(INITIAL)
    await launch()
    const [tracked] = await cards.list(PRINCIPAL, {})
    expect(tracked?.state).toBe('running')
    expect(tracked?.spentCredits).toBe(ANALYSIS_COST)
    expect(world.displayed()).toBe(INITIAL - ANALYSIS_COST)
    expect(world.reservationRows.rows).toHaveLength(0)

    finish()
    const settled = await cards.view(tracked?.id as string, PRINCIPAL)
    expect(settled.state).toBe('failed')
    expect(settled.spentCredits).toBe(0)
    expect(world.displayed()).toBe(INITIAL)
    expect(world.debited()).toBe(0)
    expect(world.reservationRows.rows).toHaveLength(0)
  })

  it('SUCCÈS : après 10−8 — « exécutée », dépensé 8 ; relire deux fois ne compte rien deux fois (I5)', async () => {
    const { world, cards, launch, finish } = analysisWorld('completed')
    await launch()
    const [tracked] = await cards.list(PRINCIPAL, {})
    finish()
    const first = await cards.view(tracked?.id as string, PRINCIPAL)
    const second = await cards.view(tracked?.id as string, PRINCIPAL)
    expect([first.state, second.state]).toEqual(['executed', 'executed'])
    expect([first.spentCredits, second.spentCredits]).toEqual([ANALYSIS_COST, ANALYSIS_COST])
    expect(world.displayed()).toBe(INITIAL - ANALYSIS_COST)
    expect(world.reservationRows.rows).toHaveLength(0)
  })
})
