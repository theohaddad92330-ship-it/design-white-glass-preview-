import { contactOriginSearch } from '@/features/contacts/lib/contactOrigin'
import type { PlanActionInput } from '@/features/actions/planItems.api'
import type { Account, AccountStrategy5PDimension, Contact, ContactPerimeter } from '@bellum/contracts'
import { Text } from '@bellum/ui'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { TimelinePanel } from '@/features/activities/view/TimelinePanel'
import { ExecutedActionsList } from '@/features/activities/view/ExecutedActionsList'
import { RecordHistory } from '@/features/crm-core/view/RecordHistory'
// #2718.2 — le fil unifié (user_actions, mouvements de projet, exécutions)
// vivait dans l'onglet Plan (`TabPlan.tsx`), jamais dans l'onglet NOMMÉ
// « Historique » : le client (SKAIZen Group) le cherchait ici et ne l'y
// trouvait pas. Même geste que #2124.39 juste au-dessus (les corrections
// humaines, déplacées de Synthèse à Historique) : rien à recalculer, à
// REPLACER — il quitte Plan pour ne vivre qu'ici (GA-26).
import { AccountTimelineCard } from '../tabs/sections/AccountTimelineCard'
import { AccountTeamComments } from '../collaboration/AccountTeamComments'
import { useFirstName } from '@/hooks/useFirstName'
import { usePersistAccountPlan } from '@/features/accounts/hooks/usePersistAccountPlan'
import {
  contactsFiltersFromSearch,
  contactsFiltersToSearch,
  resolveLegacyTabNotice,
  type LegacyTabNotice,
} from '../accountDetailSearch'
import { parseDossierItemRef } from '../search/dossierSearch'
import { PersonalContactsSection } from '../tabs/contacts/PersonalContactsSection'
import { TabContacts } from '../tabs/TabContacts'
import { ContactsPerimeterBar } from '../tabs/contacts/ContactsPerimeterBar'
import { useContactsPerimeter } from '@/features/accounts/hooks/useContactsPerimeter'
import { TabCommittee } from '../tabs/TabCommittee'
import { TabCoverage } from '../tabs/TabCoverage'
import { TabFinance } from '../tabs/TabFinance'
import { KnownAccountValueCard } from './KnownAccountValueCard'

/** #3709 — onglets qui portent la carte « Ce que BellumAI ajoute » (Synthèse la porte déjà elle-même). */
const CONTEXT_STRIP_TABS: ReadonlySet<string> = new Set(['veille', 'projects', 'missions'])
import { strategyDimensionToPlanAction } from '../tabs/sections/strategyPlanAction'
import { TabOrganigramme } from '../tabs/TabOrganigramme'
import { useOrgUrlState } from '../tabs/organigramme/useOrgUrlState'
import { TabPartners } from '../tabs/TabPartners'
import { TabMissions } from '../tabs/TabMissions'
import { TabProofs } from '../tabs/TabProofs'
import { TabPlan } from '../tabs/TabPlan'
import { TabSites } from '../tabs/TabSites'
// #2115.22-27 — les quatre sous-parties AJOUTÉES aux sections qui les
// promettaient. Trois d'entre elles ne font que MONTER du code déjà écrit
// (`ItProgramsCard`, le seau « Besoins confirmés », `RelationshipMemoryCard`) ;
// la quatrième est une PORTE vers le panneau d'engagement existant.
import { TabMessages } from '../tabs/TabMessages'
import { RelationshipMemoryCard } from '../tabs/sections/RelationshipMemoryCard'
import { tabSlide } from '../motion'
import { MERGED_SUB_TABS, sectionOfTab, subSectionAnchorId, tabsOfSection, type TabId } from './AccountDetailTabsBar'
import { TabAccess } from '../tabs/TabAccess'
import { TabMigrationNotice } from './TabMigrationNotice'
import { AccountEcosystemTop } from '../tabs/ecosystem/AccountEcosystemTop'
import { AccountOpportunityScreen } from '../tabs/opportunities/AccountOpportunityScreen'
import { PeopleSectionActions } from './PeopleSectionActions'
import { PeopleSectionHead, SectionContextHead } from '../theo/PeopleSectionHead'
import { CreateContactDialog } from '@/features/crm-core/view/CreateContactDialog'
import { UniversalImportDialog } from '@/features/universal-import/view/UniversalImportDialog'
import { ContactImportNextSteps } from '../tabs/contacts/ContactImportNextSteps'
import { guideAnchorProps } from '@/features/guide/guide-anchors'
import { AccountKnowledgeScreen } from '../theo/AccountKnowledgeScreen'

