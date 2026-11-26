import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { CreateContactDialog } from './CreateContactDialog'

const createContact = vi.fn()
const createAccount = vi.fn()

vi.mock('../hooks/useRecordEdit', () => ({
  useCreateContact: () => ({ mutate: createContact, isPending: false }),
}))

vi.mock('@/features/accounts/hooks/useAccounts', () => ({
  useAccounts: () => ({ data: { pages: [{ data: [{ id: ACCOUNT, company_name: 'BNP Paribas' }] }] } }),
}))

vi.mock('@/features/accounts/api', () => ({
  accountKeys: { all: ['accounts'] },
  accountsApi: { create: (name: string) => createAccount(name) },
}))

const ACCOUNT = '11111111-1111-4111-8111-111111111111'
const NEW_ACCOUNT = '22222222-2222-4222-8222-222222222222'

beforeEach(() => {
  createContact.mockReset()
  createAccount.mockReset().mockResolvedValue({ id: NEW_ACCOUNT, company_name: 'Cardif' })
})

/**
 * #1317 — « la création d'un contact est trop liée à un dossier déjà existant ».
 *
 * Le geste empêché, dans les mots du retour : « je peux ajouter Marie Dupont,
 * la rattacher à BNP Paribas, entité Cardif, sans avoir encore lancé une
 * analyse complète BNP ».
 */
describe('CreateContactDialog', () => {
  it('envoie l’ENTITÉ saisie — le contrat la portait, la modale ne l’envoyait pas (#1317.2)', async () => {
    renderWithRouter(<CreateContactDialog accountId={ACCOUNT} open onOpenChange={() => {}} />)

    await userEvent.type(await screen.findByLabelText('Nom'), 'Marie Dupont')
    await userEvent.type(screen.getByLabelText('Entité'), 'Cardif')
    await userEvent.click(screen.getByRole('button', { name: 'Créer le contact' }))

    expect(createContact).toHaveBeenCalledWith(expect.objectContaining({ entity: 'Cardif' }), expect.anything())
  })

  it('rend l’entité ABSENTE plutôt qu’une chaîne vide (#1317.2)', async () => {
    renderWithRouter(<CreateContactDialog accountId={ACCOUNT} open onOpenChange={() => {}} />)

    await userEvent.type(await screen.findByLabelText('Nom'), 'Marie Dupont')
    await userEvent.click(screen.getByRole('button', { name: 'Créer le contact' }))

    expect(createContact).toHaveBeenCalledWith(expect.objectContaining({ entity: null }), expect.anything())
  })

  it('crée l’entreprise à la volée, sans lancer d’analyse (#1317.1)', async () => {
    renderWithRouter(<CreateContactDialog open onOpenChange={() => {}} />)

    await userEvent.click(await screen.findByRole('button', { name: 'Créer une entreprise' }))
    await userEvent.type(screen.getByLabelText('Nom de l’entreprise à créer'), 'Cardif')
    await userEvent.click(screen.getByRole('button', { name: 'Créer « Cardif »' }))

    await waitFor(() => expect(createAccount).toHaveBeenCalledWith('Cardif'))
  })

  it('n’affiche pas de guillemets VIDES tant que rien n’est saisi (#1317.1)', async () => {
    // Vu à la recette du 03/09 : « Créer «  » » — deux guillemets encadrant du
    // vide. Le bouton est désactivé, mais la paire vide se lit comme un défaut.
    renderWithRouter(<CreateContactDialog open onOpenChange={() => {}} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Créer une entreprise' }))

    expect(screen.queryByRole('button', { name: 'Créer «  »' })).not.toBeInTheDocument()
    // Deux boutons portent alors ce nom : la bascule d'origine a disparu, il
    // reste celui du formulaire, qui dit ce qu'il fera.
    expect(screen.getByRole('button', { name: 'Créer une entreprise' })).toBeDisabled()

    await userEvent.type(screen.getByLabelText('Nom de l’entreprise à créer'), 'Cardif')
    expect(screen.getByRole('button', { name: 'Créer « Cardif »' })).toBeEnabled()
  })

  it('n’offre le mode création QUE lorsqu’il faut choisir une entreprise (#1317.1)', async () => {
    // La garde sait dire NON : depuis l'onglet Contacts d'un dossier, le compte
    // est déjà connu — proposer d'en créer un autre n'aurait aucun sens.
    renderWithRouter(<CreateContactDialog accountId={ACCOUNT} open onOpenChange={() => {}} />)
    // ⚠️ Attendre un élément RÉELLEMENT présent d'abord : le routeur de test
    // monte en asynchrone, et un `queryBy` synchrone passerait sur un DOM vide
    // — la garde ne prouverait rien.
    await screen.findByLabelText('Nom')

    expect(screen.queryByRole('button', { name: 'Créer une entreprise' })).not.toBeInTheDocument()
  })

  it('mène à l’assistant d’import, sans le dupliquer (#1317.3)', async () => {
    renderWithRouter(<CreateContactDialog accountId={ACCOUNT} open onOpenChange={() => {}} />)

    expect(await screen.findByRole('link', { name: 'Importer des contacts' })).toHaveAttribute(
      'href',
      '/settings/mes-donnees?tab=imports',
    )
  })
})
