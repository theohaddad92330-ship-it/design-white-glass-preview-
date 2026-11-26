import { Test } from '@nestjs/testing'
import { ConfigModule } from '@nestjs/config'
import { getRepositoryToken } from '@nestjs/typeorm'
import { AccountIntelligenceModule } from './account-intelligence.module'
import { AccountIntelligenceContextService } from './account-intelligence-context.service'
import { DATAFORGE_ACCOUNT_STATUS_READER, FIELD_CONFLICTS_READER, MARKET_MEMORY_COVERAGE_READER } from './module-tokens'
import { AccountEntity } from '../../database/entities/account.entity'
import { FieldProvenanceEntity } from '../../database/entities/field-provenance.entity'
import { RecordFieldAuditEntity } from '../../database/entities/record-field-audit.entity'
import { DataforgeAccountEntity } from '../../database/entities/dataforge-account.entity'
import { DataforgeAccountDomainEntity } from '../../database/entities/dataforge-account-domain.entity'
import { DataforgeAccountStatusEntity } from '../../database/entities/dataforge-account-status.entity'
import { DataforgeAnomalyEntity } from '../../database/entities/dataforge-anomaly.entity'
import { DataforgeRagChunkEntity } from '../../database/entities/dataforge-rag-chunk.entity'
import { MarketCompanyAliasEntity } from '../../database/entities/market-company-alias.entity'
import { MarketCompanyResolutionOverrideEntity } from '../../database/entities/market-company-resolution-override.entity'
import { MarketCompanySignalEntity } from '../../database/entities/market-company-signal.entity'
import { MarketCompanyStackEntity } from '../../database/entities/market-company-stack.entity'
import { MarketEsnClientEntity } from '../../database/entities/market-esn-client.entity'
import { MarketPersonPathEntity } from '../../database/entities/market-person-path.entity'
import { MarketExEsnAtClientEntity } from '../../database/entities/market-ex-esn-at-client.entity'
import { CorrelationIdModule } from '../../correlation-id/correlation-id.module'
import { CorrelationIdService } from '../../correlation-id/correlation-id.service'
import { IaModule } from '../ia/ia.module'
import { IaClient } from '../ia/ia.client'
import { createMockRepository } from '../../database/test-utils'

const correlationOverride = {
  getCorrelationId: () => 'cid',
  runWithContext: async (_: unknown, fn: () => Promise<unknown>) => fn(),
}

/**
 * #1618 — le graphe RÉEL de la façade, pas seulement ses unités.
 *
 * Règle #7 (« un module NestJS est indépendant ») + GA-42 (« vérifié qu'au
 * boot ») : un jeton mal câblé (`inject` qui pointe vers la mauvaise classe,
 * un provider oublié) ne se voit JAMAIS dans un test unitaire qui construit le
 * service à la main — seul `Test.createTestingModule` le fait échouer, et
 * seulement s'il compile VRAIMENT le module, pas un double.
 */
describe('AccountIntelligenceModule', () => {
  it('compile, et les trois jetons rendent des fonctions branchées sur les VRAIS services', async () => {
    const module = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), CorrelationIdModule, IaModule, AccountIntelligenceModule],
    })
      .overrideProvider(getRepositoryToken(AccountEntity))
      .useValue(createMockRepository())
      .overrideProvider(getRepositoryToken(FieldProvenanceEntity))
      .useValue(createMockRepository())
      .overrideProvider(getRepositoryToken(RecordFieldAuditEntity))
      .useValue(createMockRepository())
      .overrideProvider(getRepositoryToken(DataforgeAccountEntity))
      .useValue(createMockRepository())
      .overrideProvider(getRepositoryToken(DataforgeAccountDomainEntity))
      .useValue(createMockRepository())
      .overrideProvider(getRepositoryToken(DataforgeAccountStatusEntity))
      .useValue(createMockRepository())
      .overrideProvider(getRepositoryToken(DataforgeAnomalyEntity))
      .useValue(createMockRepository())
      .overrideProvider(getRepositoryToken(DataforgeRagChunkEntity))
      .useValue(createMockRepository())
      .overrideProvider(getRepositoryToken(MarketCompanySignalEntity))
      .useValue(createMockRepository())
      .overrideProvider(getRepositoryToken(MarketEsnClientEntity))
      .useValue(createMockRepository())
      .overrideProvider(getRepositoryToken(MarketCompanyStackEntity))
      .useValue(createMockRepository())
      .overrideProvider(getRepositoryToken(MarketExEsnAtClientEntity))
      .useValue(createMockRepository())
      .overrideProvider(getRepositoryToken(MarketCompanyAliasEntity))
      .useValue(createMockRepository())
      // #1617.4 — aucune correction humaine ici : vide, la table laisse le
      // classement byte-identique au chemin d'avant le lot.
      .overrideProvider(getRepositoryToken(MarketCompanyResolutionOverrideEntity))
      .useValue(createMockRepository())
      // Lot 775 : parcours observés sur le marché, lus par le lecteur de lignes.
      .overrideProvider(getRepositoryToken(MarketPersonPathEntity))
      .useValue(createMockRepository())
      .overrideProvider(IaClient)
      .useValue({})
      .overrideProvider(CorrelationIdService)
      .useValue(correlationOverride)
      .compile()

    expect(module.get(AccountIntelligenceContextService)).toBeInstanceOf(AccountIntelligenceContextService)

    // Les jetons rendent des FONCTIONS (pas `undefined`, pas la classe elle-même) :
    // preuve que `useFactory`/`inject` sont branchés, pas seulement déclarés.
    expect(typeof module.get(DATAFORGE_ACCOUNT_STATUS_READER)).toBe('function')
    expect(typeof module.get(MARKET_MEMORY_COVERAGE_READER)).toBe('function')
    expect(typeof module.get(FIELD_CONFLICTS_READER)).toBe('function')

    await module.close()
  })
})
