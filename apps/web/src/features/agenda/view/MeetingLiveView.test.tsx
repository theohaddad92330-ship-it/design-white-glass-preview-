import type { MeetingBriefBlock } from '@bellum/contracts'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

/**
 * #2319.52-.56 — le mode « en rendez-vous » : brief, objectifs, questions en
 * checklist LOCALE, et la prise de notes EXISTANTE à côté.
 */

vi.mock('@/features/meeting-notes/view/MeetingNotesCard', () => ({
  MeetingNotesCard: ({ accountId }: { accountId: string }) => <div data-testid="notes-card">{accountId}</div>,
}))

const { MeetingLiveView } = await import('./MeetingLiveView')

const sourced = { kind: 'sourced', sources: ['crm'], observedAt: '2026-09-01T00:00:00.000Z' } as const
const brief: MeetingBriefBlock[] = [
  { index: 1, key: 'who', lines: ['Inès Morel — DSI'], note: null, ground: sourced, moreCount: 0, unknowns: [] },
  {
    index: 2,
    key: 'facts',
    lines: ['Effectif : 1 200', 'Secteur : logistique'],
    note: null,
    ground: sourced,
    moreCount: 0,
    unknowns: [],
  },
]
const questions = ['Qui décide du budget ?', 'Quel calendrier ?']

function renderLive(account: { id: string; companyName: string | null; website: string | null } | null) {
  return render(
    <MeetingLiveView
      brief={brief}
      stance="qualify_not_assume"
      outcomes={['Préciser le problème à résoudre.']}
      questions={questions}
      account={account}
    />,
  )
}

describe('MeetingLiveView — pendant le rendez-vous', () => {
  it('.52 / .56 — affiche le brief en bref et les objectifs', () => {
    renderLive(null)
    expect(screen.getByText('Inès Morel — DSI')).toBeTruthy()
    expect(screen.getByText('Effectif : 1 200')).toBeTruthy()
    // La première ligne seulement : on survole pendant, on lit avant.
    expect(screen.queryByText('Secteur : logistique')).toBeNull()
    expect(screen.getByText('Vérifier, pas supposer.')).toBeTruthy()
    expect(screen.getByText('Préciser le problème à résoudre.')).toBeTruthy()
  })

  it('.53 / .55 — les questions sont une checklist cochable, et le compte suit', () => {
    renderLive(null)
    const boxes = screen.getAllByRole('checkbox')
    expect(boxes).toHaveLength(2)
    expect(screen.getByText('0 sur 2 posées')).toBeTruthy()
    fireEvent.click(boxes[0]!)
    expect(screen.getByText('1 sur 2 posées')).toBeTruthy()
    fireEvent.click(boxes[0]!)
    expect(screen.getByText('0 sur 2 posées')).toBeTruthy()
  })

  it('.54 — la prise de notes est le module existant, branché sur le compte', () => {
    renderLive({ id: 'acc-1', companyName: 'Nova', website: null })
    expect(screen.getByTestId('notes-card').textContent).toBe('acc-1')
  })

  it('.54 — sans compte rattaché, le module ne s’ouvre pas et l’écran dit pourquoi', () => {
    renderLive(null)
    expect(screen.queryByTestId('notes-card')).toBeNull()
    expect(screen.getByText('Rattache ce rendez-vous à un compte pour structurer tes notes.')).toBeTruthy()
  })

  it('.57 — dit que rien n’est enregistré, et n’offre aucun micro', () => {
    const { container } = renderLive({ id: 'acc-1', companyName: 'Nova', website: null })
    expect(screen.getByText(/Rien n’est enregistré pendant le rendez-vous/)).toBeTruthy()
    expect(container.querySelector('input[type="file"]')).toBeNull()
  })

  it('mobile — une colonne sous 768 px, deux au-dessus', () => {
    renderLive(null)
    const grid = screen.getByTestId('meeting-live')
    expect(grid.className).toContain('grid-cols-1')
    expect(grid.className).toContain('md:grid-cols-2')
  })
})
