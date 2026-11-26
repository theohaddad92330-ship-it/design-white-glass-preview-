import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { randomUUID } from 'node:crypto'
import { IsNull, LessThan, Repository } from 'typeorm'
import { OAuthAuthorizationCodeEntity } from '../../database/entities/oauth-authorization-code.entity'
import { OAuthRefreshTokenEntity } from '../../database/entities/oauth-refresh-token.entity'
import { AUTH_CODE_TTL_SECONDS, REFRESH_TOKEN_TTL_SECONDS } from './oauth-config'
import { OAuthTokensService } from './oauth-tokens.service'

type CreateAuthCodeInput = {
  clientId: string
  userId: string
  redirectUri: string
  scope: string
  resource: string | null
  codeChallenge: string
  codeChallengeMethod: string
}

type ConsumedCode = {
  client_id: string
  user_id: string
  redirect_uri: string
  scope: string
  resource: string | null
  code_challenge: string
  code_challenge_method: string
}

type RotateResult =
  | {
      status: 'ok'
      token: string
      expiresAt: Date
      userId: string
      clientId: string
      scope: string
      resource: string | null
    }
  | { status: 'invalid' }
  | { status: 'expired' }
  | { status: 'reuse_detected' }

/**
 * Persistence + lifecycle for authorization codes and refresh tokens. Codes are
 * single-use (atomic conditional UPDATE) and short-lived; refresh tokens rotate
 * on every use, with theft (reuse of an already-rotated token) revoking the
 * whole family.
 */
@Injectable()
export class OAuthGrantsService {
  constructor(
    @InjectRepository(OAuthAuthorizationCodeEntity)
    private readonly codes: Repository<OAuthAuthorizationCodeEntity>,
    @InjectRepository(OAuthRefreshTokenEntity)
    private readonly refresh: Repository<OAuthRefreshTokenEntity>,
    private readonly tokens: OAuthTokensService,
  ) {}

  /** Mint a fresh authorization code, returning the raw value (hash persisted). */
  async createAuthorizationCode(input: CreateAuthCodeInput): Promise<string> {
    const { raw, hash } = this.tokens.generateOpaqueToken()
    await this.codes.insert({
      code_hash: hash,
      client_id: input.clientId,
      user_id: input.userId,
      redirect_uri: input.redirectUri,
      scope: input.scope,
      resource: input.resource,
      code_challenge: input.codeChallenge,
      code_challenge_method: input.codeChallengeMethod,
      expires_at: new Date(Date.now() + AUTH_CODE_TTL_SECONDS * 1000),
      used_at: null,
    })
    return raw
  }

  /**
   * Atomically redeem a code exactly once. Returns the bound fields, or null if
   * the code is unknown, already used, or expired. The conditional UPDATE on
   * `used_at IS NULL` closes the concurrent-redeem race.
   */
  async consumeAuthorizationCode(rawCode: string): Promise<ConsumedCode | null> {
    const hash = this.tokens.hashToken(rawCode)
    const row = await this.codes.findOne({ where: { code_hash: hash } })
    if (!row) return null
    if (row.used_at || row.expires_at.getTime() <= Date.now()) return null
    const res = await this.codes.update({ id: row.id, used_at: IsNull() }, { used_at: new Date() })
    if ((res.affected ?? 0) !== 1) return null // lost the single-use race
    return {
      client_id: row.client_id,
      user_id: row.user_id,
      redirect_uri: row.redirect_uri,
      scope: row.scope,
      resource: row.resource,
      code_challenge: row.code_challenge,
      code_challenge_method: row.code_challenge_method,
    }
  }

  /** Issue a refresh token, starting a new family unless one is threaded in. */
  async issueRefreshToken(input: {
    userId: string
    clientId: string
    scope: string
    resource: string | null
    familyId?: string
    parentId?: string | null
  }): Promise<{ raw: string; id: string; familyId: string; expiresAt: Date }> {
    const { raw, hash } = this.tokens.generateOpaqueToken()
    const familyId = input.familyId ?? randomUUID()
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000)
    const saved = await this.refresh.save(
      this.refresh.create({
        token_hash: hash,
        family_id: familyId,
        parent_id: input.parentId ?? null,
        replaced_by_id: null,
        client_id: input.clientId,
        user_id: input.userId,
        scope: input.scope,
        resource: input.resource,
        expires_at: expiresAt,
        used_at: null,
        revoked_at: null,
      }),
    )
    return { raw, id: saved.id, familyId, expiresAt }
  }

  /**
   * Rotate a refresh token. Reuse of an already-rotated or revoked token is
   * treated as theft → the whole family is revoked and rotation fails.
   */
  async rotateRefreshToken(rawToken: string): Promise<RotateResult> {
    const hash = this.tokens.hashToken(rawToken)
    const row = await this.refresh.findOne({ where: { token_hash: hash } })
    if (!row) return { status: 'invalid' }
    if (row.revoked_at) {
      await this.revokeFamily(row.family_id)
      return { status: 'reuse_detected' }
    }
    if (row.used_at) {
      // Already rotated once — this is a replay of a superseded token.
      await this.revokeFamily(row.family_id)
      return { status: 'reuse_detected' }
    }
    if (row.expires_at.getTime() <= Date.now()) return { status: 'expired' }

    const next = await this.issueRefreshToken({
      userId: row.user_id,
      clientId: row.client_id,
      scope: row.scope,
      resource: row.resource,
      familyId: row.family_id,
      parentId: row.id,
    })
    const res = await this.refresh.update(
      { id: row.id, used_at: IsNull(), revoked_at: IsNull() },
      { used_at: new Date(), replaced_by_id: next.id },
    )
    if ((res.affected ?? 0) !== 1) {
      // Concurrent rotation won the race → treat as reuse.
      await this.revokeFamily(row.family_id)
      return { status: 'reuse_detected' }
    }
    return {
      status: 'ok',
      token: next.raw,
      expiresAt: next.expiresAt,
      userId: row.user_id,
      clientId: row.client_id,
      scope: row.scope,
      resource: row.resource,
    }
  }

  async revokeFamily(familyId: string): Promise<void> {
    await this.refresh.update({ family_id: familyId, revoked_at: IsNull() }, { revoked_at: new Date() })
  }

  /** Revoke every refresh token for a (user, client) — used when a user
   *  disconnects an app from /settings. */
  async revokeForClient(userId: string, clientId: string): Promise<void> {
    await this.refresh.update(
      { user_id: userId, client_id: clientId, revoked_at: IsNull() },
      { revoked_at: new Date() },
    )
  }

  /** Housekeeping: drop expired codes and expired/revoked refresh tokens. */
  async cleanupExpired(): Promise<void> {
    const now = new Date()
    await this.codes.delete({ expires_at: LessThan(now) })
    await this.refresh.delete({ expires_at: LessThan(now) })
  }
}
