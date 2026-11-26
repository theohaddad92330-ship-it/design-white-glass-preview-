import { Body, Controller, Post, UseGuards } from '@nestjs/common'
import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'
import { InternalSecretGuard } from '../../common/internal-secret.guard'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { ProjectsService } from './projects.service'

class CopilotLostProjectsDto extends createZodDto(z.object({ userId: z.string().guid() }).strict()) {}

/**
 * #4288.4 — LES AFFAIRES PERDUES de l'espace, lues sur la MÊME population que l'écran Projets (« Voir les
 * perdues » : les opportunités à l'étape `lost`, `ProjectsService.listForWorkspace`). Le repli de
 * `list_records` (aucun CRM branché) lisait les BESOINS : « 3 enregistrements examinés » contre 2 lignes à
 * l'écran. Aucune définition neuve d'une affaire perdue ; la date de perte est `closed_at`, NULL quand
 * personne ne l'a posée (jamais devinée).
 */
@Controller('internal/copilot')
@UseGuards(InternalSecretGuard)
export class CopilotLostProjectsController {
  constructor(
    private readonly projects: ProjectsService,
    private readonly workspaceContext: WorkspaceContextService,
  ) {}

  @Post('projects/lost')
  async lost(@Body() dto: CopilotLostProjectsDto) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(dto.userId)
    const rows = await this.projects.listForWorkspace(workspaceId)
    const projects = rows
      .filter(row => row.stage === 'lost')
      .map(row => ({
        id: row.id,
        label: row.label,
        companyName: row.company_name ?? null,
        closedAt: row.closed_at ?? null,
      }))
    return { projects, total: projects.length }
  }
}
