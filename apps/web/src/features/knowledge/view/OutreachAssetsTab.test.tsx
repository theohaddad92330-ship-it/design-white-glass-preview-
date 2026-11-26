import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { OutreachAssetsTab } from './OutreachAssetsTab'
import { chooseOption } from '@/test/select'

/**
 * #2838 — le catalogue d'assets outreach avait 0 appelant écran avant ce
 * lot ; l'écran était ensuite resté LECTURE SEULE. Ces tests défendent la
 * lecture (chargement, erreur, vide, rendu des deux axes réels) ET
 * l'écriture (création, édition, suppression) désormais branchée sur le
 * CRUD déjà existant côté API (`OutreachAssetService`).
 */
const {
  useOutreachAssetsMock,
  createMutateAsync,
  updateMutateAsync,
  deleteMutateAsync,
  useCreateOutreachAssetMock,
  useUpdateOutreachAssetMock,
  useDeleteOutreachAssetMock,
  attachMutateAsync,
  detachMutateAsync,
} = vi.hoisted(() => ({
  attachMutateAsync: vi.fn(),
  detachMutateAsync: vi.fn(),
  useOutreachAssetsMock: vi.fn(),
  createMutateAsync: vi.fn(),
  updateMutateAsync: vi.fn(),
  deleteMutateAsync: vi.fn(),
  useCreateOutreachAssetMock: vi.fn(),
  useUpdateOutreachAssetMock: vi.fn(),
  useDeleteOutreachAssetMock: vi.fn(),
}))
vi.mock('@/features/outreach-assets/hooks/useOutreachAssets', () => ({
  useOutreachAssets: useOutreachAssetsMock,
  useCreateOutreachAsset: useCreateOutreachAssetMock,
  useUpdateOutreachAsset: useUpdateOutreachAssetMock,
  useDeleteOutreachAsset: useDeleteOutreachAssetMock,
  useAttachOutreachAssetFile: () => ({ mutateAsync: attachMutateAsync, isPending: false }),
  useDetachOutreachAssetFile: () => ({ mutateAsync: detachMutateAsync, isPending: false }),
}))
const { toastError } = vi.hoisted(() => ({ toastError: vi.fn() }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: toastError } }))

const ASSETS = [
  {
    id: 'a1',
    title: 'Plaquette 2026',
    description: 'La plaquette générale ESN',
    category: 'company_brochure' as const,
    usageRights: 'always' as const,
    file: { fileName: 'plaquette.pdf', contentType: 'application/pdf', byteSize: 2048, sha256: null },
    createdAt: '',
    updatedAt: '',
  },
  {
    id: 'a2',
    title: 'Cas client ACME',
    description: null,
    category: 'case_study' as const,
    usageRights: 'after_interest_confirmed' as const,
    file: null,
    createdAt: '',
    updatedAt: '',
  },
]

beforeEach(() => {
  createMutateAsync.mockReset().mockResolvedValue(undefined)
  updateMutateAsync.mockReset().mockResolvedValue(undefined)
  deleteMutateAsync.mockReset().mockResolvedValue(undefined)
  useCreateOutreachAssetMock.mockReturnValue({ mutateAsync: createMutateAsync, isPending: false })
  useUpdateOutreachAssetMock.mockReturnValue({ mutateAsync: updateMutateAsync, isPending: false })
  useDeleteOutreachAssetMock.mockReturnValue({ mutateAsync: deleteMutateAsync, isPending: false })
})

