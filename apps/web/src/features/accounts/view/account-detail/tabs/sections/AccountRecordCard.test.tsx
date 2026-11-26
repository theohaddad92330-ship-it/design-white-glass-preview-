/**
 * #3499 — la fiche du compte, en lecture, ne rend QUE les champs remplis
 * (Théo, salle démo BPCE, 01/10/2026 : « des dizaines de champs Non renseigné
 * avec un crayon »). Les champs vides se complètent derrière « Compléter la fiche ».
 */
import type { Account } from '@bellum/contracts'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { AccountRecordCard } from './AccountRecordCard'

const patchMutate = vi.fn()

vi.mock('@/features/crm-core/hooks/useRecordEdit', () => ({
  usePatchAccount: () => ({ mutate: patchMutate, isPending: false }),
}))

beforeAll(() => {
  const proto = Element.prototype as unknown as Record<string, unknown>
  proto.hasPointerCapture ??= () => false
  proto.setPointerCapture ??= () => {}
  proto.releasePointerCapture ??= () => {}
  proto.scrollIntoView ??= () => {}
})

const user = () => userEvent.setup({ pointerEventsCheck: 0 })
vi.mock('@/features/crm-core/view/NotesPanel', () => ({ NotesPanel: () => null }))
vi.mock('@/features/crm-core/view/RecordHistory', () => ({ RecordHistory: () => null }))
vi.mock('@/stores/currentUserStore', () => ({ useCurrentUserStore: () => null }))

const COMPTE = {
  id: 'acc-1',
  company_name: 'Groupe BPCE',
  sector: 'Banque',
  employees: '',
  revenue: null,
  headquarters: '',
  website: 'https://groupebpce.com',
  siren: null,
} as unknown as Account

