import type { ReactElement } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { computeQualificationVerdict, type QualificationCriterion } from '@bellum/contracts'
import { i18n } from '@/i18n'

const apiFetch = vi.fn()
vi.mock('@/lib/api', () => ({ apiFetch: (...a: unknown[]) => apiFetch(...a) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }))

const { AccountQualificationCard } = await import('./AccountQualificationCard')

function renderView(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
}

const criteria: QualificationCriterion[] = [
  {
    code: 'F1',
    label: 'Présence géographique',
    kind: 'eliminatory',
    weight: null,
    category: null,
    description_max: null,
    description_zero: null,
    position: 0,
  },
  {
    code: 'S1',
    label: 'Douleur exprimée',
    kind: 'weighted',
    weight: 60,
    category: null,
    description_max: null,
    description_zero: null,
    position: 1,
  },
  {
    code: 'S2',
    label: 'Staffing disponible',
    kind: 'weighted',
    weight: 40,
    category: null,
    description_max: null,
    description_zero: null,
    position: 2,
  },
]

function view(evaluations: Parameters<typeof computeQualificationVerdict>[1]) {
  return {
    qualification: {
      grid: { id: 'g1', version: 1, active: true, created_at: '2026-10-06T00:00:00.000Z', criteria },
      evaluated_version: 1,
      current_version: 1,
      evaluated_at: '2026-10-06T00:00:00.000Z',
      result: computeQualificationVerdict(criteria, evaluations),
    },
  }
}

beforeEach(async () => {
  await i18n.changeLanguage('fr')
  apiFetch.mockReset()
})

describe('#3755 — la qualification du compte sur la fiche', () => {
  it('sans grille active, rien ne s’affiche (la fiche reste celle d’avant)', async () => {
    apiFetch.mockResolvedValue({ qualification: null })
    const { container } = renderView(<AccountQualificationCard accountId="a1" />)
    await waitFor(() => expect(apiFetch).toHaveBeenCalled())
    expect(container.textContent).toBe('')
  })

  it('un compte hors France : NO-GO avec le filtre NOMMÉ', async () => {
    apiFetch.mockResolvedValue(
      view([{ code: 'F1', status: 'fail', points: null, evidence: 'Siège à Montréal', source: 'analysis' }]),
    )
    renderView(<AccountQualificationCard accountId="a1" />)
    expect(await screen.findByText(/NO-GO — filtre F1 Présence géographique/)).toBeTruthy()
    expect(screen.getByText(/Siège à Montréal/)).toBeTruthy()
  })

  it('un critère non évaluable est NOMMÉ, hors calcul, et n’affiche jamais 0', async () => {
    apiFetch.mockResolvedValue(
      view([
        { code: 'F1', status: 'pass', points: null, evidence: 'Siège à Paris', source: 'analysis' },
        { code: 'S1', status: 'scored', points: 45, evidence: 'Refonte annoncée', source: 'manual' },
      ]),
    )
    renderView(<AccountQualificationCard accountId="a1" />)
    expect(await screen.findByText(/45 \/ 60 points sur les critères évaluables/)).toBeTruthy()
    expect(screen.getByText(/Non évaluables \(hors calcul\) : S2 Staffing disponible/)).toBeTruthy()
    expect(screen.getByText('Saisie du commercial')).toBeTruthy()
    expect(screen.queryByText('0 / 40')).toBeNull()
    expect(screen.queryByText(/chance|probabilit/i)).toBeNull()
  })
})
