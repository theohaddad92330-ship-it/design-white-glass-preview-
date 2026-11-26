import { screen, fireEvent, waitFor } from '@testing-library/react'
import { vi } from 'vitest'
import { RAG_UPLOAD_DOCUMENT_EXTENSIONS, RAG_UPLOAD_MAX_BYTES } from '@bellum/contracts'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { chooseOption, getSelect } from '@/test/select'
import { Knowledge } from './Knowledge'

const noopMutation = { mutateAsync: vi.fn(), isPending: false }

// RAG doc hooks + toasts are mocked so we can drive the upload flow and assert
// what reaches the ingest mutation (PDF → fileB64, text → content) and the states.
// vi.hoisted lets the (hoisted) vi.mock factories reference these safely.
const { ingestMock, replaceMock, deleteMock, toastSuccess, toastError, ragDocs, workspaceMarket } = vi.hoisted(() => ({
  ingestMock: vi.fn(),
  replaceMock: vi.fn(),
  deleteMock: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  ragDocs: { current: [] as unknown[] },
  // #2861 (#2437.2, niveau ESPACE) — `undefined` par défaut : la plupart des
  // tests de ce fichier vérifient le comportement SANS langue d'espace
  // résolue (même état que la requête react-query non mockée d'avant ce
  // lot) ; un seul describe la met à `{ defaultLocale: … }`.
  workspaceMarket: { current: undefined as { defaultLocale: string } | undefined },
}))
vi.mock('@/features/rag/hooks/useIngestRagDocument', () => ({
  useIngestRagDocument: () => ({ mutateAsync: ingestMock, isPending: false }),
}))
vi.mock('@/features/rag/hooks/useReplaceRagDocument', () => ({
  useReplaceRagDocument: () => ({ mutateAsync: replaceMock, isPending: false }),
}))
vi.mock('@/features/rag/hooks/useExtractRagFile', () => ({
  useExtractRagFile: () => ({
    mutateAsync: vi.fn().mockResolvedValue({ text: 'contenu du fichier', partial: false }),
    isPending: false,
  }),
}))
vi.mock('@/features/rag/hooks/useRagDocuments', () => ({
  useRagDocuments: () => ({ data: ragDocs.current, isLoading: false }),
}))
vi.mock('@/features/rag/hooks/useDeleteRagDocument', () => ({
  useDeleteRagDocument: () => ({ mutateAsync: deleteMock, isPending: false }),
}))
vi.mock('@/features/accounts/hooks/useAccounts', () => ({
  useAccounts: () => ({
    data: { pages: [{ data: [{ id: 'acc-1', company_name: 'Acme Corp' }] }] },
    isLoading: false,
    isError: false,
  }),
}))
vi.mock('sonner', () => ({ toast: { success: toastSuccess, error: toastError } }))
vi.mock('@/features/team/hooks/useWorkspaceMarket', () => ({
  useWorkspaceMarket: () => ({ market: workspaceMarket.current, isLoading: false, setMarket: { mutate: vi.fn() } }),
}))
const LIBRARY_FIXTURES: Record<string, unknown[]> = {
  template: [
    {
      id: 't1',
      kind: 'template',
      title: 'Email de premier contact',
      description: 'Intro',
      category: 'Email',
      body: 'Bonjour',
      createdAt: '',
      updatedAt: '',
    },
  ],
  playbook: [],
  method_playbook: [
    {
      id: 'm1',
      kind: 'method_playbook',
      title: 'Multi-threading : couvrir 3 niveaux, 12 contacts',
      description: 'Cartographier le compte sur 3 niveaux',
      category: null,
      body: 'PRINCIPE : la décision est diffuse.',
      createdAt: '',
      updatedAt: '',
    },
  ],
}
vi.mock('@/features/library/hooks/useLibraryItems', () => ({
  useLibraryItems: (kind: 'template' | 'playbook' | 'method_playbook') => ({
    data: LIBRARY_FIXTURES[kind] ?? [],
    isLoading: false,
    isError: false,
  }),
  useCreateLibraryItem: () => noopMutation,
  useUpdateLibraryItem: () => noopMutation,
  useDeleteLibraryItem: () => noopMutation,
}))