interface AccountDetailTabContentProps {
  account: Account
  contacts: Contact[]
  activeTab: TabId
  onTabChange: (tab: TabId) => void
  /** Les sous-parties retirées faute de contenu actionnable (recette finale §33).
   *  La sous-partie ACTIVE s'affiche toujours : un lien partagé doit ouvrir ce
   *  qu'il promet. */
  hiddenTabs?: readonly TabId[]
  /** #3720 — l'arrivée par un ancien lien, capturée par l'ÉCRAN parent (qui, lui, ne se démonte pas
   *  pendant le chargement du compte). Absente : on retombe sur la lecture de l'URL au montage. */
  legacyTabNotice?: LegacyTabNotice | undefined
}

export function AccountDetailTabContent({
  account,
  contacts,
  activeTab,
  onTabChange,
  hiddenTabs = [],
  legacyTabNotice: arrivalNotice,
}: AccountDetailTabContentProps) {
  const navigate = useNavigate()
  const { t } = useTranslation('accounts')
  // #5106.2 / #5107.1 — le prénom du profil connecté, pour les têtes de Pratiques achats et d'Écosystème.
  const firstName = useFirstName()
  const shouldReduceMotion = useReducedMotion()
  const planMutations = usePersistAccountPlan(account.id)
  const rawAnalysis = (account.raw_analysis as Record<string, unknown>) || {}
  // « Zones blanches » → Contacts handoff: the title to look for, carried over
  // when the rep acts on a coverage gap.
  // Amorce venue de l'URL (`?q=`) : un besoin ou une zone blanche ouvre le compte
  // AVEC ce qu'on cherchait. L'état local reste prioritaire dès que l'utilisateur
  // relance une recherche depuis la page.
  // #2120.77 — les quatre filtres de l'onglet Contacts vivent dans l'URL : c'est
  // ce qui les fait survivre au démontage de l'onglet (changement de section)
  // et au retour navigateur depuis une fiche contact. Lus au MONTAGE de l'onglet.
  const contactsUrlFilters = useSearch({ from: '/accounts/$id', select: contactsFiltersFromSearch })
  // #2107.32 — l'objet OUVERT depuis un lien externe (« Voir dans le plan »
  // depuis la Veille, `dossierItemRef`, #2128.50). Même lecture que les
  // filtres Contacts juste au-dessus : l'URL est la seule source de vérité.
  // #4996 L6 — le segment « Mon périmètre · Tout le compte » : dans l'URL, jamais dans un store. Défaut `mine`
  // (Q6) ; sans zone d'entité le serveur répond `outside_perimeter_count: null` et le segment n'existe pas.
  const perimeterMode = useSearch({ from: '/accounts/$id', select: search => search.perimeter ?? 'mine' })
  const perimeterView = useContactsPerimeter(account.id, perimeterMode).data
  const tabContacts = perimeterView?.outside_perimeter_count != null ? perimeterView.contacts : contacts
  const writePerimeter = (next: ContactPerimeter) =>
    void navigate({
      to: '/accounts/$id',
      params: { id: account.id },
      search: prev => ({ ...prev, perimeter: next === 'mine' ? undefined : next }),
      replace: true,
    })
  const prepareOpen = useSearch({ from: '/accounts/$id', select: search => search.prep === 'rdv' })
  const signalPeriod = useSearch({ from: '/accounts/$id', select: search => search.sp })
  const highlightItem = useSearch({ from: '/accounts/$id', select: search => parseDossierItemRef(search.item) })
  // Une zone blanche amène sa recherche sans passer par l'URL ; elle l'emporte
  // jusqu'au premier geste de filtre, qui écrit alors l'URL.
  const [gapSearchSeed, setGapSearchSeed] = useState<string | null>(null)
  // #4061.b — l'état de l'organigramme vit dans l'URL (voir `useOrgUrlState`).
  const orgUrl = useOrgUrlState(account.id)
  const writeContactsFilters = (filters: Parameters<typeof contactsFiltersToSearch>[0]) => {
    setGapSearchSeed(null)
    void navigate({
      to: '/accounts/$id',
      params: { id: account.id },
      search: prev => ({ ...prev, ...contactsFiltersToSearch(filters) }),
      replace: true,
    })
  }

  /**
   * #2115.33 — LA VALEUR BRUTE, CAPTURÉE UNE SEULE FOIS, À L'ARRIVÉE.
   *
   * `AccountDetail` réécrit l'URL en canonique dans un `useEffect` (replace,
   * pas push) presque immédiatement après le premier rendu — la valeur brute
   * (`score`, `fiche`…) redevient alors introuvable dans le routeur. Un
   * `useState` avec un initialiseur PARESSEUX lit `window.location.search`
   * pendant CE premier rendu, avant que l'effet du parent n'ait pu s'exécuter,
   * et la valeur qu'il capture n'est plus recalculée ensuite — exactement ce
   * qui permet à la notice de SURVIVRE à la réécriture qui la motive.
   *
   * Assumé : si l'app navigue en SPA d'un dossier vers un AUTRE dossier portant
   * son propre alias, sans démonter ce composant, la notice ne se redéclenche
   * pas. Cas rare — un lien partagé est presque toujours un chargement complet
   * — documenté plutôt que traité pour ne pas coupler ce fichier au routeur
   * parent (hors du périmètre de ce lot).
   */
  const [legacyTabNotice] = useState<LegacyTabNotice | undefined>(
    () => arrivalNotice ?? resolveLegacyTabNotice(new URLSearchParams(window.location.search).get('tab')),
  )

  /**
   * #2120.46 / #2120.47 — LES DEUX GESTES DE LA SECTION PERSONNES.
   *
   * L'état vit ICI et non dans `TabContacts` parce que les boutons, eux, vivent
   * ici : mesuré en production le 14/09/2026, « Ajouter un contact » et
   * « Importer » étaient à y = 3 226 px dans une fenêtre de 807 px — trois
   * écrans de défilement sous l'organigramme que la section empile au-dessus
   * des contacts depuis #2115. Les dialogues suivent leur déclencheur : les
   * laisser plus bas obligerait à faire remonter un état, ce qui est la même
   * chose écrite deux fois.
   *
   * `TabContacts` les RELAIE encore depuis son état vide (#1130) : quand le
   * dossier n'a aucun contact, les deux gestes descendent au centre de l'écran
   * vide et l'en-tête de section s'efface — jamais les deux à la fois (loi 4).
   */
  const [addContactOpen, setAddContactOpen] = useState(false)
  const [importContactsOpen, setImportContactsOpen] = useState(false)

  const findContactForGap = (query: string) => {
    setGapSearchSeed(query)
    onTabChange('contacts')
  }

  // #4755 (lot 761) — « Au plan » depuis une ligne du tableau des signaux : l'action est déjà composée.
  const addActionToPlan = (action: PlanActionInput) => {
    void planMutations
      .addAction(action)
      .then(() => onTabChange('plan'))
      .catch(() => undefined)
  }
  // #3277.3 — la dimension 5P désignée devient UNE action de plan, puis on ouvre le plan.
  const addStrategyGapToPlan = (dimension: AccountStrategy5PDimension) => {
    void planMutations
      .addAction(strategyDimensionToPlanAction(dimension))
      .then(() => onTabChange('plan'))
      .catch(() => undefined)
  }
  const tabVariants = tabSlide(Boolean(shouldReduceMotion))

  /**
   * R15-8 (recette du 15/09/2026, prod `5ca597d5a`) — LA SOUS-PARTIE EST
   * L'UNITÉ DE RENDU. UNE PUCE MONTRE SON PANNEAU ET CACHE LES AUTRES.
   *
   * ⚠️ Revirement ASSUMÉ de #2115.21-27, et il est écrit ici pour être lu. D8
   * (14/09/2026) faisait de la SECTION l'unité de rendu : elle empilait toutes
   * ses sous-parties, et l'onglet du contrat d'URL désignait l'ancre où l'on
   * arrivait. Mesuré à l'écran sur THALES et QONTO le 15/09 : `?tab=contacts`
   * et `?tab=organigramme` changeaient la puce et l'URL sans rien cacher, et le
   * titre « Chemin d'accès recommandé » — porté par DEUX des trois panneaux de
   * la section Personnes — s'écrivait deux fois, sous la même forme et avec le
   * même contenu (loi 4 du tome 7).
   *
   * Ce qui ne bouge PAS : les sept sections, leur ordre, la composition de
   * chacune, et les quatorze clés d'URL. Ce qui change tient en une ligne :
   * `activeTab` désigne le panneau RENDU, plus l'ancre où l'on atterrit. `tab`
   * reste la seule source de vérité — elle est déjà dans l'URL et survit au
   * rechargement, aucun second état n'est introduit.
   *
   * Corollaire : plus rien à amener dans le champ au montage. Le panneau
   * demandé est le seul rendu, donc déjà en haut ; le `scrollIntoView` de
   * #2115.44 ferait sauter une page qui n'a nulle part où aller.
   */
  const activeSection = sectionOfTab(activeTab)

  function renderSubSection(tab: TabId): ReactNode {
    switch (tab) {
      // Théo comptes-fiche — « Vue d'ensemble » et « Score » sont fusionnés dans « Ce que je sais » :
      // UN panneau (le brief s'il existe, puis le dossier, puis l'intérêt du compte), aucune pastille.
      // Les trois clés d'URL (`brief`, `overview`, `evaluation`) ouvrent donc la même page.
      case 'brief':
      case 'overview':
      case 'evaluation': {
        // Refonte Théo (23/10) — l'écran « Ce que je sais » de la maquette (provenance, regard de Laura, repères,
        // cartes, « Pour aller plus loin »). Le brief, la vue d'ensemble et le score y sont fondus, rien retiré.
        return <AccountKnowledgeScreen account={account} contacts={contacts} onTabChange={onTabChange} />
      }
      case 'contacts':
        return (
          <div className="flex flex-col gap-6">
            {/* #2120.46 / #2120.47, déplacée par #3053 (Louis 26/09/2026) — LES
                DEUX GESTES DE LA SECTION PERSONNES. Ne concernait QUE Contacts
                (organigramme et couverture n'ouvrent ni « Ajouter un contact »
                ni « Importer ») : elle vit donc DANS cette sous-section, plus
                au-dessus des trois, où switcher vers Organigramme la laissait
                affichée sans rien à commander. Elle s'efface quand le dossier
                n'a aucun contact : `ContactsEmptyState` la porte alors au
                centre (#1130), et rien n'apparaît deux fois (loi 4 du tome 7). */}
            {/* Refonte Théo (23/10) — les gestes Importer / Ajouter un contact vivent dans la tête de section
                (`.a4-section-heading` de `sec:people`), rendue au-dessus du panneau : voir `PeopleSectionHead`. */}
            <ContactsPerimeterBar
              mode={perimeterMode}
              outsideCount={perimeterView?.outside_perimeter_count ?? null}
              onModeChange={writePerimeter}
            />
            <TabContacts
              accountId={account.id}
              contacts={tabContacts}
              accountCompanyName={account.company_name || ''}
              rawAnalysis={rawAnalysis}
              // #AF.3 — l'aveu de fraîcheur : ce dossier a-t-il vu le correctif
              // de collecte #2543 ? `null`/absent = jamais daté, traité comme
              // périmé (ContactsStaleCollectionNotice, isSegmentCollectionStale).
              contactsCollectedAt={account.contacts_collected_at ?? null}
              contactsRulesAppliedAt={account.contacts_rules_applied_at ?? null}
              accountWebsite={account.website ?? null}
              initialFilters={
                gapSearchSeed !== null ? { ...contactsUrlFilters, search: gapSearchSeed } : contactsUrlFilters
              }
              onFiltersChange={writeContactsFilters}
              // #2150.62 — l'origine voyage : le retour ramène à CE compte, onglet Contacts.
              // #3674.R1 — avec les filtres actifs de CETTE lecture : le retour par le
              // fil d'Ariane ne les perd plus (le bouton navigateur les gardait déjà).
              onContactClick={c =>
                void navigate({
                  to: '/contacts/$id',
                  params: { id: c.id },
                  search: contactOriginSearch({
                    kind: 'account',
                    accountId: account.id,
                    tab: 'contacts',
                    filters: contactsFiltersToSearch(contactsUrlFilters),
                  }),
                })
              }
              onCreateContact={() => setAddContactOpen(true)}
              onImportCsv={() => setImportContactsOpen(true)}
              // #2126.22 / .24 — les sorties de l'état vide : le périmètre se
              // choisit dans la section Périmètres, et le plan se travaille sans contact.
              onChangeScope={() => onTabChange('sites')}
              onContinueWithout={() => onTabChange('plan')}
            />
            {/* #2927 — « Mes contacts personnels » : importés en portée Personnel, visibles de leur seul propriétaire. */}
            <PersonalContactsSection accountId={account.id} />
          </div>
        )
      case 'organigramme':
        return (
          <TabOrganigramme
            accountId={account.id}
            accountName={account.company_name}
            contacts={contacts}
            rawAnalysis={rawAnalysis}
            // #2543.7 — l'aveu de fraîcheur du segment entités, même mécanisme
            // que `contactsCollectedAt` ci-dessus.
            entitiesCollectedAt={account.entities_collected_at ?? null}
            // #4061.b — vue, filtres, colonnes repliées et sélection : dans l'URL, et rapportés au retour d'une fiche.
            viewState={orgUrl.viewState}
            onViewStateChange={orgUrl.onViewStateChange}
            // #2150.62 — depuis l'organigramme, le retour ramène à l'organigramme.
            onContactClick={orgUrl.openContact}
            onViewPlan={() => onTabChange('plan')}
            // « Top 10 pour agir, tous les contacts pour chercher » : le
            // bandeau de couverture annonce le total du dossier, et ce geste
            // est ce qui l'ouvre. Sans lui, le chiffre serait décoratif.
            onViewAllContacts={() => onTabChange('contacts')}
          />
        )
      case 'committee':
        // #3282 / #3263.39 — l'écran Comité d'achat.
        return (
          <TabCommittee
            accountId={account.id}
            companyName={account.company_name || ''}
            rawAnalysis={rawAnalysis}
            contacts={contacts}
            onTabChange={onTabChange}
          />
        )
      case 'finance':
        return <TabFinance account={account} />
      case 'coverage':
        return <TabCoverage account={account} onTabChange={onTabChange} onFindContact={findContactForGap} />
      case 'sites':
        return <TabSites account={account} onOpenOrganigramme={() => onTabChange('organigramme')} />
      // #3624 / #3676 (Louis 05/10) — « ne plus avoir 3 écrans, ne faire qu'un
      // écran Opportunité » et « une seule surface Signaux et besoins » :
      // Signaux (`veille`) et Opportunités (`projects`) rendent le MÊME écran ;
      // `?tab=needs|besoins|programs` sont des alias de `veille`
      // (`accountDetailSearch.ts`). Aucune pastille (`MERGED_SUB_TABS`).
      case 'veille':
      case 'projects':
        return (
          <AccountOpportunityScreen
            account={account}
            initialPeriod={signalPeriod}
            onOpenTab={(tab, contactSeed) =>
              tab === 'contacts' && contactSeed ? findContactForGap(contactSeed) : onTabChange(tab)
            }
            onAddToPlan={addActionToPlan}
          />
        )
      case 'plan':
        return (
          <TabPlan
            account={account}
            highlightActionId={highlightItem?.kind === 'action' ? highlightItem.id : null}
            prepareOpen={prepareOpen}
            onOpenTab={onTabChange}
            onAddStrategyGapToPlan={addStrategyGapToPlan}
          />
        )
      // Les missions (PDF 4 §3.3, BEL-BO-006) — les cinq blocs de la
      // propagation du back-office dans le dossier de compte.
      case 'missions':
        return <TabMissions account={account} />
      case 'proofs':
        return <TabProofs account={account} />
      case 'partners':
        return (
          <TabPartners
            account={account}
            firstName={firstName}
            detailedExtra={<AccountEcosystemTop account={account} activeTab={activeTab} onTabChange={onTabChange} />}
          />
        )
      case 'access':
        return <TabAccess account={account} firstName={firstName} />
      case 'history':
        // Refonte Théo (23/10) — `hist:tl` : LE FIL d'abord (notes, échanges), puis les commentaires d'équipe,
        // puis le fil unifié, puis ce qui a été fait et corrigé — chacun dans son panneau. Rien n'est retiré :
        // les blocs de #2124.39-.46 / #2718.2 / #2914 sont les mêmes, dans l'ordre de la maquette.
        return (
          <div data-testid="history-activity" className="space-y-5">
            {/* #2124.45 / .37 — HISTORIQUE DES RELATIONS : la mémoire relationnelle en tête du panneau. */}
            <HistoryPanel testId="history-relations" title={t('historyProofs.relationHistory')}>
              <TimelinePanel scope="account" entityId={account.id} accountId={account.id} omitActions />
            </HistoryPanel>
            {/* #2914 (#2128.10) — le fil de commentaires de CE compte (`.a4-filter-tabs` « Commentaires d'équipe »). */}
            <AccountTeamComments accountId={account.id} />
            {/* #2718.2 — le fil unifié (user_actions, mouvements de projet, exécutions), là où le client le cherche. */}
            <AccountTimelineCard accountId={account.id} />
            {/* #2124.46 / .41 / .39 — ACTIONS ET DÉCISIONS : ce qui reste (dans le plan, un lien), ce qui a été fait,
                et les corrections humaines. */}
            <HistoryPanel testId="history-decisions" title={t('historyProofs.actionsAndDecisions')}>
              {/* Refonte Théo (23/10) — les tâches OUVERTES vivent dans Plan d'action › Actions (maquette
                  `plan:tasks`) ; ici, un lien (une donnée à un seul endroit, ailleurs au plus un lien). */}
              <button
                type="button"
                data-testid="history-open-plan-tasks"
                onClick={() => onTabChange('plan')}
                className="inline-flex min-h-11 items-center text-sm text-[var(--bellum-text-accent)] underline-offset-2 hover:underline"
              >
                {t('planTheo.openTasks')}
              </button>
              <Text element="p" size="xs" weight="medium" color="text-muted-foreground" className="pt-1">
                {t('historyProofs.executedActions')}
              </Text>
              <ExecutedActionsList scope="account" entityId={account.id} omitRunEvents />
              <RecordHistory entityType="account" entityId={account.id} />
            </HistoryPanel>
          </div>
        )
      // #2115.26 — PLAN D'ACTION promet « … · la préparation des messages ».
      case 'messages':
        return <TabMessages account={account} contacts={contacts} onTabChange={onTabChange} />
      // #2115.27 — HISTORIQUE & PREUVES promet « … · mémoire relationnelle ».
      // La carte est la MÊME qu'avant, au même endroit du disque : elle a
      // seulement quitté la Synthèse, où le retour ne la cherchait pas.
      case 'memory':
        return <RelationshipMemoryCard accountId={account.id} memory={account.relationship_memory ?? null} />
    }
  }

  return (
    <div {...guideAnchorProps('compte.contenu')} className="flex-1 min-h-0 min-w-0 overflow-x-clip">
      {/* Démo clients 04/10 — `tabSlide` décale le panneau de ±8 px : sans
          `overflow-x-clip` (qui ne crée pas de conteneur de défilement), toute
          fiche compte débordait de 8 px à l'horizontale. */}
      <AnimatePresence mode="wait">
        {/* La transition se joue au changement de SECTION. Changer d'ancre à
            l'intérieur d'une section ne rejoue rien : le contenu est déjà là,
            on s'y déplace — un glissement à chaque ancre serait un mouvement
            qui ne répond à aucune des cinq questions du §16 du tome 7. */}
        <motion.div
          key={activeSection}
          variants={tabVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          transition={{
            opacity: { duration: 0.16, ease: [0.23, 1, 0.32, 1] },
            x: { duration: shouldReduceMotion ? 0 : 0.18, ease: [0.23, 1, 0.32, 1] },
          }}
          className="flex flex-col gap-6"
        >
          {/* #2115.33 — n'existe QUE le temps où la section d'arrivée d'une
              ancienne URL est celle qu'on regarde : changer de section rend la
              notice sans objet, même si elle n'a pas été fermée. */}
          {legacyTabNotice && legacyTabNotice.section === activeSection && (
            <TabMigrationNotice
              sectionLabel={t(`tabSections.${legacyTabNotice.section}`)}
              subSectionLabel={
                tabsOfSection(legacyTabNotice.section).length > 1 ? t(`tabs.${legacyTabNotice.tab}`) : undefined
              }
              dismissKey={legacyTabNotice.value}
              // #3720 (lot RAT) — l'arrivée « programmes » défile vers la carte (#3677) : épinglée, elle reste visible.
              pinned={legacyTabNotice.value === 'programs' || legacyTabNotice.value === 'programmes'}
            />
          )}
          {/* Les deux dialogues suivent leur déclencheur. Montés dans la
              section Personnes seulement : ailleurs, rien ne peut les ouvrir. */}
          {activeSection === 'people' ? (
            <>
              <CreateContactDialog accountId={account.id} open={addContactOpen} onOpenChange={setAddContactOpen} />
              <AnimatePresence>
                {importContactsOpen ? (
                  // Import universel (Louis 27/09/2026) : même bouton, plus aucun
                  // plafond de lignes, colonnes inconnues conservées, écriture en
                  // arrière-plan. Les gestes qui suivent un import restent là.
                  <UniversalImportDialog
                    accountId={account.id}
                    fixedType="contact"
                    onClose={() => setImportContactsOpen(false)}
                    renderAfterReport={() => (
                      <ContactImportNextSteps accountId={account.id} companyName={account.company_name} />
                    )}
                  />
                ) : null}
              </AnimatePresence>
            </>
          ) : null}
          {/* R15-8 — UN seul panneau, celui que la puce active désigne.
              L'`id` est écrit ICI, le `href` l'est par la barre — les deux
              passent par `subSectionAnchorId`, à un seul endroit : une ancre
              qui ne trouve rien ne lève aucune erreur, elle ne fait rien.
              #3053 (Louis 26/09/2026) — LE CONTENU VIENT IMMÉDIATEMENT SOUS LA
              BARRE. ⚠️ Renversement ASSUMÉ de #2119.8-13 / #2172 / #2122.12-.19 :
              ces trois têtes de section étaient rendues ICI, ENTRE la barre des
              sous-onglets et cette `<section>` — donc un écran entier au-dessus
              du contenu que le clic sur un sous-onglet est censé changer. Mesuré
              en prod le 26/09 (SOPRA STERIA GROUP, `?tab=veille`) : cliquer un
              sous-onglet ne changeait rien dans le viewport. Ce que chaque tête
              devient : `AccountOpportunitiesTop` et `QualificationLeadsQueue` ne
              parlaient en réalité que de la veille (une piste EST un signal à
              vérifier) — elles vivent maintenant DANS la sous-section Signaux,
              voir `renderSubSection('veille')`. `AccountEcosystemTop` parle
              vraiment des DEUX sous-sections d'Écosystème & Accès : elle reste
              partagée mais passe SOUS le contenu, juste après cette `<section>`.
              `PeopleSectionActions` ne concernait QUE Contacts : elle vit
              maintenant dans `renderSubSection('contacts')`. */}
          {/* Refonte Théo (23/10) — `sec:people` : la consigne de Laura et la phrase de la section, communes aux
              trois vues (Contacts · Comité d'achat · Couverture) ; les gestes Importer / Ajouter ne concernent que
              Contacts (#3053) et s'effacent quand le dossier est vide (l'état vide les porte, #1130). */}
          {activeSection === 'people' ? (
            <PeopleSectionHead
              actions={
                activeTab === 'contacts' && contacts.length > 0 ? (
                  <PeopleSectionActions
                    accountId={account.id}
                    onCreateContact={() => setAddContactOpen(true)}
                    onImportCsv={() => setImportContactsOpen(true)}
                  />
                ) : null
              }
            />
          ) : null}
          {/* `sec:eco` (une phrase par vue), `sec:plan`, `sec:hist` — même tête, d'un seul composant. */}
          {activeSection === 'ecosystem' ? (
            <SectionContextHead section={activeTab === 'access' ? 'access' : 'partners'} />
          ) : null}
          {activeSection === 'actionPlan' ? <SectionContextHead section="plan" /> : null}
          {activeSection === 'historyProofs' ? <SectionContextHead section="history" /> : null}
          <section id={subSectionAnchorId(activeTab)} aria-label={t(`tabs.${activeTab}`)} className="scroll-mt-4">
            {/* #3709 (recette UNEO, compte client) — « Ce que BellumAI ajoute » ne vivait que sur
              Synthèse : un compte client travaillé depuis Opportunités ou Missions ne le voyait
              jamais. #4508.1 (24/10/2026) revient sur #3709 pour l'entonnoir des personnes :
              AUCUN bloc de statistiques sous les onglets. La Synthèse porte déjà la carte de
              valeur (`TabOverview`). */}
            {CONTEXT_STRIP_TABS.has(activeTab) ? (
              <div className="mb-3 flex flex-col gap-3" data-testid="account-context-strip">
                <KnownAccountValueCard
                  account={account}
                  contacts={contacts}
                  // #4022.1 (jumeau) — `veille` et `projects` rendent le MÊME
                  // `AccountOpportunityScreen` (MERGED_SUB_TABS) : les deux
                  // cartes Recrutements y sont, donc les deux clés comptent
                  // sans répéter l'intitulé.
                  signalsListedBelow={MERGED_SUB_TABS.includes(activeTab)}
                />
              </div>
            ) : null}
            {renderSubSection(activeTab)}
          </section>
          {activeSection === 'ecosystem' && activeTab !== 'partners' && (
            <AccountEcosystemTop account={account} activeTab={activeTab} onTabChange={onTabChange} />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

/** Refonte Théo (23/10) — `.a4-panel` de l'Historique : un titre, un corps, une carte sans ombre. */
function HistoryPanel({ testId, title, children }: { testId: string; title: string; children: ReactNode }) {
  return (
    <section
      data-testid={testId}
      className="min-w-0 space-y-2 rounded-card border border-[var(--bellum-border)] bg-card p-5"
    >
      <Text element="h3" size="sm" weight="semibold">
        {title}
      </Text>
      {children}
    </section>
  )
}
