import { MODULE_METADATA } from '@nestjs/common/constants'
import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { DealStageSlaEntity } from '../../database/entities/deal-stage-sla.entity'
import { DealStageSlaService } from '../crm-core/deal-stage-sla.service'
import { CopilotBridgeModule, dealStageSlaPortProvider } from './copilot-bridge.module'
import { DEAL_STAGE_SLA_PORT, type DealStageSlaPort } from './deal-stage-sla.port'

/**
 * GA-07 (Lot 16, corrigé à l'intégration du 10/09/2026) — LE CÂBLAGE DU PORT.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'AUCUN AUTRE TEST NE PEUT VOIR
 * ─────────────────────────────────────────────────────────────────────────────
 * `copilot-bridge.controller.spec.ts` construit `CopilotBridgeController` à la
 * main, avec un DOUBLE fourni directement par le test
 * (`{ provide: DEAL_STAGE_SLA_PORT, useValue: dealStageSla }` implicite) — il
 * ne peut donc jamais voir un jeton mal câblé côté MODULE : le graphe de
 * modules n'est vérifié qu'au BOOT (`module-graph-checked-only-at-boot`, GA-42).
 * Un jeton fourni dans le mauvais module, ou câblé par `useExisting` (qui ne
 * vérifie AUCUNE forme avec un `Symbol`), casserait Railway au démarrage sans
 * qu'un seul test ne rougisse.
 *
 * Ce fichier compile le VRAI provider (`dealStageSlaPortProvider`, exporté par
 * `copilot-bridge.module.ts` — pas une redéclaration), avec le VRAI
 * `DealStageSlaService` (seul son repository est un double), et vérifie DEUX
 * choses que rien d'autre ne vérifie :
 *  1. le jeton résout vers l'instance RÉELLEMENT injectée (pas une copie) ;
 *  2. ce provider est bien déclaré dans les `providers` du VRAI
 *     `CopilotBridgeModule` — pas oublié, pas dupliqué ailleurs.
 */
describe('CopilotBridgeModule — le port SLA du pipe (GA-07)', () => {
  it('le jeton DEAL_STAGE_SLA_PORT résout vers le VRAI DealStageSlaService, et se comporte comme lui', async () => {
    const slas = { find: jest.fn().mockResolvedValue([]) }
    const moduleRef = await Test.createTestingModule({
      providers: [
        dealStageSlaPortProvider,
        DealStageSlaService,
        { provide: getRepositoryToken(DealStageSlaEntity), useValue: slas },
      ],
    }).compile()

    const port = moduleRef.get<DealStageSlaPort>(DEAL_STAGE_SLA_PORT)
    const service = moduleRef.get(DealStageSlaService)
    // `useFactory` renvoie l'instance INJECTÉE elle-même — le port EST le
    // service, jamais une copie ni un adaptateur qui pourrait diverger.
    expect(port).toBe(service)

    // Et il se comporte comme le VRAI service : sans réglage en base, les
    // QUATRE défauts du produit sortent (7 / 14 / 7 / 21), et « won » n'a
    // jamais de durée cible — exactement ce que `laura-settings-catalog.ts`
    // suppose en filtrant sur `slaDays !== null`.
    const rows = await port.effectiveFor('ws-1')
    expect(rows).toEqual(
      expect.arrayContaining([
        { stage: 'qualified', slaDays: 7, isDefault: true },
        { stage: 'confirmed', slaDays: 14, isDefault: true },
        { stage: 'profiles_submitted', slaDays: 7, isDefault: true },
        { stage: 'negotiation', slaDays: 21, isDefault: true },
        { stage: 'won', slaDays: null, isDefault: true },
      ]),
    )
  })

  it('ce provider EXACT est déclaré dans les providers du VRAI CopilotBridgeModule', () => {
    const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, CopilotBridgeModule) as unknown[]
    expect(providers).toContain(dealStageSlaPortProvider)
  })

  it('sait dire NON — un provider du même NOM mais d’un objet DIFFÉRENT ne serait pas vu comme déclaré', () => {
    // Preuve que l'assertion ci-dessus vérifie bien l'objet réellement câblé,
    // pas seulement « un provider qui porte ce jeton existe quelque part » —
    // un jeton refourni dans un AUTRE module produirait un objet différent.
    const decoy = { provide: DEAL_STAGE_SLA_PORT, useFactory: () => null, inject: [] }
    const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, CopilotBridgeModule) as unknown[]
    expect(providers).not.toContain(decoy)
    expect(providers).toContain(dealStageSlaPortProvider)
  })
})
