import { Controller, Get, UseGuards } from '@nestjs/common'
import { resolveChangelogEntries, type ChangelogEntry } from '@bellum/contracts'
import { InternalSecretGuard } from '../../common/internal-secret.guard'
import { ChangelogNewsletterService, type ChangelogDeliverySnapshot } from './changelog-newsletter.service'

/** Ce que l'écran « Changelog » du back-office affiche, en un appel. */
type AdminChangelogReport = {
  /** Le catalogue résolu en FR, la plus récente d'abord. */
  entries: ChangelogEntry[]
  /** Où en sont les lecteurs de la newsletter. */
  delivery: ChangelogDeliverySnapshot
}

/**
 * L'état du changelog pour l'opérateur — demande de Louis du 06/09/2026 :
 * « j'aimerai pouvoir aussi suivre les changelog sur le dashboard manager ».
 *
 * POURQUOI CETTE ROUTE VIT DANS CE MODULE, ET PAS DANS `AdminModule`
 * Le module se décrivait « autonome : il n'expose aucune route ». Le brancher
 * depuis `AdminModule` aurait inversé la dépendance — retirer la newsletter
 * aurait alors cassé le back-office. Ici, retirer le module retire l'envoi ET
 * l'écran qui le suit : les deux parlent du même sujet, ils tombent ensemble.
 *
 * Le catalogue ne TRANSITE pas par une copie : `resolveChangelogEntries` est la
 * même fonction que celle qui compose l'e-mail et que celle que lit le panneau
 * « Nouveautés » de la SPA. Le back-office n'a donc aucune dépendance à
 * `@bellum/contracts` à ajouter, et surtout aucun miroir à resynchroniser.
 *
 * `InternalSecretGuard` comme toutes les routes `internal/admin/*` : la console
 * opérateur est cross-tenant, ce garde est la seule chose entre elle et la base.
 */
@Controller('internal/admin/changelog')
@UseGuards(InternalSecretGuard)
export class ChangelogNewsletterAdminController {
  constructor(private readonly newsletter: ChangelogNewsletterService) {}

  @Get()
  async getReport(): Promise<AdminChangelogReport> {
    return {
      entries: resolveChangelogEntries('fr'),
      delivery: await this.newsletter.describeDelivery(),
    }
  }
}
