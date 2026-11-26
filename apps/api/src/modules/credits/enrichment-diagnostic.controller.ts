import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common'
import { InternalSecretGuard } from '../../common/internal-secret.guard'
import { CreditsService, type EnrichmentDiagnostic } from './credits.service'
import { EnrichmentDiagnosticDto } from './dto/enrichment-diagnostic.dto'

/**
 * #3400 — LA PORTE d'opérateur qui répond à « pourquoi l'enrichissement de ce compte
 * est-il refusé alors que la modale annonce 65 crédits ? ». LECTURE SEULE : elle rend
 * la cause que le geste réel donnerait (`CreditsService.enrichmentDiagnostic`) sans
 * débiter, sans écrire de ligne de registre. Même famille que `RefreshRefundController` :
 * préfixe `internal/admin`, {@link InternalSecretGuard} — sans le secret interne, même
 * connecté, c'est un 403.
 */
@Controller('internal/admin/credits/enrichment-diagnostic')
@UseGuards(InternalSecretGuard)
export class EnrichmentDiagnosticController {
  constructor(private readonly credits: CreditsService) {}

  @Post()
  @HttpCode(200)
  run(@Body() dto: EnrichmentDiagnosticDto): Promise<EnrichmentDiagnostic> {
    return this.credits.enrichmentDiagnostic(dto.userId)
  }
}
