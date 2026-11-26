import { describe, expect, it, vi, beforeEach } from 'vitest'
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
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
 * #2569.1 — le GESTE ZIP dans le vivier. Back-end livré et testé
 * (`cv-batch-import.service.spec.ts`), sans appelant web avant ce lot : « du
 * code juste, calculé, testé, que personne n'appelle ».
 *
 * #2326.12 (LOT r5 26/09) — la confirmation dépose désormais un JOB
 * (`useCvZipImportJob`) et l'écran SUIT sa progression (`useCvBatchImportJobStatus`),
 * au lieu d'attendre le rapport en un seul aller-retour : `mockZipImport` fait
 * comme si le job passait IMMÉDIATEMENT à `done`, pour garder les assertions
 * sur le rapport final inchangées ; `mockJobInFlight`/`mockJobFailed`
 * exercent les deux autres états.
 *
 * Ce que ces tests protègent :
 *  - Louis 06/10/2026 : plus aucun plafond en nombre — le manifeste ne nomme aucune borne ;
 *  - le rapport dit COMBIEN sont entrées, combien ont échoué, et POURQUOI —
 *    jamais un « OK » muet ;
 *  - un job EN VOL ou EN ÉCHEC se voit à l'écran, jamais un silence.
 */
type BatchReport = { total: number; summary: Record<string, number>; outcomes: unknown[] }

function mockJobStatus(state: unknown) {
  vi.mocked(useCvBatchImportJobStatus).mockImplementation(
    (jobId: string | null) =>
      ({ data: jobId ? state : undefined }) as unknown as ReturnType<typeof useCvBatchImportJobStatus>,
  )
}

function mockZipImport(result: BatchReport, isPending = false) {
  const mutateAsync = vi.fn().mockResolvedValue({ jobId: 'job-1', total: result.total })
  vi.mocked(useCvZipImportJob).mockReturnValue({ mutateAsync, isPending } as unknown as ReturnType<
    typeof useCvZipImportJob
  >)
  mockJobStatus({ id: 'job-1', status: 'done', processed: result.total, error: null, ...result })
  return mutateAsync
}

/** #2326.12 — le job est encore `queued`/`processing` : l'écran doit le DIRE, jamais rester muet.
 *  #1952.22 — `etaSeconds` par défaut `null` (rien à extrapoler encore), comme un job qui vient
 *  d'être déposé — les appelants qui veulent une ETA affichée le passent explicitement. */
function mockJobInFlight(processed: number, total: number, etaSeconds: number | null = null) {
  mockJobStatus({
    id: 'job-1',
    status: 'processing',
    processed,
    total,
    summary: {},
    outcomes: [],
    error: null,
    etaSeconds,
  })
}

/** #3065 (lot 2b) — l'import volumineux : par défaut, ne résout jamais (les
 *  tests qui ne s'y intéressent pas n'ont pas à le mocker plus précisément). */
function mockZipLargeImport(impl?: (args: unknown) => Promise<unknown>) {
  const mutateAsync = vi.fn(impl ?? (() => new Promise(() => {})))
  vi.mocked(useCvZipLargeImport).mockReturnValue({ mutateAsync, isPending: false } as unknown as ReturnType<
    typeof useCvZipLargeImport
  >)
  return mutateAsync
}

/** #2431.6 — le manifeste est lu en premier, avant tout envoi réel. Par
 *  défaut : un seul fichier, aucun doublon, sous la borne. */
function mockManifest(result: unknown = { totalFiles: 1, duplicateFiles: 0 }) {
  const mutateAsync = vi.fn().mockResolvedValue(result)
  vi.mocked(useCvZipManifest).mockReturnValue({ mutateAsync, isPending: false } as unknown as ReturnType<
    typeof useCvZipManifest
  >)
  return mutateAsync
}

function pickZip(name = 'lot.zip') {
  const file = new File(['PK'], name, { type: 'application/zip' })
  const input = screen.getByLabelText('Choisir une archive .zip')
  fireEvent.change(input, { target: { files: [file] } })
}

/** Choisit l'archive, attend le manifeste, puis confirme l'import — le
 *  parcours complet que #2431.6 impose avant tout envoi réel. */
async function pickZipAndConfirm(name = 'lot.zip') {
  pickZip(name)
  fireEvent.click(await screen.findByRole('button', { name: 'Confirmer l’import' }))
}

