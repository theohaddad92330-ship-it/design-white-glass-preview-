import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { OutgoingPaymentEntity } from '../../database/entities/outgoing-payment.entity'
import { WorkspaceModule } from '../workspace/workspace.module'
import { OutgoingPaymentsController } from './outgoing-payments.controller'
import { OutgoingPaymentsService } from './outgoing-payments.service'

/**
 * Les PAIEMENTS SORTANTS — module autonome (règle CLAUDE n°7) : le retirer
 * supprime l'écran des paiements et rien d'autre.
 *
 * ⚠️ **Aucune dépendance au module `delivery`, et c'est délibéré.** Le service
 * LIT trois tables du Delivery OS (`missions`, `mission_timesheets`,
 * `supplier_invoices`) et n'importe aucun de ses services : la frontière doit
 * se voir dans le graphe de dépendances, pas seulement dans un commentaire.
 * Ce module ne PEUT donc pas écrire un relevé ni une facture fournisseur —
 * ce n'est pas une convention, c'est l'absence de code.
 *
 * ⚠️ Il n'y a QU'UNE entité déclarée, et c'est voulu : les trois tables lues
 * le sont en SQL brut par `manager.query`, jamais par un repository injecté —
 * un repository non déclaré est le défaut GA-20, et déclarer les entités d'un
 * autre domaine ici ouvrirait un chemin d'ÉCRITURE vers elles.
 *
 * ⚠️ **Aucun provider de routine, aucun job, aucun kill-switch.** Rien dans ce
 * module ne s'exécute tout seul : toute écriture part d'un clic. Le jour où une
 * routine naîtra, elle passera par une demande visible avec sa prévisualisation
 * FIGÉE — l'absence de code est ce qui le garantit aujourd'hui.
 */
@Module({
  imports: [WorkspaceModule, TypeOrmModule.forFeature([OutgoingPaymentEntity])],
  controllers: [OutgoingPaymentsController],
  providers: [OutgoingPaymentsService],
  // Un service injecté dans un contrôleur doit être EXPORTÉ (GA-42) : sans
  // l'export, le manque ne se voit qu'au boot.
  exports: [OutgoingPaymentsService],
})
export class PaymentsModule {}
