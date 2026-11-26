import type { EsnAnswers, MarketEsnViewRead } from '@bellum/contracts'
import type { CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import type { IaClient } from '../ia/ia.client'
import type { MarketMemoryService } from '../market-memory/market-memory.service'
import type { ProfileContextService } from '../profile-context/profile-context.service'
import type { EsnProfileCorrectionRequestService } from './esn-profile-correction-request.service'
import { EsnProfileController } from './esn-profile.controller'
import type { EsnProfileService } from './esn-profile.service'
import type { OfferPortfolioService } from './offer-portfolio.service'

/**
 * `GET /esn-profile/market-memory` (#1636) — « ton entreprise dans la mémoire
 * marché ».
 *
 * Ce que ce fichier tient, et que rien d'autre ne peut tenir :
 * · le front n'envoie AUCUN nom d'entreprise. Le serveur résout le profil, comme
 *   partout ailleurs (« le front envoie uniquement l'intention utilisateur ») ;
 * · un profil sans nom ne dit PAS « pas assez d'observations » : on n'a rien
 *   cherché, et l'interrupteur éteint ne s'annonce pas comme une panne ;
 * · aucune lecture de la mémoire n'est faite quand il n'y a rien à chercher.
 */

const user = { userId: 'u-1', email: 'commercial@esn.test' } as CurrentUserPayload

function answers(esnName: string | null): EsnAnswers {
  return { esn_name: esnName } as unknown as EsnAnswers
}

function build(view: MarketEsnViewRead = { status: 'insufficient' }) {
  const esnProfile = { getAnswers: jest.fn().mockResolvedValue(answers('ALTEN')) } as unknown as jest.Mocked<
    Pick<EsnProfileService, 'getAnswers'>
  >
  const marketMemory = { esnViewFor: jest.fn().mockResolvedValue(view) } as unknown as jest.Mocked<
    Pick<MarketMemoryService, 'esnViewFor'>
  >

  return {
    esnProfile,
    marketMemory,
    controller: new EsnProfileController(
      esnProfile as unknown as EsnProfileService,
      {} as unknown as OfferPortfolioService,
      {} as unknown as ProfileContextService,
      {} as unknown as IaClient,
      marketMemory as unknown as MarketMemoryService,
      // #2018.7 — 6e paramètre, en dernier ; aucun cas de ce fichier ne l'appelle.
      {} as unknown as EsnProfileCorrectionRequestService,
    ),
  }
}

describe('EsnProfileController — GET /esn-profile/market-memory', () => {
  it('résout le nom de l’entreprise CÔTÉ SERVEUR — le front n’en envoie aucun', async () => {
    const built = build({
      status: 'ok',
      view: {
        matchedCompanyName: 'ALTEN',
        matchedOn: 'name',
        pathsObserved: 14,
        roleFamilies: ['Développement'],
        destinations: ['ORANGE'],
      },
    })

    const read = await built.controller.getMarketMemory(user)

    expect(built.esnProfile.getAnswers).toHaveBeenCalledWith('u-1')
    expect(built.marketMemory.esnViewFor).toHaveBeenCalledWith({ ref: 'workspace-esn', name: 'ALTEN' })
    expect(read.status).toBe('ok')
  })

  it('sans nom renseigné : « rien n’a été cherché », jamais « pas assez d’observations »', async () => {
    // #1636 — l'interrupteur éteint ne s'annonce pas comme une absence de couverture.
    const built = build()
    built.esnProfile.getAnswers.mockResolvedValue(answers(null))

    const read = await built.controller.getMarketMemory(user)

    expect(read).toEqual({ status: 'undeclared' })
    expect(built.marketMemory.esnViewFor).not.toHaveBeenCalled()
  })

  it('un nom fait d’espaces ne cherche rien non plus', async () => {
    const built = build()
    built.esnProfile.getAnswers.mockResolvedValue(answers('   '))

    const read = await built.controller.getMarketMemory(user)

    expect(read).toEqual({ status: 'undeclared' })
    expect(built.marketMemory.esnViewFor).not.toHaveBeenCalled()
  })

  it('relaie une panne telle quelle — jamais convertie en « pas couverte »', async () => {
    const built = build({ status: 'unavailable', reason: 'read_failed' })

    const read = await built.controller.getMarketMemory(user)

    expect(read).toEqual({ status: 'unavailable', reason: 'read_failed' })
  })

  it('ne passe AUCUN pays : deux homonymes restent ambigus, ce qui est la bonne réponse', async () => {
    const built = build()

    await built.controller.getMarketMemory(user)

    const [lookup] = built.marketMemory.esnViewFor.mock.calls[0] as unknown as [Record<string, unknown>]
    expect(lookup).not.toHaveProperty('country')
    expect(lookup).not.toHaveProperty('website')
  })
})
