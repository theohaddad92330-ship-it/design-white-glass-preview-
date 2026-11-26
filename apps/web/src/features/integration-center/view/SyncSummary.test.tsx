import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SyncSummary } from './SyncSummary'

/**
 * Doctrine « on n'affiche pas ce qu'on n'a pas » : une liste vide se dit,
 * elle ne rend jamais un cadre muet ni une ligne à zéro.
 */
describe('SyncSummary — un résumé cross-domaine générique, en 5 blocs (#2110.47 à .53)', () => {
  it('rend la phrase FR de chaque ligne, telle que le contrat la porte, sous le titre de son bloc', () => {
    render(
      <SyncSummary
        lines={[
          { domain: 'accounts', count: 3, label: { fr: '3 comptes mis à jour', en: '3 accounts updated' } },
          {
            domain: 'ambiguities',
            count: 1,
            label: { fr: '1 fiche à confirmer avant de la rapprocher', en: '1 record to confirm before merging it' },
          },
        ]}
      />,
    )
    expect(screen.getByText("Ce que j'ai rapproché")).toBeInTheDocument()
    expect(screen.getByText(/3 comptes mis à jour/)).toBeInTheDocument()
    expect(screen.getByText("Ce que je n'ai pas compris")).toBeInTheDocument()
    expect(screen.getByText(/1 fiche à confirmer avant de la rapprocher/)).toBeInTheDocument()
  })

  it('ajoute un bloc « ce que je conseille » qui reprend le compte déjà écrit ailleurs, jamais un contenu inventé', () => {
    render(
      <SyncSummary
        lines={[
          {
            domain: 'meetings_to_prepare',
            count: 2,
            label: { fr: '2 rendez-vous à préparer', en: '2 meetings to prepare' },
          },
        ]}
      />,
    )
    expect(screen.getByText('Ce que je conseille')).toBeInTheDocument()
    expect(screen.getByText(/Préparer les 2 rendez-vous à venir/)).toBeInTheDocument()
  })

  it('ne construit jamais de ligne à zéro — une liste vide se dit, elle ne s’affiche pas muette', () => {
    render(<SyncSummary lines={[]} />)
    expect(screen.queryByText(/^0 /)).not.toBeInTheDocument()
    expect(screen.getByText('Rien de nouveau depuis la dernière fois.')).toBeInTheDocument()
  })
})
