import { NotFoundException } from '@nestjs/common'
import type { CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import type { ActionPlanItemsService } from '../actions/action-plan-items.service'
import type { ActivitiesService } from '../activities/activities.service'
import type { WorkspaceContextService } from '../workspace/workspace-context.service'
import type { LinkSignalActionDto } from './dto/link-signal-action.dto'
import { SignalHistoryController } from './signal-history.controller'
import type { SignalHistoryService } from './signal-history.service'

/**
 * « Ce signal a déclenché une action » (restitution V2 §20). Les preuves portent
 * sur le CONTRAT : appartenance vérifiée avant toute écriture, réutilisation de
 * la checklist existante, et estampillage du lien sur l'identité partagée.
 */
describe('SignalHistoryController', () => {
  const user = { userId: 'u-1', email: 'u@example.com' } as CurrentUserPayload
  const body = { accountId: 'acc-1', label: 'Levée de fonds série B' } as LinkSignalActionDto

  function build(overrides: { hasSignal?: boolean; verifySignal?: boolean } = {}) {
    const signalHistory = {
      hasSignal: jest.fn().mockResolvedValue(overrides.hasSignal ?? true),
      linkAction: jest.fn().mockResolvedValue(true),
      verifySignal: jest.fn().mockResolvedValue(overrides.verifySignal ?? true),
    } as unknown as jest.Mocked<Pick<SignalHistoryService, 'hasSignal' | 'linkAction' | 'verifySignal'>>
    const planItems = {
      createManual: jest.fn().mockResolvedValue({ id: 'act-1', label: 'Traiter le signal : Levée de fonds série B' }),
    } as unknown as jest.Mocked<Pick<ActionPlanItemsService, 'createManual'>>
    const workspaceContext = {
      resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1', role: 'owner' }),
    } as unknown as jest.Mocked<Pick<WorkspaceContextService, 'resolveActiveWorkspace'>>
    const activities = {
      ingest: jest.fn().mockResolvedValue({ ingested: 1, duplicates: 0 }),
    } as unknown as jest.Mocked<Pick<ActivitiesService, 'ingest'>>

    return {
      signalHistory,
      planItems,
      workspaceContext,
      activities,
      controller: new SignalHistoryController(
        signalHistory as unknown as SignalHistoryService,
        planItems as unknown as ActionPlanItemsService,
        workspaceContext as unknown as WorkspaceContextService,
        activities as unknown as ActivitiesService,
      ),
    }
  }

  it('creates the action on the EXISTING checklist and links it to the signal', async () => {
    const { signalHistory, planItems, controller } = build()

    const result = await controller.createAction(user, body)

    expect(signalHistory.hasSignal).toHaveBeenCalledWith({
      workspaceId: 'ws-1',
      accountId: 'acc-1',
      label: 'Levée de fonds série B',
    })
    expect(planItems.createManual).toHaveBeenCalledWith('u-1', 'acc-1', {
      label: 'Traiter le signal : Levée de fonds série B',
      dueDate: null,
    })
    expect(signalHistory.linkAction).toHaveBeenCalledWith({
      workspaceId: 'ws-1',
      accountId: 'acc-1',
      label: 'Levée de fonds série B',
      actionId: 'act-1',
    })
    expect(result).toEqual({ actionId: 'act-1', actionLabel: 'Traiter le signal : Levée de fonds série B' })
  })

  it('forwards an optional due date to the existing relance machinery', async () => {
    const { planItems, controller } = build()
    await controller.createAction(user, { ...body, dueDate: '2026-08-01' } as LinkSignalActionDto)
    expect(planItems.createManual).toHaveBeenCalledWith(
      'u-1',
      'acc-1',
      expect.objectContaining({
        dueDate: '2026-08-01',
      }),
    )
  })

  it('404s on an unknown signal and creates NOTHING (membership checked first)', async () => {
    const { planItems, signalHistory, controller } = build({ hasSignal: false })

    await expect(controller.createAction(user, body)).rejects.toBeInstanceOf(NotFoundException)

    expect(planItems.createManual).not.toHaveBeenCalled()
    expect(signalHistory.linkAction).not.toHaveBeenCalled()
  })

  it('scopes everything to the workspace resolved from the JWT (never a body value)', async () => {
    const { workspaceContext, controller } = build()
    await controller.createAction(user, body)
    expect(workspaceContext.resolveActiveWorkspace).toHaveBeenCalledWith('u-1')
  })

  // #2695 — une action créée depuis un signal ne laissait AUCUNE trace : ni
  // provenance, ni heure, ni ligne d'historique. `signal_history.action_id`
  // est le seul lien qui existait, sans horodatage propre et invisible dans
  // Historique/Actions exécutées (les deux lisent `activities`).
  it('#2695 — records the creation in the timeline, with the signal as provenance', async () => {
    const { activities, controller } = build()

    await controller.createAction(user, body)

    expect(activities.ingest).toHaveBeenCalledWith('ws-1', 'u-1', [
      expect.objectContaining({
        kind: 'task',
        source: 'system',
        direction: 'internal',
        subject: 'Traiter le signal : Levée de fonds série B',
        accountId: 'acc-1',
        linkReason: 'manual',
        externalId: 'signal-action:act-1',
      }),
    ])
  })

  it('#2695 — a tracing failure never blocks a gesture that already succeeded', async () => {
    const { activities, controller } = build()
    activities.ingest.mockRejectedValueOnce(new Error('boom'))

    await expect(controller.createAction(user, body)).resolves.toEqual({
      actionId: 'act-1',
      actionLabel: 'Traiter le signal : Levée de fonds série B',
    })
  })

  // #3206.2 (partiel, épopée #3240) — « Marquer ce signal comme vérifié ».
  describe('verify', () => {
    it('checks membership BEFORE writing, then stamps last_verified_at', async () => {
      const { signalHistory, controller } = build()

      const result = await controller.verify(user, body)

      expect(signalHistory.hasSignal).toHaveBeenCalledWith({
        workspaceId: 'ws-1',
        accountId: 'acc-1',
        label: 'Levée de fonds série B',
      })
      expect(signalHistory.verifySignal).toHaveBeenCalledWith({
        workspaceId: 'ws-1',
        accountId: 'acc-1',
        label: 'Levée de fonds série B',
      })
      expect(result).toEqual({ verified: true })
    })

    it('404s on an unknown signal and writes NOTHING (membership checked first)', async () => {
      const { signalHistory, controller } = build({ hasSignal: false })

      await expect(controller.verify(user, body)).rejects.toBeInstanceOf(NotFoundException)

      expect(signalHistory.verifySignal).not.toHaveBeenCalled()
    })

    it('scopes to the workspace resolved from the JWT (never a body value)', async () => {
      const { workspaceContext, controller } = build()
      await controller.verify(user, body)
      expect(workspaceContext.resolveActiveWorkspace).toHaveBeenCalledWith('u-1')
    })
  })
})
