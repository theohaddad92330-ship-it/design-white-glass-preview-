import type { CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { RoutinesController } from './routines.controller'
import type { RoutinesService } from './routines.service'

/**
 * #2398.13/#2205.38 (épopée #2843) — preuve que la route
 * `GET /routines/no-reply-follow-up/dry-run` est bien MONTÉE et délègue au
 * vrai service, scopée à l'appelant (même patron que les autres routes de ce
 * contrôleur, `@PersonalScope` sur la classe).
 */
const USER: CurrentUserPayload = { userId: 'u-1', email: 'sales@example.com' }

describe('RoutinesController.dryRunNoReplyFollowUp — intégration (#2398.13/#2205.38)', () => {
  it('délègue au service, scopé à l’utilisateur courant', async () => {
    const dryRunNoReplyFollowUp = jest.fn().mockResolvedValue({
      threadsFound: 1,
      oldest: { counterpart: 'client@example.com', daysSinceLastMessage: 9 },
      wouldPrepareDraft: true,
      blockedReason: null,
    })
    const controller = new RoutinesController({ dryRunNoReplyFollowUp } as unknown as RoutinesService)

    const result = await controller.dryRunNoReplyFollowUp(USER)

    expect(dryRunNoReplyFollowUp).toHaveBeenCalledWith('u-1')
    expect(result).toMatchObject({ threadsFound: 1, wouldPrepareDraft: true })
  })
})
