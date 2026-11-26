import { fireEvent, screen } from '@testing-library/react'
import { afterEach, vi } from 'vitest'
import type { AnalysisRun } from '@bellum/contracts'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { AccountRunsContainer } from './AccountRunsContainer'

/**
 * #2318.5 — LAU-FINAL-059, VERSIONING : les neuf identifiants qu'une analyse
 * conserve doivent ARRIVER À L'ÉCRAN. `buildAnalysisVersioning` les
 * assemblait déjà côté API (`AnalysisRunsService.listForAccount`) — aucun
 * composant web ne les lisait avant ce lot (motif récurrent du dépôt : du
 * code juste, calculé, testé, que personne n'appelle).
 *
 * Fichier séparé de `AccountRunsContainer.test.tsx` : le mock de
 * `useAccountRuns` ci-dessous est hissé au niveau du module et remplacerait
 * sinon le comportement (vide / legacy) que l'autre suite exerce.
 */
vi.mock('@/features/accounts/hooks/useAccountRuns', () => ({
  useAccountRuns: () => ({
    data: [
      {
        id: 'run-1',
        account_id: 'a-3',
        status: 'completed',
        scope_mode: 'france',
        siren: null,
        cost_eur: null,
        created_at: '2026-09-18T08:00:00Z',
        completed_at: '2026-09-18T08:05:00Z',
        versioning: {
          analysis_version: null,
          profile_version: 'esn:3/context:7',
          account_context_version: null,
          dataforge_version: null,
          market_memory_version: null,
          prompt_version: { phase1: 'a' },
          scoring_version: null,
          date: '2026-09-18T08:00:00Z',
          scope: 'france',
        },
      } satisfies AnalysisRun,
    ],
    isLoading: false,
  }),
}))

afterEach(() => vi.useRealTimers())

describe('AccountRunsContainer — #2318.5 le versioning arrive à l’écran', () => {
  it('un détail repliable nomme les sept identifiants, sourcés ou « non mesuré »', async () => {
    renderWithRouter(<AccountRunsContainer accountId="a-3" />)
    const details = await screen.findByTestId('run-versioning-run-1')
    fireEvent.click(screen.getByText('Versioning de ce run'))
    expect(details).toHaveTextContent('esn:3/context:7')
    expect(details).toHaveTextContent('non mesuré')
    expect(details).toHaveTextContent('1 phase capturée')
  })

  // #2318.5 — recette prod 18/09 : « le tiroir affiche 7 libellés, pas les 9
  // attendus ». Les deux manquants (`date`, `scope`) ne sont PAS perdus : ils
  // sont déjà rendus dans l'entête de la ligne (`toAnalysisRunView`), pas
  // dupliqués dans le tiroir (GA-26 — une dérivation vit à un seul endroit).
  // Ce test rend cette réponse VÉRIFIABLE plutôt qu'affirmée en commentaire —
  // il tombe si l'entête cesse un jour de porter l'un des deux.
  it('date et scope — les deux identifiants restants — sont déjà dans l’entête de la ligne, jamais dupliqués dans le tiroir', async () => {
    // #2915.3 — date locale, année écrite seulement hors année en cours : on fige la SEULE horloge `Date`.
    vi.useFakeTimers({ now: new Date('2026-11-02T10:00:00Z'), toFake: ['Date'] })
    renderWithRouter(<AccountRunsContainer accountId="a-3" />)
    const details = await screen.findByTestId('run-versioning-run-1')

    expect(screen.getByText('18/09 à 10:00')).toBeInTheDocument()
    expect(screen.getByText('France')).toBeInTheDocument()

    // Le tiroir ne porte que les autres identifiants — jamais une deuxième date
    // ou un deuxième périmètre sous une autre forme. Sept ici : ce run n'a pas
    // lu la mémoire marché, et la ligne le DIT (« non consultée », #3235).
    expect(details.querySelectorAll('dt')).toHaveLength(7)
    // #3672 revient sur le libellé « Version mémoire marché » (#2318.5), délibérément ; ce qui tient :
    // l'historique non lu reste NOMMÉ (« non consultée »), jamais un blanc ni un « 0 ».
    expect(details).toHaveTextContent("Version de l'historique observé")
    expect(details).toHaveTextContent('non consultée par ce run')
  })
})
