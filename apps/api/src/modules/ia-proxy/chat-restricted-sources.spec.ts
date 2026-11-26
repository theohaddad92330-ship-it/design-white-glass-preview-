import type { ConnectedTool } from '@bellum/contracts'
import { markRestrictedSources, restrictedToolFamilies } from './chat-restricted-sources'

/**
 * #3775.2b — une source dont la nature (`kind`) tombe dans une famille où
 * l'appelant n'a qu'une connexion PERSONNELLE (`owner: 'user'`) porte
 * `restricted: true` ; le reste du contexte voyage inchangé.
 */
function tool(family: string, owner: 'workspace' | 'user'): ConnectedTool {
  return { provider: `fixture-${family}-${owner}`, family, owner } as unknown as ConnectedTool
}

describe('restrictedToolFamilies — les familles où l’appelant n’a qu’une connexion personnelle', () => {
  it('retient une famille connue avec une connexion `user`', () => {
    expect(restrictedToolFamilies([tool('email', 'user')])).toEqual(new Set(['email']))
  })

  it('écarte une famille d’espace — un CRM d’espace n’est pas restreint', () => {
    expect(restrictedToolFamilies([tool('crm', 'workspace')])).toEqual(new Set())
  })

  it('un connecteur personnel ET un connecteur d’espace, même famille : la famille reste retenue', () => {
    // Deux boîtes mail connectées par deux membres distincts restent chacune personnelle
    // (BEL-INT-604) — aucune des deux n'efface le risque posé par l'autre.
    expect(restrictedToolFamilies([tool('email', 'user'), tool('email', 'user')])).toEqual(new Set(['email']))
  })

  it('n’attrape pas ce qu’elle ne vise pas : une famille inconnue du registre web ne sort jamais', () => {
    expect(restrictedToolFamilies([tool('un-outil-inconnu', 'user')])).toEqual(new Set())
  })

  it('aucun outil : aucune famille restreinte', () => {
    expect(restrictedToolFamilies([])).toEqual(new Set())
  })
})

describe('markRestrictedSources — marque la source, jamais le reste du contexte', () => {
  const restrictedEmail = new Set(['email'] as const)

  it('pose `restricted: true` sur une source de la famille restreinte', () => {
    const context = { sources: [{ kind: 'email', label: 'Gmail', as_of: null }], not_consulted: [] }
    expect(markRestrictedSources(context, restrictedEmail)).toEqual({
      sources: [{ kind: 'email', label: 'Gmail', as_of: null, restricted: true }],
      not_consulted: [],
    })
  })

  it('laisse une source d’une autre famille sans la clé — jamais `restricted: false`', () => {
    const context = { sources: [{ kind: 'crm', label: 'HubSpot', as_of: null }] }
    const marked = markRestrictedSources(context, restrictedEmail) as { sources: Array<Record<string, unknown>> }
    expect(marked.sources[0]).not.toHaveProperty('restricted')
  })

  it('aucune famille restreinte : le contexte ressort identique (même référence)', () => {
    const context = { sources: [{ kind: 'email', label: 'Gmail' }] }
    expect(markRestrictedSources(context, new Set())).toBe(context)
  })

  it('un contexte sans `sources` (forme inconnue) ressort inchangé — rien n’est deviné', () => {
    expect(markRestrictedSources({ foo: 'bar' }, restrictedEmail)).toEqual({ foo: 'bar' })
    expect(markRestrictedSources(undefined, restrictedEmail)).toBeUndefined()
    expect(markRestrictedSources(null, restrictedEmail)).toBeNull()
    expect(markRestrictedSources('texte', restrictedEmail)).toBe('texte')
  })

  it('sait dire NON : une entrée de `sources` qui n’est pas un objet n’est jamais touchée', () => {
    const context = { sources: ['pas-un-objet', 42, null] }
    expect(markRestrictedSources(context, restrictedEmail)).toEqual(context)
  })
})
