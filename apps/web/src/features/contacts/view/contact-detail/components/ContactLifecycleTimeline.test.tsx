import type { ContactLifecycleHistory } from '@bellum/contracts'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const lifecycle = vi.fn()
vi.mock('@/features/contacts/hooks/useContactLifecycle', () => ({
  useContactLifecycle: () => lifecycle(),
}))

const { ContactLifecycleTimeline } = await import('./ContactLifecycleTimeline')

function history(source: string | null): { data: ContactLifecycleHistory; isLoading: false } {
  return {
    isLoading: false,
    data: {
      contact_id: '00000000-0000-4000-8000-000000000001',
      state: 'identite_verifiee',
      transitions: [
        {
          id: '00000000-0000-4000-8000-000000000002',
          contact_id: '00000000-0000-4000-8000-000000000001',
          from_state: null,
          to_state: 'detecte',
          source,
          occurred_at: '2026-07-16T09:00:00.000Z',
          actor: null,
        },
      ],
    } as ContactLifecycleHistory,
  }
}

/**
 * La frise dit d'où vient CHAQUE passage — et depuis quelle FAMILLE.
 *
 * « via Registre officiel » nomme la source ; il ne dit pas quoi en faire. La
 * primitive `Provenance` ajoute la catégorie, qui décide du geste : une donnée
 * d'un registre public se vérifie à la source, une donnée proposée par un
 * modèle se relit. La primitive existait, testée et gardée, et cette frise en
 * recomposait la moitié à la main.
 */
describe('ContactLifecycleTimeline — la provenance de chaque passage', () => {
  it('nomme la famille de la source, en plus de son libellé', () => {
    lifecycle.mockReturnValue(history('pappers'))
    render(<ContactLifecycleTimeline contactId="00000000-0000-4000-8000-000000000001" />)
    expect(screen.getByText(/source publique/)).toBeInTheDocument()
    expect(screen.getByText(/Registre officiel/)).toBeInTheDocument()
  })

  it('ne devine aucune famille pour une source non classée', () => {
    lifecycle.mockReturnValue(history('demo'))
    render(<ContactLifecycleTimeline contactId="00000000-0000-4000-8000-000000000001" />)
    expect(screen.getByText(/Jeu de démonstration/)).toBeInTheDocument()
    expect(screen.queryByText(/source publique/)).not.toBeInTheDocument()
    expect(screen.queryByText(/lu dans un outil connecté/)).not.toBeInTheDocument()
  })

  it('n’affiche aucune ligne de provenance quand la transition n’a pas de source', () => {
    lifecycle.mockReturnValue(history(null))
    render(<ContactLifecycleTimeline contactId="00000000-0000-4000-8000-000000000001" />)
    expect(screen.queryByText(/source publique/)).not.toBeInTheDocument()
    expect(screen.queryByText(/^via /)).not.toBeInTheDocument()
  })
})
