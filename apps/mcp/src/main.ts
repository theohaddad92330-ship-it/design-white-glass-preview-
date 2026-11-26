import { requireBearerAuth } from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js'
import { getOAuthProtectedResourceMetadataUrl } from '@modelcontextprotocol/sdk/server/auth/router.js'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js'
import express, { type Request, type Response } from 'express'
import { randomUUID } from 'node:crypto'
import { loadEnv } from './config/env.js'
import { GUARDRAIL_INSTRUCTIONS } from './guardrails.js'
import { createTokenVerifier } from './introspect.js'
import { buildProtectedResourceMetadata } from './metadata.js'
import { registerTools } from './tools.js'

function bootstrap(): void {
  const env = loadEnv()
  const app = express()
  app.use(express.json())

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'mcp' })
  })

  // RFC 9728 — points MCP clients at the Bellum API as the authorization server.
  const resourceMetadata = buildProtectedResourceMetadata(env)
  app.get('/.well-known/oauth-protected-resource', (_req, res) => {
    res.json(resourceMetadata)
  })

  const verifier = createTokenVerifier(env)
  const resourceMetadataUrl = getOAuthProtectedResourceMetadataUrl(new URL(env.MCP_PUBLIC_URL))
  // Missing/invalid token → 401 + WWW-Authenticate pointing at the metadata,
  // which makes clients auto-start the OAuth flow.
  const bearer = requireBearerAuth({ verifier, resourceMetadataUrl })

  // Session-based Streamable HTTP: a client `initialize`s once (no session id →
  // we mint one and keep the transport), then reuses `Mcp-Session-Id` on every
  // subsequent request. This is what real MCP clients (Claude Desktop, Cursor)
  // expect — a fresh per-request server would report "not initialized".
  const transports: Record<string, StreamableHTTPServerTransport> = {}

  app.post('/mcp', bearer, async (req: Request, res: Response) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined
    try {
      let transport: StreamableHTTPServerTransport
      if (sessionId && transports[sessionId]) {
        transport = transports[sessionId]
      } else if (!sessionId && isInitializeRequest(req.body)) {
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: sid => {
            transports[sid] = transport
          },
        })
        transport.onclose = () => {
          if (transport.sessionId) delete transports[transport.sessionId]
        }
        const server = new McpServer({ name: 'bellum-mcp', version: '0.0.1' }, { instructions: GUARDRAIL_INSTRUCTIONS })
        registerTools(server, env)
        await server.connect(transport)
      } else {
        res.status(400).json({
          jsonrpc: '2.0',
          error: { code: -32000, message: 'Bad Request: no valid session id (send initialize first)' },
          id: null,
        })
        return
      }
      await transport.handleRequest(req, res, req.body)
    } catch (err) {
      console.error('[mcp] request handling failed', err)
      if (!res.headersSent) res.status(500).json({ error: 'internal_error' })
    }
  })

  // GET = server→client SSE stream; DELETE = explicit session teardown.
  const handleSessionRequest = async (req: Request, res: Response) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined
    const transport = sessionId ? transports[sessionId] : undefined
    if (!transport) {
      res.status(400).send('Invalid or missing session id')
      return
    }
    await transport.handleRequest(req, res)
  }
  app.get('/mcp', bearer, handleSessionRequest)
  app.delete('/mcp', bearer, handleSessionRequest)

  app.listen(env.PORT, () => {
    console.warn(`[mcp] listening on :${env.PORT} (resource=${env.MCP_PUBLIC_URL}, as=${env.API_PUBLIC_URL})`)
  })
}

bootstrap()
