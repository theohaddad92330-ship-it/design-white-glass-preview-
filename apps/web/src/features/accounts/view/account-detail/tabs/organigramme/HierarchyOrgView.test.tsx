import { orgGraphSchema, type AccountMarketContext, type OrgGraph } from '@bellum/contracts'
import type { Contact } from '@bellum/contracts'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import { HierarchyOrgView } from './HierarchyOrgView'
import { buildContactSlugIndex } from './organigrammeData'

/**
 * #2837 — même mock que les autres vues de l'organigramme : un état par
 * défaut silencieux (« Non mesuré ») pour ne perturber aucun test existant.
 */
type MarketMemoryQueryState = { data?: AccountMarketContext | null; isPending: boolean; isError: boolean }
const marketMemoryState: { current: MarketMemoryQueryState } = {
  current: { data: undefined, isPending: false, isError: false },
}
vi.mock('@/features/accounts/hooks/useAccountMarketContext', () => ({
  useAccountMarketContext: () => marketMemoryState.current,
}))

// #4679 — le lien « Voir les propositions de fusion » est un <Link> du routeur : pas de routeur dans ce test.
vi.mock('@tanstack/react-router', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => <a href={to}>{children}</a>,
}))

const SOURCE = { id: 's-off', kind: 'official_site' as const, grounding: 'A' as const, date: '2026-08-01' }

function graph(over: Record<string, unknown> = {}): OrgGraph {
  return orgGraphSchema.parse({
    graphVersion: 5,
    entities: [{ id: 'e-ds', name: 'Defence & Space', type: 'bu', parentId: null, confidence: 90, sources: [SOURCE] }],
    people: [
      {
        id: 'p-ceo',
        fullName: 'Michael Schoellhorn',
        title: 'CEO Defence & Space',
        entityId: 'e-ds',
        hierarchyLevel: 'L1',
        decisionRoles: ['economic_buyer'],
        identityStatus: 'actionable',
        confidence: 92,
        sources: [SOURCE],
      },
      {
        id: 'p-eng',
        fullName: 'Claudia Werner',
        title: 'Engineering Director',
        entityId: 'e-ds',
        hierarchyLevel: 'L2',
        decisionRoles: ['champion', 'technical_buyer'],
        identityStatus: 'classified',
        confidence: 70,
        sources: [],
      },
      {
        id: 'p-buy',
        fullName: 'Sarah Klein',
        title: 'Category Manager',
        entityId: 'e-ds',
        hierarchyLevel: 'L5',
        decisionRoles: ['procurement'],
        identityStatus: 'classified',
        confidence: 65,
        sources: [],
      },
    ],
    hierarchyEdges: [
      { fromId: 'p-eng', toId: 'p-ceo', type: 'reports_to', sourceIds: [SOURCE.id], confidence: 95, verified: true },
    ],
    influenceEdges: [],
    ...over,
  })
}

const label = (key: string, options?: Record<string, unknown>) => i18n.t(`accountOrg:${key}`, options ?? {}) as string

/**
 * LA VUE HIÉRARCHIE — la maquette 02, en VUE et non en écran d'arrivée.
 *
 * Trois choses qu'elle doit tenir, et que la maquette d'origine ne tenait pas :
 * les rôles bruts viennent du vocabulaire du produit, les Achats restent HORS
 * de l'arbre, et le trait dit s'il a été observé ou seulement supposé.
 */
