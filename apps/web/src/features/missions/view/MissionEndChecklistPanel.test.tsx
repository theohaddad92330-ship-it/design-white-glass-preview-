import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { computeMissionEndChecklist, type MissionEndCheckKey, type MissionEndChecklist } from '@bellum/contracts'

const checklist = vi.fn()
const mutate = vi.fn()
vi.mock('../api', () => ({
  useMissionEndChecklist: (_id: string, enabled: boolean) => (enabled ? checklist() : { data: undefined }),
  useMissionEndCheck: () => ({ mutate, isPending: false }),
}))

const { MissionEndChecklistPanel } = await import('./MissionEndChecklistPanel')

const ID = '11111111-1111-4111-8111-111111111111'
const state = (declared: Parameters<typeof computeMissionEndChecklist>[0]['declared'] = []): MissionEndChecklist =>
  computeMissionEndChecklist({ declared })

beforeEach(() => {
  cleanup()
  checklist.mockReset()
  mutate.mockReset()
})

describe('MissionEndChecklistPanel — #2414.11-33 (épopée #2986)', () => {
  it('rien de coché : « Pas commencée », chacun des 13 items est NOMMÉ une seule fois (#2953)', () => {
    checklist.mockReturnValue({ data: state() })
    render(<MissionEndChecklistPanel missionId={ID} status="ending" />)
    expect(screen.getByText('Pas commencée')).toBeInTheDocument()
    // Les 13 lignes sont le détail : aucune phrase ne les relit en plus.
    expect(screen.queryByTestId('end-missing')).toBeNull()
    expect(screen.queryByText(/Il manque encore/)).toBeNull()
    expect(screen.getAllByTestId(/^end-item-/)).toHaveLength(13)
    for (const label of ['Passation', 'TJM', 'Matériel']) {
      expect(screen.getAllByText(label)).toHaveLength(1)
    }
  })

  it('un geste déclaré montre sa note et se retire', async () => {
    checklist.mockReturnValue({
      data: state([
        { key: 'client_handover', confirmedAt: '2026-09-20T10:00:00Z', confirmedBy: 'u1', note: 'transmis le 20/09' },
      ]),
    })
    render(<MissionEndChecklistPanel missionId={ID} status="ending" />)
    const row = screen.getByTestId('end-item-client_handover')
    expect(row).toHaveTextContent('transmis le 20/09')
    await userEvent.click(within(row).getByRole('button', { name: /Retirer/ }))
    expect(mutate).toHaveBeenCalledWith({ action: 'withdraw', item: 'client_handover' })
  })

  it('cocher un item exige une note : le bouton reste inerte tant qu’elle est vide', async () => {
    checklist.mockReturnValue({ data: state() })
    render(<MissionEndChecklistPanel missionId={ID} status="ending" />)
    const row = screen.getByTestId('end-item-consultant_consent')
    await userEvent.click(within(row).getByRole('button', { name: /Confirmer/ }))
    const save = within(row).getByRole('button', { name: /Enregistrer/ })
    expect(save).toBeDisabled()
    await userEvent.type(within(row).getByRole('textbox'), 'Consentement recueilli le 22/09')
    await userEvent.click(save)
    expect(mutate).toHaveBeenCalledWith({
      action: 'confirm',
      input: { item: 'consultant_consent', note: 'Consentement recueilli le 22/09' },
    })
  })

  it('tout coché → « Complète »', () => {
    checklist.mockReturnValue({
      data: state(
        (
          [
            'client_handover',
            'client_documents',
            'client_payment',
            'consultant_mobility',
            'consultant_daily_rate',
            'consultant_preferences',
            'consultant_cv_updated',
            'consultant_consent',
            'consultant_other_processes',
            'internal_actions',
            'internal_references',
            'internal_equipment',
            'internal_documents',
          ] satisfies MissionEndCheckKey[]
        ).map(key => ({
          key,
          confirmedAt: '2026-09-20T10:00:00Z',
          confirmedBy: 'u1',
          note: 'fait',
        })),
      ),
    })
    render(<MissionEndChecklistPanel missionId={ID} status="ending" />)
    expect(screen.getByText('Complète')).toBeInTheDocument()
    expect(screen.queryByTestId('end-missing')).toBeNull()
  })

  it('ne s’affiche PAS avant démarrage (aucune lecture) — la sortie n’a pas de sens sur une mission qui n’a pas commencé', () => {
    checklist.mockReturnValue({ data: state() })
    const { container } = render(<MissionEndChecklistPanel missionId={ID} status="draft" />)
    expect(container).toBeEmptyDOMElement()
    expect(checklist).not.toHaveBeenCalled()
  })
})
