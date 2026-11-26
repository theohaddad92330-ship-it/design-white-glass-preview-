import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import type { Account, Contact } from '@bellum/contracts'
import { AccountDetailTabContent } from './AccountDetailTabContent'
import { SECTION_KEYS, subSectionAnchorId, tabsOfSection, type TabId } from './AccountDetailTabsBar'
import { TabMigrationNotice } from './TabMigrationNotice'
import { resolveLegacyTabNotice } from '../accountDetailSearch'

vi.mock('@/hooks/useFirstName', () => ({ useFirstName: () => '' }))
vi.mock('@/features/discover/hooks/useHiringDomainProfile', () => ({ useHiringDomainProfile: () => undefined }))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
  useSearch: () => '',
}))

vi.mock('@/features/accounts/hooks/usePersistAccountPlan', () => ({
  usePersistAccountPlan: () => ({ addAction: vi.fn(), addAngle: vi.fn(), isPending: false }),
}))

/** Chaque page du dossier est remplacée par un témoin : ce qui se vérifie ici
 *  est la STRUCTURE des sections, pas le contenu de chacune — qui a ses propres
 *  suites, et qui monterait un réseau entier pour rien. */
function stub(name: string) {
  return () => ({ [name]: () => <div data-testid={`stub-${name}`} /> })
}