/**
 * ⚠️ Le Proxy MÉMORISE ses composants.
 *
 * Sans ce cache, chaque accès à `motion.div` rend une closure NEUVE : React voit
 * un type différent d'un rendu à l'autre, démonte tout le sous-arbre et le
 * remonte — l'état local des enfants part avec, et le test devient aveugle à
 * toute interaction qui change un état. Mesuré le 03/09 : un clic passait, le
 * `setState` était bien appelé, et l'écran entier disparaissait du DOM.
 */
const motionComponents = new Map<string, unknown>()

vi.mock('framer-motion', () => ({
  motion: new Proxy(
    {},
    {
      get: (_target: unknown, prop: string) => {
        if (typeof prop === 'string') {
          const cached = motionComponents.get(prop)
          if (cached) return cached
          const Rendered = ({ children, ...props }: any) => {
            const Component = prop
            return <Component {...props}>{children}</Component>
          }
          motionComponents.set(prop, Rendered)
          return Rendered
        }
      },
    },
  ),
  AnimatePresence: ({ children }: any) => <>{children}</>,
  useInView: () => true,
  useScroll: () => ({ scrollYProgress: { get: () => 0 } }),
  useTransform: () => 0,
}))

/** Open the collapsible upload form and select a file + title. */
async function openUploadAndSelect(file: File, title = 'Ma plaquette') {
  fireEvent.click(await screen.findByText('Ajouter un document'))
  const input = document.querySelector('input[type="file"]') as HTMLInputElement
  fireEvent.change(input, { target: { files: [file] } })
  fireEvent.change(screen.getByPlaceholderText(/Template de prospection/i), { target: { value: title } })
}

/**
 * Refonte Théo V22 (tableau des documents) : sous 768 px, l'usage et l'état se répètent sous le titre, leur colonne
 * étant masquée par CSS (`display: none` — ni vu, ni lu). jsdom n'applique pas les feuilles : on ne compte que les
 * occurrences rendues hors de ces doublons responsifs.
 */
function inLayout(elements: HTMLElement[]): HTMLElement[] {
  return elements.filter(el => !el.closest('.md\\:hidden, .sm\\:hidden'))
}

describe('Knowledge — PDF / document upload', () => {
  beforeEach(() => {
    ingestMock.mockReset().mockResolvedValue(undefined)
    toastSuccess.mockReset()
    toastError.mockReset()
  })

  it('uploads a PDF as base64 (server-side extraction) and confirms it is indexed', async () => {
    renderWithRouter(<Knowledge />)
    const pdf = new File(['%PDF-1.4 hello'], 'plaquette.pdf', { type: 'application/pdf' })
    await openUploadAndSelect(pdf)
    fireEvent.click(screen.getByText('Envoyer'))

    await waitFor(() => expect(ingestMock).toHaveBeenCalledTimes(1))
    const arg = ingestMock.mock.calls[0]![0] as { fileB64?: string; filename?: string; content?: string }
    // The PDF travels as base64 + filename — never as raw client-read content.
    expect(arg.filename).toBe('plaquette.pdf')
    expect(typeof arg.fileB64).toBe('string')
    expect(arg.fileB64!.length).toBeGreaterThan(0)
    expect(arg.content).toBeUndefined()
    // The "indexé" state is confirmed to the user.
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Document indexé'))
  })

  it('uploads a text file as raw content (no base64 round-trip)', async () => {
    renderWithRouter(<Knowledge />)
    const txt = new File(['Bonjour, note commerciale'], 'note.txt', { type: 'text/plain' })
    // jsdom's Blob.text() is flaky across versions — make the client-side read
    // deterministic so we assert the content→ingest wiring, not the polyfill.
    Object.defineProperty(txt, 'text', {
      value: () => Promise.resolve('Bonjour, note commerciale'),
      configurable: true,
    })
    await openUploadAndSelect(txt, 'Ma note')
    fireEvent.click(screen.getByText('Envoyer'))

    await waitFor(() => expect(ingestMock).toHaveBeenCalledTimes(1))
    const arg = ingestMock.mock.calls[0]![0] as { content?: string; fileB64?: string }
    expect(arg.content).toContain('note commerciale')
    expect(arg.fileB64).toBeUndefined()
  })

  // #3803.2 — un CSV déposé garde son ORIGINAL : le serveur ne le range que si le nom de fichier voyage avec le
  // texte (sans `filename`, « Original non conservé » + aperçu texte brut, recette prod 31/10).
  it('#3803.2 — un CSV déposé envoie aussi son nom de fichier (le serveur en garde l’original)', async () => {
    renderWithRouter(<Knowledge />)
    const csv = new File(['nom;ville\nAcme;Paris'], 'clients.csv', { type: 'text/csv' })
    Object.defineProperty(csv, 'text', { value: () => Promise.resolve('nom;ville\nAcme;Paris'), configurable: true })
    await openUploadAndSelect(csv, 'Clients')
    fireEvent.click(screen.getByText('Envoyer'))

    await waitFor(() => expect(ingestMock).toHaveBeenCalledTimes(1))
    const arg = ingestMock.mock.calls[0]![0] as { content?: string; filename?: string; fileB64?: string }
    expect(arg.content).toContain('Acme')
    expect(arg.filename).toBe('clients.csv')
    expect(arg.fileB64).toBeUndefined()
  })

  it('refuses an oversized file BEFORE sending, with the reason on the file', async () => {
    renderWithRouter(<Knowledge />)
    const big = new File([new Uint8Array(RAG_UPLOAD_MAX_BYTES + 1)], 'big.pdf', { type: 'application/pdf' })
    await openUploadAndSelect(big)

    expect(screen.getByText(/Fichier trop volumineux \(max 8 Mo\)/)).toBeInTheDocument()
    expect(screen.getByText('Envoyer')).toBeDisabled()
    expect(ingestMock).not.toHaveBeenCalled()
  })

  it('refuses an unsupported format (e.g. .png) BEFORE sending, with the reason on the file', async () => {
    renderWithRouter(<Knowledge />)
    const png = new File(['fake'], 'photo.png', { type: 'image/png' })
    await openUploadAndSelect(png)

    expect(screen.getByText(/Format « png » non supporté/)).toBeInTheDocument()
    expect(screen.getByText('Envoyer')).toBeDisabled()
    expect(ingestMock).not.toHaveBeenCalled()
  })
})

