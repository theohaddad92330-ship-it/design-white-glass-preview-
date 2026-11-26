import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi } from 'vitest'
import { MessageStyleImportTab } from './MessageStyleImportTab'

/**
 * #2369.2/.3/.4/.5 (épopée #2768, LOT SOIR 26/09) — premier écran de la
 * mémoire de style : importer, analyser, restituer « je conserve / je ne
 * reproduis pas / je propose ». Ces tests défendent l'écran, pas l'analyse
 * (déterministe, testée dans `@bellum/contracts`) ni le service (testé côté
 * `apps/api`).
 */
const { useMessageStyleImportMock } = vi.hoisted(() => ({ useMessageStyleImportMock: vi.fn() }))
vi.mock('@/features/message-style/hooks/useMessageStyleImport', () => ({
  useMessageStyleImport: useMessageStyleImportMock,
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

describe('MessageStyleImportTab', () => {
  it('désactive « Analyser » tant qu’aucun texte n’est collé', () => {
    useMessageStyleImportMock.mockReturnValue({ mutateAsync: vi.fn(), isPending: false })
    render(<MessageStyleImportTab />)
    expect(screen.getByRole('button', { name: 'Analyser' })).toBeDisabled()
  })

  it('importe le texte collé avec la nature et la source choisies par défaut', async () => {
    const mutateAsync = vi.fn().mockResolvedValue({ importId: 'imp-1', conserve: [], neReproduitPas: [], propose: [] })
    useMessageStyleImportMock.mockReturnValue({ mutateAsync, isPending: false })
    render(<MessageStyleImportTab />)

    fireEvent.change(screen.getByLabelText('Message à analyser'), {
      target: { value: 'Bonjour Julien, ravi de vous contacter.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Analyser' }))

    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({
        importKind: 'email',
        sourceType: 'sent_message',
        rawText: 'Bonjour Julien, ravi de vous contacter.',
      }),
    )
  })

  it('restitue les trois volets, et cache un volet vide (on n’affiche pas ce qu’on n’a pas)', async () => {
    const mutateAsync = vi.fn().mockResolvedValue({
      importId: 'imp-2',
      conserve: ['longueur : message court (6 mots)'],
      neReproduitPas: ['ton agressif isolé détecté — jamais appris (#2369.13)'],
      propose: [],
    })
    useMessageStyleImportMock.mockReturnValue({ mutateAsync, isPending: false })
    render(<MessageStyleImportTab />)

    fireEvent.change(screen.getByLabelText('Message à analyser'), {
      target: { value: 'Dernière chance !!! Agissez maintenant !!!' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Analyser' }))

    expect(await screen.findByText('longueur : message court (6 mots)')).toBeInTheDocument()
    expect(screen.getByText('ton agressif isolé détecté — jamais appris (#2369.13)')).toBeInTheDocument()
    expect(screen.getByText('Ce que je conserve')).toBeInTheDocument()
    expect(screen.getByText('Ce que je ne reproduis pas')).toBeInTheDocument()
    // « je propose » est vide sur ce cas : AUCUNE ligne, pas même le titre du volet.
    expect(screen.queryByText('Ce que je propose')).not.toBeInTheDocument()
  })

  it('restitue une proposition avec son observation', async () => {
    const mutateAsync = vi.fn().mockResolvedValue({
      importId: 'imp-3',
      conserve: ['longueur : message court (5 mots)'],
      neReproduitPas: [],
      propose: [
        {
          id: 'prop-1',
          workspaceId: 'ws-1',
          templateId: null,
          proposedBy: 'user-1',
          signal: 'structure_preference',
          observation: 'Formule d’ouverture identifiée, proposée comme règle de structure.',
          status: 'pending',
          decidedBy: null,
          decidedAt: null,
          createdAt: '2026-09-26T00:00:00.000Z',
        },
      ],
    })
    useMessageStyleImportMock.mockReturnValue({ mutateAsync, isPending: false })
    render(<MessageStyleImportTab />)

    fireEvent.change(screen.getByLabelText('Message à analyser'), {
      target: { value: 'Bonjour Julien,\nCordialement,' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Analyser' }))

    expect(await screen.findByText('Ce que je propose')).toBeInTheDocument()
    expect(screen.getByText('Formule d’ouverture identifiée, proposée comme règle de structure.')).toBeInTheDocument()
    // « je ne reproduis pas » est vide sur ce cas : AUCUNE ligne, pas même le titre.
    expect(screen.queryByText('Ce que je ne reproduis pas')).not.toBeInTheDocument()
  })
})
