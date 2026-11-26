import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { OpenNeedRow } from '@bellum/contracts'

/**
 * #2323.46 / #2323.19-.23 — le RÉSUMÉ QUALITÉ rendu sur la fiche : l'APPELANT
 * de `needQualitySummary` / `needPresenterGate`, pas leurs fonctions pures
 * (déjà gardées dans `packages/contracts`). On garde ce que l'écran DIT.
 */
const submissions = vi.fn()
vi.mock('@/features/submissions/api', () => ({ useSubmissions: () => submissions() }))

const verdictHook = vi.fn()
vi.mock('../hooks/useNeedVerdict', () => ({ useNeedVerdict: () => verdictHook() }))

const { NeedQualitySummaryCard } = await import('./NeedQualitySummaryCard')

function need(over: Partial<OpenNeedRow> = {}): OpenNeedRow {
  return {
    id: 'n-1',
    title: 'Ingénieur données',
    skills: [{ term: 'Airflow', required: true, level: null }],
    seniority: 'confirmé',
    location: 'Lyon',
    start_on: '2026-10-01T00:00:00.000Z',
    target_tjm_cents: 580_00,
    contact_id: null,
    constraints: null,
    presentation_process: null,
    profile_type_agreement: undefined,
    project_id: 'p-1',
    ...over,
  } as unknown as OpenNeedRow
}

beforeEach(() => {
  verdictHook.mockReturnValue({ verdict: null })
  submissions.mockReturnValue({ data: { items: [] }, isLoading: false, isError: false })
})

describe('NeedQualitySummaryCard', () => {
  it('dit « matchable, pas encore présentable » et NOMME ce qui manque', () => {
    render(<NeedQualitySummaryCard need={need()} />)
    expect(screen.getByText(/matchable, mais pas encore présentable/i)).toBeTruthy()
    expect(screen.getByText(/le destinataire/i)).toBeTruthy()
    expect(screen.getByText(/l’accord du type de profil/i)).toBeTruthy()
    // un budget présent n'est jamais listé comme manquant
    expect(screen.queryByText(/le budget/i)).toBeNull()
  })

  it('un refus client du type de profil se nomme à part, jamais comme une absence', () => {
    render(<NeedQualitySummaryCard need={need({ profile_type_agreement: 'not_agreed' })} />)
    expect(screen.getByText(/le client n’a pas validé le type de profil/i)).toBeTruthy()
  })

  it('sans compétence : pas matchable, et aucune probabilité ni pourcentage', () => {
    const { container } = render(<NeedQualitySummaryCard need={need({ skills: [] })} />)
    expect(screen.getByText(/pas encore matchable/i)).toBeTruthy()
    expect(container.textContent).not.toMatch(/%/)
  })

  it('un positionnement engagé fait « prêt à engager » ; un accord consultant sort le manque', () => {
    submissions.mockReturnValue({
      data: { items: [{ needId: 'n-1', stage: 'accepted', substatus: 'selected' }] },
      isLoading: false,
      isError: false,
    })
    render(<NeedQualitySummaryCard need={need()} />)
    expect(screen.queryByText(/l’accord du consultant/i)).toBeNull()
    expect(screen.getByTestId('quality-axis-readyToEngage').textContent).toMatch(/oui/i)
  })

  it('les positionnements d’un besoin voisin ne comptent pas', () => {
    submissions.mockReturnValue({
      data: { items: [{ needId: 'autre', stage: 'accepted', substatus: 'selected' }] },
      isLoading: false,
      isError: false,
    })
    render(<NeedQualitySummaryCard need={need()} />)
    expect(screen.getByTestId('quality-axis-readyToEngage').textContent).toMatch(/non/i)
  })

  it('ne dit rien tant que les positionnements ne sont pas lus (jamais un faux « manque »)', () => {
    submissions.mockReturnValue({ data: undefined, isLoading: true, isError: false })
    const { container } = render(<NeedQualitySummaryCard need={need()} />)
    expect(container.textContent).toBe('')
  })

  // #2323.46 — le résumé suit le verdict de la MÊME page : jamais « Prêt à engager : oui » sous « NON ».
  it('un verdict NON, MAUVAIS FIT interdit « prêt à engager : oui », même avec un consultant engagé', () => {
    verdictHook.mockReturnValue({ verdict: { verdict: 'no_go' } })
    submissions.mockReturnValue({
      data: { items: [{ needId: 'n-1', stage: 'accepted', substatus: 'selected' }] },
      isLoading: false,
      isError: false,
    })
    render(<NeedQualitySummaryCard need={need()} />)
    expect(screen.getByTestId('quality-axis-readyToEngage').textContent).toMatch(/non/i)
    expect(screen.getByText(/verdict de cette fiche/i)).toBeTruthy()
  })
})
