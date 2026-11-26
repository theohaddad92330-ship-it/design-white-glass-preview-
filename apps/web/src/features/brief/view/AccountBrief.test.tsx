import { fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Account, Contact } from '@bellum/contracts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { useAccount } from '@/features/accounts/hooks/useAccount'
import { AccountBrief } from './AccountBrief'

// #2125.29-.33, #2125.7 — la brief passe entièrement par `useAccount` et
// `apiFetch` : les deux sont mockés pour isoler le test du réseau, exactement
// comme `Search.test.tsx` le fait déjà pour le même hook.
const account = {
  id: 'a1',
  company_name: 'VINCI',
  sector: 'Construction',
  employees: '119 000 salariés',
  headquarters: '1 cours Ferdinand-de-Lesseps, 92500 Rueil-Malmaison',
  raw_analysis: {},
} as unknown as Account

vi.mock('@/features/accounts/hooks/useAccount', () => ({
  useAccount: vi.fn(() => ({ account, contacts: [] as Contact[], loading: false, error: null })),
}))

vi.mock('@/lib/api', () => ({
  apiFetch: vi.fn().mockResolvedValue({ entities: [] }),
}))

describe('AccountBrief', () => {
  const originalPrint = window.print

  beforeEach(() => {
    window.print = vi.fn()
  })

  afterEach(() => {
    window.print = originalPrint
  })

  it('affiche les questions du mode « premier rendez-vous » par défaut', async () => {
    renderWithRouter(<AccountBrief accountId="a1" />)
    await waitFor(() => expect(screen.getByText(/Travaillez-vous avec des prestataires externes/)).toBeInTheDocument())
    expect(screen.getByText('Premier rendez-vous')).toBeInTheDocument()
  })

  it('bascule les questions et les objections quand on choisit un autre mode', async () => {
    renderWithRouter(<AccountBrief accountId="a1" />)
    // Les modes sont de VRAIS onglets (refonte Théo) : rôle `tab`, un seul sélectionné.
    const partner = await screen.findByRole('tab', { name: 'Partenaire' })
    expect(screen.getByRole('tab', { name: 'Premier rendez-vous' })).toHaveAttribute('aria-selected', 'true')

    await userEvent.click(partner)
    expect(partner).toHaveAttribute('aria-selected', 'true')

    expect(screen.getByText(/Sur quels comptes voyez-vous le plus de recoupement/)).toBeInTheDocument()
    expect(screen.getByText(/On a déjà des partenaires sur ce créneau/)).toBeInTheDocument()
    // Le contenu du mode par défaut a bien disparu — sinon les deux modes
    // s'empileraient au lieu de se remplacer.
    expect(screen.queryByText(/Travaillez-vous avec des prestataires externes/)).not.toBeInTheDocument()
  })

  it('le bouton « Télécharger en PDF » déclenche l’impression du dossier visible', async () => {
    renderWithRouter(<AccountBrief accountId="a1" />)
    await waitFor(() => expect(screen.getByText('Télécharger en PDF')).toBeInTheDocument())

    fireEvent.click(screen.getByText('Télécharger en PDF'))

    expect(window.print).toHaveBeenCalledTimes(1)
  })

  // #3928.1 — recette prod 14/10, SNCF RESEAU : la synthèse (ce bloc) disait
  // « Aucun signal récent » alors que l'onglet Opportunités (`TabSignal`, qui
  // lit `buildAccountWatchData`) en comptait 7 et les listait. La synthèse
  // lisait `raw_analysis.recent_signals` directement — une seconde lecture du
  // même fait (GA-26) — et ratait les signaux posés sur `account.recent_signals`
  // (la colonne), que `buildAccountWatchData` fusionne déjà.
  it('lit les signaux posés sur `account.recent_signals`, pas seulement `raw_analysis` (même lecteur que les Opportunités)', async () => {
    const accountWithColumnSignal = {
      ...account,
      raw_analysis: {},
      recent_signals: [{ signal: 'Appel d’offres infrastructure ferroviaire', date: '2026-09-20' }],
    } as unknown as Account
    vi.mocked(useAccount).mockReturnValueOnce({
      account: accountWithColumnSignal,
      contacts: [] as Contact[],
      loading: false,
      error: null,
    } as ReturnType<typeof useAccount>)

    renderWithRouter(<AccountBrief accountId="a1" />)

    await waitFor(() => expect(screen.getByText(/Appel d’offres infrastructure ferroviaire/)).toBeInTheDocument())
    expect(
      screen.queryByText('Aucun signal récent trouvé dans les sources consultées sur ce compte.'),
    ).not.toBeInTheDocument()
  })

  describe('refonte Théo — la grammaire de la fiche compte', () => {
    it('deux colonnes : ce qu’on dira à gauche, ce qu’on doit savoir en entrant à droite', async () => {
      renderWithRouter(<AccountBrief accountId="a1" />)
      const main = await screen.findByTestId('brief-main')
      const aside = screen.getByTestId('brief-aside')
      expect(main).toHaveTextContent('5 questions à poser')
      expect(aside).not.toHaveTextContent('5 questions à poser')
      expect(aside).toHaveTextContent("Ce qu'il fait, lui")
      expect(aside).toHaveTextContent("Ce qu'on ne sait pas")
      expect(screen.getByRole('link', { name: /Revenir au dossier/ })).toHaveAttribute('href', '/accounts/a1')
    })

    it('le décideur porte le badge « Décideur » — et seulement lui', async () => {
      vi.mocked(useAccount).mockReturnValueOnce({
        account,
        contacts: [
          { id: 'c1', full_name: 'Claire Lefort', title: 'DSI', decision_role: 'economic' },
        ] as unknown as Contact[],
        loading: false,
        error: null,
      } as ReturnType<typeof useAccount>)
      renderWithRouter(<AccountBrief accountId="a1" />)
      const aside = await screen.findByTestId('brief-aside')
      expect(aside).toHaveTextContent('Claire Lefort')
      expect(aside).toHaveTextContent('Décideur')
    })

    it('NON : un contact sans rôle de décision établi n’a pas de badge', async () => {
      vi.mocked(useAccount).mockReturnValueOnce({
        account,
        contacts: [
          { id: 'c2', full_name: 'Paul Brun', title: 'Chef de projet', decision_role: null },
        ] as unknown as Contact[],
        loading: false,
        error: null,
      } as ReturnType<typeof useAccount>)
      renderWithRouter(<AccountBrief accountId="a1" />)
      const aside = await screen.findByTestId('brief-aside')
      expect(aside).toHaveTextContent('Paul Brun')
      expect(aside).not.toHaveTextContent('Décideur')
    })
  })

  /**
   * #4543 — recette 25/10 : le bloc « Ce qu'on ne sait pas » affirmait « Rien n'a été noté comme inconnu »
   * pendant que la synthèse du même écran écrivait « les achats et la concurrence restent inconnus ».
   * Les inconnues du brief viennent d'UNE source (`raw_analysis.unknowns`) ; quand elle est vide, c'est
   * « non renseigné », jamais « rien à signaler » (GA-18 / GA-19). La garde dit NON à l'affirmation.
   */
  describe('#4543 — « Ce qu’on ne sait pas » n’affirme jamais « rien d’inconnu »', () => {
    const withAccount = (patch: Record<string, unknown>) =>
      vi.mocked(useAccount).mockReturnValueOnce({
        account: { ...account, ...patch } as unknown as Account,
        contacts: [] as Contact[],
        loading: false,
        error: null,
      } as ReturnType<typeof useAccount>)

    it('synthèse qui nomme des inconnues + source vide : le bloc n’écrit pas « rien »', async () => {
      withAccount({
        priority_justification: 'Les achats et la concurrence restent inconnus.',
        raw_analysis: {},
      })
      renderWithRouter(<AccountBrief accountId="a1" />)
      await waitFor(() => expect(screen.getByText(/restent inconnus/)).toBeInTheDocument())

      const block = screen.getByText("Ce qu'on ne sait pas").closest('section') ?? document.body
      expect(block.textContent).not.toMatch(/rien n.a été noté/i)
      expect(block.textContent).toMatch(/renseign/i)
    })

    it('synthèse qui nomme achats et concurrence + analyse qui n’a rien relevé : le bloc les NOMME (un seul lecteur)', async () => {
      withAccount({
        priority_justification: 'Les achats et la concurrence restent inconnus.',
        raw_analysis: { priority_score: 6, sources: [], competitors: [], purchasing_thread: { items: [] } },
      })
      renderWithRouter(<AccountBrief accountId="a1" />)
      await waitFor(() => expect(screen.getByText(/restent inconnus/)).toBeInTheDocument())

      const block = screen.getByText("Ce qu'on ne sait pas").closest('section') ?? document.body
      expect(block.textContent).toMatch(/concurrence/i)
      expect(block.textContent).toMatch(/achats/i)
      // #4543.5 — la catégorie vide dit « non renseignée » ; c'est la phrase de REPLI (« aucune inconnue ») qui est bannie.
      expect(block.textContent).toMatch(/concurrence en place : non renseignée/i)
      expect(block.textContent).not.toMatch(/aucune inconnue/i)
    })

    it('source renseignée : les inconnues sont listées, sans phrase de repli', async () => {
      withAccount({ raw_analysis: { unknowns: ['Les achats', 'La concurrence'] } })
      renderWithRouter(<AccountBrief accountId="a1" />)
      await waitFor(() => expect(screen.getByText('Les achats')).toBeInTheDocument())
      expect(screen.getByText('La concurrence')).toBeInTheDocument()
      expect(screen.queryByText(/renseign/i)).not.toBeInTheDocument()
    })
  })
})
