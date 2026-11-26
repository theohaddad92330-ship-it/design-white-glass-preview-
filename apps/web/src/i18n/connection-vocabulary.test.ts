import { describe, expect, it } from 'vitest'
import { resources } from '@/i18n/resources'

/**
 * #4689 — LE VOCABULAIRE D'UNE CONNEXION. Décision tranchée : le produit dit « branché » (la doctrine nomme ce que
 * l'espace a BRANCHÉ). « Non connecté » est l'intrus : le même état se disait de deux façons sur le même écran.
 * Et un réglage vit à UN seul endroit (GA-26) : les trois états ne sont définis qu'une fois, dans
 * `integrationCenter.grid.status`, lue par la carte ET par le panneau.
 */
type Tree = Record<string, unknown>
const get = (tree: unknown, path: string): unknown =>
  path.split('.').reduce<unknown>((node, key) => (node as Tree | undefined)?.[key], tree)

const stateStrings = (lng: 'fr' | 'en'): [string, unknown][] => [
  ['integrationCenter.states.not_connected', get(resources[lng].integrationCenter, 'states.not_connected')],
  [
    'integrationCenter.capabilityStates.not_connected',
    get(resources[lng].integrationCenter, 'capabilityStates.not_connected'),
  ],
  ['integrationCenter.grid.status.available', get(resources[lng].integrationCenter, 'grid.status.available')],
  ['settings.beeper state.disconnected', get(resources[lng].settings, 'integrations.beeper.state.disconnected')],
]

describe('#4689 — « non branché » se dit d’une seule façon', () => {
  it('FR : aucun libellé d’état ne dit « Non connecté » dans le centre d’intégrations', () => {
    for (const [key, value] of stateStrings('fr')) {
      expect(value, key).toEqual(expect.stringMatching(/^Non branché/))
    }
  })

  it('EN : le même état se dit « Not connected » partout', () => {
    for (const [key, value] of stateStrings('en')) {
      expect(value, key).toEqual(expect.stringMatching(/^Not connected/))
    }
  })

  it('elle sait dire NON : elle lit de vraies chaînes (un chemin faux ne passe pas)', () => {
    for (const [, value] of [...stateStrings('fr'), ...stateStrings('en')]) expect(typeof value).toBe('string')
  })

  it('les trois états ne sont définis QU’UNE fois : le panneau n’a plus les siens (GA-26)', () => {
    for (const lng of ['fr', 'en'] as const) {
      const state = get(resources[lng].integrations, 'ats.state') as Tree
      expect(Object.keys(state).sort(), lng).toEqual(['environment', 'legacy'])
    }
  })
})

describe('#4689 — la phrase sur les écritures dit « second responsable »', () => {
  it.each([
    ['fr', /second responsable/, /validation d['’]un responsable/],
    ['en', /second manager/, /a manager approves/],
  ] as const)('(%s) writeNotice = la porte réelle : un AUTRE responsable', (lng, right, wrong) => {
    const notice = get(resources[lng].integrations, 'ats.writeNotice') as string
    expect(notice).toMatch(right)
    expect(notice).not.toMatch(wrong)
  })

  it.each(['fr', 'en'] as const)('(%s) les phrases d’écriture du centre disent la même chose', lng => {
    const ic = resources[lng].integrationCenter as Tree
    const sentences = ['create_mission', 'update_tjm', 'update_need_status', 'log_call'].map(
      k => JSON.stringify(ic).match(new RegExp(`"${k}":"([^"]*)"`))?.[1],
    )
    for (const s of sentences) expect(s, lng).toMatch(lng === 'fr' ? /second responsable/ : /second manager/)
  })
})
