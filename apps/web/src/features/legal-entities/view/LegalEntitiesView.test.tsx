import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LegalEntity } from '@bellum/contracts'
import { i18n } from '@/i18n'
import { LegalEntitiesView } from './LegalEntitiesView'

/**
 * RÉGLAGES › SOCIÉTÉS — l'écran qui rend atteignable une capacité livrée.
 *
 * Ce que ces cas tiennent, et pourquoi chacun :
 *  · un identifiant légal absent est NOMMÉ, jamais rendu vide ni « 0 » ;
 *  · un échec de lecture ne se déguise pas en « aucune société déclarée » —
 *    « cassé » et « non mesurable » se ressemblent trop pour qu'on les confonde ;
 *  · sans droit de facturation, AUCUN geste d'écriture n'est offert, et la
 *    raison est écrite plutôt que devinée ;
 *  · il n'existe AUCUN geste de suppression — ce n'est pas une convention, c'est
 *    l'absence de bouton.
 */

const useLegalEntitiesMock = vi.fn()
const createMock = vi.fn()
const updateMock = vi.fn()
const archiveMock = vi.fn()
const useTeamMock = vi.fn()

// L'entête est personnalisé (#1519) et porte un lien vers le copilote : le
// hook de prénom tire la session, et `AskLaura` monte un `Link`. Ni l'un ni
// l'autre n'est le sujet de ce fichier.
vi.mock('@/hooks/useFirstName', () => ({ useFirstName: () => 'Louis' }))
vi.mock('@/features/mobile/useIsMobile', () => ({ useIsMobile: () => false }))
vi.mock('@/components/primitives/AskLaura', () => ({ AskLaura: () => null }))

vi.mock('../api', () => ({
  useLegalEntities: () => useLegalEntitiesMock(),
  useCreateLegalEntity: () => ({ mutate: createMock, isPending: false }),
  useUpdateLegalEntity: () => ({ mutate: updateMock, isPending: false }),
  useArchiveLegalEntity: () => ({ mutate: archiveMock, isPending: false }),
}))

vi.mock('@/features/team/hooks/useTeam', () => ({ useTeam: () => useTeamMock() }))

const ENTITY: LegalEntity = {
  id: '11111111-1111-4111-8111-111111111111',
  workspace_id: '22222222-2222-4222-8222-222222222222',
  name: 'Astréa Conseil',
  registration_number: '812345678',
  country: 'FR',
  vat_number: 'FR12812345678',
  address: '12 rue de la Paix, 75002 Paris',
  currency: 'EUR',
  archived: false,
  created_at: '2026-01-01T00:00:00.000Z',
}

function asOwner() {
  useTeamMock.mockReturnValue({ team: { workspace: { role: 'owner' } } })
}