/**
 * #3751 — Connaissances accepte les mêmes formats que le trombone du chat
 * (docx/xlsx/pptx), par le même chemin d'ingestion, en dépôt MULTIPLE avec un
 * statut par fichier.
 */
describe('Knowledge — formats bureautiques et dépôt multiple (#3751)', () => {
  beforeEach(() => {
    ingestMock.mockReset().mockResolvedValue(undefined)
    toastSuccess.mockReset()
    toastError.mockReset()
  })

  async function openForm() {
    fireEvent.click(await screen.findByText('Ajouter un document'))
    return document.querySelector('input[type="file"]') as HTMLInputElement
  }

  it('le sélecteur est multiple et annonce docx/xlsx/pptx, lus dans la constante partagée', async () => {
    renderWithRouter(<Knowledge />)
    const input = await openForm()
    expect(input.multiple).toBe(true)
    for (const ext of RAG_UPLOAD_DOCUMENT_EXTENSIONS) expect(input.accept).toContain(`.${ext}`)
    expect(input.accept).toContain('.docx')
    expect(input.accept).toContain('.xlsx')
    expect(input.accept).toContain('.pptx')
    expect(screen.getByText(/DOCX/)).toBeInTheDocument()
    expect(screen.getByText(/max 8 Mo par fichier/)).toBeInTheDocument()
  })

  it.each(['rapport.docx', 'budget.xlsx', 'deck.pptx'])('dépose %s en base64, comme le chat', async name => {
    renderWithRouter(<Knowledge />)
    const input = await openForm()
    fireEvent.change(input, { target: { files: [new File(['PK'], name)] } })
    fireEvent.change(screen.getByPlaceholderText(/Template de prospection/i), { target: { value: 'Mon doc' } })
    fireEvent.click(screen.getByText('Envoyer'))

    await waitFor(() => expect(ingestMock).toHaveBeenCalledTimes(1))
    const arg = ingestMock.mock.calls[0]![0] as Record<string, unknown>
    expect(arg.filename).toBe(name)
    expect(typeof arg.fileB64).toBe('string')
    expect(arg.scope).toBe('workspace')
  })

  it('envoie plusieurs fichiers un par un, chacun titré de son nom, avec un statut chacun', async () => {
    renderWithRouter(<Knowledge />)
    const input = await openForm()
    fireEvent.change(input, {
      target: { files: [new File(['PK'], 'a.docx'), new File(['PK'], 'b.xlsx'), new File(['x'], 'c.exe')] },
    })
    // Refusé avant envoi, raison visible.
    expect(screen.getByText(/Format « exe » non supporté/)).toBeInTheDocument()
    fireEvent.click(screen.getByText('Envoyer'))

    await waitFor(() => expect(ingestMock).toHaveBeenCalledTimes(2))
    expect((ingestMock.mock.calls[0]![0] as { title: string }).title).toBe('a.docx')
    expect((ingestMock.mock.calls[1]![0] as { title: string }).title).toBe('b.xlsx')
    await waitFor(() => expect(screen.getAllByText('Indexé')).toHaveLength(2))
    expect(screen.getByText('Refusé')).toBeInTheDocument()
  })

  it('un refus de l’API (carnet d’adresses) s’affiche avec SA raison, et les autres fichiers passent', async () => {
    ingestMock
      .mockReset()
      .mockRejectedValueOnce(new Error('Ce dépôt a la forme d’un carnet d’adresses'))
      .mockResolvedValueOnce(undefined)
    renderWithRouter(<Knowledge />)
    const input = await openForm()
    fireEvent.change(input, { target: { files: [new File(['PK'], 'contacts.xlsx'), new File(['PK'], 'ok.docx')] } })
    fireEvent.click(screen.getByText('Envoyer'))

    expect(await screen.findByText(/carnet d’adresses/)).toBeInTheDocument()
    await waitFor(() => expect(ingestMock).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.getAllByText('Indexé')).toHaveLength(1))
  })
})