// Refonte Théo (23/10) — « Ce que je sais » : ses blocs qui lisent l'API sont bouchonnés, la vue d'ensemble et le
// score restent les deux bouchons que ce fichier attend (rien n'est retiré de la Synthèse).
vi.mock('../tabs/knowledge/AccountKnowledgeCounters', stub('AccountKnowledgeCounters'))
vi.mock('./AccountVerdictSummary', stub('AccountVerdictSummary'))
vi.mock('../tabs/synthesis/AccountSynthesisCards', () => ({
  AccountSynthesisTop: () => null,
  useSynthesisNextAction: () => null,
}))
vi.mock('@/features/chains/view/ChainProgressBlock', () => ({ ChainProgressBlock: () => null }))
vi.mock('./LinkedAccountsCard', () => ({ LinkedAccountsCard: () => null }))
vi.mock('./GroupEntitiesCard', () => ({ GroupEntitiesCard: () => null }))
vi.mock('./AccountSellerTargeting', () => ({ AccountSellerTargeting: () => null }))
vi.mock('@/features/team-guardrails/components/DuplicateCandidatesCard', () => ({
  DuplicateCandidatesCard: () => null,
}))
// #4914 — le panneau d'offres monte dans l'écran Opportunités et lit la session : ce test ne porte pas de SessionProvider.
vi.mock('../tabs/veille/AccountJobOffersPanel', () => ({ AccountJobOffersPanel: () => null }))
vi.mock('../tabs/TabContacts', stub('TabContacts'))
// #4996 L6 — le segment « Mon périmètre » a son propre test (`ContactsPerimeterBar.test.tsx`).
vi.mock('../tabs/contacts/ContactsPerimeterBar', () => ({ ContactsPerimeterBar: () => null }))
vi.mock('@/features/accounts/hooks/useContactsPerimeter', () => ({ useContactsPerimeter: () => ({ data: undefined }) }))
vi.mock('../tabs/contacts/PersonalContactsSection', () => ({ PersonalContactsSection: () => null }))
vi.mock('../tabs/TabCoverage', stub('TabCoverage'))
vi.mock('../tabs/TabCommittee', stub('TabCommittee'))
vi.mock('../tabs/TabEvaluation', stub('TabEvaluation'))
vi.mock('../tabs/TabOverview', stub('TabOverview'))
vi.mock('../tabs/TabOrganigramme', stub('TabOrganigramme'))
vi.mock('../tabs/TabProjects', stub('TabProjects'))
// #5107.5 — les blocs de tête d'Écosystème vivent dans la « Lecture détaillée » de TabPartners (prop `detailedExtra`) :
// le bouchon la rend, pour que l'assertion « la tête de section est montée » reste celle d'avant.
vi.mock('../tabs/TabPartners', () => ({
  TabPartners: ({ detailedExtra }: { detailedExtra?: ReactNode }) => (
    <div data-testid="stub-TabPartners">{detailedExtra}</div>
  ),
}))
vi.mock('../tabs/TabMissions', stub('TabMissions'))
vi.mock('../tabs/TabProofs', stub('TabProofs'))
vi.mock('../tabs/TabPlan', stub('TabPlan'))
vi.mock('../tabs/TabSites', stub('TabSites'))
vi.mock('../tabs/TabSignal', stub('TabSignal'))
vi.mock('../tabs/opportunities/SignalsStaleNotice', () => ({ SignalsStaleNotice: () => null }))
// #3918.1 — la section des affaires CRM lit la session : stubée ici, prouvée dans son propre test.
vi.mock('../tabs/opportunities/TrackedDealsBox', () => ({ TrackedDealsBox: () => null }))
vi.mock('../tabs/opportunities/AccountDealFactsSection', () => ({ AccountDealFactsSection: () => null }))
// Les signaux CRM lisent aussi la session : même traitement, prouvés dans AccountCrmSignalsSection.test.tsx.
vi.mock('../tabs/opportunities/AccountCrmSignalsSection', () => ({ AccountCrmSignalsSection: () => null }))
vi.mock('../tabs/opportunities/AccountCrmMirrorSection', () => ({ AccountCrmMirrorSection: () => null }))
vi.mock('../tabs/TabAccess', stub('TabAccess'))
// #2115.22-27 — les quatre sous-parties ajoutées aux sections qui les
// promettaient. Stubées comme leurs voisines : ce fichier prouve le MONTAGE
// (quelle section empile quoi, dans quel ordre, sous quelle ancre), pas le
// contenu de chaque bloc — qui a ses propres tests.
// #3678 — l'écran unique lit les domaines d'offre du profil (`useEsnProfile`) : hors session ici.
vi.mock('@/features/profile/hooks/useEsnProfile', () => ({ useEsnProfile: () => ({ data: undefined }) }))
// #3918.1 — l'onglet Opportunités monte `AccountDealFactsSection` (faits CRM, lus par session) : hors session ici.
vi.mock('@/features/account-facts/useAccountFactsBrief', () => ({ useAccountFactsBrief: () => null }))
vi.mock('../tabs/veille/SignalPrograms', stub('SignalPrograms'))
vi.mock('../tabs/TabNeeds', stub('TabNeeds'))
// #4022 — les cartes de l'écran Opportunités (recrutements, besoins d'équipe, vision) : témoins.
vi.mock('../tabs/opportunities/OpportunityCards', () => ({
  useOpportunitySections: () => ({ sections: { recruitment: [], team: [], vision: [] }, contacts: [] }),
  RecruitmentSection: () => <div data-testid="stub-RecruitmentSection" />,
  TeamNeedsSection: () => null,
  VisionSection: ({ children }: { children?: import('react').ReactNode }) => (
    <div data-testid="stub-VisionSection">{children}</div>
  ),
}))
// #4755 (lot 761) — l'écran « Signaux et besoins » est UN tableau, qui a sa propre suite
// (`AccountOpportunityScreen.test.tsx`) : témoin ici.
vi.mock('../tabs/opportunities/AccountSignalTable', stub('AccountSignalTable'))
vi.mock('../tabs/TabMessages', stub('TabMessages'))
vi.mock('../tabs/sections/RelationshipMemoryCard', stub('RelationshipMemoryCard'))
// #4323.3 — la liste des ESN présentes vit maintenant sous « Ce que je sais » AVEC OU SANS brief, et elle lit la
// session (contexte canonique, contexte marché). Témoin comme ses voisines : ce fichier prouve le MONTAGE des
// sections, pas son contenu — prouvé dans PresentEsnList.test.tsx.
vi.mock('../tabs/sections/PresentEsnList', () => ({ PresentEsnList: () => null }))
vi.mock('@/features/activities/view/TimelinePanel', stub('TimelinePanel'))
vi.mock('@/features/activities/view/ExecutedActionsList', stub('ExecutedActionsList'))
vi.mock('@/features/tasks/view/TaskList', stub('TaskList'))
// #2120.48 — témoin comme ses voisins : ce fichier prouve le MONTAGE de
// `PeopleSectionActions` (ordre, boutons, portée), pas la lecture réseau que
// `CrmConfrontationDialog` ferait au clic — qui a sa propre suite et exige un
// `QueryClientProvider` que ce harnais structurel ne monte pas.
vi.mock('../tabs/contacts/CrmConfrontationDialog', stub('CrmConfrontationDialog'))
// #2119.8 — la tête de section est un témoin comme les autres : ce qui se
// vérifie ici est qu'elle est MONTÉE, et seulement sur sa section.
// #2172 — la file « Pistes à qualifier », témoin pour la même raison que ses
// deux voisines. Elle lit `i18n.language` et monte un client de requêtes : sans
// témoin elle casse le rendu de la section entière sur un mock qui ne rend
// que `t`, et ce fichier ne verrait plus le MONTAGE qu'il vérifie.
vi.mock('../tabs/opportunities/QualificationLeadsQueue', stub('QualificationLeadsQueue'))
// #2122.12-.19 — la tête de la section Écosystème & accès, témoin pour la même
// raison : ce fichier prouve le MONTAGE, ses quatre blocs ont leur propre suite.
vi.mock('../tabs/ecosystem/AccountEcosystemTop', stub('AccountEcosystemTop'))
vi.mock('@/features/crm-core/view/RecordHistory', stub('RecordHistory'))
// #2718.2 — le fil unifié (user_actions, mouvements de projet, exécutions)
// vivait dans l'onglet Plan, jamais dans l'onglet nommé « Historique » où le
// client le cherche. Témoin comme ses voisins de cette section : ce fichier
// prouve le MONTAGE, `AccountTimelineCard` a sa propre suite.
vi.mock('../tabs/sections/AccountTimelineCard', stub('AccountTimelineCard'))
// #2914 (#2128.10) — le fil de commentaires du compte, témoin pour la même
// raison que ses voisins de section : ce fichier prouve le MONTAGE,
// `AccountTeamComments` a sa propre suite.
vi.mock('../collaboration/AccountTeamComments', stub('AccountTeamComments'))
// #2120.46/.47 — les deux dialogues que l'en-tête de la section Personnes
// ouvre. Remplacés par des témoins pour la même raison que les pages : ils
// montent chacun un réseau, et ce qui se vérifie ici est la STRUCTURE.
vi.mock('@/features/crm-core/view/CreateContactDialog', stub('CreateContactDialog'))
vi.mock('@/features/universal-import/view/UniversalImportDialog', stub('UniversalImportDialog'))

// #3709 — la bande « entonnoir + valeur ajoutée » : témoins, ce fichier prouve le MONTAGE.
// #4022 jumeau — `veille` et `projects` rendent le MÊME écran Opportunité
// (voir #3624/#3676 plus bas) : le stub générique ne verrait pas une régression
// où seul `veille` passerait `signalsListedBelow`. On rend la prop visible.
vi.mock('./KnownAccountValueCard', () => ({
  KnownAccountValueCard: ({ signalsListedBelow }: { signalsListedBelow?: boolean }) => (
    <div data-testid="stub-KnownAccountValueCard" data-signals-listed-below={String(Boolean(signalsListedBelow))} />
  ),
}))

