import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactElement, ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { useEnrichContacts } from '@/features/accounts/hooks/useEnrichAccount'
import { ResearchExpansionCallout } from './ResearchExpansionCallout'

// #2297 — `EnrichConfirmDialog` lit `useIsDemo` (session) : espace réel par défaut.
vi.mock('@/features/demo/useIsDemo', () => ({ useIsDemo: vi.fn(() => false) }))

vi.mock('framer-motion', () => ({
  motion: { div: ({ children }: { children?: ReactNode }) => <div>{children}</div> },
}))

type EnrichMutation = ReturnType<typeof useEnrichContacts>

function mutation(mutate = vi.fn(), data?: EnrichMutation['data']): EnrichMutation {
  return { mutate, isPending: false, data } as unknown as EnrichMutation
}

/**
 * #2120.57 / #2297.23 — `EnrichConfirmDialog` (monté ici sous « Lancer une
 * recherche de contacts ? ») lit désormais `useEnrichmentDurationEstimate`,
 * un `useQuery`. Sans `QueryClientProvider`, React Query lève à l'ouverture
 * du dialogue plutôt que de rendre « non mesurée ».
 */
function renderWithQueryClient(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

/**
 * #2120.52-57 — « Élargir la recherche » (P0-03) déclenchait `enrichBatchMutation.mutate`
 * sur un simple clic, sans jamais dire que la recherche allait partir. Gratuite
 * (Phase 2, aucun crédit débité), mais pas instantanée — elle mérite la même
 * confirmation que les deux autres points d'entrée du même hook.
 */
describe('ResearchExpansionCallout — la recherche élargie s’annonce avant de partir', () => {
  it('arme la confirmation au clic, et ne lance la recherche qu’après confirmation', async () => {
    const mutate = vi.fn()
    renderWithQueryClient(
      <ResearchExpansionCallout
        companyName="TF1"
        contactsCount={4}
        entities={['Direction Technique']}
        enrichBatchMutation={mutation(mutate)}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: /agrandir|chercher cet angle/i }))
    expect(mutate).not.toHaveBeenCalled()

    expect(await screen.findByText('Lancer une recherche de contacts ?')).toBeInTheDocument()
    expect(document.body).not.toHaveTextContent(/cr[ée]dit/i)

    await userEvent.click(screen.getByRole('button', { name: /lancer la recherche/i }))
    expect(mutate).toHaveBeenCalledTimes(1)
  })

  it('transmet l’angle choisi (entité) au confirmer, pas au clic', async () => {
    const mutate = vi.fn()
    renderWithQueryClient(
      <ResearchExpansionCallout
        companyName="TF1"
        contactsCount={4}
        entities={['Direction Technique']}
        enrichBatchMutation={mutation(mutate)}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Direction Technique' }))
    await userEvent.click(screen.getByRole('button', { name: /agrandir|chercher cet angle/i }))
    expect(mutate).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: /lancer la recherche/i }))
    expect(mutate).toHaveBeenCalledWith({ entity: 'Direction Technique' })
  })

  // #2552.2 — François (call bêta 17/09, #2552) : « élargir par direction, par
  // site, par niveau ». « Par direction » existait déjà (chips d'entité) ; le
  // contrat (`ContactScope.level`) et l'API le portaient déjà, sans qu'AUCUN
  // écran ne l'expose — le geste « par niveau » manquait, pas la donnée.
  it('#2552.2 — élargir PAR NIVEAU transmet `scope.level` au confirmer', async () => {
    const mutate = vi.fn()
    renderWithQueryClient(
      <ResearchExpansionCallout
        companyName="TF1"
        contactsCount={4}
        entities={[]}
        enrichBatchMutation={mutation(mutate)}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Management' }))
    await userEvent.click(screen.getByRole('button', { name: /agrandir|chercher cet angle/i }))
    await userEvent.click(screen.getByRole('button', { name: /lancer la recherche/i }))
    expect(mutate).toHaveBeenCalledWith({ level: 'L3' })
  })

  it('#2552.2 — direction ET niveau se combinent dans le même angle', async () => {
    const mutate = vi.fn()
    renderWithQueryClient(
      <ResearchExpansionCallout
        companyName="TF1"
        contactsCount={4}
        entities={['Direction Technique']}
        enrichBatchMutation={mutation(mutate)}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Direction Technique' }))
    await userEvent.click(screen.getByRole('button', { name: 'Management' }))
    await userEvent.click(screen.getByRole('button', { name: /agrandir|chercher cet angle/i }))
    await userEvent.click(screen.getByRole('button', { name: /lancer la recherche/i }))
    expect(mutate).toHaveBeenCalledWith({ entity: 'Direction Technique', level: 'L3' })
  })

  // #2309.30 — « élargissement ciblé : périmètre géographique ». Le contrat
  // (`ContactScope.geographies`) et l'API le portaient déjà (Apollo
  // `person_locations`, `phase2_contacts.py:672`) ; seul CE geste manquait à
  // l'écran — même famille de défaut que le reste du dépôt : du code juste,
  // calculé, testé, que personne n'appelait.
  it('#2309.30 — élargir PAR PÉRIMÈTRE GÉOGRAPHIQUE transmet `scope.geographies` au confirmer', async () => {
    const mutate = vi.fn()
    renderWithQueryClient(
      <ResearchExpansionCallout
        companyName="TF1"
        contactsCount={4}
        entities={[]}
        enrichBatchMutation={mutation(mutate)}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: 'France' }))
    await userEvent.click(screen.getByRole('button', { name: /agrandir|chercher cet angle/i }))
    await userEvent.click(screen.getByRole('button', { name: /lancer la recherche/i }))
    expect(mutate).toHaveBeenCalledWith({ geographies: ['France'] })
  })

  it('#2309.30 — géographie, niveau et entité se combinent dans le même angle', async () => {
    const mutate = vi.fn()
    renderWithQueryClient(
      <ResearchExpansionCallout
        companyName="TF1"
        contactsCount={4}
        entities={['Direction Technique']}
        enrichBatchMutation={mutation(mutate)}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Direction Technique' }))
    await userEvent.click(screen.getByRole('button', { name: 'Management' }))
    await userEvent.click(screen.getByRole('button', { name: 'Europe' }))
    await userEvent.click(screen.getByRole('button', { name: /agrandir|chercher cet angle/i }))
    await userEvent.click(screen.getByRole('button', { name: /lancer la recherche/i }))
    expect(mutate).toHaveBeenCalledWith({ entity: 'Direction Technique', level: 'L3', geographies: ['Europe'] })
  })
})

