import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AccountEntity } from '../../database/entities/account.entity'
import { OrgGraphCorrectionEntity } from '../../database/entities/org-graph-correction.entity'
import { WorkspaceModule } from '../workspace/workspace.module'
import { OrgGraphCorrectionService } from './org-graph-correction.service'
import { OrgGraphController } from './org-graph.controller'
import { OrgGraphVersionService } from './org-graph.service'

/**
 * Versionnement du graphe d'organigramme (Annexe Organigramme §5) : une
 * correction utilisateur produit une nouvelle `graph_version` + une ardoise de
 * rejets que le run suivant ne réinjecte pas.
 *
 * Depuis le paquet OrgGraph FINAL (§7), le module porte aussi le LEDGER des
 * corrections et le VERROU optimiste — d'où son premier contrôleur, et
 * `WorkspaceModule` en import (le contrôleur résout l'espace ACTIF de
 * l'appelant ; l'identifiant ne vient jamais du corps de la requête).
 *
 * ⚠️ `OrgGraphCorrectionEntity` est déclarée dans `forFeature` parce que le
 * service l'injecte (GA-20) : un repository injecté sans être déclaré ne
 * planterait qu'au BOOT, en production, et nulle part avant (GA-42).
 *
 * Aucune dépendance à AccountsModule ni à AnalysisModule (le repo `accounts`
 * suffit) : AccountFeedbackModule et AnalysisModule peuvent tous deux nous
 * importer sans créer de cycle. Module autonome (règle #7) — le retirer laisse
 * le feedback et l'analyse fonctionner, sans versionnement.
 */
@Module({
  imports: [TypeOrmModule.forFeature([AccountEntity, OrgGraphCorrectionEntity]), WorkspaceModule],
  controllers: [OrgGraphController],
  providers: [OrgGraphVersionService, OrgGraphCorrectionService],
  exports: [OrgGraphVersionService, OrgGraphCorrectionService],
})
export class OrgGraphModule {}