const account = { id: 'a1', company_name: 'ACME', raw_analysis: null } as unknown as Account

/** Un dossier qui a des contacts — l'état où les deux gestes vivent en en-tête. */
const CONTACTS = [{ id: 'c1' }, { id: 'c2' }] as unknown as Contact[]

function renderSection(activeTab: TabId, hiddenTabs: readonly TabId[] = [], contacts: Contact[] = []) {
  return render(
    <AccountDetailTabContent
      account={account}
      contacts={contacts}
      activeTab={activeTab}
      onTabChange={() => {}}
      hiddenTabs={hiddenTabs}
    />,
  )
}

const anchors = (container: HTMLElement) =>
  [...container.querySelectorAll('[id^="dossier-"]')].map(node => node.getAttribute('id'))

/**
 * R15-8 (recette du 15/09/2026, prod `5ca597d5a`, dossiers THALES et QONTO) —
 * UNE PUCE MONTRE SON PANNEAU ET CACHE LES AUTRES.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI A ÉTÉ MESURÉ
 * ─────────────────────────────────────────────────────────────────────────────
 * `?tab=organigramme` et `?tab=contacts` changeaient la puce active et l'URL,
 * et rien ne se cachait : « Carte d'influence commerciale », « Corrections de
 * l'organigramme » PUIS « Du contact détecté au contact prioritaire » se
 * suivaient dans la même page, quelle que soit la valeur de `tab`. Conséquence
 * directe : le titre « Chemin d'accès recommandé » apparaissait DEUX FOIS, sous
 * la même forme et avec le même contenu — ce que la loi 4 du tome 7 interdit.
 * Sur QONTO, la troisième puce (« Qui nous manque ») avait le même défaut.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE ÇA CHANGE À #2115.21-27
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ Revirement ASSUMÉ, et il est ici pour être lu. D8 (14/09/2026) absorbait
 * les quatorze onglets dans sept sections et faisait de la section l'unité de
 * rendu : une section EMPILAIT ses sous-parties. Les sept sections, leur ordre,
 * leurs sous-parties et les quatorze clés d'URL ne bougent PAS — c'est le seul
 * point qui change : la sous-partie redevient l'unité de RENDU.
 *
 * La raison est celle que la recette a montrée à l'écran : une barre de puces
 * qui ne cache rien n'est pas une navigation, c'est un sommaire qui se déguise
 * en onglets — et empiler trois panneaux qui parlent des mêmes personnes fait
 * mécaniquement dire deux fois la même chose. `tab` reste la source de vérité,
 * elle est déjà dans l'URL et survit au rechargement.
 */
describe('AccountDetailTabContent — une puce montre son panneau, et lui seul (R15-8)', () => {
  it('Théo comptes-fiche — Synthèse = UN panneau : le dossier ET l’intérêt du compte, sous toutes ses clés d’URL', () => {
    for (const tab of ['overview', 'brief', 'evaluation'] as const) {
      const { container, getByTestId, unmount } = renderSection(tab)
      expect(anchors(container)).toEqual([subSectionAnchorId(tab)])
      expect(getByTestId('stub-TabOverview')).toBeInTheDocument()
      expect(getByTestId('stub-TabEvaluation')).toBeInTheDocument()
      unmount()
    }
  })

  it('Personnes : chacune des trois puces montre la sienne et cache les deux autres', () => {
    for (const tab of ['organigramme', 'contacts', 'coverage'] as const) {
      const { container, unmount } = renderSection(tab)
      expect(anchors(container)).toEqual([subSectionAnchorId(tab)])
      unmount()
    }
  })

  /**
   * La conséquence directe, celle que le retour NOMME : deux panneaux de la
   * section Personnes portent chacun un « Chemin d'accès recommandé ». Tant
   * qu'ils sont rendus ensemble, le titre est écrit deux fois — rien dans
   * l'un ni dans l'autre ne peut le savoir.
   */
  it('deux sous-parties de Personnes ne sont JAMAIS rendues ensemble (loi 4)', () => {
    const { container } = renderSection('organigramme')

    expect(anchors(container)).toHaveLength(1)
    expect(anchors(container)).not.toContain(subSectionAnchorId('contacts'))
  })

  it('Écosystème & accès garde DEUX blocs distincts — montrés l’un OU l’autre', () => {
    expect(tabsOfSection('ecosystem')).toEqual(['partners', 'access'])

    const { container, getByTestId, queryByTestId } = renderSection('access')
    expect(anchors(container)).toEqual(['dossier-access'])
    expect(getByTestId('stub-TabAccess')).toBeInTheDocument()
    expect(queryByTestId('stub-TabPartners')).not.toBeInTheDocument()
  })

  it('Historique & preuves : la puce « preuves » ne traîne pas les trois autres', () => {
    const { container } = renderSection('proofs')

    expect(anchors(container)).toEqual(['dossier-proofs'])
  })

  it('sait dire NON : une section ne rend RIEN d’une autre', () => {
    const { container, queryByTestId } = renderSection('partners')

    expect(anchors(container)).not.toContain(subSectionAnchorId('overview'))
    expect(queryByTestId('stub-TabOverview')).not.toBeInTheDocument()
  })

  // #2122.12-.19 — la tête de la section Écosystème & accès est MONTÉE, et sur
  // sa seule section : les quatre blocs qu'elle porte parlent des DEUX
  // sous-parties, donc ils ne peuvent vivre dans aucune des deux.
  it('#2122 — Écosystème & accès porte sa tête de section, et elle seule', () => {
    const { container: ecosysteme } = renderSection('partners')
    expect(ecosysteme.querySelector('[data-testid="stub-AccountEcosystemTop"]')).not.toBeNull()

    const { container: synthese } = renderSection('overview')
    expect(synthese.querySelector('[data-testid="stub-AccountEcosystemTop"]')).toBeNull()
  })

  it('un onglet masqué faute de contenu actionnable ne se rend pas davantage', () => {
    const { container } = renderSection('contacts', ['coverage'])

    expect(anchors(container)).toEqual(['dossier-contacts'])
  })

  it('mais l’onglet ACTIF s’affiche même masqué — un lien partagé doit ouvrir ce qu’il promet', () => {
    const { container } = renderSection('coverage', ['coverage'])

    expect(anchors(container)).toEqual(['dossier-coverage'])
  })

  it('#2115.44 — la sous-partie rendue porte l’ANCRE que la barre écrit', () => {
    for (const tab of tabsOfSection('opportunities')) {
      const { container, unmount } = renderSection(tab)
      expect(anchors(container)).toEqual([subSectionAnchorId(tab)])
      unmount()
    }
  })

  it('démo clients 04/10 — le glissement de ±8 px de l’onglet est rogné, il ne crée pas de défilement horizontal', () => {
    // `tabSlide` décale le panneau de 8 px (x: 8 / -8) : sans rognage, la fiche
    // compte débordait de 8 px sur toutes les fiches.
    const { container } = renderSection('overview')
    const wrapper = container.querySelector('[class*="overflow-x-clip"]')
    expect(wrapper).not.toBeNull()
    expect(wrapper?.querySelector('section')).not.toBeNull()
  })
})

