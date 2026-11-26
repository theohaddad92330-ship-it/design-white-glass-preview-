import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common'
import type { AdminBanner } from '@bellum/contracts'
import { InternalSecretGuard } from '../../common/internal-secret.guard'
import { BannersService } from './banners.service'
import { CreateBannerDto } from './dto/create-banner.dto'
import { ToggleBannerDto } from './dto/toggle-banner.dto'
import { UpdateBannerDto } from './dto/update-banner.dto'

/**
 * Backoffice CRUD for admin-scheduled banners. Consumed server-side by the
 * standalone `dashboard-manager` (Next.js), which proxies these routes with the
 * shared internal secret so it never reaches the browser — same pattern as the
 * other `internal/admin/*` controllers. Writes are gated by
 * {@link InternalSecretGuard}; it must never be removed (this is the only thing
 * between an operator mutation and the whole table).
 */
@Controller('internal/admin/banners')
@UseGuards(InternalSecretGuard)
export class BannersAdminController {
  constructor(private readonly banners: BannersService) {}

  @Get()
  async list(): Promise<{ banners: AdminBanner[] }> {
    return { banners: await this.banners.list() }
  }

  @Post()
  create(@Body() dto: CreateBannerDto): Promise<AdminBanner> {
    return this.banners.create(dto, 'dashboard-manager')
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateBannerDto): Promise<AdminBanner> {
    return this.banners.update(id, dto)
  }

  @Patch(':id/toggle')
  toggle(@Param('id') id: string, @Body() dto: ToggleBannerDto): Promise<AdminBanner> {
    return this.banners.toggle(id, dto.active)
  }

  @Delete(':id')
  async remove(@Param('id') id: string): Promise<{ removed: true }> {
    await this.banners.remove(id)
    return { removed: true }
  }
}
