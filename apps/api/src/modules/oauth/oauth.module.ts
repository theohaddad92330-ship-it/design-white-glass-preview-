import { Module } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { PassportModule } from '@nestjs/passport'
import { TypeOrmModule } from '@nestjs/typeorm'
import { OAuthAuthorizationCodeEntity } from '../../database/entities/oauth-authorization-code.entity'
import { OAuthClientEntity } from '../../database/entities/oauth-client.entity'
import { OAuthConsentEntity } from '../../database/entities/oauth-consent.entity'
import { OAuthRefreshTokenEntity } from '../../database/entities/oauth-refresh-token.entity'
import { InternalSecretGuard } from '../../common/internal-secret.guard'
import { JwtStrategy } from '../auth/jwt.strategy'
import { SessionRegistryModule } from '../auth/session-registry.module'
import { LocksModule } from '../locks/locks.module'
import { OAuthCleanupService } from './oauth-cleanup.service'
import { OAuthClientsService } from './oauth-clients.service'
import { OAuthConsentService } from './oauth-consent.service'
import { OAuthController } from './oauth.controller'
import { OAuthGrantsService } from './oauth-grants.service'
import { OAuthService } from './oauth.service'
import { OAuthTokensService } from './oauth-tokens.service'
import { OptionalJwtGuard } from './optional-jwt.guard'
import { WorkspaceModule } from '../workspace/workspace.module'

/**
 * OAuth 2.1 Authorization Server for the MCP feature. Self-contained NestJS
 * module: removing it takes the whole MCP OAuth surface offline without
 * touching the rest of the app (CLAUDE rule #7). Env-gated on MCP_PUBLIC_URL.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      OAuthClientEntity,
      OAuthAuthorizationCodeEntity,
      OAuthRefreshTokenEntity,
      OAuthConsentEntity,
    ]),
    // JwtService for minting/verifying access tokens (secret passed per-call).
    JwtModule.register({}),
    // La marque de l'espace pour la page de consentement (marque blanche,
    // 01/09/2026) : c'est un écran de CONFIANCE servi à l'utilisateur au
    // moment où il autorise une application tierce.
    WorkspaceModule,
    PassportModule,
    // Cron-tick lock for the hourly grant sweep (multi-replica safety).
    LocksModule,
    // #2120.57 (GA-260) — `JwtStrategy` est enregistree ci-dessous ("self-contained"),
    // donc ce module en a sa PROPRE instance : sans cet import, son `@Optional()`
    // `sessions` valait `undefined` et le controle de revocation etait SAUTE.
    // Module FEUILLE, donc l'autonomie revendiquee vis-a-vis d'`AuthModule` tient.
    SessionRegistryModule,
  ],
  controllers: [OAuthController],
  providers: [
    OAuthClientsService,
    OAuthGrantsService,
    OAuthConsentService,
    OAuthTokensService,
    OAuthService,
    OAuthCleanupService,
    OptionalJwtGuard,
    InternalSecretGuard,
    // Registers the Supabase `jwt` passport strategy that the optional guard
    // uses (self-contained: no dependency on the heavy AuthModule).
    JwtStrategy,
  ],
  exports: [OAuthTokensService, OAuthConsentService, OAuthClientsService],
})
export class OAuthModule {}
