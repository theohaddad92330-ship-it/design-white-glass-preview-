import type { SessionResponse } from '@bellum/contracts'
import { assertSuccess, isFailure } from '@bellum/utils'
import { CredentialsAuthService } from './credentials-auth.service'
import type { EmailVerificationService } from './email-verification.service'
import type { MfaService } from './mfa.service'
import type { SessionService } from './session.service'
import type { MailerQueue } from '../mailer/mailer.queue'
import type { OtpService } from '../otp/otp.service'
import type { SupabaseAuthGateway } from './supabase-auth.gateway'

/** File d'e-mails en double : `newEmailSenderWorker` ne fait qu'y déposer. */
function mailerQueueStub(enqueue: jest.Mock = jest.fn(async () => undefined)): MailerQueue {
  return { add: enqueue, enqueue } as unknown as MailerQueue
}

const USER = '11111111-1111-1111-1111-111111111111'
const FAKE_SESSION: SessionResponse = {
  access_token: 'at',
  refresh_token: 'rt',
  expires_at: 123,
  user: { id: USER, email: 'u@x.com', email_confirmed_at: null, created_at: 'now', roles: ['customer'] },
}

type SignInResult = {
  data: { session: { access_token: string } | null; user: { id: string; email: string } | null }
  error: { message: string } | null
}

function setup(signIn: SignInResult) {
  const signInWithPassword = jest.fn(async () => signIn)
  const gateway = { client: { auth: { signInWithPassword } } } as unknown as SupabaseAuthGateway
  const mapToSessionResponse = jest.fn(() => FAKE_SESSION)
  const sessionService = { mapToSessionResponse } as unknown as SessionService
  const emailVerification = { resendForUser: jest.fn() } as unknown as EmailVerificationService
  const isEnabled = jest.fn(async () => false)
  const issueMfaToken = jest.fn(async () => 'MFA_TOKEN')
  const mfa = { isEnabled, issueMfaToken } as unknown as MfaService
  const otpService = { send: jest.fn(), verify: jest.fn() } as unknown as OtpService
  const svc = new CredentialsAuthService(gateway, sessionService, emailVerification, mfa, otpService, mailerQueueStub())
  return { svc, mapToSessionResponse, isEnabled, issueMfaToken }
}

const OK_SIGN_IN: SignInResult = {
  data: { session: { access_token: 'raw' }, user: { id: USER, email: 'u@x.com' } },
  error: null,
}

describe('CredentialsAuthService.login', () => {
  it('issues a session unchanged when the account has no 2FA', async () => {
    const { svc, mapToSessionResponse, issueMfaToken } = setup(OK_SIGN_IN)

    const outcome = assertSuccess(await svc.login('u@x.com', 'pw'))

    expect(outcome).toEqual({ status: 'authenticated', session: FAKE_SESSION })
    expect(mapToSessionResponse).toHaveBeenCalledTimes(1)
    expect(issueMfaToken).not.toHaveBeenCalled()
  })

  it('returns mfa_required (no session) when the account has 2FA enabled', async () => {
    const { svc, mapToSessionResponse, isEnabled } = setup(OK_SIGN_IN)
    isEnabled.mockResolvedValueOnce(true)

    const outcome = assertSuccess(await svc.login('u@x.com', 'pw'))

    expect(outcome).toEqual({ status: 'mfa_required', mfaRequired: true, mfaToken: 'MFA_TOKEN' })
    // The session is NOT mapped/issued at this step.
    expect(mapToSessionResponse).not.toHaveBeenCalled()
  })

  it('rejects invalid credentials', async () => {
    const { svc } = setup({ data: { session: null, user: null }, error: { message: 'Invalid login credentials' } })

    const result = await svc.login('u@x.com', 'bad')
    expect(result.type).toBe('failure')
  })
})

/**
 * Harnais du code par e-mail.
 *
 * Il câblait `signInWithOtp` de Supabase ; ce chemin est supprimé — son gabarit
 * envoyait un LIEN là où l'écran demandait six caractères (retour Laura, 14/08).
 * On câble désormais NOTRE service OTP, plus la frappe de session par lien à
 * usage unique, seul emprunt restant à Supabase.
 */
