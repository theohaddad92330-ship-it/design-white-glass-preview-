import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AnalysisRunEntity } from '../../database/entities/analysis-run.entity'
import { CreditLedgerEntity } from '../../database/entities/credit-ledger.entity'
import { ManualBillingInvoiceEntity } from '../../database/entities/manual-billing-invoice.entity'
import { ManualBillingTermsEntity } from '../../database/entities/manual-billing-terms.entity'
import { ProviderCostEntity } from '../../database/entities/provider-cost.entity'
import { SubscriptionEntity } from '../../database/entities/subscription.entity'
import { WorkspaceEntity } from '../../database/entities/workspace.entity'
import { InternalSecretGuard } from '../../common/internal-secret.guard'
import { AdminClientHealthService } from '../admin/admin-client-health.service'
import { AdminModule } from '../admin/admin.module'
import { BackofficeAccessJournalModule } from '../admin/backoffice-access-journal.module'
import { BackofficeAccessJournalService } from '../admin/backoffice-access-journal.service'
import { LocksModule } from '../locks/locks.module'
import { SingletonLockService, withSingletonLock } from '../locks/singleton-lock.service'
import { BackofficeAlertDispatchService } from './backoffice-alert-dispatch.service'
import { BackofficeAlertsController } from './backoffice-alerts.controller'
import { BackofficeAlertsService } from './backoffice-alerts.service'
import { ManagerDependenciesController } from './manager-dependencies.controller'
import {
  CLIENT_HEALTH_READER,
  SECURITY_JOURNAL,
  SINGLETON_LOCK,
  type ClientHealthReader,
  type SecurityJournalReader,
  type UnderSingletonLock,
} from './module-tokens'

/**
 * #1676 — le dispatcheur d'alertes du back-office (1676.1) et la page des
 * dépendances DU MANAGER (1676.2). Un seul module : les deux répondent à la
 * même question opérationnelle (« le manager va-t-il devoir intervenir ? »),
 * et la seconde réutilise le transport e-mail/Slack de la première pour ses
 * boutons « Tester ».
 *
 * ⚠️⚠️ C'EST ICI, ET SEULEMENT ICI, QUE `BackofficeAccessJournalService` ET
 * `SingletonLockService` SONT NOMMÉS. Voir le docblock de
 * `backoffice-alerts.service.ts` : GA-07 (au plafond) interdit ces deux
 * imports dans un fichier de SERVICE, GA-77 exige que l'hôte du `@Cron` soit
 * un `provider`. Les deux jetons ci-dessous sont la résolution déjà choisie
 * par ce dépôt pour ce conflit précis (`business-metrics/module-tokens.ts`,
 * #1645).
 *
 * ✅ IMPORTÉ dans `app.module.ts` (:114 et :271) — le contrôleur et le `@Cron`
 * de ce module tournent donc en production.
 *
 * ⚠️ Ce paragraphe a dit le CONTRAIRE pendant plusieurs jours, et un agent du
 * 09/09 l'a cru : il a rapporté « module non importé, à poser par
 * l'intégrateur » alors que la ligne existait déjà. Un commentaire qui décrit
 * un état extérieur au fichier vieillit sans que rien ne le dise — c'est la
 * même famille que le docblock de `access-addressability.spec.ts`, périmé lui
 * aussi et corrigé dans la même PR. Si ce module cesse un jour d'être importé,
 * c'est GA-77 qui doit le dire, pas cette phrase.
 *
 * Autonome (règle #7) : `BackofficeAccessJournalModule` est déjà consommé par
 * `AdminModule` et `PrivacyModule` sans qu'aucun des trois dépende des deux
 * autres ; retirer `BackofficeAlertsModule` n'emporte ni le journal d'accès,
 * ni sa purge, ni l'écran `/securite`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * #1676.1 — 10/09/2026 : `nouveau_client` / `churn_client`, ENTITÉS SEULEMENT
 * ─────────────────────────────────────────────────────────────────────────────
 * Cinq entités de plus dans `forFeature` (`CreditLedgerEntity`,
 * `SubscriptionEntity`, `WorkspaceEntity`, `ManualBillingTermsEntity`,
 * `ManualBillingInvoiceEntity`) — AUCUN service importé, donc AUCUN coût pour
 * GA-07 (`module-boundaries.spec.ts` ne compte que les imports service→service
 * dont le second segment contient « service » ; une entité vit sous
 * `../../database/entities/…`, hors du champ qu'il regarde — même exemption
 * que `AnalysisRunEntity`/`ProviderCostEntity` juste au-dessus, en place depuis
 * #1676). La dérivation elle-même (`billingHealth`) n'est PAS réimportée ici :
 * `backoffice-alerts.service.ts` l'importe directement depuis
 * `../admin/manual-billing-schedule` — un fichier de fonctions PURES, sans
 * suffixe « service », donc lui non plus ne compte pas pour GA-07 (même
 * exemption que `JOB_TIMEOUT_MS` depuis `../analysis/analysis.constants`,
 * `operational-alerts.ts`). `ManualProvisioningService` (module `admin`), qui
 * porte la MÊME dérivation pour le balayage quotidien de 07h10, n'est PAS
 * importé : `AdminModule` n'exporte aucun provider, l'importer aurait exigé de
 * toucher `admin.module.ts` — hors périmètre de ce lot.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * #1946.22 — 13/09/2026 : `espace_a_risque`, décision Louis batch 12
 * ─────────────────────────────────────────────────────────────────────────────
 * `AdminModule` exporte désormais `AdminClientHealthService` (#1652), et ce
 * module l'importe pour le jeton `CLIENT_HEALTH_READER` — même sortie que
 * `SECURITY_JOURNAL` : le service ne connaît que la forme d'une lecture, GA-07
 * ne compte pas cette ligne (couche module). Sens unique : `AdminModule`
 * n'importe jamais ce module.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      AnalysisRunEntity,
      ProviderCostEntity,
      CreditLedgerEntity,
      SubscriptionEntity,
      WorkspaceEntity,
      ManualBillingTermsEntity,
      ManualBillingInvoiceEntity,
    ]),
    BackofficeAccessJournalModule,
    LocksModule,
    AdminModule,
  ],
  controllers: [BackofficeAlertsController, ManagerDependenciesController],
  providers: [
    BackofficeAlertDispatchService,
    BackofficeAlertsService,
    InternalSecretGuard,
    {
      provide: SECURITY_JOURNAL,
      inject: [BackofficeAccessJournalService],
      useFactory:
        (journal: BackofficeAccessJournalService): SecurityJournalReader =>
        (fenetreJours: number) =>
          journal.etatSecurite(fenetreJours),
    },
    {
      provide: SINGLETON_LOCK,
      inject: [{ token: SingletonLockService, optional: true }],
      useFactory:
        (locks?: SingletonLockService): UnderSingletonLock =>
        (name, run) =>
          withSingletonLock(locks, name, run),
    },
    {
      // #1946.22 — décision Louis 13/09 batch 12 : la santé MESURÉE des espaces.
      provide: CLIENT_HEALTH_READER,
      inject: [AdminClientHealthService],
      useFactory:
        (health: AdminClientHealthService): ClientHealthReader =>
        (now: Date) =>
          health.list({ now }),
    },
  ],
})
export class BackofficeAlertsModule {}
