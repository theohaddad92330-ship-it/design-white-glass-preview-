import { Controller, Get, NotFoundException, Param } from '@nestjs/common'
import { unwrap } from '@bellum/utils'
import { SharePublicService, type SharePublicFailure } from './share-public.service'

function throwShareFailure(failure: SharePublicFailure): never {
  throw new NotFoundException(failure.message)
}

/**
 * Public read-only endpoint for shared dossiers — NO `JwtGuard`. The slug
 * is the capability; possession of the URL is the only credential.
 */
@Controller('share')
export class SharePublicController {
  constructor(private readonly sharePublic: SharePublicService) {}

  @Get(':slug')
  async getBySlug(@Param('slug') slug: string) {
    return unwrap(await this.sharePublic.resolveBySlug(slug), throwShareFailure)
  }
}
