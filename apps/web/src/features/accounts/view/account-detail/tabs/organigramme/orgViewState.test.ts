import { describe, expect, it } from 'vitest'
import { DEFAULT_ORG_VIEW_STATE, orgStateFromSearch, orgStateToSearch } from './orgViewState'

/**
 * #4061.b — le retour depuis une fiche conserve vue, branche dépliée, filtres et sélection : l'état
 * vit dans l'URL (search params), jamais dans un état local que le démontage de l'onglet efface.
 */
describe('#4061.b — l’état de l’organigramme voyage dans l’URL', () => {
  it('aller-retour : ce qui s’écrit se relit à l’identique', () => {
    const state = {
      mode: 'system' as const,
      directionId: 'e2',
      collapsed: ['e1', 'unassigned'],
      filters: { ...DEFAULT_ORG_VIEW_STATE.filters, level: 'L2', name: 'Claire & co', display: 'list' as const },
      selectedId: 'p-claire-morel',
    }
    expect(orgStateFromSearch(orgStateToSearch(state))).toEqual(state)
  })

  it('SAIT DIRE NON — l’état par défaut n’écrit AUCUNE clé (un lien nu reste nu)', () => {
    expect(orgStateToSearch(DEFAULT_ORG_VIEW_STATE)).toEqual({
      ov: undefined,
      od: undefined,
      oc: undefined,
      of: undefined,
      os: undefined,
    })
  })

  it('une valeur illisible retombe sur le défaut, jamais sur une vue devinée', () => {
    expect(orgStateFromSearch({ ov: 'nimporte', of: '%%%', oc: ',,' })).toEqual(DEFAULT_ORG_VIEW_STATE)
  })
})
