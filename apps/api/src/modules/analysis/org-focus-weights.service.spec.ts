import { ORG_FOCUS_DEFAULT_WEIGHTS } from '@bellum/contracts'
import { OrgFocusWeightsService } from './org-focus-weights.service'

function makeService(stored?: Record<string, number> | null, opts?: { throws?: boolean }) {
  const repo = {
    findOne: jest.fn(async () => {
      if (opts?.throws) throw new Error('base indisponible')
      return stored === undefined ? null : { workspace_id: 'ws-1', weights: stored ?? {} }
    }),
    upsert: jest.fn(async () => undefined),
  }
  return { service: new OrgFocusWeightsService(repo as never), repo }
}

describe('OrgFocusWeightsService.view', () => {
  it('un espace qui n’a rien réglé obtient EXACTEMENT les valeurs en vigueur', async () => {
    const { service } = makeService()
    const view = await service.view('ws-1')
    expect(view.overrides).toEqual({})
    expect(view.effective).toEqual(ORG_FOCUS_DEFAULT_WEIGHTS)
  })

  it('rend les DÉFAUTS à côté de l’écart — sans eux, un champ vide se lirait « zéro »', async () => {
    const { service } = makeService({ itChallenges: 0 })
    const view = await service.view('ws-1')
    expect(view.defaults.itChallenges).toBe(6)
    expect(view.overrides).toEqual({ itChallenges: 0 })
    expect(view.effective.itChallenges).toBe(0)
    // Et les axes non réglés suivent toujours le défaut.
    expect(view.effective.angles).toBe(ORG_FOCUS_DEFAULT_WEIGHTS.angles)
  })
})

describe('OrgFocusWeightsService.overridesFor — le pipeline ne s’arrête jamais dessus', () => {
  it('sans espace, aucun réglage — jamais une erreur', async () => {
    const { service, repo } = makeService()
    expect(await service.overridesFor(null)).toEqual({})
    expect(repo.findOne).not.toHaveBeenCalled()
  })

  it('une lecture en échec retombe sur les valeurs en vigueur, pas sur une panne', async () => {
    const { service } = makeService(undefined, { throws: true })
    expect(await service.overridesFor('ws-1')).toEqual({})
  })
})

describe('OrgFocusWeightsService.save', () => {
  it('« jamais un prisme IT par défaut » : un espace peut retirer l’axe IT', async () => {
    const { service, repo } = makeService()
    await service.save('ws-1', { itChallenges: 0 })
    expect(repo.upsert).toHaveBeenCalledWith({ workspace_id: 'ws-1', weights: { itChallenges: 0 } }, ['workspace_id'])
  })

  it('un axe réglé à SA VALEUR PAR DÉFAUT n’est pas stocké — il continue de SUIVRE le défaut', async () => {
    const { service, repo } = makeService()
    await service.save('ws-1', { itChallenges: ORG_FOCUS_DEFAULT_WEIGHTS.itChallenges, pains: 10 })
    expect(repo.upsert).toHaveBeenCalledWith({ workspace_id: 'ws-1', weights: { pains: 10 } }, ['workspace_id'])
  })

  it('n’enregistre QUE des axes connus — un réglage inventé ne s’écrit pas', async () => {
    const { service, repo } = makeService()
    await service.save('ws-1', { axeInvente: 3 } as never)
    expect(repo.upsert).toHaveBeenCalledWith({ workspace_id: 'ws-1', weights: {} }, ['workspace_id'])
  })
})
