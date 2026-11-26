import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { PartnerRelationEntity } from '../../database/entities/partner-relation.entity'
import { EsnDirectoryModule } from '../esn-directory/esn-directory.module'
import { EsnProfileReaderModule } from '../esn-profile/esn-profile-reader.module'
import { MarketMemoryModule } from '../market-memory/market-memory.module'
import { WorkspaceModule } from '../workspace/workspace.module'
import { PartnerPipelineController } from './partner-pipeline.controller'
import { PartnerPipelineService } from './partner-pipeline.service'
import { EsnDirectoryService } from '../esn-directory/esn-directory.service'
import { EsnProfileReader } from '../esn-profile/esn-profile-reader.service'
import { MarketMemoryService } from '../market-memory/market-memory.service'
import { marketMatchKey } from '../market-memory/market-company-key'
import {
  ESN_DIRECTORY_BY_DEPARTMENT,
  ESN_PROFILE_ANSWERS_READER,
  MARKET_ESN_OBSERVATION_READER,
  type EsnDirectoryByDepartment,
  type EsnProfileAnswersReader,
  type MarketEsnObservationReader,
} from './profile-match-tokens'

/**
 * Le canal partenaire — module autonome (règle #7).
 *
 * #1798 — `EsnDirectoryModule` et `EsnProfileReaderModule` rejoignent les
 * imports : le premier documente déjà « Territoire, Partenaires » comme ses
 * deux consommateurs (voir son docblock), le second est la lecture NARROW du
 * profil vendeur, sans traîner Auth/Mailer/ProfileContext. Aucun des deux
 * n'importe `PartnerPipelineModule` — pas de cycle.
 *
 * ⚠️ GA-07 est un cliquet AU PLAFOND (254/124 au 10/09/2026, marge NULLE). Le
 * service ne connaît donc que deux JETONS ; c'est ICI, et seulement ici, que
 * les classes sont importées et connectées — un `*.module.ts` est hors du
 * périmètre de la garde par construction (§3.2 : « les `*.module.ts` sont la
 * composition »). Ce n'est pas un contournement : la règle protégée est
 * « aucun SERVICE ne va chercher le service d'un voisin », et après ce
 * changement aucun ne le fait. Contourner aurait été de déplacer l'appel dans
 * un contrôleur pour n'être pas compté, en gardant le même couplage.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([PartnerRelationEntity]),
    WorkspaceModule,
    EsnDirectoryModule,
    EsnProfileReaderModule,
    // #2151.32 — même raison que les deux modules ci-dessus : le module de
    // composition importe la classe, le service ne connaît que le JETON.
    MarketMemoryModule,
  ],
  controllers: [PartnerPipelineController],
  providers: [
    PartnerPipelineService,
    {
      provide: ESN_DIRECTORY_BY_DEPARTMENT,
      inject: [EsnDirectoryService],
      useFactory:
        (directory: EsnDirectoryService): EsnDirectoryByDepartment =>
        (department, limit) =>
          directory.byDepartment(department, limit),
    },
    {
      provide: ESN_PROFILE_ANSWERS_READER,
      inject: [EsnProfileReader],
      useFactory:
        (profile: EsnProfileReader): EsnProfileAnswersReader =>
        userId =>
          profile.getAnswers(userId),
    },
    {
      provide: MARKET_ESN_OBSERVATION_READER,
      inject: [MarketMemoryService],
      // #2151.32 — même repli BEST-EFFORT que `PartnersService.observedEsn`
      // (module `partners`, même famille de lecture) : toute impasse (lecture
      // en échec, compte non couvert) rend `'unknown'`, jamais une liste vide
      // qui se lirait comme « regardé, rien trouvé ».
      useFactory:
        (marketMemory: MarketMemoryService): MarketEsnObservationReader =>
        async lookup => {
          const read = await marketMemory.coverageFor(lookup)
          if (read.status !== 'ok' || !read.coverage.covered) return { status: 'unknown' }
          return {
            status: 'ok',
            observedEsnKeys: new Set(read.coverage.esnObserved.map(entry => marketMatchKey(entry.esnName))),
          }
        },
    },
  ],
  exports: [PartnerPipelineService],
})
export class PartnerPipelineModule {}