/**
 * R15-8 — LA PAGE NE SAUTE PLUS.
 *
 * Tant que la section empilait ses sous-parties, arriver sur `?tab=access`
 * laissait le lecteur en haut des partenaires : il fallait amener l'ancre dans
 * le champ (#2115.44). La sous-partie demandée étant désormais la SEULE rendue,
 * elle est déjà en haut — et un `scrollIntoView` au montage ferait sauter une
 * page qui n'a nulle part où aller.
 */
describe('AccountDetailTabContent — le panneau demandé est déjà en haut', () => {
  function watchScrolls(): { scrolled: string[]; restore: () => void } {
    const scrolled: string[] = []
    const spy = vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(function (this: Element) {
      scrolled.push(this.id)
    })
    return { scrolled, restore: () => spy.mockRestore() }
  }

  it.each(['access', 'partners', 'coverage'] as const)(
    'n’amène plus rien à l’écran au montage de « %s » — il n’y a qu’un panneau',
    tab => {
      const { scrolled, restore } = watchScrolls()
      try {
        renderSection(tab)
        expect(scrolled).toEqual([])
      } finally {
        restore()
      }
    },
  )
})

/**
 * #2115.33 — LA NOTICE DE MIGRATION, EN CONTEXTE.
 *
 * `resolveLegacyTabNotice` (couvert dans `accountDetailSearch.test.ts`) décide
 * QUAND elle a le droit d'exister ; ici, on prouve qu'`AccountDetailTabContent`
 * la CAPTURE bien depuis l'URL d'arrivée et la place au bon endroit — jamais
 * ailleurs que dans la section qu'elle concerne.
 */
