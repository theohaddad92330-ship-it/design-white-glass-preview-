import { Controller, Get, Query, UseGuards } from '@nestjs/common'
import { InternalSecretGuard } from '../../common/internal-secret.guard'
import { IntegrationsService, type AdminDeliveryRow } from './integrations.service'

/**
 * Le journal de livraison des webhooks, côté OPÉRATEUR.
 *
 * L'écran client ne le porte plus : un code HTTP, un numéro de tentative et un
 * message d'erreur brut sont du débogage, et le débogage vit au back-office.
 * L'utilisateur voit ce qui est branché ; l'opérateur voit ce qui est parti.
 *
 * Transverse aux espaces par construction, donc derrière {@link InternalSecretGuard}
 * comme le reste de `internal/admin` — cette garde est la seule chose entre la
 * route et toute la table.
 *
 * Ce qui sort d'ici reste sans secret : l'URL de webhook (qui porte un jeton) ne
 * traverse jamais la réponse, et `error` a déjà été nettoyé à l'écriture.
 */
@Controller('internal/admin/integrations')
@UseGuards(InternalSecretGuard)
export class AdminIntegrationsController {
  constructor(private readonly integrations: IntegrationsService) {}

  /**
   * Les dernières livraisons, toutes intégrations confondues.
   *
   * `workspaceId` restreint à un client ; sans lui, on lit la plateforme — c'est
   * la vue « qu'est-ce qui casse en ce moment ? », qui n'a de sens que globale.
   */
  @Get('deliveries')
  deliveries(
    @Query('workspaceId') workspaceId?: string,
    @Query('limit') limit?: string,
  ): Promise<{ rows: AdminDeliveryRow[]; truncated: boolean }> {
    const parsed = Number.parseInt(limit ?? '', 10)
    return this.integrations.listAdminDeliveries({
      workspaceId: workspaceId?.trim() || null,
      // Une limite illisible n'est pas une limite de 0 : on retombe sur le défaut
      // du service plutôt que de rendre une liste vide qui se lirait « rien ».
      ...(Number.isFinite(parsed) && parsed > 0 ? { limit: parsed } : {}),
    })
  }
}
