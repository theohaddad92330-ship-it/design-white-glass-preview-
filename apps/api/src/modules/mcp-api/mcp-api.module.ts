import { Module } from '@nestjs/common'
import { PassportModule } from '@nestjs/passport'
import { AccountFeedbackModule } from '../account-feedback/account-feedback.module'
import { AccountsModule } from '../accounts/accounts.module'
import { ActionsModule } from '../actions/actions.module'
import { AnalysisModule } from '../analysis/analysis.module'
import { JwtStrategy } from '../auth/jwt.strategy'
import { SessionRegistryModule } from '../auth/session-registry.module'
import { ContactsModule } from '../contacts/contacts.module'
import { CreditsModule } from '../credits/credits.module'
import { CrmModule } from '../crm/crm.module'
import { IaProxyModule } from '../ia-proxy/ia-proxy.module'
import { MemoryModule } from '../memory/memory.module'
import { WorkspaceModule } from '../workspace/workspace.module'
import { ApiAuthGuard } from './api-auth.guard'
import { MarketMemoryModule } from '../market-memory/market-memory.module'
import { McpApiController } from './mcp-api.controller'
import { McpSignalsService } from './mcp-signals.service'
import { McpOAuthStrategy } from './mcp-oauth.strategy'
import { McpScopeGuard } from './mcp-scope.guard'
import { PlanFeaturesModule } from '../plan-features/plan-features.module'
import { BusinessUnitModule } from '../business-unit/business-unit.module'

/**
 * The MCP-facing API surface — the ONLY place an MCP OAuth access token is
 * accepted. Reuses the existing feature services; adds the `mcp-oauth` passport
 * strategy + the composite {@link ApiAuthGuard}. Self-contained (CLAUDE rule
 * #7): dropping it removes the MCP data surface without touching anything else.
 */
@Module({
  imports: [
    // Le cloisonnement de périmètre : MCP porte le même que le navigateur.
    BusinessUnitModule,
    // Gating par offre : le serveur MCP demande la feature `mcp_assistant`.
    PlanFeaturesModule,
    PassportModule,
    AccountsModule,
    ContactsModule,
    AnalysisModule,
    CreditsModule,
    ActionsModule,
    CrmModule,
    // ChatContextService for `ask_bellum` — same advisor context as the Copilote.
    IaProxyModule,
    // #1916.24 — `MemoryReplyUsesService` : la trace des éléments de mémoire
    // envoyés pour une réponse d'`ask_bellum` (GA-42 : un service injecté par le
    // contrôleur est fourni par un import).
    MemoryModule,
    // #1919.15 — `ReplyFeedbackService` : `ask_bellum` relit les retours de la
    // personne, comme la route du chat.
    AccountFeedbackModule,
    WorkspaceModule,
    // Signaux → opportunités : lecture de la mémoire marché (find_opportunities).
    MarketMemoryModule,
    // #2120.57 (GA-365) — `JwtStrategy` est enregistree ci-dessous, donc ce
    // module en a sa PROPRE instance : sans cet import, son `@Optional()`
    // `sessions` valait `undefined` et le controle de revocation etait SAUTE.
    SessionRegistryModule,
  ],
  controllers: [McpApiController],
  // JwtStrategy (Supabase browser sessions) + McpOAuthStrategy (MCP access
  // tokens) together back the composite ApiAuthGuard. Registered here so the
  // module is self-contained.
  providers: [JwtStrategy, McpOAuthStrategy, ApiAuthGuard, McpScopeGuard, McpSignalsService],
})
export class McpApiModule {}