/**
 * #2532.2 bis — retour BOUYGUES CONSTRUCTION (19/09/2026) : « Coordinateur de
 * chantier » faisait bouger le compteur global de contacts sans rien dire du
 * thème. Le RÉSULTAT de la recherche par thème doit se dire à l'endroit du
 * geste, jamais un compteur global qui bouge en silence.
 */
describe('ResearchExpansionCallout — le résultat d’une recherche par thème se dit', () => {
  it('dit combien de personnes ont été trouvées pour ce thème, avec leurs noms', () => {
    renderWithQueryClient(
      <ResearchExpansionCallout
        companyName="TF1"
        contactsCount={4}
        entities={[]}
        enrichBatchMutation={mutation(vi.fn(), {
          count: 1,
          themeSearch: {
            theme: 'Coordinateur de chantier',
            titles: ['Chef de Chantier', 'Conducteur de Travaux'],
            matchedCount: 1,
            matchedNames: ['Léo Petit'],
            outOfThemeCount: 2,
            presetMatched: true,
          },
        })}
      />,
    )

    expect(screen.getByTestId('theme-search-result')).toHaveTextContent(
      '1 personne trouvée pour « Coordinateur de chantier »',
    )
    expect(screen.getByTestId('theme-search-result')).toHaveTextContent('Léo Petit')
    expect(screen.getByTestId('theme-search-result')).toHaveTextContent('+ 2 autres personnes du groupe, hors thème')
  })

  it('dit qu’aucune personne n’a été trouvée, avec les synonymes essayés — jamais « 0 »', () => {
    renderWithQueryClient(
      <ResearchExpansionCallout
        companyName="TF1"
        contactsCount={4}
        entities={[]}
        enrichBatchMutation={mutation(vi.fn(), {
          count: 0,
          themeSearch: {
            theme: 'Coordinateur de chantier',
            titles: ['Coordinateur de chantier', 'Coordinatrice de chantier'],
            matchedCount: 0,
            matchedNames: [],
            outOfThemeCount: 0,
            presetMatched: false,
          },
        })}
      />,
    )

    const result = screen.getByTestId('theme-search-result')
    expect(result).toHaveTextContent('Aucune personne trouvée pour « Coordinateur de chantier »')
    expect(result).toHaveTextContent('Coordinateur de chantier, Coordinatrice de chantier')
    expect(result).not.toHaveTextContent('0 personne')
  })

  it('ne montre rien tant qu’aucune recherche par thème n’a répondu', () => {
    renderWithQueryClient(
      <ResearchExpansionCallout
        companyName="TF1"
        contactsCount={4}
        entities={[]}
        enrichBatchMutation={mutation(vi.fn())}
      />,
    )

    expect(screen.queryByTestId('theme-search-result')).not.toBeInTheDocument()
  })
})

