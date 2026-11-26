import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'

let suggestionStub: { data: unknown }
const saveMock = vi.fn().mockResolvedValue({ target_sectors: ['Automobile'] })

vi.mock('../hooks', () => ({
  useWorkContextProfileSuggestion: () => suggestionStub,
}))

vi.mock('@/features/profile/hooks/useSaveEsnProfile', () => ({
  useSaveEsnProfile: () => ({ mutateAsync: saveMock, isPending: false }),
}))

const { ProfileUpdateSuggestion } = await import('./ProfileUpdateSuggestion')

describe('ProfileUpdateSuggestion', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
    suggestionStub = { data: { suggestion: null } }
    saveMock.mockClear()
  })

  it('#2455.6 — renders nothing and writes nothing when there is no suggestion', () => {
    render(<ProfileUpdateSuggestion contextId="wc-1" />)
    expect(screen.queryByText(/Suggestion/i)).not.toBeInTheDocument()
    expect(saveMock).not.toHaveBeenCalled()
  })

  it('#2455.6 — shows the diff but NEVER writes it without an explicit click', async () => {
    suggestionStub = {
      data: { suggestion: { field: 'target_sectors', current: ['Cyber'], suggested: ['Automobile', 'Cyber'] } },
    }
    render(<ProfileUpdateSuggestion contextId="wc-1" />)

    expect(await screen.findByText('Cyber')).toBeInTheDocument()
    expect(screen.getByText('Automobile, Cyber')).toBeInTheDocument()
    // le montage seul n'écrit jamais — aucune écriture sans le clic explicite
    expect(saveMock).not.toHaveBeenCalled()
  })

  it('#2455.6 — « Appliquer » écrit le profil sur clic explicite, une seule fois', async () => {
    suggestionStub = {
      data: { suggestion: { field: 'target_sectors', current: ['Cyber'], suggested: ['Automobile', 'Cyber'] } },
    }
    render(<ProfileUpdateSuggestion contextId="wc-1" />)

    fireEvent.click(screen.getByRole('button', { name: 'Appliquer' }))

    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(1))
    expect(saveMock).toHaveBeenCalledWith({ target_sectors: ['Automobile', 'Cyber'] })
  })

  it('#2455.6 — « Ignorer » masque la proposition SANS écrire le profil', () => {
    suggestionStub = {
      data: { suggestion: { field: 'target_sectors', current: ['Cyber'], suggested: ['Automobile', 'Cyber'] } },
    }
    render(<ProfileUpdateSuggestion contextId="wc-1" />)

    fireEvent.click(screen.getByRole('button', { name: 'Ignorer' }))

    expect(screen.queryByText('Automobile, Cyber')).not.toBeInTheDocument()
    expect(saveMock).not.toHaveBeenCalled()
  })
})