/**
 * #2779 — choisir la portée À L'AJOUT, depuis l'écran « Connaissances »
 * (seul le chat la proposait jusqu'ici). `workspace` reste le défaut — le
 * comportement d'avant cette portée, au bit près.
 */
describe('Knowledge — choisir la portée à l’ajout (#2779)', () => {
  beforeEach(() => {
    ingestMock.mockReset().mockResolvedValue(undefined)
    toastSuccess.mockReset()
    toastError.mockReset()
  })

  function textFile(name = 'note.txt') {
    const file = new File(['contenu'], name, { type: 'text/plain' })
    Object.defineProperty(file, 'text', { value: () => Promise.resolve('contenu'), configurable: true })
    return file
  }

  it('sans y toucher, dépose en `workspace` — comportement d’avant, au bit près', async () => {
    renderWithRouter(<Knowledge />)
    await openUploadAndSelect(textFile())
    fireEvent.click(screen.getByText('Envoyer'))

    await waitFor(() => expect(ingestMock).toHaveBeenCalledTimes(1))
    const arg = ingestMock.mock.calls[0]![0] as Record<string, unknown>
    expect(arg.scope).toBe('workspace')
    expect(arg).not.toHaveProperty('accountId')
  })

  it('« Mon espace personnel » dépose en `personal`, sans compte', async () => {
    renderWithRouter(<Knowledge />)
    await openUploadAndSelect(textFile())
    await chooseOption(getSelect('Portée'), 'Mon espace personnel')
    fireEvent.click(screen.getByText('Envoyer'))

    await waitFor(() => expect(ingestMock).toHaveBeenCalledTimes(1))
    const arg = ingestMock.mock.calls[0]![0] as Record<string, unknown>
    expect(arg.scope).toBe('personal')
    expect(arg).not.toHaveProperty('accountId')
  })

  it('« Un compte précis » exige un compte : le bouton reste désactivé tant qu’aucun n’est choisi', async () => {
    renderWithRouter(<Knowledge />)
    await openUploadAndSelect(textFile())
    await chooseOption(getSelect('Portée'), 'Un compte précis')

    expect(screen.getByText('Envoyer')).toBeDisabled()
    expect(ingestMock).not.toHaveBeenCalled()
  })

  it('« Un compte précis » + un compte choisi dépose en `account` AVEC ce compte', async () => {
    renderWithRouter(<Knowledge />)
    await openUploadAndSelect(textFile())
    await chooseOption(getSelect('Portée'), 'Un compte précis')
    await chooseOption(getSelect('Choisir le compte de ce document'), 'Acme Corp')
    fireEvent.click(screen.getByText('Envoyer'))

    await waitFor(() => expect(ingestMock).toHaveBeenCalledTimes(1))
    expect(ingestMock.mock.calls[0]![0]).toEqual(expect.objectContaining({ scope: 'account', accountId: 'acc-1' }))
  })

  // #2861 (#2437.2, niveau SOURCE) — la langue du document est DÉCLARÉE, jamais devinée.
  it('sans y toucher, la langue n’est PAS envoyée — non renseigné reste NULL côté serveur', async () => {
    renderWithRouter(<Knowledge />)
    await openUploadAndSelect(textFile())
    fireEvent.click(screen.getByText('Envoyer'))

    await waitFor(() => expect(ingestMock).toHaveBeenCalledTimes(1))
    expect(ingestMock.mock.calls[0]![0]).not.toHaveProperty('language')
  })

  it('une langue choisie voyage jusqu’au dépôt', async () => {
    renderWithRouter(<Knowledge />)
    await openUploadAndSelect(textFile())
    await chooseOption(getSelect('Langue du document'), 'Anglais')
    fireEvent.click(screen.getByText('Envoyer'))

    await waitFor(() => expect(ingestMock).toHaveBeenCalledTimes(1))
    expect(ingestMock.mock.calls[0]![0]).toEqual(expect.objectContaining({ language: 'en' }))
  })
})

