import { screen } from '@testing-library/react'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { AccountRunsContainer } from './AccountRunsContainer'

/**
 * recette 10/09 — « Historique des analyses » disait « Aucune analyse
 * enregistrée pour ce compte. » sur un compte marqué Terminé, analysé le 13
 * juillet 2026 — vrai UNIQUEMENT à propos du journal des RUNS (une table
 * introduite après cette analyse), faux hors contexte : une phrase qui se lit
 * « ce compte n'a jamais été analysé » sur un dossier qui l'a été.
 *
 * `useAccountRuns` est désactivé sans session (`renderWithRouter` fournit
 * `user: null`) : la liste reste vide sans réseau, ce qui suffit à exercer le
 * texte vide sans mock supplémentaire.
 */
describe('AccountRunsContainer — recette 10/09, un compte Terminé n’a jamais « aucune analyse »', () => {
  it('un compte JAMAIS analysé garde le message actuel', async () => {
    renderWithRouter(<AccountRunsContainer accountId="a-1" hasCompletedAnalysis={false} />)

    expect(await screen.findByText('Aucune analyse enregistrée pour ce compte.')).toBeInTheDocument()
  })

  it('un compte legacy DÉJÀ analysé (avant le suivi des runs) ne dit plus « aucune analyse »', async () => {
    renderWithRouter(<AccountRunsContainer accountId="a-2" hasCompletedAnalysis={true} />)

    expect(await screen.findByText(/avant le suivi détaillé des runs/)).toBeInTheDocument()
    expect(screen.queryByText('Aucune analyse enregistrée pour ce compte.')).not.toBeInTheDocument()
  })

  it('#3277 — ne redit pas « Historique des analyses » : l’en-tête d’accordéon le porte déjà', async () => {
    renderWithRouter(<AccountRunsContainer accountId="a-3" hasCompletedAnalysis={false} />)
    await screen.findByText('Aucune analyse enregistrée pour ce compte.')
    expect(screen.queryByText('Historique des analyses')).not.toBeInTheDocument()
  })
})
