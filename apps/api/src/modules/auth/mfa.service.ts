import { BadRequestException, Inject, Injectable, Logger, UnauthorizedException, forwardRef } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import { InjectRepository } from '@nestjs/typeorm'
import type { AuthOutcome, MfaEnrollResponse, MfaStatus } from '@bellum/contracts'
import { isFailure } from '@bellum/utils'
import { authenticator } from 'otplib'
import { toDataURL } from 'qrcode'
import { Repository } from 'typeorm'
import { UserMfaEntity } from '../../database/entities/user-mfa.entity'
import { decryptToken, encryptToken } from '../crm/crm-token.crypto'
import { SessionService } from './session.service'
import { WorkspaceBrandService } from '../workspace/workspace-brand.service'

/**
 * L'ÉMETTEUR affiché dans Google Authenticator / 1Password / etc.
 *
 * ⚠️ Il porte la marque de l'ESPACE depuis le 01/09/2026 (marque blanche) —
 * c'est le nom que l'utilisateur voit CHAQUE FOIS qu'il ouvre son application
 * d'authentification, sur son téléphone, hors de tout écran que nous
 * contrôlons.
 *
 * Il est fixé à l'ENRÔLEMENT et gravé dans le QR code : renommer un espace ne
 * renomme pas les inscriptions déjà faites. C'est un défaut acceptable — le
 * secret, lui, ne change pas, donc les codes continuent de fonctionner — et il
 * n'a pas de correctif : nous ne pouvons pas réécrire ce qui vit dans
 * l'application d'un utilisateur.
 */

/** Accept the adjacent 30 s step either side of "now" so a small client/server
 *  clock drift doesn't reject an otherwise-correct code (RFC 6238 §5.2). */
const totp = authenticator.clone({ window: 1 })

/** The pending-login token is intentionally short: just long enough to type a
 *  code from an authenticator app. */
const MFA_TOKEN_TTL = '5m'

/** Distinct audience so this token can NEVER be replayed as a Supabase session
 *  JWT — the passport strategy pins `aud: 'authenticated'` and rejects this. */
const MFA_TOKEN_AUDIENCE = 'bellum:2fa-challenge'

/** Codes erronés consécutifs tolérés avant de verrouiller le challenge (finding #4). */
const MFA_MAX_ATTEMPTS = 5

/** Durée du verrou après dépassement du seuil. */
const MFA_LOCK_MS = 15 * 60 * 1000

type MfaTokenPayload = { sub?: string; purpose?: string }

/**
 * TOTP two-factor authentication (RFC 6238). Secrets are stored AES-256-GCM
 * encrypted at rest (same helper as the CRM tokens). The pending-login step is
 * carried by a short-lived signed `mfaToken` that binds only the userId — the
 * session tokens are minted fresh at challenge time and never travel through JS.
 */
@Injectable()
export class MfaService {
  constructor(
    @InjectRepository(UserMfaEntity)
    private readonly repo: Repository<UserMfaEntity>,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly sessionService: SessionService,
    @Inject(forwardRef(() => WorkspaceBrandService))
    private readonly brands: WorkspaceBrandService,
  ) {}

  private readonly logger = new Logger(MfaService.name)

  /**
   * Whether the user has an *active* factor — the login gate reads this on
   * EVERY sign-in, so it must NEVER throw: a Postgres hiccup (or the table
   * being absent in a deploy window) degrades to "no 2FA" so logins keep
   * working, instead of 500-ing every sign-in. Trade-off: 2FA enforcement
   * fails open on a DB error — acceptable while 2FA adoption is ~0 (beta);
   * revisit for GA.
   */
  async isEnabled(userId: string): Promise<boolean> {
    try {
      const row = await this.repo.findOne({ where: { user_id: userId } })
      return row?.enabled === true
    } catch (error) {
      this.logger.error('MFA isEnabled check failed; treating as disabled to keep login available', { error })
      return false
    }
  }

  async getStatus(userId: string): Promise<MfaStatus> {
    return { enabled: await this.isEnabled(userId) }
  }

  /**
   * Generate a fresh secret, persist it encrypted with `enabled = false`, and
   * return everything the front needs to display the QR code + manual key. The
   * factor does not gate login until a code is verified (see `verifyAndEnable`).
   */
  async enroll(userId: string, email: string): Promise<MfaEnrollResponse> {
    const secret = totp.generateSecret()
    const issuer = (await this.brands.getForUser(userId)).name
    const otpauthUrl = totp.keyuri(email, issuer, secret)
    const qrDataUrl = await toDataURL(otpauthUrl)

    const secret_encrypted = encryptToken(secret)
    const existing = await this.repo.findOne({ where: { user_id: userId } })
    if (existing) {
      await this.repo.update({ user_id: userId }, { secret_encrypted, enabled: false })
    } else {
      await this.repo.insert({ user_id: userId, secret_encrypted, enabled: false })
    }

    return { otpauthUrl, qrDataUrl, secret }
  }

