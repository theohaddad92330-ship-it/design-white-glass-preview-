import { JwtService } from '@nestjs/jwt'
import type { Request } from 'express'
import { UserThrottlerGuard } from './user-throttler.guard'

/** `getTracker` est `protected` : on l'expose pour le tester tel quel. */
class TestableGuard extends UserThrottlerGuard {
  track(req: Request): Promise<string> {
    return this.getTracker(req)
  }
}

function request(over: Partial<Request> & Record<string, unknown>): Request {
  return { ip: '10.0.0.1', cookies: {}, headers: {}, ...over } as unknown as Request
}

/** Un JWT de session RÉELLEMENT signé, comme celui qu'un vrai commercial porte. */
function signedSession(sub: string): string {
  // `exp` comme tout jeton Supabase (1 h par défaut).
  return new JwtService().sign({ sub, aud: 'authenticated' }, { secret: 'test-jwt-secret', expiresIn: '1h' })
}

describe('UserThrottlerGuard — le quota suit l’utilisateur, pas la sortie internet', () => {
  const guard = Object.create(TestableGuard.prototype) as TestableGuard

  it('compte par utilisateur une fois la requête authentifiée (req.user posé)', async () => {
    await expect(guard.track(request({ user: { userId: 'u-1' } }))).resolves.toBe('user:u-1')
  })

  it('deux utilisateurs derrière la MÊME IP ne partagent plus leur quota', async () => {
    const a = await guard.track(request({ ip: '203.0.113.7', user: { userId: 'u-1' } }))
    const b = await guard.track(request({ ip: '203.0.113.7', user: { userId: 'u-2' } }))
    expect(a).not.toBe(b)
  })

  it('clé sur l’utilisateur quand le cookie de session porte un JWT VALIDE', async () => {
    const jwt = signedSession('u-9')
    await expect(guard.track(request({ cookies: { 'session:u-9': jwt } }))).resolves.toBe('user:u-9')
  })

  it('retombe sur l’IP pour un visiteur anonyme', async () => {
    await expect(guard.track(request({ ip: '198.51.100.4' }))).resolves.toBe('ip:198.51.100.4')
  })

  // --- Le finding #1 : un cookie forgé ne doit JAMAIS créer un compteur neuf ---

  it('SÉCURITÉ — un cookie session:<forgé> sans JWT valide retombe sur l’IP', async () => {
    await expect(
      guard.track(request({ ip: '198.51.100.9', cookies: { 'session:anything': 'pas-un-jwt' } })),
    ).resolves.toBe('ip:198.51.100.9')
  })

  it('SÉCURITÉ — un attaquant qui fait TOURNER le nom du cookie reste sur UN SEUL compteur (son IP)', async () => {
    const ip = '198.51.100.13'
    const forged = ['session:forged-1', 'session:forged-2', 'session:forged-3']
    const keys = await Promise.all(forged.map(name => guard.track(request({ ip, cookies: { [name]: 'x' } }))))
    // Avant le fix, chaque nom forgé rendait `user:forged-N` (compteur neuf).
    // Après : tout retombe sur la même clé IP → un seul compteur.
    expect(new Set(keys)).toEqual(new Set([`ip:${ip}`]))
  })

  it('SÉCURITÉ — un JWT valide mais signé par une AUTRE clé retombe sur l’IP', async () => {
    const wrong = new JwtService().sign({ sub: 'u-x', aud: 'authenticated' }, { secret: 'la-mauvaise-cle' })
    await expect(guard.track(request({ ip: '198.51.100.21', cookies: { 'session:u-x': wrong } }))).resolves.toBe(
      'ip:198.51.100.21',
    )
  })

  // --- Perf P2 (29/09/2026) : la signature d'un MÊME jeton ne se revérifie pas ---
  // La consigne « décoder seulement l'id » est REFUSÉE : ce garde est APP_GUARD
  // et tourne AVANT le JwtGuard de contrôleur (`app.module.ts:398-401`), donc
  // décoder sans vérifier rouvrirait le finding #1 (test « autre clé » ci-dessus).
  // On mémorise à la place le `sub` d'un jeton DÉJÀ vérifié, jusqu'à son `exp`.

  afterEach(() => jest.restoreAllMocks())

  it('PERF — le même jeton valide n’est vérifié cryptographiquement qu’une fois', async () => {
    const jwt = signedSession('u-perf')
    const verify = jest.spyOn(JwtService.prototype, 'verifyAsync')
    for (let i = 0; i < 3; i++) {
      await expect(guard.track(request({ cookies: { 'session:u-perf': jwt } }))).resolves.toBe('user:u-perf')
    }
    expect(verify).toHaveBeenCalledTimes(1)
  })

  it('SÉCURITÉ — un jeton mémorisé cesse de compter pour l’utilisateur à son expiration', async () => {
    const nowSec = Math.floor(Date.now() / 1000)
    const jwt = new JwtService().sign(
      { sub: 'u-exp', aud: 'authenticated', exp: nowSec + 60 },
      { secret: 'test-jwt-secret' },
    )
    await expect(guard.track(request({ cookies: { 'session:u-exp': jwt } }))).resolves.toBe('user:u-exp')
    jest.spyOn(Date, 'now').mockReturnValue((nowSec + 61) * 1000)
    await expect(guard.track(request({ ip: '198.51.100.30', cookies: { 'session:u-exp': jwt } }))).resolves.toBe(
      'ip:198.51.100.30',
    )
  })

  it('SÉCURITÉ — un jeton forgé n’entre jamais dans le mémo (revérifié, jamais cru)', async () => {
    const wrong = new JwtService().sign({ sub: 'u-f', aud: 'authenticated' }, { secret: 'la-mauvaise-cle' })
    const verify = jest.spyOn(JwtService.prototype, 'verifyAsync')
    for (let i = 0; i < 2; i++) {
      await expect(guard.track(request({ ip: '198.51.100.31', cookies: { 'session:u-f': wrong } }))).resolves.toBe(
        'ip:198.51.100.31',
      )
    }
    expect(verify).toHaveBeenCalledTimes(2)
  })
})

