import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common'
import { OTP_CODE_EXPIRATION_MINUTES } from '@bellum/contracts'
import { randomInt, timingSafeEqual } from 'crypto'
import type Redis from 'ioredis'
import { OTP_REDIS_TOKEN } from './otp-redis.token'

const OTP_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

type OtpFailureCode =
  | 'otp_invalid' //  code doesn't match the stored hash
  | 'otp_expired' //  no code in Redis (TTL expired or never sent)
  | 'otp_throttled' //  send() called too soon after the previous one
  | 'otp_max_attempts' //  too many failed verify() in a row

type OtpResult<T = void> = { ok: true; value: T } | { ok: false; code: OtpFailureCode }

const OTP_TTL_SECONDS: number = OTP_CODE_EXPIRATION_MINUTES * 60

/** Throttle a new send() per email. Prevents a malicious client from
 *  triggering arbitrary email volume by re-spamming /resend. */
const SEND_THROTTLE_SECONDS = 60

/** After N failed verify() attempts in a row, the code is wiped and the
 *  user has to request a new one. Mitigates brute-force on a stable code. */
const MAX_ATTEMPTS = 5

const OTP_LENGTH = 6

@Injectable()
export class OtpService implements OnModuleDestroy {
  constructor(@Inject(OTP_REDIS_TOKEN) private readonly redis: Redis) {}

  async onModuleDestroy(): Promise<void> {
    // Intentionally no .quit() — the client is shared via DI and the framework
    // lifecycle disconnects it on shutdown.
  }

  async send(emailLower: string): Promise<OtpResult<{ code: string }>> {
    const throttleKey = this.throttleKey(emailLower)
    const acquired = await this.redis.set(throttleKey, '1', 'EX', SEND_THROTTLE_SECONDS, 'NX')
    if (acquired !== 'OK') {
      return { ok: false, code: 'otp_throttled' }
    }

    const code = this.generateCode()
    await this.redis
      .multi()
      .set(this.codeKey(emailLower), code, 'EX', OTP_TTL_SECONDS)
      .del(this.attemptsKey(emailLower))
      .exec()

    return { ok: true, value: { code } }
  }

  // Constant-time compare; candidate is upper-cased so input is case-insensitive.
  async verify(emailLower: string, candidate: string): Promise<OtpResult> {
    const storedCode = await this.redis.get(this.codeKey(emailLower))
    if (!storedCode) {
      return { ok: false, code: 'otp_expired' }
    }

    const normalized = candidate.trim().toUpperCase()
    const a = Buffer.from(storedCode)
    const b = Buffer.from(normalized)
    const matches = a.length === b.length && timingSafeEqual(a, b)

    if (!matches) {
      const attempts = await this.redis.incr(this.attemptsKey(emailLower))
      // Mirror the code TTL on the attempts counter so a stale counter
      // doesn't lock out a future legitimate code.
      if (attempts === 1) {
        await this.redis.expire(this.attemptsKey(emailLower), OTP_TTL_SECONDS)
      }
      if (attempts >= MAX_ATTEMPTS) {
        await this.invalidate(emailLower)
        return { ok: false, code: 'otp_max_attempts' }
      }
      return { ok: false, code: 'otp_invalid' }
    }

    await this.invalidate(emailLower) // single-use
    return { ok: true, value: undefined }
  }

  /** Drop the code + attempts counter; keeps the throttle key alive so a
   *  fresh send still has to wait for the cooldown. */
  async invalidate(emailLower: string): Promise<void> {
    await this.redis.del(this.codeKey(emailLower), this.attemptsKey(emailLower))
  }

  private generateCode(): string {
    // `randomInt` upper bound is exclusive — picking from `[0, len)` keeps
    // the distribution uniform across the alphabet (modulo bias would skew
    // it if we used `randomBytes` + modulo on a non-power-of-two charset).
    let code = ''
    for (let i = 0; i < OTP_LENGTH; i++) {
      code += OTP_ALPHABET[randomInt(0, OTP_ALPHABET.length)]
    }
    return code
  }

  private codeKey(emailLower: string): string {
    return `otp:code:${emailLower}`
  }

  private attemptsKey(emailLower: string): string {
    return `otp:attempts:${emailLower}`
  }

  private throttleKey(emailLower: string): string {
    return `otp:throttle:${emailLower}`
  }
}