describe('AccountDetailTabContent — la notice de migration (#2115.33)', () => {
  function withUrl(search: string) {
    window.history.pushState({}, '', `/accounts/a1${search}`)
  }

  beforeEach(() => {
    window.sessionStorage.clear()
  })

  afterEach(() => {
    window.history.pushState({}, '', '/')
  })

  it('une ancienne valeur (pré-sections) affiche la notice dans SA section', () => {
    withUrl('?tab=score')
    const { getByText } = renderSection('evaluation')

    expect(getByText('tabMigrationNotice.messageWithSubSection')).toBeInTheDocument()
  })

  // #3720 (recette MO 10/10) — `?tab=programs` → `?tab=veille` SANS notice : le dossier se démonte/remonte
  // pendant le chargement (la requête compte repasse en « loading »), et la lecture de l'URL au montage
  // tombait alors sur l'URL DÉJÀ réécrite. L'écran parent capture l'arrivée UNE fois et la transmet.
  it('#3720 — la notice capturée par le parent survit à une URL déjà réécrite en canonique', () => {
    withUrl('?tab=veille')
    const { getByText } = render(
      <AccountDetailTabContent
        account={account}
        contacts={[]}
        activeTab="veille"
        onTabChange={() => {}}
        legacyTabNotice={resolveLegacyTabNotice('programs')}
      />,
    )

    expect(getByText(/tabMigrationNotice\.message/)).toBeInTheDocument()
  })

  // #3720 (lot RAT, recette NF 10/10 : notice présente mais top=-5106 px) — l'arrivée `?tab=programs`
  // DÉFILE jusqu'à la carte « Projets et transformations » (#3677) : une notice posée en tête de l'onglet
  // sortait de l'écran par ce défilement même. Les tests RAN prouvaient sa PRÉSENCE, jamais sa position.
  // Sur cette arrivée-là, elle est épinglée (sticky) : visible à l'arrivée, au-dessus de la carte.
  it('#3720 — sur l’arrivée « programmes », la notice reste épinglée pendant le défilement vers la carte', () => {
    withUrl('?tab=veille')
    const { getByText } = render(
      <AccountDetailTabContent
        account={account}
        contacts={[]}
        activeTab="veille"
        onTabChange={() => {}}
        legacyTabNotice={resolveLegacyTabNotice('programs')}
      />,
    )
    const notice = getByText(/tabMigrationNotice\.message/).closest('[data-tab-migration-notice]')
    expect(notice?.className).toMatch(/(^|\s)sticky(\s|$)/)
  })

  it('#3720 — sait dire NON : une autre ancienne URL (sans défilement) garde la notice dans le flux', () => {
    withUrl('?tab=score')
    const { getByText } = renderSection('evaluation')
    const notice = getByText(/tabMigrationNotice\.message/).closest('[data-tab-migration-notice]')
    expect(notice).not.toBeNull()
    expect(notice?.className).not.toMatch(/(^|\s)sticky(\s|$)/)
  })

  it('jamais sur une valeur canonique — elle n’a pas bougé', () => {
    withUrl('?tab=evaluation')
    const { queryByText } = renderSection('evaluation')

    expect(queryByText('tabMigrationNotice.messageWithSubSection')).not.toBeInTheDocument()
    expect(queryByText('tabMigrationNotice.messageSectionOnly')).not.toBeInTheDocument()
  })

  it('jamais sur un raccourci de section — né AVEC les sections', () => {
    withUrl('?tab=synthese')
    const { queryByText } = renderSection('overview')

    expect(queryByText('tabMigrationNotice.messageWithSubSection')).not.toBeInTheDocument()
    expect(queryByText('tabMigrationNotice.messageSectionOnly')).not.toBeInTheDocument()
  })

  /**
   * #2115.44 / #2115.22-27 — LA PHRASE COURTE EXISTE ENCORE, ELLE N'A PLUS DE CAS.
   *
   * Elle se déclenchait quand la section d'arrivée ne comptait qu'UNE
   * sous-partie : nommer la sous-partie aurait répété le nom de la section.
   * Depuis que les quatre objets promis ont rejoint leur section, les sept en
   * comptent toutes au moins deux — le cas n'est donc plus atteignable DEPUIS
   * `AccountDetailTabContent`, et le prétendre depuis une URL le ferait mentir.
   *
   * On le prouve donc là où il vit : sur le composant, avec la seule entrée qui
   * le produit. La branche reste défendue (elle redeviendra atteignable le jour
   * où une section perdra une sous-partie), et le test dit la vérité sur QUI
   * peut l'atteindre aujourd'hui.
   */
  it('#2115.44 — une section à une seule sous-partie n’écrit pas la sous-section deux fois', () => {
    // #3677 — depuis le retrait de « Programmes », Périmètres n'a plus que
    // « Sites » ; Théo A comptes-fiche.R2 — l'Organigramme a sa propre section : #4745 — « Stratégie financière » a sa propre section d'un seul écran : ce sont les TROIS sections à une sous-partie, et la notice la dit
    // sans écrire la sous-section deux fois.
    expect(SECTION_KEYS.filter(section => tabsOfSection(section).length === 1)).toEqual([
      'perimeters',
      'organigramme',
      'finance',
    ])

    const { getByText, queryByText } = render(
      <TabMigrationNotice sectionLabel="Plan d’action" dismissKey="messages-only-section" />,
    )

    expect(getByText('tabMigrationNotice.messageSectionOnly')).toBeInTheDocument()
    expect(queryByText('tabMigrationNotice.messageWithSubSection')).not.toBeInTheDocument()
  })

  it('sait dire NON : elle ne s’affiche pas dans une section qu’elle ne concerne pas', () => {
    withUrl('?tab=score') // résout vers Synthèse
    const { queryByText } = renderSection('partners') // section Écosystème & accès

    expect(queryByText('tabMigrationNotice.messageWithSubSection')).not.toBeInTheDocument()
    expect(queryByText('tabMigrationNotice.messageSectionOnly')).not.toBeInTheDocument()
  })
})

/**
 * #3676 / #3714 — UNE SEULE SURFACE « Signaux et besoins », SANS le bandeau
 * « À regarder en premier ». Ce test est l'APPELANT des besoins confirmés (ils
 * vivent maintenant dans `veille`) et sait dire NON sur les autres onglets.
 */
describe('AccountDetailTabContent — Signaux et besoins, une surface (#3676)', () => {
  // #4755 (lot 761) — besoins, projets possibles et signaux sont des LIGNES du tableau unique, monté ici.
  it('monte le tableau unique des signaux et besoins dans cet onglet', () => {
    const { getByTestId, queryByTestId } = renderSection('veille')
    expect(getByTestId('stub-AccountSignalTable')).toBeInTheDocument()
    // Les anciens blocs empilés ne reviennent pas à côté du tableau.
    expect(queryByTestId('stub-TabNeeds')).toBeNull()
    expect(queryByTestId('stub-QualificationLeadsQueue')).toBeNull()
    expect(queryByTestId('stub-RecruitmentSection')).toBeNull()
  })

  it('ne monte pas le tableau sur une autre section', () => {
    const { queryByTestId } = renderSection('overview')
    expect(queryByTestId('stub-AccountSignalTable')).toBeNull()
  })

  it('le bandeau « À regarder en premier » n’existe plus (#3714)', () => {
    const { queryByText, queryByTestId } = renderSection('veille')
    expect(queryByText(/À regarder en premier|topOpportunities/)).toBeNull()
    expect(queryByTestId('stub-AccountOpportunitiesTop')).toBeNull()
  })
})

/**
 * #3053 (Louis 26/09/2026) — LE CONTENU VIENT IMMÉDIATEMENT SOUS LA BARRE.
 *
 * Mesuré en production (SOPRA STERIA GROUP, `?tab=veille`) : cliquer un
 * sous-onglet d'Opportunités ne changeait rien dans le viewport, parce que
 * `AccountOpportunitiesTop` et `QualificationLeadsQueue` étaient rendues AVANT
 * la `<section>` de la sous-partie, (sous-onglets d'alors) —
 * un écran entier au-dessus du contenu que le clic est censé changer. Ce test
 * prouve la structure : plus rien ne précède la sous-partie active dans son
 * conteneur, et le premier bloc qu'on y trouve change réellement avec elle.
 * `AccountEcosystemTop` et `PeopleSectionActions` ont leur propre suite
 * (`#2122` ci-dessus, `PeopleSectionActions.test.tsx`).
 */
