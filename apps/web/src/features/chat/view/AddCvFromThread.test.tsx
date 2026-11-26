import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AddCvFromThread } from './AddCvFromThread'
import { ReplyFollowUpProvider } from './reply-follow-up'

/**
 * #AM.58 — « Ajouter un CV » depuis le fil de Laura. Le bouton ouvre le dépôt de CV EXISTANT (`CvDropZone`) en
 * surimpression : aucune navigation, aucun endpoint neuf. Terminé → le fil reçoit un message ; annulé → rien.
 */
const permissions = vi.hoisted(() => ({ current: { status: 'known', permissions: ['records:write'] } as unknown }))
const getConsultant = vi.hoisted(() => vi.fn())
const navigate = vi.hoisted(() => vi.fn())
const TALENT_ID = '3f1c2d4e-5a6b-4c7d-8e9f-0a1b2c3d4e5f'

vi.mock('@/lib/permissions', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/permissions')>()),
  useUserPermissions: () => permissions.current,
}))
vi.mock('@/features/consultants/api', () => ({ consultantsApi: { get: (id: string) => getConsultant(id) } }))
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => navigate }))
vi.mock('@/features/consultants/view/CvDropZone', () => ({
  CvDropZone: ({ onCreated }: { onCreated?: (id: string) => void }) => (
    <button type="button" onClick={() => onCreated?.(TALENT_ID)}>
      zone-de-depot
    </button>
  ),
}))

describe('AddCvFromThread (#AM.58)', () => {
  beforeEach(() => {
    permissions.current = { status: 'known', permissions: ['records:write'] }
    getConsultant.mockResolvedValue({ id: TALENT_ID, full_name: 'Nadia Benali' })
  })
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('le bouton ouvre le dépôt de CV en surimpression, sans naviguer', async () => {
    render(<AddCvFromThread />)
    expect(screen.queryByText('zone-de-depot')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Ajouter un CV' }))

    expect(await screen.findByText('zone-de-depot')).toBeInTheDocument()
    expect(navigate).not.toHaveBeenCalled()
  })

  it('import terminé : le fil reçoit le nom du consultant et l’identifiant en métadonnée', async () => {
    const send = vi.fn()
    render(
      <ReplyFollowUpProvider onSend={send}>
        <AddCvFromThread />
      </ReplyFollowUpProvider>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter un CV' }))
    await userEvent.click(await screen.findByText('zone-de-depot'))

    await waitFor(() => expect(send).toHaveBeenCalledTimes(1))
    const [message, ref] = send.mock.calls[0] as [string, { talentId: string }]
    expect(message).toContain('Nadia Benali')
    expect(ref).toEqual({ talentId: TALENT_ID })
    await waitFor(() => expect(screen.queryByText('zone-de-depot')).not.toBeInTheDocument())
    expect(navigate).not.toHaveBeenCalled()
  })

  it('nom illisible : le message ne contient aucun nom inventé, la relance part quand même', async () => {
    getConsultant.mockRejectedValue(new Error('boom'))
    const send = vi.fn()
    render(
      <ReplyFollowUpProvider onSend={send}>
        <AddCvFromThread />
      </ReplyFollowUpProvider>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter un CV' }))
    await userEvent.click(await screen.findByText('zone-de-depot'))

    await waitFor(() => expect(send).toHaveBeenCalledTimes(1))
    expect(send.mock.calls[0]?.[0]).not.toMatch(/undefined|null/)
  })

  it('annulé : rien n’est envoyé au fil, rien n’est lu', async () => {
    const send = vi.fn()
    render(
      <ReplyFollowUpProvider onSend={send}>
        <AddCvFromThread />
      </ReplyFollowUpProvider>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter un CV' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Fermer' }))

    await waitFor(() => expect(screen.queryByText('zone-de-depot')).not.toBeInTheDocument())
    expect(send).not.toHaveBeenCalled()
    expect(getConsultant).not.toHaveBeenCalled()
  })

  it('droits : sans `records:write` le bouton n’apparaît pas', () => {
    permissions.current = { status: 'known', permissions: ['data:export'] }
    render(<AddCvFromThread />)
    expect(screen.queryByRole('button', { name: 'Ajouter un CV' })).not.toBeInTheDocument()
  })

  it('droits : rôle encore inconnu ou lecture en erreur — pas de bouton non plus', () => {
    permissions.current = { status: 'unknown' }
    const { rerender } = render(<AddCvFromThread />)
    expect(screen.queryByRole('button', { name: 'Ajouter un CV' })).not.toBeInTheDocument()
    permissions.current = { status: 'error' }
    rerender(<AddCvFromThread />)
    expect(screen.queryByRole('button', { name: 'Ajouter un CV' })).not.toBeInTheDocument()
  })
})
