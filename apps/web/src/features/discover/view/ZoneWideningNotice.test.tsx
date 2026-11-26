import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ZoneWideningNotice } from './ZoneWideningNotice'

/**
 * #4429.4 — l'élargissement de zone s'ÉCRIT au-dessus de la liste (« Peu de comptes à Toulouse :
 * recherche élargie à 50 km »), avec les deux nombres et un geste « Revenir à Toulouse seule ».
 * Sans élargissement : rien (#3876 — aucun palier n'a été tenté, il n'y a rien à dire).
 */
describe('ZoneWideningNotice', () => {
  it('dit le palier, compte les comptes et propose de revenir à la ville seule', () => {
    const onRevert = vi.fn()
    render(
      <ZoneWideningNotice
        widening={{ place: 'Toulouse', tier: 'radius_50', exactCount: 3, widenedCount: 9 }}
        onRevert={onRevert}
      />,
    )
    expect(screen.getByText('Peu de comptes à Toulouse : recherche élargie à 50 km')).toBeInTheDocument()
    expect(screen.getByText(/3 comptes à Toulouse, 9 ajoutés par l’élargissement/)).toBeInTheDocument()
    const revert = screen.getByRole('button', { name: 'Revenir à Toulouse seule' })
    expect(revert.className).toMatch(/min-h-11/)
    fireEvent.click(revert)
    expect(onRevert).toHaveBeenCalledWith('Toulouse')
  })

  // #4627 — « étiquetés sur chaque ligne » est une promesse : tenue seulement si CHAQUE ligne élargie a son étiquette.
  it('ne prétend pas « étiquetés sur chaque ligne » quand une ligne élargie n’a aucune étiquette', () => {
    const widening = { place: 'Toulouse', tier: 'radius_50', exactCount: 3, widenedCount: 9 } as const
    const { rerender } = render(<ZoneWideningNotice widening={widening} onRevert={vi.fn()} />)
    expect(screen.getByText(/étiquetés sur chaque ligne/)).toBeInTheDocument()
    rerender(<ZoneWideningNotice widening={widening} allLabelled={false} onRevert={vi.fn()} />)
    expect(screen.queryByText(/étiquetés sur chaque ligne/)).not.toBeInTheDocument()
    expect(screen.getByText(/3 comptes à Toulouse, 9 ajoutés par l’élargissement\./)).toBeInTheDocument()
  })

  // #4627.9 → lot S (01/11) — Albi en 25 km, élargi au département : le bouton nomme le barreau RÉEL d'avant (50 km),
  // jamais le rayon de départ (« Revenir à 25 km » laissait l'échelle rejouer 50 km) — Louis 02/11 : plus de barreau 100 km ; le clic repose le rayon.
  it('lot S — le bouton de retour nomme le barreau d’avant, pas le rayon de départ, et repose le rayon au clic', () => {
    const onStepBack = vi.fn()
    render(
      <ZoneWideningNotice
        widening={{ place: 'Albi', tier: 'department', exactCount: 2, widenedCount: 5 }}
        onRevert={vi.fn()}
        onStepBack={onStepBack}
        radiusKm={25}
      />,
    )
    expect(screen.queryByRole('button', { name: 'Revenir à 25 km' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Revenir à 50 km' }))
    expect(onStepBack).toHaveBeenCalledWith('Albi', 'radius_50', 25)
  })

  // Lot S — le premier barreau (50 km) revient à « Toulouse seule » : c'est le geste que la recette 01/11 attendait.
  it('lot S — élargi à 50 km : le geste dit « Revenir à Toulouse seule », pas « Revenir à 25 km »', () => {
    const onRevert = vi.fn()
    const onStepBack = vi.fn()
    render(
      <ZoneWideningNotice
        widening={{ place: 'Toulouse', tier: 'radius_50', steps: ['radius_50'], exactCount: 3, widenedCount: 5 }}
        onRevert={onRevert}
        onStepBack={onStepBack}
        radiusKm={25}
      />,
    )
    expect(screen.getByText('Peu de comptes à Toulouse : recherche élargie à 50 km')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Revenir à 25 km' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Revenir à Toulouse seule' }))
    expect(onRevert).toHaveBeenCalledWith('Toulouse')
    expect(onStepBack).not.toHaveBeenCalled()
  })

  it('ne dit rien quand rien n’a été élargi', () => {
    const { container } = render(<ZoneWideningNotice widening={undefined} onRevert={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })

  // #4429.4 (recette 25/10) — après « Revenir à Albi seule », plus rien ne disait que la zone est stricte.
  it('dit « Albi seule » tant que la zone est stricte, et propose le geste inverse', () => {
    const onWiden = vi.fn()
    render(<ZoneWideningNotice widening={undefined} onRevert={vi.fn()} strictPlace="Albi" onWiden={onWiden} />)
    expect(screen.getByTestId('zone-strict-notice')).toHaveTextContent('Zone stricte : Albi seule')
    const widen = screen.getByRole('button', { name: 'Élargir à nouveau autour de Albi' })
    expect(widen.className).toMatch(/min-h-11/)
    fireEvent.click(widen)
    expect(onWiden).toHaveBeenCalledTimes(1)
  })

  it('un palier appliqué l’emporte : pas d’état strict affiché en même temps', () => {
    render(
      <ZoneWideningNotice
        widening={{ place: 'Albi', tier: 'radius_50', exactCount: 2, widenedCount: 3 }}
        onRevert={vi.fn()}
        strictPlace="Albi"
        onWiden={vi.fn()}
      />,
    )
    expect(screen.queryByTestId('zone-strict-notice')).toBeNull()
  })

  // c144 (Louis 27/10 au soir) : 50 km, puis département, région — chaque palier franchi est NOMMÉ ; l'automatique
  // s'arrête à la région. Sous le seuil à ce dernier barreau, UNE ligne le dit (aucun chiffre inventé).
  it('nomme chaque palier franchi et dit que la recherche s’arrête à la région quand elle reste sous le seuil', () => {
    render(
      <ZoneWideningNotice
        widening={{
          place: 'Lille',
          tier: 'region',
          steps: ['department', 'region'],
          exactCount: 0,
          widenedCount: 3,
          autoCapReached: true,
        }}
        onRevert={vi.fn()}
      />,
    )
    expect(screen.getByTestId('zone-steps')).toHaveTextContent('Paliers franchis : le département → la grande région')
    expect(screen.getByTestId('zone-stops-at-region')).toHaveTextContent(
      "La recherche s'arrête à la région : pas d'élargissement à toute la France.",
    )
    expect(screen.getByRole('button', { name: 'Revenir au département' })).toBeInTheDocument()
  })

  it('dit NON : la ligne « s’arrête à la région » ne se devine pas du palier — `tier` région sans `autoCapReached` ne la porte pas', () => {
    const { rerender } = render(
      <ZoneWideningNotice
        widening={{ place: 'Lille', tier: 'region', exactCount: 2, widenedCount: 40 }}
        onRevert={vi.fn()}
      />,
    )
    expect(screen.queryByTestId('zone-stops-at-region')).toBeNull()
    rerender(
      <ZoneWideningNotice
        widening={{ place: 'Lille', tier: 'region', exactCount: 0, widenedCount: 3 }}
        onRevert={vi.fn()}
      />,
    )
    expect(screen.queryByTestId('zone-stops-at-region')).toBeNull()
  })

  // 2710N — la région tentée n'ajoute rien : `tier` reste le département (ce qui a été TROUVÉ), la ligne d'arrêt sort.
  it('dit l’arrêt quand la région n’a rien ajouté (tier département + autoCapReached)', () => {
    render(
      <ZoneWideningNotice
        widening={{
          place: 'Lille',
          tier: 'department',
          steps: ['department'],
          area: 'Nord',
          exactCount: 3,
          widenedCount: 2,
          autoCapReached: true,
        }}
        onRevert={vi.fn()}
      />,
    )
    expect(screen.getByTestId('zone-stops-at-region')).toBeInTheDocument()
    expect(screen.getByText(/recherche élargie au département \(Nord\)/)).toBeInTheDocument()
  })

  it('aucun barreau n’ajoute rien : « cherché jusqu’à… sans compte de plus », et la ligne d’arrêt', () => {
    render(
      <ZoneWideningNotice
        widening={{
          place: 'Lille',
          tier: 'region',
          steps: ['department', 'region'],
          area: 'Hauts-de-France',
          exactCount: 3,
          widenedCount: 0,
          autoCapReached: true,
        }}
        onRevert={vi.fn()}
      />,
    )
    expect(
      screen.getByText("Peu de comptes à Lille : cherché jusqu'à Hauts-de-France, sans compte de plus."),
    ).toBeInTheDocument()
    expect(screen.getByTestId('zone-stops-at-region')).toBeInTheDocument()
  })

  it('un seul barreau franchi : la phrase suffit, pas de ligne en plus', () => {
    render(
      <ZoneWideningNotice
        widening={{ place: 'Lille', tier: 'radius_50', steps: ['radius_50'], exactCount: 2, widenedCount: 9 }}
        onRevert={vi.fn()}
      />,
    )
    expect(screen.queryByTestId('zone-steps')).toBeNull()
  })

  it('depuis le département, le geste revient à 100 km — pas à la ville seule (#4627.1)', () => {
    const onRevert = vi.fn()
    const onStepBack = vi.fn()
    render(
      <ZoneWideningNotice
        widening={{ place: 'Lille', tier: 'department', area: 'Nord', exactCount: 1, widenedCount: 12 }}
        onRevert={onRevert}
        onStepBack={onStepBack}
      />,
    )
    expect(screen.queryByRole('button', { name: 'Revenir à Lille seule' })).toBeNull()
    const back = screen.getByRole('button', { name: 'Revenir à 50 km' })
    expect(back.className).toMatch(/min-h-11/)
    fireEvent.click(back)
    expect(onStepBack).toHaveBeenCalledWith('Lille', 'radius_50')
    expect(onRevert).not.toHaveBeenCalled()
  })

  // #4429.4 (RE-RECETTE PROD 26/10) — « Revenir à 50 km » vidait la liste ET effaçait le bandeau : plus rien ne nommait
  // le rayon posé, ni ne permettait d'en sortir. L'état se dit tant qu'il dure, avec le geste inverse.
  it('nomme le rayon réellement posé par « Revenir à 50 km », avec le geste pour élargir à nouveau', () => {
    const onWiden = vi.fn()
    render(
      <ZoneWideningNotice
        widening={undefined}
        onRevert={vi.fn()}
        ceilingStep={{ place: 'Albi', ceiling: 'radius_50' }}
        onWiden={onWiden}
      />,
    )
    expect(screen.getByTestId('zone-ceiling-notice')).toHaveTextContent('Zone limitée : 50 km autour de Albi')
    fireEvent.click(screen.getByRole('button', { name: 'Élargir à nouveau autour de Albi' }))
    expect(onWiden).toHaveBeenCalledTimes(1)
  })

  it('nomme aussi le département ou la région quand c’est le barreau posé', () => {
    const { rerender } = render(
      <ZoneWideningNotice
        widening={undefined}
        onRevert={vi.fn()}
        ceilingStep={{ place: 'Albi', ceiling: 'department' }}
      />,
    )
    expect(screen.getByTestId('zone-ceiling-notice')).toHaveTextContent('Zone limitée : le département autour de Albi')
    rerender(
      <ZoneWideningNotice widening={undefined} onRevert={vi.fn()} ceilingStep={{ place: 'Albi', ceiling: 'region' }} />,
    )
    expect(screen.getByTestId('zone-ceiling-notice')).toHaveTextContent(
      'Zone limitée : la grande région autour de Albi',
    )
  })

  it('un palier appliqué l’emporte sur le plafond posé : une seule phrase de zone', () => {
    render(
      <ZoneWideningNotice
        widening={{ place: 'Albi', tier: 'department', area: 'Tarn', exactCount: 2, widenedCount: 3 }}
        onRevert={vi.fn()}
        ceilingStep={{ place: 'Albi', ceiling: 'department' }}
      />,
    )
    expect(screen.queryByTestId('zone-ceiling-notice')).toBeNull()
  })
})
