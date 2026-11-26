import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import { DeclareOrgPanel } from './DeclareOrgPanel'

/**
 * #3740 — « importer un organigramme et si des personnes correspondent,
 * l'enrichir avec les données de Bellum ». Le tour : un fichier est choisi →
 * l'aperçu dit, personne par personne, ce que Bellum sait déjà (coordonnées en
 * clair) AVANT que rien ne soit ajouté.
 */
const previewMutate = vi.fn()
const declareMutate = vi.fn()
const fromFileMutate = vi.fn()
const importMutate = vi.fn()
const verifyMutate = vi.fn()
const fromDocumentsMutate = vi.fn()

vi.mock('@/features/accounts/hooks/useDeclareOrgPeople', () => ({
  useDeclareOrgPeople: () => ({ mutate: declareMutate, isPending: false }),
  useProposeOrgPeopleFromText: () => ({ mutate: vi.fn(), isPending: false }),
  usePreviewOrgPeople: () => ({ mutate: previewMutate, isPending: false }),
  useProposeOrgPeopleFromFile: () => ({ mutate: fromFileMutate, isPending: false }),
  useProposeOrgPeopleFromDocuments: () => ({ mutate: fromDocumentsMutate, isPending: false }),
  useImportOrgChartPeople: () => ({ mutate: importMutate, isPending: false }),
}))

vi.mock('@/features/contacts/hooks/useBulkVerifyContacts', () => ({
  useBulkVerifyContacts: () => ({ mutate: verifyMutate, isPending: false }),
}))

const csv = 'nom,fonction\nJean Dupont,DSI\nInconnue Totale,RSSI\n'

describe('DeclareOrgPanel — aperçu de l’import (#3740.1)', () => {
  beforeEach(async () => {
    previewMutate.mockReset()
    declareMutate.mockReset()
    await i18n.changeLanguage('fr')
  })

  it('un fichier choisi : l’aperçu est demandé puis affiche connu / inconnu, e-mail et téléphone en clair', async () => {
    previewMutate.mockImplementation((_people, opts) =>
      opts.onSuccess({
        rows: [
          {
            fullName: 'Jean Dupont',
            match: 'known_contact',
            bellum: { email: 'jean.dupont@acme.fr', phone: '+33 1 02 03 04 05' },
            fills: ['linkedinUrl'],
          },
          { fullName: 'Inconnue Totale', match: 'new', fills: [] },
        ],
      }),
    )
    const user = userEvent.setup()
    const { container } = render(<DeclareOrgPanel accountId="a1" />)

    await user.upload(
      container.querySelector('input[type="file"]') as HTMLInputElement,
      new File([csv], 'orga.csv', { type: 'text/csv' }),
    )

    await waitFor(() => expect(previewMutate).toHaveBeenCalledTimes(1))
    expect(previewMutate.mock.calls[0]![0]).toHaveLength(2)
    expect(await screen.findByText(/jean\.dupont@acme\.fr · \+33 1 02 03 04 05/)).toBeInTheDocument()
    expect(screen.getByText(i18n.t('accounts:orgDeclare.file.preview.known_contact'))).toBeInTheDocument()
    expect(screen.getByText(i18n.t('accounts:orgDeclare.file.preview.new'))).toBeInTheDocument()
    expect(screen.getByText(/1 sur 2 connues de Bellum/)).toBeInTheDocument()
    expect(declareMutate).not.toHaveBeenCalled() // l'aperçu n'écrit rien
  })
})

/**
 * #2553 / #3740 — « importer mon organigramme (PDF, image, PowerPoint de
 * 2023-2025) ». Le fichier non-CSV est lu côté serveur ; ce qui revient est une
 * PROPOSITION relue avant écriture, datée, avec un badge quand elle a plus de
 * douze mois.
 */
