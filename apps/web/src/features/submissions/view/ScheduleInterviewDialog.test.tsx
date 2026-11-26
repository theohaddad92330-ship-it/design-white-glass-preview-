import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ScheduleInterviewDialog } from './ScheduleInterviewDialog'

const schedule = vi.fn()

vi.mock('../api', () => ({
  useScheduleInterview: () => ({ mutate: schedule, isPending: false }),
}))

function renderDialog(open = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <ScheduleInterviewDialog submissionId="sub-1" talentName="Marie Dupont" open={open} onClose={() => undefined} />
    </QueryClientProvider>,
  )
}

/**
 * #2173.41 — `scheduleInterviewSchema` existait au contrat (`submission.ts`),
 * la route (`POST /submissions/:id/interviews`) et le hook web
 * (`useScheduleInterview`) aussi — AUCUNE UI ne les appelait. Ce test prouve
 * l'appel, pas seulement l'existence du bouton.
 */
describe('ScheduleInterviewDialog', () => {
  beforeEach(() => {
    schedule.mockReset()
  })

  it("refuse de partir tant qu'aucune date n'est choisie", () => {
    renderDialog()
    const confirm = screen.getByRole('button', { name: /planifier/i })
    expect(confirm).toBeDisabled()
  })

  it('envoie la date, le mode par défaut et les présents au clic', () => {
    renderDialog()
    fireEvent.change(screen.getByLabelText(/date et heure/i), { target: { value: '2026-10-01T09:00' } })
    fireEvent.click(screen.getByRole('button', { name: /planifier/i }))

    expect(schedule).toHaveBeenCalledTimes(1)
    const [input] = schedule.mock.calls[0] as [Record<string, unknown>, unknown]
    expect(input['mode']).toBe('remote')
    expect(input['clientAttendees']).toEqual([])
    expect(typeof input['scheduledAt']).toBe('string')
  })

  it('envoie le mode choisi et les présents saisis', () => {
    renderDialog()
    fireEvent.change(screen.getByLabelText(/date et heure/i), { target: { value: '2026-10-01T09:00' } })
    fireEvent.click(screen.getByRole('button', { name: /sur site/i }))
    fireEvent.change(screen.getByLabelText(/personnes côté client/i), {
      target: { value: 'Jean Martin, Sophie Leroy' },
    })
    fireEvent.click(screen.getByRole('button', { name: /planifier/i }))

    const [input] = schedule.mock.calls[0] as [Record<string, unknown>, unknown]
    expect(input['mode']).toBe('onsite')
    expect(input['clientAttendees']).toEqual(['Jean Martin', 'Sophie Leroy'])
  })
})
