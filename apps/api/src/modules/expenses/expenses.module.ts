import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { WorkspaceModule } from '../workspace/workspace.module'
import { StorageModule } from '../storage/storage.module'
import { ExpenseReportEntity } from '../../database/entities/expense-report.entity'
import { ExpenseExtractionController } from './expense-extraction.controller'
import { ExpenseExtractionService } from './expense-extraction.service'
import { ExpensePoliciesController } from './expense-policies.controller'
import { ExpensePoliciesService } from './expense-policies.service'
import { ExpenseReportsController } from './expense-reports.controller'
import { ExpenseReportsService } from './expense-reports.service'

/**
 * LES NOTES DE FRAIS — le domaine (31/08/2026).
 *
 * Une seule entité est déclarée à `forFeature`, et ce n'est pas un oubli : le
 * service lit les cinq tables par SQL, à travers le `manager` de ce dépôt.
 * C'est le motif déjà en place sur `invoice-readiness` et les relevés — un
 * dossier se lit par jointures, et déclarer cinq dépôts pour n'en injecter
 * aucun ferait croire à cinq accès qui n'existent pas.
 *
 * `WorkspaceModule` est importé pour `WorkspaceContextService` : c'est le
 * CONTRÔLEUR qui résout l'espace et le droit financier, jamais le service
 * (règle §3.2, garde GA-07).
 *
 * #2987.56 (28/09/2026) — EXPORTE désormais `ExpenseReportsService`, et ce
 * n'est plus vrai que « rien ne l'importe » : `CopilotBridgeModule` en a
 * besoin pour que Laura sache QUELLES notes attendent une décision (la
 * capacité d'approbation de dépense pendant une conversation vocale, qui
 * n'existait pas). Même motif que `DeliveryModule`/`ConsultantsModule`, déjà
 * exportés pour ce même pont — retirer ce module casse désormais CE SEUL
 * appelant (le pont), jamais l'écran des notes de frais lui-même.
 */
@Module({
  // `StorageModule` est importé pour le CONTRÔLEUR, jamais pour le service :
  // c'est lui qui dépose les octets puis rattache la ligne, parce que c'est lui
  // qui a déjà tranché le droit. Sens unique — le stockage ne nous importe pas,
  // donc aucun cycle, et le retirer ramène les justificatifs à ce qu'ils
  // étaient : des pièces référencées, sans bouton.
  imports: [WorkspaceModule, StorageModule, TypeOrmModule.forFeature([ExpenseReportEntity])],
  // Trois contrôleurs : `expenses/reports` porte des DOSSIERS,
  // `expenses/policies` porte un RÉGLAGE, `expenses/receipts` PROPOSE des
  // champs sans jamais rien écrire (#1827.2). Deux durées de vie et deux
  // droits d'écriture — déposer une note est `records:write`, écrire un
  // plafond est une décision financière ; lire un justificatif partage le
  // droit du dépôt, puisqu'il n'écrit rien de plus qu'une saisie manuelle.
  controllers: [ExpenseReportsController, ExpensePoliciesController, ExpenseExtractionController],
  providers: [ExpenseReportsService, ExpensePoliciesService, ExpenseExtractionService],
  // #2987.56 — SEUL `ExpenseReportsService` sort d'ici : `.list()` porte déjà
  // le retrait des montants (`redactFinance`) que le pont doit appliquer
  // EN DUR, comme `talents/search`. Les deux autres services (plafonds,
  // extraction) restent internes — le pont n'en a pas besoin.
  exports: [ExpenseReportsService],
})
export class ExpensesModule {}