describe('DeclareOrgPanel — organigramme PDF / image / PPTX (#2553, #3740)', () => {
  beforeEach(async () => {
    previewMutate.mockReset()
    declareMutate.mockReset()
    fromFileMutate.mockReset()
    await i18n.changeLanguage('fr')
  })

  const pickPdf = async (lastModified: number) => {
    fromFileMutate.mockImplementation((_file, opts) =>
      opts.onSuccess({ people: [{ fullName: 'Jean Dupont', title: 'DSI' }], dropped: ['Fantome'] }),
    )
    const user = userEvent.setup()
    const { container } = render(<DeclareOrgPanel accountId="a1" />)
    await user.upload(
      container.querySelector('input[type="file"]') as HTMLInputElement,
      new File(['%PDF-1.4'], 'orga.pdf', { type: 'application/pdf', lastModified }),
    )
    return user
  }

  it('accepte PDF, image et PPTX en plus du CSV', () => {
    const { container } = render(<DeclareOrgPanel accountId="a1" />)
    const accept = (container.querySelector('input[type="file"]') as HTMLInputElement).accept
    for (const ext of ['.csv', '.pdf', '.png', '.jpg', '.pptx', '.xlsx']) expect(accept).toContain(ext)
  })

  it('un PDF part à la lecture serveur ; la proposition est aperçue sans rien écrire', async () => {
    await pickPdf(Date.UTC(2023, 5, 1))
    await waitFor(() => expect(fromFileMutate).toHaveBeenCalledTimes(1))
    expect(fromFileMutate.mock.calls[0]![0]).toMatchObject({ filename: 'orga.pdf' })
    expect(typeof fromFileMutate.mock.calls[0]![0].fileB64).toBe('string')
    expect(previewMutate).toHaveBeenCalledTimes(1)
    expect(declareMutate).not.toHaveBeenCalled()
    expect(await screen.findByText(/Fantome/)).toBeInTheDocument() // ce qui a été retiré est nommé
  })

  it('l’année est préremplie depuis le fichier ; plus de 12 mois : badge « Donnée de 2023 »', async () => {
    await pickPdf(Date.UTC(2023, 5, 1))
    const date = (await screen.findByLabelText(
      i18n.t('accounts:orgDeclare.file.documentDateLabel'),
    )) as HTMLInputElement
    expect(date.value).toBe('2023-06-01')
    expect(screen.getByText('Donnée de 2023')).toBeInTheDocument()
  })

  it('un document récent ne porte aucun badge', async () => {
    await pickPdf(Date.now())
    await screen.findByLabelText(i18n.t('accounts:orgDeclare.file.documentDateLabel'))
    expect(screen.queryByText(/^Donnée de \d{4}$/)).not.toBeInTheDocument()
  })
})

/**
 * #2553 / #3740 — « les mettre dans les contacts, puis les enrichir à volonté ».
 * Valider l'aperçu crée les contacts (les connus se lient) ; l'écran de résultat
 * propose « Enrichir les N contacts sélectionnés », coût annoncé AVANT le geste.
 */
