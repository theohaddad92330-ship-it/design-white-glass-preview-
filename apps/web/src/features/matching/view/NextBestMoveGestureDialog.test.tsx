import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { MatchNeed } from '@bellum/contracts'

/**
 * #2178.11-.17 — chaque arbitrage d'un zéro résultat ouvre un DIALOGUE GUIDÉ,
 * plus un lien vers une page. Rien ne s'écrit sans le clic « Enregistrer »,
 * rien ne part (ni recherche externe, ni message) sans geste explicite.
 */
const apiFetch = vi.fn()
vi.mock('@/lib/api', () => ({ apiFetch: (args: unknown) => apiFetch(args) }))

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    to,
    params,
    search,
    children,
  }: {
    to: string
    params?: Record<string, string>
    search?: Record<string, string>
    children: React.ReactNode
  }) => {
    const path = Object.entries(params ?? {}).reduce((current, [key, value]) => current.replace('$' + key, value), to)
    const qs = search ? `?${new URLSearchParams(search).toString()}` : ''
    return <a href={`${path}${qs}`}>{children}</a>
  },
}))

const OPEN_NEED = {
  id: '11111111-1111-4111-8111-111111111111',
  title: 'Data Engineer',
  skills: [
    { term: 'spark', required: true, level: 'confirmé', proof: 'cité au brief' },
    { term: 'python', required: true, level: null, proof: null },
    { term: 'databricks', required: false, level: null, proof: null },
  ],
  seniority: 'senior',
  headcount: 1,
  target_tjm_cents: 62000,
  start_on: '2026-11-15',
  duration_months: 6,
  location: 'Paris',
  remote: 'sur_site',
  contract_kind: 'recrutement',
}
vi.mock('@/features/projects/open-needs/hooks/useOpenNeed', () => ({
  useOpenNeed: () => ({ need: OPEN_NEED, isPending: false, isError: false, notFound: false }),
}))
vi.mock('@/features/consultants/hooks', () => ({
  useConsultants: () => ({
    data: [
      {
        id: 'c0000000-0000-4000-8000-000000000001',
        full_name: 'Amine T.',
        archived_at: null,
        availability: 'immediate',
      },
      {
        id: 'c0000000-0000-4000-8000-000000000002',
        full_name: 'Zoé B.',
        archived_at: '2026-01-01T00:00:00.000Z',
        availability: 'immediate',
      },
      {
        id: 'c0000000-0000-4000-8000-000000000003',
        full_name: 'Hugo L.',
        archived_at: null,
        availability: 'indisponible',
      },
    ],
  }),
}))
vi.mock('@/features/projects/open-needs/view/NeedExternalSourcing', () => ({
  NeedExternalSourcing: ({ needTitle }: { needTitle: string }) => (
    <div data-testid="external-sourcing">{needTitle}</div>
  ),
}))
const writeText = vi.fn(async () => {})
Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })

const { NextBestMoveGestureDialog } = await import('./NextBestMoveGestureDialog')
type GuidedGesture = import('./NextBestMoveGestureDialog').GuidedGesture

const NEED = {
  needId: OPEN_NEED.id,
  role: 'Data Engineer',
  accountName: 'EDF DSI',
  accountId: 'a9999999-0000-4000-8000-000000000009',
  skills: [
    { term: 'spark', label: 'spark', required: true, level: null },
    { term: 'python', label: 'python', required: true, level: null },
  ],
} as unknown as MatchNeed

function mount(option: GuidedGesture, extra: Partial<React.ComponentProps<typeof NextBestMoveGestureDialog>> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <NextBestMoveGestureDialog option={option} need={NEED} onOpenChange={() => {}} {...extra} />
    </QueryClientProvider>,
  )
}

const patchBody = () =>
  apiFetch.mock.calls.at(-1)?.[0] as { path: string; method: string; body: Record<string, unknown> }

