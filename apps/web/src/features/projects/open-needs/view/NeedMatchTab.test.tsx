import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { OpenNeedRow } from '@bellum/contracts'

/**
 * L'ONGLET RAPPROCHEMENT — le tiroir de la liste, MONTÉ, pas réécrit.
 *
 * ⚠️ Ce fichier ne réimplémente RIEN du classement : il vérifie que
 * `NeedMatchTab` déclenche le MÊME geste que la liste (`useRunMatch`, une
 * mutation qui écrit un journal) et rend le MÊME composant (`MatchDrawer`).
 * `MatchDrawer.test.tsx` garde déjà ce que le tiroir affiche une fois les
 * données là — ici on garde seulement que la fiche l'atteint.
 */

const apiFetch = vi.fn()
vi.mock('@/lib/api', () => ({ apiFetch: (args: unknown) => apiFetch(args) }))
const toastError = vi.fn()
vi.mock('sonner', () => ({ toast: { error: toastError, success: vi.fn() } }))

// Le routeur, réduit à ce que ces tests mesurent (même patron que
// `MatchDrawer.test.tsx`). #2176.42 fait de `MatchCard` — monté par
// `MatchDrawer`, lui-même monté ici — un lien réel vers la fiche du
// consultant : sans ce mock, `useLinkProps` lève hors d'un `RouterProvider`
// et fait s'effondrer tout l'arbre (le tiroir ne rend plus rien, et l'effet
// de relance de mutation se rejoue lors de la récupération de React).
vi.mock('@tanstack/react-router', () => ({
  Link: ({
    to,
    params,
    children,
    ...rest
  }: {
    to: string
    params?: Record<string, string>
    children: React.ReactNode
  }) => (
    <a href={Object.entries(params ?? {}).reduce((path, [key, value]) => path.replace('$' + key, value), to)} {...rest}>
      {children}
    </a>
  ),
}))

const { NeedMatchTab } = await import('./NeedMatchTab')

function need(over: Partial<OpenNeedRow> = {}): OpenNeedRow {
  return {
    id: 'n-1',
    title: 'Ingénieur données',
    urgency: null,
    skills: [{ term: 'Spark', required: true, level: null }],
    seniority: null,
    headcount: 1,
    target_tjm_cents: null,
    start_on: null,
    duration_months: null,
    location: null,
    contract_kind: 'regie',
    deadline_at: null,
    status: 'matching',
    status_reason: null,
    status_changed_at: null,
    source: null,
    provenance: null,
    owner_id: null,
    shortlist_count: 1,
    staffable: 'unknown',
    staffable_reason: null,
    project_id: 'p-1',
    project_label: 'Portail transporteurs',
    project_stage: 'qualified',
    account_id: 'a-1',
    account_name: 'NOVA LOGISTIQUE',
    entity_id: null,
    entity_name: null,
    ...over,
  } as unknown as OpenNeedRow
}

const RUN = {
  runId: '44444444-4444-4444-8444-444444444444',
  need: {
    needId: 'n-1',
    role: 'Ingénieur données',
    accountName: 'NOVA LOGISTIQUE',
    accountSector: null,
    projectSectors: [],
    skills: [{ term: 'spark', label: 'Spark', required: true, level: null }],
    minYears: null,
    seniorityBand: null,
    environment: [],
    languages: [],
    clearances: [],
    location: null,
    remote: null,
    startOn: null,
    targetRateCents: null,
    contractKind: 'regie',
  },
  weights: {
    must_have: 25,
    nice_to_have: 8,
    seniority: 10,
    sector: 8,
    environment: 7,
    language: 5,
    location: 8,
    availability: 12,
    contract_status: 4,
    rate: 7,
    evidence_quality: 4,
    client_constraints: 2,
    risks: 5,
  },
  threshold: 60,
  evaluatedCount: 1,
  prefilteredCount: 0,
  truncated: false,
  recommended: [
    {
      consultantId: 'c-1',
      axes: [{ axis: 'must_have', score: 90, weight: 25, detail: 'Spark prouvé', evidence: [] }],
      correspondenceScore: 90,
      pushableScore: 80,
      bucket: 'recommended',
      exclusions: [],
      skills: [],
      gaps: [],
      adjacency: [],
      questionsToValidate: [],
      flags: [],
    },
  ],
  borderline: [],
  notEvaluable: [],
  excluded: [],
  exclusionCounts: [],
  identities: [{ consultantId: 'c-1', fullName: 'Sophie M.', title: 'Data Engineer' }],
  nextBestMove: null,
  feedbackLearnings: [],
  createdAt: '2026-08-30T10:00:00.000Z',
}

function mount(row: OpenNeedRow, onClose = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const result = render(
    <QueryClientProvider client={client}>
      <NeedMatchTab need={row} onClose={onClose} />
    </QueryClientProvider>,
  )
  return { ...result, client, onClose }
}

beforeEach(() => {
  apiFetch.mockReset()
  toastError.mockClear()
})

describe('NeedMatchTab', () => {
  it('lance le MÊME geste que la liste — une mutation, dès que l’onglet est actif', async () => {
    apiFetch.mockResolvedValue(RUN)
    mount(need())
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith(expect.objectContaining({ path: '/needs/n-1/match', method: 'POST' })),
    )
  })

  it('rend le MÊME tiroir que la liste, avec le classement reçu', async () => {
    apiFetch.mockResolvedValue(RUN)
    mount(need())
    expect(await screen.findByText(/Recommandés \(1\)/)).toBeTruthy()
    expect(await screen.findByText('Sophie M.')).toBeTruthy()
  })

  it('ne lance RIEN sur un besoin sans compétence, et DIT pourquoi', () => {
    mount(need({ skills: [] }))
    expect(apiFetch).not.toHaveBeenCalled()
    expect(screen.getByText(/n'a pas de compétence renseignée/)).toBeTruthy()
  })

  it('ne relance pas une deuxième mutation si le composant se re-rend pour le même besoin', async () => {
    apiFetch.mockResolvedValue(RUN)
    const row = need()
    const { rerender, client, onClose } = mount(row)
    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(1))
    rerender(
      <QueryClientProvider client={client}>
        <NeedMatchTab need={row} onClose={onClose} />
      </QueryClientProvider>,
    )
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(apiFetch).toHaveBeenCalledTimes(1)
  })
})
