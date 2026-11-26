import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { OpenNeedRow } from '@bellum/contracts'

/**
 * La carte « Laura te recommande » — #3486 : aucun taux de réussite, aucune
 * probabilité (doctrine `c26_probabilite`).
 */

const verdictSource = vi.fn()
vi.mock('../hooks/useNeedVerdict', () => ({ useNeedVerdict: () => verdictSource() }))

const { NeedDetailRecommendation } = await import('./NeedDetailRecommendation')

function need(over: Partial<OpenNeedRow> = {}): OpenNeedRow {
  return {
    id: 'n-1',
    title: 'Ingénieur données',
    urgency: null,
    skills: [],
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
    shortlist_count: 0,
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

beforeEach(() => {
  verdictSource.mockReset()
  verdictSource.mockReturnValue({ profiles: [], isLoading: false, isError: false })
})

describe('NeedDetailRecommendation', () => {
  it('n’affiche AUCUN taux ni pourcentage, même quand le verdict a des profils', () => {
    verdictSource.mockReturnValue({ profiles: [{}], isLoading: false, isError: false })
    const { container } = render(<NeedDetailRecommendation need={need()} onOpenMatching={vi.fn()} />)
    expect(container.textContent).not.toMatch(/%|taux de réussite/i)
  })

  it('ouvre l’onglet Rapprochement au clic', async () => {
    const onOpenMatching = vi.fn()
    render(<NeedDetailRecommendation need={need()} onOpenMatching={onOpenMatching} />)
    await userEvent.click(screen.getByRole('button', { name: /recommandation/i }))
    expect(onOpenMatching).toHaveBeenCalled()
  })

  // #3486 — UNE source : le verdict dit « aucun profil au-dessus du seuil », la
  // carte ne dit jamais « 1 profil à présenter ».
  it('ne recommande AUCUN profil quand le verdict n’en voit aucun au-dessus du seuil', () => {
    render(<NeedDetailRecommendation need={need()} onOpenMatching={vi.fn()} />)
    expect(screen.queryByText(/1 profil à présenter/)).not.toBeInTheDocument()
    // #3390 — « Aucun profil au-dessus du seuil » ne se répète pas : il vit sur l'axe
    // Capacité du verdict, la carte se tait (une absence ne fait aucune ligne).
    expect(screen.queryByText(/Aucun profil au-dessus du seuil/)).not.toBeInTheDocument()
    expect(screen.queryByText(/profils? à présenter/)).not.toBeInTheDocument()
  })

  it('compte les profils du verdict', () => {
    verdictSource.mockReturnValue({ profiles: [{}, {}], isLoading: false, isError: false })
    render(<NeedDetailRecommendation need={need()} onOpenMatching={vi.fn()} />)
    expect(screen.getByText(/2 profils à présenter/)).toBeInTheDocument()
  })
})
