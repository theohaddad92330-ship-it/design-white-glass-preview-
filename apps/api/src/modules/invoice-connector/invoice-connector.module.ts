import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { CrmConnectionEntity } from '../../database/entities/crm-connection.entity'
import { InvoiceConnectorWriteRequestEntity } from '../../database/entities/invoice-connector-write-request.entity'
import { MissionCommercialTermsEntity } from '../../database/entities/mission-commercial-terms.entity'
import { MissionEntity } from '../../database/entities/mission.entity'
import { DeliveryModule } from '../delivery/delivery.module'
import { LegalEntitiesModule } from '../legal-entities/legal-entities.module'
import { WorkspaceModule } from '../workspace/workspace.module'
import { ToolRegistryModule } from '../tool-registry/tool-registry.module'
import { StorageModule } from '../storage/storage.module'
import { InvoiceAttachmentsController } from './invoice-attachments.controller'
import { InvoiceAttachmentsService } from './invoice-attachments.service'
import { InvoiceConnectorWriteController } from './invoice-connector-write.controller'
import { InvoiceConnectorWriteService } from './invoice-connector-write.service'
import { INVOICE_CONNECTOR_PORT } from './invoice-connector.port'
import { OdooDraftInvoiceConnectorPort } from './odoo-draft-invoice.port'

/**
 * #2565 — module AUTONOME (règle CLAUDE n°7) : le retirer supprime « créer la
 * facture dans l'outil de gestion » et rien d'autre.
 *
 * Volontairement à PART de `DeliveryModule`, qui se déclare lui-même sans
 * dépendance à « la facture légale » (`delivery.module.ts`, en tête) : la
 * dépendance va dans UN sens, d'ici vers lui, jamais l'inverse.
 *
 * #2565.10 — il l'IMPORTE désormais, pour que le CONTRÔLEUR (la couche
 * d'orchestration, GA-07 §3.2) lise le mois par le calcul de l'écran
 * (`InvoiceReadinessService.list`). Il lisait avant la colonne
 * `invoice_readiness.state`, que rien n'écrit jamais à `'ready'` : la porte
 * refusait tout mois prêt. Aucun SERVICE de ce module n'importe un service de
 * `DeliveryModule`.
 */
@Module({
  imports: [
    WorkspaceModule,
    // Le seul appelant cross-module vit dans le CONTRÔLEUR (GA-07, §3.2) :
    // résoudre l'outil de gestion connecté avant d'appeler le service, qui ne
    // connaît lui-même aucun registre d'outils.
    ToolRegistryModule,
    // #2565.10 — le mois tel que l'écran le lit, résolu par le contrôleur.
    DeliveryModule,
    // #2565.10 — `crm_connections` : le lien Odoo de l'ESPACE (uid + clé
    // chiffrée), lu par l'adaptateur. L'entité est un schéma partagé (GA-07).
    // #2418.3 — `mission_commercial_terms` : devise et conditions de
    // règlement, lues par `InvoiceConnectorWriteService` pour la
    // prévisualisation FIGÉE. Même raison exacte : un schéma partagé, jamais
    // le SERVICE `StaffingService` de `DeliveryModule`.
    // #2426.98 — `MissionEntity` : lue directement par le CONTRÔLEUR pour
    // résoudre la société porteuse, comme `StaffingService` le fait déjà
    // ailleurs (schéma partagé, GA-07) — aucun SERVICE de ce module ne la lit.
    TypeOrmModule.forFeature([
      InvoiceConnectorWriteRequestEntity,
      CrmConnectionEntity,
      MissionCommercialTermsEntity,
      MissionEntity,
    ]),
    // #2814 — les pièces jointes de la facture préparée : le stockage borné
    // (taille, type, signature, quota, URL signée courte).
    StorageModule,
    // #2426.98 — le registre des sociétés de l'espace, pour refuser un dépôt
    // NEUF sous une société archivée. Import de MODULE, pas de service
    // croisé entre services (même règle que `DeliveryModule` ci-dessus).
    LegalEntitiesModule,
  ],
  controllers: [InvoiceConnectorWriteController, InvoiceAttachmentsController],
  providers: [
    InvoiceConnectorWriteService,
    InvoiceAttachmentsService,
    // #2565.10 — CETTE ligne, et rien d'autre (un réglage vit à un seul
    // endroit, GA-26) : l'adaptateur Odoo — un BROUILLON de facture client,
    // jamais validé ni envoyé (`odoo-draft-invoice.port.ts`, D4 : la doc
    // publique, le non-prouvé marqué NON VÉRIFIÉ). Tout autre outil garde le
    // refus honnête de `RetainedInvoiceConnectorPort`, auquel il délègue.
    { provide: INVOICE_CONNECTOR_PORT, useClass: OdooDraftInvoiceConnectorPort },
  ],
})
export class InvoiceConnectorModule {}
