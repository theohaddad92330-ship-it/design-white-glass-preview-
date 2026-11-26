import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ChainManualMarkEntity } from '../../database/entities/chain-manual-mark.entity'
import { WorkspaceModule } from '../workspace/workspace.module'
import { ChainsController } from './chains.controller'
import { ChainsService } from './chains.service'

/**
 * Les parcours, dérivés des objets métier (#1503).
 *
 * Module autonome (règle #7), et il l'est plus qu'avant : il ne lit AUCUN autre
 * module. Ses projecteurs interrogent les tables du même schéma en SQL nommé
 * plutôt que d'importer `AccountsModule`, `ProjectsModule`, `MissionsModule` et
 * `ConsultantsModule` pour lire un identifiant et quelques dates — quatre
 * dépendances métier pour une lecture, et un cycle d'imports au premier
 * enrichissement.
 *
 * ⚠️ Il n'importe plus le journal des portes, et c'est la conséquence directe du
 * chantier : **plus personne ne franchit une porte de chaîne**. Une porte se LIT
 * maintenant sur l'objet (`project_needs.staffable`, `accounts.priority_gate`,
 * `invoice_readiness.state`), et c'est le module qui la porte qui journalise sa
 * décision. Garder l'import aurait laissé une dépendance qu'aucun appel
 * n'emprunte — le motif même que ce chantier corrige.
 *
 * ⚠️ `ChainsService` est exporté et il a désormais de VRAIS appelants hors de ce
 * module : `BriefingModule` (les blocages du matin) et l'outil de Laura. C'est
 * précisément ce qui manquait — le moteur était juste, testé, et personne ne
 * l'appelait.
 */
@Module({
  imports: [TypeOrmModule.forFeature([ChainManualMarkEntity]), WorkspaceModule],
  controllers: [ChainsController],
  providers: [ChainsService],
  exports: [ChainsService],
})
export class ChainsModule {}
