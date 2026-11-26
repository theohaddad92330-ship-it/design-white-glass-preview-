import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common'
import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'
import { InternalSecretGuard } from '../../common/internal-secret.guard'
import { LOCKED_EMAIL_CATCHUP_MAX_LIMIT, LockedEmailCatchupService } from './locked-email-catchup.service'

// UN espace, jamais tout le parc ; `dryRun` vaut `true` par défaut (le mode réel se DEMANDE, booléen JSON strict).
const schema = z
  .object({
    workspaceId: z.string().guid(),
    dryRun: z.boolean().default(true),
    limit: z.number().int().min(1).max(LOCKED_EMAIL_CATCHUP_MAX_LIMIT).optional(),
  })
  .strict()

class LockedEmailCatchupDto extends createZodDto(schema) {}

/**
 * Apollo Professional (02/11) — LA PORTE du rattrapage des e-mails que le plan Basic masquait. Même famille que
 * `PlaceholderEmailCatchupController` : `internal/admin`, {@link InternalSecretGuard} ; ni démarrage, ni cron.
 * La simulation (défaut) COMPTE les contacts concernés et ESTIME les crédits avant toute dépense.
 */
@Controller('internal/admin/contacts/locked-email-catchup')
@UseGuards(InternalSecretGuard)
export class LockedEmailCatchupController {
  constructor(private readonly catchup: LockedEmailCatchupService) {}

  @Post()
  @HttpCode(200)
  run(@Body() dto: LockedEmailCatchupDto) {
    return this.catchup.run({ workspaceId: dto.workspaceId, dryRun: dto.dryRun, limit: dto.limit })
  }
}