/**
 * #2861 (#2437.2, niveau ESPACE) — la langue du marché de l'espace sert de
 * DÉFAUT à un NOUVEAU dépôt. Isolée dans son propre describe : c'est le SEUL
 * endroit du fichier où `useWorkspaceMarket` résout une valeur.
 */
describe('Knowledge — la langue de l’espace sert de défaut à un nouveau dépôt (#2861, #2437.2)', () => {
  beforeEach(() => {
    ingestMock.mockReset().mockResolvedValue(undefined)
    workspaceMarket.current = { defaultLocale: 'en' }
  })

  afterEach(() => {
    workspaceMarket.current = undefined
  })

  function textFile(name = 'note.txt') {
    const file = new File(['contenu'], name, { type: 'text/plain' })
    Object.defineProperty(file, 'text', { value: () => Promise.resolve('contenu'), configurable: true })
    return file
  }

  it('un nouveau dépôt part avec la langue de l’espace, sans y toucher', async () => {
    renderWithRouter(<Knowledge />)
    await openUploadAndSelect(textFile())
    fireEvent.click(screen.getByText('Envoyer'))

    await waitFor(() => expect(ingestMock).toHaveBeenCalledTimes(1))
    expect(ingestMock.mock.calls[0]![0]).toEqual(expect.objectContaining({ language: 'en' }))
  })

  it('reste modifiable : choisir une autre langue l’emporte sur le défaut', async () => {
    renderWithRouter(<Knowledge />)
    await openUploadAndSelect(textFile())
    await chooseOption(getSelect('Langue du document'), 'Français')
    fireEvent.click(screen.getByText('Envoyer'))

    await waitFor(() => expect(ingestMock).toHaveBeenCalledTimes(1))
    expect(ingestMock.mock.calls[0]![0]).toEqual(expect.objectContaining({ language: 'fr' }))
  })
})

/**
 * #2431.5 (reste, épopée #2886) — « Remplacer / actualiser » une source déjà
 * importée : le formulaire se pré-remplit avec le document VISÉ, l'envoi
 * ingère le nouveau (JAMAIS `ingest`) et lie l'ancien côté serveur.
 */
