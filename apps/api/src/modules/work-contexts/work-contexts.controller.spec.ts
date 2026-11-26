import type { EsnAnswers } from '@bellum/contracts'
import type { EsnProfileService } from '../esn-profile/esn-profile.service'
import type { WorkContextsService } from './work-contexts.service'
import { WorkContextsController } from './work-contexts.controller'

const user = { userId: 'u-1' } as never

/**
 * #2455.6 — « diff affiché, jamais une écriture ». Ce contrôleur est le SEUL
 * endroit de ce module qui lit le profil principal (`EsnProfileService`,
 * `@Optional()`) — `WorkContextsService` reste étranger à `profiles`. La
 * suite prouve trois replis fermés (pas de signal, pas de module ESN, la
 * fonction pure dit non) plus le cas qui propose.
 */
describe('WorkContextsController.profileSuggestion (#2455.6)', () => {
  function build(opts: {
    signal: { sectors: string[]; activationCount: number } | null
    answers?: Partial<EsnAnswers>
    withEsnProfile?: boolean
  }) {
    const workContexts = { usageSignal: jest.fn().mockResolvedValue(opts.signal) }
    const esnProfile = {
      getAnswers: jest.fn().mockResolvedValue({ target_sectors: [], ...opts.answers } as EsnAnswers),
    }
    const controller = new WorkContextsController(
      workContexts as unknown as WorkContextsService,
      opts.withEsnProfile === false ? undefined : (esnProfile as unknown as EsnProfileService),
    )
    return { controller, workContexts, esnProfile }
  }

  it('rend `suggestion: null` sans le module ESN profile — jamais un appel au signal d’usage', async () => {
    const { controller, workContexts } = build({ signal: null, withEsnProfile: false })
    const result = await controller.profileSuggestion(user, 'wc-1')
    expect(result).toEqual({ suggestion: null })
    expect(workContexts.usageSignal).not.toHaveBeenCalled()
  })

  it('rend `suggestion: null` quand le contexte n’a pas de signal (non personnel / pas le sien)', async () => {
    const { controller, esnProfile } = build({ signal: null })
    const result = await controller.profileSuggestion(user, 'wc-1')
    expect(result).toEqual({ suggestion: null })
    expect(esnProfile.getAnswers).not.toHaveBeenCalled()
  })

  it('rend `suggestion: null` quand la fonction pure dit non (usage pas encore régulier)', async () => {
    const { controller } = build({ signal: { sectors: ['Aéronautique'], activationCount: 1 } })
    const result = await controller.profileSuggestion(user, 'wc-1')
    expect(result).toEqual({ suggestion: null })
  })

  it('propose le diff quand l’usage est régulier et diverge du profil actuel', async () => {
    const { controller } = build({
      signal: { sectors: ['Aéronautique', 'Défense'], activationCount: 3 },
      answers: { target_sectors: ['Banque'] },
    })
    const result = await controller.profileSuggestion(user, 'wc-1')
    expect(result).toEqual({
      suggestion: { field: 'target_sectors', current: ['Banque'], suggested: ['Aéronautique', 'Défense'] },
    })
  })
})
