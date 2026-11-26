import { Body, Controller, ForbiddenException, HttpCode, Post, UseGuards } from '@nestjs/common'
import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { RequirePermission } from '../workspace/require-permission.decorator'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import {
  PLACEHOLDER_EMAIL_CATCHUP_MAX_LIMIT,
  PlaceholderEmailCatchupService,
} from './placeholder-email-catchup.service'

// `dryRun` vaut `true` par défaut (l'exécution se DEMANDE, booléen JSON strict). `workspaceId` est facultatif : s'il
// est donné, il doit être l'espace ACTIF — on ne vise jamais un autre espace que le sien.
const schema = z.object({ dryRun: z.boolean().default(true), workspaceId: z.string().guid().optional() }).strict()

class WorkspacePlaceholderEmailCatchupDto extends createZodDto(schema) {}

const ADMIN_ROLES = ['owner', 'admin'] as const

/**
 * #4599.4 — la porte d'ADMIN D'ESPACE du rattrapage des adresses gabarit. Mesuré en prod le 31/10 : 10 fiches
 * « prenom.nom@… » restaient en base parce que la seule porte (`internal/admin/…`, `InternalSecretGuard`) n'est
 * jamais appelée. Celle-ci laisse le propriétaire ou l'admin de l'espace SIMULER (compter sans écrire, défaut), puis
 * EXÉCUTER explicitement, borné à {@link PLACEHOLDER_EMAIL_CATCHUP_MAX_LIMIT} fiches par geste.
 *
 * Le tenant vient de la SESSION (espace actif), jamais du corps ; ni boot ni cron. La porte interne reste telle quelle.
 */
@Controller('contacts/placeholder-email-catchup')
@UseGuards(JwtGuard, WorkspacePermissionGuard)
export class WorkspacePlaceholderEmailCatchupController {
  constructor(
    private readonly catchup: PlaceholderEmailCatchupService,
    private readonly workspaceContext: WorkspaceContextService,
  ) {}

  @Post()
  @HttpCode(200)
  @RequirePermission('team:manage')
  async run(@CurrentUser() user: CurrentUserPayload, @Body() dto: WorkspacePlaceholderEmailCatchupDto) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    // #4599.4 — un autre espace que le sien : refusé AVANT toute lecture.
    if (dto.workspaceId && dto.workspaceId !== workspaceId) throw new ForbiddenException('Accès refusé à cet espace')
    // #4599.4 — `team:manage` ouvre aussi `sales_ops` : le geste est propriétaire/admin, re-vérifié par le rôle.
    await this.workspaceContext.assertRole(user.userId, workspaceId, ADMIN_ROLES)
    const limit = PLACEHOLDER_EMAIL_CATCHUP_MAX_LIMIT
    const outcome = await this.catchup.run({ workspaceId, dryRun: dto.dryRun, limit })
    return { ...outcome, limit }
  }
}
