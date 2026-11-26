import { Logger } from '@nestjs/common'
import type { ConfigService } from '@nestjs/config'
import { createHmac } from 'node:crypto'
import type { Repository } from 'typeorm'
import type { AccountEntity } from '../../database/entities/account.entity'
import type { SupabaseService } from '../../supabase/supabase.service'
import type { MailerQueue } from '../mailer/mailer.queue'
import type { ProfileContextService } from '../profile-context/profile-context.service'
import { SupabaseAuthGateway } from './supabase-auth.gateway'
import { SessionService } from './session.service'
import { PasswordResetService } from './password-reset.service'

function makeConfig(): ConfigService {
  const values: Record<string, string> = {
    frontendUrl: 'https://app.bellum.ai',
    supabaseJwtSecret: 'test-reset-signing-secret',
  }
  return {
    get: jest.fn((key: string) => values[key] ?? ''),
    getOrThrow: jest.fn((key: string) => {
      const value = values[key]
      if (!value) throw new Error(`Missing ${key}`)
      return value
    }),
  } as unknown as ConfigService
}

describe('PasswordResetService', () => {
  it('enqueues reset-password email when generateLink returns a token hash', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000)
    const add = jest.fn().mockResolvedValue({})
    const client = {
      auth: {
        admin: {
          generateLink: jest.fn().mockResolvedValue({
            error: null,
            data: {
              properties: { hashed_token: 'abc123' },
              user: { user_metadata: { full_name: 'Jane Doe' } },
            },
          }),
        },
      },
    }
    const supabase = { getClient: () => client } as unknown as SupabaseService
    const gateway = new SupabaseAuthGateway(supabase, makeConfig())
    const profileContext = {} as unknown as ProfileContextService
    const accounts = { count: jest.fn().mockResolvedValue(0) } as unknown as Repository<AccountEntity>
    const sessionService = new SessionService(gateway, profileContext, accounts)
    const config = makeConfig()
    const service = new PasswordResetService(gateway, sessionService, { add } as unknown as MailerQueue, config)

    await service.resetPassword('jane@bellum.ai')

    expect(add).toHaveBeenCalledWith({
      type: 'send_email_reset_password',
      emailType: 'reset-password',
      to: 'jane@bellum.ai',
      firstName: 'Jane',
      resetUrl: expect.stringMatching(
        /^https:\/\/app\.bellum\.ai\/auth\/reset-password\?token_hash=abc123&expires_at=1700000900000&signature=[a-f0-9]{64}$/,
      ),
    })
  })

  /**
   * Le silence anti-énumération protège l'APPELANT, jamais l'exploitant.
   *
   * Défaut trouvé en production le 20/08 : « email envoyé » à l'écran, rien
   * dans la boîte, et pas une ligne nulle part. Sans trace, aucun diagnostic
   * n'était possible.
   */
  describe('quand rien ne peut partir', () => {
    function makeResetService(generateLinkResult: unknown) {
      const add = jest.fn().mockResolvedValue({})
      const client = { auth: { admin: { generateLink: jest.fn().mockResolvedValue(generateLinkResult) } } }
      const supabase = { getClient: () => client } as unknown as SupabaseService
      const gateway = new SupabaseAuthGateway(supabase, makeConfig())
      const sessionService = new SessionService(
        gateway,
        {} as unknown as ProfileContextService,
        { count: jest.fn().mockResolvedValue(0) } as unknown as Repository<AccountEntity>,
      )
      const service = new PasswordResetService(gateway, sessionService, { add } as unknown as MailerQueue, makeConfig())
      return { service, add }
    }

    it('JOURNALISE une panne de génération de lien, sans rien dire à l’appelant', async () => {
      const { service, add } = makeResetService({ error: { message: 'Invalid API key' }, data: null })
      const logged = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)

      const result = await service.resetPassword('francois@akatom.fr')

      // La réponse reste identique : révéler l'échec révélerait aussi
      // l'existence du compte.
      expect(result.type).toBe('success')
      expect(add).not.toHaveBeenCalled()
      expect(logged).toHaveBeenCalled()
      // Jamais l'adresse en clair — le domaine suffit à reconnaître le cas.
      const [, meta] = logged.mock.calls[0] as [string, { tags: Record<string, string> }]
      expect(meta.tags['auth.email_domain']).toBe('akatom.fr')
      expect(JSON.stringify(logged.mock.calls)).not.toContain('francois@')
      logged.mockRestore()
    })

    it('ne crie PAS sur un compte inexistant — c’est un cas normal', async () => {
      const { service, add } = makeResetService({ error: { message: 'User not found' }, data: null })
      const logged = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)

      await service.resetPassword('personne@example.com')

      expect(add).not.toHaveBeenCalled()
      expect(logged).not.toHaveBeenCalled()
      logged.mockRestore()
    })

    it('JOURNALISE une réponse sans erreur ET sans jeton', async () => {
      // Supabase répond « tout va bien » et ne rend rien : c'est exactement le
      // cas qu'il faut voir passer, parce que rien d'autre ne l'expliquera.
      const { service, add } = makeResetService({ error: null, data: { properties: {} } })
      const logged = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)

      await service.resetPassword('jane@bellum.ai')

      expect(add).not.toHaveBeenCalled()
      expect(logged).toHaveBeenCalled()
      logged.mockRestore()
    })
  })

  it('rejects an expired reset link before verifying the Supabase token', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000)
    const verifyOtp = jest.fn()
    const service = makeService({ verifyOtp })

    const result = await service.confirmResetPassword('abc123', 'password123', {
      expiresAt: 1_699_999_999_999,
      signature: signProof('abc123', 1_699_999_999_999),
    })

    expect(result).toEqual({
      type: 'failure',
      problem: { code: 'reset_token_expired', message: 'Lien de réinitialisation expiré' },
    })
    expect(verifyOtp).not.toHaveBeenCalled()
  })

  it('rejects a reset link with a modified signature', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000)
    const verifyOtp = jest.fn()
    const service = makeService({ verifyOtp })

    const result = await service.confirmResetPassword('abc123', 'password123', {
      expiresAt: 1_700_000_900_000,
      signature: '0'.repeat(64),
    })

    expect(result).toEqual({
      type: 'failure',
      problem: { code: 'reset_token_invalid', message: 'Signature du lien invalide' },
    })
    expect(verifyOtp).not.toHaveBeenCalled()
  })
})

function makeService({ verifyOtp }: { verifyOtp: jest.Mock }) {
  const client = { auth: { verifyOtp, admin: {} } }
  const supabase = { getClient: () => client } as unknown as SupabaseService
  const gateway = new SupabaseAuthGateway(supabase, makeConfig())
  const sessionService = {} as SessionService
  const mailerQueue = {} as MailerQueue
  return new PasswordResetService(gateway, sessionService, mailerQueue, makeConfig())
}

function signProof(tokenHash: string, expiresAt: number): string {
  return createHmac('sha256', 'test-reset-signing-secret').update(`${tokenHash}.${expiresAt}`).digest('hex')
}