  /** Verify a code against the pending secret and flip the factor on. */
  async verifyAndEnable(userId: string, code: string): Promise<void> {
    const row = await this.repo.findOne({ where: { user_id: userId } })
    if (!row) {
      throw new BadRequestException('Aucune configuration 2FA en attente. Relancez l’activation.')
    }
    this.assertCodeValid(row.secret_encrypted, code)
    if (!row.enabled) {
      await this.repo.update({ user_id: userId }, { enabled: true })
    }
  }

  /** Verify a code, then remove the factor entirely. */
  async disable(userId: string, code: string): Promise<void> {
    const row = await this.repo.findOne({ where: { user_id: userId } })
    if (!row?.enabled) {
      throw new BadRequestException('La double authentification n’est pas active.')
    }
    this.assertCodeValid(row.secret_encrypted, code)
    await this.repo.delete({ user_id: userId })
  }

  /** Short-lived signed token binding the userId, handed out after the password
   *  check when MFA is enabled. Carries no session material. */
  async issueMfaToken(userId: string): Promise<string> {
    return this.jwt.signAsync(
      { purpose: 'mfa' },
      { secret: this.tokenSecret(), subject: userId, audience: MFA_TOKEN_AUDIENCE, expiresIn: MFA_TOKEN_TTL },
    )
  }

  /**
   * Second login step: validate the pending token + a fresh code, then mint the
   * SAME session a normal login issues (cookies are set by the interceptor on
   * the controller). Bad token → 401; bad code → 400.
   */
  async challenge(mfaToken: string, code: string): Promise<AuthOutcome> {
    const userId = await this.verifyMfaToken(mfaToken)
    const row = await this.repo.findOne({ where: { user_id: userId } })
    if (!row?.enabled) {
      throw new UnauthorizedException('Double authentification non configurée.')
    }

    // Finding #4 : verrou anti-bourrage lié au COMPTE (pas seulement à l'IP).
    if (row.locked_until && row.locked_until.getTime() > Date.now()) {
      throw new UnauthorizedException('Trop de tentatives. Réessayez dans quelques minutes.')
    }

    // Anti-rejeu : un code déjà accepté ne peut pas resservir dans sa fenêtre,
    // et une re-soumission compte comme un échec.
    const replayed = row.last_code != null && row.last_code === code
    if (replayed || !this.codeMatches(row.secret_encrypted, code)) {
      await this.registerFailedAttempt(userId, row.failed_attempts ?? 0)
      throw new BadRequestException('Code invalide.')
    }

    // Succès : on remet le compteur à zéro et on grave le code consommé.
    await this.repo.update({ user_id: userId }, { failed_attempts: 0, locked_until: null, last_code: code })

    const session = await this.sessionService.mintSessionForUserId(userId)
    if (isFailure(session)) {
      throw new UnauthorizedException(session.problem.message)
    }
    return { status: 'authenticated', session: session.output }
  }

  /** Incrémente les échecs et verrouille au-delà du seuil (finding #4). */
  private async registerFailedAttempt(userId: string, current: number): Promise<void> {
    const next = current + 1
    if (next >= MFA_MAX_ATTEMPTS) {
      await this.repo.update(
        { user_id: userId },
        { failed_attempts: 0, locked_until: new Date(Date.now() + MFA_LOCK_MS) },
      )
    } else {
      await this.repo.update({ user_id: userId }, { failed_attempts: next })
    }
  }

  private codeMatches(secretEncrypted: string, code: string): boolean {
    const secret = decryptToken(secretEncrypted)
    // `verify` is constant-time internally and never throws on a bad token.
    return totp.verify({ token: code, secret })
  }

  private assertCodeValid(secretEncrypted: string, code: string): void {
    const secret = decryptToken(secretEncrypted)
    // `verify` is constant-time internally and never throws on a bad token.
    if (!totp.verify({ token: code, secret })) {
      throw new BadRequestException('Code invalide.')
    }
  }

  private async verifyMfaToken(token: string): Promise<string> {
    let payload: MfaTokenPayload
    try {
      payload = await this.jwt.verifyAsync<MfaTokenPayload>(token, {
        secret: this.tokenSecret(),
        audience: MFA_TOKEN_AUDIENCE,
        algorithms: ['HS256'],
      })
    } catch {
      throw new UnauthorizedException('Session de vérification expirée. Reconnectez-vous.')
    }
    if (payload.purpose !== 'mfa' || !payload.sub) {
      throw new UnauthorizedException('Jeton de vérification invalide.')
    }
    return payload.sub
  }

  private tokenSecret(): string {
    return this.config.getOrThrow<string>('supabaseJwtSecret')
  }
}
