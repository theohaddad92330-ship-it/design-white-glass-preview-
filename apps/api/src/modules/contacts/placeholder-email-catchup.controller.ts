import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common'
import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'
import { InternalSecretGuard } from '../../common/internal-secret.guard'
import { PlaceholderEmailCatchupService } from './placeholder-email-catchup.service'

// UN espace, jamais tout le parc ; `dryRun` vaut `true` par défaut (le mode réel se DEMANDE, booléen JSON strict).
const schema = z.object({ workspaceId: z.string().guid(), dryRun: z.boolean().default(true) }).strict()

class PlaceholderEmailCatchupDto extends createZodDto(schema) {}

/**
 * #4599 — LA SEULE PORTE du rattrapage des adresses gabarit (« prenom.nom@… ») déjà en base. Le service n'avait aucun
 * appelant : sans cette porte la donnée fausse restait en base (export, API, séquence). Même famille que
 * `ContactEmailNameBackfillController` : `internal/admin`, {@link InternalSecretGuard} ; ni démarrage, ni cron.
 * Le COMPTE exact avant/après se lit par `GET /contacts?placeholderEmail=true` (le `total`).
 */
@Controller('internal/admin/contacts/placeholder-email-catchup')
@UseGuards(InternalSecretGuard)
export class PlaceholderEmailCatchupController {
  constructor(private readonly catchup: PlaceholderEmailCatchupService) {}

  @Post()
  @HttpCode(200)
  run(@Body() dto: PlaceholderEmailCatchupDto) {
    return this.catchup.run({ workspaceId: dto.workspaceId, dryRun: dto.dryRun })
  }
}
