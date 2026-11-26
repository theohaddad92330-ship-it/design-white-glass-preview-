import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MissionInterruption } from '@bellum/contracts'

const interruption = vi.fn()
const mutate = vi.fn()
vi.mock('../api', () => ({
  useMissionInterruption: (_id: string, enabled: boolean) => (enabled ? interruption() : { data: undefined }),
  useMissionInterruptionAction: () => ({ mutate, isPending: false }),
}))

const { MissionInterruptionPanel } = await import('./MissionInterruptionPanel')

const ID = '11111111-1111-4111-8111-111111111111'

const declared = (over: Partial<MissionInterruption> = {}): MissionInterruption => ({
  id: 'int-1',
  missionId: ID,
  responsibility: 'client',
  risk: 'moyen',
  confidentialityAcknowledged: true,
  nonSolicitationAcknowledged: true,
  note: 'Le client a mis fin au contrat après un désaccord sur le périmètre.',
  availabilityConfirmed: false,
  availabilityConfirmedAt: null,
  availabilityConfirmedBy: null,
  declaredBy: 'u1',
  declaredAt: '2026-09-20T10:00:00Z',
  ...over,
})

beforeEach(() => {
  cleanup()
  interruption.mockReset()
  mutate.mockReset()
})

describe('MissionInterruptionPanel — #2414.54-59 (NO-GO, épopée #2986)', () => {
  it('ne s’affiche PAS hors du statut « terminated » (aucune lecture)', () => {
    interruption.mockReturnValue({ data: null })
    const { container } = render(<MissionInterruptionPanel missionId={ID} status="active" />)
    expect(container).toBeEmptyDOMElement()
    expect(interruption).not.toHaveBeenCalled()
  })

  it('aucune interruption déclarée : le formulaire exige les deux accusés et une note ≥ 20 caractères', async () => {
    interruption.mockReturnValue({ data: null })
    render(<MissionInterruptionPanel missionId={ID} status="terminated" />)
    const submit = screen.getByRole('button', { name: /déclarer l’interruption/i })
    expect(submit).toBeDisabled()

    await userEvent.type(screen.getByLabelText(/note/i), 'Le client a mis fin au contrat.')
    expect(submit).toBeDisabled() // les deux accusés manquent encore

    await userEvent.click(screen.getByRole('checkbox', { name: /confidentialité/i }))
    await userEvent.click(screen.getByRole('checkbox', { name: /non-sollicitation/i }))
    expect(submit).not.toBeDisabled()

    await userEvent.click(submit)
    expect(mutate).toHaveBeenCalledWith({
      action: 'declare',
      input: {
        responsibility: 'client',
        risk: 'faible',
        confidentialityAcknowledged: true,
        nonSolicitationAcknowledged: true,
        note: 'Le client a mis fin au contrat.',
      },
    })
  })

  it('#2414 NO-GO — une interruption déclarée et NON revalidée montre l’avertissement, jamais « disponible »', () => {
    interruption.mockReturnValue({ data: declared() })
    render(<MissionInterruptionPanel missionId={ID} status="terminated" />)
    expect(screen.getByText(/disponibilité non confirmée/i)).toBeInTheDocument()
    expect(screen.queryByText(/disponible/i, { selector: 'button' })).toBeNull()
    const confirm = screen.getByRole('button', { name: /confirmer la disponibilité/i })
    expect(confirm).toBeInTheDocument()
  })

  it('confirmer la disponibilité est un SECOND geste, distinct de la déclaration', async () => {
    interruption.mockReturnValue({ data: declared() })
    render(<MissionInterruptionPanel missionId={ID} status="terminated" />)
    await userEvent.click(screen.getByRole('button', { name: /confirmer la disponibilité/i }))
    expect(mutate).toHaveBeenCalledWith({ action: 'confirm_availability' })
  })

  it('une disponibilité déjà confirmée se dit, avec sa date — plus de bouton', () => {
    interruption.mockReturnValue({
      data: declared({ availabilityConfirmed: true, availabilityConfirmedAt: '2026-10-01T09:00:00Z' }),
    })
    render(<MissionInterruptionPanel missionId={ID} status="terminated" />)
    expect(screen.queryByRole('button', { name: /confirmer la disponibilité/i })).toBeNull()
    expect(screen.getByText(/disponibilité confirmée/i)).toBeInTheDocument()
  })
})
