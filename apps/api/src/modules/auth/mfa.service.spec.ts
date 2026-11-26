import { BadRequestException, UnauthorizedException } from '@nestjs/common'
import type { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import type { SessionResponse } from '@bellum/contracts'
import { failure, success } from '@bellum/utils'
import { authenticator } from 'otplib'
import type { Repository } from 'typeorm'
import type { UserMfaEntity } from '../../database/entities/user-mfa.entity'
import { MfaService } from './mfa.service'
import type { SessionService } from './session.service'
import { resolveBrand } from '@bellum/contracts'

/** Le service de marque, réduit à ce que le code testé lui demande : la marque
 *  du PRODUIT, c'est-à-dire un espace qui n'a rien posé. */
const brandsStub = {
  getForUser: jest.fn().mockResolvedValue(resolveBrand(null)),
  getForWorkspace: jest.fn().mockResolvedValue(resolveBrand(null)),
  getSendingAddress: jest.fn().mockResolvedValue(null),
}

/** Minimal in-memory stand-in for the TypeORM repository. */
function makeRepo(initial: Partial<UserMfaEntity> | null = null) {
  const store: { row: Partial<UserMfaEntity> | null } = { row: initial }
  return {
    findOne: jest.fn(async () => store.row),
    insert: jest.fn(async (row: Partial<UserMfaEntity>) => {
      store.row = row
    }),
    update: jest.fn(async (_where: unknown, patch: Partial<UserMfaEntity>) => {
      store.row = { ...store.row, ...patch }
    }),
    delete: jest.fn(async () => {
      store.row = null
    }),
    _store: store,
  } as unknown as Repository<UserMfaEntity> & { _store: typeof store }
}

const USER = '11111111-1111-1111-1111-111111111111'
const FAKE_SESSION: SessionResponse = {
  access_token: 'at',
  refresh_token: 'rt',
  expires_at: 123,
  user: { id: USER, email: 'u@x.com', email_confirmed_at: null, created_at: 'now', roles: ['customer'] },
}

const config = { getOrThrow: () => 'test-jwt-secret' } as unknown as ConfigService

function makeService(repo: Repository<UserMfaEntity>, session?: Partial<SessionService>) {
  const sessionService = {
    mintSessionForUserId: jest.fn(async () => success(FAKE_SESSION)),
    ...session,
  } as unknown as SessionService
  return new MfaService(repo, new JwtService({}), config, sessionService, brandsStub as never)
}

/** A 6-digit code guaranteed to differ from `valid`. */
function wrongCode(valid: string): string {
  return valid === '000000' ? '111111' : '000000'
}

describe('MfaService', () => {
  const OLD = process.env['CRM_TOKEN_ENC_KEY']
  beforeAll(() => {
    process.env['CRM_TOKEN_ENC_KEY'] = 'test-mfa-encryption-key-with-entropy-1234567890'
  })
  afterAll(() => {
    if (OLD === undefined) delete process.env['CRM_TOKEN_ENC_KEY']
    else process.env['CRM_TOKEN_ENC_KEY'] = OLD
  })

  it('enroll stores the secret encrypted and disabled, and returns the QR + secret', async () => {
    const repo = makeRepo(null)
    const svc = makeService(repo)

    const result = await svc.enroll(USER, 'u@x.com')

    expect(result.secret).toMatch(/^[A-Z2-7]+$/) // Base32
    expect(result.otpauthUrl.startsWith('otpauth://totp/')).toBe(true)
    expect(result.qrDataUrl.startsWith('data:image/png;base64,')).toBe(true)

    const row = repo._store.row!
    expect(row.enabled).toBe(false)
    // Never persisted in clear.
    expect(row.secret_encrypted).toMatch(/^v1:/)
    expect(row.secret_encrypted).not.toContain(result.secret)
  })

  it('verify enables the factor for a valid code', async () => {
    const repo = makeRepo(null)
    const svc = makeService(repo)
    const { secret } = await svc.enroll(USER, 'u@x.com')

    expect(await svc.isEnabled(USER)).toBe(false)
    await svc.verifyAndEnable(USER, authenticator.generate(secret))

    expect(repo._store.row!.enabled).toBe(true)
    expect(await svc.isEnabled(USER)).toBe(true)
    expect(await svc.getStatus(USER)).toEqual({ enabled: true })
  })

  it('verify rejects a wrong code and leaves the factor disabled', async () => {
    const repo = makeRepo(null)
    const svc = makeService(repo)
    const { secret } = await svc.enroll(USER, 'u@x.com')

    await expect(svc.verifyAndEnable(USER, wrongCode(authenticator.generate(secret)))).rejects.toBeInstanceOf(
      BadRequestException,
    )
    expect(repo._store.row!.enabled).toBe(false)
  })

  it('verify rejects when there is no pending enrollment', async () => {
    const svc = makeService(makeRepo(null))
    await expect(svc.verifyAndEnable(USER, '123456')).rejects.toBeInstanceOf(BadRequestException)
  })

  it('challenge issues a session for a valid token + code', async () => {
    const repo = makeRepo(null)
    const svc = makeService(repo)
    const { secret } = await svc.enroll(USER, 'u@x.com')
    await svc.verifyAndEnable(USER, authenticator.generate(secret))

    const token = await svc.issueMfaToken(USER)
    const outcome = await svc.challenge(token, authenticator.generate(secret))

    expect(outcome.status).toBe('authenticated')
    if (outcome.status === 'authenticated') {
      expect(outcome.session).toEqual(FAKE_SESSION)
    }
  })

  it('challenge rejects a bad code (400) without minting a session', async () => {
    const repo = makeRepo(null)
    const mint = jest.fn(async () => success(FAKE_SESSION))
    const svc = makeService(repo, { mintSessionForUserId: mint })
    const { secret } = await svc.enroll(USER, 'u@x.com')
    await svc.verifyAndEnable(USER, authenticator.generate(secret))

    const token = await svc.issueMfaToken(USER)
    await expect(svc.challenge(token, wrongCode(authenticator.generate(secret)))).rejects.toBeInstanceOf(
      BadRequestException,
    )
    expect(mint).not.toHaveBeenCalled()
  })

  it('challenge rejects a forged / malformed token (401)', async () => {
    const repo = makeRepo(null)
    const svc = makeService(repo)
    const { secret } = await svc.enroll(USER, 'u@x.com')
    await svc.verifyAndEnable(USER, authenticator.generate(secret))

    await expect(svc.challenge('not-a-jwt', authenticator.generate(secret))).rejects.toBeInstanceOf(
      UnauthorizedException,
    )
  })

  it('challenge surfaces a session-mint failure as 401', async () => {
    const repo = makeRepo(null)
    const mint = jest.fn(async () => failure({ code: 'user_not_found' as const, message: 'nope' }))
    const svc = makeService(repo, { mintSessionForUserId: mint })
    const { secret } = await svc.enroll(USER, 'u@x.com')
    await svc.verifyAndEnable(USER, authenticator.generate(secret))

    const token = await svc.issueMfaToken(USER)
    await expect(svc.challenge(token, authenticator.generate(secret))).rejects.toBeInstanceOf(UnauthorizedException)
  })

  it('disable removes the factor after a valid code', async () => {
    const repo = makeRepo(null)
    const svc = makeService(repo)
    const { secret } = await svc.enroll(USER, 'u@x.com')
    await svc.verifyAndEnable(USER, authenticator.generate(secret))

    await svc.disable(USER, authenticator.generate(secret))
    expect(repo._store.row).toBeNull()
    expect(await svc.isEnabled(USER)).toBe(false)
  })

  it('disable rejects a wrong code and keeps the factor', async () => {
    const repo = makeRepo(null)
    const svc = makeService(repo)
    const { secret } = await svc.enroll(USER, 'u@x.com')
    await svc.verifyAndEnable(USER, authenticator.generate(secret))

    await expect(svc.disable(USER, wrongCode(authenticator.generate(secret)))).rejects.toBeInstanceOf(
      BadRequestException,
    )
    expect(repo._store.row!.enabled).toBe(true)
  })

  // --- Finding #4 : verrou anti-bourrage + anti-rejeu sur le challenge ---

  async function enrolledSvc() {
    const repo = makeRepo(null)
    const mint = jest.fn(async () => success(FAKE_SESSION))
    const svc = makeService(repo, { mintSessionForUserId: mint })
    const { secret } = await svc.enroll(USER, 'u@x.com')
    await svc.verifyAndEnable(USER, authenticator.generate(secret))
    return { repo, svc, secret, mint }
  }

  it('SÉCURITÉ — verrouille le challenge après 5 codes erronés consécutifs', async () => {
    const { svc, secret, mint } = await enrolledSvc()
    const bad = wrongCode(authenticator.generate(secret))

    for (let i = 0; i < 5; i++) {
      const token = await svc.issueMfaToken(USER)
      await expect(svc.challenge(token, bad)).rejects.toBeInstanceOf(BadRequestException)
    }

    // 6e tentative : verrouillé, MÊME avec le bon code, et aucune session émise.
    const token = await svc.issueMfaToken(USER)
    await expect(svc.challenge(token, authenticator.generate(secret))).rejects.toBeInstanceOf(UnauthorizedException)
    expect(mint).not.toHaveBeenCalled()
  })

  it('SÉCURITÉ — un code déjà accepté ne peut pas resservir (anti-rejeu)', async () => {
    const { svc, secret } = await enrolledSvc()
    const code = authenticator.generate(secret)

    const first = await svc.challenge(await svc.issueMfaToken(USER), code)
    expect(first.status).toBe('authenticated')

    // Le MÊME code, encore dans sa fenêtre, est refusé la seconde fois.
    await expect(svc.challenge(await svc.issueMfaToken(USER), code)).rejects.toBeInstanceOf(BadRequestException)
  })

  it('SÉCURITÉ — un succès remet le compteur d’échecs à zéro', async () => {
    const { repo, svc, secret } = await enrolledSvc()
    const bad = wrongCode(authenticator.generate(secret))

    for (let i = 0; i < 3; i++) {
      await expect(svc.challenge(await svc.issueMfaToken(USER), bad)).rejects.toBeInstanceOf(BadRequestException)
    }
    expect(repo._store.row!.failed_attempts).toBe(3)

    await svc.challenge(await svc.issueMfaToken(USER), authenticator.generate(secret))
    expect(repo._store.row!.failed_attempts).toBe(0)
    expect(repo._store.row!.locked_until).toBeNull()
  })
})