describe('AccountDetailTabContent — #3053, rien entre la barre et le contenu (Opportunités)', () => {
  it('la sous-partie active est le SEUL enfant rendu à ce niveau, sur chaque sous-onglet', () => {
    for (const tab of tabsOfSection('opportunities')) {
      const { container, unmount } = renderSection(tab)
      const section = container.querySelector(`#${subSectionAnchorId(tab)}`)
      expect(section).not.toBeNull()
      expect(section?.parentElement?.children).toHaveLength(1)
      unmount()
    }
  })

  // #3624 retire les trois écrans de la section Opportunités, délibérément
  // (Louis 05/10) : « ne faire qu'un écran Opportunité ». Ces deux tests
  // affirmaient trois contenus distincts et « Pistes à qualifier » dans
  // Signaux seulement ; ils prouvent désormais l'inverse — le MÊME écran pour
  // les trois clés d'URL, pistes comprises.
  it('#3624 — les trois clés d’URL rendent le MÊME écran Opportunité', () => {
    const seen = new Set<string>()
    for (const tab of tabsOfSection('opportunities')) {
      const { container, unmount } = renderSection(tab)
      const section = container.querySelector(`#${subSectionAnchorId(tab)}`) as HTMLElement
      seen.add(section.innerHTML)
      unmount()
    }
    expect(seen.size).toBe(1)
  })

  it('#3624 / #3676 / #4755 — le tableau unique est dans l’écran, quelle que soit la clé', () => {
    for (const tab of ['veille', 'projects'] as const) {
      const { getByTestId, queryByTestId, unmount } = renderSection(tab)
      expect(getByTestId('stub-AccountSignalTable')).toBeInTheDocument()
      // #3714 — le bandeau n'est pas rebaptisé : aucune tête d'opportunités.
      expect(queryByTestId('stub-AccountOpportunitiesTop')).toBeNull()
      unmount()
    }
  })

  // #4022.1 (jumeau) — la recette prod du 13/10 citait l'offre dupliquée entre
  // « Ce que BellumAI ajoute » et la carte Recrutements SUR LE MÊME ÉCRAN. Le
  // correctif a mis `signalsListedBelow={activeTab === 'veille'}` : comme
  // `veille` et `projects` rendent le MÊME `AccountOpportunityScreen`
  // (preuve ci-dessus), `?tab=projects` reproduisait le doublon que `veille`
  // avait corrigé.
  it('#4022.1 — la synthèse compte sans répéter l’intitulé sur `veille` ET sur son jumeau `projects`', () => {
    for (const tab of ['veille', 'projects'] as const) {
      const { getByTestId, unmount } = renderSection(tab)
      expect(getByTestId('stub-KnownAccountValueCard').dataset.signalsListedBelow).toBe('true')
      unmount()
    }
  })
})

/**
 * #2124.39 / .45 / .46 — LA SOUS-SECTION « HISTORIQUE » PORTE DEUX TITRES, ET
 * LES CORRECTIONS Y SONT.
 *
 * Le retour demandait de fusionner « corrections » dans Historique & preuves.
 * Le journal « qui a changé quoi » existait, était câblé et rendu — mais dans
 * la section SYNTHÈSE (`AccountRecordCard` → `TabOverview`), c'est-à-dire à
 * l'autre bout du dossier. Rien à recalculer : à REPLACER.
 */
describe('AccountDetailTabContent — Historique & preuves (#2124.39 / .45 / .46)', () => {
  it('nomme « Actions et décisions » et « Historique des relations »', () => {
    const { getByText } = renderSection('history')
    expect(getByText('historyProofs.actionsAndDecisions')).toBeInTheDocument()
    expect(getByText('historyProofs.relationHistory')).toBeInTheDocument()
  })

  it('y montre les CORRECTIONS humaines, à côté des tâches et du fil', () => {
    const { getByTestId, queryByTestId } = renderSection('history')
    // Refonte Théo (23/10) — les tâches ouvertes vivent dans Plan d'action › Actions : ici, un LIEN, plus la liste.
    expect(queryByTestId('stub-TaskList')).not.toBeInTheDocument()
    expect(getByTestId('history-open-plan-tasks')).toBeInTheDocument()
    expect(getByTestId('stub-RecordHistory')).toBeInTheDocument()
    expect(getByTestId('stub-TimelinePanel')).toBeInTheDocument()
  })

  it('sait dire NON — une AUTRE section ne porte ni ces titres ni ces corrections', () => {
    const { queryByText, queryByTestId } = renderSection('plan')
    expect(queryByText('historyProofs.actionsAndDecisions')).not.toBeInTheDocument()
    expect(queryByTestId('stub-RecordHistory')).not.toBeInTheDocument()
  })

  /**
   * #2124.41 — RECETTE 15/09 prod 41805f310 (THALES) : « Actions et
   * décisions » ne montrait que les tâches OUVERTES (`TaskList`), aucune
   * action déjà exécutée. Les deux vivent maintenant côte à côte, sous le
   * même titre — l'une « ce qu'il reste à faire », l'autre nommée à part.
   */
  it('montre aussi les actions déjà EXÉCUTÉES, nommées à part des tâches ouvertes', () => {
    const { getByTestId, getByText } = renderSection('history')
    expect(getByText('historyProofs.executedActions')).toBeInTheDocument()
    expect(getByTestId('stub-ExecutedActionsList')).toBeInTheDocument()
  })

  it('sait dire NON — une AUTRE section ne porte pas les actions exécutées', () => {
    const { queryByTestId } = renderSection('plan')
    expect(queryByTestId('stub-ExecutedActionsList')).not.toBeInTheDocument()
  })

  /**
   * #2718.2 — LE FIL UNIFIÉ EST DÉSORMAIS LÀ OÙ LE CLIENT LE CHERCHE.
   *
   * `AccountTimelineCard` (user_actions + mouvements de projet + exécutions,
   * addendum p59-60) vivait dans l'onglet Plan, jamais dans l'onglet NOMMÉ
   * « Historique » — SKAIZen Group ne l'y a jamais trouvé (#2718). Il quitte
   * Plan (voir `TabPlan.collapsed.test.tsx`) pour ne vivre qu'ICI : GA-26,
   * pas de doublon de la même carte dans deux onglets.
   */
  it('montre le fil unifié (user_actions, projets, exécutions) — celui que le client cherchait', () => {
    const { getByTestId } = renderSection('history')
    expect(getByTestId('stub-AccountTimelineCard')).toBeInTheDocument()
  })
})

