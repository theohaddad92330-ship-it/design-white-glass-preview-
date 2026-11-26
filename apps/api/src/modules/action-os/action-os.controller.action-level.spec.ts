import type { CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { ActionOsController } from './action-os.controller'
import type { RunPrincipal } from './workflow-runner.service'

/**
 * #2896 / #2449.35 — LE NIVEAU RÉGLÉ ACCOMPAGNE LE CLIC.
 *
 * Le niveau vit dans le sac `user_preferences` ; c'est le CONTRÔLEUR qui le lit
 * (orchestration au bord, GA-07) et le pose sur le principal que `confirm` et
 * `runPlan` passent jusqu'à la porte du routeur. Sans réglage : aucun mandat,
 * le chemin reste celui d'avant.
 */
const RUN = '7a0c2f10-0000-4000-8000-000000000001'
const TURN = '33333333-3333-4333-8333-333333333333'
const user = { userId: 'u-1', email: 'rep@esn.fr' } as CurrentUserPayload

function build(preferences: Record<string, unknown> | null) {
  const cards = {
    confirm: jest.fn(async (_runId: string, _principal: RunPrincipal) => ({ id: RUN })),
    runPlan: jest.fn(async (_turnId: string, _principal: RunPrincipal, _mode: string) => ({
      cards: [],
      launched: [],
      refused: [],
    })),
  }
  const userPreferences = {
    findOne: jest.fn(async () => (preferences ? { user_id: 'u-1', preferences } : null)),
  }
  const controller = new ActionOsController(
    {} as never, // runner
    {} as never, // workspaceContext
    {} as never, // tools
    {} as never, // runs
    {} as never, // approvals
    {} as never, // accounts
    {} as never, // contacts
    {} as never, // crmConnections
    {} as never, // profiles
    cards as never,
    {} as never, // lauraJobs
    userPreferences as never,
  )
  return { controller, cards, userPreferences }
}

describe('ActionOsController — le niveau d’action réglé part avec le clic (#2449.35)', () => {
  it('confirmer une carte porte le niveau réglé', async () => {
    const { controller, cards, userPreferences } = build({ copilotActionLevel: 'prepare' })
    await controller.confirmCard(user, RUN, {})

    expect(userPreferences.findOne).toHaveBeenCalledWith({ where: { user_id: 'u-1' } })
    expect(cards.confirm).toHaveBeenCalledWith(RUN, expect.objectContaining({ userId: 'u-1', actionLevel: 'prepare' }))
  })

  it('lancer le plan porte le même niveau à chaque étape', async () => {
    const { controller, cards } = build({ copilotActionLevel: 'respond_only' })
    await controller.runCopilotPlan(user, TURN, { mode: 'all' })

    expect(cards.runPlan).toHaveBeenCalledWith(TURN, expect.objectContaining({ actionLevel: 'respond_only' }), 'all')
  })

  it('NON : sans réglage (ou sans sac), aucun mandat n’est inventé', async () => {
    for (const bag of [null, { replyTone: 'formal' }, { copilotActionLevel: 'automate' }]) {
      const { controller, cards } = build(bag)
      await controller.confirmCard(user, RUN, {})
      expect(cards.confirm.mock.calls[0][1]).not.toHaveProperty('actionLevel')
    }
  })
})
