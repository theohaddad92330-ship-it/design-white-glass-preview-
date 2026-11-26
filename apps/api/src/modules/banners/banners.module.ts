import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { BannerEntity } from '../../database/entities/banner.entity'
import { InternalSecretGuard } from '../../common/internal-secret.guard'
import { BannersAdminController } from './banners.admin.controller'
import { BannersPublicController } from './banners.public.controller'
import { BannersService } from './banners.service'

/**
 * Admin-scheduled banners / announcements. Self-contained (removing it changes
 * no other module): a backoffice CRUD surface behind `InternalSecretGuard`
 * (`/internal/admin/banners`) and a public, unauthenticated read (`/banners`)
 * for the app + website. See the `banners` table (migration 1786100000000).
 */
@Module({
  imports: [TypeOrmModule.forFeature([BannerEntity])],
  controllers: [BannersAdminController, BannersPublicController],
  providers: [BannersService, InternalSecretGuard],
})
export class BannersModule {}
