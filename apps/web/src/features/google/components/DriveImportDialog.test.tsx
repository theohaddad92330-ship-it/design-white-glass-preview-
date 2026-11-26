import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { DriveImportDialog } from './DriveImportDialog'

/**
 * D-77 : la recherche par CONTENU était livrée côté serveur
 * (`GET /google/drive/search`, `fullText contains`) et AUCUN écran ne l'appelait.
 *
 * Le dialogue ne tapait que `/google/drive/files`, qui filtre sur le NOM. Un
 * commercial qui cherche « la proposition où on parle de Kubernetes » ne trouvait
 * rien — la proposition s'appelle `Proposition_ACME_v3.pdf`, jamais « Kubernetes ».
 *
 * Ces tests tiennent les quatre choses qui rendent la capacité réelle : la route
 * de contenu est APPELÉE, ses résultats sont RENDUS, le contrat serveur
 * (`q` ≥ 2 caractères) est respecté, et un échec se DIT au lieu de ressembler à
 * un espace documentaire vide.
 */

const driveFilesMock = vi.fn()
const driveSearchMock = vi.fn()
const googleStatusMock = vi.fn()

vi.mock('@/features/google/api', () => ({
  googleApi: {
    driveFiles: (...args: unknown[]) => driveFilesMock(...args),
    driveSearch: (...args: unknown[]) => driveSearchMock(...args),
    driveIngest: vi.fn(),
  },
}))

vi.mock('@/features/google/hooks/useGoogleStatus', () => ({
  useGoogleStatus: () => googleStatusMock(),
}))

const GOOGLE_DOC = 'application/vnd.google-apps.document'

function file(id: string, name: string, mimeType: string = GOOGLE_DOC) {
  return { id, name, mimeType, modifiedTime: '2026-08-20T10:00:00.000Z' }
}

/** La forme QUALIFIÉE que rend `/google/drive/search` (`connectorSearchResult`). */
function searchPage(items: ReturnType<typeof file>[]) {
  return { items, searched: true as const, scanned: null, nextPageToken: null }
}

beforeEach(() => {
  vi.clearAllMocks()
  googleStatusMock.mockReturnValue({
    data: { configured: true, connected: true, capabilities: { drive: true } },
    isLoading: false,
  })
  driveFilesMock.mockResolvedValue({ files: [], nextPageToken: null })
  driveSearchMock.mockResolvedValue(searchPage([]))
})

describe('DriveImportDialog — recherche par contenu (D-77)', () => {
  it('appelle la route de CONTENU et rend un document que la recherche par nom ne trouve pas', async () => {
    const user = userEvent.setup()
    // Le nom ne contient pas « Kubernetes » : la route par nom ne rend rien.
    driveFilesMock.mockResolvedValue({ files: [], nextPageToken: null })
    driveSearchMock.mockResolvedValue(searchPage([file('f1', 'Proposition_ACME_v3.pdf', 'application/pdf')]))

    renderWithRouter(<DriveImportDialog open onOpenChange={() => {}} />)

    await user.type(await screen.findByPlaceholderText(/nom ou.*contenu/i), 'Kubernetes')

    // La route de contenu est bien appelée, avec le contrat qu'elle expose (`q`).
    await waitFor(() => expect(driveSearchMock).toHaveBeenCalledWith({ q: 'Kubernetes' }))
    // ...et son résultat est RENDU : c'est ce qui manquait.
    expect(await screen.findByText('Proposition_ACME_v3.pdf')).toBeInTheDocument()
  })

  it('fusionne nom et contenu sans doublon, et signale ce qui vient du contenu', async () => {
    const user = userEvent.setup()
    driveFilesMock.mockResolvedValue({ files: [file('f1', 'Kubernetes - notes.gdoc')], nextPageToken: null })
    driveSearchMock.mockResolvedValue(
      searchPage([
        file('f1', 'Kubernetes - notes.gdoc'), // déjà rendu par le nom → une seule ligne
        file('f2', 'Proposition_ACME_v3.pdf', 'application/pdf'),
      ]),
    )

    renderWithRouter(<DriveImportDialog open onOpenChange={() => {}} />)
    await user.type(await screen.findByPlaceholderText(/nom ou.*contenu/i), 'Kubernetes fusion')

    expect(await screen.findByText('Proposition_ACME_v3.pdf')).toBeInTheDocument()
    // Dédoublonnage par id : le fichier trouvé DEUX fois n'apparaît qu'une.
    expect(screen.getAllByText('Kubernetes - notes.gdoc')).toHaveLength(1)
    // Le résultat qui ne doit sa présence qu'au contenu le DIT.
    expect(screen.getByText(/dans le contenu/i)).toBeInTheDocument()
  })

  it('écarte un résultat de contenu que l’import refuserait (ni document ni PDF)', async () => {
    const user = userEvent.setup()
    driveSearchMock.mockResolvedValue(
      searchPage([file('f9', 'Budget.xlsx', 'application/vnd.google-apps.spreadsheet')]),
    )

    renderWithRouter(<DriveImportDialog open onOpenChange={() => {}} />)
    await user.type(await screen.findByPlaceholderText(/nom ou.*contenu/i), 'budget mimetype')

    await waitFor(() => expect(driveSearchMock).toHaveBeenCalled())
    // La route de contenu ne filtre pas les types ; l'ingestion, elle, n'accepte
    // que Docs et PDF. Proposer un tableur ne mènerait qu'à un 400 après le clic.
    expect(screen.queryByText('Budget.xlsx')).toBeNull()
  })

  it('ne tape PAS la route de contenu sous 2 caractères (le serveur exige q ≥ 2)', async () => {
    const user = userEvent.setup()
    renderWithRouter(<DriveImportDialog open onOpenChange={() => {}} />)

    await user.type(await screen.findByPlaceholderText(/nom ou.*contenu/i), 'K')

    await waitFor(() => expect(driveFilesMock).toHaveBeenCalledWith({ search: 'K' }))
    // Un `q` d'un caractère serait rejeté en 400 : on ne l'envoie pas.
    expect(driveSearchMock).not.toHaveBeenCalled()
  })

  it('dit qu’une recherche a ÉCHOUÉ au lieu d’afficher un espace documentaire vide', async () => {
    const user = userEvent.setup()
    driveSearchMock.mockRejectedValue(new Error('Drive indisponible'))

    renderWithRouter(<DriveImportDialog open onOpenChange={() => {}} />)
    await user.type(await screen.findByPlaceholderText(/nom ou.*contenu/i), 'Kubernetes panne')

    // « Aucun document » et « je n'ai pas pu chercher » ne se ressemblent pas.
    expect(await screen.findByText(/recherche.*a échoué/i)).toBeInTheDocument()
    expect(screen.queryByText('Aucun document trouvé dans ton espace documentaire.')).toBeNull()
  })
})
