import { orgGraphSchema, type AccountMarketContext } from '@bellum/contracts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render as rtlRender, screen, within, type RenderResult } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import { formatCalendarDate } from '@/lib/deadline'
import { FocalOrgView } from './FocalOrgView'
import { chooseOption, getSelect, optionValues, selectedValue } from '@/test/select'

/**
 * #2837 — même mock que `OrgInfluenceMap.test.tsx`/`GroupOrgView.test.tsx` :
 * un état par défaut silencieux (« Non mesuré ») pour ne perturber aucun des
 * tests existants de ce fichier.
 */
type MarketMemoryQueryState = { data?: AccountMarketContext | null; isPending: boolean; isError: boolean }
const marketMemoryState: { current: MarketMemoryQueryState } = {
  current: { data: undefined, isPending: false, isError: false },
}
vi.mock('@/features/accounts/hooks/useAccountMarketContext', () => ({
  useAccountMarketContext: () => marketMemoryState.current,
}))

// #4072.1 — les personnes que l'espace connaît déjà chez ce compte (lecteur unique des faits).
const knownPeopleState: {
  current: { people: { fullName: string; reasons: ('crm' | 'mission')[]; lastDate: string | null }[] } | null
} = { current: null }
vi.mock('@/features/account-facts/useKnownPeople', () => ({
  useKnownPeople: () => knownPeopleState.current,
}))

/**
 * #2121.15 / #2121.54 — `FocalOrgView` appelle désormais `useContactRanking`
 * (React Query) pour partager le classement de l'onglet Contacts. Sans
 * `QueryClientProvider`, `useQuery` lève AVANT même de regarder `enabled` —
 * les 16 `render(<FocalOrgView …/>)` de ce fichier, qui ne posaient jamais de
 * provider, casseraient tous. Un seul wrapper ICI, plutôt que de le recopier
 * dans chaque test (GA-26) ; les deux tests qui posent DÉJÀ le leur (retry
 * désactivé pour `OrgVerifyRelation`) ne s'en trouvent qu'imbriqués, sans effet.
 */
