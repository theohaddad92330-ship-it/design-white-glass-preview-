import { BadRequestException, Controller, Get, NotFoundException, Param, Query, UseGuards } from '@nestjs/common'
import { createZodDto } from 'nestjs-zod'
import { CRM_READ_OBJECTS, crmReadsObject, type CrmReadObject } from '@bellum/contracts'
import { z } from 'zod'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { RequirePermission } from '../workspace/require-permission.decorator'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { CrmAdapterRegistry } from './adapter/crm-adapter.registry'

const readQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(200).default(50),
    after: z.string().trim().min(1).max(2000).optional(),
    since: z.string().datetime().optional(),
  })
  .strict()
class ReadQueryDto extends createZodDto(readQuerySchema) {}

/**
 * #4189 — la LECTURE commune, exposée : `GET /crm/read/:provider/:object` rend une page
 * d'un objet du CRM branché de l'espace (comptes, contacts, affaires, activités,
 * propriétaires), tel que le CRM le rend — un champ qu'il ne rend pas est `null`.
 *
 * Un objet que ce CRM n'expose pas (`CRM_PROVIDER_READ_SCOPE`) répond 404 NOMMÉ, jamais une
 * page vide qui se lirait « aucun ». Lecture seule : rien n'est écrit, ni chez le CRM ni chez nous.
 */
@Controller('crm/read')
@UseGuards(JwtGuard, WorkspacePermissionGuard)
export class CrmProviderReadController {
  constructor(private readonly adapters: CrmAdapterRegistry) {}

  @Get(':provider/:object')
  @RequirePermission('records:write')
  async read(
    @CurrentUser() user: CurrentUserPayload,
    @Param('provider') provider: string,
    @Param('object') object: string,
    @Query() query: ReadQueryDto,
  ): Promise<unknown> {
    if (!(CRM_READ_OBJECTS as readonly string[]).includes(object)) {
      throw new BadRequestException(`Objet inconnu : ${CRM_READ_OBJECTS.join(', ')}.`)
    }
    const adapter = this.adapters.get(provider)
    if (!adapter?.read) throw new NotFoundException('Ce CRM ne se relit pas depuis Bellum.')
    if (!crmReadsObject(adapter.provider, object as CrmReadObject)) {
      throw new NotFoundException('Ce CRM n’expose pas cet objet à la lecture : il n’est pas lu.')
    }
    if (!(await adapter.status(user.userId)).connected) {
      throw new NotFoundException('Ce CRM n’est pas branché sur ton espace.')
    }
    const opts = {
      limit: query.limit,
      ...(query.after ? { after: query.after } : {}),
      ...(query.since ? { since: query.since } : {}),
    }
    const read = adapter.read
    switch (object as CrmReadObject) {
      case 'accounts':
        return read.companies(user.userId, opts)
      case 'contacts':
        return read.contacts(user.userId, opts)
      case 'deals':
        return read.deals ? read.deals(user.userId, opts) : notExposed()
      case 'activities':
        return read.activities ? read.activities(user.userId, opts) : notExposed()
      case 'owners':
        return read.owners ? read.owners(user.userId, opts) : notExposed()
    }
  }
}

function notExposed(): never {
  throw new NotFoundException('Ce CRM n’expose pas cet objet à la lecture : il n’est pas lu.')
}
