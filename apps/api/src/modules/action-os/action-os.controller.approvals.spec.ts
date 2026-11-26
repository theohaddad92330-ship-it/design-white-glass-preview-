import { NotFoundException } from '@nestjs/common'
import type { ApprovalRequestEntity } from '../../database/entities/approval-request.entity'
import type { ProfileEntity } from '../../database/entities/profile.entity'
import type { WorkflowRunEntity } from '../../database/entities/workflow-run.entity'
import { createMockRepository } from '../../database/test-utils'
import { ActionOsController } from './action-os.controller'

/**
 * #2200.13 / #2200.14 / #2200.21 — LA CARTE « À VALIDER » PORTE SA TRAÇABILITÉ.
 *
 * `RunTraceLine` (`ActionCenter.tsx`) affichait déjà qui a déclenché, depuis
 * quel signal et quelle est la prochaine étape — mais SEULEMENT pour un run
 * déjà visible dans l'onglet « À reprendre »/« Terminées ». Une carte encore en
 * attente d'une décision (`GET /action-os/approvals`) ne portait aucune des
 * trois réponses, alors qu'elles se dérivent du MÊME run.
 *
 * #2200.39 (épopée #2867) — LE RISQUE DE LA PROCHAINE ÉTAPE.
 *
 * `actionRiskSchema` existe au contrat (`workflowStepSchema.risk`) depuis
 * l'origine, mais une approbation en attente n'avait encore écrit AUCUN pas :
 * il n'y a donc rien à relire sur le RUN lui-même. La seule réponse honnête
 * est le risque du PROCHAIN pas (`nextStepKey`, déjà calculé juste au-dessus
 * pour #2200.21) — jamais une moyenne ni le risque le plus haut de la
 * définition, qui répondraient à une question qu'on ne pose pas encore.
 */

const USER = { userId: 'u1', email: 'rep@esn.fr' }