/**
 * #2124.32 / .33 / .35 / .36 / .38 / .40 — LA FUSION, GARDÉE.
 *
 * Anciennes missions, preuves, témoignages, timeline, activités et interactions
 * devaient cesser d'être six entrées séparées. `#2115` les a mises dans UNE
 * section ; ce test est ce qui empêche qu'elles en ressortent. Sans lui, la
 * fusion est un état de fait, pas une décision tenue — et une règle qui n'est
 * pas gardée redevient une opinion en trois semaines.
 */
describe('Historique & preuves — la fusion tient (#2124.32-.40)', () => {
  it('rassemble missions, preuves et historique dans UNE section, dans cet ordre', () => {
    // Refonte Théo (23/10) — l'ordre de la maquette : Activité (le fil) d'abord, puis missions, documents, mémoire.
    expect(tabsOfSection('historyProofs')).toEqual(['history', 'missions', 'proofs', 'memory'])
  })

  /**
   * R15-8 — la fusion tient dans la SECTION, pas dans l'empilement. Les quatre
   * anciennes entrées de la barre n'en font plus qu'une ; ce qui a changé le
   * 15/09 est qu'on n'en voit qu'une à la fois SOUS cette entrée, parce qu'une
   * puce qui ne cache rien n'est pas une navigation.
   */
  it('les quatre vivent sous UNE entrée, et se montrent une à la fois', () => {
    for (const tab of tabsOfSection('historyProofs')) {
      const { container, unmount } = renderSection(tab)
      expect(anchors(container)).toEqual([subSectionAnchorId(tab)])
      unmount()
    }
  })
})

/**
 * #2120.46 / #2120.47 — AJOUTER ET IMPORTER, SANS DÉFILER.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT, MESURÉ EN PRODUCTION LE 14/09/2026
 * ─────────────────────────────────────────────────────────────────────────────
 * Section Personnes, fenêtre de 807 px de haut : « Ajouter un contact » et
 * « Importer » étaient à **y = 3 226 px**, soit plus de trois écrans de
 * défilement, alors que la demande disait « en haut de l'onglet Contacts, sans
 * défilement ». Les boutons n'avaient pas bougé — l'écran autour d'eux si :
 * depuis #2115, la section EMPILE l'organigramme au-dessus des contacts.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE TEST PEUT, ET CE QU'IL NE PEUT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * jsdom ne met RIEN en page : `getBoundingClientRect` y rend des zéros, et une
 * assertion sur une hauteur y serait verte quoi qu'il arrive. Ce qui se vérifie
 * ici est donc la STRUCTURE — les deux gestes sont rendus AVANT la première
 * sous-partie, dans le même conteneur de section — puisque c'est elle qui
 * décide de la position réelle. La mesure en pixels, elle, se refait en
 * recette, sur l'écran en ligne.
 */
