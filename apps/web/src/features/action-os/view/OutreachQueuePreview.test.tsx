import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

const messages = vi.hoisted(() => ({ value: [] as unknown[] }))
vi.mock('@tanstack/react-query', () => ({ useQuery: () => ({ data: messages.value }) }))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: ReactNode }) => <a href="/x">{children}</a>,
}))
vi.mock('@/lib/hooks/use-session', () => ({ useSession: () => ({ user: { id: 'u' } }) }))
vi.mock('@/features/outreach/api', () => ({
  outreachKeys: { messages: () => ['m'] },
  outreachMessagesApi: { list: vi.fn() },
}))

const { OutreachQueuePreview } = await import('./OutreachQueuePreview')

describe('#3420 — le centre « À valider » montre les messages d’approche à relire', () => {
  it('nomme le contact et son motif', () => {
    messages.value = [
      {
        id: '1',
        view: 'blocked',
        contact_name: 'Ferdinand Aumont',
        account_name: 'NOVA',
        blockers: ['unverifiable_claim'],
      },
      { id: '2', view: null, contact_name: 'Autre', account_name: null, blockers: [] },
    ]
    render(<OutreachQueuePreview />)
    expect(screen.getByText('Ferdinand Aumont')).toBeTruthy()
    expect(screen.queryByText('Autre')).toBeNull()
    expect(screen.getByRole('link').textContent).toContain('· 1')
  })
  // #3420.1 (recette démo 05/10) — 3 lignes, toutes « bloquées » : ce qui est À VALIDER passe d'abord,
  // chaque ligne dit son état, et un message déjà parti ne compte pas dans « à valider ».
  it('#3420.1 les messages à valider passent avant les bloqués, chaque ligne dit son état', () => {
    messages.value = [
      { id: 'b1', view: 'blocked', contact_name: 'Bloqué 1', account_name: null, blockers: ['unverifiable_claim'] },
      { id: 'b2', view: 'blocked', contact_name: 'Bloqué 2', account_name: null, blockers: ['unverifiable_claim'] },
      { id: 'b3', view: 'blocked', contact_name: 'Bloqué 3', account_name: null, blockers: ['unverifiable_claim'] },
      { id: 'v1', view: 'to_review', contact_name: 'Pierre Palmieri', account_name: null, blockers: [] },
      { id: 'x1', view: 'executed', contact_name: 'Déjà parti', account_name: null, blockers: [] },
    ]
    render(<OutreachQueuePreview />)
    const rows = screen.getAllByRole('listitem')
    expect(rows[0].textContent).toContain('Pierre Palmieri')
    expect(rows[0].textContent).toContain('À valider')
    expect(rows[1].textContent).toContain('Bloqués')
    expect(screen.queryByText('Déjà parti')).toBeNull()
    expect(screen.getByRole('link').textContent).toContain('· 4')
  })
  it('ne montre aucune ligne quand rien n’attend', () => {
    messages.value = []
    render(<OutreachQueuePreview />)
    expect(screen.queryByRole('listitem')).toBeNull()
  })

  // #2200.13/.14/.21 — une carte Séquence nomme son auteur, sa source et sa prochaine action ;
  // une valeur inconnue ne fait AUCUNE ligne.
  it('#2200.13 — nomme auteur, source et prochaine action d’un message de séquence', () => {
    messages.value = [
      {
        id: 's1',
        view: 'to_review',
        contact_name: 'Alice Martin',
        account_name: 'ACME',
        blockers: [],
        sequence_id: 'seq-1',
        source: 'sequences',
        versions: [
          { version: 1, kind: 'template', author: null },
          { version: 2, kind: 'personalized', author: null },
        ],
      },
    ]
    render(<OutreachQueuePreview />)
    const trace = screen.getByTestId('queue-trace-line')
    expect(trace.textContent).toContain('Préparé par Laura')
    expect(trace.textContent).toContain('séquence')
    expect(trace.textContent).toContain('Relis et valide')
  })

  it('#2200.13 — un gabarit seul n’a pas d’auteur : aucune ligne « Préparé par »', () => {
    messages.value = [
      {
        id: 's4',
        view: 'to_review',
        contact_name: 'Z',
        blockers: [],
        versions: [{ version: 1, kind: 'template', author: null }],
      },
    ]
    render(<OutreachQueuePreview />)
    expect(screen.queryByText(/Préparé par/)).toBeNull()
  })

  it('#2200.13 — auteur et source inconnus : aucune ligne, jamais de valeur inventée', () => {
    messages.value = [
      { id: 's2', view: null, contact_name: 'X', blockers: [] },
      { id: 's3', view: 'blocked', contact_name: 'Y', account_name: null, blockers: [], versions: [] },
    ]
    render(<OutreachQueuePreview />)
    expect(screen.queryByText(/Préparé par/)).toBeNull()
  })
})
