import type { ApprovalRequestEntity } from '../../database/entities/approval-request.entity'
import type { CreditReservationEntity } from '../../database/entities/credit-reservation.entity'
import type { ProfileEntity } from '../../database/entities/profile.entity'
import type { WorkflowRunEntity } from '../../database/entities/workflow-run.entity'
import type { WorkspaceEntity } from '../../database/entities/workspace.entity'
import type { AnalysisLaunchObserver } from './analysis-launch.port'
import { CopilotCardService } from './copilot-card.service'
import { CreditReservationService } from './credit-reservation.service'
import { inMemoryRepository } from './testing/in-memory-repository'
import { WorkflowRunnerService } from './workflow-runner.service'

/**
 * #1943.5 — le SUIVI d'une analyse lancée depuis la conversation.
 *
 * Trois choses que L2 n'avait pas : une clé qui ne suppose pas de tour (le pont
 * qui lance ne connaît pas le tour), l'ISSUE terminale observée à la lecture (le
 * statut de l'analyse et le remboursement du registre, par un port), et le
 * RATTACHEMENT au tour de conversation qui l'a lancée.
 */

const WS = '7a0c2f10-0000-4000-8000-000000000002'
const AUTHOR = '9d359267-0000-4000-8000-000000000001'
const TEAMMATE = '9d359267-0000-4000-8000-000000000003'
const ACCOUNT = '22222222-2222-4222-8222-222222222222'
const TURN = '33333333-3333-4333-8333-333333333333'
const author = { userId: AUTHOR, email: 'rep@esn.fr' }

function harness(observer?: AnalysisLaunchObserver) {
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
  workspaces.rows.push({ id: WS } as unknown as WorkspaceEntity)
  const reservationRows = inMemoryRepository<CreditReservationEntity>()
  const reservations = new CreditReservationService(reservationRows as never)
  const accounts = inMemoryRepository<{ id: string; workspace_id: string; company_name: string }>()
  accounts.rows.push({ id: ACCOUNT, workspace_id: WS, company_name: 'ACME' })
  const contacts = inMemoryRepository<{
    id: string
    workspace_id: string
    account_id?: string
    full_name?: string
    email_confidence?: string | null
    email_verified?: boolean
    hidden?: boolean
    deleted_at?: Date | null
  }>()
  const workspaceContext = {
    resolveActiveWorkspace: jest.fn(async () => ({ workspaceId: WS, role: 'owner' })),
    isDemoWorkspace: jest.fn(async () => false),
  }
  const runner = new WorkflowRunnerService(
    runs as never,
    approvals as never,
    workspaces as never,
    { dispatch: jest.fn(), observe: jest.fn() } as never,
    reservations,
    workspaceContext as never,
  )
  // #1931.12 — le nom RÉEL de l'auteur, seule source dont `actorName` a le droit
  // de venir (jamais l'e-mail du principal en repli).
  const profiles = inMemoryRepository<ProfileEntity>()
  profiles.rows.push({ user_id: AUTHOR, first_name: 'Camille', last_name: 'Nguyen' } as unknown as ProfileEntity)
  const cards = new CopilotCardService(
    runs as never,
    approvals as never,
    runner,
    reservations,
    accounts as never,
    contacts as never,
    observer,
    profiles as never,
  )
  const launch = (principal = author, key = 'analysis:job-1:1') =>
    cards.trackAnalysisLaunch({ principal, accountId: ACCOUNT, jobId: 'job-1', debitObserved: 8, launchKey: key })
  return { cards, runs, reservationRows, launch, profiles, contacts }
}

describe('trackAnalysisLaunch — une clé de lancement, sans tour', () => {
  it('suit l’analyse EN COURS avec le débit observé, et rejouer le même lancement ne crée pas un second suivi (I5)', async () => {
    const { launch, runs, reservationRows } = harness()
    const first = await launch()
    const again = await launch()
    expect(first.state).toBe('running')
    expect(first.spentCredits).toBe(8)
    expect(again.id).toBe(first.id)
    expect(runs.rows).toHaveLength(1)
    expect(reservationRows.rows).toHaveLength(0) // I3
  })

  // #1952.24 — « bouton voir le détail » : la carte n'a pas de lien parce que
  // `externalRef` porte le jobId (lu par `observeAnalysisTracking` pour
  // interroger le lanceur), jamais une URL. `accountId` est le champ NEUF qui
  // porte la page qui possède le résultat (`LONG_JOB_SPECS.account_analysis.
  // resultScreen`, `/accounts/:id`) sans toucher `externalRef`.
  it('#1952.24 — porte accountId, la page qui possède le résultat', async () => {
    const { launch } = harness()
    const view = await launch()
    expect(view.accountId).toBe(ACCOUNT)
  })
})

