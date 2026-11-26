import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Contact } from '@bellum/contracts'
import { i18n } from '@/i18n'
import { OrgPersonNode } from './OrgPersonNode'
import type { FocalPersonCard } from './focalOrgData'

// Louis 22/10 (carte personne enrichie) — entité, rôle de décision, date de vérification, coordonnées.
const person = {
  id: 'p1',
  known: null,
  fullName: 'Maxime Delaunay',
  title: 'Directeur plateformes',
  level: 'L2',
  entityId: 'e1',
  entityName: 'Société Générale SA',
  badge: null,
  decisionRole: 'economic_buyer',
  roleInferred: false,
  roles: ['economic_buyer'],
  confidence: 80,
  identityStatus: 'verified',
  sources: [],
  lastVerifiedAt: new Date(Date.now() - 20 * 86_400_000).toISOString(),
  reporting: null,
  attenuated: false,
} as unknown as FocalPersonCard

describe('OrgPersonNode — carte enrichie', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })

  it('dit l’entité du groupe, le rôle dans la décision et la date de vérification du poste', () => {
    render(<OrgPersonNode person={person} />)
    expect(screen.getByText('Société Générale SA')).toBeInTheDocument()
    expect(screen.getByText('Décideur économique')).toBeInTheDocument()
    expect(screen.getByText(/Poste vérifié le /)).toBeInTheDocument()
  })

  it('sans date de vérification : aucune ligne (jamais une date inventée)', () => {
    render(<OrgPersonNode person={{ ...person, lastVerifiedAt: null }} />)
    expect(screen.queryByText(/Poste vérifié/)).not.toBeInTheDocument()
  })

  it('avec la fiche réelle : les icônes de coordonnées ; sans fiche : aucune', () => {
    const contact = { id: 'c1', email: 'm@sg.fr', phone: null, enrichment_coordinates: null } as unknown as Contact
    const { rerender } = render(<OrgPersonNode person={person} contact={contact} />)
    expect(screen.getByRole('button', { name: 'Afficher l’e-mail' })).toBeInTheDocument()
    rerender(<OrgPersonNode person={person} />)
    expect(screen.queryByRole('button', { name: 'Afficher l’e-mail' })).not.toBeInTheDocument()
  })
})
