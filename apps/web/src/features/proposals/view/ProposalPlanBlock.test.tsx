import type { ProposalOutline } from '@bellum/contracts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const apiFetch = vi.fn()
vi.mock('@/lib/api', () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, params }: { children: ReactNode; to: string; params?: Record<string, string> }) => (
    <a href={Object.entries(params ?? {}).reduce((path, [k, v]) => path.replace(`$${k}`, v), to)}>{children}</a>
  ),
}))
vi.mock('@/components/primitives/AskLaura', () => ({
  AskLaura: ({ label }: { label: string }) => <button type="button">{label}</button>,
}))
vi.mock('./SignatureHandoff', () => ({ SignatureHandoff: () => <div>signature</div> }))

import { ProposalPlanBlock } from './ProposalPlanBlock'

const wrapper = ({ children }: { children: ReactNode }) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

const OUTLINE: ProposalOutline = {
  readyCount: 1,
  complete: false,
  sections: [
    { key: 'context', state: 'ready', content: ['Client : Contoso'], gaps: [], sources: ['dossier de compte'] },
    { key: 'team', state: 'missing', content: [], gaps: ['Aucun expert retenu pour ce besoin.'], sources: ['vivier'] },
    { key: 'schedule', state: 'partial', content: [], gaps: ['Date de démarrage non confirmée.'], sources: [] },
  ],
}

beforeEach(() => apiFetch.mockReset())

function stub(outline: ProposalOutline = OUTLINE) {
  apiFetch.mockResolvedValue({
    project: { id: 'proj-1', label: 'Refonte', accountId: 'acc-1', accountName: 'Contoso' },
    outline,
  })
}

/**
 * Théo C HT-6 — « La proposition commerciale » dans le détail d'une présentation. Le Studio de
 * propositions est fondu ici : ses garanties tiennent — une section vide est MONTRÉE avec sa raison,
 * un décompte n'est pas une note, rien ne s'envoie d'ici.
 */
describe('ProposalPlanBlock', () => {
  it('montre le décompte accordé, jamais une note', async () => {
    stub()
    render(<ProposalPlanBlock projectId="proj-1" accountId="acc-1" />, { wrapper })
    expect(await screen.findByText('1 section prête sur 3')).toBeInTheDocument()
  })

  it('MONTRE une section vide avec sa raison et la porte qui la corrige', async () => {
    stub()
    render(<ProposalPlanBlock projectId="proj-1" accountId="acc-1" />, { wrapper })
    expect(await screen.findByText('Équipe')).toBeInTheDocument()
    expect(screen.getByText('Vide')).toBeInTheDocument()
    expect(screen.getByText('Aucun expert retenu pour ce besoin.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ouvrir le vivier' })).toHaveAttribute('href', '/consultants')
    expect(screen.getByRole('link', { name: 'Corriger sur le besoin' })).toHaveAttribute('href', '/projects/proj-1')
  })

  it('dit qu’une lecture a ÉCHOUÉ plutôt que de rendre un plan vide', async () => {
    apiFetch.mockImplementation((request?: { path?: string }) =>
      request?.path?.startsWith('/proposals/') ? Promise.reject(new Error('boom')) : Promise.resolve({}),
    )
    render(<ProposalPlanBlock projectId="proj-1" accountId="acc-1" />, { wrapper })
    expect(await screen.findByText("Le plan n'a pas pu être assemblé.")).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeInTheDocument()
  })

  it('n’expose aucun geste d’envoi : le studio prépare, tu envoies', async () => {
    stub()
    render(<ProposalPlanBlock projectId="proj-1" accountId="acc-1" />, { wrapper })
    await screen.findByText('Équipe')
    const labels = [...screen.queryAllByRole('button'), ...screen.queryAllByRole('link')]
      .map(node => node.textContent ?? '')
      .join(' ')
      .toLowerCase()
    expect(labels).not.toMatch(/envoyer|enregistrer/)
    expect(
      screen.getByText("Le studio prépare, tu envoies. Aucun e-mail ne part d'ici et aucune fiche n'est modifiée."),
    ).toBeInTheDocument()
  })
})
