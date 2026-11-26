import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Account } from '@bellum/contracts'
import { apiFetch } from '@/lib/api'
import { TabAccess } from './TabAccess'

/**
 * #3916.1 / #3922 — l'avertissement de procédure collective porte désormais
 * un LIEN vers l'annonce BODACC. Un risque qui justifie de ne pas engager de
 * temps commercial doit être vérifiable d'un clic ; sans lien connu, l'écran
 * le DIT plutôt que de laisser son absence se confondre avec un fait prouvé.
 */

const apiFetchMock = vi.mocked(apiFetch)

const ACCOUNT = {
  id: 'acc-1',
  status: 'completed',
  created_at: '2026-08-01T09:00:00.000Z',
  last_analyzed_at: '2026-08-20T09:00:00.000Z',
  signals_collected_at: '2026-10-02T08:00:00.000Z',
} as Account

function landscapeWithWarning(
  warning: { kind: string; date: string | null; label: string; url: string | null } | null,
) {
  return {
    lock: { state: 'inconnu', fact: null },
    modes: [],
    cost: null,
    facts: [],
    entities: [],
    avoidGroupEntry: false,
    warning,
    community: null,
    question: null,
    barrier: null,
  }
}

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  return render(
    <QueryClientProvider client={client}>
      <TabAccess account={ACCOUNT} />
    </QueryClientProvider>,
  )
}

describe('l’avertissement de procédure collective porte son lien', () => {
  beforeEach(() => {
    apiFetchMock.mockReset()
  })
  afterEach(cleanup)

  it('propose un lien cliquable vers l’annonce quand la ligne en a un', async () => {
    const url = 'https://bodacc-datadila.opendatasoft.com/explore/dataset/annonces-commerciales/table/?q=552032534'
    apiFetchMock.mockResolvedValue(
      landscapeWithWarning({ kind: 'procedure_collective', date: '2026-06-01', label: 'Redressement judiciaire', url }),
    )
    mount()

    const link = await screen.findByRole('link', { name: "Voir l'annonce" })
    expect(link).toHaveAttribute('href', url)
  })

  it('#4045.3 — sans lien : aucune ligne, ni lien deviné ni mention d’absence', async () => {
    apiFetchMock.mockResolvedValue(
      landscapeWithWarning({
        kind: 'procedure_collective',
        date: '2026-06-01',
        label: 'Redressement judiciaire',
        url: null,
      }),
    )
    mount()

    expect(await screen.findByText(/Procédure collective publiée/)).toBeInTheDocument()
    expect(screen.queryByText('Sans lien vérifiable')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Voir l.annonce/i })).not.toBeInTheDocument()
  })
})