describe('Knowledge — remplacer un document (#2431.5)', () => {
  beforeEach(() => {
    replaceMock.mockReset().mockResolvedValue({ id: 'doc-new', partial: false })
    ingestMock.mockReset()
    toastSuccess.mockReset()
    toastError.mockReset()
    ragDocs.current = [
      {
        id: 'doc-old',
        title: 'Grille tarifaire',
        category: 'Commercial',
        created_at: '2026-09-10T10:00:00Z',
        user_id: 'u1',
      },
    ]
  })
  afterEach(() => {
    ragDocs.current = []
  })

  it('pré-remplit le formulaire avec le document visé et envoie via `replace`, jamais `ingest`', async () => {
    renderWithRouter(<Knowledge />)
    expect(await screen.findByText('Grille tarifaire')).toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('Remplacer'))
    expect(await screen.findByText(/Remplace « Grille tarifaire »/)).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/Template de prospection/i)).toHaveValue('Grille tarifaire')

    const txt = new File(['Nouveaux tarifs'], 'tarifs-v2.txt', { type: 'text/plain' })
    Object.defineProperty(txt, 'text', { value: () => Promise.resolve('Nouveaux tarifs'), configurable: true })
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [txt] } })
    fireEvent.click(screen.getByText('Envoyer'))

    await waitFor(() => expect(replaceMock).toHaveBeenCalledTimes(1))
    expect(replaceMock).toHaveBeenCalledWith({
      id: 'doc-old',
      input: expect.objectContaining({ title: 'Grille tarifaire', content: 'Nouveaux tarifs' }) as unknown,
    })
    expect(ingestMock).not.toHaveBeenCalled()
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Document remplacé'))
  })

  it('« Annuler le remplacement » ferme le formulaire sans rien envoyer', async () => {
    renderWithRouter(<Knowledge />)
    fireEvent.click(await screen.findByLabelText('Remplacer'))
    expect(await screen.findByText(/Remplace « Grille tarifaire »/)).toBeInTheDocument()

    fireEvent.click(screen.getByText('Annuler le remplacement'))
    expect(screen.queryByText(/Remplace « Grille tarifaire »/)).not.toBeInTheDocument()
    expect(replaceMock).not.toHaveBeenCalled()
  })
})

/**
 * #1954 — décision de Louis (12/09/2026) : les documents déjà ingérés depuis le
 * chat restent dans la base, INCHANGÉS, et sont MARQUÉS — aucune visibilité
 * retirée en silence. Le chat les dépose sous la catégorie technique `chat`.
 */
describe('Knowledge — documents joints depuis le chat (#1954)', () => {
  afterEach(() => {
    ragDocs.current = []
  })

  it('marque « Jointe depuis le chat » un document venu de la conversation, sans montrer la catégorie technique', async () => {
    ragDocs.current = [
      { id: 'd-chat', title: 'cv-camille.pdf', category: 'chat', created_at: '2026-09-10T10:00:00Z', user_id: 'u1' },
      {
        id: 'd-kb',
        title: 'Plaquette',
        category: 'Pitch commercial',
        created_at: '2026-09-09T10:00:00Z',
        user_id: 'u1',
      },
    ]
    renderWithRouter(<Knowledge />)

    expect(await screen.findByText('cv-camille.pdf')).toBeInTheDocument()
    expect(inLayout(screen.getAllByText('Jointe depuis le chat'))).toHaveLength(1)
    expect(screen.queryByText('chat')).not.toBeInTheDocument()
    // NON : un document déposé dans Connaissances garde sa catégorie, sans la marque.
    expect(inLayout(screen.getAllByText('Pitch commercial'))).toHaveLength(1)
  })
})

/**
 * VU (recette prod 09/10, lot H05) — « Mes documents » affichait le type BRUT
 * (`account_fact`, `winning_angle`…) pour un document DISTILLÉ par une analyse,
 * au lieu d'un libellé FR. `doc.category` reste du texte libre pour un dépôt
 * manuel (« Pitch commercial », « Notion »…) : il ne se traduit QUE quand il
 * vaut une des neuf catégories canoniques.
 */
describe('Knowledge — catégories distillées traduites, pas affichées en brut (VU recette prod 09/10)', () => {
  afterEach(() => {
    ragDocs.current = []
  })

  it('traduit une catégorie distillée (« account_fact », « winning_angle ») en libellé FR', async () => {
    ragDocs.current = [
      { id: 'd-1', title: 'Fait TGV Est', category: 'account_fact', created_at: '2026-09-10T10:00:00Z', user_id: 'u1' },
      {
        id: 'd-2',
        title: 'Argument gagnant',
        category: 'winning_angle',
        created_at: '2026-09-09T10:00:00Z',
        user_id: 'u1',
      },
    ]
    renderWithRouter(<Knowledge />)

    expect(inLayout(await screen.findAllByText('Fait sur un compte'))).toHaveLength(1)
    expect(inLayout(screen.getAllByText('Angle gagnant'))).toHaveLength(1)
    expect(screen.queryByText('account_fact')).not.toBeInTheDocument()
    expect(screen.queryByText('winning_angle')).not.toBeInTheDocument()
  })

  it('sait dire NON : une catégorie libre déposée par l’ESN reste affichée telle quelle', async () => {
    ragDocs.current = [
      { id: 'd-3', title: 'Page Notion', category: 'Notion', created_at: '2026-09-10T10:00:00Z', user_id: 'u1' },
    ]
    renderWithRouter(<Knowledge />)

    expect(inLayout(await screen.findAllByText('Notion'))).toHaveLength(1)
  })
})

