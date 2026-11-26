import { ForbiddenException } from '@nestjs/common'
import type { ExecutionContext } from '@nestjs/common'
import type { PlanFeatureKey } from '@bellum/contracts'
import { PlanFeatureGuard } from './plan-feature.guard'
import { REQUIRE_OPEN_TRIAL_KEY } from './require-feature.decorator'

function context(request: unknown): ExecutionContext {
  return {
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext
}

function build(options: {
  feature?: PlanFeatureKey
  userHas?: boolean
  workspaceHas?: boolean
  openTrial?: boolean
  trialLocked?: boolean
}) {
  // Deux métadonnées lues dans l'ordre : la feature requise, puis `@RequireOpenTrial()`.
  const reflector = {
    getAllAndOverride: jest.fn((key: string) => (key === REQUIRE_OPEN_TRIAL_KEY ? options.openTrial : options.feature)),
  }
  const planFeatures = {
    trialLockedForUser: jest.fn().mockResolvedValue(options.trialLocked ?? false),
    userHas: jest.fn().mockResolvedValue(options.userHas ?? false),
    workspaceHas: jest.fn().mockResolvedValue(options.workspaceHas ?? false),
  }
  return { guard: new PlanFeatureGuard(reflector as never, planFeatures as never), planFeatures }
}

describe('PlanFeatureGuard', () => {
  it('laisse passer une route non annotée sans rien interroger', async () => {
    const { guard, planFeatures } = build({ feature: undefined })
    await expect(guard.canActivate(context({ user: { userId: 'u-1' } }))).resolves.toBe(true)
    // Monter le guard ne doit jamais fermer un handler par accident.
    expect(planFeatures.userHas).not.toHaveBeenCalled()
  })

  it('laisse passer quand le palier porte la feature', async () => {
    const { guard, planFeatures } = build({ feature: 'chat_ai', userHas: true })
    await expect(guard.canActivate(context({ user: { userId: 'u-1' } }))).resolves.toBe(true)
    expect(planFeatures.userHas).toHaveBeenCalledWith('u-1', 'chat_ai')
  })

  it('refuse en NOMMANT la feature manquante', async () => {
    const { guard } = build({ feature: 'chat_ai', userHas: false })
    // Le front doit pouvoir dire « votre offre n'inclut pas le copilote » et
    // renvoyer vers la bonne offre : un 403 muet se lirait comme un bug.
    await expect(guard.canActivate(context({ user: { userId: 'u-1' } }))).rejects.toThrow(ForbiddenException)
    try {
      await guard.canActivate(context({ user: { userId: 'u-1' } }))
    } catch (err) {
      expect((err as ForbiddenException).getResponse()).toMatchObject({
        error: 'feature_not_in_plan',
        feature: 'chat_ai',
      })
    }
  })

  it("résout par workspace quand le principal est une clé d'API", async () => {
    const { guard, planFeatures } = build({ feature: 'public_api', workspaceHas: true })
    await expect(guard.canActivate(context({ apiKey: { workspaceId: 'ws-1' } }))).resolves.toBe(true)
    expect(planFeatures.workspaceHas).toHaveBeenCalledWith('ws-1', 'public_api')
    expect(planFeatures.userHas).not.toHaveBeenCalled()
  })

  it('refuse un appel sans principal attribuable', async () => {
    const { guard } = build({ feature: 'public_api', userHas: true, workspaceHas: true })
    await expect(guard.canActivate(context({}))).rejects.toThrow(ForbiddenException)
  })
})

// #4629.2 — `@RequireOpenTrial()` : le chat et Découvrir COÛTENT du modèle, un essai terminé les ferme.
describe('#4629.2 — PlanFeatureGuard et le verrou d’essai', () => {
  it('REFUSE un essai terminé en énumérant ce qui reste ouvert, sans chiffre', async () => {
    const { guard } = build({ feature: 'chat_ai', userHas: true, openTrial: true, trialLocked: true })
    const refusal = await guard.canActivate(context({ user: { userId: 'owner-1' } })).catch((err: unknown) => err)
    expect(refusal).toBeInstanceOf(ForbiddenException)
    const body = (refusal as ForbiddenException).getResponse() as { error: string; message: string }
    expect(body.error).toBe('trial_locked')
    expect(body.message).toMatch(/Restent ouverts/)
    expect(body.message).toMatch(/le chat avec Laura/)
    expect(body.message).not.toMatch(/\d/)
  })

  it('laisse passer un essai ouvert, et une route sans @RequireOpenTrial même verrouillée', async () => {
    const open = build({ feature: 'chat_ai', userHas: true, openTrial: true, trialLocked: false })
    await expect(open.guard.canActivate(context({ user: { userId: 'u-1' } }))).resolves.toBe(true)
    const unmarked = build({ feature: 'chat_ai', userHas: true, openTrial: undefined, trialLocked: true })
    await expect(unmarked.guard.canActivate(context({ user: { userId: 'u-1' } }))).resolves.toBe(true)
    expect(unmarked.planFeatures.trialLockedForUser).not.toHaveBeenCalled()
  })

  it('une clé d’API (sans utilisateur) n’est pas concernée : la porte lit l’essai d’un humain', async () => {
    const { guard, planFeatures } = build({
      feature: 'public_api',
      workspaceHas: true,
      openTrial: true,
      trialLocked: true,
    })
    await expect(guard.canActivate(context({ apiKey: { workspaceId: 'ws-1' } }))).resolves.toBe(true)
    expect(planFeatures.trialLockedForUser).not.toHaveBeenCalled()
  })
})
