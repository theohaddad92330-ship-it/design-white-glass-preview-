import { describe, expect, it } from 'vitest'
import { talentEmptyStateAction } from './talentEmptyState'

/**
 * L'état vide du vivier, qui NOMME le filtre bloquant.
 *
 * Même mécanisme que `emptyListAction` côté comptes
 * (`apps/web/src/features/accounts/lib/emptyListAction.ts`) : un vivier vide
 * parce qu'AUCUN filtre n'est posé n'appelle pas le même geste qu'un vivier
 * vide parce qu'UN filtre précis ne rend rien — et dès que DEUX filtres sont
 * posés à la fois, on ne sait plus lequel nommer isolément.
 */
describe('talentEmptyStateAction', () => {
  it('aucun filtre posé : « démarre ton vivier »', () => {
    expect(talentEmptyStateAction([])).toEqual({ kind: 'start' })
  })

  it('EXACTEMENT un filtre posé : il est NOMMÉ, au lieu de l’état vide générique', () => {
    const axis = { id: 'zone', value: 'Lyon' }
    expect(talentEmptyStateAction([axis])).toEqual({ kind: 'namedFilter', axis })
  })

  it('plusieurs filtres posés : on ne sait plus lequel nommer seul', () => {
    expect(
      talentEmptyStateAction([
        { id: 'zone', value: 'Lyon' },
        { id: 'maxTjm', value: '400' },
      ]),
    ).toEqual({ kind: 'filters' })
  })
})
