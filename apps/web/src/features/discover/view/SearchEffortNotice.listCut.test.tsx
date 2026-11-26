import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import '@/i18n'
import { normalizeListCut } from '../lib/discover-search-effort'
import { SearchEffortNotice } from './SearchEffortNotice'

// #4706.1 — « Siège dans la zone » rendait 24 comptes contre 17 pour « Implanté dans la zone » : la liste est coupée à la
// limite après tri et l'écran ne le disait pas. Même règle que #5009.1 : « N affichés sur au moins M trouvés ».
describe('#4706.1 — la coupe à la limite se dit', () => {
  it('normalizeListCut lit la coupe du moteur — et SAIT DIRE NON à tout le reste', () => {
    expect(normalizeListCut({ listCut: { shown: 24, found: 31, isLowerBound: true } })).toEqual({
      shown: 24,
      found: 31,
      isLowerBound: true,
    })
    expect(normalizeListCut({ listCut: { shown: 24, found: 24, isLowerBound: true } })).toBeUndefined() // rien de coupé
    expect(normalizeListCut({ listCut: { shown: 24, found: 12 } })).toBeUndefined() // incohérent : jamais M < N
    expect(normalizeListCut({ listCut: { shown: 0, found: 5 } })).toBeUndefined() // jamais « 0 affichés »
    expect(normalizeListCut({ listCut: { shown: 'vingt', found: 31 } })).toBeUndefined()
    expect(normalizeListCut({})).toBeUndefined()
    expect(normalizeListCut(undefined)).toBeUndefined()
  })

  it('dit « sur au moins M » quand le total est une borne basse', () => {
    render(<SearchEffortNotice effort={undefined} listCut={{ shown: 24, found: 31, isLowerBound: true }} />)
    expect(screen.getByTestId('list-cut')).toHaveTextContent('24 comptes affichés sur au moins 31 trouvés')
  })

  it('dit « sur M » sans « au moins » quand le total est exact', () => {
    render(<SearchEffortNotice effort={undefined} listCut={{ shown: 24, found: 31, isLowerBound: false }} />)
    const line = screen.getByTestId('list-cut')
    expect(line).toHaveTextContent('24 comptes affichés sur 31 trouvés')
    expect(line).not.toHaveTextContent('au moins')
  })

  it('sans coupe, aucune ligne', () => {
    render(<SearchEffortNotice effort={undefined} />)
    expect(screen.queryByTestId('list-cut')).toBeNull()
  })
})
