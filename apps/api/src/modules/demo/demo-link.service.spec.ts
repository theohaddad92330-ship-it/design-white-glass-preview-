import { ConfigService } from '@nestjs/config'
import { Test } from '@nestjs/testing'
import { failure, isFailure, isSuccess, success } from '@bellum/utils'
import { SessionService } from '../auth/session.service'
import { DemoLinkService } from './demo-link.service'
import { DemoPoolService, type DemoPreparing, type DemoSlot } from './demo-pool.service'

const TOKEN = 'a'.repeat(40)

const demoSession = {
  access_token: 'access',
  refresh_token: 'refresh',
  expires_at: 1_800_000_000,
  user: { id: 'demo-user', email: 'demo@bellum-ai.com' },
}

const demoSlot: DemoSlot = {
  workspaceId: 'ws-demo',
  ownerUserId: 'demo-user',
  slotIndex: 1,
  reused: false,
  provisioned: false,
  recycledActive: false,
}

function build(overrides: {
  token?: string | undefined
  public?: boolean
  slot?: DemoSlot | DemoPreparing | null
  mint?: jest.Mock
  acquire?: jest.Mock
  renewLease?: jest.Mock
}) {
  const acquire = overrides.acquire ?? jest.fn(async () => (overrides.slot === undefined ? demoSlot : overrides.slot))
  const renewLease = overrides.renewLease ?? jest.fn(async () => demoSlot)
  const mintSessionForUserId = overrides.mint ?? jest.fn(async () => success(demoSession))
  const config = {
    get: jest.fn((key: string) => {
      if (key === 'demoLinkToken') return overrides.token
      if (key === 'demoPublic') return overrides.public ? 'true' : 'false'
      return undefined
    }),
  }

  return Test.createTestingModule({
    providers: [
      DemoLinkService,
      { provide: ConfigService, useValue: config },
      { provide: DemoPoolService, useValue: { acquire, renewLease } },
      { provide: SessionService, useValue: { mintSessionForUserId } },
    ],
  })
    .compile()
    .then(m => ({ service: m.get(DemoLinkService), acquire, renewLease, mintSessionForUserId }))
}

describe('DemoLinkService — #3578 aucune salle fraîche prête', () => {
  it('rend l’état « demo_preparing » avec le délai, et ne signe AUCUNE session', async () => {
    const { service, mintSessionForUserId } = await build({
      public: true,
      slot: { preparing: true, retryAfterSeconds: 15 },
    })

    const outcome = await service.redeem(undefined, 'device-1')

    expect(isFailure(outcome) && outcome.problem).toMatchObject({ code: 'demo_preparing', retryAfterSeconds: 15 })
    expect(mintSessionForUserId).not.toHaveBeenCalled()
  })
})

describe('DemoLinkService — #4291 J deux espaces démo', () => {
  it('passe la variante demandée au pool ; sans variante, la démo staffing d’avant', async () => {
    const { service, acquire } = await build({ public: true })

    await service.redeem(undefined, 'device-1', 'forfait_conseil')
    await service.redeem(undefined, 'device-2')

    expect(acquire).toHaveBeenNthCalledWith(1, 'device-1', 'forfait_conseil')
    expect(acquire).toHaveBeenNthCalledWith(2, 'device-2', 'staffing')
  })
})

describe('DemoLinkService (the link Théo sends to prospects)', () => {
  it('is disabled when NEITHER DEMO_PUBLIC nor DEMO_LINK_TOKEN is set — no session without a password', async () => {
    const { service, acquire, mintSessionForUserId } = await build({ token: undefined, public: false })

    expect(service.isEnabled()).toBe(false)
    const outcome = await service.redeem(TOKEN)

    expect(isFailure(outcome) && outcome.problem.code).toBe('demo_disabled')
    expect(acquire).not.toHaveBeenCalled()
    expect(mintSessionForUserId).not.toHaveBeenCalled()
  })

  describe('DEMO_PUBLIC — the plain link, no key in the URL', () => {
    it('opens a session with no token at all', async () => {
      const { service, acquire } = await build({ public: true })

      expect(service.isEnabled()).toBe(true)
      const outcome = await service.redeem()

      expect(isSuccess(outcome) && outcome.output.user.id).toBe('demo-user')
      expect(acquire).toHaveBeenCalled()
    })

    it('ignores a token someone appended anyway', async () => {
      // Un vieux lien `/demo?t=…` qui traîne doit continuer d'ouvrir la démo,
      // pas se faire refuser sur une clé devenue sans objet.
      const { service } = await build({ public: true })

      expect(isSuccess(await service.redeem('nimporte-quoi'))).toBe(true)
    })

    it('still refuses when no demo workspace has been provisioned', async () => {
      const { service } = await build({ public: true, slot: null })

      const outcome = await service.redeem()

      expect(isFailure(outcome) && outcome.problem.code).toBe('no_demo_workspace')
    })
  })

  it('refuses a wrong token without leasing a room', async () => {
    const { service, acquire, mintSessionForUserId } = await build({ token: TOKEN })

    const outcome = await service.redeem('b'.repeat(40))

    expect(isFailure(outcome) && outcome.problem.code).toBe('invalid_token')
    expect(acquire).not.toHaveBeenCalled()
    expect(mintSessionForUserId).not.toHaveBeenCalled()
  })

  it('refuses a token of a different length (no length oracle, no crash)', async () => {
    const { service } = await build({ token: TOKEN })

    const outcome = await service.redeem('short')

    expect(isFailure(outcome) && outcome.problem.code).toBe('invalid_token')
  })

  it('refuses an empty token', async () => {
    const { service } = await build({ token: TOKEN })

    expect(isFailure(await service.redeem(''))).toBe(true)
  })

  it('leases the room BEFORE minting the session', async () => {
    const order: string[] = []
    const acquire = jest.fn(async () => {
      order.push('acquire')
      return demoSlot
    })
    const mint = jest.fn(async () => {
      order.push('mint')
      return success(demoSession)
    })
    const { service } = await build({ token: TOKEN, acquire, mint })

    const outcome = await service.redeem(TOKEN)

    expect(order).toEqual(['acquire', 'mint'])
    expect(isSuccess(outcome) && outcome.output.user.id).toBe('demo-user')
  })

  it('mints the session of the LEASED room, not of a fixed demo account', async () => {
    // C'est ce qui permet à deux prospects d'être en démo en même temps : chacun
    // signe avec l'utilisateur de SA salle, donc ne voit rien de l'autre.
    const acquire = jest.fn(async () => ({
      ...demoSlot,
      workspaceId: 'ws-demo-3',
      ownerUserId: 'demo-user-3',
      slotIndex: 3,
    }))
    const mint = jest.fn(async () => success(demoSession))
    const { service } = await build({ token: TOKEN, acquire, mint })

    await service.redeem(TOKEN)

    expect(mint).toHaveBeenCalledWith('demo-user-3')
  })

  it('passes the browser device to the pool so a reload lands back in the same room', async () => {
    const { service, acquire } = await build({ token: TOKEN })

    await service.redeem(TOKEN, 'device-42')

    expect(acquire).toHaveBeenCalledWith('device-42', 'staffing')
  })

  it('refuses when no demo workspace has been provisioned yet', async () => {
    const { service } = await build({ token: TOKEN, slot: null })

    const outcome = await service.redeem(TOKEN)

    expect(isFailure(outcome) && outcome.problem.code).toBe('no_demo_workspace')
  })

  it('surfaces a minting failure instead of pretending the visitor is signed in', async () => {
    const mint = jest.fn(async () => failure({ code: 'user_not_found', message: 'Utilisateur introuvable' }))
    const { service } = await build({ token: TOKEN, mint })

    const outcome = await service.redeem(TOKEN)

    expect(isFailure(outcome) && outcome.problem.code).toBe('session_failed')
  })
})