describe('l’issue terminale est OBSERVÉE à la lecture (statut + registre), jamais supposée', () => {
  it('terminée : « exécutée », dépensé = débit observé − remboursement observé (0)', async () => {
    const observer = { observe: jest.fn().mockResolvedValue({ state: 'done', refunded: 0 }) }
    const { cards, launch } = harness(observer)
    const tracked = await launch()
    const view = await cards.view(tracked.id, author)
    expect(observer.observe).toHaveBeenCalledWith(
      expect.objectContaining({ userId: AUTHOR, accountId: ACCOUNT, jobId: 'job-1' }),
    )
    expect(view.state).toBe('executed')
    expect(view.spentCredits).toBe(8)
  })

  it('échouée et remboursée : « échouée », dépensé 0', async () => {
    const observer = { observe: jest.fn().mockResolvedValue({ state: 'failed', refunded: 8 }) }
    const { cards, launch } = harness(observer)
    const view = await cards.view((await launch()).id, author)
    expect(view.state).toBe('failed')
    expect(view.spentCredits).toBe(0)
    expect(view.result?.creditsSpent).toBe(0)
  })

  it('un remboursement que le registre ne montre pas laisse le coût NON MESURÉ (`null`), jamais 0', async () => {
    const observer = { observe: jest.fn().mockResolvedValue({ state: 'failed', refunded: null }) }
    const { cards, launch } = harness(observer)
    expect((await cards.view((await launch()).id, author)).result?.creditsSpent).toBeNull()
  })

  it('en cours ou inconnue : la carte reste « en cours », rien n’est écrit', async () => {
    for (const state of ['running', 'unknown'] as const) {
      const observer = { observe: jest.fn().mockResolvedValue({ state, refunded: null }) }
      const { cards, launch } = harness(observer)
      expect((await cards.view((await launch()).id, author)).state).toBe('running')
    }
  })

  it('sans observateur branché, la carte reste « en cours » (jamais une issue inventée)', async () => {
    const { cards, launch } = harness()
    expect((await cards.view((await launch()).id, author)).state).toBe('running')
  })

  it('observée par un COÉQUIPIER qui relit le fil : l’issue s’écrit au nom de l’AUTEUR du lancement', async () => {
    const observer = { observe: jest.fn().mockResolvedValue({ state: 'done', refunded: 0 }) }
    const { cards, launch } = harness(observer)
    const tracked = await launch()
    await cards.view(tracked.id, { userId: TEAMMATE, email: 'mate@esn.fr' })
    expect(observer.observe.mock.calls[0]?.[0]).toMatchObject({ userId: AUTHOR })
  })
})

/**
 * #1952.32 (#2844) — « CE QUI DOIT ÊTRE VÉRIFIÉ », SUR LE RÉSULTAT D'UNE
 * ANALYSE RÉUSSIE, JAMAIS DEVINÉ.
 *
 * `CardResult` n'avait, pour AUCUN des sept travaux longs, de signal de
 * confiance/vérification — #2844 le nomme HORS LOT depuis trois lots. Le
 * signal EXISTE déjà, réel, sur les contacts que l'analyse a touchés
 * (`contacts.email_confidence`, #2120.68) : ce lot le relit, il n'en invente
 * aucun.
 */
