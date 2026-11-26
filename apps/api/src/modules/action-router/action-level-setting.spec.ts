import { NotFoundException } from '@nestjs/common'
import { ACTION_LEVEL_PREFERENCE_KEY } from '@bellum/contracts'
import { readActionLevelSetting, writeActionLevelSetting } from './action-level-setting'

/**
 * #2896 / #2449.34 — le niveau d'action PERSISTÉ, dans le sac `user_preferences`.
 * Un faux sac en mémoire : on vérifie ce qui est ÉCRIT, pas seulement ce qui
 * est rendu.
 */
function build(initial: Record<string, unknown> = {}) {
  let bag: Record<string, unknown> = { ...initial }
  const memory = {
    getPreferences: jest.fn(async () => ({ ...bag })),
    patchPreferences: jest.fn(async (_userId: string, patch: Record<string, unknown>) => {
      bag = { ...bag, ...patch }
      return { ...bag }
    }),
    forgetLedgerEntry: jest.fn(async (args: { id: string }) => {
      if (!(args.id in bag)) throw new NotFoundException('Préférence introuvable')
      const { [args.id]: _removed, ...kept } = bag
      bag = kept
    }),
  }
  const caller = { userId: 'u-1', workspaceId: async () => 'ws-1' }
  return { memory, caller, bag: () => bag }
}

describe('niveau d’action persisté (#2449.34)', () => {
  it('rend null quand rien n’est réglé — le défaut de #2449, jamais un niveau deviné', async () => {
    const { memory } = build({ replyTone: 'formal' })
    await expect(readActionLevelSetting(memory, 'u-1')).resolves.toEqual({ level: null })
  })

  it('persiste le niveau choisi sous SA clé, sans toucher au reste du sac', async () => {
    const { memory, caller, bag } = build({ replyTone: 'formal' })
    await expect(writeActionLevelSetting(memory, caller, { level: 'prepare' })).resolves.toEqual({ level: 'prepare' })
    expect(bag()).toEqual({ replyTone: 'formal', [ACTION_LEVEL_PREFERENCE_KEY]: 'prepare' })
    await expect(readActionLevelSetting(memory, 'u-1')).resolves.toEqual({ level: 'prepare' })
  })

  it('revenir au défaut RETIRE la clé — jamais un `null` laissé dans le sac', async () => {
    const { memory, caller, bag } = build({ [ACTION_LEVEL_PREFERENCE_KEY]: 'respond_only', replyTone: 'formal' })
    await expect(writeActionLevelSetting(memory, caller, { level: null })).resolves.toEqual({ level: null })
    expect(bag()).toEqual({ replyTone: 'formal' })
  })

  it('revenir au défaut quand rien n’était réglé n’est pas une erreur', async () => {
    const { memory, caller } = build()
    await expect(writeActionLevelSetting(memory, caller, { level: null })).resolves.toEqual({ level: null })
  })

  it('une valeur écrite à la main (« automatiser ») n’est pas crue', async () => {
    const { memory } = build({ [ACTION_LEVEL_PREFERENCE_KEY]: 'automate' })
    await expect(readActionLevelSetting(memory, 'u-1')).resolves.toEqual({ level: null })
  })
})
