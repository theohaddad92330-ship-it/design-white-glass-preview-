import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CandidateActions } from './CandidateActions'

/* #3819 (recette prod 07/10, 1512 px) — « Construire le dossier complet »
 * débordait de sa carte de 50 px sur 10 cartes sur 10 : le bouton refusait de
 * revenir à la ligne (`whitespace-nowrap`) dans un rang qui ne passait pas à la
 * ligne non plus. jsdom ne mesure pas une mise en page : ces tests tiennent les
 * CLASSES qui la décident. */

function renderActions(orientation: 'row' | 'column') {
  render(
    <CandidateActions
      isFollowed={false}
      onToggleFollow={vi.fn()}
      onDismiss={vi.fn()}
      onAnalyze={vi.fn()}
      orientation={orientation}
    />,
  )
  return screen.getByRole('button', { name: /actions\.analyze|Construire le dossier complet/ })
}

describe('CandidateActions — le bouton payant reste DANS sa carte', () => {
  it.each(['row', 'column'] as const)('orientation %s : largeur bornée, retour à la ligne, cible ≥ 44 px', o => {
    const button = renderActions(o)
    expect(button.className).toContain('max-w-full')
    expect(button.className).toContain('min-h-11')
    expect(button.className).not.toContain('whitespace-nowrap')
    // En rang, le bouton passe SOUS les gestes secondaires plutôt que de sortir.
    if (o === 'row') expect(button.parentElement?.className).toContain('flex-wrap')
  })
})
