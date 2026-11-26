import { MCP_SCOPES } from './oauth-config'

/**
 * RFC 8414 Authorization Server Metadata. `issuer` MUST equal the `iss` claim
 * on issued tokens and the base of the endpoint URLs. Public clients + PKCE
 * S256 only.
 */
type AuthServerMetadata = {
  issuer: string
  authorization_endpoint: string
  token_endpoint: string
  registration_endpoint: string
  scopes_supported: string[]
  response_types_supported: string[]
  grant_types_supported: string[]
  code_challenge_methods_supported: string[]
  token_endpoint_auth_methods_supported: string[]
}

export function buildAuthServerMetadata(issuer: string): AuthServerMetadata {
  return {
    issuer,
    authorization_endpoint: `${issuer}/oauth/authorize`,
    token_endpoint: `${issuer}/oauth/token`,
    registration_endpoint: `${issuer}/oauth/register`,
    scopes_supported: [...MCP_SCOPES],
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
  }
}
