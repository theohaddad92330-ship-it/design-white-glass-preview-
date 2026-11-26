import { Injectable } from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'

/**
 * Accepts EITHER a Supabase browser session (`jwt`) OR an MCP OAuth access
 * token (`mcp-oauth`). Passport tries the strategies in order and the first to
 * succeed wins; the two are mutually exclusive by audience so there's no
 * ambiguity.
 *
 * SECURITY: only ever apply this to the MCP-facing controller. NestJS guards
 * are additive, so an MCP token is confined to exactly the routes that use this
 * guard — it can never reach a `JwtGuard`-only route (billing, account
 * deletion, admin, …). Do NOT register it as a global guard.
 */
@Injectable()
export class ApiAuthGuard extends AuthGuard(['jwt', 'mcp-oauth']) {}
