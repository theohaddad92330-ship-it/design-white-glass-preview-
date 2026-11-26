import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AccountEntity } from '../../database/entities/account.entity'
import { AccountEntityRow } from '../../database/entities/account-entity.entity'
import { AccountPartnerEntity } from '../../database/entities/account-partner.entity'
import { PartnerRelationEntity } from '../../database/entities/partner-relation.entity'
import { EsnDirectoryModule } from '../esn-directory/esn-directory.module'
import { MarketMemoryModule } from '../market-memory/market-memory.module'
import { WorkspaceModule } from '../workspace/workspace.module'
import { PartnersController } from './partners.controller'
import { PartnersService } from './partners.service'
import { ReflagService } from '../reflag/reflag.service'
import { PARTNERS_FEATURE_FLAG, type PartnersFeatureFlag } from './module-tokens'

/**
 * Les ESN présentes sur un compte (décision D11). Module autonome (règle #7) :
 * le retirer fait disparaître l'onglet, pas les entités dont il lit le rang 1.
 *
 * ⚠️ Il importe désormais la mémoire marché (#1579), et cette dépendance est
 * DÉGRADABLE par construction : sans couverture, sans corpus chargé, ou avec un
 * référentiel en erreur, la liste des sociétés observées est vide et l'onglet
 * rend exactement ce qu'il rendait avant. Aucun chemin de cet onglet ne dépend
 * d'une observation pour fonctionner.
 *
 * ⚠️ #1624.7 — `EsnDirectoryModule` en plus, pour le rang « déclaré » du
 * référentiel ESN (`openToSubcontracting`). MÊME dégradabilité : derrière le
 * drapeau `market_memory_partners_enabled` (`ReflagModule`, global — pas
 * importé ici), et muet dès que le référentiel ne connaît pas le nom.
 * `ReflagService` n'a pas besoin d'entrer dans `imports` : `ReflagModule` est
 * `@Global()`.
 *
 * ⚠️ #3404.5 — `PartnerRelationEntity` en plus : une ENTITÉ, pas un service
 * (`module-boundaries.spec.ts` §3.2 la met explicitement hors du périmètre de
 * GA-07, déjà au plafond). `PartnersService.qualify` s'en sert pour vérifier
 * qu'un `partner_relation_id` posé désigne bien une relation du MÊME espace —
 * une lecture, jamais un appel à `PartnerPipelineService`.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([AccountPartnerEntity, AccountEntityRow, AccountEntity, PartnerRelationEntity]),
    WorkspaceModule,
    MarketMemoryModule,
    EsnDirectoryModule,
  ],
  controllers: [PartnersController],
  providers: [
    PartnersService,
    // #1624.9 — le module COMPOSE, le service ne connaît que la forme.
    // `ReflagModule` est `@Global()`, d'où l'absence d'entrée dans `imports`.
    {
      provide: PARTNERS_FEATURE_FLAG,
      inject: [ReflagService],
      useFactory:
        (reflag: ReflagService): PartnersFeatureFlag =>
        (flag, workspaceId) =>
          reflag.isEnabled(flag, { companyId: workspaceId }),
    },
  ],
  exports: [PartnersService],
})
export class PartnersModule {}
