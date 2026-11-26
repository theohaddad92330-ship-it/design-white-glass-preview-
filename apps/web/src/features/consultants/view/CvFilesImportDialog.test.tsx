import { describe, expect, it, vi, beforeEach } from 'vitest'
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { CvZipImportDialog } from './CvZipImportDialog'
import {
  useCvBatchImportJobStatus,
  useCvFilesImportJob,
  useCvFilesManifest,
  useCvZipImportJob,
  useCvZipLargeImport,
  useCvZipManifest,
} from '../hooks'

vi.mock('../hooks', () => ({
  useCvZipImportJob: vi.fn(),
  useCvZipManifest: vi.fn(),
  useCvZipLargeImport: vi.fn(),
  useCvFilesImportJob: vi.fn(),
  useCvFilesManifest: vi.fn(),
  useCvBatchImportJobStatus: vi.fn(),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/features/laura/bubble/laura-intro-store', async importOriginal => ({
  ...(await importOriginal<typeof import('@/features/laura/bubble/laura-intro-store')>()),
  useAskLauraIntro: () => false,
}))

const render = renderWithRouter

/**
 * #2326.6 (épopée #2794) — un DOSSIER entier de CV, hors d'une archive ZIP.
 *
 * Même pipeline que le ZIP (#2569.1) — décision automatique, manifeste AVANT
 * tout envoi, confirmation explicite — mais la SOURCE des octets change : un
 * dossier choisi via `webkitdirectory`, pas une archive à dépaqueter. Ces
 * tests protègent le point que le ZIP protège déjà, pour cette source-ci :
 * aucune écriture avant confirmation, et le rapport dit COMBIEN et POURQUOI.
 *
 * #2326.12 (LOT r5 26/09) — la confirmation dépose désormais un JOB
 * (`useCvFilesImportJob`) et l'écran SUIT sa progression
 * (`useCvBatchImportJobStatus`), même patron que `CvZipImportDialog.test.tsx` :
 * `mockFilesImportJob` fait comme si le job passait IMMÉDIATEMENT à `done`,
 * pour garder les assertions sur le rapport final inchangées.
 */
function mockJobStatus(state: unknown) {
  vi.mocked(useCvBatchImportJobStatus).mockImplementation(
    (jobId: string | null) =>
      ({ data: jobId ? state : undefined }) as unknown as ReturnType<typeof useCvBatchImportJobStatus>,
  )
}

function idleZipHooks() {
  vi.mocked(useCvZipManifest).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as unknown as ReturnType<
    typeof useCvZipManifest
  >)
  vi.mocked(useCvZipImportJob).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as unknown as ReturnType<
    typeof useCvZipImportJob
  >)
  vi.mocked(useCvZipLargeImport).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as unknown as ReturnType<
    typeof useCvZipLargeImport
  >)
  mockJobStatus(undefined)
}

function mockFilesImportJob(
  result: { total: number; summary: Record<string, number>; outcomes: unknown[] },
  isPending = false,
) {
  const mutateAsync = vi.fn().mockResolvedValue({ jobId: 'job-1', total: result.total })
  vi.mocked(useCvFilesImportJob).mockReturnValue({ mutateAsync, isPending } as unknown as ReturnType<
    typeof useCvFilesImportJob
  >)
  mockJobStatus({ id: 'job-1', status: 'done', processed: result.total, error: null, ...result })
  return mutateAsync
}

function mockFilesManifest(result: unknown = { totalFiles: 1, duplicateFiles: 0 }) {
  const mutateAsync = vi.fn().mockResolvedValue(result)
  vi.mocked(useCvFilesManifest).mockReturnValue({ mutateAsync, isPending: false } as unknown as ReturnType<
    typeof useCvFilesManifest
  >)
  return mutateAsync
}

function pickFolder(files: File[]) {
  const input = screen.getByLabelText('Choisir un dossier')
  fireEvent.change(input, { target: { files } })
}

