import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { BulkArchiveReport } from './BulkArchiveReport'

/**
 * #4191 G5 — l'archivage en lot est PARTIEL : l'écran dit « N archivées » et NOMME
 * chaque refusée avec sa raison. Jamais un « tout s'est bien passé » sur une
 * fiche refusée, jamais une sélection entière rejetée pour une seule ligne.
 */
describe('BulkArchiveReport', () => {
  const dismiss = vi.fn()

  it('dit combien de fiches sont archivées ET nomme chaque refusée avec sa raison', () => {
    render(
      <BulkArchiveReport
        archivedCount={2}
        refused={[
          { name: 'Yanis Berthier', reason: 'on_mission', endsOn: '2027-03-31' },
          { name: 'Salomé Dufour', reason: 'on_mission', endsOn: null },
          { name: null, reason: 'not_found', endsOn: null },
        ]}
        onDismiss={dismiss}
      />,
    )
    expect(screen.getByText('2 profils archivés.')).not.toBeNull()
    expect(screen.getByText('3 profils non archivés :')).not.toBeNull()
    expect(screen.getByText(/Yanis Berthier — en mission jusqu’au 31\/03\/2027/)).not.toBeNull()
    expect(screen.getByText(/Salomé Dufour — en mission \(sans date de fin connue\)/)).not.toBeNull()
    expect(screen.getByText(/Fiche sans nom — introuvable dans ton espace/)).not.toBeNull()
  })

  it('aucune refusée : rien à nommer, juste le compte (pas de liste vide)', () => {
    render(<BulkArchiveReport archivedCount={1} refused={[]} onDismiss={dismiss} />)
    expect(screen.getByText('1 profil archivé.')).not.toBeNull()
    expect(screen.queryByRole('list')).toBeNull()
  })

  it('tout refusé : ne dit PAS « 0 profil archivé » comme un succès, il ne dit que les refus', () => {
    render(
      <BulkArchiveReport
        archivedCount={0}
        refused={[{ name: 'Yanis Berthier', reason: 'on_mission', endsOn: '2027-03-31' }]}
        onDismiss={dismiss}
      />,
    )
    expect(screen.queryByText(/0 profil/)).toBeNull()
    expect(screen.getByText('1 profil non archivé :')).not.toBeNull()
  })

  it('se ferme au clic', () => {
    render(<BulkArchiveReport archivedCount={1} refused={[]} onDismiss={dismiss} />)
    fireEvent.click(screen.getByRole('button', { name: 'Fermer' }))
    expect(dismiss).toHaveBeenCalledTimes(1)
  })
})
