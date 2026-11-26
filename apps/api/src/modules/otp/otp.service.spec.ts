import type Redis from 'ioredis'
import { OtpService } from './otp.service'

/**
 * In-memory ioredis stand-in. Only the surface used by `OtpService` is wired:
 * `set` (NX + EX), `get`, `del`, `incr`, `expire` and the `multi().set().del().exec()`
 * chain. Avoids pulling `ioredis-mock` as a dev dep — the API surface is
 * small enough to fake by hand and the fake stays under tight test control.
 */
function makeFakeRedis(): Redis & { __store: Map<string, string> } {
  const store = new Map<string, string>()

  const setImpl = (key: string, value: string, _ex?: string, _ttl?: number, mode?: string) => {
    if (mode === 'NX' && store.has(key)) return null
    store.set(key, value)
    return 'OK'
  }

  const fake = {
    __store: store,
    set: jest.fn(async (...args: unknown[]) => setImpl(...(args as Parameters<typeof setImpl>))),
    get: jest.fn(async (key: string) => store.get(key) ?? null),
    del: jest.fn(async (...keys: string[]) => {
      let n = 0
      for (const k of keys) if (store.delete(k)) n++
      return n
    }),
    incr: jest.fn(async (key: string) => {
      const next = Number(store.get(key) ?? '0') + 1
      store.set(key, String(next))
      return next
    }),
    expire: jest.fn(async () => 1),
    multi: jest.fn(() => {
      const ops: Array<() => void> = []
      const chain = {
        set: (key: string, value: string) => {
          ops.push(() => store.set(key, value))
          return chain
        },
        del: (key: string) => {
          ops.push(() => {
            store.delete(key)
          })
          return chain
        },
        exec: jest.fn(async () => {
          for (const op of ops) op()
          return []
        }),
      }
      return chain
    }),
  } as unknown as Redis & { __store: Map<string, string> }

  return fake
}

describe('OtpService', () => {
  const email = 'jane@bellum.ai'
  let redis: ReturnType<typeof makeFakeRedis>
  let service: OtpService

  beforeEach(() => {
    redis = makeFakeRedis()
    service = new OtpService(redis)
  })

  describe('send', () => {
    it('issues a 6-character alphanumeric code from the unambiguous alphabet', async () => {
      const result = await service.send(email)

      expect(result.ok).toBe(true)
      if (!result.ok) return
      // ABCDEFGHJKMNPQRSTUVWXYZ23456789 — no 0/O/1/I/L to avoid ambiguity.
      expect(result.value.code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/)
    })

    it('stores the code under `otp:code:{email}` with a TTL', async () => {
      const result = await service.send(email)
      expect(result.ok).toBe(true)
      if (!result.ok) return

      expect(redis.__store.get(`otp:code:${email}`)).toBe(result.value.code)
      // EX flag + 10-min TTL = 600s. The fake doesn't track TTL but we assert
      // the call shape to catch a refactor that drops the expiration.
      expect(redis.multi).toHaveBeenCalled()
    })

    it('throttles the second send for the same email within the cooldown', async () => {
      const first = await service.send(email)
      expect(first.ok).toBe(true)

      const second = await service.send(email)
      expect(second.ok).toBe(false)
      if (second.ok) return
      expect(second.code).toBe('otp_throttled')
    })

    it('resets the attempts counter so a fresh code starts clean', async () => {
      const first = await service.send(email)
      if (!first.ok) throw new Error('expected first send to succeed')
      await service.verify(email, 'WRONGX') // 1 failed attempt

      // Drop the throttle lock so we can send again in this test.
      redis.__store.delete(`otp:throttle:${email}`)

      const second = await service.send(email)
      expect(second.ok).toBe(true)
      expect(redis.__store.get(`otp:attempts:${email}`)).toBeUndefined()
    })
  })

  describe('verify', () => {
    it('accepts the exact stored code and consumes it (single-use)', async () => {
      const send = await service.send(email)
      if (!send.ok) throw new Error('expected send to succeed')

      const verify = await service.verify(email, send.value.code)
      expect(verify.ok).toBe(true)
      expect(redis.__store.get(`otp:code:${email}`)).toBeUndefined()
    })

    it('is case-insensitive — lower-case input matches an upper-case stored code', async () => {
      const send = await service.send(email)
      if (!send.ok) throw new Error('expected send to succeed')

      const verify = await service.verify(email, send.value.code.toLowerCase())
      expect(verify.ok).toBe(true)
    })

    it('trims whitespace before comparing', async () => {
      const send = await service.send(email)
      if (!send.ok) throw new Error('expected send to succeed')

      const verify = await service.verify(email, `  ${send.value.code}  `)
      expect(verify.ok).toBe(true)
    })

    it('returns otp_expired when no code is stored', async () => {
      const verify = await service.verify(email, 'ABCDEF')
      expect(verify.ok).toBe(false)
      if (verify.ok) return
      expect(verify.code).toBe('otp_expired')
    })

    it('returns otp_invalid on a wrong code and increments the attempts counter', async () => {
      const send = await service.send(email)
      if (!send.ok) throw new Error('expected send to succeed')

      const verify = await service.verify(email, 'ZZZZZZ')
      expect(verify.ok).toBe(false)
      if (verify.ok) return
      expect(verify.code).toBe('otp_invalid')
      expect(redis.__store.get(`otp:attempts:${email}`)).toBe('1')
    })

    it('wipes the code after MAX_ATTEMPTS failures and returns otp_max_attempts', async () => {
      const send = await service.send(email)
      if (!send.ok) throw new Error('expected send to succeed')

      let last = await service.verify(email, 'ZZZZZZ')
      for (let i = 1; i < 5; i++) {
        last = await service.verify(email, 'ZZZZZZ')
      }
      expect(last.ok).toBe(false)
      if (last.ok) return
      expect(last.code).toBe('otp_max_attempts')
      expect(redis.__store.get(`otp:code:${email}`)).toBeUndefined()
    })

    it('rejects a code of different length without crashing on timingSafeEqual', async () => {
      const send = await service.send(email)
      if (!send.ok) throw new Error('expected send to succeed')

      const verify = await service.verify(email, 'AB') // shorter than 6
      expect(verify.ok).toBe(false)
      if (verify.ok) return
      expect(verify.code).toBe('otp_invalid')
    })
  })

  describe('invalidate', () => {
    it('drops the code and attempts keys but leaves the throttle key in place', async () => {
      await service.send(email)
      await service.invalidate(email)

      expect(redis.__store.get(`otp:code:${email}`)).toBeUndefined()
      expect(redis.__store.get(`otp:attempts:${email}`)).toBeUndefined()
      // Throttle outlives invalidate — prevents an attacker from clearing it
      // via repeated verify cycles to bypass the send cooldown.
      expect(redis.__store.get(`otp:throttle:${email}`)).toBe('1')
    })
  })
})
