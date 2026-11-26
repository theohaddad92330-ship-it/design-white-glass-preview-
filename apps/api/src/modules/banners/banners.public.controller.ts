import { Controller, Get, Header, Query } from '@nestjs/common'
import type { BannerViewerPlacement, PublicBanner } from '@bellum/contracts'
import { BannersService } from './banners.service'

/**
 * Public, unauthenticated read for the front-ends — NO guard. Returns ONLY the
 * currently-visible, non-sensitive banner fields for a given surface (the
 * scheduling window, `active` flag and audience never cross the wire). The user
 * app calls it with `placement=app`, the website with `placement=website`.
 *
 * `audience` is a viewer-context hint (`authenticated` vs anonymous), NOT a
 * security boundary — banners are non-sensitive announcements, so an anonymous
 * caller only ever sees `audience=all` rows. A short `Cache-Control` keeps the
 * endpoint cheap under the app's polling.
 */
@Controller('banners')
export class BannersPublicController {
  constructor(private readonly banners: BannersService) {}

  @Get()
  @Header('Cache-Control', 'public, max-age=30')
  async getActive(
    @Query('placement') placement?: string,
    @Query('audience') audience?: string,
  ): Promise<{ banners: PublicBanner[] }> {
    const viewer: BannerViewerPlacement = placement === 'website' ? 'website' : 'app'
    const authenticated = audience === 'authenticated'
    return { banners: await this.banners.getActive({ placement: viewer, authenticated }) }
  }
}
