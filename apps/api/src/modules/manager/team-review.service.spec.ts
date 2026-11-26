import { NotFoundException } from '@nestjs/common'
import type { SaveTeamReview } from '@bellum/contracts'
import type { ActionPlanItemsService } from '../actions/action-plan-items.service'
import type { WorkspaceContextService } from '../workspace/workspace-context.service'
import { TeamReviewService } from './team-review.service'

/**
 * Théo D team-review.N1/N2/N3 — le point d'équipe écrit dans le PLAN d'action
 * des comptes : une action existante est mise à jour, jamais dupliquée ; un
 * point « sans nouvelle action » ne fabrique aucune ligne ; rien ne part.
 */
const ACCOUNT = '22222222-2222-4222-8222-222222222222'
const OWNER = '33333333-3333-4333-8333-333333333333'
const ME = '11111111-1111-4111-8111-111111111111'
const ITEM = '44444444-4444-4444-8444-444444444444'
const REVIEW = '55555555-5555-4555-8555-555555555555'

const decision = {
  topic_id: 'dateless:o2',
  account_id: ACCOUNT,
  label: 'Confirmer le périmètre et le budget',
  owner_id: OWNER,
  due_date: '2026-10-27',
  reason: 'Aucune action ouverte sur le compte.',
}

describe('TeamReviewService', () => {
  let service: TeamReviewService
  let reviews: { create: jest.Mock; save: jest.Mock }
  let planItems: { createFromPlan: jest.Mock; update: jest.Mock; itemInWorkspace: jest.Mock }
  let workspace: { resolveActiveWorkspace: jest.Mock }

  beforeEach(() => {
    reviews = {
      create: jest.fn((row: object) => row),
      save: jest.fn(async (row: object) => ({ ...row, id: REVIEW })),
    }
    planItems = {
      createFromPlan: jest.fn().mockResolvedValue({ id: ITEM, added: true }),
      update: jest.fn().mockResolvedValue({ id: ITEM }),
      itemInWorkspace: jest.fn().mockResolvedValue(true),
    }
    workspace = { resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1', role: 'owner' }) }
    service = new TeamReviewService(
      reviews as never,
      planItems as unknown as ActionPlanItemsService,
      workspace as unknown as WorkspaceContextService,
    )
  })

  const save = (body: Partial<SaveTeamReview>) =>
    service.save(ME, { decisions: [], no_new_action: false, ...body } as SaveTeamReview)

  it('crée l’action au plan du compte, la délègue à son responsable avec une note de contexte', async () => {
    const out = await save({ decisions: [decision] })

    expect(planItems.createFromPlan).toHaveBeenCalledWith(
      ME,
      expect.objectContaining({
        account_id: ACCOUNT,
        label: 'Confirmer le périmètre et le budget',
        reason: 'Aucune action ouverte sur le compte.',
        due_date: '2026-10-27',
        target: null,
      }),
    )
    // Déléguer à un AUTRE membre exige la note : c'est le plan qui la réclame.
    expect(planItems.update).toHaveBeenCalledWith(
      ME,
      ITEM,
      expect.objectContaining({ assigned_to: OWNER, handoff_note: expect.stringContaining('point d’équipe') }),
    )
    expect(out).toEqual({
      review_id: REVIEW,
      results: [{ topic_id: 'dateless:o2', item_id: ITEM, outcome: 'created' }],
    })
  })

  it('N2 — une action déjà au plan est MISE À JOUR, jamais dupliquée (rejouer le point ne crée rien)', async () => {
    planItems.createFromPlan.mockResolvedValue({ id: ITEM, added: false })
    const first = await save({ decisions: [decision] })
    const second = await save({ decisions: [decision] })

    expect(first.results[0]?.outcome).toBe('updated')
    expect(second.results[0]?.outcome).toBe('updated')
    expect(second.results[0]?.item_id).toBe(first.results[0]?.item_id)
  })

  it('une décision sur une action existante : mise à jour de l’échéance et du responsable, aucune création', async () => {
    await save({ decisions: [{ ...decision, existing_item_id: ITEM }] })

    expect(planItems.createFromPlan).not.toHaveBeenCalled()
    expect(planItems.update).toHaveBeenCalledWith(
      ME,
      ITEM,
      expect.objectContaining({ due_date: '2026-10-27', assigned_to: OWNER }),
    )
  })

  it('refuse une action existante qui n’est pas de CET espace — rien n’est écrit', async () => {
    planItems.itemInWorkspace.mockResolvedValue(false)
    await expect(save({ decisions: [{ ...decision, existing_item_id: ITEM }] })).rejects.toBeInstanceOf(
      NotFoundException,
    )
    expect(planItems.update).not.toHaveBeenCalled()
    expect(reviews.save).not.toHaveBeenCalled()
  })

  it('le responsable est l’auteur du point : pas de délégation, donc pas de note', async () => {
    await save({ decisions: [{ ...decision, owner_id: ME }] })
    expect(planItems.update).not.toHaveBeenCalled()
  })

  it('N3 — « Point sans nouvelle action » : la note est gardée, aucune ligne de plan n’est écrite', async () => {
    const out = await save({ decisions: [], no_new_action: true, note: 'On en reparle jeudi.' })

    expect(planItems.createFromPlan).not.toHaveBeenCalled()
    expect(planItems.update).not.toHaveBeenCalled()
    expect(reviews.create).toHaveBeenCalledWith(
      expect.objectContaining({ workspace_id: 'ws-1', held_by: ME, note: 'On en reparle jeudi.', no_new_action: true }),
    )
    expect(out).toEqual({ review_id: REVIEW, results: [] })
  })

  it('garde le compte rendu : qui, quel espace, les décisions et leur issue', async () => {
    await save({ decisions: [decision], note: 'Priorité SG.' })
    expect(reviews.create).toHaveBeenCalledWith(
      expect.objectContaining({
        workspace_id: 'ws-1',
        held_by: ME,
        note: 'Priorité SG.',
        no_new_action: false,
        decisions: [expect.objectContaining({ topic_id: 'dateless:o2', item_id: ITEM, outcome: 'created' })],
      }),
    )
  })
})