describe('« ce qui doit être vérifié » sur une analyse réussie (#1952.32)', () => {
  it('nomme les contacts du compte dont l’e-mail n’est pas confirmé (`medium`/`low`)', async () => {
    const observer = { observe: jest.fn().mockResolvedValue({ state: 'done', refunded: 0 }) }
    const { cards, launch, contacts } = harness(observer)
    contacts.rows.push(
      { id: 'c1', workspace_id: WS, account_id: ACCOUNT, full_name: 'Julie Martin', email_confidence: 'medium' },
      { id: 'c2', workspace_id: WS, account_id: ACCOUNT, full_name: 'Karim Haddad', email_confidence: 'low' },
      { id: 'c3', workspace_id: WS, account_id: ACCOUNT, full_name: 'Sophie Rey', email_confidence: 'high' },
      { id: 'c4', workspace_id: WS, account_id: ACCOUNT, full_name: 'Non mesuré', email_confidence: null },
    )
    const tracked = await launch()
    const view = await cards.view(tracked.id, author)
    expect(view.result?.toVerify).toEqual([
      'Julie Martin — e-mail trouvé, non confirmé',
      'Karim Haddad — e-mail deviné, à confirmer',
    ])
  })

  it('aucun contact à vérifier : le champ reste absent, jamais une liste vide', async () => {
    const observer = { observe: jest.fn().mockResolvedValue({ state: 'done', refunded: 0 }) }
    const { cards, launch, contacts } = harness(observer)
    contacts.rows.push({
      id: 'c1',
      workspace_id: WS,
      account_id: ACCOUNT,
      full_name: 'Sophie Rey',
      email_confidence: 'high',
    })
    const view = await cards.view((await launch()).id, author)
    expect(view.result?.toVerify).toBeUndefined()
  })

  it('une analyse ÉCHOUÉE n’interroge jamais les contacts — rien n’a été produit à vérifier', async () => {
    const observer = { observe: jest.fn().mockResolvedValue({ state: 'failed', refunded: 8 }) }
    const { cards, launch, contacts } = harness(observer)
    contacts.rows.push({
      id: 'c1',
      workspace_id: WS,
      account_id: ACCOUNT,
      full_name: 'Julie Martin',
      email_confidence: 'medium',
    })
    const view = await cards.view((await launch()).id, author)
    expect(view.result?.toVerify).toBeUndefined()
  })
})

// #3416.x2 — « Ce que ça apprend » d'une analyse de compte : le résultat RÉEL
// (contacts comptés), stocké sur le run au règlement, jamais une phrase inventée.
describe('« ce que l’analyse a trouvé » stocké sur le run (#3416.x2)', () => {
  it('compte les contacts réellement trouvés et ceux dont l’e-mail est vérifié', async () => {
    const observer = { observe: jest.fn().mockResolvedValue({ state: 'done', refunded: 0 }) }
    const { cards, launch, contacts } = harness(observer)
    contacts.rows.push(
      { id: 'c1', workspace_id: WS, account_id: ACCOUNT, full_name: 'A', email_verified: true },
      { id: 'c2', workspace_id: WS, account_id: ACCOUNT, full_name: 'B', email_verified: false },
      { id: 'c3', workspace_id: WS, account_id: ACCOUNT, full_name: 'C', hidden: true },
      { id: 'c4', workspace_id: WS, account_id: ACCOUNT, full_name: 'D', deleted_at: new Date() },
      { id: 'c5', workspace_id: WS, account_id: 'autre-compte', full_name: 'E', email_verified: true },
    )
    const view = await cards.view((await launch()).id, author)
    expect(view.result?.analysisFound).toEqual({ contacts: 2, verifiedEmails: 1 })
  })

  it('aucun contact trouvé : le champ reste absent (une absence n’est pas un zéro)', async () => {
    const observer = { observe: jest.fn().mockResolvedValue({ state: 'done', refunded: 0 }) }
    const { cards, launch } = harness(observer)
    const view = await cards.view((await launch()).id, author)
    expect(view.result?.analysisFound).toBeUndefined()
  })

  it('une analyse ÉCHOUÉE ne stocke aucun résultat', async () => {
    const observer = { observe: jest.fn().mockResolvedValue({ state: 'failed', refunded: 8 }) }
    const { cards, launch, contacts } = harness(observer)
    contacts.rows.push({ id: 'c1', workspace_id: WS, account_id: ACCOUNT, full_name: 'A' })
    const view = await cards.view((await launch()).id, author)
    expect(view.result?.analysisFound).toBeUndefined()
  })
})

