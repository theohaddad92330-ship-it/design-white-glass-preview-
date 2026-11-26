import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { RestitutionPanel } from './RestitutionPanel'

const summary = vi.fn(async (_sessionId: string | null) => null as unknown)
vi.mock('../api', () => ({
  restitutionApi: {
    consultantsTotal: vi.fn(async () => null),
    summary: (sessionId: string | null) => summary(sessionId),
  },
}))
// Sans routeur monté, `Link` lève : il est rendu en simple ancre qui porte sa cible.
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => <a href={to}>{children}</a>,
}))

/**
 * #2080 — « BellumAI ne repart pas de zéro ».
 *
 * Ce que ce fichier tient : le panneau se TAIT sur un import qui n'a rien
 * produit (un panneau vide mentirait), la phrase mesurée et les blocs
 * s'affichent sinon, et « non mesuré » ne se confond jamais avec zéro.
 */
function wrap(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>)
}

describe('RestitutionPanel', () => {
  it('ne rend RIEN quand l’import n’a rien produit — un panneau vide mentirait', () => {
    const { container } = wrap(<RestitutionPanel counts={{ created: 0, updated: 0 }} onDismiss={() => {}} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('affiche la phrase mesurée et le compte des comptes retrouvés', () => {
    wrap(<RestitutionPanel counts={{ created: 40, updated: 24 }} onDismiss={() => {}} />)
    expect(screen.getByTestId('restitution-panel')).toBeInTheDocument()
    // La phrase additionne créations et mises à jour : 64 — repris à la fois
    // dans la phrase mesurée et dans le bloc « Comptes retrouvés ».
    expect(screen.getAllByText(/64/).length).toBeGreaterThan(0)
  })

  // #2958.106 (recette Antoine) — 927 CONTACTS importés s'annonçaient « 927 comptes
  // retrouvés », et « Voir les données » menait à /accounts : Antoine ne retrouvait
  // pas ses contacts là où l'écran l'envoyait.
  it('#2958.106 — un import de contacts nomme des contacts et mène à l’annuaire', () => {
    wrap(<RestitutionPanel counts={{ created: 927, updated: 0 }} objectType="contact" onDismiss={() => {}} />)
    expect(screen.getByText('927 contacts retrouvés.')).toBeInTheDocument()
    expect(screen.getByText('Contacts retrouvés')).toBeInTheDocument()
    expect(screen.queryByText(/comptes retrouvés/i)).toBeNull()
    expect(screen.getByRole('link', { name: 'Voir les données' })).toHaveAttribute('href', '/contacts')
  })

  it('#2958.106 — sans objet connu, la restitution reste celle des comptes', () => {
    wrap(<RestitutionPanel counts={{ created: 3, updated: 0 }} onDismiss={() => {}} />)
    expect(screen.getByText('3 comptes retrouvés.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Voir les données' })).toHaveAttribute('href', '/accounts')
  })

  it('un bloc non raccordé se lit « non mesuré », jamais « 0 »', () => {
    wrap(<RestitutionPanel counts={{ created: 1, updated: 0 }} onDismiss={() => {}} />)
    // Les sept blocs, dont quatre non mesurés (relations, échéances,
    // rendez-vous, contradictions) : aucun zéro parmi eux.
    expect(screen.queryAllByText('0')).toHaveLength(0)
  })

  it('#2080 — un bloc MESURÉ affiche son nombre ET sa source', async () => {
    summary.mockResolvedValueOnce({
      relations: {
        value: 12,
        provenance: { sources: ['bellum'], window_days: null, population: 30, computed_at: '2026-09-16T10:00:00.000Z' },
      },
      upcoming: {
        value: 3,
        provenance: { sources: ['bellum'], window_days: 30, population: 30, computed_at: '2026-09-16T10:00:00.000Z' },
      },
      meetings: {
        value: 2,
        provenance: {
          sources: ['calendar'],
          window_days: 30,
          population: null,
          computed_at: '2026-09-16T10:00:00.000Z',
        },
      },
      missing_data: {
        value: null,
        provenance: { sources: [], window_days: null, population: null, computed_at: '2026-09-16T10:00:00.000Z' },
      },
      contradictions: {
        value: null,
        provenance: { sources: [], window_days: null, population: null, computed_at: '2026-09-16T10:00:00.000Z' },
      },
    })
    wrap(<RestitutionPanel counts={{ created: 1, updated: 0 }} sessionId="s-1" onDismiss={() => {}} />)

    expect(await screen.findByText('12')).toBeInTheDocument()
    // La provenance voyage avec le nombre : un chiffre sans source n'est pas
    // vérifiable, et c'est la première question qu'on pose devant lui.
    expect(screen.getAllByText(/Sources :/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/ton agenda/).length).toBeGreaterThan(0)
    // Et les deux blocs que le serveur dit non mesurés restent « non mesuré ».
    expect(screen.queryAllByText('0')).toHaveLength(0)
  })

  it('#2080 — le LOT importé voyage jusqu’à la lecture', async () => {
    summary.mockClear()
    wrap(<RestitutionPanel counts={{ created: 1, updated: 0 }} sessionId="s-42" onDismiss={() => {}} />)
    await screen.findByTestId('restitution-panel')
    expect(summary).toHaveBeenCalledWith('s-42')
  })

  it('le bouton de fermeture appelle onDismiss', () => {
    const onDismiss = vi.fn()
    wrap(<RestitutionPanel counts={{ created: 1, updated: 0 }} onDismiss={onDismiss} />)
    fireEvent.click(screen.getByRole('button', { name: /fermer|dismiss/i }))
    expect(onDismiss).toHaveBeenCalled()
  })
})
