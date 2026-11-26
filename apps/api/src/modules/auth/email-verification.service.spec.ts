import type { ConfigService } from '@nestjs/config'
import { assertSuccess, isFailure } from '@bellum/utils'
import type { Repository } from 'typeorm'
import type { AccountEntity } from '../../database/entities/account.entity'
import type { SupabaseService } from '../../supabase/supabase.service'
import type { MailerQueue } from '../mailer/mailer.queue'
import type { OtpService } from '../otp/otp.service'
import type { ProfileContextService } from '../profile-context/profile-context.service'
import { SupabaseAuthGateway } from './supabase-auth.gateway'
import { SessionService } from './session.service'
import { EmailVerificationService } from './email-verification.service'

function makeConfig(overrides: Record<string, string> = {}): ConfigService {
  const defaults: Record<string, string> = {
    frontendUrl: 'https://app.bellum.ai',
    bypassEmailVerification: 'true', // skip OTP gate for these unit tests
  }
  const values = { ...defaults, ...overrides }
  return {
    get: jest.fn((key: string) => values[key] ?? ''),
  } as unknown as ConfigService
}

function makeOtp(): OtpService {
  return {
    send: jest.fn().mockResolvedValue({ ok: true, value: { code: '123456' } }),
    verify: jest.fn().mockResolvedValue({ ok: true, value: undefined }),
    invalidate: jest.fn().mockResolvedValue(undefined),
  } as unknown as OtpService
}

function makeSessionService(gateway: SupabaseAuthGateway): SessionService {
  const profileContext = {} as unknown as ProfileContextService
  const accounts = { count: jest.fn().mockResolvedValue(0) } as unknown as Repository<AccountEntity>
  return new SessionService(gateway, profileContext, accounts)
}

function makeService(supabaseClient: unknown, config: ConfigService, mailerQueue: MailerQueue, otp: OtpService) {
  const supabase = { getClient: () => supabaseClient } as unknown as SupabaseService
  const gateway = new SupabaseAuthGateway(supabase, config)
  const sessionService = makeSessionService(gateway)
  return new EmailVerificationService(gateway, sessionService, mailerQueue, otp)
}

describe('EmailVerificationService', () => {
  it('enqueues welcome email on signup success', async () => {
    const add = jest.fn().mockResolvedValue({})
    const client = {
      auth: {
        signUp: jest.fn().mockResolvedValue({ data: { user: { id: 'u1' }, session: null }, error: null }),
        signInWithPassword: jest.fn().mockResolvedValue({
          data: { session: { access_token: 't', refresh_token: 'r', expires_at: null }, user: { id: 'u1' } },
          error: null,
        }),
        admin: {
          // Pre-flight existence check finds no account → fresh signup path.
          listUsers: jest.fn().mockResolvedValue({ data: { users: [] }, error: null }),
          updateUserById: jest.fn().mockResolvedValue({ error: null }),
        },
      },
    }

    const service = makeService(client, makeConfig(), { add } as unknown as MailerQueue, makeOtp())
    await service.signup('john@bellum.ai', 'password', 'John', 'Doe')

    expect(add).toHaveBeenCalledWith({
      type: 'send_email_welcome',
      emailType: 'welcome',
      to: 'john@bellum.ai',
      firstName: 'John',
      dashboardUrl: 'https://app.bellum.ai/dashboard',
    })
  })

  it('rejects signup with email_taken when a confirmed account already exists', async () => {
    const signUp = jest.fn()
    const client = {
      auth: {
        signUp,
        admin: {
          listUsers: jest.fn().mockResolvedValue({
            data: { users: [{ id: 'existing', email: 'taken@bellum.ai', email_confirmed_at: '2026-01-01T00:00:00Z' }] },
            error: null,
          }),
        },
      },
    }

    const service = makeService(client, makeConfig(), { add: jest.fn() } as unknown as MailerQueue, makeOtp())
    const result = await service.signup('taken@bellum.ai', 'password', 'John', 'Doe')

    expect(isFailure(result)).toBe(true)
    if (!isFailure(result)) return
    expect(result.problem.code).toBe('email_taken')
    // Must short-circuit before creating a second auth user.
    expect(signUp).not.toHaveBeenCalled()
  })

  it('resumes verification (resend OTP) when an unconfirmed account already exists', async () => {
    const signUp = jest.fn()
    const otp = makeOtp()
    const add = jest.fn().mockResolvedValue({})
    const client = {
      auth: {
        signUp,
        admin: {
          listUsers: jest.fn().mockResolvedValue({
            data: {
              users: [{ id: 'pending-id', email: 'pending@bellum.ai', email_confirmed_at: null, user_metadata: {} }],
            },
            error: null,
          }),
        },
      },
    }

    // bypass=false so resendForUser actually sends the OTP.
    const service = makeService(
      client,
      makeConfig({ bypassEmailVerification: 'false' }),
      { add } as unknown as MailerQueue,
      otp,
    )
    const result = await service.signup('pending@bellum.ai', 'password', 'John', 'Doe')

    expect(assertSuccess(result)).toEqual({
      status: 'pending_email_verification',
      user_id: 'pending-id',
      email: 'pending@bellum.ai',
    })
    expect(otp.send).toHaveBeenCalledWith('pending@bellum.ai')
    expect(signUp).not.toHaveBeenCalled()
  })
})
