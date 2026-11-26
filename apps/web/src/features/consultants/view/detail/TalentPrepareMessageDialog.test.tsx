import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api-error'
import { TalentPrepareMessageDialog } from './TalentPrepareMessageDialog'

const draftMessage = vi.fn()
const prepareMessage = vi.fn()
vi.mock('../../talent-api', () => ({
  useTalentPreparedMessages: () => ({ data: [] }),
  usePrepareTalentMessage: () => ({ mutateAsync: (...a: unknown[]) => prepareMessage(...a), isPending: false }),
  useDraftTalentMessage: () => ({ mutateAsync: (...a: unknown[]) => draftMessage(...a) }),
}))

const DRAFT = {
  subject: 'Mission Java — SNCF',
  body: 'Bonjour Sophie, une mission de tech lead Java démarre le 16/11.',
  basis: { consultant: 'Sophie', need: 'Tech lead Java', client: 'SNCF' },
  objective: 'propose_mission',
}

function open(props: { initialBody?: string } = {}) {
  return render(
    <TalentPrepareMessageDialog
      talentId="t1"
      talentName="Sophie Martin"
      open
      onOpenChange={vi.fn()}
      initialBody={props.initialBody}
    />,
  )
}

// #4347 — « Préparer un message » s'ouvre DÉJÀ RÉDIGÉ par Laura : objet et corps pré-remplis, éditables.
describe('TalentPrepareMessageDialog — rédigé à l’ouverture (#4347)', () => {
  beforeEach(() => {
    draftMessage.mockReset()
    prepareMessage.mockReset()
  })

  it('demande la rédaction à l’ouverture et pré-remplit l’objet et le corps, éditables', async () => {
    draftMessage.mockResolvedValue(DRAFT)
    open()

    await waitFor(() => expect(screen.getByDisplayValue('Mission Java — SNCF')).toBeInTheDocument())
    expect(draftMessage).toHaveBeenCalledTimes(1)
    expect(draftMessage).toHaveBeenCalledWith({ channel: 'email' })
    const body = screen.getByDisplayValue(DRAFT.body) as HTMLTextAreaElement
    fireEvent.change(body, { target: { value: 'Ma version' } })
    expect(screen.getByDisplayValue('Ma version')).toBeInTheDocument()
  })

  it('dit sur quoi Laura s’est appuyée — mention discrète', async () => {
    draftMessage.mockResolvedValue(DRAFT)
    open()

    expect(await screen.findByText(/Rédigé par Laura à partir de/)).toHaveTextContent('Sophie')
    expect(screen.getByText(/Rédigé par Laura à partir de/)).toHaveTextContent('Tech lead Java')
    expect(screen.getByText(/Rédigé par Laura à partir de/)).toHaveTextContent('SNCF')
  })

  it('échec : l’erreur est dite, les champs restent VIDES — aucun texte inventé côté client', async () => {
    draftMessage.mockRejectedValue(
      new ApiError('La rédaction a échoué. Réessaie dans un instant.', 502, 'talent_message_failed'),
    )
    open()

    expect(await screen.findByRole('alert')).toHaveTextContent('La rédaction a échoué')
    expect((screen.getByLabelText('Message') as HTMLTextAreaElement).value).toBe('')
    expect((screen.getByLabelText('Objet') as HTMLInputElement).value).toBe('')
  })

  it('« Plus court » et « Plus direct » renvoient le texte courant avec la variante', async () => {
    draftMessage.mockResolvedValueOnce(DRAFT).mockResolvedValueOnce({ ...DRAFT, body: 'Version courte.' })
    open()
    await screen.findByDisplayValue(DRAFT.body)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Plus court' }))
    })

    await waitFor(() => expect(screen.getByDisplayValue('Version courte.')).toBeInTheDocument())
    expect(draftMessage).toHaveBeenLastCalledWith({ channel: 'email', variant: 'shorter', previousBody: DRAFT.body })
    expect(screen.getByRole('button', { name: 'Plus direct' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Régénérer' })).toBeInTheDocument()
  })

  it('un brouillon suggéré (revalidation) est gardé : pas de rédaction automatique par-dessus', async () => {
    open({ initialBody: 'Peux-tu confirmer ton TJM ?' })

    expect(screen.getByDisplayValue('Peux-tu confirmer ton TJM ?')).toBeInTheDocument()
    await act(async () => {})
    expect(draftMessage).not.toHaveBeenCalled()
  })

  it('changer de canal redemande une rédaction pour ce canal', async () => {
    draftMessage.mockResolvedValue(DRAFT)
    open()
    await screen.findByDisplayValue(DRAFT.body)

    await act(async () => {
      fireEvent.click(screen.getByRole('combobox'))
    })
    await act(async () => {
      fireEvent.click(await screen.findByRole('option', { name: 'Réseau professionnel' }))
    })

    await waitFor(() => expect(draftMessage).toHaveBeenLastCalledWith({ channel: 'linkedin' }))
  })

  // #4347.3 — l'objectif est DÉDUIT, affiché en tête, modifiable en un clic ; un nouvel objectif = un nouveau brouillon.
  it('affiche l’objectif déduit en tête : un besoin qui matche → proposer une mission', async () => {
    draftMessage.mockResolvedValue(DRAFT)
    open()
    expect(await screen.findByTestId('talent-message-objective')).toHaveTextContent('Proposer une mission')
  })

  it('sans besoin qui matche → revalider sa disponibilité', async () => {
    draftMessage.mockResolvedValue({
      ...DRAFT,
      objective: 'revalidate_availability',
      basis: { ...DRAFT.basis, need: null },
    })
    open()
    expect(await screen.findByTestId('talent-message-objective')).toHaveTextContent('Revalider sa disponibilité')
  })

  it('changer d’objectif en un clic redemande un brouillon pour CET objectif', async () => {
    draftMessage
      .mockResolvedValueOnce(DRAFT)
      .mockResolvedValueOnce({ ...DRAFT, objective: 'revalidate_availability', body: 'Toujours disponible ?' })
    open()
    await screen.findByDisplayValue(DRAFT.body)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Revalider sa disponibilité' }))
    })

    await waitFor(() => expect(screen.getByDisplayValue('Toujours disponible ?')).toBeInTheDocument())
    expect(draftMessage).toHaveBeenLastCalledWith({ channel: 'email', objective: 'revalidate_availability' })
    expect(screen.getByTestId('talent-message-objective')).toHaveTextContent('Revalider sa disponibilité')
  })
})