describe('NextBestMoveGestureDialog (#2178.11-.17)', () => {
  beforeEach(() => {
    cleanup()
    apiFetch.mockReset()
    apiFetch.mockResolvedValue({})
    writeText.mockClear()
  })

  it('#2178.11 — clarifier : séniorité, démarrage, durée ; rien n’est écrit avant « Enregistrer »', async () => {
    mount('clarifier')
    fireEvent.change(screen.getByLabelText('Séniorité attendue'), { target: { value: 'confirmé' } })
    expect(apiFetch).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer le besoin' }))
    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(1))
    expect(patchBody()).toEqual({
      path: `/projects/needs/${OPEN_NEED.id}`,
      method: 'PATCH',
      body: { seniority: 'confirmé', start_on: '2026-11-15', duration_months: 6 },
    })
  })

  it('#2178.12 — négocier : un critère obligatoire devient souhaité, le reste de la compétence est GARDÉ', async () => {
    mount('negocier')
    fireEvent.click(screen.getByLabelText('Rendre « spark » souhaitée'))
    fireEvent.change(screen.getByLabelText('TJM cible (€/j)'), { target: { value: '680' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer le besoin' }))
    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(1))
    expect(patchBody().body).toEqual({
      target_tjm_cents: 68000,
      skills: [
        { term: 'spark', required: false, level: 'confirmé', proof: 'cité au brief' },
        { term: 'python', required: true, level: null, proof: null },
        { term: 'databricks', required: false, level: null, proof: null },
      ],
    })
  })

  it('#2178.13 — élargir la zone : lieu et télétravail', async () => {
    mount('elargir')
    fireEvent.change(screen.getByLabelText('Zone acceptée'), { target: { value: 'Île-de-France' } })
    fireEvent.click(screen.getByLabelText('Hybride'))
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer le besoin' }))
    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(1))
    expect(patchBody().body).toEqual({ location: 'Île-de-France', remote: 'hybride' })
  })

  it('#2178.14 — élargir CDI/freelance : le cadre passe de recrutement à régie', async () => {
    mount('elargir_contrat')
    fireEvent.click(screen.getByLabelText('Régie — salariés et freelances'))
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer le besoin' }))
    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(1))
    expect(patchBody().body).toEqual({ contract_kind: 'regie' })
  })

  it('#2178.15 — réactiver : seuls les profils indisponibles ou archivés, chacun vers sa fiche ; rien n’est écrit', () => {
    mount('reactiver')
    expect(screen.queryByText('Amine T.')).toBeNull()
    expect(screen.getByText('Zoé B.').closest('a')?.getAttribute('href')).toBe(
      '/consultants/c0000000-0000-4000-8000-000000000002',
    )
    expect(screen.getByText('Hugo L.').closest('a')?.getAttribute('href')).toBe(
      '/consultants/c0000000-0000-4000-8000-000000000003',
    )
    expect(apiFetch).not.toHaveBeenCalled()
  })

  it('#2178.16 — demander une recommandation : un BROUILLON à copier, jamais envoyé', async () => {
    mount('recommandation')
    const draft = screen.getByLabelText('Brouillon de la demande') as HTMLTextAreaElement
    expect(draft.value).toContain('Data Engineer')
    expect(draft.value).toContain('spark, python')
    fireEvent.click(screen.getByRole('button', { name: 'Copier le brouillon' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(draft.value))
    expect(apiFetch).not.toHaveBeenCalled()
    expect(screen.getByText('Choisir à qui l’envoyer').closest('a')?.getAttribute('href')).toBe(
      '/accounts/a9999999-0000-4000-8000-000000000009?tab=contacts',
    )
  })

  it('#2178.17 — sourcer : la recherche externe est montée, mais rien ne part à l’ouverture', () => {
    mount('sourcer')
    expect(screen.getByTestId('external-sourcing').textContent).toBe('Data Engineer')
    expect(apiFetch).not.toHaveBeenCalled()
  })

  it('#2178.33 — proposé par un retour client : l’origine est NOMMÉE, la mise à jour attend la validation', () => {
    mount('negocier', { proposedBy: 'price' })
    expect(screen.getByText(/Proposé par les retours client/)).toBeTruthy()
    expect(apiFetch).not.toHaveBeenCalled()
  })
})