describe('DemoLinkService.renew (#3511 — renouvellement silencieux de la session démo)', () => {
  it('re-mints a session for the room the device already holds, without leasing a new one', async () => {
    const { service, acquire, renewLease } = await build({ public: true })

    const outcome = await service.renew('device-A')

    expect(isSuccess(outcome) && outcome.output.user.id).toBe('demo-user')
    expect(renewLease).toHaveBeenCalledWith('device-A')
    expect(acquire).not.toHaveBeenCalled()
  })

  it('refuses a browser with no room — no cookie, or the room went to someone else', async () => {
    const { service, mintSessionForUserId } = await build({ public: true, renewLease: jest.fn(async () => null) })

    const noCookie = await service.renew(null)
    const lost = await service.renew('device-A')

    expect(isFailure(noCookie) && noCookie.problem.code).toBe('no_lease')
    expect(isFailure(lost) && lost.problem.code).toBe('no_lease')
    expect(mintSessionForUserId).not.toHaveBeenCalled()
  })

  it('is as disabled as the link itself', async () => {
    const { service, renewLease } = await build({ token: undefined, public: false })

    const outcome = await service.renew('device-A')

    expect(isFailure(outcome) && outcome.problem.code).toBe('demo_disabled')
    expect(renewLease).not.toHaveBeenCalled()
  })
})

describe('DemoLinkService — R35 : un seul lien magique consommé par navigateur à la fois', () => {
  const slowMint = (): jest.Mock =>
    jest.fn(async () => {
      await new Promise(resolve => setTimeout(resolve, 30))
      return success(demoSession)
    })

  it('trois renew simultanés du même navigateur : UNE consommation du lien, trois réponses identiques', async () => {
    const mint = slowMint()
    const { service, renewLease } = await build({ public: true, mint })

    const outcomes = await Promise.all([
      service.renew('device-A'),
      service.renew('device-A'),
      service.renew('device-A'),
    ])

    expect(mint).toHaveBeenCalledTimes(1)
    expect(renewLease).toHaveBeenCalledTimes(1)
    expect(outcomes.every(o => isSuccess(o))).toBe(true)
  })

  it('trois redeem simultanés du même navigateur : une salle, un seul lien consommé', async () => {
    const mint = slowMint()
    const { service, acquire } = await build({ public: true, mint })

    const outcomes = await Promise.all([
      service.redeem(undefined, 'device-A'),
      service.redeem(undefined, 'device-A'),
      service.redeem(undefined, 'device-A'),
    ])

    expect(acquire).toHaveBeenCalledTimes(1)
    expect(mint).toHaveBeenCalledTimes(1)
    expect(outcomes.every(o => isSuccess(o))).toBe(true)
  })

  it('deux navigateurs différents ne partagent RIEN', async () => {
    const mint = slowMint()
    const { service } = await build({ public: true, mint })

    await Promise.all([service.renew('device-A'), service.renew('device-B')])

    expect(mint).toHaveBeenCalledTimes(2)
  })

  it('un renew APRÈS la fin du précédent consomme un lien neuf (rien n’est retenu)', async () => {
    const mint = slowMint()
    const { service } = await build({ public: true, mint })

    await service.renew('device-A')
    await service.renew('device-A')

    expect(mint).toHaveBeenCalledTimes(2)
  })
})
