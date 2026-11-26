import type { McpEnv } from './config/env.js'

type ProtectedResourceMetadata = {
  resource: string
  authorization_servers: string[]
  scopes_supported: string[]
  bearer_methods_supported: string[]
}

/** RFC 9728 Protected Resource Metadata: tells the client which authorization
 *  server (the Bellum API) governs this MCP resource. */
export function buildProtectedResourceMetadata(env: McpEnv): ProtectedResourceMetadata {
  return {
    resource: env.MCP_PUBLIC_URL,
    authorization_servers: [env.API_PUBLIC_URL],
    scopes_supported: ['mcp:read', 'mcp:analysis', 'mcp:act'],
    bearer_methods_supported: ['header'],
  }
}
