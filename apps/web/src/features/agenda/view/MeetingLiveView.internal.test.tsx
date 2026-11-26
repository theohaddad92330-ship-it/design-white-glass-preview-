import type { MeetingBriefBlock } from '@bellum/contracts'
import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

/**
 * #2103.31 — CAS LIMITE, RDV INTERNE : `MeetingLiveView` REÇOIT le fait
 * (calculé par son appelant, `MeetingPrepDialog`, via `deriveMeetingType`) et
 * le RELAIE tel quel jusqu'à `MeetingNotesCard`, jamais une seconde
 * dérivation. Même patron que `MeetingLiveView.test.tsx` (mock local de
 * `MeetingNotesCard`), mais celui-ci capture `isInternalMeeting`.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let capturedNotesCardProps: any

vi.mock('@/features/meeting-notes/view/MeetingNotesCard', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  MeetingNotesCard: (props: any) => {
    capturedNotesCardProps = props
    return null
  },
}))

const { MeetingLiveView } = await import('./MeetingLiveView')

const sourced = { kind: 'sourced', sources: ['crm'], observedAt: '2026-09-01T00:00:00.000Z' } as const
const brief: MeetingBriefBlock[] = [
  { index: 1, key: 'who', lines: ['Inès Morel — DSI'], note: null, ground: sourced, moreCount: 0, unknowns: [] },
]

describe('MeetingLiveView — #2103.31 : relaie isInternalMeeting jusqu’à la prise de notes', () => {
  it('rendez-vous interne : transmis tel quel à MeetingNotesCard', () => {
    render(
      <MeetingLiveView
        brief={brief}
        stance={null}
        outcomes={[]}
        questions={[]}
        account={{ id: 'acc-1', companyName: 'Acme', website: null }}
        isInternalMeeting
      />,
    )
    expect(capturedNotesCardProps.isInternalMeeting).toBe(true)
  })

  it('sans le prop (défaut) : rien de forcé, comportement inchangé', () => {
    render(
      <MeetingLiveView
        brief={brief}
        stance={null}
        outcomes={[]}
        questions={[]}
        account={{ id: 'acc-1', companyName: 'Acme', website: null }}
      />,
    )
    expect(capturedNotesCardProps.isInternalMeeting).toBeFalsy()
  })
})
