import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { ACCESS_TOKEN_TTL_SECONDS, readOAuthConfig } from './oauth-config'

/** Claims carried by an MCP OAuth access token (HS256 JWT). */
type McpAccessTokenPayload = {
  sub: string
  email: string
  scope: string
  client_id: string
  iss: string
  aud: string
  jti: string
  iat: number
  exp: number
}

/** An opaque token (authorization code / refresh token): the raw secret handed
 *  to the client, plus the SHA-256 hash we persist. We never store the raw. */
type OpaqueToken = { raw: string; hash: string }

/**
 * Cryptographic primitives for the OAuth AS: access-token minting/verification,
 * opaque token generation + hashing, and PKCE (S256) verification.
 *
 * Access tokens are stateless HS256 JWTs signed with the MCP signing key.
 * Opaque tokens are 256-bit random values; we store only their SHA-256 hash —
 * high-entropy secrets don't need a slow KDF (scrypt/bcrypt are for passwords).
 */
@Injectable()
export class OAuthTokensService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  /** Mint a signed access token bound to the user + client + scope. */
  mintAccessToken(input: { userId: string; email: string; clientId: string; scope: string }): {
    token: string
    expiresIn: number
    jti: string
  } {
    const { issuer, resource, signingKey } = readOAuthConfig(this.config)
    const jti = randomUUID()
    const token = this.jwt.sign(
      { email: input.email, scope: input.scope, client_id: input.clientId },
      {
        secret: signingKey,
        algorithm: 'HS256',
        subject: input.userId,
        issuer,
        audience: resource,
        expiresIn: ACCESS_TOKEN_TTL_SECONDS,
        jwtid: jti,
      },
    )
    return { token, expiresIn: ACCESS_TOKEN_TTL_SECONDS, jti }
  }

  /** Verify signature + issuer + audience + expiry. Throws on any failure. */
  verifyAccessToken(token: string): McpAccessTokenPayload {
    const { issuer, resource, signingKey } = readOAuthConfig(this.config)
    return this.jwt.verify<McpAccessTokenPayload>(token, {
      secret: signingKey,
      algorithms: ['HS256'],
      issuer,
      audience: resource,
    })
  }

  /** A fresh 256-bit opaque token + its storage hash. */
  generateOpaqueToken(): OpaqueToken {
    const raw = randomBytes(32).toString('base64url')
    return { raw, hash: this.hashToken(raw) }
  }

  /** SHA-256 hex of an opaque token — used for constant-work DB lookups. */
  hashToken(raw: string): string {
    return createHash('sha256').update(raw).digest('hex')
  }

  /**
   * Verify a PKCE code_verifier against a stored S256 challenge:
   * `base64url(sha256(verifier)) === challenge`, compared in constant time.
   */
  verifyPkceS256(codeVerifier: string, codeChallenge: string): boolean {
    const computed = createHash('sha256').update(codeVerifier).digest('base64url')
    const a = Buffer.from(computed)
    const b = Buffer.from(codeChallenge)
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  }
}
