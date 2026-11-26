import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import { TrackedDealsBox } from './TrackedDealsBox'

// Théo A comptes-fiche.N11 — « Affaires déjà suivies » : le dossier les RELIE, il ne crée pas un second pipeline.
const rows = vi.hoisted(() => ({ current: [] as Array<Record<string, unknown>> }))
vi.mock('@/lib/api', () => ({ apiFetch: vi.fn(async () => rows.current), ApiError: class extends Error {} }))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => <a href={to}>{children}</a>,
}))

const deal = (id: string, label: string, stage: string, kind = 'opportunity') => ({ id, label, stage, kind })

function draw() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <TrackedDealsBox accountId="a1" />
    </QueryClientProvider>,
  )
}

beforeEach(async () => {
  await i18n.changeLanguage('fr')
})

describe('TrackedDealsBox', () => {
  it('nomme les affaires en cours du compte et renvoie vers le pipe', async () => {
    rows.current = [
      deal('p1', 'Renfort cloud', 'qualified'),
      deal('p2', 'Refonte sécurité', 'detected'),
      deal('p3', 'Ancien besoin', 'won'),
      deal('p4', 'Signal brut', 'detected', 'signal'),
    ]
    draw()
    expect(await screen.findByText('Renfort cloud')).toBeInTheDocument()
    expect(screen.getByText('Refonte sécurité')).toBeInTheDocument()
    expect(screen.queryByText('Ancien besoin')).not.toBeInTheDocument()
    expect(screen.queryByText('Signal brut')).not.toBeInTheDocument()
    expect(screen.getByText(/ne crée pas un second pipeline/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Ouvrir le pipe/ })).toHaveAttribute('href', '/projects')
  })

  it('⚠️ aucune affaire en cours : l’encadré se tait (jamais « 0 affaire »)', async () => {
    rows.current = [deal('p3', 'Ancien besoin', 'won')]
    const { container } = draw()
    await vi.waitFor(() => expect(container).toBeEmptyDOMElement())
  })
})