describe('Knowledge', () => {
  it('renders without crash', async () => {
    renderWithRouter(<Knowledge />)
    // Title lives in the page header now; the view keeps only the subtitle.
    expect(await screen.findByText(/Templates, playbooks/i)).toBeInTheDocument()
  })

  it('renders upload section', async () => {
    renderWithRouter(<Knowledge />)
    expect(await screen.findByText('Ajouter un document')).toBeInTheDocument()
  })

  it('renders real templates from the API and a create button', async () => {
    renderWithRouter(<Knowledge />)
    fireEvent.click(await screen.findByText('Templates'))
    expect(await screen.findByText('Email de premier contact')).toBeInTheDocument()
    expect(screen.getByText('Nouveau template')).toBeInTheDocument()
  })

  it('surfaces the curated method playbooks under the Méthode tab', async () => {
    renderWithRouter(<Knowledge />)
    fireEvent.click(await screen.findByText('Méthode'))
    expect(await screen.findByText('Multi-threading : couvrir 3 niveaux, 12 contacts')).toBeInTheDocument()
    expect(screen.getByText('Lire le guide')).toBeInTheDocument()
  })
})

describe('Knowledge — supprimer un document (#3797)', () => {
  beforeEach(() => {
    deleteMock.mockReset().mockResolvedValue(undefined)
    ragDocs.current = [
      {
        id: 'doc-a',
        title: 'Grille tarifaire',
        category: 'Commercial',
        created_at: '2026-09-10T10:00:00Z',
        user_id: 'u1',
      },
    ]
  })
  afterEach(() => {
    ragDocs.current = []
  })

  it('un clic sur « Supprimer » ne supprime RIEN : il demande confirmation en nommant le document', async () => {
    renderWithRouter(<Knowledge />)
    fireEvent.click(await screen.findByLabelText('Supprimer « Grille tarifaire »'))
    expect(deleteMock).not.toHaveBeenCalled()
    expect(await screen.findByText('Supprimer « Grille tarifaire » ?')).toBeInTheDocument()
  })

  it('« Garder le document » ferme sans supprimer', async () => {
    renderWithRouter(<Knowledge />)
    fireEvent.click(await screen.findByLabelText('Supprimer « Grille tarifaire »'))
    fireEvent.click(await screen.findByText('Garder le document'))
    await waitFor(() => expect(screen.queryByText('Supprimer « Grille tarifaire » ?')).not.toBeInTheDocument())
    expect(deleteMock).not.toHaveBeenCalled()
  })

  it('la confirmation supprime CE document-là', async () => {
    renderWithRouter(<Knowledge />)
    fireEvent.click(await screen.findByLabelText('Supprimer « Grille tarifaire »'))
    fireEvent.click(await screen.findByText('Supprimer définitivement'))
    await waitFor(() => expect(deleteMock).toHaveBeenCalledWith('doc-a'))
  })

  it('le bouton est une cible ≥ 44 px et visible au focus clavier, pas seulement au survol', async () => {
    renderWithRouter(<Knowledge />)
    const button = await screen.findByLabelText('Supprimer « Grille tarifaire »')
    expect(button.className).toContain('size-11')
    // Refonte Théo V22 : les gestes d'une ligne sont TOUJOURS visibles — jamais masqués en attendant un survol.
    expect(button.className).not.toMatch(/(^|\s)opacity-0/)
  })

  it('structure Théo V22 : les documents sont un TABLEAU (Document · Usage · Accès · État), pas une grille de cartes', async () => {
    renderWithRouter(<Knowledge />)
    const table = await screen.findByRole('table', { name: 'Mes documents' })
    const headers = [...table.querySelectorAll('th')].map(th => th.textContent)
    expect(headers.slice(0, 4)).toEqual(['Document', 'Usage', 'Accès', 'État'])
    expect(table.querySelector('[data-knowledge-doc="doc-a"]')).not.toBeNull()
  })
})
