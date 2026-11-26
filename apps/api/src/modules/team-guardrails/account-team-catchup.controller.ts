import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common'
import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'
import { InternalSecretGuard } from '../../common/internal-secret.guard'
import { AccountTeamCatchupService } from './account-team-catchup.service'

// UN espace, jamais tout le parc ; `dryRun` vaut `true` par défaut (le mode réel se DEMANDE, avec son auteur).
const schema = z
  .object({
    workspaceId: z.string().guid(),
    dryRun: z.boolean().default(true),
    removedBy: z.string().guid().optional(),
  })
  .strict()

class AccountTeamCatchupDto extends createZodDto(schema) {}

/** #4996 L2 — la porte du rattrapage « partant resté inscrit dans une équipe de compte ». `internal/admin` + secret. */
@Controller('internal/admin/team/account-team-catchup')
@UseGuards(InternalSecretGuard)
export class AccountTeamCatchupController {
  constructor(private readonly catchup: AccountTeamCatchupService) {}

  @Post()
  @HttpCode(200)
  run(@Body() dto: AccountTeamCatchupDto) {
    return this.catchup.run(dto)
  }
}
