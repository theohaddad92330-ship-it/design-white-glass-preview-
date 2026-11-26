import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common'
import { InternalSecretGuard } from '../../common/internal-secret.guard'
import { BackofficeAlertsService } from './backoffice-alerts.service'
import { ProviderCreditsExhaustedDto } from './dto/provider-credits-exhausted.dto'
import { ProviderSilentDto } from './dto/provider-silent.dto'
import { ProviderUnusedDto } from './dto/provider-unused.dto'

/**
 * #1676.1 — le déclenchement MANUEL du passage d'alertes, pour la recette —
 * même geste que `CostAlertService#check` et `ObservabilityAlertsService#
 * check`, exposé en HTTP ici parce que ce module n'a pas de console interne à
 * lui pour appeler une méthode de service directement.
 *
 * Le calcul et la composition réelle vivent dans `BackofficeAlertsService`
 * (voir son docblock — GA-07 contre GA-77).
 */
@Controller('internal/admin/backoffice-alerts')
@UseGuards(InternalSecretGuard)
export class BackofficeAlertsController {
  constructor(private readonly alerts: BackofficeAlertsService) {}

  @Post('run')
  @HttpCode(202)
  async runManually(): Promise<{ ok: true }> {
    await this.alerts.runNow()
    // #1946.22 — décision Louis 13/09 batch 12 : la recette joue aussi le
    // passage quotidien « espace à risque ». Sa fenêtre de 7 jours tient : un
    // espace déjà alerté cette semaine ne l'est pas une seconde fois par ce clic.
    await this.alerts.checkWorkspacesAtRisk()
    return { ok: true }
  }

  /**
   * #2528.3 — le point d'entrée que le moteur IA (et l'API elle-même) appelle
   * quand une source rend un 402/429 de quota, une fois par fenêtre côté
   * appelant (jamais à chaque requête) — voir `app/services/backoffice_alerts.py`
   * côté IA pour le débit d'appel réel.
   */
  @Post('provider-credits-exhausted')
  @HttpCode(202)
  async providerCreditsExhausted(@Body() body: ProviderCreditsExhaustedDto): Promise<{ ok: true }> {
    await this.alerts.reportProviderCreditsExhausted(body)
    return { ok: true }
  }

  /**
   * SIG-C (11/10) — « source muette » : appelé par le moteur IA au N-ième échec
   * consécutif d'un fournisseur, puis `resolved: true` à son premier succès
   * (`app/services/source_silence.py` côté IA).
   */
  @Post('provider-silent')
  @HttpCode(202)
  async providerSilent(@Body() body: ProviderSilentDto): Promise<{ ok: true }> {
    await this.alerts.reportProviderSilent(body)
    return { ok: true }
  }

  // ALERTES-402 (30/10/2026) — « configurée mais plus appelée depuis N jours » : l'autre face de
  // `provider-silent`, qui ne compte que des erreurs et ne voit donc pas une source morte derrière
  // un cache (TheirStack à sec du 28 au 30/10, aucune erreur, aucun trou visible).
  @Post('provider-unused')
  @HttpCode(202)
  async providerUnused(@Body() body: ProviderUnusedDto): Promise<{ ok: true }> {
    await this.alerts.reportProviderUnused(body)
    return { ok: true }
  }
}