describe('#1931.12 — le nom de qui a agi (`CardResult.actorName`)', () => {
  it('le suivi d’une analyse lancée porte le nom RÉEL de son auteur', async () => {
    const { launch } = harness()
    const tracked = await launch()
    expect(tracked.result?.actorName).toBe('Camille Nguyen')
  })

  it('l’issue terminale porte le nom de l’AUTEUR du lancement, même lue par un coéquipier', async () => {
    const observer = { observe: jest.fn().mockResolvedValue({ state: 'done', refunded: 0 }) }
    const { cards, launch } = harness(observer)
    const tracked = await launch()
    const view = await cards.view(tracked.id, { userId: TEAMMATE, email: 'mate@esn.fr' })
    expect(view.result?.actorName).toBe('Camille Nguyen')
  })

  it('sans profil lisible, `actorName` reste `null` — jamais l’e-mail à la place du nom', async () => {
    const { launch, profiles } = harness()
    profiles.rows.length = 0
    const tracked = await launch()
    expect(tracked.result?.actorName).toBeNull()
  })
})

describe('adoptAnalysisLaunches — le suivi rejoint le tour qui a lancé l’analyse', () => {
  it('rattache au tour le suivi de l’AUTEUR, créé pendant le tour, dans la limite des lancements que le tour a faits', async () => {
    const { cards, launch, runs } = harness()
    const since = new Date(Date.now() - 1000)
    const tracked = await launch()
    const adopted = await cards.adoptAnalysisLaunches({
      principal: author,
      conversationId: 'conv-1',
      turnId: TURN,
      since,
      launchedInTurn: 1,
    })
    expect(adopted).toBe(1)
    expect(runs.rows.find(row => row.id === tracked.id)).toMatchObject({ conversation_id: 'conv-1', turn_id: TURN })
    expect((await cards.listForThread(author, { conversationId: 'conv-1', turnIds: [] })).map(card => card.id)).toEqual(
      [tracked.id],
    )
  })

  it('n’attrape pas ce qu’il ne vise pas : un autre auteur, un suivi d’avant le tour, un tour sans lancement', async () => {
    const { cards, launch, runs } = harness()
    const mateRun = await launch({ userId: TEAMMATE, email: 'mate@esn.fr' }, 'analysis:job-mate:1')
    const oldRun = await launch(author, 'analysis:job-old:1')
    const old = runs.rows.find(row => row.id === oldRun.id) as WorkflowRunEntity
    old.created_at = new Date(Date.now() - 60 * 60 * 1000)
    const since = new Date(Date.now() - 1000)

    expect(
      await cards.adoptAnalysisLaunches({
        principal: author,
        conversationId: 'conv-1',
        turnId: TURN,
        since,
        launchedInTurn: 0,
      }),
    ).toBe(0)
    expect(
      await cards.adoptAnalysisLaunches({
        principal: author,
        conversationId: 'conv-1',
        turnId: TURN,
        since,
        launchedInTurn: 1,
      }),
    ).toBe(0)
    expect(runs.rows.find(row => row.id === mateRun.id)?.turn_id).toBeNull()
    expect(old.turn_id).toBeNull()
  })
})

/**
 * #1952.1 — UN TRAVAIL LONG PORTE SON AVANCEMENT RÉEL.
 *
 * La carte de suivi disait « Analyse lancée. » du début à la fin : l'état était
 * juste, l'avancement absent. Il arrive désormais de l'observateur — des étapes
 * RÉELLEMENT franchies, jamais un défilé simulé — et la ligne « Résultat » de la
 * carte, la seule que le fil rend déjà, le dit. Ce que ces tests refusent :
 * « 0 étape sur 4 » quand on n'a rien pu lire, et une écriture à chaque lecture.
 */
