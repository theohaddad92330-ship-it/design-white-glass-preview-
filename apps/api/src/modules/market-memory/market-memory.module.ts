import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { MarketCompanyAliasEntity } from '../../database/entities/market-company-alias.entity'
import { MarketCompanyResolutionOverrideEntity } from '../../database/entities/market-company-resolution-override.entity'
import { MarketCompanySignalEntity } from '../../database/entities/market-company-signal.entity'
import { MarketCompanyStackEntity } from '../../database/entities/market-company-stack.entity'
import { MarketEsnClientEntity } from '../../database/entities/market-esn-client.entity'
import { MarketExEsnAtClientEntity } from '../../database/entities/market-ex-esn-at-client.entity'
import { MarketPersonPathEntity } from '../../database/entities/market-person-path.entity'
import { MarketMemoryService } from './market-memory.service'
import { MarketSignalsReader } from './market-signals-reader'

/**
 * La mémoire marché — un module AUTONOME, en lecture seule.
 *
 * Il ne dépend que de ses CINQ tables partagées : le retirer ne casse rien
 * d'autre, et tout ce qui le consomme doit déjà savoir se passer de lui (une
 * couverture absente est un cas normal, pas une panne).
 *
 * ⚠️ Les cinq dépôts injectés par le service sont déclarés ICI, et c'est ce
 * que GA-20 vérifie : un dépôt injecté sans être déclaré ne se voit qu'au
 * démarrage, en production.
 *
 * ⚠️ #1756 — `market_company_alias` est la cinquième, et elle est VIDE
 * aujourd'hui : QUI la remplit est une décision produit en attente. Une table
 * vide n'est pas une panne — sans alias, le rapprochement rend exactement ce
 * qu'il rendait avant elle.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      MarketCompanySignalEntity,
      MarketEsnClientEntity,
      MarketCompanyStackEntity,
      MarketExEsnAtClientEntity,
      MarketPersonPathEntity,
      MarketCompanyAliasEntity,
      MarketCompanyResolutionOverrideEntity,
    ]),
  ],
  providers: [MarketMemoryService, MarketSignalsReader],
  exports: [MarketMemoryService, MarketSignalsReader],
})
export class MarketMemoryModule {}
