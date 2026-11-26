import { z } from 'zod'

/** Well-known dev placeholder — forbidden in production (see the superRefine
 *  below). Mirrors packages/contracts/src/schemas/env.ts's own constant: the
 *  API and this server must carry the SAME strong secret, so the floor is the
 *  same value. */
const DEV_INTERNAL_SECRET = 'dev-internal-secret-change-me'

/**
 * Environment for the MCP resource server. This is a thin proxy: it holds NO
 * database credentials and NO OAuth signing key — only what it needs to
 * advertise discovery metadata and reach the Bellum API. Its own schema
 * (deliberately not the API-shaped `@bellum/contracts` env).
 */
const envSchema = z
  .object({
    PORT: z.coerce.number().default(3010),
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    /**
     * Public URL of THIS MCP server — the OAuth `resource` identifier/audience
     * advertised in protected-resource metadata (RFC 9728) and bound into the
     * access token's `aud` (RFC 8707).
     */
    MCP_PUBLIC_URL: z.string().url().default('http://localhost:3010'),
    /**
     * Public URL of the Bellum API = the OAuth authorization server advertised
     * to clients so they can fetch its RFC 8414 metadata and run the flow.
     */
    API_PUBLIC_URL: z.string().url().default('http://localhost:3000'),
    /**
     * Internal URL used server-to-server to reach the API (token introspection
     * + tool proxying). On Railway this is internal DNS; locally the API URL.
     */
    API_INTERNAL_URL: z.string().url().default('http://localhost:3000'),
    /**
     * Shared secret to authenticate calls to the API's internal
     * `POST /oauth/introspect` (sent as `x-internal-secret`). Same value the API
     * validates. This is the ONLY secret the MCP server holds.
     */
    INTERNAL_API_SECRET: z.string().min(1).default(DEV_INTERNAL_SECRET),
  })
  .superRefine((env, ctx) => {
    // Same production floor as packages/contracts/src/schemas/env.ts's
    // INTERNAL_API_SECRET check: this value authenticates every call this
    // server makes to the API's internal introspection endpoint, so letting
    // it silently start on the well-known dev default (or anything short) in
    // production would leave that door guessable. Fail-fast at boot rather
    // than run insecure — `loadEnv()` below only does a `safeParse`, so
    // without this refine there was NOTHING stopping production from booting
    // on the dev placeholder.
    if (env.NODE_ENV === 'production') {
      if (env.INTERNAL_API_SECRET === DEV_INTERNAL_SECRET || env.INTERNAL_API_SECRET.length < 32) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['INTERNAL_API_SECRET'],
          message:
            'INTERNAL_API_SECRET must be an explicit strong value (>= 32 chars) in production; ' +
            'the dev default is forbidden.',
        })
      }
    }
  })

export type McpEnv = z.infer<typeof envSchema>

export function loadEnv(): McpEnv {
  const parsed = envSchema.safeParse(process.env)
  if (!parsed.success) {
    console.error('Invalid MCP environment configuration:', parsed.error.flatten().fieldErrors)
    throw new Error('Invalid MCP environment configuration')
  }
  return parsed.data
}