function setupOtp() {
  const generateLink = jest.fn(async () => ({
    data: { properties: { hashed_token: 'hashed' } },
    error: null as { message: string } | null,
  }))
  const verifyOtp = jest.fn(async () => OK_SIGN_IN)
  const findUserByEmail = jest.fn(async () => ({
    id: USER,
    email: 'u@x.com',
    user_metadata: { first_name: 'Laura' },
  }))
  const gateway = {
    client: { auth: { verifyOtp, admin: { generateLink } } },
    findUserByEmail,
  } as unknown as SupabaseAuthGateway
  const mapToSessionResponse = jest.fn(() => FAKE_SESSION)
  const sessionService = { mapToSessionResponse } as unknown as SessionService
  const emailVerification = {} as unknown as EmailVerificationService
  const isEnabled = jest.fn(async () => false)
  const issueMfaToken = jest.fn(async () => 'MFA_TOKEN')
  const mfa = { isEnabled, issueMfaToken } as unknown as MfaService
  const send = jest.fn(async () => ({ ok: true, value: { code: 'A2B3C4' } }))
  const verify = jest.fn(async () => ({ ok: true, value: undefined }))
  const otpService = { send, verify } as unknown as OtpService
  const enqueue = jest.fn(async () => undefined)
  const svc = new CredentialsAuthService(
    gateway,
    sessionService,
    emailVerification,
    mfa,
    otpService,
    mailerQueueStub(enqueue),
  )
  return {
    svc,
    findUserByEmail,
    generateLink,
    verifyOtp,
    mapToSessionResponse,
    isEnabled,
    issueMfaToken,
    send,
    verify,
    enqueue,
  }
}

describe('CredentialsAuthService.requestOtp', () => {
  it('envoie NOTRE code par NOTRE gabarit — plus aucun lien magique', async () => {
    const { svc, send, enqueue } = setupOtp()

    const result = await svc.requestOtp('u@x.com')

    expect(result.type).toBe('success')
    expect(send).toHaveBeenCalledWith('u@x.com')
    // Le code part par la file d'e-mails du produit : c'est ce qui garantit que
    // le destinataire reçoit six caractères et pas un bouton à cliquer.
    expect(enqueue).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(enqueue.mock.calls[0])).toContain('A2B3C4')
  })

  it('normalise l’adresse avant de chercher le compte', async () => {
    const { svc, findUserByEmail, send } = setupOtp()

    await svc.requestOtp('  Laura@Skaizen.FR ')

    expect(findUserByEmail).toHaveBeenCalledWith('laura@skaizen.fr')
    expect(send).toHaveBeenCalledWith('laura@skaizen.fr')
  })

  it('répond succès sur une adresse inconnue, sans envoyer d’e-mail', async () => {
    // Répondre autrement ferait de cet écran un test d'existence de comptes.
    const { svc, findUserByEmail, send, enqueue } = setupOtp()
    findUserByEmail.mockResolvedValueOnce(null as never)

    const result = await svc.requestOtp('inconnu@x.com')

    expect(result.type).toBe('success')
    expect(send).not.toHaveBeenCalled()
    expect(enqueue).not.toHaveBeenCalled()
  })

  it('répond succès quand l’envoi est limité — le front propose de renvoyer', async () => {
    const { svc, enqueue, send } = setupOtp()
    send.mockResolvedValueOnce({ ok: false, code: 'otp_throttled' } as never)

    const result = await svc.requestOtp('u@x.com')

    expect(result.type).toBe('success')
    expect(enqueue).not.toHaveBeenCalled()
  })
})

describe('CredentialsAuthService.verifyOtp', () => {
  it('échange le code contre une session authentifiée', async () => {
    const { svc, verify, mapToSessionResponse } = setupOtp()

    const outcome = assertSuccess(await svc.verifyOtp('u@x.com', 'A2B3C4'))

    expect(verify).toHaveBeenCalledWith('u@x.com', 'A2B3C4')
    expect(outcome).toEqual({ status: 'authenticated', session: FAKE_SESSION })
    expect(mapToSessionResponse).toHaveBeenCalledTimes(1)
  })

  it('rend la même issue pour un code faux et pour une adresse inconnue', async () => {
    const { svc, findUserByEmail, verify } = setupOtp()
    verify.mockResolvedValueOnce({ ok: false, code: 'otp_invalid' } as never)
    const badCode = await svc.verifyOtp('u@x.com', 'ZZZZZZ')

    findUserByEmail.mockResolvedValueOnce(null as never)
    const unknownEmail = await svc.verifyOtp('inconnu@x.com', 'A2B3C4')

    expect(isFailure(badCode)).toBe(true)
    expect(isFailure(unknownEmail)).toBe(true)
    if (isFailure(badCode) && isFailure(unknownEmail)) {
      expect(badCode.problem.code).toBe('otp_invalid')
      expect(unknownEmail.problem.code).toBe('otp_invalid')
    }
  })

  it('ne frappe AUCUNE session pour un compte à double facteur', async () => {
    // Le code par e-mail prouve l'accès à la boîte, pas la possession du second
    // facteur : le contourner viderait la 2FA de son sens.
    const { svc, generateLink, isEnabled, issueMfaToken, mapToSessionResponse } = setupOtp()
    isEnabled.mockResolvedValueOnce(true)

    const outcome = assertSuccess(await svc.verifyOtp('u@x.com', 'A2B3C4'))

    expect(outcome).toEqual({ status: 'mfa_required', mfaRequired: true, mfaToken: 'MFA_TOKEN' })
    expect(generateLink).not.toHaveBeenCalled()
    expect(issueMfaToken).toHaveBeenCalledWith(USER)
    expect(mapToSessionResponse).not.toHaveBeenCalled()
  })
})
