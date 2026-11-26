import { Controller, Get, UseGuards } from '@nestjs/common'
import { InternalSecretGuard } from '../../common/internal-secret.guard'
import type { OfferEconomics } from './offer-economics'
import { OfferEconomicsService } from './offer-economics.service'

/**
 * Le catalogue d'offres AVEC ce que chacune rapporte (issue 1656).
 *
 * Même modèle de confiance que le reste d'`internal/admin` : la seule porte est
 * le secret interne, que la console attache côté serveur.
 *
 * ⚠️ LECTURE SEULE. L'écriture du catalogue reste sur
 * `PATCH /internal/admin/plans/:key` (module `admin`) : une route d'écriture de
 * plus ici en ferait DEUX, et le jour où l'une des deux oublierait une
 * validation, c'est celle-là qui serait appelée.
 */
@Controller('internal/admin/offer-economics')
@UseGuards(InternalSecretGuard)
export class OfferEconomicsController {
  constructor(private readonly economics: OfferEconomicsService) {}

  @Get()
  async overview(): Promise<{ offers: OfferEconomics[] }> {
    return { offers: await this.economics.overview() }
  }
}
