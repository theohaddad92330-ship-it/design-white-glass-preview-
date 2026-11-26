import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { BackofficeAccessEventEntity } from '../../database/entities/backoffice-access-event.entity'
import { AuditJournalModule } from './audit-journal.module'
import { BackofficeAccessJournalService } from './backoffice-access-journal.service'

/**
 * Le journal d'accès du back-office, dans SON module (#1671.2).
 *
 * POURQUOI UN MODULE À LUI PLUTÔT QU'UN SERVICE DANS `AdminModule`
 * Deux modules le consomment : `AdminModule` (l'écriture et la lecture, par la
 * console) et `PrivacyModule` (la purge à douze mois, greffée sur le balayage
 * de rétention de 04:17). Faire importer `AdminModule` par `PrivacyModule` les
 * aurait soudés — et la règle n°7 du dépôt veut que retirer un module ne casse
 * pas le reste. `PrivacyModule` est explicitement écrit pour être autonome.
 *
 * Ce module ne dépend que de TypeORM : chacun des deux peut donc l'importer, et
 * chacun des deux peut disparaître sans emporter l'autre. La dérivation, elle,
 * continue de vivre à UN seul endroit — le service.
 */
/**
 * ⚠️ AJOUT DU 07/09/2026 — LE MIROIR VERS LE JOURNAL UNIQUE (#1666).
 *
 * `AuditJournalModule` est importé ICI, et c'est ce qui fait du miroir une
 * réalité plutôt qu'une intention : le service l'injecte en `@Optional()`, et un
 * `@Optional()` non résolu ne lève pas — il DÉGRADE EN SILENCE. C'est le défaut
 * exact de `CostAlertService` le 29/08 (l'appel était juste, le module ne
 * fournissait rien, et cinq alertes partaient par réplique tous les matins).
 * Sans cette ligne, entrer dans la console n'apparaîtrait nulle part dans le
 * journal « unique », et tous les tests seraient verts.
 */
@Module({
  imports: [TypeOrmModule.forFeature([BackofficeAccessEventEntity]), AuditJournalModule],
  providers: [BackofficeAccessJournalService],
  exports: [BackofficeAccessJournalService],
})
export class BackofficeAccessJournalModule {}