function build() {
  const runs = createMockRepository<WorkflowRunEntity>()
  const approvals = createMockRepository<ApprovalRequestEntity>()
  const profiles = createMockRepository<ProfileEntity>()
  const accounts = createMockRepository<never>()
  const workspaceContext = { resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1' }) }
  const controller = new ActionOsController(
    {} as never, // runner
    workspaceContext as never,
    {} as never, // tools
    runs as never,
    approvals as never,
    accounts as never,
    {} as never, // contacts
    {} as never, // crmConnections
    profiles as never,
    {} as never, // cards
    {} as never, // lauraJobs
  )
  return { controller, runs, approvals, profiles, accounts }
}

describe('ActionOsController — la carte « À valider » porte sa traçabilité (#2200.13/.14/.21)', () => {
  it('nomme qui a déclenché, le déclencheur, et la prochaine étape', async () => {
    const { controller, runs, approvals, profiles, accounts } = build()
    approvals.find.mockResolvedValue([
      {
        id: 'appr-1',
        workspace_id: 'ws-1',
        run_id: 'run-1',
        state: 'pending',
        summary: 'Ajouter une note CRM',
        estimated_credits: 1,
        expires_at: new Date('2026-10-01T00:00:00.000Z'),
        created_at: new Date('2026-09-23T00:00:00.000Z'),
      } as ApprovalRequestEntity,
    ])
    runs.find.mockResolvedValue([
      {
        id: 'run-1',
        workspace_id: 'ws-1',
        user_id: 'u-1',
        trigger: 'manual',
        status: 'awaiting_approval',
        account_id: null,
        definition_key: 'crm_hygiene',
        steps: [],
      } as unknown as WorkflowRunEntity,
    ])
    profiles.find.mockResolvedValue([
      { user_id: 'u-1', first_name: 'Louis', last_name: 'Schlegel', email: 'louis@example.com' } as ProfileEntity,
    ])
    accounts.find.mockResolvedValue([])

    const { approvals: result } = await controller.listApprovals(USER as never)

    expect(result).toHaveLength(1)
    expect(result[0].trace.triggeredByName).toBe('Louis Schlegel')
    expect(result[0].trace.trigger).toBe('manual')
    // #2200.21 — le run n'a encore écrit aucun pas : la prochaine étape est la
    // première de la définition, dans l'ordre des dépendances.
    expect(result[0].nextStepKey).toBe('upsert_record')
    // #2200.39 — `upsert_record` porte `risk: 'medium'` dans le catalogue
    // (`workflow-catalog.ts`) : c'est ce risque, et rien d'inventé, qui doit
    // voyager jusqu'à la carte.
    expect(result[0].risk).toBe('medium')
  })

  it('un run introuvable (jamais le cas en pratique) ne fait pas planter la file — trace vide, pas de prochaine étape', async () => {
    const { controller, runs, approvals, profiles, accounts } = build()
    approvals.find.mockResolvedValue([
      {
        id: 'appr-2',
        workspace_id: 'ws-1',
        run_id: 'run-orphan',
        state: 'pending',
        summary: 'x',
        estimated_credits: 0,
        expires_at: new Date(),
        created_at: new Date(),
      } as ApprovalRequestEntity,
    ])
    runs.find.mockResolvedValue([])
    profiles.find.mockResolvedValue([])
    accounts.find.mockResolvedValue([])

    const { approvals: result } = await controller.listApprovals(USER as never)

    expect(result[0].trace.triggeredByName).toBeNull()
    expect(result[0].nextStepKey).toBeNull()
    // #2200.39 — sans run ni prochaine étape, aucun risque à lire : `null`,
    // jamais un niveau par défaut deviné.
    expect(result[0].risk).toBeNull()
  })
})

/**
 * #3076 (épopée #2858) — UNE CARTE DE LAURA NON CLIQUÉE REJOINT « À VALIDER ».
 *
 * Recette écran du 26/09 (#3076) : `/chat`, « Prépare la mise à jour de
 * l'étape de l'opportunité la plus avancée dans mon CRM » → la carte
 * « PRÉPARÉE » s'affiche et survit au rechargement, MAIS `/actions` onglet
 * « À valider » restait à 0 — une carte gouvernée (#1931 L2) est un run
 * `workflow_runs` (`trigger: 'copilot_proposal'`, `status: 'planned'`) DÈS sa
 * proposition, mais `action_approvals` n'a de ligne QUE si le clic Valider a
 * eu lieu (et seulement si le niveau exige un responsable). `listApprovals`
 * ne lisait que `action_approvals` : la carte n'apparaissait donc jamais.
 */
describe('ActionOsController — une carte non cliquée rejoint « À valider » (#3076)', () => {
  // Relative à MAINTENANT, calculée UNE fois : une date figée expire d'elle-même
  // (TTL de carte) et le test rougit un jour donné sans que le code ait changé.
  const CARD_CREATED_AT = new Date(Date.now() - 60 * 60 * 1000)
  function cardRun(over: Partial<WorkflowRunEntity> = {}): WorkflowRunEntity {
    return {
      id: 'run-card-1',
      workspace_id: 'ws-1',
      user_id: USER.userId,
      trigger: 'copilot_proposal',
      status: 'planned',
      account_id: null,
      definition_key: 'card_propose_opportunity_update',
      steps: [],
      preview: { whatWillHappen: "Mettre à jour l'opportunité Scalabilité cloud (LVMH)." },
      estimated_credits: 0,
      created_at: CARD_CREATED_AT,
      snoozed_until: null,
      ...over,
    } as unknown as WorkflowRunEntity
  }

  it('une carte gouvernée non cliquée apparaît dans la file, sans ligne dans action_approvals', async () => {
    const { controller, runs, approvals, profiles, accounts } = build()
    approvals.find.mockResolvedValue([])
    runs.find.mockResolvedValue([cardRun()])
    profiles.find.mockResolvedValue([])
    accounts.find.mockResolvedValue([])

    const { approvals: result } = await controller.listApprovals(USER as never)

    expect(result).toHaveLength(1)
    // #3076 — MÊME identifiant que le run : trancher depuis /actions ou depuis
    // la carte (`/chat`) agit sur la MÊME ligne.
    expect(result[0].id).toBe('run-card-1')
    expect(result[0].run_id).toBe('run-card-1')
    expect(result[0].state).toBe('pending')
    expect(result[0].summary).toBe("Mettre à jour l'opportunité Scalabilité cloud (LVMH).")
    expect(result[0].nextStepKey).toBe('effect')
    expect(result[0].risk).toBe('medium')
  })

  it('une carte déjà EXPIRÉE (3 jours) ne rejoint pas la file', async () => {
    const { controller, runs, approvals, profiles, accounts } = build()
    approvals.find.mockResolvedValue([])
    runs.find.mockResolvedValue([cardRun({ created_at: new Date('2020-01-01T00:00:00.000Z') })])
    profiles.find.mockResolvedValue([])
    accounts.find.mockResolvedValue([])

    const { approvals: result } = await controller.listApprovals(USER as never)

    expect(result).toHaveLength(0)
  })

  it('une carte de NAVIGATION (aucune gouvernance) ne rejoint jamais la file', async () => {
    const { controller, runs, approvals, profiles, accounts } = build()
    approvals.find.mockResolvedValue([])
    runs.find.mockResolvedValue([cardRun({ definition_key: 'card_open_screen' })])
    profiles.find.mockResolvedValue([])
    accounts.find.mockResolvedValue([])

    const { approvals: result } = await controller.listApprovals(USER as never)

    expect(result).toHaveLength(0)
  })

  it('Valider depuis /actions confirme la MÊME carte que le clic dans /chat', async () => {
    const runs = createMockRepository<WorkflowRunEntity>()
    const runner = { decideApprovalRequest: jest.fn().mockRejectedValue(new NotFoundException('Demande introuvable.')) }
    const cards = { confirm: jest.fn().mockResolvedValue({ id: 'run-card-1' }) }
    const workspaceContext = { resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1' }) }
    const controller = new ActionOsController(
      runner as never,
      workspaceContext as never,
      {} as never,
      runs as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      cards as never,
      {} as never,
    )
    runs.findOne.mockResolvedValue(cardRun())

    const { run } = await controller.decide(USER as never, 'run-card-1', { decision: 'approve' })

    expect(cards.confirm).toHaveBeenCalledWith('run-card-1', expect.objectContaining({ userId: USER.userId }))
    expect(run).toEqual(cardRun())
  })

  it('Réveiller depuis /actions réveille la MÊME carte que « Reporter » (#2856)', async () => {
    const runs = createMockRepository<WorkflowRunEntity>()
    const runner = { snoozeApprovalRequest: jest.fn().mockRejectedValue(new NotFoundException('Demande introuvable.')) }
    const cards = { snooze: jest.fn().mockResolvedValue({ id: 'run-card-1' }) }
    const workspaceContext = { resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1' }) }
    const controller = new ActionOsController(
      runner as never,
      workspaceContext as never,
      {} as never,
      runs as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      cards as never,
      {} as never,
    )
    runs.findOne.mockResolvedValue(cardRun({ snoozed_until: null }))

    const { approval } = await controller.snoozeApproval(USER as never, 'run-card-1', { until: null })

    // #2856 — `until: null` réveille : même service, même contrôle d'accès que le
    // report, jamais le 403 « pas encore possible » de la version précédente.
    expect(cards.snooze).toHaveBeenCalledWith('run-card-1', expect.objectContaining({ userId: USER.userId }), null)
    expect(approval.snoozed_until).toBeNull()
  })

  it('Refuser une carte étrangère (un autre auteur) ne trouve rien : le refus originel remonte', async () => {
    const runs = createMockRepository<WorkflowRunEntity>()
    const runner = { decideApprovalRequest: jest.fn().mockRejectedValue(new NotFoundException('Demande introuvable.')) }
    const workspaceContext = { resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1' }) }
    const controller = new ActionOsController(
      runner as never,
      workspaceContext as never,
      {} as never,
      runs as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    )
    // #3076 — un run introuvable pour CET utilisateur (`user_id`/`workspace_id`
    // filtrés) : ni une carte à lui, ni une approbation classique — l'erreur
    // d'origine (« Demande introuvable ») remonte, jamais une carte d'un autre.
    runs.findOne.mockResolvedValue(null)

    await expect(controller.decide(USER as never, 'run-other', { decision: 'reject' })).rejects.toThrow(
      'Demande introuvable.',
    )
  })
})

// #2864 / #2856 — CE QU'ON M'A CONFIÉ passe devant ; RIEN ne disparaît de la
// liste (le rôle et la délégation changent l'ORDRE, jamais le CONTENU). Une
// demande reportée reste servie avec sa date : c'est l'écran qui la range.
describe('ActionOsController — délégation et report (#2864 / #2856)', () => {
  function approval(id: string, over: Partial<ApprovalRequestEntity> = {}): ApprovalRequestEntity {
    return {
      id,
      workspace_id: 'ws-1',
      run_id: 'run-orphan',
      state: 'pending',
      summary: id,
      estimated_credits: 0,
      expires_at: new Date(),
      created_at: new Date(),
      assigned_to: null,
      snoozed_until: null,
      ...over,
    } as ApprovalRequestEntity
  }

  it('met en tête les demandes confiées à l’appelant, sans en retirer aucune', async () => {
    const { controller, runs, approvals, profiles, accounts } = build()
    approvals.find.mockResolvedValue([
      approval('a'),
      approval('b', { assigned_to: 'u-autre' }),
      approval('c', { assigned_to: USER.userId }),
      approval('d', { snoozed_until: new Date(Date.now() + 3600_000) }),
    ])
    runs.find.mockResolvedValue([])
    profiles.find.mockResolvedValue([])
    accounts.find.mockResolvedValue([])

    const { approvals: result } = await controller.listApprovals(USER as never)

    expect(result.map(item => item.id)).toEqual(['c', 'a', 'b', 'd'])
  })

  it('les deux routes délèguent au moteur avec le principal, jamais le corps brut', async () => {
    const runner = {
      assignApprovalRequest: jest.fn().mockResolvedValue({ id: 'a' }),
      snoozeApprovalRequest: jest.fn().mockResolvedValue({ id: 'a' }),
    }
    const controller = new ActionOsController(
      runner as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    )
    await controller.assignApproval(USER as never, 'a', { assigneeId: null })
    expect(runner.assignApprovalRequest).toHaveBeenCalledWith({
      approvalId: 'a',
      principal: expect.objectContaining({ userId: USER.userId }),
      assigneeId: null,
    })
    await controller.snoozeApproval(USER as never, 'a', { until: '2026-10-01T00:00:00.000Z' })
    expect(runner.snoozeApprovalRequest).toHaveBeenCalledWith({
      approvalId: 'a',
      principal: expect.objectContaining({ userId: USER.userId }),
      until: new Date('2026-10-01T00:00:00.000Z'),
    })
  })
})

// #2864 — reste du lot précédent : le collègue à qui une demande est confiée
// le découvrait sans être prévenu. `createNotification` est BEST-EFFORT — un
// canal absent ou en échec ne défait jamais la délégation déjà écrite.
describe('ActionOsController — notifier le collègue à qui une demande est confiée (#2864 reste)', () => {
  function buildWithNotifications() {
    const profiles = createMockRepository<ProfileEntity>()
    const runner = { assignApprovalRequest: jest.fn().mockResolvedValue({ id: 'a' }) }
    const notifications = { createNotification: jest.fn().mockResolvedValue(undefined) }
    const controller = new ActionOsController(
      runner as never,
      { resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1' }) } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      profiles as never,
      {} as never,
      {} as never,
      undefined,
      notifications as never,
    )
    return { controller, runner, notifications, profiles }
  }

  it('prévient le destinataire quand une demande lui est confiée', async () => {
    const { controller, notifications, profiles } = buildWithNotifications()
    profiles.findOne.mockResolvedValue({ user_id: USER.userId, first_name: 'Louis', last_name: 'Schlegel' })

    await controller.assignApproval(USER as never, 'a', { assigneeId: 'u-collegue' })

    expect(notifications.createNotification).toHaveBeenCalledWith(
      'u-collegue',
      expect.objectContaining({
        type: 'approval_assigned',
        link: '/actions',
        // #4158.56 — l'espace du geste et son auteur : la demande ne se lit plus dans tous les espaces.
        workspaceId: 'ws-1',
        actorUserId: USER.userId,
      }),
    )
    expect(notifications.createNotification.mock.calls[0][1].title).toContain('Louis Schlegel')
  })

  it('retirer la délégation (`assigneeId: null`) ne prévient personne', async () => {
    const { controller, notifications } = buildWithNotifications()

    await controller.assignApproval(USER as never, 'a', { assigneeId: null })

    expect(notifications.createNotification).not.toHaveBeenCalled()
  })

  it('sans le module notifications, la délégation reste effective (best-effort)', async () => {
    const profiles = createMockRepository<ProfileEntity>()
    const runner = { assignApprovalRequest: jest.fn().mockResolvedValue({ id: 'a' }) }
    const controller = new ActionOsController(
      runner as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      profiles as never,
      {} as never,
      {} as never,
    )

    const { approval } = await controller.assignApproval(USER as never, 'a', { assigneeId: 'u-collegue' })

    expect(approval).toEqual({ id: 'a' })
  })

  it('un échec du canal ne défait pas une délégation déjà écrite', async () => {
    const { controller, notifications, profiles } = buildWithNotifications()
    profiles.findOne.mockRejectedValue(new Error('boom'))

    const { approval } = await controller.assignApproval(USER as never, 'a', { assigneeId: 'u-collegue' })

    expect(approval).toEqual({ id: 'a' })
    expect(notifications.createNotification).not.toHaveBeenCalled()
  })
})