async function pickFolderAndConfirm(files: File[]) {
  pickFolder(files)
  fireEvent.click(await screen.findByRole('button', { name: 'Confirmer l’import' }))
}

describe('CvZipImportDialog — la source DOSSIER (#2326.6)', () => {
  beforeEach(() => {
    cleanup()
    vi.clearAllMocks()
    idleZipHooks()
  })

  it('écarte les fichiers non-CV du dossier (`.DS_Store`, tableurs…) — jamais comptés comme des échecs', async () => {
    mockFilesImportJob({ total: 0, summary: {}, outcomes: [] })
    const manifestMutate = mockFilesManifest({ totalFiles: 1, duplicateFiles: 0 })
    render(<CvZipImportDialog />)
    fireEvent.click(await screen.findByRole('button', { name: 'Importer une archive ZIP' }))

    pickFolder([
      new File(['x'], '.DS_Store', { type: 'application/octet-stream' }),
      new File(['Jean Dupont'], 'jean.pdf', { type: 'application/pdf' }),
    ])

    await waitFor(() =>
      expect(manifestMutate).toHaveBeenCalledWith({
        files: [{ filename: 'jean.pdf', fileB64: expect.any(String) }],
      }),
    )
  })

  it('un dossier sans aucun CV reconnu le DIT — jamais un envoi vide silencieux', async () => {
    mockFilesImportJob({ total: 0, summary: {}, outcomes: [] })
    const manifestMutate = mockFilesManifest()
    render(<CvZipImportDialog />)
    fireEvent.click(await screen.findByRole('button', { name: 'Importer une archive ZIP' }))

    pickFolder([new File(['x'], '.DS_Store', { type: 'application/octet-stream' })])

    expect(await screen.findByText(/aucun CV reconnu/)).toBeInTheDocument()
    expect(manifestMutate).not.toHaveBeenCalled()
  })

  it('dit le nombre de fichiers AVANT tout envoi, et attend une confirmation', async () => {
    mockFilesImportJob({ total: 0, summary: {}, outcomes: [] })
    mockFilesManifest({ totalFiles: 2, duplicateFiles: 0 })
    render(<CvZipImportDialog />)
    fireEvent.click(await screen.findByRole('button', { name: 'Importer une archive ZIP' }))

    pickFolder([
      new File(['Jean Dupont'], 'jean.pdf', { type: 'application/pdf' }),
      new File(['Marie Martin'], 'marie.pdf', { type: 'application/pdf' }),
    ])

    expect(await screen.findByText(/2 fichier/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirmer l’import' })).toBeInTheDocument()
  })

  it('envoie le dossier et dit combien sont entrées, combien ont échoué, et pourquoi', async () => {
    const mutateAsync = mockFilesImportJob({
      total: 2,
      summary: { created: 1, auto_updated: 0, exception: 0, too_big: 0, failed: 1 },
      outcomes: [
        { status: 'created', file: 'jean.pdf', consultantId: 'c1' },
        { status: 'failed', file: 'corrompu.pdf', reason: 'Format illisible' },
      ],
    })
    mockFilesManifest()
    render(<CvZipImportDialog />)
    fireEvent.click(await screen.findByRole('button', { name: 'Importer une archive ZIP' }))

    await pickFolderAndConfirm([
      new File(['Jean Dupont'], 'jean.pdf', { type: 'application/pdf' }),
      new File(['x'], 'corrompu.pdf', { type: 'application/pdf' }),
    ])

    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({
        files: [
          { filename: 'jean.pdf', fileB64: expect.any(String) },
          { filename: 'corrompu.pdf', fileB64: expect.any(String) },
        ],
      }),
    )
    await waitFor(() => expect(screen.getByText(/1 créée/)).toBeInTheDocument())
    expect(screen.getByText(/corrompu\.pdf.*Format illisible/)).toBeInTheDocument()
  })
})
