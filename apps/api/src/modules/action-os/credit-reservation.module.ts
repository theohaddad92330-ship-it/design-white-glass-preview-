import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { CreditReservationEntity } from '../../database/entities/credit-reservation.entity'
import { CREDIT_RESERVATION_SETTLER } from './credit-reservation.port'
import { CreditReservationService } from './credit-reservation.service'

/**
 * #1931 L2 (I3) — le registre des crédits PROMIS, en module FEUILLE.
 *
 * `CreditReservationService` vivait dans `ActionOsModule`. Le worker
 * d'enrichissement (module `contacts`) doit pouvoir solder la réservation posée
 * au clic d'une carte, au moment où il observe le débit. Or `ActionOsModule`
 * importe `ActionRouterModule`, qui importe `ContactsModule` : importer
 * `ActionOsModule` depuis `contacts` fermerait un cycle.
 *
 * Ce module n'importe que son entité — aucun cycle possible — et c'est lui que
 * les deux côtés importent. Nest n'instancie un module qu'une fois : le worker et
 * le runner parlent au MÊME service, seul écrivain de la table.
 *
 * Le jeton `CREDIT_RESERVATION_SETTLER` (`credit-reservation.port.ts`) expose
 * `settle` seul, par `useExisting` : un consommateur hors Action OS n'a aucune
 * raison de voir `reserve` ni `sweepExpired`.
 */
@Module({
  imports: [TypeOrmModule.forFeature([CreditReservationEntity])],
  providers: [CreditReservationService, { provide: CREDIT_RESERVATION_SETTLER, useExisting: CreditReservationService }],
  exports: [CreditReservationService, CREDIT_RESERVATION_SETTLER],
})
export class CreditReservationModule {}