/**
 * #2532.2 (21/09/2026) — un thème SANS preset connu (aucune des 10 familles
 * de contact_themes.py) est retombé sur le mot-clé brut + sa variante de
 * genre : l'écran DOIT le nommer, jamais un silence qui laisserait croire à
 * une expansion sectorielle qui n'a pas eu lieu.
 */
describe('ResearchExpansionCallout — un thème sans preset se dit honnêtement', () => {
  it('nomme l’absence de préréglage quand la recherche est retombée sur le mot-clé seul', () => {
    renderWithQueryClient(
      <ResearchExpansionCallout
        companyName="TF1"
        contactsCount={4}
        entities={[]}
        enrichBatchMutation={mutation(vi.fn(), {
          count: 1,
          themeSearch: {
            theme: 'Coordinateur pédagogique',
            titles: ['Coordinateur pédagogique', 'Coordinatrice pédagogique'],
            matchedCount: 1,
            matchedNames: ['Awa Diallo'],
            outOfThemeCount: 0,
            presetMatched: false,
          },
        })}
      />,
    )

    expect(screen.getByTestId('theme-no-preset')).toHaveTextContent(
      'Aucun préréglage pour ce thème : recherche sur le mot-clé seul.',
    )
  })

  it('ne dit rien de préréglage quand le thème a reconnu une famille', () => {
    renderWithQueryClient(
      <ResearchExpansionCallout
        companyName="TF1"
        contactsCount={4}
        entities={[]}
        enrichBatchMutation={mutation(vi.fn(), {
          count: 1,
          themeSearch: {
            theme: 'BTP',
            titles: ['Directeur de Travaux', 'Conducteur de Travaux'],
            matchedCount: 1,
            matchedNames: ['Awa Diallo'],
            outOfThemeCount: 0,
            presetMatched: true,
          },
        })}
      />,
    )

    expect(screen.queryByTestId('theme-no-preset')).not.toBeInTheDocument()
  })
})

/**
 * #2934 (#2309.24/.26/.28) — les trois leviers d'élargissement ciblé NOMMÉS
 * par l'épopée qu'aucun axe dédié ne porte aujourd'hui (famille de rôles
 * voisine, site, opérationnels). Nommés en permanence, jamais un silence —
 * même patron que `themeNoPreset` juste au-dessus.
 */
describe('ResearchExpansionCallout — leviers ciblés sans axe dédié, nommés (#2934)', () => {
  it('nomme les trois leviers absents/partiels, en permanence', () => {
    renderWithQueryClient(
      <ResearchExpansionCallout
        companyName="TF1"
        contactsCount={4}
        entities={['Direction Technique']}
        enrichBatchMutation={mutation(vi.fn())}
      />,
    )

    expect(screen.getByText(/famille de rôles voisine/)).toBeInTheDocument()
    expect(screen.getByText(/site/)).toBeInTheDocument()
    expect(screen.getByText(/opérationnels/)).toBeInTheDocument()
  })
})

// CEDRIC-FIX C.2b — « 14 contacts » en tête vs « 18 contacts identifiés » ici : un nombre, un nom.
describe('ResearchExpansionCallout — chaque nombre dit ce qu’il compte', () => {
  it('nomme les contacts RETENUS, puis les ÉCARTÉS à part — jamais deux « contacts » différents', () => {
    renderWithQueryClient(
      <ResearchExpansionCallout
        companyName="SAFRAN AIRCRAFT ENGINES"
        contactsCount={14}
        excludedCount={4}
        entities={[]}
        enrichBatchMutation={mutation()}
      />,
    )
    expect(screen.getByText(/14 contacts retenus chez SAFRAN AIRCRAFT ENGINES/)).toBeInTheDocument()
    expect(screen.getByText(/4 contacts écartés/)).toBeInTheDocument()
    expect(screen.queryByText(/18/)).not.toBeInTheDocument()
  })

  it('SAIT DIRE NON — aucun écarté, ou écartés non mesurés : aucune note', () => {
    renderWithQueryClient(
      <ResearchExpansionCallout
        companyName="TF1"
        contactsCount={4}
        excludedCount={0}
        entities={[]}
        enrichBatchMutation={mutation()}
      />,
    )
    expect(screen.queryByText(/écarté/)).not.toBeInTheDocument()
  })
})
