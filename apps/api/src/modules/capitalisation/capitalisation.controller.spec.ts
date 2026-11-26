import type { TechnoPrevalenceTier } from '@bellum/contracts'
import { CapitalisationController } from './capitalisation.controller'
import type { AccountCapitalisation, CapitalisationService } from './capitalisation.service'
import type { MarketMemoryService } from '../market-memory/market-memory.service'
import type { WorkspaceContextService } from '../workspace/workspace-context.service'

/**
 * `GET capitalisation/accounts/:id` : le palier de prévalence des technologies
 * des preuves, composé DANS LE CONTRÔLEUR.
 *
 * Pourquoi ici et pas dans le service : GA-07 est au plafond, et le contrôleur
 * est la porte qu'elle nomme elle-même — `AccountsController.marketContext`
 * compose de la même façon. Aucune ligne de `CapitalisationService` ne bouge,
 * et le module reste autonome (règle #7) : sans mémoire marché montée, l'onglet
 * rend exactement ce qu'il rendait avant.
 */

const ACCOUNT_CAPITALISATION: AccountCapitalisation = {
  delivered: [],
  // #2124.34 — les retours déjà recueillis voyagent avec la capitalisation du
  // compte. Vide ici : cette suite porte sur la composition du contrôleur.
  collectedRex: [],
  proofs: [
    {
      id: '11111111-1111-4111-8111-111111111111',
      account_id: '22222222-2222-4222-8222-222222222222',
      mission_id: null,
      claim: 'Migration de 400 To en 6 mois',
      detail: null,
      strength: 'declared',
      scope: 'internal',
      sector: null,
      anonymised: false,
      created_at: '2026-09-01T00:00:00.000Z',
      technologies: ['Spark', 'Python'],
    },
    {
      id: '33333333-3333-4333-8333-333333333333',
      account_id: '22222222-2222-4222-8222-222222222222',
      mission_id: null,
      claim: 'Sans technologie déclarée',
      detail: null,
      strength: 'declared',
      scope: 'internal',
      sector: null,
      anonymised: false,
      created_at: '2026-09-01T00:00:00.000Z',
    },
  ],
  pendingRex: [],
  testimonials: [],
}

function build(options: {
  marketMemory?: Pick<MarketMemoryService, 'technoPrevalenceFor'>
  capitalisation?: AccountCapitalisation
}) {
  const forAccount = jest.fn().mockResolvedValue(options.capitalisation ?? ACCOUNT_CAPITALISATION)
  const controller = new CapitalisationController(
    { forAccount } as unknown as CapitalisationService,
    {
      resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'w1' }),
    } as unknown as WorkspaceContextService,
    options.marketMemory as MarketMemoryService | undefined,
  )
  return { controller, forAccount }
}

const USER = { userId: 'u1' } as never
const ACCOUNT_ID = '22222222-2222-4222-8222-222222222222'

describe('CapitalisationController.forAccount — la prévalence des technologies', () => {
  it('joint le palier de chaque technologie mesurée, une seule fois par libellé', async () => {
    const technoPrevalenceFor = jest.fn().mockResolvedValue({
      status: 'ok',
      tiers: new Map<string, TechnoPrevalenceTier>([
        ['Spark', 'rare'],
        ['Python', 'courante'],
      ]),
    })
    const { controller } = build({ marketMemory: { technoPrevalenceFor } })

    const read = await controller.forAccount(USER, ACCOUNT_ID)

    expect(technoPrevalenceFor).toHaveBeenCalledWith(['Spark', 'Python'])
    expect(read.techno_prevalence).toEqual([
      { techno: 'Spark', tier: 'rare' },
      { techno: 'Python', tier: 'courante' },
    ])
  })

  it('ne demande RIEN quand aucune preuve ne déclare de technologie', async () => {
    const technoPrevalenceFor = jest.fn()
    const { controller } = build({
      marketMemory: { technoPrevalenceFor },
      capitalisation: { ...ACCOUNT_CAPITALISATION, proofs: [ACCOUNT_CAPITALISATION.proofs[1]] },
    })

    const read = await controller.forAccount(USER, ACCOUNT_ID)

    expect(technoPrevalenceFor).not.toHaveBeenCalled()
    expect(read.techno_prevalence).toBeUndefined()
  })

  it('une technologie SANS palier n’apparaît pas — « inconnu » n’est pas « courante »', async () => {
    const technoPrevalenceFor = jest.fn().mockResolvedValue({
      status: 'ok',
      tiers: new Map<string, TechnoPrevalenceTier>([['Spark', 'rare']]),
    })
    const { controller } = build({ marketMemory: { technoPrevalenceFor } })

    const read = await controller.forAccount(USER, ACCOUNT_ID)

    expect(read.techno_prevalence).toEqual([{ techno: 'Spark', tier: 'rare' }])
  })

  it('une mémoire marché INDISPONIBLE ne casse pas l’onglet — le champ est simplement absent', async () => {
    const technoPrevalenceFor = jest.fn().mockResolvedValue({ status: 'unavailable', reason: 'read_failed' })
    const { controller } = build({ marketMemory: { technoPrevalenceFor } })

    const read = await controller.forAccount(USER, ACCOUNT_ID)

    expect(read.techno_prevalence).toBeUndefined()
    expect(read.proofs).toHaveLength(2)
  })

  it('sans mémoire marché montée, l’onglet rend ce qu’il rendait avant', async () => {
    const { controller } = build({})

    const read = await controller.forAccount(USER, ACCOUNT_ID)

    expect(read.techno_prevalence).toBeUndefined()
    expect(read.proofs).toHaveLength(2)
  })
})

// #2424.12 — les query params de `GET proofs/usable` atteignent le filtre
// unique de `usableProofs`, sans en dupliquer la logique ici.
describe('CapitalisationController.usableProofs — les facettes en query params (#2424.12)', () => {
  function buildUsable() {
    const usableProofs = jest.fn().mockResolvedValue([])
    const controller = new CapitalisationController(
      { usableProofs } as unknown as CapitalisationService,
      {
        resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'w1' }),
      } as unknown as WorkspaceContextService,
      undefined,
    )
    return { controller, usableProofs }
  }

  it('transmet le secteur, l’expertise et les technologies, nettoyés de la virgule', async () => {
    const { controller, usableProofs } = buildUsable()

    await controller.usableProofs(USER, undefined, 'banque', 'cloud, data', 'Java,Python')

    expect(usableProofs).toHaveBeenCalledWith('w1', null, {
      sector: 'banque',
      expertise: ['cloud', 'data'],
      technologies: ['Java', 'Python'],
    })
  })

  it('sans aucune facette, ne transmet rien de deviné', async () => {
    const { controller, usableProofs } = buildUsable()

    await controller.usableProofs(USER)

    expect(usableProofs).toHaveBeenCalledWith('w1', null, {
      sector: undefined,
      expertise: undefined,
      technologies: undefined,
    })
  })
})