describe('DeclareOrgPanel — contacts créés puis enrichissement (#2553, #3740)', () => {
  beforeEach(async () => {
    previewMutate.mockReset()
    declareMutate.mockReset()
    fromFileMutate.mockReset()
    importMutate.mockReset()
    verifyMutate.mockReset()
    await i18n.changeLanguage('fr')
  })

  const importPdf = async () => {
    fromFileMutate.mockImplementation((_file, opts) =>
      opts.onSuccess({
        people: [{ fullName: 'Jean Dupont', title: 'DSI' }, { fullName: 'Eloise Martin' }],
        dropped: [],
      }),
    )
    importMutate.mockImplementation((_people, opts) =>
      opts.onSuccess({
        graphVersion: 2,
        declared: 2,
        grafted: true,
        contacts: [
          { fullName: 'Jean Dupont', contactId: 'c-1', status: 'created' },
          { fullName: 'Eloise Martin', contactId: 'c-2', status: 'linked' },
        ],
      }),
    )
    const user = userEvent.setup()
    const { container } = render(<DeclareOrgPanel accountId="a1" />)
    await user.upload(
      container.querySelector('input[type="file"]') as HTMLInputElement,
      new File(['%PDF-1.4'], 'orga.pdf', { type: 'application/pdf', lastModified: Date.UTC(2023, 5, 1) }),
    )
    await user.click(await screen.findByRole('button', { name: /Ajouter 2 personnes/ }))
    return user
  }

  it('valider crée les contacts : écrit via l’import, pas via la simple déclaration', async () => {
    await importPdf()
    expect(importMutate).toHaveBeenCalledTimes(1)
    expect(declareMutate).not.toHaveBeenCalled()
    expect(importMutate.mock.calls[0]![0]).toHaveLength(2)
    expect(importMutate.mock.calls[0]![0][0]).toMatchObject({ documentDate: '2023-06-01' })
  })

  it('le résultat dit créé / déjà connu, et propose d’enrichir les contacts sélectionnés, sans coût affiché (#4463)', async () => {
    const user = await importPdf()
    expect(await screen.findByText(/1 contact créé/)).toBeInTheDocument()
    expect(screen.getByText(/1 déjà connu, lié sans rien écraser/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Enrichir les 2 contacts sélectionnés/ }))
    expect(verifyMutate).toHaveBeenCalledTimes(1)
    expect(document.body).not.toHaveTextContent(/cr[ée]dit/i)
  })

  it('on peut décocher une personne : seuls les contacts cochés partent à l’enrichissement', async () => {
    const user = await importPdf()
    await user.click(await screen.findByRole('checkbox', { name: /Eloise Martin/ }))
    await user.click(screen.getByRole('button', { name: /Enrichir le contact sélectionné/ }))
    expect(verifyMutate).toHaveBeenCalledWith(['c-1'])
  })
})

/**
 * #4072.1 — « lire les organigrammes de mes documents » : le bouton appelle la
 * lecture des documents de l'espace, et ce qui revient est une PROPOSITION
 * relue avant écriture (même aperçu que le fichier), datée par document.
 */
describe('DeclareOrgPanel — organigramme lu dans les documents (#4072.1)', () => {
  beforeEach(async () => {
    previewMutate.mockReset()
    declareMutate.mockReset()
    fromDocumentsMutate.mockReset()
    await i18n.changeLanguage('fr')
  })

  it('le bouton lit les documents, montre la proposition, et n’écrit rien', async () => {
    fromDocumentsMutate.mockImplementation((_vars, opts) =>
      opts.onSuccess({
        people: [{ fullName: 'Jean Dupont', title: 'DSI', documentDate: '2024-03-01' }],
        documentsRead: 2,
        truncated: false,
      }),
    )
    const user = userEvent.setup()
    render(<DeclareOrgPanel accountId="a1" />)

    await user.click(screen.getByRole('button', { name: i18n.t('accounts:orgDeclare.documents.read') }))

    expect(fromDocumentsMutate).toHaveBeenCalledTimes(1)
    expect(previewMutate).toHaveBeenCalledTimes(1)
    expect(declareMutate).not.toHaveBeenCalled()
    expect(await screen.findByText(i18n.t('accounts:orgDeclare.file.read', { count: 1 }))).toBeInTheDocument()
  })

  it('aucune personne trouvée : on le dit, sans proposition vide muette', async () => {
    fromDocumentsMutate.mockImplementation((_vars, opts) =>
      opts.onSuccess({ people: [], documentsRead: 3, truncated: false }),
    )
    const user = userEvent.setup()
    render(<DeclareOrgPanel accountId="a1" />)

    await user.click(screen.getByRole('button', { name: i18n.t('accounts:orgDeclare.documents.read') }))

    expect(await screen.findByText(i18n.t('accounts:orgDeclare.documents.nobody', { count: 3 }))).toBeInTheDocument()
  })
})