/** #2326.6 — la source DOSSIER n'est pas au centre de ce fichier (voir
 *  `CvFilesImportDialog.test.tsx`) ; ce défaut IDLE laisse les tests ZIP,
 *  qui ne la choisissent jamais, s'exécuter sans avoir à la mocker. */
function idleFilesHooks() {
  vi.mocked(useCvFilesManifest).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as unknown as ReturnType<
    typeof useCvFilesManifest
  >)
  vi.mocked(useCvFilesImportJob).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as unknown as ReturnType<
    typeof useCvFilesImportJob
  >)
  mockJobStatus(undefined)
}

describe('CvZipImportDialog', () => {
  beforeEach(() => {
    cleanup()
    vi.clearAllMocks()
    idleFilesHooks()
    mockZipLargeImport()
  })

  // #1952.4 (épopée #2844, lot SRC5 28/09 soir) — le dépôt PRÉ-CIBLÉ que Laura
  // ouvre depuis la conversation (`/consultants?importCv=true`) : le dialogue
  // s'ouvre au premier rendu, sans le clic sur « Importer une archive ZIP ».
  it('#1952.4 — `initialOpen` ouvre le dépôt sans clic, pour le lien que Laura propose', async () => {
    mockZipImport({ total: 0, summary: {}, outcomes: [] })
    mockManifest()
    render(<CvZipImportDialog initialOpen />)

    expect(await screen.findByRole('dialog')).toBeInTheDocument()
  })

  it('montre le contrôle dans le vivier, SANS paragraphe de bornes (#3598, #3599)', async () => {
    mockZipImport({ total: 0, summary: {}, outcomes: [] })
    mockManifest()
    render(<CvZipImportDialog />)

    fireEvent.click(await screen.findByRole('button', { name: 'Importer une archive ZIP' }))

    // #3598 — le paragraphe des plafonds (fichiers + Mo) est retiré du dialogue :
    // les bornes restent dites au REFUS (message `tooBig`), jamais en bruit permanent.
    expect(screen.queryByText(/fichiers par archive/)).not.toBeInTheDocument()
    expect(screen.queryByText(/fichiers en import volumineux/)).not.toBeInTheDocument()
    expect(screen.queryByText(/en envoi direct/)).not.toBeInTheDocument()
  })

  // #2732.2 (recette prod 31/10) — les formats lus se disent AVANT le dépôt, comme pour les missions ; ce ne sont
  // pas des bornes (#3598) : aucun nombre de fichiers, aucune taille.
  it('#2732.2 — dit les formats lus avant le dépôt, sans reparler des plafonds', async () => {
    mockZipImport({ total: 0, summary: {}, outcomes: [] })
    mockManifest()
    render(<CvZipImportDialog />)
    fireEvent.click(await screen.findByRole('button', { name: 'Importer une archive ZIP' }))
    const formats = await screen.findByText(/Formats lus/i)
    expect(formats).toHaveTextContent(/\.zip/)
    expect(formats).toHaveTextContent(/PDF/)
    expect(formats).toHaveTextContent(/DOCX/)
    expect(screen.queryByText(/fichiers par archive/)).not.toBeInTheDocument()
  })

  // #3065 — retour Louis 26/09 : une archive de 703 Mo affichait « Validation
  // failed » après un envoi complet. Le navigateur refuse désormais AVANT tout
  // envoi, avec la taille reçue ET la limite — jamais un échec silencieux.
  // #3065 (lot 2b) — au-delà de `CV_ZIP_MAX_ARCHIVE_BYTES` (20 Mo), l'archive
  // n'est plus refusée : elle part par l'import VOLUMINEUX (dépôt direct,
  // jusqu'à `CV_ZIP_LARGE_ARCHIVE_MAX_BYTES`, 2,5 Gio depuis le 12/10) — c'est l'objet même de ce lot.
  it('#3065 (lot 2b) — une archive au-delà du transport inline part par l’import volumineux, jamais refusée', async () => {
    const zipImportMutate = mockZipImport({ total: 0, summary: {}, outcomes: [] })
    mockZipLargeImport()
    render(<CvZipImportDialog />)

    fireEvent.click(await screen.findByRole('button', { name: 'Importer une archive ZIP' }))

    const file = new File(['PK'], 'CV AAAAALL.zip', { type: 'application/zip' })
    Object.defineProperty(file, 'size', { value: 25 * 1024 * 1024 })
    const input = screen.getByLabelText('Choisir une archive .zip')
    fireEvent.change(input, { target: { files: [file] } })

    expect(await screen.findByText(/25 Mo/)).toBeInTheDocument()
    // #3599 — le rappel « Jusqu’à 2000 fichiers traités en tâche de fond… » est retiré.
    expect(screen.queryByText(/traités en tâche de fond/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Importer (volumineux)' })).toBeInTheDocument()
    // Aucune tentative de manifeste ni d'import en ligne pour une archive de
    // cette taille — jamais dépaquetée dans le navigateur.
    expect(zipImportMutate).not.toHaveBeenCalled()
  })

  // #3065 (lot 2b) — au-delà du plafond de l'import volumineux, le refus reste NOMMÉ, taille et
  // plafond dits — jamais un envoi qui échouera après coup. #3666.9 (Louis 15/10/2026) : le plafond
  // est la limite ANNONCÉE de 1 Go (renversement daté du 2,5 Gio du 12/10).
  it('#3065 (lot 2b) — refuse une archive au-delà du plafond de l’import volumineux, AVANT tout envoi', async () => {
    const zipImportMutate = mockZipImport({ total: 0, summary: {}, outcomes: [] })
    const zipLargeMutate = mockZipLargeImport()
    render(<CvZipImportDialog />)

    fireEvent.click(await screen.findByRole('button', { name: 'Importer une archive ZIP' }))

    const file = new File(['PK'], 'trop-grosse.zip', { type: 'application/zip' })
    Object.defineProperty(file, 'size', { value: 1025 * 1024 * 1024 })
    const input = screen.getByLabelText('Choisir une archive .zip')
    fireEvent.change(input, { target: { files: [file] } })

    expect(await screen.findByText(/1025 Mo.*limite d’import est de 1 Go/)).toBeInTheDocument()
    expect(zipImportMutate).not.toHaveBeenCalled()
    expect(zipLargeMutate).not.toHaveBeenCalled()
  })

  // #3065 (lot 2b) — le parcours complet de l'import volumineux : confirmer
  // déclenche `useCvZipLargeImport`, et le rapport final a le MÊME format que
  // l'import en ligne — jamais un second écran selon la taille de l'archive.
  it('#3065 (lot 2b) — confirmer une archive volumineuse démarre l’import et rend le même rapport', async () => {
    mockZipImport({ total: 0, summary: {}, outcomes: [] })
    const report = {
      total: 1,
      summary: { created: 1, auto_updated: 0, exception: 0, too_big: 0, failed: 0, ignored: 0 },
      outcomes: [{ status: 'created', file: 'jean.pdf', consultantId: 'c1' }],
    }
    const largeMutate = mockZipLargeImport(async () => report)
    render(<CvZipImportDialog />)
    fireEvent.click(await screen.findByRole('button', { name: 'Importer une archive ZIP' }))

    const file = new File(['PK'], 'CV AAAAALL.zip', { type: 'application/zip' })
    Object.defineProperty(file, 'size', { value: 700 * 1024 * 1024 })
    const input = screen.getByLabelText('Choisir une archive .zip')
    fireEvent.change(input, { target: { files: [file] } })
    fireEvent.click(await screen.findByRole('button', { name: 'Importer (volumineux)' }))

    expect(largeMutate).toHaveBeenCalledWith(expect.objectContaining({ file, onProgress: expect.any(Function) }))
    await waitFor(() => expect(screen.getByText(/1 créée/)).toBeInTheDocument())
  })

  it('#2431.6 — dit le nombre de fichiers et les doublons AVANT tout envoi, et attend une confirmation', async () => {
    mockZipImport({ total: 0, summary: {}, outcomes: [] })
    const manifestMutate = mockManifest({ totalFiles: 5, duplicateFiles: 2 })
    render(<CvZipImportDialog />)
    fireEvent.click(await screen.findByRole('button', { name: 'Importer une archive ZIP' }))

    pickZip()

    await waitFor(() =>
      expect(manifestMutate).toHaveBeenCalledWith({ fileB64: expect.any(String), filename: 'lot.zip' }),
    )
    expect(await screen.findByText(/5 fichier/)).toBeInTheDocument()
    expect(screen.getByText(/2 doublon/)).toBeInTheDocument()
    // #2569 — la règle est annoncée AVANT le traitement, pas découverte après.
    expect(screen.getByText(/version la plus récente est gardée/)).toBeInTheDocument()
    // Rien n'est envoyé tant que la confirmation n'a pas été cliquée.
    expect(screen.getByRole('button', { name: 'Confirmer l’import' })).toBeInTheDocument()
  })

  it('Louis 06/10/2026 : plus aucun plafond en nombre — 2 329 fichiers, aucune borne dite dans le manifeste', async () => {
    mockZipImport({ total: 0, summary: {}, outcomes: [] })
    mockManifest({ totalFiles: 2329, duplicateFiles: 0 })
    render(<CvZipImportDialog />)
    fireEvent.click(await screen.findByRole('button', { name: 'Importer une archive ZIP' }))

    pickZip()

    expect(await screen.findByRole('button', { name: 'Confirmer l’import' })).toBeInTheDocument()
    expect(screen.queryByText(/au plus/)).not.toBeInTheDocument()
    // Sans doublon, aucune règle de doublon à annoncer (« on n'affiche pas ce qu'on n'a pas »).
    expect(screen.queryByText(/version la plus récente est gardée/)).not.toBeInTheDocument()
  })

  it('#3302 — à l’arrivée, « Fermer » est sur la MÊME ligne que les deux boutons de choix', async () => {
    render(<CvZipImportDialog />)
    fireEvent.click(await screen.findByRole('button', { name: 'Importer une archive ZIP' }))
    const choose = await screen.findByRole('button', { name: 'Choisir une archive .zip' })
    const row = choose.parentElement as HTMLElement
    expect(within(row).getByRole('button', { name: 'Choisir un dossier' })).toBeInTheDocument()
    expect(within(row).getByRole('button', { name: 'Fermer' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Fermer' })).toHaveLength(2) // celui de la rangée + la croix du dialogue, plus de pied
  })

  it('#3302 — « Fermer » est sur la MÊME ligne que « Confirmer l’import » et « Annuler »', async () => {
    mockZipImport({ total: 0, summary: {}, outcomes: [] })
    mockManifest({ totalFiles: 1, duplicateFiles: 0 })
    render(<CvZipImportDialog />)
    fireEvent.click(await screen.findByRole('button', { name: 'Importer une archive ZIP' }))
    pickZip()

    const confirm = await screen.findByRole('button', { name: 'Confirmer l’import' })
    const row = confirm.parentElement as HTMLElement
    expect(within(row).getByRole('button', { name: 'Annuler' })).toBeInTheDocument()
    expect(within(row).getByRole('button', { name: 'Fermer' })).toBeInTheDocument()
  })

  it('#2431.6 — annuler le manifeste n’envoie jamais l’archive', async () => {
    const mutateAsync = mockZipImport({ total: 0, summary: {}, outcomes: [] })
    mockManifest({ totalFiles: 1, duplicateFiles: 0 })
    render(<CvZipImportDialog />)
    fireEvent.click(await screen.findByRole('button', { name: 'Importer une archive ZIP' }))

    pickZip()
    fireEvent.click(await screen.findByRole('button', { name: 'Annuler' }))

    expect(screen.queryByRole('button', { name: 'Confirmer l’import' })).not.toBeInTheDocument()
    expect(mutateAsync).not.toHaveBeenCalled()
  })

  it('envoie l’archive et dit combien sont entrées, combien ont échoué, et pourquoi', async () => {
    const mutateAsync = mockZipImport({
      total: 3,
      summary: { created: 1, auto_updated: 1, exception: 0, too_big: 0, failed: 1 },
      outcomes: [
        { status: 'created', file: 'a.pdf', consultantId: 'c1' },
        { status: 'auto_updated', file: 'b.pdf', consultantId: 'c2', contentReplaced: true },
        { status: 'failed', file: 'c.pdf', reason: 'Format illisible' },
      ],
    })
    mockManifest()
    render(<CvZipImportDialog />)
    fireEvent.click(await screen.findByRole('button', { name: 'Importer une archive ZIP' }))

    await pickZipAndConfirm()

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith({ fileB64: expect.any(String), filename: 'lot.zip' }))
    // Combien sont entrées.
    await waitFor(() => expect(screen.getByText(/1 créée/)).toBeInTheDocument())
    expect(screen.getByText(/1 mise\(s\) à jour/)).toBeInTheDocument()
    // Combien ont échoué, et POURQUOI — la raison du serveur, jamais générique.
    expect(screen.getByText(/c\.pdf.*Format illisible/)).toBeInTheDocument()
  })

  it('#2183.41/#2183 §PROGRESSION — distingue les scans suspectés des autres erreurs', async () => {
    mockZipImport({
      total: 3,
      summary: { created: 0, auto_updated: 0, exception: 0, too_big: 1, failed: 2 },
      outcomes: [
        { status: 'failed', file: 'scan1.pdf', reason: 'Document scan/image, sans texte.', category: 'scan_suspected' },
        { status: 'failed', file: 'corrompu.pdf', reason: 'Format illisible', category: 'other' },
        { status: 'too_big', file: 'enorme.pdf' },
      ],
    })
    mockManifest()
    render(<CvZipImportDialog />)
    fireEvent.click(await screen.findByRole('button', { name: 'Importer une archive ZIP' }))

    await pickZipAndConfirm('lot3.zip')

    // Un compte agrégé UNIQUE (« 3 non lue(s) ») confondait un document sans
    // calque texte — récupérable en le rescannant — avec un fichier réellement
    // en échec. Les deux comptes sont désormais SÉPARÉS.
    await waitFor(() => expect(screen.getByText(/1 scan/)).toBeInTheDocument())
    expect(screen.getByText(/2 erreur/)).toBeInTheDocument()
  })

  /**
   * #3065 (lot 2) — un fichier qui n'est pas un CV (csv, xlsx, zip imbriqué)
   * se NOMME « ignoré », jamais confondu avec une erreur.
   */
  it('#3065 — nomme un fichier « pas un CV » à part, jamais comme une erreur', async () => {
    mockZipImport({
      total: 2,
      summary: { created: 1, auto_updated: 0, exception: 0, too_big: 0, failed: 0, ignored: 1 },
      outcomes: [
        { status: 'created', file: 'a.pdf', consultantId: 'c1' },
        { status: 'ignored', file: 'export.csv', reason: 'Ce n’est pas un CV (extension .csv) — ignoré.' },
      ],
    })
    mockManifest()
    render(<CvZipImportDialog />)
    fireEvent.click(await screen.findByRole('button', { name: 'Importer une archive ZIP' }))

    await pickZipAndConfirm('lot4.zip')

    await waitFor(() => expect(screen.getByText(/1 ignoré/)).toBeInTheDocument())
    expect(screen.getByText(/export\.csv.*ignoré, ce n’est pas un CV/)).toBeInTheDocument()
    // Jamais compté comme une erreur.
    expect(screen.getByText(/0 erreur/)).toBeInTheDocument()
  })

  it('une exception isolée nomme SON état — jamais un compte muet', async () => {
    mockZipImport({
      total: 1,
      summary: { created: 0, auto_updated: 0, exception: 1, too_big: 0, failed: 0 },
      outcomes: [{ status: 'exception', file: 'd.pdf', consultantId: 'c3', state: 'ambiguous', conflicts: [] }],
    })
    mockManifest()
    render(<CvZipImportDialog />)
    fireEvent.click(await screen.findByRole('button', { name: 'Importer une archive ZIP' }))

    await pickZipAndConfirm('lot2.zip')

    await waitFor(() => expect(screen.getByText(/d\.pdf/)).toBeInTheDocument())
    expect(screen.getByText(/ressemblance à vérifier/)).toBeInTheDocument()
  })

  it('#2326.13 — une mise à jour automatique NOMME sa provenance', async () => {
    mockZipImport({
      total: 1,
      summary: { created: 0, auto_updated: 1, exception: 0, too_big: 0, failed: 0 },
      outcomes: [
        { status: 'auto_updated', file: 'e.pdf', consultantId: 'c4', contentReplaced: true, matchedOn: 'same_email' },
      ],
    })
    // #2431.6 (fusionné après #2326) — le manifeste se lit AVANT tout envoi
    // réel : sans son mock, `zipManifest.mutateAsync` (undefined) fait
    // échouer le clic sur le fichier, jamais l'import lui-même.
    mockManifest()
    render(<CvZipImportDialog />)
    fireEvent.click(await screen.findByRole('button', { name: 'Importer une archive ZIP' }))

    await pickZipAndConfirm('lot4.zip')

    await waitFor(() => expect(screen.getByText(/e\.pdf/)).toBeInTheDocument())
    expect(screen.getByText(/même adresse professionnelle/)).toBeInTheDocument()
  })

  it('#2326.14 — une exception avec un champ contradictoire le NOMME', async () => {
    mockZipImport({
      total: 1,
      summary: { created: 0, auto_updated: 0, exception: 1, too_big: 0, failed: 0 },
      outcomes: [
        { status: 'exception', file: 'f.pdf', consultantId: 'c5', state: 'probable_duplicate', conflicts: ['email'] },
      ],
    })
    // #2431.6 (fusionné après #2326) — même mock de manifeste que #2326.13,
    // sans quoi le clic de sélection échoue avant même l'import.
    mockManifest()
    render(<CvZipImportDialog />)
    fireEvent.click(await screen.findByRole('button', { name: 'Importer une archive ZIP' }))

    await pickZipAndConfirm('lot5.zip')

    await waitFor(() => expect(screen.getByText(/f\.pdf/)).toBeInTheDocument())
    expect(screen.getByText(/à vérifier : e-mail/)).toBeInTheDocument()
  })

  it('un échec de la requête elle-même se DIT, jamais un OK silencieux', async () => {
    const mutateAsync = vi.fn().mockRejectedValue(new Error('Archive ZIP illisible ou corrompue.'))
    vi.mocked(useCvZipImportJob).mockReturnValue({ mutateAsync, isPending: false } as unknown as ReturnType<
      typeof useCvZipImportJob
    >)
    mockManifest()
    render(<CvZipImportDialog />)
    fireEvent.click(await screen.findByRole('button', { name: 'Importer une archive ZIP' }))

    await pickZipAndConfirm('corrompu.zip')

    await waitFor(() => expect(mutateAsync).toHaveBeenCalled())
    // Retirer la gestion d'erreur ferait disparaître ce texte : le test rougit.
    expect(await screen.findByText('Archive ZIP illisible ou corrompue.')).toBeInTheDocument()
  })

  // Incident 05/10/2026 — la phase du job se LIT avant son premier fichier.
  describe('import volumineux — phases du job', () => {
    async function startLarge(progress: unknown) {
      mockZipImport({ total: 0, summary: {}, outcomes: [] })
      mockZipLargeImport(async args => {
        ;(args as { onProgress: (e: unknown) => void }).onProgress({ phase: 'running', progress })
        return new Promise(() => {})
      })
      render(<CvZipImportDialog />)
      fireEvent.click(await screen.findByRole('button', { name: 'Importer une archive ZIP' }))
      const file = new File(['PK'], 'gros.zip', { type: 'application/zip' })
      Object.defineProperty(file, 'size', { value: 700 * 1024 * 1024 })
      fireEvent.change(screen.getByLabelText('Choisir une archive .zip'), { target: { files: [file] } })
      fireEvent.click(await screen.findByRole('button', { name: 'Importer (volumineux)' }))
    }
    const MB = 1024 * 1024

    it('phase download : octets reçus sur total', async () => {
      await startLarge({
        processed: 0,
        total: null,
        phase: 'download',
        bytesDownloaded: 120 * MB,
        bytesTotal: 700 * MB,
      })
      expect(await screen.findByText('Téléchargement de l’archive — 120 Mo sur 700 Mo')).toBeInTheDocument()
    })

    it('phase download sans total : « X Mo reçus », jamais un total à 0', async () => {
      await startLarge({ processed: 0, total: null, phase: 'download', bytesDownloaded: 120 * MB, bytesTotal: null })
      expect(await screen.findByText('Téléchargement de l’archive — 120 Mo reçus')).toBeInTheDocument()
      expect(screen.queryByText(/sur 0 Mo/)).not.toBeInTheDocument()
    })

    it('phase open : ouverture de l’archive', async () => {
      await startLarge({ processed: 0, total: null, phase: 'open' })
      expect(await screen.findByText('Ouverture de l’archive…')).toBeInTheDocument()
    })

    it('phase entries : la progression en fichiers, inchangée', async () => {
      await startLarge({ processed: 4, total: 9, phase: 'entries' })
      expect(await screen.findByText('Traitement en cours… 4 / 9 fichier(s)')).toBeInTheDocument()
    })

    it('sans phase (ancien statut) : comportement inchangé', async () => {
      await startLarge({ processed: 4, total: 9 })
      expect(await screen.findByText('Traitement en cours… 4 / 9 fichier(s)')).toBeInTheDocument()
    })
  })

  // #2326.12 — LE JOB EN VOL : rien n'attend le lot entier en silence.
  it('#2326.12 — un job en cours affiche sa progression, jamais un silence', async () => {
    const mutateAsync = vi.fn().mockResolvedValue({ jobId: 'job-1', total: 3 })
    vi.mocked(useCvZipImportJob).mockReturnValue({ mutateAsync, isPending: false } as unknown as ReturnType<
      typeof useCvZipImportJob
    >)
    mockJobInFlight(1, 3)
    mockManifest()
    render(<CvZipImportDialog />)
    fireEvent.click(await screen.findByRole('button', { name: 'Importer une archive ZIP' }))

    await pickZipAndConfirm('en-cours.zip')

    expect(await screen.findByText('1 sur 3 fichiers traités…')).toBeInTheDocument()
  })

  // #1952.22 (épopée #2844) — le temps restant s'affiche dès qu'il est mesuré.
  it('#1952.22 — un job en cours avec une ETA mesurée affiche le temps restant', async () => {
    const mutateAsync = vi.fn().mockResolvedValue({ jobId: 'job-1', total: 3 })
    vi.mocked(useCvZipImportJob).mockReturnValue({ mutateAsync, isPending: false } as unknown as ReturnType<
      typeof useCvZipImportJob
    >)
    mockJobInFlight(1, 3, 42)
    mockManifest()
    render(<CvZipImportDialog />)
    fireEvent.click(await screen.findByRole('button', { name: 'Importer une archive ZIP' }))

    await pickZipAndConfirm('en-cours.zip')

    expect(await screen.findByText('≈ 42 secondes restantes')).toBeInTheDocument()
  })

  // #1952.22 — jamais une ETA devinée : avant qu'elle soit mesurée, rien ne s'affiche.
  it('#1952.22 — aucune ETA affichée tant qu’elle n’est pas mesurée', async () => {
    const mutateAsync = vi.fn().mockResolvedValue({ jobId: 'job-1', total: 3 })
    vi.mocked(useCvZipImportJob).mockReturnValue({ mutateAsync, isPending: false } as unknown as ReturnType<
      typeof useCvZipImportJob
    >)
    mockJobInFlight(1, 3, null)
    mockManifest()
    render(<CvZipImportDialog />)
    fireEvent.click(await screen.findByRole('button', { name: 'Importer une archive ZIP' }))

    await pickZipAndConfirm('en-cours.zip')

    await screen.findByText('1 sur 3 fichiers traités…')
    expect(screen.queryByText(/restant/)).not.toBeInTheDocument()
  })

  // #2326.12 — LE JOB EN ÉCHEC (toutes les tentatives BullMQ épuisées) : la
  // raison du serveur se lit, jamais un rapport qui prétendrait avoir fini.
  it('#2326.12 — un job en échec nomme sa raison', async () => {
    const mutateAsync = vi.fn().mockResolvedValue({ jobId: 'job-1', total: 2 })
    vi.mocked(useCvZipImportJob).mockReturnValue({ mutateAsync, isPending: false } as unknown as ReturnType<
      typeof useCvZipImportJob
    >)
    mockJobStatus({
      id: 'job-1',
      status: 'failed',
      processed: 1,
      total: 2,
      summary: {},
      outcomes: [],
      error: 'Le service de dépôt est indisponible.',
    })
    mockManifest()
    render(<CvZipImportDialog />)
    fireEvent.click(await screen.findByRole('button', { name: 'Importer une archive ZIP' }))

    await pickZipAndConfirm('echec.zip')

    expect(await screen.findByText('Le job a échoué : Le service de dépôt est indisponible.')).toBeInTheDocument()
  })
})