describe('OutreachAssetsTab', () => {
  it('affiche le chargement', () => {
    useOutreachAssetsMock.mockReturnValue({ data: undefined, isLoading: true, isError: false })
    render(<OutreachAssetsTab />)
    expect(document.querySelector('.animate-spin')).toBeInTheDocument()
  })

  it('dit l’échec plutôt qu’une liste vide', () => {
    useOutreachAssetsMock.mockReturnValue({ data: undefined, isLoading: false, isError: true })
    render(<OutreachAssetsTab />)
    expect(screen.getByText(/n'a pas pu être lu/)).toBeInTheDocument()
  })

  it('dit le vide, jamais une liste sans rien dedans', () => {
    useOutreachAssetsMock.mockReturnValue({ data: [], isLoading: false, isError: false })
    render(<OutreachAssetsTab />)
    expect(screen.getByText(/Aucun asset/)).toBeInTheDocument()
  })

  it('rend chaque asset avec sa catégorie et ses droits d’usage', () => {
    useOutreachAssetsMock.mockReturnValue({ data: ASSETS, isLoading: false, isError: false })
    render(<OutreachAssetsTab />)
    expect(screen.getByText('Plaquette 2026')).toBeInTheDocument()
    expect(screen.getByText('La plaquette générale ESN')).toBeInTheDocument()
    expect(screen.getByText('Plaquette')).toBeInTheDocument()
    expect(screen.getByText('Envoi libre')).toBeInTheDocument()
    expect(screen.getByText('Cas client ACME')).toBeInTheDocument()
    expect(screen.getByText('Cas client')).toBeInTheDocument()
    expect(screen.getByText('Envoi après intérêt confirmé')).toBeInTheDocument()
  })

  it('crée un asset depuis le formulaire, catégorie et droits par défaut', async () => {
    useOutreachAssetsMock.mockReturnValue({ data: [], isLoading: false, isError: false })
    render(<OutreachAssetsTab />)

    await userEvent.click(screen.getByRole('button', { name: /Nouvel asset/i }))
    await userEvent.type(screen.getByLabelText('Titre'), 'Cas client Orange')
    await userEvent.click(screen.getByRole('button', { name: /^Créer$/i }))

    expect(createMutateAsync).toHaveBeenCalledWith({
      title: 'Cas client Orange',
      description: null,
      category: 'case_study',
      usageRights: 'always',
    })
  })

  it('refuse de créer sans titre', async () => {
    useOutreachAssetsMock.mockReturnValue({ data: [], isLoading: false, isError: false })
    render(<OutreachAssetsTab />)

    await userEvent.click(screen.getByRole('button', { name: /Nouvel asset/i }))
    expect(screen.getByRole('button', { name: /^Créer$/i })).toBeDisabled()
    expect(createMutateAsync).not.toHaveBeenCalled()
  })

  it('édite un asset existant, valeurs pré-remplies', async () => {
    useOutreachAssetsMock.mockReturnValue({ data: ASSETS, isLoading: false, isError: false })
    render(<OutreachAssetsTab />)

    await userEvent.click(screen.getByRole('button', { name: /Modifier Plaquette 2026/i }))
    const titleInput = screen.getByLabelText('Titre') as HTMLInputElement
    expect(titleInput.value).toBe('Plaquette 2026')

    await userEvent.clear(titleInput)
    await userEvent.type(titleInput, 'Plaquette 2027')
    await chooseOption(screen.getByRole('combobox', { name: "Droits d'usage" }), 'after_interest_confirmed')
    await userEvent.click(screen.getByRole('button', { name: /^Enregistrer$/i }))

    expect(updateMutateAsync).toHaveBeenCalledWith({
      id: 'a1',
      patch: {
        title: 'Plaquette 2027',
        description: 'La plaquette générale ESN',
        category: 'company_brochure',
        usageRights: 'after_interest_confirmed',
      },
    })
  })

  it('supprime un asset', async () => {
    useOutreachAssetsMock.mockReturnValue({ data: ASSETS, isLoading: false, isError: false })
    render(<OutreachAssetsTab />)

    await userEvent.click(screen.getByRole('button', { name: /Supprimer Cas client ACME/i }))
    expect(deleteMutateAsync).toHaveBeenCalledWith('a2')
  })
})

// #3699.6 — la bibliothèque de documents attachables : le fichier réel d'un asset.
describe('OutreachAssetsTab — fichier d’un asset (#3699.6)', () => {
  beforeEach(() => {
    attachMutateAsync.mockReset().mockResolvedValue(undefined)
    detachMutateAsync.mockReset().mockResolvedValue(undefined)
    toastError.mockReset()
    useOutreachAssetsMock.mockReturnValue({ data: ASSETS, isLoading: false, isError: false })
  })

  it('nomme le fichier rangé (nom · taille) et permet de le retirer', async () => {
    render(<OutreachAssetsTab />)
    expect(screen.getByText('plaquette.pdf · 2 KB')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Retirer le fichier de « Plaquette 2026 »' }))
    expect(detachMutateAsync).toHaveBeenCalledWith('a1')
  })

  it('dépose le fichier choisi en base64 sur l’asset sans fichier', async () => {
    render(<OutreachAssetsTab />)
    const input = screen.getByLabelText(/Joindre un fichier/) as HTMLInputElement
    expect(input.accept).toContain('.pdf')
    const file = new File(['%PDF-1.4'], 'cas-client.pdf', { type: 'application/pdf' })
    await userEvent.upload(input, file)
    await vi.waitFor(() => expect(attachMutateAsync).toHaveBeenCalledTimes(1))
    expect(attachMutateAsync).toHaveBeenCalledWith({
      id: 'a2',
      upload: expect.objectContaining({ fileName: 'cas-client.pdf', fileB64: expect.any(String) }),
    })
  })

  it('SAIT DIRE NON — un fichier plus lourd que la borne d’un e-mail est refusé avant tout envoi', async () => {
    render(<OutreachAssetsTab />)
    const input = screen.getByLabelText(/Joindre un fichier/) as HTMLInputElement
    const heavy = new File(['x'], 'lourd.pdf', { type: 'application/pdf' })
    Object.defineProperty(heavy, 'size', { value: 4 * 1024 * 1024 })
    await userEvent.upload(input, heavy)
    expect(attachMutateAsync).not.toHaveBeenCalled()
    expect(toastError).toHaveBeenCalled()
  })
})