describe('AccountDetailTabContent — les gestes de la section Personnes (#2120.46/.47)', () => {
  const actionNames = ['createContact.open', 'contactsTab.importCsv']

  it('les deux gestes sont rendus AVANT le contenu de Contacts — donc sans défilement', () => {
    // #3053 (Louis 26/09/2026) — REPÈRE DÉPLACÉ, ASSUMÉ. Les gestes vivaient
    // au-dessus de la `<section>` de la sous-partie (repère : le panneau
    // lui-même) ; ils vivent maintenant DEDANS, juste avant `TabContacts`,
    // parce qu'ils ne concernent que Contacts (voir le commentaire de
    // `renderSubSection('contacts')`). Le repère devient donc le contenu de
    // `TabContacts`, pas la `<section>` qui l'englobe désormais tous les deux.
    // Ce que ce test lit reste inchangé : les gestes précèdent le contenu.
    const { getByTestId, getByRole } = renderSection('contacts', [], CONTACTS)

    const panel = getByTestId('stub-TabContacts')
    for (const name of actionNames) {
      const button = getByRole('button', { name })
      // DOCUMENT_POSITION_FOLLOWING : le bouton PRÉCÈDE le panneau dans le
      // document. C'est la seule lecture d'ordre que jsdom sache faire, et elle
      // dit exactement ce qui nous intéresse.
      expect(button.compareDocumentPosition(panel as Node) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    }
  })

  it('ce qui se clique se tabule, et porte son nom (GA-32 / GA-35)', () => {
    const { getByRole } = renderSection('contacts', [], CONTACTS)

    for (const name of actionNames) {
      const button = getByRole('button', { name })
      expect(button.tagName).toBe('BUTTON')
      // Un bouton sans `type` dans un formulaire le SOUMET : la réponse par
      // défaut du dépôt est `type="button"`.
      expect(button.getAttribute('type')).toBe('button')
    }
  })

  it('sait dire NON : un dossier SANS contact ne les met pas en en-tête', () => {
    // Ils descendent alors au centre de l'état vide (#1130) — et rien
    // n'apparaît deux fois sous la même forme (loi 4 du tome 7).
    const { queryByRole } = renderSection('contacts', [], [])

    for (const name of actionNames) {
      expect(queryByRole('button', { name })).not.toBeInTheDocument()
    }
  })

  it('n’attrape PAS ce qu’elle ne vise pas — aucune autre section ne les porte', () => {
    const { queryByRole } = renderSection('partners', [], CONTACTS)

    for (const name of actionNames) {
      expect(queryByRole('button', { name })).not.toBeInTheDocument()
    }
  })

  it('une section Personnes dont les contacts sont masqués ne les porte pas non plus', () => {
    // `hiddenTabs` retire une sous-partie faute de contenu actionnable : sans
    // la liste, le geste d'ajout n'a pas d'endroit où atterrir.
    const { queryByRole } = renderSection('organigramme', ['contacts'], CONTACTS)

    for (const name of actionNames) {
      expect(queryByRole('button', { name })).not.toBeInTheDocument()
    }
  })
})

/**
 * #3709 (recette UNEO, compte client) — l'entonnoir des personnes et
 * « Ce que BellumAI ajoute » doivent se retrouver sur Synthèse, Opportunités
 * et Missions, avec les mêmes composants que la fiche prospect.
 */
describe('AccountDetailTabContent — bande entonnoir + valeur ajoutée (#3709)', () => {
  // #4508.1 (24/10/2026) revient sur #3709 : AUCUN bloc sous les onglets — l'entonnoir n'y est plus.
  it.each<TabId>(['overview', 'projects', 'missions'])('%s ne porte plus l’entonnoir des personnes', tab => {
    const { queryByTestId } = renderSection(tab, [], CONTACTS)
    expect(queryByTestId('stub-ContactsFunnelLine')).toBeNull()
  })

  it('la carte de valeur est montée hors Synthèse (qui porte déjà la sienne)', () => {
    const missions = renderSection('missions', [], CONTACTS)
    expect(missions.queryByTestId('stub-KnownAccountValueCard')).toBeTruthy()
    missions.unmount()
    const overview = renderSection('overview', [], CONTACTS)
    expect(overview.queryByTestId('stub-KnownAccountValueCard')).toBeNull()
  })

  it('Contacts garde son propre entonnoir : pas de bande en double', () => {
    const { queryByTestId } = renderSection('contacts', [], CONTACTS)
    expect(queryByTestId('account-context-strip')).toBeNull()
  })
})

// Refonte Théo (23/10) — la tête de la section Contacts (consigne de Laura + phrase) est commune aux trois vues de
// la section, et ne déborde sur aucune autre (l'organigramme a sa propre section).
describe('AccountDetailTabContent — refonte Théo, tête de la section Contacts', () => {
  it('Contacts, Comité d’achat et Couverture portent la tête ; les gestes ne sont que dans Contacts', () => {
    for (const tab of ['contacts', 'committee', 'coverage'] as const) {
      const { getByTestId, queryByRole, unmount } = renderSection(tab, [], CONTACTS)
      expect(getByTestId('people-head')).toHaveTextContent('sectionTheo.people.title')
      const importButton = queryByRole('button', { name: 'contactsTab.importCsv' })
      if (tab === 'contacts') expect(importButton).toBeInTheDocument()
      else expect(importButton).not.toBeInTheDocument()
      unmount()
    }
  })

  it('sait dire NON : ni l’organigramme ni l’écosystème ne portent la tête des contacts', () => {
    for (const tab of ['organigramme', 'partners'] as const) {
      const { queryByTestId, unmount } = renderSection(tab, [], CONTACTS)
      expect(queryByTestId('people-head')).not.toBeInTheDocument()
      unmount()
    }
  })
})

describe('AccountDetailTabContent — refonte Théo, têtes d’Écosystème, de Plan et d’Historique', () => {
  it('chaque vue porte SA phrase : partenaires, accès, plan, historique', () => {
    const cases = [
      ['partners', 'partners-head'],
      ['access', 'access-head'],
      ['plan', 'plan-head'],
      ['messages', 'plan-head'],
      ['history', 'history-head'],
      ['missions', 'history-head'],
    ] as const
    for (const [tab, head] of cases) {
      const { getByTestId, unmount } = renderSection(tab)
      expect(getByTestId(head)).toBeInTheDocument()
      unmount()
    }
  })

  it('sait dire NON : la vue Accès ne porte pas la phrase des partenaires, ni l’inverse', () => {
    const access = renderSection('access')
    expect(access.queryByTestId('partners-head')).not.toBeInTheDocument()
    access.unmount()
    const partners = renderSection('partners')
    expect(partners.queryByTestId('access-head')).not.toBeInTheDocument()
  })
})

describe('AccountDetailTabContent — refonte Théo, l’Activité suit la maquette', () => {
  it('le fil des relations OUVRE l’Activité, avant les commentaires, le fil unifié et les décisions', () => {
    const { getByTestId } = renderSection('history')
    const order = ['history-relations', 'stub-AccountTeamComments', 'stub-AccountTimelineCard', 'history-decisions']
    const nodes = order.map(id => getByTestId(id))
    for (let index = 1; index < nodes.length; index += 1) {
      expect(nodes[index - 1]!.compareDocumentPosition(nodes[index]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    }
  })
})
