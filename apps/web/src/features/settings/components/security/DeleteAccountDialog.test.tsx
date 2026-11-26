/**
 * #1939 — l'effacement de compte DIT ce qu'il a fait de la voix (décision du
 * 12/09 : « tout effacer tout de suite »). Le serveur rend `voiceMessages` ;
 * l'écran l'affiche, et ne dit rien quand il n'y a rien — ou quand une API
 * antérieure au champ ne le sert pas (jamais « 0 enregistrement »).
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DeletionSummary } from '@/features/settings/lib/privacy-api'
import { DeleteAccountDialog } from './DeleteAccountDialog'

const mutateAsync = vi.hoisted(() => vi.fn())
vi.mock('@/features/settings/hooks/useDeletePrivacyAccount', () => ({
  useDeletePrivacyAccount: () => ({ mutateAsync, isPending: false }),
}))
const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock('sonner', () => ({ toast: toastMock }))

const BASE: DeletionSummary = {
  anonymized: { profile: true, contacts: 2, ragDocuments: 1 },
  sessionsRevoked: 1,
  subscriptionCanceled: false,
  retained: [],
}

async function confirmDeletion() {
  render(<DeleteAccountDialog open onOpenChange={vi.fn()} />)
  fireEvent.change(screen.getByLabelText('Confirmation de suppression'), { target: { value: 'SUPPRIMER' } })
  fireEvent.click(screen.getByRole('button', { name: 'Supprimer définitivement' }))
  await waitFor(() => expect(toastMock.success).toHaveBeenCalled())
}

beforeEach(() => {
  mutateAsync.mockReset()
  toastMock.success.mockReset()
  toastMock.error.mockReset()
})

describe('#1939 — l’effacement dit ce qu’il a fait des enregistrements vocaux', () => {
  it('enregistrements effacés : le nombre est dit', async () => {
    mutateAsync.mockResolvedValue({ ...BASE, voiceMessages: { erased: 3, deferredToNextPurge: 0 } })
    await confirmDeletion()
    expect(toastMock.success).toHaveBeenCalledWith('Ton compte a été supprimé.', {
      description: '3 enregistrements vocaux effacés.',
    })
  })

  it('effacement reporté à la purge de la nuit : dit, sans prétendre avoir effacé', async () => {
    mutateAsync.mockResolvedValue({ ...BASE, voiceMessages: { erased: 1, deferredToNextPurge: 2 } })
    await confirmDeletion()
    expect(toastMock.success).toHaveBeenCalledWith('Ton compte a été supprimé.', {
      description: '1 enregistrement vocal effacé. 2 enregistrements vocaux seront effacés à la purge de cette nuit.',
    })
  })

  it('aucun enregistrement vocal : rien d’ajouté — jamais « 0 enregistrement »', async () => {
    mutateAsync.mockResolvedValue({ ...BASE, voiceMessages: { erased: 0, deferredToNextPurge: 0 } })
    await confirmDeletion()
    expect(toastMock.success).toHaveBeenCalledWith('Ton compte a été supprimé.', undefined)
  })

  it('API antérieure au champ : rien d’ajouté, et l’écran ne tombe pas', async () => {
    mutateAsync.mockResolvedValue(BASE)
    await confirmDeletion()
    expect(toastMock.success).toHaveBeenCalledWith('Ton compte a été supprimé.', undefined)
  })
})
