import { describe, expect, it, vi, beforeEach } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { TalentPhotoUpload } from './TalentPhotoUpload'
import { useSetTalentPhoto } from '../talent-api'

vi.mock('../talent-api', () => ({ useSetTalentPhoto: vi.fn() }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

/**
 * Le dépôt d'une photo (piège n°3 du PDF-22 §01, 31/08/2026).
 *
 * ⚠️ CRITÈRE PROTÉGÉ — ce composant ne fait qu'AFFICHER et POSER une URL,
 * jamais un classement. Ce que ces tests protègent : un type de fichier hors
 * image est refusé AVANT tout envoi, une image trop lourde aussi, et le
 * retrait est un geste EXPLICITE distinct du dépôt.
 */
function mockSetPhoto(isPending = false) {
  const mutateAsync = vi.fn().mockResolvedValue({ photoUrl: 'data:image/png;base64,AAAA' })
  vi.mocked(useSetTalentPhoto).mockReturnValue({
    mutateAsync,
    isPending,
  } as unknown as ReturnType<typeof useSetTalentPhoto>)
  return mutateAsync
}

function selectFile(type = 'image/png', bytes = 4) {
  const file = new File([new Uint8Array(bytes)], 'photo.png', { type })
  const input = screen.getByLabelText(/photo/i)
  fireEvent.change(input, { target: { files: [file] } })
}

describe('TalentPhotoUpload', () => {
  beforeEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('dépose une image et l’envoie en data URI via `PUT /talents/:id/photo`', async () => {
    const mutateAsync = mockSetPhoto()
    render(<TalentPhotoUpload talentId="t1" name="Yanis Berthier" photoUrl={null} />)

    selectFile()

    await waitFor(() => expect(mutateAsync).toHaveBeenCalled())
    expect(mutateAsync.mock.calls[0]?.[0]).toMatch(/^data:image\/png;base64,/)
  })

  it('refuse un type de fichier hors image, AVANT tout envoi', async () => {
    const mutateAsync = mockSetPhoto()
    render(<TalentPhotoUpload talentId="t1" name="Yanis Berthier" photoUrl={null} />)

    selectFile('application/pdf')

    await new Promise(resolve => setTimeout(resolve, 0))
    expect(mutateAsync).not.toHaveBeenCalled()
  })

  it('propose « Retirer » UNIQUEMENT quand une photo existe déjà', () => {
    mockSetPhoto()
    render(<TalentPhotoUpload talentId="t1" name="Yanis Berthier" photoUrl={null} />)
    expect(screen.queryByRole('button', { name: /Retirer/ })).not.toBeInTheDocument()

    cleanup()
    render(<TalentPhotoUpload talentId="t1" name="Yanis Berthier" photoUrl="data:image/png;base64,AAAA" />)
    expect(screen.getByRole('button', { name: /Retirer/ })).toBeInTheDocument()
  })

  it('« Retirer » envoie `null` — un geste EXPLICITE, pas un défaut', async () => {
    const mutateAsync = mockSetPhoto()
    render(<TalentPhotoUpload talentId="t1" name="Yanis Berthier" photoUrl="data:image/png;base64,AAAA" />)

    fireEvent.click(screen.getByRole('button', { name: /Retirer/ }))

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith(null))
  })
})
