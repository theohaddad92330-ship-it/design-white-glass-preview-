import { BadRequestException } from '@nestjs/common'
import type { CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import type { IaClient } from '../ia/ia.client'
import type { WorkspaceContextService } from '../workspace/workspace-context.service'
import type { ActivationService } from './activation.service'
import type { FramingService } from './framing.service'
import { OnboardingController } from './onboarding.controller'
import type { OnboardingService } from './onboarding.service'

// Théo O onboarding-relecture.N1/N2 — les trois routes du cadrage.

const user = { userId: 'u-1', email: 'commercial@kicklox.test' } as CurrentUserPayload

function build() {
  const framing = {
    getState: jest.fn().mockResolvedValue({ decisions: {}, validated_at: null, validated_digest: null }),
    saveDecision: jest
      .fn()
      .mockResolvedValue({ decisions: { proof: 'retain' }, validated_at: null, validated_digest: null }),
    validate: jest
      .fn()
      .mockResolvedValue({ decisions: {}, validated_at: '2026-10-22T10:00:00.000Z', validated_digest: 'x' }),
  }
  const controller = new OnboardingController(
    {} as OnboardingService,
    {} as ActivationService,
    {} as IaClient,
    {} as WorkspaceContextService,
    framing as unknown as FramingService,
  )
  return { framing, controller }
}

describe('OnboardingController — cadrage', () => {
  it('lit l’état du cadrage de la personne connectée, jamais d’une autre', async () => {
    const { controller, framing } = build()
    await controller.getFraming(user)
    expect(framing.getState).toHaveBeenCalledWith('u-1')
  })

  it('enregistre la décision d’une orientation connue', async () => {
    const { controller, framing } = build()
    await controller.saveFramingDecision(user, 'proof', { decision: 'retain' })
    expect(framing.saveDecision).toHaveBeenCalledWith('u-1', 'proof', 'retain')
  })

  it('refuse une orientation inventée sans rien écrire', async () => {
    const { controller, framing } = build()
    await expect(controller.saveFramingDecision(user, 'inventee', { decision: 'retain' })).rejects.toBeInstanceOf(
      BadRequestException,
    )
    expect(framing.saveDecision).not.toHaveBeenCalled()
  })

  it('valide le cadrage avec l’empreinte reçue', async () => {
    const { controller, framing } = build()
    await controller.validateFraming(user, { digest: 'a'.repeat(64) })
    expect(framing.validate).toHaveBeenCalledWith('u-1', 'a'.repeat(64))
  })
})