describe('#3499 — AccountRecordCard', () => {
  it('SAIT DIRE NON — en lecture, aucun champ vide ni « Non renseigné »', () => {
    const { container } = render(<AccountRecordCard account={COMPTE} />)
    expect(screen.getByText('https://groupebpce.com')).toBeInTheDocument()
    expect(container.textContent).not.toMatch(/Non renseign/i)
    expect(screen.queryByText('Siège')).not.toBeInTheDocument()
  })

  it('« Compléter la fiche » fait apparaître les champs vides, corrigeables', () => {
    render(<AccountRecordCard account={COMPTE} />)
    expect(screen.queryByText('SIREN')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Compléter la fiche' }))
    expect(screen.getByRole('button', { name: 'Terminer' })).toBeInTheDocument()
    expect(screen.getByText('SIREN')).toBeInTheDocument()
    expect(screen.getByText('Siège')).toBeInTheDocument()
  })
})

/**
 * #219.6 (#3231, lot X50) — CLIENT INTERNE : la SOURCE du signal est cette
 * déclaration sur la fiche compte. Même règle que les champs texte (#3499) :
 * en lecture, un compte non déclaré ne montre aucune ligne ; la déclaration se
 * pose derrière « Compléter la fiche », dans la grille existante.
 */
describe('#219.6 — AccountRecordCard, déclarer « client interne »', () => {
  it('non déclaré : aucune ligne en lecture, jamais « Non renseigné »', () => {
    render(<AccountRecordCard account={COMPTE} />)
    expect(screen.queryByLabelText('Direction interne ou client direct')).not.toBeInTheDocument()
  })

  it('déclaré : la valeur est lue sur la fiche', () => {
    render(
      <AccountRecordCard
        account={{ ...COMPTE, declared_internal_client_mode: 'internal_service' } as unknown as Account}
      />,
    )
    expect(screen.getByLabelText('Direction interne ou client direct')).toHaveTextContent(
      'Direction interne servant des métiers',
    )
  })

  it('« Compléter la fiche » propose la déclaration ; choisir enregistre la correction humaine', async () => {
    patchMutate.mockClear()
    render(<AccountRecordCard account={COMPTE} />)
    fireEvent.click(screen.getByRole('button', { name: 'Compléter la fiche' }))
    await user().click(screen.getByLabelText('Direction interne ou client direct'))
    await user().click(screen.getByText('Client direct'))
    expect(patchMutate).toHaveBeenCalledWith({ declaredInternalClientMode: 'external_buyer' })
  })

  it('effacer la déclaration, c’est « Non renseigné » (null), jamais une valeur devinée', async () => {
    patchMutate.mockClear()
    render(
      <AccountRecordCard
        account={{ ...COMPTE, declared_internal_client_mode: 'internal_service' } as unknown as Account}
      />,
    )
    await user().click(screen.getByLabelText('Direction interne ou client direct'))
    await user().click(screen.getByText('Non renseigné'))
    expect(patchMutate).toHaveBeenCalledWith({ declaredInternalClientMode: null })
  })
})

/**
 * #219.6 (#3231, lot X50) — les FILIALES se déclarent à la main : sans elles,
 * Laura ne peut pas distinguer une filiale d'un client externe sur un compte
 * que l'analyse n'a pas détaillé. Même règle que les champs texte (#3499).
 */
describe('#219.6 — AccountRecordCard, filiales déclarées', () => {
  it('lit les filiales déjà connues, texte ou objet nommé', () => {
    render(
      <AccountRecordCard
        account={{ ...COMPTE, subsidiaries: ['Boursorama', { name: 'Treezor' }] } as unknown as Account}
      />,
    )
    expect(screen.getByText('Filiales')).toBeInTheDocument()
    expect(screen.getByText('Boursorama, Treezor')).toBeInTheDocument()
  })

  it('aucune filiale : aucune ligne en lecture, déclarable derrière « Compléter la fiche »', () => {
    render(<AccountRecordCard account={{ ...COMPTE, subsidiaries: [] } as unknown as Account} />)
    expect(screen.queryByText('Filiales')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Compléter la fiche' }))
    expect(screen.getByText('Filiales')).toBeInTheDocument()
  })
})

/**
 * #219.6 (J05) — les QUATRE rôles d'une direction interne se NOMMENT à la main :
 * commanditaire, utilisateurs, entité juridique, client final. Ils n'existent que
 * pour une direction interne déclarée ; en lecture, seuls les rôles remplis
 * s'affichent (jamais « Non renseigné »).
 */
describe('#219.6 — AccountRecordCard, les quatre rôles d’une direction interne', () => {
  const INTERNE = { ...COMPTE, declared_internal_client_mode: 'internal_service' } as unknown as Account

  it('direction interne + « Compléter la fiche » : les quatre rôles sont proposés', () => {
    render(<AccountRecordCard account={INTERNE} />)
    fireEvent.click(screen.getByRole('button', { name: 'Compléter la fiche' }))
    for (const label of ['Commanditaire interne', 'Utilisateurs', 'Entité juridique', 'Client final']) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
  })

  it('SAIT DIRE NON — client direct ou non déclaré : aucun des quatre rôles, même en complétant', () => {
    const direct = { ...COMPTE, declared_internal_client_mode: 'external_buyer' } as unknown as Account
    for (const account of [COMPTE, direct]) {
      const { unmount } = render(<AccountRecordCard account={account} />)
      fireEvent.click(screen.getByRole('button', { name: 'Compléter la fiche' }))
      expect(screen.queryByText('Commanditaire interne')).not.toBeInTheDocument()
      expect(screen.queryByText('Client final')).not.toBeInTheDocument()
      unmount()
    }
  })

  it('en lecture, seul le rôle rempli s’affiche, avec son nom en clair', () => {
    render(
      <AccountRecordCard
        account={{ ...INTERNE, declared_internal_sponsor: 'Direction Digital France' } as unknown as Account}
      />,
    )
    expect(screen.getByText('Direction Digital France')).toBeInTheDocument()
    expect(screen.queryByText('Entité juridique')).not.toBeInTheDocument()
  })

  it('renseigner un rôle enregistre la correction humaine sur sa clé', async () => {
    patchMutate.mockClear()
    render(<AccountRecordCard account={INTERNE} />)
    fireEvent.click(screen.getByRole('button', { name: 'Compléter la fiche' }))
    const row = screen.getByText('Entité juridique').closest('div') as HTMLElement
    await user().click(row.querySelector('button') as HTMLElement)
    const input = (await screen.findByRole('textbox')) as HTMLInputElement
    await user().clear(input)
    await user().type(input, 'SNCF Voyageurs{Enter}')
    expect(patchMutate).toHaveBeenCalledWith({ declaredLegalEntity: 'SNCF Voyageurs' })
  })
})

/**
 * #3278.2 (lot M11 09/10) — les six critères de la route commerciale sans
 * source structurée : un champ de saisie par critère, que Laura cite. Vide =
 * aucune ligne en lecture (Laura le nomme « non évalué »), jamais « 0 ».
 */
describe('#3278.2 — critères de route déclarés', () => {
  const LABELS = [
    'Périmètre de la mission',
    'Objectifs du compte',
    'Rôles disponibles côté client',
    'Partenaires déjà identifiés',
    'Historique de la relation',
    'Fenêtre de temps',
  ]

  it('SAIT DIRE NON — non déclarés : aucun des six en lecture', () => {
    render(<AccountRecordCard account={COMPTE} />)
    for (const label of LABELS) expect(screen.queryByText(label)).not.toBeInTheDocument()
  })

  it('« Compléter la fiche » propose les six, pour tout compte', () => {
    render(<AccountRecordCard account={COMPTE} />)
    fireEvent.click(screen.getByRole('button', { name: 'Compléter la fiche' }))
    for (const label of LABELS) expect(screen.getByText(label)).toBeInTheDocument()
  })

  it('en lecture, le critère déclaré s’affiche avec son texte', () => {
    render(
      <AccountRecordCard
        account={{ ...COMPTE, declared_route_timing: 'Appel d’offres attendu au T1' } as unknown as Account}
      />,
    )
    expect(screen.getByText('Appel d’offres attendu au T1')).toBeInTheDocument()
    expect(screen.getByText('Fenêtre de temps')).toBeInTheDocument()
    expect(screen.queryByText('Objectifs du compte')).not.toBeInTheDocument()
  })

  it('renseigner un critère enregistre la correction humaine sur sa clé', async () => {
    patchMutate.mockClear()
    render(<AccountRecordCard account={COMPTE} />)
    fireEvent.click(screen.getByRole('button', { name: 'Compléter la fiche' }))
    const row = screen.getByText('Objectifs du compte').closest('div') as HTMLElement
    await user().click(row.querySelector('button') as HTMLElement)
    const input = (await screen.findByRole('textbox')) as HTMLInputElement
    await user().type(input, 'Réduire le run de 20 %{Enter}')
    expect(patchMutate).toHaveBeenCalledWith({ declaredRouteObjectives: 'Réduire le run de 20 %' })
  })
})

/**
 * #3278.1 (décision Louis 11/10/2026) — les objets sources des deux dernières routes : un contact
 * noué en événement ou communauté, un compte venu par un contenu. Vide = aucune ligne.
 */
describe('#3278.1 — faits des routes événement / communauté et inbound / contenu', () => {
  const LABELS = ['Événement ou communauté', 'Contenu à l’origine du contact']

  it('SAIT DIRE NON — non déclarés : aucun des deux en lecture', () => {
    render(<AccountRecordCard account={COMPTE} />)
    for (const label of LABELS) expect(screen.queryByText(label)).not.toBeInTheDocument()
  })

  it('« Compléter la fiche » propose les deux', () => {
    render(<AccountRecordCard account={COMPTE} />)
    fireEvent.click(screen.getByRole('button', { name: 'Compléter la fiche' }))
    for (const label of LABELS) expect(screen.getByText(label)).toBeInTheDocument()
  })

  it('en lecture, le fait déclaré s’affiche avec son texte', () => {
    render(
      <AccountRecordCard
        account={{ ...COMPTE, declared_route_event: 'Salon Big Data, 12/09' } as unknown as Account}
      />,
    )
    expect(screen.getByText('Salon Big Data, 12/09')).toBeInTheDocument()
    expect(screen.getByText('Événement ou communauté')).toBeInTheDocument()
    expect(screen.queryByText('Contenu à l’origine du contact')).not.toBeInTheDocument()
  })

  it('renseigner le fait enregistre la correction humaine sur sa clé', async () => {
    patchMutate.mockClear()
    render(<AccountRecordCard account={COMPTE} />)
    fireEvent.click(screen.getByRole('button', { name: 'Compléter la fiche' }))
    const row = screen.getByText('Contenu à l’origine du contact').closest('div') as HTMLElement
    await user().click(row.querySelector('button') as HTMLElement)
    const input = (await screen.findByRole('textbox')) as HTMLInputElement
    await user().type(input, 'Livre blanc IA{Enter}')
    expect(patchMutate).toHaveBeenCalledWith({ declaredRouteInbound: 'Livre blanc IA' })
  })
})

describe('#3231 (décision Louis 10/10) — la phrase qui dit ce que « Compléter la fiche » apporte', () => {
  it('aucun rôle déclaré : la phrase est visible, sans dépliage, et aucune ligne vide n’est ajoutée', () => {
    const { container } = render(<AccountRecordCard account={COMPTE} />)
    expect(
      screen.getByText(/commanditaire, les utilisateurs, l’entité juridique et le client final/),
    ).toBeInTheDocument()
    expect(container.textContent).not.toMatch(/Non renseign/i)
    expect(screen.queryByText('Commanditaire interne')).not.toBeInTheDocument()
  })

  it('SAIT DIRE NON — des rôles déclarés : la phrase disparaît, les rôles s’affichent', () => {
    render(
      <AccountRecordCard
        account={
          {
            ...COMPTE,
            declared_internal_client_mode: 'internal_service',
            declared_internal_sponsor: 'Direction financière',
          } as unknown as Account
        }
      />,
    )
    expect(screen.queryByText(/commanditaire, les utilisateurs/)).not.toBeInTheDocument()
    expect(screen.getByText('Direction financière')).toBeInTheDocument()
  })
})

/**
 * #4994.1 (recette 01/11) — « Code NAF 70.10Z » brut en lecture dans « Ce que je sais » :
 * du jargon sans valeur pour le commercial. En lecture, aucun code NAF ; il reste corrigeable
 * derrière « Compléter la fiche » (la porte de correction du NAF ne disparaît pas).
 */
describe('#4994.1 — AccountRecordCard, pas de code NAF brut en lecture', () => {
  const AVEC_NAF = { ...COMPTE, naf_code: '70.10Z' } as unknown as Account

  it('SAIT DIRE NON — NAF renseigné : ni libellé « Code NAF » ni code en lecture', () => {
    const { container } = render(<AccountRecordCard account={AVEC_NAF} />)
    expect(container.textContent).not.toContain('70.10Z')
    expect(screen.queryByText('Code NAF')).not.toBeInTheDocument()
  })

  it('le NAF reste corrigeable derrière « Compléter la fiche »', () => {
    render(<AccountRecordCard account={AVEC_NAF} />)
    fireEvent.click(screen.getByRole('button', { name: 'Compléter la fiche' }))
    expect(screen.getByText('Code NAF')).toBeInTheDocument()
  })
})
