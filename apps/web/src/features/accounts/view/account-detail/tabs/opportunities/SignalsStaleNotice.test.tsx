import { fireEvent, render, screen } from '@testing-library/react'
import { SignalsStaleNotice } from './SignalsStaleNotice'

/**
 * #4047.1 (retour bêta 12/10) — « il faut le bouton actualiser directement dans ce bloc
 * d'information à droite ». L'avis « collecte antérieure » des signaux porte l'action
 * d'actualisation EXISTANTE (`useRefreshDimension('signals')`), coût annoncé sur le bouton.
 */
const mutate = vi.hoisted(() => vi.fn())
const pending = vi.hoisted(() => ({ value: false }))
vi.mock('@/features/accounts/hooks/useRefreshDimension', () => ({
  useRefreshDimension: () => ({ mutate, isPending: pending.value }),
}))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, o?: { count?: number }) => (o?.count !== undefined ? `${key}:${o.count}` : key),
  }),
}))
const noticeProps = vi.hoisted(() => ({
  last: null as null | { action?: { label: string; onClick: () => void; pending?: boolean } },
}))
vi.mock('../../components/SegmentStaleCollectionNotice', () => ({
  SegmentStaleCollectionNotice: (props: { action?: { label: string; onClick: () => void; pending?: boolean } }) => {
    noticeProps.last = props
    return props.action ? (
      <button type="button" disabled={props.action.pending} onClick={props.action.onClick}>
        {props.action.label}
      </button>
    ) : null
  },
}))

describe('SignalsStaleNotice — #4047.1', () => {
  it('rend le bouton Actualiser avec son coût, et son clic relance les SIGNAUX (action existante)', () => {
    render(<SignalsStaleNotice accountId="acc-1" collectedAt="2020-01-01T00:00:00.000Z" />)
    fireEvent.click(screen.getByRole('button', { name: 'accountOpportunity.refreshSignals' }))
    expect(mutate).toHaveBeenCalledWith('signals')
  })

  it('désactive le bouton pendant l’appel', () => {
    pending.value = true
    render(<SignalsStaleNotice accountId="acc-1" collectedAt={null} />)
    expect(noticeProps.last?.action?.pending).toBe(true)
  })
})
