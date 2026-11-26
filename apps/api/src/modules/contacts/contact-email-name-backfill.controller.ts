import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common'
import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'
import { InternalSecretGuard } from '../../common/internal-secret.guard'
import {
  ContactEmailNameBackfillService,
  type ContactEmailNameBackfillOutcome,
} from './contact-email-name-backfill.service'

// UN espace, jamais tout le parc ; `dryRun` vaut `true` par défaut (le mode réel se DEMANDE, booléen JSON strict).
const schema = z.object({ workspaceId: z.string().guid(), dryRun: z.boolean().default(true) }).strict()

class ContactEmailNameBackfillDto extends createZodDto(schema) {}

/**
 * #4586 — LA SEULE PORTE du rattrapage des fiches nommées par leur adresse. Même famille que
 * `AnalysisFoundBackfillController` : `internal/admin`, {@link InternalSecretGuard} ; ni démarrage, ni cron.
 */
@Controller('internal/admin/contacts/email-name-backfill')
@UseGuards(InternalSecretGuard)
export class ContactEmailNameBackfillController {
  constructor(private readonly backfill: ContactEmailNameBackfillService) {}

  @Post()
  @HttpCode(200)
  run(@Body() dto: ContactEmailNameBackfillDto): Promise<ContactEmailNameBackfillOutcome> {
    return this.backfill.run(dto.workspaceId, { dryRun: dto.dryRun })
  }
}
