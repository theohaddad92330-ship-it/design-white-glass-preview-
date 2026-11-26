import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import { randomUUID } from 'node:crypto'
import { readImpersonationConfig } from '../auth/impersonation-config'

/** Claims carried by an impersonation access token. */
type ImpersonationTokenPayload = {
  /** Impersonated user id. */
  sub: string
  /** Impersonated user email (display / banner). */
  email: string
  /** Acting admin (operator attribution label). */
  act: string
  impersonation: true
  iss: string
  aud: string
  jti: string
  iat: number
  exp: number
}

type MintedImpersonationToken = {
  token: string
  jti: string
  /** Unix seconds. */
  expiresAt: number
  ttlSeconds: number
}

/**
 * Mints + verifies the short-lived impersonation JWT. Stateless HS256 tokens
 * signed with the impersonation signing key (see impersonation-config). The token
 * is single-purpose: it authenticates a read-only impersonation session and can
 * never be exchanged for a normal, refreshable session.
 */
@Injectable()
export class ImpersonationTokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  mint(input: { targetUserId: string; targetEmail: string; impersonatorActor: string }): MintedImpersonationToken {
    const { signingKey, issuer, audience, ttlSeconds } = readImpersonationConfig(this.config)
    const jti = randomUUID()
    const token = this.jwt.sign(
      { email: input.targetEmail, act: input.impersonatorActor, impersonation: true },
      {
        secret: signingKey,
        algorithm: 'HS256',
        subject: input.targetUserId,
        issuer,
        audience,
        expiresIn: ttlSeconds,
        jwtid: jti,
      },
    )
    return { token, jti, expiresAt: Math.floor(Date.now() / 1000) + ttlSeconds, ttlSeconds }
  }

  /** Verify signature + issuer + audience + expiry + the impersonation flag.
   *  Throws on any failure. */
  verify(token: string): ImpersonationTokenPayload {
    const { signingKey, issuer, audience } = readImpersonationConfig(this.config)
    const payload = this.jwt.verify<ImpersonationTokenPayload>(token, {
      secret: signingKey,
      algorithms: ['HS256'],
      issuer,
      audience,
    })
    if (payload.impersonation !== true) {
      throw new Error('not an impersonation token')
    }
    return payload
  }
}
