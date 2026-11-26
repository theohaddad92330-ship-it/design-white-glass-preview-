import { BadGatewayException, ServiceUnavailableException } from '@nestjs/common'
import { HttpError, HttpRetriesExhaustedError, HttpTimeoutError, TechnicalError } from '@bellum/errors'
import type { OnboardingReformulateResponse } from '@bellum/contracts'
import type { CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import type { IaClient } from '../ia/ia.client'
import type { WorkspaceContextService } from '../workspace/workspace-context.service'
import type { ActivationService } from './activation.service'
import type { FramingService } from './framing.service'
import { OnboardingController } from './onboarding.controller'
import type { OnboardingService } from './onboarding.service'

/**
 * #2060.9 — « Laura reformule, l'utilisateur valide avant enregistrement ».
 *
 * Ce fichier prouve le PROXY (le contrôleur ne fait que relayer vers
 * `IaClient.reformulateOnboardingAnswer` et traduire ses échecs) :
 *
 * * elle n'ÉCRIT rien (aucun appel à `onboarding.saveAnswers`) ;
 * * un échec du fournisseur devient une erreur HTTP claire (503 « non
 *   abouti », 502 sinon) — jamais une reformulation inventée côté serveur ;
 * * la route est gratuite (couverte par `onboarding-is-free.spec.ts` : ce
 *   fichier ne référence pas `CreditsService`) ;
 * * en démonstration, elle n'appelle JAMAIS `IaClient.reformulateOnboardingAnswer`
 *   (`demo-model-calls.spec.ts`, craft rule n°9 : parité démo).
 */

const user = { userId: 'u-1', email: 'commercial@kicklox.test' } as CurrentUserPayload

function build(reformulate?: () => Promise<OnboardingReformulateResponse>, isDemoWorkspace = false) {
  const onboarding = {
    saveAnswers: jest.fn(),
  } as unknown as jest.Mocked<Pick<OnboardingService, 'saveAnswers'>>
  const ia = {
    reformulateOnboardingAnswer: jest.fn(reformulate ?? (async () => ({ reformulated: 'Version reformulée.' }))),
  } as unknown as jest.Mocked<Pick<IaClient, 'reformulateOnboardingAnswer'>>
  const workspaceContext = {
    isDemoWorkspace: jest.fn().mockResolvedValue(isDemoWorkspace),
  } as unknown as jest.Mocked<Pick<WorkspaceContextService, 'isDemoWorkspace'>>

  return {
    onboarding,
    ia,
    workspaceContext,
    controller: new OnboardingController(
      onboarding as unknown as OnboardingService,
      {} as unknown as ActivationService,
      ia as unknown as IaClient,
      workspaceContext as unknown as WorkspaceContextService,
      {} as unknown as FramingService,
    ),
  }
}

describe('OnboardingController — POST /onboarding/reformulate-answer', () => {
  it('relays the question label and answer text to the IA client', async () => {
    const built = build()
    const result = await built.controller.reformulateAnswer(user, {
      questionLabel: 'Quel est ton principal frein commercial ?',
      answerText: 'pas trop le temps de prospecter',
      locale: 'fr',
    })
    expect(built.ia.reformulateOnboardingAnswer).toHaveBeenCalledWith({
      questionLabel: 'Quel est ton principal frein commercial ?',
      answerText: 'pas trop le temps de prospecter',
      locale: 'fr',
    })
    expect(result).toEqual({ reformulated: 'Version reformulée.' })
  })

  it('never writes anything — persisting is a separate, user-chosen step', async () => {
    const built = build()
    await built.controller.reformulateAnswer(user, {
      questionLabel: 'Question ?',
      answerText: 'réponse',
      locale: 'fr',
    })
    expect(built.onboarding.saveAnswers).not.toHaveBeenCalled()
  })

  it('en démonstration, ne touche jamais le client IA — reformulation scriptée à partir du texte tapé', async () => {
    const built = build(undefined, true)
    const result = await built.controller.reformulateAnswer(user, {
      questionLabel: 'Question ?',
      answerText: 'pas trop le temps de prospecter',
      locale: 'fr',
    })
    expect(built.ia.reformulateOnboardingAnswer).not.toHaveBeenCalled()
    expect(result).toEqual({ reformulated: 'Pas trop le temps de prospecter.' })
  })

  it('maps a 503 from the IA client to a 503 — "non abouti", never a fabricated reformulation', async () => {
    const built = build(async () => {
      throw new HttpError(503, 'reformulation_unavailable', true, '/onboarding/reformulate-answer')
    })
    await expect(
      built.controller.reformulateAnswer(user, { questionLabel: 'Question ?', answerText: 'réponse', locale: 'fr' }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException)
  })

  it('maps a timeout to a 503 — a timeout is "non abouti", not silently retried here', async () => {
    const built = build(async () => {
      throw new HttpTimeoutError(20_000, '/onboarding/reformulate-answer')
    })
    await expect(
      built.controller.reformulateAnswer(user, { questionLabel: 'Question ?', answerText: 'réponse', locale: 'fr' }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException)
  })

  it('unwraps a real HttpClient failure chain (TechnicalError → HttpRetriesExhaustedError → HttpError 503) to a 503', async () => {
    // #2060.9 — `HttpClient.request` (packages/http/src/client.ts) nests a
    // retryable single-attempt failure two deep. A flat `instanceof HttpError`
    // on `err` itself would miss this and always fall through to 502.
    const built = build(async () => {
      const httpError = new HttpError(503, 'reformulation_unavailable', true, '/onboarding/reformulate-answer')
      const exhausted = new HttpRetriesExhaustedError(1, '/onboarding/reformulate-answer', { cause: httpError })
      throw new TechnicalError('HTTP request failed', { cause: exhausted })
    })
    await expect(
      built.controller.reformulateAnswer(user, { questionLabel: 'Question ?', answerText: 'réponse', locale: 'fr' }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException)
  })

  it('maps any other IA failure to a 502, never a 200 with a guessed answer', async () => {
    const built = build(async () => {
      throw new HttpError(502, 'boom', true, '/onboarding/reformulate-answer')
    })
    await expect(
      built.controller.reformulateAnswer(user, { questionLabel: 'Question ?', answerText: 'réponse', locale: 'fr' }),
    ).rejects.toBeInstanceOf(BadGatewayException)
  })
})