describe('UserThrottlerGuard — les appels IA→API authentifiés par secret interne ne sont pas comptés', () => {
  class SkipGuard extends UserThrottlerGuard {
    skip(ctx: unknown): Promise<boolean> {
      return this.shouldSkip(ctx as never)
    }
  }
  const guard = Object.create(SkipGuard.prototype) as SkipGuard
  const ctx = (path: string, secret?: string) => ({
    switchToHttp: () => ({
      getRequest: () => ({ originalUrl: path, url: path, headers: secret ? { 'x-internal-secret': secret } : {} }),
    }),
  })
  const prev = process.env['INTERNAL_API_SECRET']
  beforeEach(() => {
    process.env['INTERNAL_API_SECRET'] = 'secret-interne-test'
  })
  afterEach(() => {
    if (prev === undefined) delete process.env['INTERNAL_API_SECRET']
    else process.env['INTERNAL_API_SECRET'] = prev
  })

  it('saute le quota pour /internal/* avec le secret valide', async () => {
    await expect(guard.skip(ctx('/internal/copilot/base/identity', 'secret-interne-test'))).resolves.toBe(true)
  })

  it('compte /internal/* sans secret ou avec un mauvais secret', async () => {
    await expect(guard.skip(ctx('/internal/copilot/base/identity'))).resolves.toBe(false)
    await expect(guard.skip(ctx('/internal/copilot/base/identity', 'faux'))).resolves.toBe(false)
  })

  it('compte une route publique même avec le secret', async () => {
    await expect(guard.skip(ctx('/ia/message', 'secret-interne-test'))).resolves.toBe(false)
  })

  it('compte tout si aucun secret n’est configuré', async () => {
    delete process.env['INTERNAL_API_SECRET']
    await expect(guard.skip(ctx('/internal/x', ''))).resolves.toBe(false)
  })
})
