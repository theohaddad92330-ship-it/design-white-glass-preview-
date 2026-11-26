import { cleanup, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AccountNextActionLine, AccountOwnerCell, AccountRelationCell } from './AccountRowCells'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...rest }: { children: ReactNode; to?: string }) => (
    <a href={to} {...(rest as object)}>
      {children}
    </a>
  ),
}))
// Les sous-menus ne se montent qu'à l'ouverture : la cellule ne doit pas lire l'équipe pour se rendre.
vi.mock('./AccountAssignSubmenu', () => ({ AccountAssignSubmenu: () => null }))
vi.mock('./CommercialStatusSubmenu', () => ({ CommercialStatusSubmenu: () => null }))

afterEach(cleanup)

/** Théo A comptes-liste.R4 — la relation se lit en 3 statuts + un état secondaire, dans SA colonne. */
describe('AccountRelationCell — Relation', () => {
  function relation(status: Parameters<typeof AccountRelationCell>[0]['commercialStatus']) {
    render(
      <AccountRelationCell
        accountId="a1"
        companyName="EDF"
        commercialStatus={status}
        onRequestStatusReason={vi.fn()}
      />,
    )
    return {
      primary: screen.getByTestId('account-relation-status').textContent,
      secondary: screen.queryByTestId('account-relation-secondary')?.textContent ?? null,
    }
  }

  it('un client se lit « Client », sans état secondaire', () => {
    expect(relation('customer')).toEqual({ primary: 'Client', secondary: null })
  })

  it('un compte en observation se lit « À ouvrir »', () => {
    expect(relation('watching')).toEqual({ primary: 'À ouvrir', secondary: null })
  })

  it('Hors priorité et En veille restent dits, en secondaire', () => {
    expect(relation('archived')).toEqual({ primary: 'À ouvrir', secondary: 'Hors priorité' })
    cleanup()
    expect(relation('dormant')).toEqual({ primary: 'À ouvrir', secondary: 'En veille' })
  })

  it('le statut est un bouton nommé qui ouvre « Déplacer vers »', () => {
    relation('opening')
    expect(screen.getByRole('button', { name: /EDF/ })).toHaveAttribute('aria-haspopup', 'menu')
  })
})

describe('AccountOwnerCell — Responsable', () => {
  it('nomme le responsable par son prénom, et « Toi » pour le sien', () => {
    render(
      <AccountOwnerCell
        accountId="a1"
        companyName="EDF"
        owner={{ user_id: 'u2', name: 'Léa Martin' }}
        isMine={false}
      />,
    )
    expect(screen.getByTestId('account-owner')).toHaveTextContent('Léa')
    cleanup()
    render(<AccountOwnerCell accountId="a1" companyName="EDF" owner={{ user_id: 'u1', name: 'Maëlle L' }} isMine />)
    expect(screen.getByTestId('account-owner')).toHaveTextContent('Toi')
  })

  it('SAIT DIRE NON : sans le champ, aucune cellule ; non attribué, seulement le geste « Attribuer »', () => {
    const { container } = render(<AccountOwnerCell accountId="a1" companyName="EDF" owner={undefined} isMine={false} />)
    expect(container.textContent).toBe('')
    cleanup()
    render(<AccountOwnerCell accountId="a1" companyName="EDF" owner={null} isMine={false} />)
    expect(screen.getByTestId('account-owner')).toHaveTextContent('Attribuer')
  })
})

describe('AccountNextActionLine — prochaine action sous le sujet', () => {
  it('écrit le libellé et son horizon, en lien vers le dossier', () => {
    render(<AccountNextActionLine accountId="a1" label="Relancer Maxime" horizon="cette semaine" />)
    expect(screen.getByTestId('account-next-action-line')).toHaveTextContent('cette semaine · Relancer Maxime')
  })

  it('SAIT DIRE NON : sans action écrite, aucune ligne', () => {
    const { container } = render(<AccountNextActionLine accountId="a1" label="  " horizon={null} />)
    expect(container.textContent).toBe('')
  })
})