describe('HierarchyOrgView', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })

  it('le corpus n’est pas vide — trois personnes, dont une aux Achats', () => {
    expect(graph().people).toHaveLength(3)
    expect(graph().people.filter(person => person.hierarchyLevel === 'L5')).toHaveLength(1)
  })

  it('affiche les rôles BRUTS du contrat, avec le vocabulaire du produit', () => {
    render(<HierarchyOrgView graph={graph()} directionId="e-ds" onDirectionChange={() => {}} />)
    const tree = screen.getByRole('group', { name: label('focal.treeAria') })
    // « champion » et « technical_buyer » — deux rôles bruts sur la même carte,
    // là où la vue focale n'en montrerait qu'un badge « Influenceur ».
    expect(within(tree).getByText(label('correction.roles.champion'))).toBeInTheDocument()
    expect(within(tree).getByText(label('correction.roles.technical_buyer'))).toBeInTheDocument()
  })

  it('Théo comptes-fiche — l’arbre relie ses étages : un trait entre deux étages, aucun sous le dernier', () => {
    render(<HierarchyOrgView graph={graph()} directionId="e-ds" onDirectionChange={() => {}} />)
    const rows = screen.getAllByTestId('org-tree-row')
    expect(rows.length).toBeGreaterThan(1)
    expect(screen.getAllByTestId('org-tree-connector')).toHaveLength(rows.length - 1)
  })

  it('un rôle non établi se DIT — une carte muette se lirait « rôle neutre »', () => {
    const silent = graph({
      people: [
        {
          id: 'p-x',
          fullName: 'Zoé Test',
          title: 'Architecte',
          entityId: 'e-ds',
          hierarchyLevel: 'L4',
          decisionRoles: ['unknown'],
          identityStatus: 'classified',
          confidence: 40,
          sources: [],
        },
      ],
      hierarchyEdges: [],
    })
    render(<HierarchyOrgView graph={silent} directionId="e-ds" onDirectionChange={() => {}} />)
    expect(screen.getByText(label('hierarchy.roleUnknown'))).toBeInTheDocument()
  })

  it('les Achats sont HORS de l’arbre — canal parallèle, jamais un sixième étage', () => {
    render(<HierarchyOrgView graph={graph()} directionId="e-ds" onDirectionChange={() => {}} />)
    const tree = screen.getByRole('group', { name: label('focal.treeAria') })
    expect(within(tree).queryByText('Sarah Klein')).toBeNull()
    const rail = screen.getByRole('group', { name: label('focal.procurementAria') })
    expect(within(rail).getByText('Sarah Klein')).toBeInTheDocument()
  })

  it('le trait VÉRIFIÉ le déclare, et la légende porte les trois états', () => {
    render(<HierarchyOrgView graph={graph()} directionId="e-ds" onDirectionChange={() => {}} />)
    const tree = screen.getByRole('group', { name: label('focal.treeAria') })
    expect(within(tree).getByText(label('orgMap.link.sourced'))).toBeInTheDocument()

    const legend = screen.getByRole('group', { name: label('hierarchy.legendAria') })
    expect(within(legend).getByText(label('orgMap.link.sourced'))).toBeInTheDocument()
    expect(within(legend).getByText(label('orgMap.link.assumedUnsourced'))).toBeInTheDocument()
    expect(within(legend).getByText(label('orgMap.link.structure'))).toBeInTheDocument()
  })

  it('une HYPOTHÈSE ne se dessine jamais comme un fait', () => {
    const assumed = graph({
      hierarchyEdges: [
        { fromId: 'p-eng', toId: 'p-ceo', type: 'reports_to', sourceIds: [], confidence: 60, verified: false },
      ],
    })
    render(<HierarchyOrgView graph={assumed} directionId="e-ds" onDirectionChange={() => {}} />)
    const tree = screen.getByRole('group', { name: label('focal.treeAria') })
    expect(within(tree).queryByText(label('orgMap.link.sourced'))).toBeNull()
    expect(within(tree).getByText(label('orgMap.link.assumedUnsourced'))).toBeInTheDocument()
  })

  it('les rangées sont des NIVEAUX, jamais des rôles', () => {
    render(<HierarchyOrgView graph={graph()} directionId="e-ds" onDirectionChange={() => {}} />)
    const tree = screen.getByRole('group', { name: label('focal.treeAria') })
    expect(within(tree).getByText(i18n.t('accountOrg:orgMap.levels.L1'))).toBeInTheDocument()
    expect(within(tree).getByText(i18n.t('accountOrg:orgMap.levels.L2'))).toBeInTheDocument()
  })

  // #2515 — même défaut que `FocalOrgView.PersonCard` : le badge d'entité
  // (`OrgPersonNode`) sortait de la carte quand le nom était long.
  it('le badge d’entité de l’arbre ne déborde jamais de la carte — il tronque, texte entier au survol', () => {
    render(<HierarchyOrgView graph={graph()} directionId="e-ds" onDirectionChange={() => {}} />)
    const tree = screen.getByRole('group', { name: label('focal.treeAria') })
    const badge = within(tree).getAllByText('Defence & Space')[0]
    expect(badge.className).toContain('truncate')
    expect(badge.getAttribute('title')).toBe('Defence & Space')
  })

  // #2513, #2514 — Louis (retour 17/09, décision qui lève l'arbitrage A3 du
  // 31/08 sur ce point précis) : le canal Achats passe SOUS l'arbre, jamais à
  // côté, et l'arbre prend alors toute la largeur disponible.
  // #2512 — Louis : « par défaut, mettre aussi les gens NON ENRICHIS dans
  // l'organigramme ». `graph.people` ne porte que la vague d'enrichissement ;
  // un contact découvert mais jamais analysé rejoint désormais l'écran, DIT
  // comme tel — jamais un niveau ni un rôle deviné pour lui.
  it('les contacts NON ENRICHIS apparaissent par défaut, distingués, sans niveau deviné', () => {
    render(
      <HierarchyOrgView
        graph={graph()}
        directionId="e-ds"
        onDirectionChange={() => {}}
        contacts={[{ id: 'c-1', full_name: 'Léa Nouvelle', title: 'Chargée de compte' }]}
      />,
    )
    const section = screen.getByRole('group', { name: label('hierarchy.unenrichedAria') })
    expect(within(section).getByText('Léa Nouvelle')).toBeInTheDocument()
    expect(within(section).getByText('Chargée de compte')).toBeInTheDocument()
    expect(within(section).getAllByText(label('hierarchy.unenrichedBadge')).length).toBeGreaterThan(0)
    // Jamais dans l'arbre — aucune analyse ne lui connaît de niveau.
    const tree = screen.getByRole('group', { name: label('focal.treeAria') })
    expect(within(tree).queryByText('Léa Nouvelle')).toBeNull()
  })

  it('un contact déjà dans le graphe ne se double pas dans les non-enrichis', () => {
    render(
      <HierarchyOrgView
        graph={graph()}
        directionId="e-ds"
        onDirectionChange={() => {}}
        contacts={[{ id: 'c-2', full_name: 'Michael Schoellhorn', title: null }]}
      />,
    )
    expect(screen.queryByRole('group', { name: label('hierarchy.unenrichedAria') })).toBeNull()
  })

  // #4679 — un contact venu d'un import / du CRM est une RELATION connue : jamais « non enrichi ».
  describe('contacts CONNUS (import / CRM) — #4679', () => {
    const open = vi.fn()
    const renderKnown = (contacts: Parameters<typeof HierarchyOrgView>[0]['contacts'], g: OrgGraph = graph()) =>
      render(
        <HierarchyOrgView
          graph={g}
          directionId="e-ds"
          onDirectionChange={() => {}}
          contacts={contacts}
          onOpenContactById={open}
        />,
      )

    it('G1 — jamais dans « Non enrichis » : plaçable → dans l’arbre, avec la pastille « Connu »', () => {
      renderKnown([{ id: 'c-ciso', full_name: 'Didier Montandon', title: 'CISO', source: 'import' }])
      expect(screen.queryByRole('group', { name: label('hierarchy.unenrichedAria') })).toBeNull()
      const tree = screen.getByRole('group', { name: label('focal.treeAria') })
      const card = within(tree).getByTestId('org-known-contact')
      expect(within(card).getByText('Didier Montandon')).toBeInTheDocument()
      expect(within(card).getByText(label('hierarchy.knownBadge'))).toBeInTheDocument()
      // Rangé à son étage (CISO → L1), c'est-à-dire dans la rangée du CEO.
      const l1Row = within(tree)
        .getAllByTestId('org-tree-row')
        .find(row => within(row).queryByText('Michael Schoellhorn'))
      expect(l1Row && within(l1Row).queryByText('Didier Montandon')).toBeTruthy()
    })

    it('non plaçable (pas de titre) → bloc « Connus de l’équipe » épinglé EN HAUT, plusieurs possibles', () => {
      renderKnown([
        { id: 'c-a', full_name: 'Alice Sans Titre', title: null, source: 'import' },
        { id: 'c-b', full_name: 'Bruno Sans Titre', title: null, source: 'crm' },
      ])
      const block = screen.getByRole('group', { name: label('hierarchy.knownTeamAria') })
      expect(within(block).getByText('Alice Sans Titre')).toBeInTheDocument()
      expect(within(block).getByText('Bruno Sans Titre')).toBeInTheDocument()
      expect(screen.queryByRole('group', { name: label('hierarchy.unenrichedAria') })).toBeNull()
      // Épinglé AVANT l'arbre.
      const tree = screen.getByRole('group', { name: label('focal.treeAria') })
      expect(block.compareDocumentPosition(tree) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })

    it('SAIT DIRE NON — aucun contact connu : aucun bloc « Connus de l’équipe », aucune carte « Connu »', () => {
      renderKnown([{ id: 'c-x', full_name: 'Léa Nouvelle', title: 'Chargée de compte', source: 'apollo' }])
      expect(screen.queryByRole('group', { name: label('hierarchy.knownTeamAria') })).toBeNull()
      expect(screen.queryByTestId('org-known-contact')).toBeNull()
      // Un contact découvert reste, lui, « non enrichi ».
      expect(screen.getByRole('group', { name: label('hierarchy.unenrichedAria') })).toBeInTheDocument()
    })

    it('doublon connu / déduit : « doublon probable » nommé, lien vers la fusion proposée, rien n’est fusionné', () => {
      const g = graph({
        people: [
          {
            id: 'p-ref',
            fullName: 'Référent technique',
            title: 'Référent technique',
            entityId: 'e-ds',
            hierarchyLevel: 'L1',
            family: 'Cyber',
            roleInferred: true,
            decisionRoles: ['technical_buyer'],
            identityStatus: 'classified',
            confidence: 50,
            sources: [],
          },
        ],
        hierarchyEdges: [],
      })
      renderKnown(
        [{ id: 'c-ciso', full_name: 'Didier Montandon', title: 'CISO', family: 'Cyber', source: 'import' }],
        g,
      )
      expect(screen.getByText('doublon probable : Référent technique')).toBeInTheDocument()
      expect(screen.getByRole('link', { name: label('hierarchy.knownDuplicateLink') })).toBeInTheDocument()
    })

    it('ouvre la fiche du contact connu par son id', () => {
      renderKnown([{ id: 'c-ciso', full_name: 'Didier Montandon', title: 'CISO', source: 'import' }])
      fireEvent.click(within(screen.getByTestId('org-known-contact')).getByRole('button'))
      expect(open).toHaveBeenCalledWith('c-ciso')
    })
  })

  it('le canal Achats est SOUS l’arbre, jamais sur le côté, et l’arbre prend toute la largeur', () => {
    render(<HierarchyOrgView graph={graph()} directionId="e-ds" onDirectionChange={() => {}} />)
    const tree = screen.getByRole('group', { name: label('focal.treeAria') })
    const treeCard = tree.closest('[data-slot="card"]')
    const achatsCard = screen.getByRole('group', { name: label('focal.procurementAria') })
    expect(treeCard).not.toBeNull()
    // Les deux blocs ne partagent plus le même parent en grille deux colonnes :
    // l'arbre est seul sur sa ligne, Achats + légende suivent EN DESSOUS.
    expect(treeCard?.parentElement).not.toBe(achatsCard.parentElement)
    expect(treeCard?.parentElement?.className ?? '').not.toContain('grid-cols')
    // Ordre DOM : l'arbre avant Achats, cohérent avec une pile verticale.
    const position = treeCard!.compareDocumentPosition(achatsCard)
    expect(Boolean(position & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true)
  })
})

