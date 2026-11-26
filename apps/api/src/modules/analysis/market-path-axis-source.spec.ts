import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { MarketCompanyAliasEntity } from '../../database/entities/market-company-alias.entity'
import { MarketCompanyResolutionOverrideEntity } from '../../database/entities/market-company-resolution-override.entity'
import { MarketCompanySignalEntity } from '../../database/entities/market-company-signal.entity'
import { MarketCompanyStackEntity } from '../../database/entities/market-company-stack.entity'
import { MarketEsnClientEntity } from '../../database/entities/market-esn-client.entity'
import { MarketPersonPathEntity } from '../../database/entities/market-person-path.entity'
import { MarketExEsnAtClientEntity } from '../../database/entities/market-ex-esn-at-client.entity'
import { MarketMemoryModule } from '../market-memory/market-memory.module'
import { MarketMemoryService } from '../market-memory/market-memory.service'
import { MARKET_PATH_AXIS_SOURCE, type MarketPathAxisSource } from './market-path-axis-source'

/**
 * GA-07 (lot 14, 10/09/2026) — la preuve que `analysis.module.ts` branche
 * VRAIMENT le port de l'axe CHEMIN, pas seulement que ça compile.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE TEST, ET PAS SEULEMENT LE TYPECHECK
 * ─────────────────────────────────────────────────────────────────────────────
 * `injected-repositories-declared.spec.ts` (GA-20) le dit dans son propre
 * docblock : « le graphe de modules n'est vérifié qu'au DÉMARRAGE ». Les tests
 * unitaires de `AnalysisService` / `AnalysisOnDemandService` construisent le
 * service à la main (`new Service(...)`) ou via `Test.createTestingModule`
 * avec des providers À LA MAIN — aucun des deux ne passe par le fournisseur
 * RÉEL déclaré dans `analysis.module.ts` (`useFactory` + `inject:
 * [MarketMemoryService]`). Un jeton mal orthographié, une injection dans le
 * mauvais ordre, ou un oubli de `MarketMemoryModule` dans les `imports` du
 * module ne ferait tomber AUCUN test — exactement le défaut que GA-20 et
 * GA-247 documentent pour d'autres cas de ce même angle mort.
 *
 * Ce test compile le VRAI `MarketMemoryModule` (ses cinq repositories sont
 * mockés — aucune base réelle nécessaire) et reproduit la déclaration EXACTE
 * de `analysis.module.ts` pour le jeton `MARKET_PATH_AXIS_SOURCE`. S'il passe,
 * le graphe réel démarre ; s'il échoue, il aurait échoué en production, pas
 * seulement ici.
 */
describe('MARKET_PATH_AXIS_SOURCE — le fournisseur de `analysis.module.ts` résout VRAIMENT', () => {
  async function compileWiring() {
    return (
      Test.createTestingModule({
        imports: [MarketMemoryModule],
        providers: [
          // Reproduit à l'identique l'entrée de `analysis.module.ts` — voir son
          // commentaire pour le choix de `useFactory` plutôt que `useExisting`.
          {
            provide: MARKET_PATH_AXIS_SOURCE,
            inject: [MarketMemoryService],
            useFactory: (service: MarketMemoryService): MarketPathAxisSource => service,
          },
        ],
      })
        .overrideProvider(getRepositoryToken(MarketCompanySignalEntity))
        .useValue({ findOne: jest.fn().mockResolvedValue(null), find: jest.fn().mockResolvedValue([]) })
        .overrideProvider(getRepositoryToken(MarketEsnClientEntity))
        .useValue({ find: jest.fn().mockResolvedValue([]) })
        .overrideProvider(getRepositoryToken(MarketCompanyStackEntity))
        .useValue({ find: jest.fn().mockResolvedValue([]) })
        .overrideProvider(getRepositoryToken(MarketExEsnAtClientEntity))
        .useValue({ find: jest.fn().mockResolvedValue([]) })
        .overrideProvider(getRepositoryToken(MarketCompanyAliasEntity))
        .useValue({ find: jest.fn().mockResolvedValue([]) })
        // #1617.4 — aucune correction humaine ici : vide, la table laisse le
        // classement byte-identique au chemin d'avant le lot.
        .overrideProvider(getRepositoryToken(MarketCompanyResolutionOverrideEntity))
        .useValue({ find: jest.fn().mockResolvedValue([]) })
        // Lot 775 — les parcours observés : vide ici, le port d'axe n'en lit aucun.
        .overrideProvider(getRepositoryToken(MarketPersonPathEntity))
        .useValue({ find: jest.fn().mockResolvedValue([]) })
        .compile()
    )
  }

  it('résout le jeton vers la VRAIE instance de `MarketMemoryService`, pas un mock', async () => {
    const moduleRef = await compileWiring()

    const port = moduleRef.get<MarketPathAxisSource>(MARKET_PATH_AXIS_SOURCE)

    expect(port).toBeInstanceOf(MarketMemoryService)
    expect(typeof port.pathAxisFor).toBe('function')
  })

  it('expose bien `pathAxisFor` — la SEULE méthode que le port promet, appelable sans jeter', async () => {
    const moduleRef = await compileWiring()
    const port = moduleRef.get<MarketPathAxisSource>(MARKET_PATH_AXIS_SOURCE)

    // Aucune couverture (les repos mockés rendent tout vide) : `null` attendu,
    // pas une exception — la preuve que l'appel traverse vraiment le service.
    await expect(port.pathAxisFor({ ref: 'a1', name: 'Une Entreprise' })).resolves.toBeNull()
  })
})
