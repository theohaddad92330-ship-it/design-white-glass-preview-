import { Injectable } from '@nestjs/common'
import { ProviderCostService } from './provider-cost.service'

/**
 * La PORTE d'écriture du coût fournisseur pour un module qui n'a que l'en-tête
 * `x-bellum-costs` sous la main (#2205.53 — les routines).
 *
 * Nommée sans « service » À DESSEIN, comme `account-claim.bus.ts` (GA-07,
 * `module-boundaries.spec.ts`) : un module consommateur qui importerait
 * `ProviderCostService` ajouterait une arête service → service au gel ; celui-ci
 * dépend d'une porte de trois lignes, et la logique reste à UN seul endroit
 * (`parseHeader` + `record`, jamais recopiées — GA-26). Best-effort comme
 * `record` : une ligne manquée ne fait jamais échouer l'appelant.
 */
@Injectable()
export class ProviderCostRecorder {
  constructor(private readonly costs: ProviderCostService) {}

  async recordHeader(
    header: string | null,
    context: { workspaceId: string | null; userId: string | null; feature: string },
  ): Promise<void> {
    await this.costs.record(this.costs.parseHeader(header), context)
  }
}
