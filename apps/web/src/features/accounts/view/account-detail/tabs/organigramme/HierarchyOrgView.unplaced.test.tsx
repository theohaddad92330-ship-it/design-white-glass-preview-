import { orgGraphSchema, type OrgGraph } from '@bellum/contracts'
import { render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import { HierarchyOrgView } from './HierarchyOrgView'

vi.mock('@/features/accounts/hooks/useAccountMarketContext', () => ({
  useAccountMarketContext: () => ({ data: undefined, isPending: false, isError: false }),
}))

const label = (key: string, options?: Record<string, unknown>) => i18n.t(`accountOrg:${key}`, options ?? {}) as string

const person = (n: number, entityId: string | null) => ({
  id: `p-${n}`,
  fullName: `Personne Synthetique ${n}`,
  title: 'Poste synthétique',
  entityId,
  hierarchyLevel: 'L3',
  decisionRoles: ['unknown'],
  identityStatus: 'classified',
  confidence: 50,
  sources: [],
})

function graph(
  people: unknown[],
  entities = [{ id: 'e-1', name: 'Entité A', type: 'bu', parentId: null, confidence: 80, sources: [] }],
): OrgGraph {
  return orgGraphSchema.parse({ graphVersion: 5, entities, people, hierarchyEdges: [], influenceEdges: [] })
}

const contactsOf = (count: number) =>
  Array.from({ length: count }, (_, n) => ({ id: `c-${n}`, full_name: `Personne Synthetique ${n}`, title: null }))

/**
 * #4749 — un compte a 1 658 contacts, 0 personne placée : l'écran rendait `null`.
 * Doctrine : un rendu structuré NOMME ce qu'il n'a pas pu évaluer — ni « 0 », ni écran nu.
 */
describe('HierarchyOrgView — des contacts, personne de plaçable (#4749)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })

  it('NOMME les personnes connues et non rattachées au lieu de rendre null', () => {
    const people = Array.from({ length: 30 }, (_, n) => person(n, null))
    const { container } = render(
      <HierarchyOrgView
        graph={graph(people)}
        directionId={null}
        onDirectionChange={() => {}}
        contacts={contactsOf(30)}
      />,
    )
    expect(container).not.toBeEmptyDOMElement()
    const notice = screen.getByRole('group', { name: label('hierarchy.unplacedAria') })
    expect(within(notice).getByText(label('hierarchy.unplacedBody', { known: 30, unplaced: 30 }))).toBeInTheDocument()
    expect(notice.textContent).not.toMatch(/\b0\b/)
  })

  it('« Non enrichis » reste atteignable sans aucune direction focale, plafonné', () => {
    render(
      <HierarchyOrgView graph={graph([])} directionId={null} onDirectionChange={() => {}} contacts={contactsOf(40)} />,
    )
    const section = screen.getByRole('group', { name: label('hierarchy.unenrichedAria') })
    expect(within(section).getAllByText(label('hierarchy.unenrichedBadge'))).toHaveLength(12)
    expect(within(section).getByText(label('hierarchy.unenrichedMore', { count: 28 }))).toBeInTheDocument()
    expect(
      within(screen.getByRole('group', { name: label('hierarchy.unplacedAria') })).getByText(
        label('hierarchy.unplacedBody', { known: 40, unplaced: 40 }),
      ),
    ).toBeInTheDocument()
  })

  it('contrôle négatif — aucun contact, aucune personne : pas de texte d’absence', () => {
    render(<HierarchyOrgView graph={graph([])} directionId={null} onDirectionChange={() => {}} contacts={[]} />)
    expect(screen.queryByRole('group', { name: label('hierarchy.unplacedAria') })).toBeNull()
  })

  it('contrôle négatif — contacts non fournis (inconnu) : jamais un « 0 » affirmé', () => {
    render(<HierarchyOrgView graph={graph([])} directionId={null} onDirectionChange={() => {}} />)
    expect(screen.queryByRole('group', { name: label('hierarchy.unplacedAria') })).toBeNull()
  })

  it('#4679 — un contact CRM est une relation PLACÉE : il est dans l’arbre, pas dans les non-plaçables', () => {
    const placed = { ...person(1, 'e-1'), sources: [{ id: 's-crm', kind: 'crm', grounding: 'A', date: '2026-10-01' }] }
    const { container } = render(
      <HierarchyOrgView
        graph={graph([placed])}
        directionId="e-1"
        onDirectionChange={() => {}}
        contacts={[{ id: 'c-1', full_name: placed.fullName, title: null }]}
      />,
    )
    expect(container).not.toBeEmptyDOMElement()
    expect(screen.getByText(placed.fullName)).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: label('hierarchy.unplacedAria') })).toBeNull()
  })
})
