import { BadRequestException, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { randomBytes } from 'node:crypto'
import { Repository } from 'typeorm'
import { OAuthClientEntity } from '../../database/entities/oauth-client.entity'

/** Schemes that must never be accepted as a redirect target. */
const DANGEROUS_SCHEMES = new Set(['javascript', 'data', 'file', 'vbscript', 'blob', 'about'])
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])
const MAX_REDIRECT_URIS = 10
const MAX_URI_LENGTH = 2000
const MAX_NAME_LENGTH = 255

type RegisterClientInput = {
  redirect_uris: string[]
  client_name?: string
  scope?: string
}

/** RFC 7591 client information response (public client — no secret). */
type RegisteredClient = {
  client_id: string
  client_id_issued_at: number
  redirect_uris: string[]
  grant_types: string[]
  response_types: string[]
  token_endpoint_auth_method: string
  client_name?: string
  scope?: string
}

/**
 * Is `uri` an acceptable redirect target? Allows: any `https://`, loopback
 * `http://` (localhost/127.0.0.1/::1, for local dev clients), and private-use
 * custom schemes (`cursor://`, `claude://`, `vscode://`, …) that desktop MCP
 * clients register. Rejects non-loopback `http`, dangerous schemes, and garbage.
 */
export function isAllowedRedirectUri(uri: string): boolean {
  if (typeof uri !== 'string' || uri.length === 0 || uri.length > MAX_URI_LENGTH) return false
  let url: URL
  try {
    url = new URL(uri)
  } catch {
    return false
  }
  const scheme = url.protocol.replace(/:$/, '').toLowerCase()
  if (DANGEROUS_SCHEMES.has(scheme)) return false
  if (scheme === 'https') return true
  if (scheme === 'http') return LOOPBACK_HOSTS.has(url.hostname.toLowerCase())
  // Private-use / custom application scheme (desktop clients).
  return /^[a-z][a-z0-9+.-]*$/.test(scheme)
}

@Injectable()
export class OAuthClientsService {
  constructor(
    @InjectRepository(OAuthClientEntity)
    private readonly clients: Repository<OAuthClientEntity>,
  ) {}

  /** Register a public client (RFC 7591). Validates redirect URIs strictly. */
  async register(input: RegisterClientInput): Promise<RegisteredClient> {
    const uris = input.redirect_uris
    if (!Array.isArray(uris) || uris.length === 0) {
      throw new BadRequestException({ error: 'invalid_redirect_uri', error_description: 'redirect_uris is required' })
    }
    if (uris.length > MAX_REDIRECT_URIS) {
      throw new BadRequestException({ error: 'invalid_redirect_uri', error_description: 'too many redirect_uris' })
    }
    for (const uri of uris) {
      if (!isAllowedRedirectUri(uri)) {
        throw new BadRequestException({
          error: 'invalid_redirect_uri',
          error_description: `redirect_uri not allowed: ${String(uri).slice(0, 120)}`,
        })
      }
    }
    if (input.client_name && input.client_name.length > MAX_NAME_LENGTH) {
      throw new BadRequestException({ error: 'invalid_client_metadata', error_description: 'client_name too long' })
    }

    const clientId = randomBytes(32).toString('base64url')
    const entity = await this.clients.save(
      this.clients.create({
        client_id: clientId,
        client_name: input.client_name ?? null,
        redirect_uris: uris,
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        token_endpoint_auth_method: 'none',
        scope: input.scope ?? null,
        client_secret_hash: null,
      }),
    )

    return {
      client_id: entity.client_id,
      client_id_issued_at: Math.floor(entity.created_at.getTime() / 1000),
      redirect_uris: entity.redirect_uris,
      grant_types: entity.grant_types,
      response_types: entity.response_types,
      token_endpoint_auth_method: entity.token_endpoint_auth_method,
      client_name: entity.client_name ?? undefined,
      scope: entity.scope ?? undefined,
    }
  }

  async findByClientId(clientId: string): Promise<OAuthClientEntity | null> {
    if (!clientId) return null
    return this.clients.findOne({ where: { client_id: clientId } })
  }

  /** Exact byte-for-byte redirect_uri match — no normalization, no prefixing. */
  isRegisteredRedirectUri(client: OAuthClientEntity, redirectUri: string): boolean {
    return client.redirect_uris.includes(redirectUri)
  }

  async touchLastUsed(clientId: string): Promise<void> {
    await this.clients.update({ client_id: clientId }, { last_used_at: new Date() })
  }
}
