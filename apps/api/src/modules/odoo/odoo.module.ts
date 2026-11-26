import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { CrmConnectionEntity } from '../../database/entities/crm-connection.entity'
import { UserActionEntity } from '../../database/entities/user-action.entity'
import { PlanFeaturesModule } from '../plan-features/plan-features.module'
import { WorkspaceModule } from '../workspace/workspace.module'
import { OdooController } from './odoo.controller'
import { OdooService } from './odoo.service'
import { CrmFirstImportModule } from '../crm-first-import/crm-first-import.module'

/**
 * Odoo — le cinquième CRM, et le premier qui ne passe pas par OAuth.
 *
 * Il partage la table `crm_connections` (provider = 'odoo') et le chiffrement
 * de jeton du module CRM, comme les trois autres. Ce qu'il ne partage pas : le
 * parcours de consentement. Une instance Odoo s'authentifie par base +
 * identifiant + clé d'API, et peut être auto-hébergée à n'importe quelle
 * adresse — d'où la garde SSRF sur chaque appel, et zéro route non gardée.
 *
 * ⚠️ Inerte tant qu'un espace n'a pas fourni ses identifiants : aucune variable
 * d'environnement à poser côté serveur, et donc aucun appel réseau par défaut.
 */
@Module({
  imports: [
    // SYNC-B — la première reprise part au branchement.
    CrmFirstImportModule,
    // Gating par offre : l'export CRM demande la feature `crm_sync`.
    PlanFeaturesModule,
    WorkspaceModule,
    TypeOrmModule.forFeature([CrmConnectionEntity, UserActionEntity]),
  ],
  controllers: [OdooController],
  providers: [OdooService],
  exports: [OdooService],
})
export class OdooModule {}
