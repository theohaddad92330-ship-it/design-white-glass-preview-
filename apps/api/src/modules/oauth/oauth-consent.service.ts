import { BadRequestException, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectRepository } from '@nestjs/typeorm'
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { IsNull, Repository } from 'typeorm'
import { OAuthConsentEntity } from '../../database/entities/oauth-consent.entity'
import { readOAuthConfig } from './oauth-config'

/** Consent CSRF token is valid for 10 minutes — the consent screen lifespan. */
const CONSENT_TOKEN_TTL_MS = 10 * 60 * 1000

type ConsentTokenPayload = { u: string; c: string; s: string; t: number; n: string }

/** Split a space-delimited scope string into a set of non-empty scopes. */
export function parseScope(scope: string): string[] {
  return scope
    .split(/\s+/)
    .map(s => s.trim())
    .filter(Boolean)
}

/** True when every scope in `requested` is present in `granted`. */
export function isScopeCovered(granted: string, requested: string): boolean {
  const grantedSet = new Set(parseScope(granted))
  return parseScope(requested).every(s => grantedSet.has(s))
}

@Injectable()
export class OAuthConsentService {
  constructor(
    @InjectRepository(OAuthConsentEntity)
    private readonly consents: Repository<OAuthConsentEntity>,
    private readonly config: ConfigService,
  ) {}

  private secret(): string {
    const { signingKey } = readOAuthConfig(this.config)
    if (!signingKey) throw new Error('MCP OAuth signing key is not configured')
    return signingKey
  }

  /**
   * Sign a tamper-proof, short-lived anti-CSRF token binding the consent form to
   * the authenticated user, the requesting client and the exact scope. The
   * decision endpoint re-derives identity from the session cookie — this token
   * only proves the POST originated from our own consent page.
   */
  signConsentToken(userId: string, clientId: string, scope: string): string {
    const payload: ConsentTokenPayload = {
      u: userId,
      c: clientId,
      s: scope,
      t: Date.now(),
      n: randomBytes(8).toString('hex'),
    }
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
    const sig = createHmac('sha256', this.secret()).update(body).digest('base64url')
    return `${body}.${sig}`
  }

  /** Verify + decode a consent token, returning its bound fields or throwing. */
  verifyConsentToken(token: string): { userId: string; clientId: string; scope: string } {
    const [body, sig] = (token ?? '').split('.')
    if (!body || !sig) throw new BadRequestException('Invalid consent token')
    const expected = createHmac('sha256', this.secret()).update(body).digest('base64url')
    const a = Buffer.from(sig)
    const b = Buffer.from(expected)
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw new BadRequestException('Bad consent token signature')
    let decoded: ConsentTokenPayload
    try {
      decoded = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as ConsentTokenPayload
    } catch {
      throw new BadRequestException('Corrupt consent token')
    }
    if (!decoded.u || !decoded.c || typeof decoded.t !== 'number' || Date.now() - decoded.t > CONSENT_TOKEN_TTL_MS) {
      throw new BadRequestException('Expired consent token')
    }
    return { userId: decoded.u, clientId: decoded.c, scope: decoded.s }
  }

  /** The active (non-revoked) grant for (user, client), if any. */
  async findActiveConsent(userId: string, clientId: string): Promise<OAuthConsentEntity | null> {
    return this.consents.findOne({ where: { user_id: userId, client_id: clientId, revoked_at: IsNull() } })
  }

  /** Remember (or widen) a user→client grant. Un-revokes a previously revoked one. */
  async grantConsent(userId: string, clientId: string, scope: string, resource: string | null): Promise<void> {
    const existing = await this.consents.findOne({ where: { user_id: userId, client_id: clientId } })
    if (existing) {
      // Union the scopes so re-consent never narrows an existing grant.
      const merged = Array.from(new Set([...parseScope(existing.scope), ...parseScope(scope)])).join(' ')
      await this.consents.update({ id: existing.id }, { scope: merged, resource, revoked_at: null })
      return
    }
    await this.consents.insert({ user_id: userId, client_id: clientId, scope, resource, revoked_at: null })
  }

  /** Active connected apps for the /settings screen. */
  async listConnections(userId: string): Promise<OAuthConsentEntity[]> {
    return this.consents.find({
      where: { user_id: userId, revoked_at: IsNull() },
      order: { created_at: 'DESC' },
    })
  }

  /** Revoke one grant by id, scoped to the owning user. Returns true if hit. */
  async revokeConnection(userId: string, id: string): Promise<boolean> {
    const res = await this.consents.update({ id, user_id: userId, revoked_at: IsNull() }, { revoked_at: new Date() })
    return (res.affected ?? 0) > 0
  }

  /** Is (user, client) currently authorized? Used by token introspection. */
  async isAuthorized(userId: string, clientId: string): Promise<boolean> {
    return (await this.findActiveConsent(userId, clientId)) !== null
  }
}
