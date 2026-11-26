import { orgGraphSchema } from '@bellum/contracts'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import { HierarchyOrgView } from './HierarchyOrgView'

vi.mock('@/features/accounts/hooks/useAccountMarketContext', () => ({
  useAccountMarketContext: () => ({ data: undefined, isPending: false, isError: false }),
}))

const SOURCE = { id: 's', kind: 'official_site' as const, grounding: 'A' as const, date: '2026-08-01' }
const person = (id: string, fullName: string, entityId: string) => ({
  id,
  fullName,
  title: 'Directeur',
  entityId,
  hierarchyLevel: 'L2',
  decisionRoles: ['champion'],
  identityStatus: 'classified',
  confidence: 70,
  sources: [SOURCE],
})
const entity = (id: string, name: string, type: string, parentId: string | null) => ({
  id,
  name,
  type,
  parentId,
  confidence: 80,
  sources: [SOURCE],
})

/** Groupe multi-entités : Servier (groupe) → Servier SAS (porte Anne) et Institut (n'en porte aucune). */
const graph = orgGraphSchema.parse({
  graphVersion: 5,
  entities: [
    entity('e-groupe', 'Servier', 'groupe', null),
    entity('e-sas', 'Servier SAS', 'filiale', 'e-groupe'),
    entity('e-inst', 'Institut de recherche', 'filiale', 'e-groupe'),
  ],
  people: [person('p1', 'Anne Durand', 'e-sas')],
  hierarchyEdges: [],
  influenceEdges: [],
})

const known = [{ id: 'c1', full_name: 'Paul Martin', title: 'DSI' }]
const label = (key: string, options?: Record<string, unknown>) => i18n.t(`accountOrg:${key}`, options ?? {}) as string

/**
 * #4177.1 / #4177.2 — changer d'entité depuis la vue Groupe : l'entité demandée
 * est celle qu'on LIT. Une entité sans organigramme ne retombe jamais en
 * silence sur une autre (on lirait Servier SAS en croyant lire l'Institut) ;
 * elle DIT que sa couverture manque, et les contacts connus restent là.
 */
describe('HierarchyOrgView — changer d’entité (#4177)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })

  it('une entité SANS organigramme dit sa couverture manquante, nomme la vue affichée, et garde les contacts connus', () => {
    render(<HierarchyOrgView graph={graph} directionId="e-inst" onDirectionChange={() => {}} contacts={known} />)
    expect(
      screen.getByText(label('hierarchy.scopeWithoutOrg', { name: 'Institut de recherche', shown: 'Servier SAS' })),
    ).toBeInTheDocument()
    expect(screen.getByText('Paul Martin')).toBeInTheDocument()
  })

  // V4-CORRECTIFS-C 4292.6 — l'avis ne vient jamais seul : les contacts qui NOMMENT l'entité restent listés « Non enrichis »,
  // même quand le graphe les a rattachés ailleurs (Veolia › Digital Factory).
  it('4292.6 — une entité sans organigramme liste en « Non enrichis » les contacts qui la nomment', () => {
    // Anne est dans le graphe (rattachée à Servier SAS) : seul son champ `entity` la nomme à l'Institut.
    const named = [{ id: 'c9', full_name: 'Anne Durand', title: 'DSI', entity: 'Institut de recherche' }]
    render(<HierarchyOrgView graph={graph} directionId="e-inst" onDirectionChange={() => {}} contacts={named} />)
    const section = screen.getByRole('group', { name: label('hierarchy.unenrichedAria') })
    expect(section).toHaveTextContent('Anne Durand')
  })

  it('4292.6 — NON : une entité qui a un organigramme ne remonte pas ses contacts nommés comme non enrichis', () => {
    const named = [{ id: 'c9', full_name: 'Anne Durand', title: 'DSI', entity: 'Servier SAS' }]
    render(<HierarchyOrgView graph={graph} directionId="e-sas" onDirectionChange={() => {}} contacts={named} />)
    expect(screen.queryByRole('group', { name: label('hierarchy.unenrichedAria') })).toBeNull()
  })

  it('une entité qui a un organigramme ne porte aucun avis de couverture', () => {
    render(<HierarchyOrgView graph={graph} directionId="e-sas" onDirectionChange={() => {}} contacts={known} />)
    expect(screen.queryByText(/aucun organigramme connu pour cette entité/)).toBeNull()
  })

  it('le groupe, sans personne en propre mais avec ses filiales peuplées, ouvre SON périmètre (pas la plus peuplée)', () => {
    render(<HierarchyOrgView graph={graph} directionId="e-groupe" onDirectionChange={() => {}} />)
    expect(screen.getByText(label('hierarchy.treeTitle', { direction: 'Servier' }))).toBeInTheDocument()
    expect(screen.getByText('Anne Durand')).toBeInTheDocument()
    expect(screen.queryByText(/aucun organigramme connu pour cette entité/)).toBeNull()
  })
})
