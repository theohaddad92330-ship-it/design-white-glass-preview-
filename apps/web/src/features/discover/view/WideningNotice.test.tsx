import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { WideningBanner, WideningNotice, WidenedChip } from './WideningNotice'

/**
 * #4433 (épopée, Louis 21/10) — sous le seuil de résultats exacts (25 depuis #4673, 10 avant) : la liste s'élargit d'elle-même, et l'écran le
 * DIT au-dessus de la liste avec un geste « revenir au strict ». Sans élargissement, rien n'est dit (NON).
 */
describe('WideningNotice', () => {
  const widening = {
    minResults: 25,
    exactCount: 0,
    steps: [
      { axis: 'skill' as const, tier: 1 as const, codes: ['javascript', 'typescript'], added: 3 },
      { axis: 'size' as const, tier: 1 as const, codes: ['GC'], added: 1 },
    ],
  }

  it('sans élargissement ni geste strict, ne rend RIEN', () => {
    const { container } = render(<WideningNotice widening={null} strict={false} onStrictChange={() => {}} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('dit l’élargissement, ce qui a été ouvert, et propose de revenir au strict', async () => {
    const onStrictChange = vi.fn()
    render(<WideningNotice widening={widening} strict={false} onStrictChange={onStrictChange} />)
    expect(screen.getByText(/Moins de 25 résultats exacts/)).toBeInTheDocument()
    expect(screen.getByText(/JavaScript, TypeScript/)).toBeInTheDocument()
    expect(screen.getByText(/GC/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Revenir au strict/ }))
    expect(onStrictChange).toHaveBeenCalledWith(true)
  })

  it('#4433.3 — UN seuil : le titre dit 25 même quand la page demandée est plus longue (minResults 40)', () => {
    render(
      <WideningNotice
        widening={{ ...widening, minResults: 40, exactCount: 3 }}
        strict={false}
        onStrictChange={() => {}}
      />,
    )
    expect(screen.getByText(/Moins de 25 résultats exacts/)).toBeInTheDocument()
    expect(screen.queryByText(/Moins de 40/)).not.toBeInTheDocument()
  })

  it('#4433.3 — le seuil atteint (page suivante) : le titre ne dit pas « moins de »', () => {
    render(
      <WideningNotice
        widening={{ ...widening, minResults: 40, exactCount: 28 }}
        strict={false}
        onStrictChange={() => {}}
      />,
    )
    expect(screen.queryByText(/Moins de/)).not.toBeInTheDocument()
    expect(screen.getByText(/exacts d’abord/)).toBeInTheDocument()
  })

  it('en strict, le dit et permet de rouvrir les paliers', async () => {
    const onStrictChange = vi.fn()
    render(<WideningNotice widening={null} strict onStrictChange={onStrictChange} />)
    await userEvent.click(screen.getByRole('button', { name: /Élargir aux voisins/ }))
    expect(onStrictChange).toHaveBeenCalledWith(false)
  })
})

describe('WidenedChip', () => {
  it('étiquette un résultat élargi : « proche : JavaScript », « secteur voisin : défense », « taille voisine : GC »', () => {
    const { rerender } = render(<WidenedChip widenedBy={{ axis: 'skill', tier: 1, code: 'javascript' }} />)
    expect(screen.getByText('proche : JavaScript')).toBeInTheDocument()
    rerender(<WidenedChip widenedBy={{ axis: 'sector', tier: 1, code: 'defense' }} />)
    expect(screen.getByText('secteur voisin : défense')).toBeInTheDocument()
    rerender(<WidenedChip widenedBy={{ axis: 'size', tier: 1, code: 'GC' }} />)
    expect(screen.getByText('taille voisine : GC')).toBeInTheDocument()
  })

  it('une taille non publiée se dit, jamais « 0 »', () => {
    render(<WidenedChip widenedBy={{ axis: 'size', tier: 1, code: null }} />)
    expect(screen.getByText('taille non publiée')).toBeInTheDocument()
  })

  it('un résultat exact ne porte AUCUNE étiquette', () => {
    const { container } = render(<WidenedChip widenedBy={undefined} />)
    expect(container).toBeEmptyDOMElement()
  })
})

/** Intégration PR n°4 — zone (#4429) et critères (#4433) se disent dans UN seul bandeau « recherche élargie ». */
describe('WideningBanner', () => {
  const criteria = {
    minResults: 25,
    exactCount: 0,
    steps: [{ axis: 'skill' as const, tier: 1 as const, codes: ['javascript'], added: 2 }],
  }
  const zone = { place: 'Toulouse', tier: 'radius_50' as const, exactCount: 3, widenedCount: 9 }

  it('réunit la zone et les critères dans un seul role=status', () => {
    render(
      <WideningBanner
        criteria={criteria}
        strict={false}
        onStrictChange={() => {}}
        zone={zone}
        onZoneRevert={() => {}}
      />,
    )
    expect(screen.getAllByRole('status')).toHaveLength(1)
    expect(screen.getByText('Peu de comptes à Toulouse : recherche élargie à 50 km')).toBeInTheDocument()
    expect(screen.getByText(/Moins de 25 résultats exacts/)).toBeInTheDocument()
  })

  it('ne rend rien sans élargissement', () => {
    const { container } = render(
      <WideningBanner
        criteria={null}
        strict={false}
        onStrictChange={() => {}}
        zone={undefined}
        onZoneRevert={() => {}}
      />,
    )
    expect(container).toBeEmptyDOMElement()
  })
})
