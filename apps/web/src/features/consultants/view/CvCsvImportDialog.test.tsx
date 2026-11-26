import { describe, expect, it, vi, beforeEach } from 'vitest'
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { CvCsvImportDialog } from './CvCsvImportDialog'
import { useCvCsvImport } from '../hooks'

vi.mock('../hooks', () => ({ useCvCsvImport: vi.fn() }))
// #2183.52-.55 — le rapport pose désormais `<CvImportNextSteps>`, qui pose
// `<AskLaura>` : même mock que ses autres appelants, la bulle a ses propres
// tests.
vi.mock('@/features/laura/bubble/laura-intro-store', async importOriginal => ({
  ...(await importOriginal<typeof import('@/features/laura/bubble/laura-intro-store')>()),
  useAskLauraIntro: () => false,
}))

/** `render` → `renderWithRouter` : `<CvImportNextSteps>` pose des `<Link>`, qui exigent un routeur. */
const render = renderWithRouter

/**
 * #2183.5 — le GESTE CSV dans le vivier.
 *
 * Ce que ces tests protègent :
 *  - le rapport dit COMBIEN sont entrées, combien sont des doublons, combien
 *    ont été écartées, et POURQUOI — jamais un compte muet ;
 *  - une colonne non reconnue est NOMMÉE, jamais silencieusement ignorée.
 */
function mockCsvImport(result: unknown, isPending = false) {
  const mutateAsync = vi.fn().mockResolvedValue(result)
  vi.mocked(useCvCsvImport).mockReturnValue({ mutateAsync, isPending } as unknown as ReturnType<typeof useCvCsvImport>)
  return mutateAsync
}

function pickCsv(name = 'lot.csv') {
  const file = new File(['Prénom,Nom\nClaire,Vasseur'], name, { type: 'text/csv' })
  const input = screen.getByLabelText('Choisir un fichier .csv')
  fireEvent.change(input, { target: { files: [file] } })
}

describe('CvCsvImportDialog', () => {
  beforeEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('montre le contrôle dans le vivier', async () => {
    mockCsvImport({ total: 0, summary: {}, outcomes: [], mappedColumns: {}, ignoredColumns: [], truncated: false })
    render(<CvCsvImportDialog />)

    fireEvent.click(await screen.findByRole('button', { name: 'Importer un CSV' }))

    expect(screen.getByRole('button', { name: 'Choisir un fichier .csv' })).toBeInTheDocument()
  })

  it('envoie le fichier et dit combien sont entrées, combien sont des doublons, combien écartées', async () => {
    const mutateAsync = mockCsvImport({
      total: 3,
      summary: { created: 1, duplicate: 1, skipped: 1 },
      outcomes: [
        { status: 'created', line: 2, consultantId: 'c1' },
        { status: 'duplicate', line: 3, matched: ['Claire Vasseur'] },
        { status: 'skipped', line: 4, reason: 'no_identity' },
      ],
      mappedColumns: { Prénom: 'firstName', Nom: 'lastName' },
      ignoredColumns: ['TJM cible'],
      truncated: false,
    })
    render(<CvCsvImportDialog />)
    fireEvent.click(await screen.findByRole('button', { name: 'Importer un CSV' }))

    pickCsv()

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith('Prénom,Nom\nClaire,Vasseur'))
    await waitFor(() => expect(screen.getByText(/1 créée/)).toBeInTheDocument())
    expect(screen.getByText(/1 déjà connue/)).toBeInTheDocument()
    // Un doublon NOMME la fiche à laquelle il ressemble.
    expect(screen.getByText(/Claire Vasseur/)).toBeInTheDocument()
    // Une colonne ignorée est NOMMÉE, jamais silencieuse.
    expect(screen.getByText(/TJM cible/)).toBeInTheDocument()
  })

  // #3781.1 (lot K11, 07/10) — une ligne qui reproduit une personne effacée
  // (RGPD art. 17) compte à part, ni « créée » ni confondue avec un doublon.
  it('une ligne EFFACÉE se DIT, distincte d’un doublon', async () => {
    mockCsvImport({
      total: 2,
      summary: { created: 1, duplicate: 0, skipped: 0, erased: 1 },
      outcomes: [
        { status: 'created', line: 2, consultantId: 'c1' },
        { status: 'erased', line: 3 },
      ],
      mappedColumns: { Prénom: 'firstName', Nom: 'lastName' },
      ignoredColumns: [],
      truncated: false,
    })
    render(<CvCsvImportDialog />)
    fireEvent.click(await screen.findByRole('button', { name: 'Importer un CSV' }))

    pickCsv()

    expect(await screen.findByText(/Ligne 3 — effacée/)).toBeInTheDocument()
  })

  it('un échec de la requête elle-même se DIT, jamais un OK silencieux', async () => {
    const mutateAsync = vi.fn().mockRejectedValue(new Error('Fichier illisible.'))
    vi.mocked(useCvCsvImport).mockReturnValue({ mutateAsync, isPending: false } as unknown as ReturnType<
      typeof useCvCsvImport
    >)
    render(<CvCsvImportDialog />)
    fireEvent.click(await screen.findByRole('button', { name: 'Importer un CSV' }))

    pickCsv('corrompu.csv')

    await waitFor(() => expect(mutateAsync).toHaveBeenCalled())
    expect(await screen.findByText('Fichier illisible.')).toBeInTheDocument()
  })
})
