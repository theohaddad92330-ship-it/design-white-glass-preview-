import type { Interview } from '@bellum/contracts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { InterviewBriefDialog } from './InterviewBriefDialog'

const markBriefViewed = vi.fn()

const INTERVIEW_UNREAD: Interview = {
  id: 'i1',
  submissionId: 'sub-1',
  scheduledAt: '2026-10-09T09:00:00.000Z',
  mode: 'remote',
  clientAttendees: [],
  outcome: 'pending',
  notes: null,
  createdAt: '2026-10-01T00:00:00.000Z',
  briefViewedAt: null,
}

let interviews: Interview | null = INTERVIEW_UNREAD

vi.mock('../api', () => ({
  useSubmissionInterviews: () => ({ data: interviews ? [interviews] : [] }),
  useMarkInterviewBriefViewed: () => ({ mutate: markBriefViewed }),
}))

vi.mock('../../consultants/api', () => ({
  consultantsApi: {
    interviewBrief: vi.fn(async () => ({
      consultantName: 'Marie Dupont',
      objective: 'Objectif',
      pitch: 'Pitch',
      keyExperiences: [],
      gaps: [],
      objections: [],
      consultantQuestions: [],
    })),
  },
}))

function renderDialog(open = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <InterviewBriefDialog
        open={open}
        submissionId="sub-1"
        consultantId="c1"
        projectId="p1"
        consultantName="Marie Dupont"
        onClose={() => undefined}
      />
    </QueryClientProvider>,
  )
}

/**
 * #2875/#3398 (BM, lot T06 08/10) — la trace de consultation du brief
 * (`brief_viewed_at`) est ce que lit le signal « entretien à préparer » de
 * Laura. Elle doit se poser à l'ouverture RÉELLE du dialogue, une seule fois.
 */
describe('InterviewBriefDialog — trace de consultation', () => {
  beforeEach(() => {
    markBriefViewed.mockReset()
    interviews = INTERVIEW_UNREAD
  })

  it("pose la trace à l'ouverture d'un entretien jamais consulté", () => {
    renderDialog()
    expect(markBriefViewed).toHaveBeenCalledTimes(1)
    expect(markBriefViewed).toHaveBeenCalledWith({ interviewId: 'i1' })
  })

  it('ne pose rien si le dialogue est fermé', () => {
    renderDialog(false)
    expect(markBriefViewed).not.toHaveBeenCalled()
  })

  it('ne pose rien une seconde fois si le brief est déjà consulté', () => {
    interviews = { ...INTERVIEW_UNREAD, briefViewedAt: '2026-10-08T08:00:00.000Z' }
    renderDialog()
    expect(markBriefViewed).not.toHaveBeenCalled()
  })

  it('ne pose rien sans entretien planifié', () => {
    interviews = null
    renderDialog()
    expect(markBriefViewed).not.toHaveBeenCalled()
  })
})
