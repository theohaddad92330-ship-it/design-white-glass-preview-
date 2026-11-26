import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { BusinessUnitView } from '@bellum/contracts'
import { BusinessUnitScopePath } from './BusinessUnitScopePath'

/**
 * #2087.12 / #2087.13 — la représentation « Entreprise → Agence → Équipe »
 * et la phrase qui la suit. Les données sont celles DÉJÀ lues par l'étape
 * (`GET /business-units`, `GET /team`) : aucune hiérarchie n'est inventée,
 * et une absence ne fait aucune ligne.
 */

function unit(overrides: Partial<BusinessUnitView> = {}): BusinessUnitView {
  return {
    id: 'bu-1',
    name: 'Agence Toulouse',
    kind: 'agency',
    territory: null,
    specialties: [],
    consultantCount: null,
    teamSize: null,
    leadUserId: 'u-herve',
    portfolioNote: null,
    capacityAvailableConsultants: null,
    quarterObjective: null,
    status: 'active',
    memberCount: 3,
    viewerIsMember: true,
    viewerAccessRequestStatus: null,
    ...overrides,
  }
}

const MEMBERS = [{ userId: 'u-herve', fullName: 'Hervé Martin' }]

describe('BusinessUnitScopePath', () => {
  it('#2087.12 — affiche Entreprise → périmètre porté → équipe de son responsable', () => {
    render(<BusinessUnitScopePath companyName="Accenture" units={[unit()]} members={MEMBERS} />)

    const path = screen.getByRole('list', { name: 'Ton périmètre, de l’entreprise à ton équipe' })
    const items = within(path).getAllByRole('listitem')
    expect(items.map(item => item.textContent)).toEqual([
      'Accenture',
      'Agence ToulouseUne agence',
      'Équipe de Hervé Martin',
    ])
  })

  it('#2087.13 — la phrase de cloisonnement suit la représentation', () => {
    render(<BusinessUnitScopePath companyName="Accenture" units={[unit()]} members={MEMBERS} />)
    expect(
      screen.getByText('Bellum distinguera les ressources du groupe de celles réellement accessibles à ton équipe.'),
    ).toBeInTheDocument()
  })

  it('#2087.12 — un périmètre dont on n’est PAS membre, ou archivé, ne s’affiche pas', () => {
    render(
      <BusinessUnitScopePath
        companyName="Accenture"
        units={[
          unit({ id: 'a', name: 'Agence Lyon', viewerIsMember: false }),
          unit({ id: 'b', name: 'BU Cloud', status: 'archived' }),
        ]}
        members={MEMBERS}
      />,
    )
    // Aucun périmètre porté → rien à représenter : le composant se tait.
    expect(screen.queryByRole('list')).toBeNull()
    expect(screen.queryByText(/Bellum distinguera/)).toBeNull()
  })

  it('#2087.12 — sans responsable connu, AUCUNE ligne « Équipe de … » (jamais un nom deviné)', () => {
    render(<BusinessUnitScopePath companyName="Accenture" units={[unit({ leadUserId: null })]} members={MEMBERS} />)
    expect(screen.queryByText(/Équipe de/)).toBeNull()
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
  })

  it('#2087.12 — responsable sans nom renseigné : aucune ligne non plus', () => {
    render(
      <BusinessUnitScopePath
        companyName="Accenture"
        units={[unit()]}
        members={[{ userId: 'u-herve', fullName: null }]}
      />,
    )
    expect(screen.queryByText(/Équipe de/)).toBeNull()
  })

  it('#2087.12 — nom d’espace inconnu : la ligne entreprise disparaît, le reste tient', () => {
    render(<BusinessUnitScopePath companyName={null} units={[unit()]} members={MEMBERS} />)
    const items = screen.getAllByRole('listitem')
    expect(items[0]?.textContent).toBe('Agence ToulouseUne agence')
  })
})
