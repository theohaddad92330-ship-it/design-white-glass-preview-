import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SubmissionTimelineDialog } from './SubmissionTimelineDialog'

const timeline = vi.fn()

vi.mock('../api', () => ({
  useSubmissionTimeline: () => timeline(),
}))

function renderDialog() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <SubmissionTimelineDialog submissionId="sub-1" talentName="Marie Dupont" open onClose={() => {}} />
    </QueryClientProvider>,
  )
}

// #2335.3 — chaque étape avec sa date, la fiche d'UN positionnement.
describe('SubmissionTimelineDialog', () => {
  it('liste chaque étape avec sa date, dans l’ordre chronologique', () => {
    timeline.mockReturnValue({
      data: [
        { subject: 'Marie Dupont — CV envoyé', occurredAt: '2026-08-01T09:00:00.000Z' },
        { subject: 'Marie Dupont — Entretien programmé', occurredAt: '2026-08-05T09:00:00.000Z' },
      ],
      isLoading: false,
    })
    renderDialog()
    expect(screen.getByText('Marie Dupont — CV envoyé')).toBeInTheDocument()
    expect(screen.getByText('Marie Dupont — Entretien programmé')).toBeInTheDocument()
  })

  it('dit qu’aucune étape n’est encore tracée plutôt que rendre un cadre vide', () => {
    timeline.mockReturnValue({ data: [], isLoading: false })
    renderDialog()
    expect(screen.getByText('Aucune étape tracée pour l’instant.')).toBeInTheDocument()
  })
})