describe('l’avancement MESURÉ d’une analyse suivie', () => {
  const observerAt = (progress: { done: number; total: number } | null) => ({
    observe: jest.fn().mockResolvedValue({ state: 'running', refunded: null, progress }),
  })

  it('écrit les étapes franchies dans la ligne « Résultat », la carte restant « en cours »', async () => {
    const { cards, launch } = harness(observerAt({ done: 2, total: 4 }))
    const view = await cards.view((await launch()).id, author)
    expect(view.state).toBe('running')
    expect(view.result?.outcome).toBe('Analyse en cours — 2 étapes sur 4 terminées.')
  })

  it('position non établie : la carte garde « Analyse lancée. » — jamais « 0 étape sur 4 »', async () => {
    const { cards, launch } = harness(observerAt(null))
    const view = await cards.view((await launch()).id, author)
    expect(view.result?.outcome).toBe('Analyse lancée.')
    expect(view.result?.outcome).not.toContain('0 étape')
  })

  it('une lecture qui ne change rien n’écrit rien (une carte relue dix fois n’écrit pas dix fois)', async () => {
    const { cards, runs, launch } = harness(observerAt({ done: 2, total: 4 }))
    const tracked = await launch()
    await cards.view(tracked.id, author)
    const update = jest.spyOn(runs, 'update')
    await cards.view(tracked.id, author)
    expect(update).not.toHaveBeenCalled()
  })

  it('n’attrape pas ce qu’il ne vise pas : l’issue terminale écrase l’avancement, elle ne s’y ajoute pas', async () => {
    const observer = {
      observe: jest
        .fn()
        .mockResolvedValueOnce({ state: 'running', refunded: null, progress: { done: 3, total: 4 } })
        .mockResolvedValueOnce({ state: 'done', refunded: 0, progress: null }),
    }
    const { cards, launch } = harness(observer)
    const tracked = await launch()
    expect((await cards.view(tracked.id, author)).result?.outcome).toBe('Analyse en cours — 3 étapes sur 4 terminées.')
    const settled = await cards.view(tracked.id, author)
    expect(settled.state).toBe('executed')
    expect(settled.result?.outcome).toBe('Analyse terminée.')
  })
})

/**
 * #1952.17 — UNE ANALYSE ANNULÉE N'EST NI UN ÉCHEC NI UN SUCCÈS.
 *
 * La carte repliait l'annulation sur l'échec : « L'analyse a échoué », suivi de
 * « Relancer l'analyse depuis la conversation. ». Une carte de suivi n'offre
 * aucun GESTE (sa clé n'a pas de définition effectuante, donc `allowedGestures`
 * est vide) : l'invitation à relancer est cette LIGNE, et elle suffit — relancer,
 * c'est redébiter, pour un travail que l'utilisateur a lui-même arrêté et dont le
 * crédit vient justement de lui être rendu. Ce que ces tests refusent : le mot
 * « échoué », l'invitation à relancer, et un coût compté 0 quand le registre n'a
 * pas pu être lu.
 */
describe('#1952.17 — l’issue d’une analyse ANNULÉE', () => {
  const cancelled = (refunded: number | null) => ({
    observe: jest.fn().mockResolvedValue({ state: 'cancelled', refunded, progress: null }),
  })

  it('annulée et remboursée : la carte le dit, sans « échoué » et sans invitation à relancer', async () => {
    const { cards, launch } = harness(cancelled(8))
    const view = await cards.view((await launch()).id, author)
    expect(view.result?.outcome).toBe('Analyse annulée — les crédits ont été remboursés.')
    expect(view.result?.outcome).not.toMatch(/échou/i)
    expect(view.result?.nextStep).toBeNull()
    expect(view.spentCredits).toBe(0)
  })

  it('annulée, remboursement non observé : le coût reste NON MESURÉ (`null`), jamais 0', async () => {
    const { cards, launch } = harness(cancelled(null))
    const view = await cards.view((await launch()).id, author)
    expect(view.result?.outcome).toBe('Analyse annulée — remboursement non observé à ce stade.')
    expect(view.result?.creditsSpent).toBeNull()
  })

  it('n’attrape pas ce qu’il ne vise pas : une analyse ÉCHOUÉE garde son texte et son « réessayer »', async () => {
    const observer = { observe: jest.fn().mockResolvedValue({ state: 'failed', refunded: 8, progress: null }) }
    const { cards, launch } = harness(observer)
    const view = await cards.view((await launch()).id, author)
    expect(view.state).toBe('failed')
    expect(view.result?.outcome).toBe('L’analyse a échoué — les crédits ont été remboursés.')
    expect(view.result?.nextStep).toBe('Relancer l’analyse depuis la conversation.')
  })

  it('l’issue d’une annulation s’écrit UNE fois : une seconde lecture ne la repeint pas', async () => {
    const observer = cancelled(8)
    const { cards, runs, launch } = harness(observer)
    const tracked = await launch()
    await cards.view(tracked.id, author)
    const update = jest.spyOn(runs, 'update')
    const again = await cards.view(tracked.id, author)
    expect(update).not.toHaveBeenCalled()
    expect(again.result?.outcome).toBe('Analyse annulée — les crédits ont été remboursés.')
  })
})
