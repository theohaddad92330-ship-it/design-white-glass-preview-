import { ImpersonationAuditEntity } from '../../database/entities/impersonation-audit.entity'
import { Module, forwardRef } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { PassportModule } from '@nestjs/passport'
import { TypeOrmModule } from '@nestjs/typeorm'
import {
  AttachRefreshCookieInterceptor,
  ClearRefreshCookieInterceptor,
} from '../../common/interceptor/refresh-cookie.interceptor'
import { AccountEntity } from '../../database/entities/account.entity'
import { NotificationEntity } from '../../database/entities/notification.entity'
import { UserMfaEntity } from '../../database/entities/user-mfa.entity'
import { UserSessionEntity } from '../../database/entities/user-session.entity'
import { WorkspaceEntity } from '../../database/entities/workspace.entity'
import { AuthController } from './auth.controller'
import { SessionRegistryModule } from './session-registry.module'
import { MfaController } from './mfa.controller'
import { SupabaseAuthGateway } from './supabase-auth.gateway'
import { SessionService } from './session.service'
import { CredentialsAuthService } from './credentials-auth.service'
import { EmailVerificationService } from './email-verification.service'
import { MfaService } from './mfa.service'
import { PasswordResetService } from './password-reset.service'
import { OAuthService } from './oauth-auth.service'
import { BackofficeRoleGuard } from './backoffice-role.guard'
import { JwtGuard } from './jwt.guard'
import { JwtStrategy } from './jwt.strategy'
import { ImpersonationStrategy } from './impersonation.strategy'
import { MailerModule } from '../mailer/mailer.module'
import { OtpModule } from '../otp/otp.module'
import { ProfileContextModule } from '../profile-context/profile-context.module'
import { WorkspaceModule } from '../workspace/workspace.module'

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    // Signs/verifies the short-lived MFA challenge token. The signing secret is
    // passed per call (supabaseJwtSecret), so no default is registered here.
    JwtModule.register({}),
    MailerModule,
    OtpModule,
    // La marque de l'espace pour l'ÉMETTEUR TOTP (marque blanche, 01/09/2026).
    // ⚠️ `forwardRef` : `WorkspaceModule` importe `MailerModule` et se retrouve
    // dans le même cycle de résolution que l'authentification. Sans lui, Nest
    // échoue au démarrage — et le graphe de modules n'est vérifié qu'AU BOOT.
    forwardRef(() => WorkspaceModule),
    TypeOrmModule.forFeature([
      AccountEntity,
      UserMfaEntity,
      UserSessionEntity,
      NotificationEntity,
      WorkspaceEntity,
      // LUDOVIC-D LC.10 — `ImpersonationStrategy` refuse une session terminée.
      ImpersonationAuditEntity,
    ]),
    forwardRef(() => ProfileContextModule),
    // #2120.57 — le registre des sessions-appareils, en module FEUILLE. Il etait
    // fourni ICI et exporte NULLE PART : les `JwtStrategy` de `McpApiModule` et
    // d'`OAuthModule` recevaient donc `undefined` et sautaient le controle de
    // revocation, en silence (GA-365).
    SessionRegistryModule,
  ],
  controllers: [AuthController, MfaController],
  providers: [
    SupabaseAuthGateway,
    SessionService,
    CredentialsAuthService,
    EmailVerificationService,
    MfaService,
    PasswordResetService,
    OAuthService,
    JwtStrategy,
    // Registers the passport `impersonation` strategy process-wide so JwtGuard
    // (which composes ['impersonation','jwt']) can resolve it. Kept in AuthModule
    // — never in the ImpersonationModule — so JwtGuard's strategy is always
    // present even if the impersonation FEATURE module were removed.
    ImpersonationStrategy,
    JwtGuard,
    // Le rôle plate-forme `backoffice` se lit sur le compte SERVEUR, donc via
    // `SessionService` : le garde vit ici, à côté de sa source, plutôt que dans
    // le module qui l'utilise.
    BackofficeRoleGuard,
    AttachRefreshCookieInterceptor,
    ClearRefreshCookieInterceptor,
  ],
  exports: [JwtGuard, BackofficeRoleGuard, SupabaseAuthGateway, SessionService],
})
export class AuthModule {}