/**
 * #2837 — la ligne mémoire marché, RACINE seulement (GA-391). `graph()`
 * ci-dessus n'a qu'UNE entité (`e-ds`, `parentId: null`) : elle EST la racine,
 * donc le cas par défaut de ce fichier couvre déjà « direction = racine ».
 */
describe('#2837 — la ligne mémoire marché ne se pose que sur la direction racine', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
    marketMemoryState.current = {
      data: { paths_observed: 7 } as AccountMarketContext,
      isPending: false,
      isError: false,
    }
  })

  it('la direction ouverte est la racine (seule entité du graphe) : la ligne s’affiche', () => {
    render(<HierarchyOrgView graph={graph()} directionId="e-ds" onDirectionChange={() => {}} accountId="a1" />)
    const line = i18n.t('accounts:marketContext.paths', { count: 7 }) as string
    expect(screen.getByText(new RegExp(line.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))).toBeInTheDocument()
  })

  it('sans `accountId`, aucune ligne — même sur une direction racine', () => {
    render(<HierarchyOrgView graph={graph()} directionId="e-ds" onDirectionChange={() => {}} />)
    const line = i18n.t('accounts:marketContext.paths', { count: 7 }) as string
    expect(screen.queryByText(new RegExp(line.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))).toBeNull()
  })

  it('une direction FILLE (entité avec un parent) ne porte jamais la ligne', () => {
    const withChild = graph({
      entities: [
        { id: 'e-grp', name: 'AIRBUS SE', type: 'groupe', parentId: null, confidence: 95, sources: [SOURCE] },
        { id: 'e-ds', name: 'Defence & Space', type: 'bu', parentId: 'e-grp', confidence: 90, sources: [SOURCE] },
      ],
    })
    render(<HierarchyOrgView graph={withChild} directionId="e-ds" onDirectionChange={() => {}} accountId="a1" />)
    const line = i18n.t('accounts:marketContext.paths', { count: 7 }) as string
    expect(screen.queryByText(new RegExp(line.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))).toBeNull()
  })

  // AM.27 (retour bêta Antoine Meyer) — la vue Hiérarchie porte le MÊME repère CRM que la vue focale.
  describe('AM.27 — le repère « connu / à découvrir » (correspondance CRM) dans l’arbre', () => {
    const contact = { id: 'c-ceo', full_name: 'Michael Schoellhorn' } as unknown as Contact

    it('un nœud connu porte le badge « connu », un nœud absent du CRM « détectée, non retrouvée »', () => {
      render(
        <HierarchyOrgView
          graph={graph()}
          directionId="e-ds"
          onDirectionChange={() => {}}
          contactIndex={buildContactSlugIndex([contact])}
          onContactClick={() => {}}
        />,
      )
      const tree = screen.getByRole('group', { name: label('focal.treeAria') })
      const known = tree.querySelector('[data-org-person="p-ceo"] [data-org-crm-match]')
      expect(known?.getAttribute('data-org-crm-match')).toBe('known')
      expect(known).toHaveTextContent(label('orgGraph.crmMatch.known'))
      const unknown = tree.querySelector('[data-org-person="p-eng"] [data-org-crm-match]')
      expect(unknown?.getAttribute('data-org-crm-match')).toBe('notFound')
      expect(unknown).toHaveTextContent(label('orgGraph.crmMatch.notFound'))
    })

    it('sait dire NON : contacts non chargés (pas d’index) = aucun badge, jamais « non retrouvée » par défaut', () => {
      render(<HierarchyOrgView graph={graph()} directionId="e-ds" onDirectionChange={() => {}} />)
      expect(document.querySelectorAll('[data-org-crm-match]')).toHaveLength(0)
    })
  })

  // #4049.1 (retour bêta 12/10) — « les cartes doivent aussi être cliquables ici » : la carte de
  // l'arbre ouvre la MÊME fiche que celle de la vue focale (#3019), au clic comme au clavier.
  describe('#4049.1 — les cartes de l’arbre ouvrent la fiche contact', () => {
    const contact = { id: 'c-ceo', full_name: 'Michael Schoellhorn' } as unknown as Contact

    function mount(onContactClick: (c: Contact) => void) {
      render(
        <HierarchyOrgView
          graph={graph()}
          directionId="e-ds"
          onDirectionChange={() => {}}
          contactIndex={buildContactSlugIndex([contact])}
          onContactClick={onContactClick}
        />,
      )
      const tree = screen.getByRole('group', { name: label('focal.treeAria') })
      return within(tree).getByRole('button', { name: label('focal.openContactAria', { name: 'Michael Schoellhorn' }) })
    }

    it('un clic sur la carte ouvre la fiche', () => {
      const open = vi.fn()
      fireEvent.click(mount(open))
      expect(open).toHaveBeenCalledWith(contact)
    })

    it('Entrée et Espace l’ouvrent aussi (focalisable au clavier)', () => {
      const open = vi.fn()
      const card = mount(open)
      expect(card).toHaveAttribute('tabindex', '0')
      fireEvent.keyDown(card, { key: 'Enter' })
      fireEvent.keyDown(card, { key: ' ' })
      expect(open).toHaveBeenCalledTimes(2)
    })

    // #4061 (recette prod 12/10 : 32 nœuds sur 75 ni cliquables ni focalisables) — TOUT nœud s'ouvre.
    it('#4061 — une personne sans fiche ouvre un panneau personne (nom, rôle, rattachement), jamais un nœud inerte', () => {
      const open = vi.fn()
      render(
        <HierarchyOrgView
          graph={graph()}
          directionId="e-ds"
          onDirectionChange={() => {}}
          contactIndex={buildContactSlugIndex([contact])}
          onContactClick={open}
        />,
      )
      const tree = screen.getByRole('group', { name: label('focal.treeAria') })
      const node = within(tree).getByRole('button', { name: label('focal.openPersonAria', { name: 'Claudia Werner' }) })
      expect(node).toHaveAttribute('tabindex', '0')
      fireEvent.click(node)
      expect(open).not.toHaveBeenCalled()
      const panel = screen.getByRole('dialog')
      expect(within(panel).getByText('Claudia Werner')).toBeInTheDocument()
      expect(within(panel).getByText(label('personPanel.noRecord'))).toBeInTheDocument()
    })

    it('#4061 — GARDE : aucun nœud de l’arbre n’est sans rôle bouton ni hors de l’ordre de tabulation', () => {
      render(
        <HierarchyOrgView
          graph={graph()}
          directionId="e-ds"
          onDirectionChange={() => {}}
          contactIndex={buildContactSlugIndex([contact])}
          onContactClick={() => {}}
        />,
      )
      const nodes = document.querySelectorAll('[data-org-person]')
      expect(nodes.length).toBeGreaterThan(1)
      for (const node of nodes) {
        expect(node.getAttribute('role')).toBe('button')
        expect(node.getAttribute('tabindex')).toBe('0')
      }
    })
  })
})
