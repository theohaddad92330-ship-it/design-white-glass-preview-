import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import { useActiveWorkContextStore } from '../activeWorkContextStore'

let contextsStub: { isLoading: boolean; data: unknown }
const createMock = vi.fn().mockResolvedValue({
  context_id: 'wc-9',
  name: 'Automobile Brest',
  status: 'enregistre',
  visibility: 'personal',
  sectors: [],
})
const activateMock = vi.fn().mockResolvedValue({
  work_context: { context_id: 'wc-1', name: 'Cyber IDF' },
  conversation_id: 'conv-new',
})
const archiveMock = vi.fn().mockResolvedValue({})
const navigateMock = vi.fn()

vi.mock('../hooks', () => ({
  useWorkContexts: () => contextsStub,
  useCreateWorkContext: () => ({ mutateAsync: createMock, isPending: false }),
  useActivateWorkContext: () => ({ mutateAsync: activateMock, isPending: false }),
  useArchiveWorkContext: () => ({ mutateAsync: archiveMock, isPending: false }),
  // #2455.6 — aucune suggestion dans ces scénarios, hors périmètre de ce fichier.
  useWorkContextProfileSuggestion: () => ({ data: { suggestion: null } }),
}))

vi.mock('@/features/profile/hooks/useSaveEsnProfile', () => ({
  useSaveEsnProfile: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))

vi.mock('@tanstack/react-router', async importOriginal => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>()
  return { ...actual, useNavigate: () => navigateMock }
})

const { WorkContextsSection } = await import('./WorkContextsSection')

describe('WorkContextsSection', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
    contextsStub = { isLoading: false, data: { items: [] } }
    createMock.mockClear()
    activateMock.mockClear()
    navigateMock.mockClear()
    useActiveWorkContextStore.getState().clear()
  })

  it('shows the empty state rather than a fabricated context', () => {
    render(<WorkContextsSection />)
    expect(screen.getByText('Aucun contexte enregistré pour l’instant.')).toBeInTheDocument()
  })

  it('#2455.1 — creates a context without touching the main profile form', async () => {
    render(<WorkContextsSection />)
    fireEvent.click(screen.getByRole('button', { name: 'Créer une variante' }))
    fireEvent.change(screen.getByLabelText('Nom'), { target: { value: 'Automobile Brest' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    await waitFor(() => expect(createMock).toHaveBeenCalled())
    expect(createMock.mock.calls[0][0]).toMatchObject({ name: 'Automobile Brest', status: 'enregistre' })
  })

  it('#2455.5 — activating opens a NEW conversation and shows the active context', async () => {
    contextsStub = {
      isLoading: false,
      data: {
        items: [
          { context_id: 'wc-1', name: 'Cyber IDF', status: 'enregistre', visibility: 'personal', sectors: ['Cyber'] },
        ],
      },
    }
    render(<WorkContextsSection />)

    fireEvent.click(screen.getByRole('button', { name: 'Activer' }))

    await waitFor(() => expect(activateMock).toHaveBeenCalledWith('wc-1'))
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith({ to: '/chat', search: { new: '1' } }))
    expect(useActiveWorkContextStore.getState().active).toEqual({ id: 'wc-1', name: 'Cyber IDF' })
  })
})
