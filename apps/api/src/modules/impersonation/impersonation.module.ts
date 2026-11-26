import { Module } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { TypeOrmModule } from '@nestjs/typeorm'
import { InternalSecretGuard } from '../../common/internal-secret.guard'
import { ImpersonationAuditEntity } from '../../database/entities/impersonation-audit.entity'
import { ProfileEntity } from '../../database/entities/profile.entity'
import { AuthModule } from '../auth/auth.module'
import { ImpersonationAdminController } from './impersonation-admin.controller'
import { ImpersonationController } from './impersonation.controller'
import { ImpersonationAuditService } from './impersonation-audit.service'
import { ImpersonationService } from './impersonation.service'
import { ImpersonationTokenService } from './impersonation-token.service'
import { ImpersonationVisibilityService } from './impersonation-visibility.service'

/**
 * Admin "impersonate a user" feature (super-admin console → read-only session as
 * the user, to reproduce bugs). Self-contained (rule #7): removing it disables
 * impersonation and changes no other module — JwtGuard's `impersonation` strategy
 * lives in AuthModule, so authentication keeps working without this module.
 *
 * Imports AuthModule for JwtGuard (used on the stop/context endpoints).
 */
@Module({
  imports: [JwtModule.register({}), TypeOrmModule.forFeature([ImpersonationAuditEntity, ProfileEntity]), AuthModule],
  controllers: [ImpersonationAdminController, ImpersonationController],
  providers: [
    ImpersonationTokenService,
    ImpersonationAuditService,
    ImpersonationService,
    // Ce que le client a le droit de savoir quand on est chez lui (#1670.2).
    ImpersonationVisibilityService,
    InternalSecretGuard,
  ],
})
export class ImpersonationModule {}