function render(ui: ReactElement): RenderResult {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return rtlRender(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

/**
 * L'écran par défaut de l'organigramme (OrgGraph FINAL, décisions 3, 4 et 5).
 *
 * Ce que ces tests tiennent, et que la version d'avant échouait :
 *
 *   1. la HAUTEUR d'une carte vient du niveau hiérarchique, jamais du rôle
 *      commercial — les rangées s'appellent « Exécutif », « Direction »… et
 *      jamais « Sponsor » ;
 *   2. les Achats sont dans une colonne à part, hors de l'arbre ;
 *   3. un bloqueur reste VISIBLE dans la structure et n'apparaît jamais dans le
 *      chemin recommandé ;
 *   4. la vue Groupe est secondaire — accessible en un clic, pas la page d'arrivée.
 */

const SOURCE = { id: 's-off', kind: 'official_site' as const, grounding: 'A' as const, date: '2026-08-01' }

const GRAPH = orgGraphSchema.parse({
  graphVersion: 4,
  entities: [
    { id: 'e-grp', name: 'AIRBUS SE', type: 'groupe', parentId: null, confidence: 95, sources: [SOURCE] },
    { id: 'e-ds', name: 'AIRBUS DS', type: 'filiale', parentId: 'e-grp', confidence: 92, sources: [SOURCE] },
    { id: 'e-eng', name: 'Engineering', type: 'bu', parentId: 'e-ds', confidence: 80, sources: [] },
  ],
  people: [
    {
      id: 'p-schoellhorn',
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
      id: 'p-werner',
      fullName: 'Claudia Werner',
      title: 'Engineering Director',
      entityId: 'e-eng',
      hierarchyLevel: 'L2',
      decisionRoles: ['champion'],
      identityStatus: 'actionable',
      confidence: 78,
      sources: [],
    },
    {
      id: 'p-perrin',
      fullName: 'Lucas Perrin',
      title: 'Systems Architect',
      entityId: 'e-eng',
      hierarchyLevel: 'L4',
      decisionRoles: ['blocker'],
      identityStatus: 'classified',
      confidence: 55,
      sources: [],
    },
    {
      id: 'p-klein',
      fullName: 'Sarah Klein',
      title: 'Category Manager IT',
      entityId: 'e-ds',
      hierarchyLevel: 'L5',
      decisionRoles: ['procurement'],
      identityStatus: 'classified',
      confidence: 60,
      sources: [],
    },
  ],
  hierarchyEdges: [
    {
      fromId: 'p-werner',
      toId: 'p-schoellhorn',
      type: 'reports_to',
      sourceIds: [SOURCE.id],
      confidence: 95,
      verified: true,
    },
  ],
  influenceEdges: [],
  buyingCommittee: [{ personId: 'p-schoellhorn', role: 'economic_buyer', entityId: 'e-ds' }],
  uncoveredZones: [],
  recommendedPath: [
    { step: 1, personId: 'p-schoellhorn', objective: 'ouvrir le périmètre', unlocks: 'le budget 2027' },
    { step: 2, personId: 'p-perrin', objective: 'ne devrait jamais être proposé' },
  ],
  rejectedItems: [],
})

function renderView(props: Partial<React.ComponentProps<typeof FocalOrgView>> = {}) {
  return render(<FocalOrgView graph={GRAPH} discovered={2241} {...props} />)
}

describe('FocalOrgView', () => {
  afterEach(() => {
    knownPeopleState.current = null
  })

  // #4072.1 — une personne que l'espace connaît déjà est MARQUÉE et DATÉE ; une
  // autre ne porte aucune ligne (une absence ne fait aucune ligne).
  it('#4072.1 — marque la personne connue de l’espace (nom exact, forme neutralisée), et elle seule', () => {
    knownPeopleState.current = {
      people: [{ fullName: 'CLAUDIA werner', reasons: ['crm', 'mission'], lastDate: '2025-03-01' }],
    }
    renderView()
    const markers = screen.getAllByTestId('org-person-known')
    expect(markers).toHaveLength(1)
    expect(markers[0]!.closest('[data-org-person], div')?.textContent).toMatch(/Claudia Werner/)
    expect(markers[0]).toHaveTextContent(/2025/)
  })

  it('#4072.1 — sans lecture des personnes connues, aucune ligne de plus', () => {
    renderView()
    expect(screen.queryByTestId('org-person-known')).toBeNull()
  })

  it("les rangées de l'arbre portent des NIVEAUX, jamais des rôles commerciaux", () => {
    renderView()
    const tree = screen.getByRole('group', { name: i18n.t('accountOrg:focal.treeAria') })
    expect(within(tree).getByText(i18n.t('accountOrg:orgMap.levels.L1'))).toBeInTheDocument()
    expect(within(tree).getByText(i18n.t('accountOrg:orgMap.levels.L2'))).toBeInTheDocument()
    // Le badge Sponsor est bien à l'écran — sur une CARTE, pas en tête de rangée.
    // #3423.7 — le rôle commercial calculé est NOMMÉ « Rôle dans la vente », jamais un libellé nu.
    const sponsorBadges = within(tree).getAllByText(
      i18n.t('accountOrg:focal.salesRole', { role: i18n.t('accountOrg:focal.badges.sponsor') }),
    )
    expect(sponsorBadges.length).toBeGreaterThan(0)
    for (const badge of sponsorBadges) {
      expect(badge.closest('[data-focal-level-label]')).toBeNull()
    }
  })

  // #4016.L9d (18/10) — le rôle technique (un des 8 du contrat) se lit AU SURVOL du badge, avec sa phrase.
  it('#4016.L9d — le badge de rôle porte, au survol, le rôle exact et sa phrase', () => {
    renderView()
    const tree = screen.getByRole('group', { name: i18n.t('accountOrg:focal.treeAria') })
    const card = within(tree)
      .getByText('Michael Schoellhorn')
      .closest('[data-testid="focal-person-card"]') as HTMLElement
    const hovered = Array.from(card.querySelectorAll<HTMLElement>('[title]')).map(el => el.getAttribute('title'))
    expect(hovered.some(title => title?.includes(i18n.t('contacts:roleDescriptions.economic')))).toBe(true)
  })

  it('la direction focale est nommée dans le titre de l’arbre', () => {
    renderView()
    expect(screen.getByRole('heading', { name: /AIRBUS DS/ })).toBeInTheDocument()
  })

  it('les Achats sont dans une colonne à part, hors de l’arbre hiérarchique', () => {
    renderView()
    const tree = screen.getByRole('group', { name: i18n.t('accountOrg:focal.treeAria') })
    expect(within(tree).queryByText('Sarah Klein')).toBeNull()
    const procurement = screen.getByRole('group', { name: i18n.t('accountOrg:focal.procurementAria') })
    expect(within(procurement).getByText('Sarah Klein')).toBeInTheDocument()
  })

  // #2515 — Louis : « carte moche, prend trop de place pour rien, textes qui
  // dépassent ». Le badge d'entité (pilule `w-fit whitespace-nowrap`) sortait
  // de la carte (`max-w-[18rem]`) dès que le nom de l'entité était long — il
  // tronque désormais, texte entier au survol.
  it('le badge d’entité ne déborde jamais de la carte — il tronque, texte entier au survol', () => {
    renderView()
    const procurement = screen.getByRole('group', { name: i18n.t('accountOrg:focal.procurementAria') })
    const badge = within(procurement).getByText('AIRBUS DS')
    expect(badge.className).toContain('truncate')
    expect(badge.getAttribute('title')).toBe('AIRBUS DS')
  })

  it('un bloqueur reste visible dans la structure et n’entre jamais dans le chemin', () => {
    renderView()
    const tree = screen.getByRole('group', { name: i18n.t('accountOrg:focal.treeAria') })
    expect(within(tree).getByText('Lucas Perrin')).toBeInTheDocument()
    const path = screen.getByRole('group', { name: i18n.t('accountOrg:focal.pathAria') })
    expect(within(path).queryByText('Lucas Perrin')).toBeNull()
    // Et ce qui a été retiré est NOMMÉ — un silence se lirait comme un oubli.
    expect(within(path).getByText(/Lucas Perrin/)).toBeInTheDocument()
  })

  // #3036 (retour bêta) — « mettre le chemin d'accès recommandé en dessous de
  // la carte, pour laisser la carte en pleine largeur ». L'arbre de décision
  // (la carte) vient d'abord, plein largeur ; le chemin d'accès suit dessous —
  // plus de colonne `xl:grid-cols-*` qui les mettait côte à côte.
  it('le chemin d’accès recommandé suit la carte dans le DOM, plus jamais à côté', () => {
    renderView()
    const treeCard = screen
      .getByRole('group', { name: i18n.t('accountOrg:focal.treeAria') })
      .closest('[data-slot="card"]') as HTMLElement
    const pathCard = screen.getByRole('group', { name: i18n.t('accountOrg:focal.pathAria') })
    expect(treeCard).not.toBeNull()

    expect(treeCard.compareDocumentPosition(pathCard) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // Même conteneur, plein largeur pour les deux — desktop et mobile.
    const wrapper = treeCard.parentElement as HTMLElement
    expect(wrapper).toBe(pathCard.parentElement)
    expect(wrapper.className).toContain('w-full')
    expect(wrapper.className).not.toMatch(/grid-cols/)
  })

  it('le nombre de contacts découverts est celui du DOSSIER, pas celui de la vague IA', () => {
    renderView()
    expect(screen.getByText(/2\s?241/)).toBeInTheDocument()
  })

  it('un dossier dont on ignore le nombre de contacts n’affiche pas « 0 » — le compteur ne s’affiche pas', () => {
    render(<FocalOrgView graph={GRAPH} />)
    // #4075 — une absence ne fait aucune ligne : ni zéro (qui se lirait « ce compte n'a aucun
    // contact »), ni libellé orphelin.
    const banner = screen.getByRole('group', { name: i18n.t('accountOrg:focal.coverageAria') })
    expect(within(banner).queryByText(i18n.t('accountOrg:focal.coverage.discovered'))).not.toBeInTheDocument()
    expect(within(banner).queryByTitle(i18n.t('accountOrg:focal.discoveredUnknown'))).not.toBeInTheDocument()
  })

  /**
   * D278 — le bandeau ne fabrique plus « rattachés ».
   *
   * Le contrat REFUSE de produire `attachedToEntity` et écrit pourquoi ; l'écran
   * le recomptait sur `graph.people`, la projection bornée par la vague
   * d'enrichissement. Il affichait donc un rattachement FERME sur un graphe qui
   * n'avait rien mesuré — « 2 241 découverts · 43 rattachés » sur AIRBUS.
   */
  it('« rattachés » n’affiche jamais un nombre : le contrat ne le mesure pas, le compteur est absent', () => {
    renderView()
    const banner = screen.getByRole('group', { name: i18n.t('accountOrg:focal.coverageAria') })
    // #4075 — absent du bandeau (jamais « rattachés non mesuré » coupé en deux) ; le chiffre que
    // l'écran fabriquait avant D278 (4 personnes portant une entité) n'y paraît pas non plus.
    expect(within(banner).queryByText(i18n.t('accountOrg:focal.coverage.attached'))).not.toBeInTheDocument()
    expect(within(banner).queryByTitle(i18n.t('accountOrg:focal.attachedUnknown'))).not.toBeInTheDocument()
  })

  it('« enrichis IA » vient du run, et ne s’affiche pas quand le run ne l’a pas dit', () => {
    renderView()
    const banner = screen.getByRole('group', { name: i18n.t('accountOrg:focal.coverageAria') })
    expect(within(banner).queryByText(i18n.t('accountOrg:focal.coverage.enriched'))).not.toBeInTheDocument()
    expect(within(banner).queryByTitle(i18n.t('accountOrg:focal.enrichedUnknown'))).not.toBeInTheDocument()
  })

  it('quand le run a mesuré sa vague, le bandeau affiche SON chiffre, pas le nombre de nœuds', () => {
    const measured = orgGraphSchema.parse({
      ...GRAPH,
      coverage: { discovered: 2241, deterministicClassified: 2103, llmEnriched: 613, enrichmentBatchSize: 50 },
    })
    render(<FocalOrgView graph={measured} discovered={2241} />)
    const banner = screen.getByRole('group', { name: i18n.t('accountOrg:focal.coverageAria') })
    // 613, pas 4 (le nombre de personnes que le graphe projette).
    expect(within(banner).getByText(/613/)).toBeInTheDocument()
    // Et « rattachés » reste absent : le run ne le produit toujours pas.
    expect(within(banner).queryByText(i18n.t('accountOrg:focal.coverage.attached'))).not.toBeInTheDocument()
  })

  it('les DÉNOMBREMENTS du graphe restent des nombres — ici « 0 » serait VRAI', () => {
    renderView()
    const banner = screen.getByRole('group', { name: i18n.t('accountOrg:focal.coverageAria') })
    const verified = within(banner).getByText(i18n.t('accountOrg:focal.coverage.verifiedLinks')).parentElement!
    expect(verified.textContent).toMatch(/1/)
    const zones = within(banner).getByText(i18n.t('accountOrg:focal.coverage.uncoveredZones')).parentElement!
    expect(zones.textContent).toMatch(/0/)
  })

  it('la vue système est accessible en un clic, et ce n’est pas la page d’arrivée', async () => {
    const onSystemView = vi.fn()
    renderView({ onSystemView })
    await userEvent.click(screen.getByRole('button', { name: i18n.t('accountOrg:focal.systemView') }))
    expect(onSystemView).toHaveBeenCalledOnce()
  })

  it('changer de direction change le périmètre de l’arbre', async () => {
    renderView()
    expect(screen.getByRole('heading', { name: /AIRBUS DS/ })).toBeInTheDocument()
    const select = screen.getByRole('combobox', { name: i18n.t('accountOrg:focal.directionAria') })
    await chooseOption(select, 'e-eng')
    expect(screen.getByRole('heading', { name: /Engineering/ })).toBeInTheDocument()
    // Et le périmètre a VRAIMENT changé : le CEO de la filiale n'y est plus.
    const tree = screen.getByRole('group', { name: i18n.t('accountOrg:focal.treeAria') })
    expect(within(tree).queryByText('Michael Schoellhorn')).toBeNull()
  })

  it("un rattachement vérifié le DIT ; sans lien, l'écran reste silencieux", () => {
    renderView()
    expect(
      screen.getByText(i18n.t('accountOrg:focal.reportsToVerified', { name: 'Michael Schoellhorn' })),
    ).toBeInTheDocument()
    // Schoellhorn n'a pas de N+1 dans le graphe : aucune phrase ne lui en invente un.
    expect(screen.queryByText(/Michael Schoellhorn.*→/)).toBeNull()
  })

  it('le verdict cite la personne, la raison et ce que ça débloque', () => {
    renderView()
    const path = screen.getByRole('group', { name: i18n.t('accountOrg:focal.pathAria') })
    const verdict = within(path).getByText(/Commence par Michael Schoellhorn/)
    expect(verdict).toHaveTextContent('ouvrir le périmètre')
    expect(verdict).toHaveTextContent('le budget 2027')
  })

  /**
   * L'avertissement de coloration — D267 (30/08/2026).
   *
   * Il disait, sur le dossier ROCHE : « seules 0 % ne portent aucun rôle de
   * décision, alors que le plancher est de 60 % ». Deux défauts en une phrase :
   * elle mesure une ABSENCE (« ne portent aucun rôle »), si bien qu'un lecteur
   * la lit à l'envers — 0 % sans rôle, c'est 100 % avec, ce qui SEMBLE être le
   * bon cas ; et le 0 % lui-même n'était pas mesuré.
   */
  it('quand le générateur colore plus que le plancher autorise, l’écran le dit — dans le sens qui alarme', () => {
    // Une personne grise sur dix : 90 % coloriées, là où 40 % est le maximum.
    const colorie = orgGraphSchema.parse({ ...GRAPH, colouring: { unenriched: 10, grey: 1, floor: 0.6 } })
    render(<FocalOrgView graph={colorie} discovered={2241} />)
    const notice = screen.getByRole('note', { name: i18n.t('accountOrg:focal.overColouredAria') })
    // Ce qui alarme est la part COLORIÉE, énoncée positivement, et le maximum
    // qu'elle ne devrait pas dépasser — jamais une double négation.
    expect(notice).toHaveTextContent('90')
    expect(notice).toHaveTextContent('40')
  })

  it('un graphe qui n’a pas pu être mesuré reste MUET — il n’accuse pas le générateur', () => {
    // Aucune des personnes de `GRAPH` ne porte `unknown` ni de liste vide : ce
    // graphe ne sait pas dire « je ne sais pas ». Le repli n'a donc rien mesuré,
    // et un avertissement serait un verdict tiré d'un silence.
    renderView()
    expect(screen.queryByRole('note', { name: i18n.t('accountOrg:focal.overColouredAria') })).toBeNull()
  })

  /**
   * Le défaut connexe du correctif P0. « Vérifier ce lien » ne s'affichait que
   * sur une ligne INFÉRÉE des « 4 vues » — une section secondaire. Quand un
   * `reportsTo` sans preuve relationnelle cesse de produire une arête, cette
   * ligne disparaît, et le geste qui aurait permis de promouvoir la supposition
   * en lien prouvé disparaît avec elle. Il vit désormais AUSSI sur la carte,
   * là où le rattachement se lit.
   */
  it('le geste « vérifier ce lien » est sur la carte du lien PROBABLE, pas ailleurs', () => {
    const withProbable = orgGraphSchema.parse({
      ...GRAPH,
      hierarchyEdges: [
        {
          fromId: 'p-werner',
          toId: 'p-schoellhorn',
          type: 'reports_to',
          sourceIds: [],
          confidence: 62,
          verified: false,
        },
      ],
    })
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <FocalOrgView accountId="a1" graph={withProbable} discovered={12} />
      </QueryClientProvider>,
    )
    expect(screen.getByRole('button', { name: i18n.t('accountOrg:orgGraph.verifyRelation') })).toBeInTheDocument()
  })

  it('un lien VÉRIFIÉ ne propose pas de le revérifier — il est déjà sourcé', () => {
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <FocalOrgView accountId="a1" graph={GRAPH} discovered={12} />
      </QueryClientProvider>,
    )
    expect(screen.queryByRole('button', { name: i18n.t('accountOrg:orgGraph.verifyRelation') })).toBeNull()
  })

  it('#4805 — un graphe sans personne rattachée NOMME l’absence au lieu de disparaître', () => {
    const empty = orgGraphSchema.parse({
      graphVersion: 1,
      entities: [{ id: 'e', name: 'X', type: 'groupe', confidence: 50, sources: [] }],
      people: [],
    })
    render(<FocalOrgView graph={empty} />)
    expect(screen.getByTestId('org-view-absence')).toHaveTextContent(i18n.t('accountOrg:absence.view'))
    expect(screen.getByTestId('org-view-absence')).toHaveTextContent(i18n.t('accountOrg:absence.viewReason'))
  })
})

/* ------------------------------------------------------------------ */
/*  Ce que chaque nœud porte TOUJOURS (T5.md:804-813)                  */
/* ------------------------------------------------------------------ */

describe('FocalOrgView — source, date et badge « déduit »', () => {
  /** Un graphe d'une personne, dont on règle la provenance et le rôle. */
  function oneCard(over: Record<string, unknown>) {
    return orgGraphSchema.parse({
      graphVersion: 1,
      entities: [{ id: 'e', name: 'Engineering', type: 'bu', parentId: null, confidence: 80, sources: [] }],
      people: [
        {
          id: 'p',
          fullName: 'Claudia Werner',
          title: 'Engineering Director',
          entityId: 'e',
          hierarchyLevel: 'L2',
          decisionRoles: ['economic_buyer'],
          identityStatus: 'classified',
          confidence: 70,
          sources: [],
          ...over,
        },
      ],
    })
  }

  it('un rôle DÉDUIT du titre porte son badge — « Sponsor » ne se lit pas comme une observation', () => {
    render(<FocalOrgView graph={oneCard({ roleInferred: true })} />)
    expect(screen.getAllByText(i18n.t('accountOrg:focal.roleInferred')).length).toBeGreaterThan(0)
  })

  it('un rôle DÉCLARÉ par quelqu’un ne le porte pas — une correction humaine gagne', () => {
    render(<FocalOrgView graph={oneCard({ roleInferred: false })} />)
    expect(screen.queryByText(i18n.t('accountOrg:focal.roleInferred'))).toBeNull()
  })

  it('une source SANS date ne fait AUCUNE mention de son absence (#3037, doctrine #2613)', () => {
    const graph = oneCard({ sources: [{ id: 's', kind: 'linkedin', grounding: 'B' }] })
    render(<FocalOrgView graph={graph} />)
    // Le label de la source reste — seule la date manquante ne s'écrit plus.
    expect(screen.getAllByText(i18n.t('accountOrg:orgGraph.sourceKinds.linkedin')).length).toBeGreaterThan(0)
    expect(screen.queryByText(/date inconnue|unknown date/i)).toBeNull()
  })

  it('un nœud SANS aucune preuve le dit — le silence se lirait comme une carte plus courte', () => {
    render(<FocalOrgView graph={oneCard({})} />)
    expect(screen.getAllByText(i18n.t('accountOrg:focal.noSource')).length).toBeGreaterThan(0)
  })
})

/* ------------------------------------------------------------------ */
/*  #2121.1 — un arbre sans lien prouvé ne s'appelle pas organigramme  */
/* ------------------------------------------------------------------ */

describe('FocalOrgView — le titre dit ce que la carte PROUVE (#2121.1)', () => {
  const heading = () => screen.getByRole('heading', { level: 3, name: /AIRBUS DS|Engineering/ })

  it('avec un rattachement vérifié, l’arbre garde son titre d’organigramme', () => {
    renderView()
    expect(heading()).toHaveTextContent(i18n.t('accountOrg:focal.treeTitle', { direction: 'AIRBUS DS' }))
  })

  it('sans AUCUN lien vérifié, il se titre « carte d’influence commerciale » — jamais « organigramme »', () => {
    const unproven = orgGraphSchema.parse({
      ...GRAPH,
      hierarchyEdges: [
        {
          fromId: 'p-werner',
          toId: 'p-schoellhorn',
          type: 'reports_to',
          sourceIds: [],
          confidence: 62,
          verified: false,
        },
      ],
    })
    render(<FocalOrgView graph={unproven} discovered={12} />)
    expect(heading()).toHaveTextContent(i18n.t('accountOrg:focal.treeTitleUnproven', { direction: 'AIRBUS DS' }))
    expect(heading().textContent).not.toMatch(/organigramme|org chart/i)
  })
})

/* ------------------------------------------------------------------ */
/*  #2121.43-45 — trois gestes nommés sur la carte, un tiroir chacun   */
/* ------------------------------------------------------------------ */

describe('FocalOrgView — ajouter, corriger une relation, déclarer un rôle (#2121.43-45, #3019)', () => {
  function renderWithAccount() {
    return render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <FocalOrgView accountId="a1" graph={GRAPH} discovered={12} />
      </QueryClientProvider>,
    )
  }

  // #3019 retour bêta — « les 3 boutons d'action prennent trop de place sur
  // la carte » : les trois gestes tiennent maintenant dans UN menu, ouvert
  // par un seul bouton nommé.
  async function openGestureMenu(card: HTMLElement) {
    const user = userEvent.setup()
    await user.click(
      within(card).getByRole('button', { name: i18n.t('accountOrg:row.actionsAria', { name: 'Claudia Werner' }) }),
    )
    return user
  }

  // Recette 12/10/2026 — cartes de ~340 px avec un grand vide sous le contenu : les cartes d'une même rangée
  // (`flex-wrap`, `align-items: stretch` par défaut) prenaient la hauteur de la plus haute. Chacune épouse son contenu.
  it('les cartes d’une rangée épousent leur contenu : la rangée n’étire pas (items-start)', () => {
    renderWithAccount()
    const tree = screen.getByRole('group', { name: i18n.t('accountOrg:focal.treeAria') })
    const card = within(tree).getByText('Claudia Werner').closest('[data-testid="focal-person-card"]') as HTMLElement
    const row = card.parentElement as HTMLElement
    expect(row.className).toContain('flex-wrap')
    expect(row.className).toContain('items-start')
    expect(card.className).not.toMatch(/\b(h-full|min-h-\[|h-\[)/)
  })

  // Recette 13/10/2026 — ~45 px de vide sous le contenu : le menu « … » avait SA PROPRE rangée (mt-2). Il vit
  // désormais sur la ligne du nom.
  it('le menu « … » est sur la ligne du nom, pas dans une rangée à lui', () => {
    renderWithAccount()
    const tree = screen.getByRole('group', { name: i18n.t('accountOrg:focal.treeAria') })
    const card = within(tree).getByText('Claudia Werner').closest('[data-testid="focal-person-card"]') as HTMLElement
    const trigger = within(card).getByRole('button', {
      name: i18n.t('accountOrg:row.actionsAria', { name: 'Claudia Werner' }),
    })
    const nameRow = within(card).getByText('Claudia Werner').parentElement as HTMLElement
    expect(nameRow.contains(trigger)).toBe(true)
    expect(card.innerHTML).not.toContain('mt-2 flex justify-end')
  })

  it('les trois gestes vivent dans UN SEUL menu, nommés par ce qu’ils font', async () => {
    renderWithAccount()
    const tree = screen.getByRole('group', { name: i18n.t('accountOrg:focal.treeAria') })
    const card = within(tree).getByText('Claudia Werner').closest('[data-testid="focal-person-card"]') as HTMLElement
    // Avant ouverture, les trois gestes ne sont plus trois boutons sur la carte.
    for (const key of ['addWhatIKnow', 'correctRelation', 'declareRole']) {
      expect(within(card).queryByRole('button', { name: i18n.t(`accountOrg:correction.gestures.${key}`) })).toBeNull()
    }
    await openGestureMenu(card)
    for (const key of ['addWhatIKnow', 'correctRelation', 'declareRole']) {
      expect(screen.getByRole('menuitem', { name: i18n.t(`accountOrg:correction.gestures.${key}`) })).toBeTruthy()
    }
    // Le bouton générique « Corriger » n'apparaît pas non plus : trois gestes nommés le remplacent.
    expect(screen.queryByRole('menuitem', { name: i18n.t('accountOrg:correction.trigger') })).toBeNull()
  })

  it.each([
    ['declareRole', 'decisionRoles'],
    ['correctRelation', 'reportsTo'],
    ['addWhatIKnow', 'title'],
  ])('« %s » ouvre le tiroir SUR le champ qu’il nomme (%s)', async (key, field) => {
    renderWithAccount()
    const tree = screen.getByRole('group', { name: i18n.t('accountOrg:focal.treeAria') })
    const card = within(tree).getByText('Claudia Werner').closest('[data-testid="focal-person-card"]') as HTMLElement
    const user = await openGestureMenu(card)
    await user.click(screen.getByRole('menuitem', { name: i18n.t(`accountOrg:correction.gestures.${key}`) }))
    expect(await selectedValue(getSelect(i18n.t('accountOrg:correction.fieldLabel')))).toBe(field)
  })
})

/* ------------------------------------------------------------------ */
/*  #3019 (retour bêta) — la carte ouvre la fiche contact, et montre   */
/*  ce qu'on A en plus (statut d'identité, coordonnées)                 */
/* ------------------------------------------------------------------ */

describe('FocalOrgView — la carte ouvre la fiche contact réelle (#3019)', () => {
  // #3019 — `full_name` doit se réduire, par `orgPersonSlug`, au MÊME slug que
  // l'id de la personne dans `GRAPH` (`p-werner`, pas `p-claudia-werner`) :
  // même rapprochement que `OrgInfluenceMap`, jamais un second calcul.
  const contacts = [
    { id: 'c-werner', full_name: 'Werner', email: 'claudia.werner@airbus.com', phone: '+33600000000' },
  ] as unknown as React.ComponentProps<typeof FocalOrgView>['contacts']

  it('un clic sur la carte ouvre la fiche du contact RETROUVÉ, jamais un identifiant inventé', async () => {
    const onContactClick = vi.fn()
    renderView({ contacts, onContactClick })
    const tree = screen.getByRole('group', { name: i18n.t('accountOrg:focal.treeAria') })
    const card = within(tree).getByRole('button', {
      name: i18n.t('accountOrg:focal.openContactAria', { name: 'Claudia Werner' }),
    })
    await userEvent.click(card)
    expect(onContactClick).toHaveBeenCalledWith(expect.objectContaining({ id: 'c-werner' }))
  })

  it('le clavier ouvre la même fiche — Entrée comme la souris', async () => {
    const onContactClick = vi.fn()
    renderView({ contacts, onContactClick })
    const tree = screen.getByRole('group', { name: i18n.t('accountOrg:focal.treeAria') })
    const card = within(tree).getByRole('button', {
      name: i18n.t('accountOrg:focal.openContactAria', { name: 'Claudia Werner' }),
    })
    card.focus()
    await userEvent.keyboard('{Enter}')
    expect(onContactClick).toHaveBeenCalledOnce()
  })

  it('sans contact retrouvé pour cette personne, la carte reste en lecture — aucun clic qui mène nulle part', () => {
    const onContactClick = vi.fn()
    renderView({ onContactClick })
    const tree = screen.getByRole('group', { name: i18n.t('accountOrg:focal.treeAria') })
    const card = within(tree).getByText('Claudia Werner').closest('[data-testid="focal-person-card"]') as HTMLElement
    expect(card).not.toHaveAttribute('role', 'button')
  })

  it('montre les coordonnées du contact retrouvé — jamais l’une sans l’autre si l’une manque', () => {
    renderView({ contacts, onContactClick: vi.fn() })
    expect(screen.getByText('claudia.werner@airbus.com')).toBeInTheDocument()
    // #3850.4 — stockage E.164 compact (+33600000000), AFFICHAGE international lisible.
    expect(screen.getByText('+33 6 00 00 00 00')).toBeInTheDocument()
  })

  it('sans coordonnées connues, aucune ligne — l’absence ne fait aucune ligne', () => {
    renderView()
    expect(screen.queryByText(/@/)).toBeNull()
  })

  it('le statut d’identité — une info qu’on A déjà sur le graphe — s’affiche sur la carte', () => {
    renderView()
    expect(screen.getAllByText(i18n.t('accountOrg:orgMap.identityStatus.actionable')).length).toBeGreaterThan(0)
  })

  /**
   * #3019 — recette écran du 25/09/2026, compte CAPGEMINI : la carte « Bernd
   * Wachter » restait non cliquable. Cause racine (`organigrammeData.ts`,
   * `resolveGraphPersonContact`) : le graphe et la fiche contact ne portaient
   * pas le nom dans le même ordre (registre légal « NOM Prénom » côté fiche,
   * page équipe « Prénom Nom » côté graphe) — la clé EXACTE ne les rapprochait
   * pas. Reproduit ici avec un cas réaliste plutôt que le raccourci
   * (surnom seul) des tests ci-dessus.
   */
  it('un nom inversé entre le graphe et la fiche (registre légal vs page équipe) reste cliquable — CAPGEMINI, #3019', async () => {
    const capgemini = orgGraphSchema.parse({
      graphVersion: 1,
      entities: [{ id: 'e', name: 'CAPGEMINI', type: 'filiale', parentId: null, confidence: 80, sources: [] }],
      people: [
        {
          id: 'p-bernd-wachter',
          fullName: 'Bernd Wachter',
          title: 'Directeur régional',
          entityId: 'e',
          identityStatus: 'actionable',
          confidence: 80,
          sources: [],
        },
      ],
    })
    const contacts = [
      { id: 'c-wachter', full_name: 'Wachter Bernd', email: null, phone: null },
    ] as unknown as React.ComponentProps<typeof FocalOrgView>['contacts']
    const onContactClick = vi.fn()
    render(<FocalOrgView graph={capgemini} contacts={contacts} onContactClick={onContactClick} />)
    const card = screen.getByRole('button', {
      name: i18n.t('accountOrg:focal.openContactAria', { name: 'Bernd Wachter' }),
    })
    await userEvent.click(card)
    expect(onContactClick).toHaveBeenCalledWith(expect.objectContaining({ id: 'c-wachter' }))
  })
})

/* ------------------------------------------------------------------ */
/*  Quatre directions, « + N autres » (T5.md:1051)                     */
/* ------------------------------------------------------------------ */

describe('FocalOrgView — le groupe à 1 000 filiales', () => {
  const BIG = orgGraphSchema.parse({
    graphVersion: 1,
    entities: Array.from({ length: 1000 }, (_, i) => ({
      id: `e-${i}`,
      name: `Direction ${String(i).padStart(4, '0')}`,
      type: 'bu' as const,
      parentId: null,
      confidence: 70,
      sources: [],
    })),
    people: Array.from({ length: 1000 }, (_, i) =>
      Array.from({ length: Math.max(1, 5 - i) }, (_, j) => ({
        id: `p-${i}-${j}`,
        fullName: `P${i}-${j}`,
        entityId: `e-${i}`,
        decisionRoles: ['unknown' as const],
        identityStatus: 'classified' as const,
        confidence: 50,
        sources: [],
      })),
    ).flat(),
  })

  it('ne propose que QUATRE raccourcis, et compte EXACTEMENT ceux qu’il ne montre pas', () => {
    render(<FocalOrgView graph={BIG} />)
    expect(screen.getByRole('button', { name: 'Direction 0000' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Direction 0003' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Direction 0004' })).toBeNull()
    expect(screen.getByText(i18n.t('accountOrg:focal.moreDirections', { count: 996 }))).toBeInTheDocument()
  })

  it('garde un chemin vers les 996 autres : le sélecteur les porte toutes', async () => {
    render(<FocalOrgView graph={BIG} />)
    // ⚠️ Le menu n'est plus un `<select>` natif : ses options n'existent dans
    //    le DOM que la liste OUVERTE. On l'ouvre donc, puis on compte — et on
    //    compte au sélecteur CSS plutôt qu'avec `getAllByRole`, qui recalcule
    //    l'arbre d'accessibilité pour chacune des mille entrées (7 s en local,
    //    une expiration sous la charge de la CI).
    const proposées = await optionValues(screen.getByLabelText(i18n.t('accountOrg:focal.directionAria')))
    expect(proposées).toHaveLength(1000)
  })

  it('ne double PAS le sélecteur quand le compte tient dans la rangée', async () => {
    const small = orgGraphSchema.parse({
      graphVersion: 1,
      entities: Array.from({ length: 3 }, (_, i) => ({
        id: `e-${i}`,
        name: `Direction ${i}`,
        type: 'bu' as const,
        parentId: null,
        confidence: 70,
        sources: [],
      })),
      people: Array.from({ length: 3 }, (_, i) => ({
        id: `p-${i}`,
        fullName: `P${i}`,
        entityId: `e-${i}`,
        decisionRoles: ['unknown' as const],
        identityStatus: 'classified' as const,
        confidence: 50,
        sources: [],
      })),
    })
    render(<FocalOrgView graph={small} />)
    // Le sélecteur les porte déjà toutes : une rangée qui répéterait les mêmes
    // noms serait la même chose deux fois, sous deux formes.
    //
    // ⚠️ La première assertion vise le bouton de la RANGÉE. Depuis le passage
    // au menu Radix, elle doit être posée AVANT d'ouvrir la liste : ouverte,
    // celle-ci contient elle aussi un « Direction 0 », et le test se mettrait
    // à mesurer exactement ce qu'il veut interdire.
    expect(screen.queryByRole('button', { name: 'Direction 0' })).toBeNull()
    const proposées = await optionValues(screen.getByLabelText(i18n.t('accountOrg:focal.directionAria')))
    expect(proposées).toHaveLength(3)
  })
})

describe('FocalOrgView — un fait périmé se dit avec sa date (#2553.3)', () => {
  function oneCard(over: Record<string, unknown>) {
    return orgGraphSchema.parse({
      graphVersion: 1,
      entities: [{ id: 'e', name: 'Engineering', type: 'bu', parentId: null, confidence: 80, sources: [] }],
      people: [
        {
          id: 'p',
          fullName: 'Claudia Werner',
          title: 'Engineering Director',
          entityId: 'e',
          hierarchyLevel: 'L2',
          decisionRoles: [],
          identityStatus: 'classified',
          confidence: 70,
          sources: [],
          ...over,
        },
      ],
    })
  }

  it('un organigramme importé daté de 2023 marque la personne « à vérifier »', () => {
    render(<FocalOrgView graph={oneCard({ lastVerifiedAt: '2023-06-01' })} />)
    expect(
      screen.getByText(i18n.t('accountOrg:focal.staleInfo', { date: formatCalendarDate('2023-06-01') })),
    ).toBeInTheDocument()
  })

  it('ne montre jamais la date ISO brute (#3434, recette prod 26755bbac3, lot C1, 30/09)', () => {
    render(<FocalOrgView graph={oneCard({ lastVerifiedAt: '2023-06-01' })} />)
    expect(screen.queryByText(/2023-06-01/)).not.toBeInTheDocument()
    expect(screen.getByText('01/06/2023', { exact: false })).toBeInTheDocument()
  })

  it('une vérification récente ne porte aucune mention « à vérifier »', () => {
    const recent = new Date().toISOString().slice(0, 10)
    render(<FocalOrgView graph={oneCard({ lastVerifiedAt: recent })} />)
    expect(screen.queryByText(/à vérifier/i)).toBeNull()
  })

  it('une personne jamais vérifiée ne porte pas non plus la mention — ce n’est pas ce que #2553.3 demande', () => {
    render(<FocalOrgView graph={oneCard({})} />)
    expect(screen.queryByText(/à vérifier/i)).toBeNull()
  })
})

/**
 * #2121.15 / #2121.54 — le tableau du bas montre les contacts UTILES en
 * premier, dans le MÊME ordre que le classement de l'onglet Contacts
 * (`useContactRanking`) — jamais un second calcul (GA-26).
 */
vi.mock('@/features/contacts/hooks/useContactRanking', () => ({
  // Défaut « pas encore classé » — la MAJORITÉ des tests de ce fichier
  // rendent `FocalOrgView` sans se soucier du classement ; sans ce défaut,
  // `ranking.data?.ranked` planterait sur un mock qui renvoie `undefined`.
  useContactRanking: vi.fn(() => ({ data: undefined })),
}))

describe('FocalOrgView — le tableau des contacts suit le classement (#2121.15, #2121.54)', () => {
  it('sans classement disponible (compte pas encore classé), le tableau garde son tri par défaut', () => {
    renderView({ accountId: 'a1' })
    const table = screen.getByRole('table')
    const firstDataRow = within(table).getAllByRole('row')[1]
    // Niveau L1 (Schoellhorn) devant L5 (Klein) — comportement d'avant ce point.
    expect(within(firstDataRow!).getByText('Michael Schoellhorn')).toBeInTheDocument()
  })

  it('un contact classé en tête (mais sans niveau ni confiance forts) passe devant dans le tableau', async () => {
    const { useContactRanking } = await import('@/features/contacts/hooks/useContactRanking')
    // « Klein » (L5, confiance 60) serait dernière sans classement — le
    // classement de Contacts la place en tête : le tableau doit la SUIVRE.
    // `mockReturnValueOnce` : n'affecte QUE ce rendu, jamais les autres tests.
    vi.mocked(useContactRanking).mockReturnValueOnce({
      data: { ranked: [{ contact_id: 'c-klein', position: 1 }] },
    } as unknown as ReturnType<typeof useContactRanking>)
    const contacts = [
      { id: 'c-schoellhorn', full_name: 'Schoellhorn' },
      { id: 'c-klein', full_name: 'Klein' },
    ] as unknown as React.ComponentProps<typeof FocalOrgView>['contacts']
    renderView({ accountId: 'a1', contacts })
    const table = screen.getByRole('table')
    const firstDataRow = within(table).getAllByRole('row')[1]
    expect(within(firstDataRow!).getByText('Sarah Klein')).toBeInTheDocument()
  })
})

/**
 * #2837 — la ligne mémoire marché, RACINE seulement (GA-391). La "direction"
 * de cette vue peut être une entité fille (choisie dans le sélecteur) : la
 * ligne ne se pose que quand la direction OUVERTE est la racine du graphe.
 */
describe('#2837 — la ligne mémoire marché ne se pose que sur la direction racine', () => {
  it('direction par défaut = AIRBUS DS (une entité fille) : aucune ligne mémoire marché', async () => {
    marketMemoryState.current = {
      data: { paths_observed: 5 } as AccountMarketContext,
      isPending: false,
      isError: false,
    }
    render(<FocalOrgView accountId="a1" graph={GRAPH} />)
    await expect(selectedValue(getSelect(i18n.t('accountOrg:focal.directionAria')))).resolves.toBe('e-ds')
    const line = i18n.t('accounts:marketContext.paths', { count: 5 }) as string
    expect(screen.queryByText(new RegExp(line.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))).toBeNull()
  })

  it('une entité racine sans filiale (seule direction possible) porte la ligne', () => {
    marketMemoryState.current = {
      data: { paths_observed: 5 } as AccountMarketContext,
      isPending: false,
      isError: false,
    }
    const rootOnly = orgGraphSchema.parse({
      graphVersion: 1,
      entities: [{ id: 'e', name: 'Bellum Conseil', type: 'groupe', parentId: null, confidence: 80, sources: [] }],
      people: [
        {
          id: 'p',
          fullName: 'Claudia Werner',
          entityId: 'e',
          hierarchyLevel: 'L1',
          decisionRoles: [],
          identityStatus: 'classified',
          confidence: 70,
          sources: [],
        },
      ],
    })
    render(<FocalOrgView accountId="a1" graph={rootOnly} />)
    const line = i18n.t('accounts:marketContext.paths', { count: 5 }) as string
    expect(screen.getByText(new RegExp(line.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))).toBeInTheDocument()
  })

  it('sans `accountId`, aucune ligne — même sur une direction racine', () => {
    marketMemoryState.current = {
      data: { paths_observed: 5 } as AccountMarketContext,
      isPending: false,
      isError: false,
    }
    const rootOnly = orgGraphSchema.parse({
      graphVersion: 1,
      entities: [{ id: 'e', name: 'Bellum Conseil', type: 'groupe', parentId: null, confidence: 80, sources: [] }],
      people: [
        {
          id: 'p',
          fullName: 'Claudia Werner',
          entityId: 'e',
          hierarchyLevel: 'L1',
          decisionRoles: [],
          identityStatus: 'classified',
          confidence: 70,
          sources: [],
        },
      ],
    })
    render(<FocalOrgView graph={rootOnly} />)
    const line = i18n.t('accounts:marketContext.paths', { count: 5 }) as string
    expect(screen.queryByText(new RegExp(line.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))).toBeNull()
  })
})

describe('FocalOrgView — le N+1 PROBABLE déduit des intitulés (#4016 L4.2)', () => {
  const withTitles = orgGraphSchema.parse({
    ...GRAPH,
    people: [
      ...GRAPH.people,
      {
        id: 'p-dsi',
        fullName: 'Hélène Morel',
        title: 'DSI',
        entityId: 'e-ds',
        hierarchyLevel: 'L1',
        decisionRoles: [],
        identityStatus: 'classified',
        confidence: 60,
        sources: [],
      },
      {
        id: 'p-infra',
        fullName: 'Karim Saïdi',
        title: 'Responsable infrastructure IT',
        entityId: 'e-ds',
        hierarchyLevel: 'L3',
        decisionRoles: [],
        identityStatus: 'classified',
        confidence: 55,
        sources: [],
      },
    ],
  })

  it('le rattachement déduit se lit « probable », BADGÉ, jamais comme un fait vérifié', () => {
    render(<FocalOrgView graph={withTitles} />)
    expect(
      screen.getAllByText(i18n.t('accountOrg:focal.reportsToInferred', { name: 'Hélène Morel' }), { exact: false })
        .length,
    ).toBeGreaterThan(0)
    expect(screen.getAllByText(i18n.t('common:estimate.label')).length).toBeGreaterThan(0)
    expect(
      screen.queryByText(i18n.t('accountOrg:focal.reportsToVerified', { name: 'Hélène Morel' }), { exact: false }),
    ).not.toBeInTheDocument()
  })

  it('sait dire NON : une arête déduite n’entre jamais dans le chemin recommandé du graphe', () => {
    expect(withTitles.recommendedPath.map(step => step.personId)).not.toContain('p-infra')
  })
})

/** #4749 — la vue focale ne rend plus `null` quand des personnes sont connues mais aucune n'est rattachée. */
describe('FocalOrgView — personnes connues, aucune rattachée (#4749)', () => {
  const unattached = (n: number) => ({
    id: `p-${n}`,
    fullName: `Personne Synthetique ${n}`,
    title: 'Poste synthétique',
    entityId: null,
    hierarchyLevel: 'L3',
    decisionRoles: ['unknown'],
    identityStatus: 'classified',
    confidence: 50,
    sources: [],
  })
  const build = (people: unknown[]) =>
    orgGraphSchema.parse({ graphVersion: 5, entities: [], people, hierarchyEdges: [], influenceEdges: [] })

  it('NOMME les personnes non rattachées', async () => {
    await i18n.changeLanguage('fr')
    render(<FocalOrgView graph={build([unattached(1), unattached(2)])} />)
    const notice = screen.getByRole('group', { name: i18n.t('accountOrg:hierarchy.unplacedAria') })
    expect(notice).toHaveTextContent(i18n.t('accountOrg:hierarchy.unplacedBody', { known: 2, unplaced: 2 }))
  })

  it('contrôle négatif — un graphe sans personne ne dit rien', async () => {
    await i18n.changeLanguage('fr')
    render(<FocalOrgView graph={build([])} />)
    expect(screen.queryByRole('group', { name: i18n.t('accountOrg:hierarchy.unplacedAria') })).toBeNull()
  })
})