describe('LegalEntitiesView', () => {
  beforeEach(async () => {
    useLegalEntitiesMock.mockReset()
    createMock.mockReset()
    updateMock.mockReset()
    archiveMock.mockReset()
    useTeamMock.mockReset()
    asOwner()
    await i18n.changeLanguage('fr')
  })

  it('rend les sociétés déclarées et NOMME ce qui n’est pas renseigné', () => {
    useLegalEntitiesMock.mockReturnValue({
      data: [
        ENTITY,
        {
          ...ENTITY,
          id: 'b',
          name: 'Astréa Régie',
          registration_number: null,
          country: null,
          vat_number: null,
          address: null,
          currency: null,
        },
      ],
      isLoading: false,
      isError: false,
    })
    render(<LegalEntitiesView />)

    expect(screen.getByText('Astréa Conseil')).toBeInTheDocument()
    expect(screen.getByText('812345678')).toBeInTheDocument()
    expect(screen.getByText('FR12812345678')).toBeInTheDocument()
    expect(screen.getByText('12 rue de la Paix, 75002 Paris')).toBeInTheDocument()
    // Un identifiant absent se DIT. Rendu vide, il se lirait « la société n'en
    // a pas », ce qui n'est pas ce que la base sait.
    expect(screen.getByText('Identifiant légal non renseigné')).toBeInTheDocument()
    expect(screen.getByText('Pays non renseigné')).toBeInTheDocument()
    // #2422.3 — TVA, adresse, devise suivent la même règle.
    expect(screen.getByText('TVA non renseignée')).toBeInTheDocument()
    expect(screen.getByText('Adresse non renseignée')).toBeInTheDocument()
    expect(screen.getByText('Devise non renseignée')).toBeInTheDocument()
  })

  it('un échec de lecture ne se déguise pas en « aucune société déclarée »', () => {
    useLegalEntitiesMock.mockReturnValue({ data: undefined, isLoading: false, isError: true })
    render(<LegalEntitiesView />)

    expect(screen.getByText("Les sociétés n'ont pas pu être chargées.")).toBeInTheDocument()
    expect(screen.queryByText('Aucune société déclarée')).not.toBeInTheDocument()
    // Et surtout : aucun formulaire. Ajouter une société sur une liste qu'on
    // n'a pas pu lire, c'est ajouter un doublon sans le savoir.
    expect(screen.queryByRole('button', { name: /Ajouter (la|une) société/ })).not.toBeInTheDocument()
  })

  it('dit ce que veut dire une liste vide, sans écrire un chiffre', () => {
    useLegalEntitiesMock.mockReturnValue({ data: [], isLoading: false, isError: false })
    render(<LegalEntitiesView />)

    expect(screen.getByText('Aucune société déclarée')).toBeInTheDocument()
    // L'ajout reste : une liste vide est justement l'endroit d'où l'on
    // déclare la première (maquette : « Ajouter une société » en tête de bloc).
    expect(screen.getByRole('button', { name: 'Ajouter une société' })).toBeInTheDocument()
  })

  it('n’offre AUCUN geste d’écriture sans le droit de facturation, et le dit', () => {
    useTeamMock.mockReturnValue({ team: { workspace: { role: 'sales' } } })
    useLegalEntitiesMock.mockReturnValue({ data: [ENTITY], isLoading: false, isError: false })
    render(<LegalEntitiesView />)

    expect(screen.getByText('Astréa Conseil')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Ajouter (la|une) société/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Archiver/ })).not.toBeInTheDocument()
    expect(screen.getByText(/décision de facturation/)).toBeInTheDocument()
  })

  it('archive une société, et n’offre nulle part de la supprimer', async () => {
    const user = userEvent.setup()
    useLegalEntitiesMock.mockReturnValue({ data: [ENTITY], isLoading: false, isError: false })
    render(<LegalEntitiesView />)

    await user.click(screen.getByRole('button', { name: 'Archiver Astréa Conseil' }))
    expect(archiveMock).toHaveBeenCalledWith({ id: ENTITY.id, archived: true })
    // Il n'y a PAS de suppression : une société a porté des mois facturés.
    expect(screen.queryByRole('button', { name: /Supprimer/ })).not.toBeInTheDocument()
  })

  it('propose de RÉACTIVER une société archivée, jamais de l’effacer', async () => {
    const user = userEvent.setup()
    useLegalEntitiesMock.mockReturnValue({
      data: [{ ...ENTITY, archived: true }],
      isLoading: false,
      isError: false,
    })
    render(<LegalEntitiesView />)

    expect(screen.getByText('Archivée')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Réactiver Astréa Conseil' }))
    expect(archiveMock).toHaveBeenCalledWith({ id: ENTITY.id, archived: false })
  })

  it('déclare une société — le nom part, les champs vides ne partent pas vides', async () => {
    const user = userEvent.setup()
    useLegalEntitiesMock.mockReturnValue({ data: [], isLoading: false, isError: false })
    render(<LegalEntitiesView />)

    await user.click(screen.getByRole('button', { name: 'Ajouter une société' }))
    await user.type(screen.getByLabelText('Raison sociale'), 'Astréa Régie')
    await user.click(screen.getByRole('button', { name: 'Ajouter la société' }))

    // Un champ laissé vide part `null`, jamais une chaîne vide : le serveur
    // stocke alors « non renseigné » et l'écran sait le dire.
    //
    // Le CORPS et rien d'autre : `mutate` reçoit aussi ses rappels en second
    // argument, et les inclure dans l'assertion la ferait rougir au premier
    // `onSuccess` ajouté — un test qui casse sur du code correct s'ignore.
    expect(createMock.mock.calls[0]?.[0]).toEqual({
      name: 'Astréa Régie',
      registration_number: null,
      country: null,
      vat_number: null,
      address: null,
      currency: null,
    })
  })

  it('refuse d’envoyer une société sans raison sociale', async () => {
    const user = userEvent.setup()
    useLegalEntitiesMock.mockReturnValue({ data: [], isLoading: false, isError: false })
    render(<LegalEntitiesView />)

    await user.click(screen.getByRole('button', { name: 'Ajouter une société' }))
    await user.click(screen.getByRole('button', { name: 'Ajouter la société' }))
    expect(createMock).not.toHaveBeenCalled()
  })

  it('corrige une société existante sans passer par un doublon', async () => {
    const user = userEvent.setup()
    useLegalEntitiesMock.mockReturnValue({ data: [ENTITY], isLoading: false, isError: false })
    render(<LegalEntitiesView />)

    await user.click(screen.getByRole('button', { name: 'Modifier Astréa Conseil' }))
    // Le formulaire de correction et celui d'ajout portent les MÊMES libellés
    // de champ : c'est le nom du formulaire qui les distingue, et c'est aussi ce
    // qu'entend un lecteur d'écran.
    const form = within(screen.getByRole('form', { name: 'Modifier Astréa Conseil' }))
    const name = form.getByLabelText('Raison sociale')
    await user.clear(name)
    await user.type(name, 'Astréa Conseil SAS')
    await user.click(form.getByRole('button', { name: 'Enregistrer' }))

    expect(updateMock.mock.calls[0]?.[0]).toEqual({
      id: ENTITY.id,
      name: 'Astréa Conseil SAS',
      registration_number: '812345678',
      country: 'FR',
      vat_number: 'FR12812345678',
      address: '12 rue de la Paix, 75002 Paris',
      currency: 'EUR',
    })
  })

  it('refonte Théo — un bloc, le tableau commun Raison sociale · Pays / identifiant · Statut · Actions', () => {
    useLegalEntitiesMock.mockReturnValue({
      data: [ENTITY],
      isLoading: false,
      isError: false,
    })
    render(<LegalEntitiesView />)
    expect(screen.getAllByRole('columnheader').map(cell => cell.textContent)).toEqual([
      'Raison sociale',
      'Pays / identifiant',
      'Statut',
      'Actions',
    ])
    expect(screen.getByText('Active')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ajouter une société' })).toBeInTheDocument()
  })
})
