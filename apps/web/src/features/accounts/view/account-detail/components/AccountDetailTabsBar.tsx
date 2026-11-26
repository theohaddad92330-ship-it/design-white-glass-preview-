import { SelectField, TabNav, cn, type TabNavItem } from '@bellum/ui'
import {
  BookOpen,
  Building2,
  History,
  Landmark,
  ListChecks,
  Network,
  Radio,
  Share2,
  Users,
  type LucideIcon,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { guideAnchorProps } from '@/features/guide/guide-anchors'
import { trackTabOpened } from '@/lib/product-tracker'

/**
 * #2130.54 — le motif d'écran, écrit en DUR, jamais dérivé d'un `account.id`
 * (GA-276 : `router.tsx` a appris cette leçon à ses dépens en émettant un
 * `pathname` brut). Même convention que `TabPartners.tsx` (`PARTNERS_SCREEN`).
 */
const ACCOUNT_DETAIL_SCREEN = '/accounts/$id'

export const TAB_KEYS = [
  'overview',
  'contacts',
  'organigramme',
  'coverage',
  'sites',
  'veille',
  'plan',
  'evaluation',
  // L'HISTORIQUE (T2). Ajouté en fin de liste : `TAB_KEYS` est le contrat du
  // paramètre d'URL, et y insérer une valeur au milieu ne change rien pour un
  // lien déjà partagé — mais l'ordre d'AFFICHAGE, lui, se choisit ci-dessous.
  'history',
  // L'onglet PROJETS (PDF 2 §4.2). Ajouté en fin de liste, comme `history` :
  // `TAB_KEYS` est le contrat du paramètre d'URL, y insérer une valeur au
  // milieu ne casse rien pour un lien déjà partagé.
  'projects',
  // PREUVES & REX (PDF 2 §12). Ajouté en fin, comme les précédents.
  'proofs',
  // PARTENAIRES (décision D11) : la stratégie rang 1 se pilote au niveau compte.
  'partners',
  // ACCÈS (tome 1 §13, BEL-ACC-003) — « par où on entre ». Ajouté en FIN, comme
  // les précédents : `TAB_KEYS` est le contrat du paramètre d'URL, et y insérer
  // une valeur au milieu ne casserait rien pour un lien déjà partagé, mais
  // l'ordre d'AFFICHAGE se choisit plus bas.
  'access',
  // MISSIONS (PDF 4 §3.3, BEL-BO-006) — le quatorzième onglet, que la source
  // elle-même marquait « À FAIRE ». Ajouté en FIN, comme les précédents :
  // `TAB_KEYS` est le contrat du paramètre d'URL, et y insérer une valeur au
  // milieu ne casserait rien pour un lien déjà partagé — mais l'ordre
  // d'AFFICHAGE, lui, se choisit plus bas.
  'missions',
  // #2115.21-27 — LES QUATRE OBJETS QUE LE RETOUR NOMMAIT ET QUE LA SECTION NE
  // PORTAIT PAS (décision de Louis, 14/09/2026 : on COMPLÈTE les sections, on ne
  // reformule pas les points). Aucun n'est écrit à neuf — les quatre existaient
  // déjà, sans montage dans la bonne section :
  //  - `programs` : RETIRÉ par #3677 (05/10/2026) — les programmes se lisent avec
  //    les signaux ; `?tab=programs` reste un alias de `veille`.
  //  - `needs` : les besoins confirmés vivaient hors du dossier (`/projects/needs`,
  //    filtre `account_id` déjà au contrat) — « Opportunités » promet
  //    « signaux · veille · projets plausibles · BESOINS CONFIRMÉS ».
  //  - `messages` : la préparation vit dans le panneau d'engagement contact, qui
  //    ne s'ouvrait que depuis Contacts — « Plan d'action » promet « le plan ·
  //    les prochaines actions · LA PRÉPARATION DES MESSAGES ».
  //  - `memory` : `RelationshipMemoryCard` vivait dans la Synthèse — « Historique
  //    & preuves » promet « … · timeline · MÉMOIRE RELATIONNELLE ».
  // Ajoutés en FIN, comme tous les précédents : `TAB_KEYS` est le contrat du
  // paramètre d'URL, et y insérer une valeur au milieu ne casserait rien pour un
  // lien déjà partagé — mais l'ordre d'AFFICHAGE, lui, se choisit plus bas.
  'messages',
  'memory',
  // #3282 — l'écran COMITÉ D'ACHAT (#3263.39). Ajouté en FIN, comme tous les précédents.
  'committee',
  // Brief commercial « Ce que je sais » (01/10/2026) — page d'entrée du compte quand
  // `raw_analysis.commercial_brief` existe et respecte le contrat. Ajouté en FIN
  // (contrat d'URL) ; l'ordre d'AFFICHAGE le met en tête de la Synthèse.
  'brief',
  // #4745 — « Stratégie financière » (Louis 28/10/2026). Ajouté en FIN, comme tous les précédents.
  'finance',
] as const

export type TabId = (typeof TAB_KEYS)[number]

export const SECTION_KEYS = [
  'synthesis',
  'perimeters',
  'opportunities',
  'people',
  // Théo A comptes-fiche.R2 — l'ORGANIGRAMME a sa propre section (Contacts et Organigramme séparés).
  'organigramme',
  'ecosystem',
  'actionPlan',
  'historyProofs',
  // #4745 — « Stratégie financière » a sa PROPRE section (une section d'un seul écran n'affiche aucune pastille :
  // un onglet rangé sous une section déjà fondue serait resté sans chemin d'accès au clic).
  'finance',
] as const
export type SectionId = (typeof SECTION_KEYS)[number]

/**
 * #2115 — LES QUATORZE ONGLETS ABSORBÉS PAR SEPT SECTIONS (D8, Louis 14/09/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE CONSTAT, MOT POUR MOT
 * ─────────────────────────────────────────────────────────────────────────────
 * « Le dossier compte possède déjà environ 15 onglets et la barre commence à
 * sortir de l'écran. » Quatorze exactement. Le premier rangement (#1604) les a
 * mis en quatre FAMILLES : la barre tenait, mais il restait deux portées
 * d'onglets, et la seconde en comptait jusqu'à six.
 *
 * D8 tranche autrement : sept SECTIONS, qui absorbent les quatorze onglets.
 * Chaque ancien onglet devient une SOUS-SECTION, atteinte par ANCRE dans sa
 * section — donc plus un second niveau d'onglets, mais un contenu continu qu'on
 * parcourt. Rien n'est supprimé : ni une page, ni une URL, ni une donnée.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI NE BOUGE PAS, ET C'EST LA MOITIÉ DU SUJET
 * ─────────────────────────────────────────────────────────────────────────────
 * `TAB_KEYS` est le contrat du paramètre d'URL. Il n'est ni réordonné, ni
 * renommé, ni amputé : `?tab=partners`, `?tab=access`, tout lien déjà partagé
 * ouvre exactement la même page qu'avant — désormais à son ancre, dans sa
 * section. Les sections sont une couche d'AFFICHAGE au-dessus, et la section
 * active se DÉDUIT de l'onglet actif — jamais l'inverse. Un deep-link ouvre donc
 * sa section tout seul, sans second état à désynchroniser.
 *
 * ⚠️ **Tout onglet de `TAB_KEYS` doit apparaître dans exactement une section.**
 * Un onglet oublié ici ne serait plus nommé nulle part dans la barre — la même
 * disparition silencieuse que l'écran resté des mois sans chemin d'accès. La
 * garde **GA-261** (`apps/web/src/architecture/`) échoue si un onglet manque ou
 * apparaît deux fois.
 */
export const ACCOUNT_SECTIONS: readonly { readonly section: SectionId; readonly tabs: readonly TabId[] }[] = [
  // #2115.21 — SYNTHÈSE : ce que le compte est, et ce qu'on en pense. Le doublon
  // reconnu par le retour (« Vue d'ensemble » et « Évaluation » disaient deux
  // fois la même chose sous deux entrées) se résout en les empilant.
  { section: 'synthesis', tabs: ['brief', 'overview', 'evaluation'] },
  // #2115.22 — PÉRIMÈTRES : sites, entités, filiales et programmes. Les trois
  // premiers vivent dans `sites` ; les PROGRAMMES sont la quatrième promesse du
  // libellé, et ils n'apparaissaient nulle part dans la section.
  { section: 'perimeters', tabs: ['sites'] },
  // #2115.23 — OPPORTUNITÉS : signaux, veille, projets plausibles et besoins
  // CONFIRMÉS — les trois premiers étaient là, le quatrième vivait hors du
  // dossier. Il ferme la progression : un signal se confirme en projet
  // plausible, un projet plausible se confirme en besoin.
  // #3624 / #3676 (Louis 05/10) — UN écran « Signaux et besoins » : `veille`
  // en tête (le clic sur la section y atterrit) ; `projects` reste une clé
  // d'URL de la section, fondue dans le même écran (voir `MERGED_SUB_TABS`).
  // `needs` et `besoins` sont des alias de `veille` (`accountDetailSearch.ts`).
  { section: 'opportunities', tabs: ['veille', 'projects'] },
  // #2620.1 — CONTACTS EN TÊTE : revirement assumé de #1817. Le retour dit
  // qu'on vient chercher des gens, pas un schéma — un clic sur la section
  // « Personnes » atterrit désormais sur la liste des contacts, l'organigramme
  // reste à un clic. `resolveArrivalTab` (AccountDetail.tsx, #1817) garde sa
  // propre logique d'arrivée sur un graphe non vide : cet ordre ne régit que le
  // clic sur l'en-tête de section, pas le deep-link d'ouverture du dossier.
  // Théo A comptes-fiche.R2 — Contacts (Comité d'achat · Couverture en sous-vues) ; l'organigramme
  // a quitté cette section pour la sienne, juste dessous (huit sections, comme la page appliquée).
  { section: 'people', tabs: ['contacts', 'committee', 'coverage'] },
  { section: 'organigramme', tabs: ['organigramme'] },
  // #2115.25 — ÉCOSYSTÈME & ACCÈS. ⚠️ DEUX blocs distincts, jamais une liste
  // fusionnée : la décision de Louis du 22/08 (inscrite dans `TabAccess.tsx`)
  // tient parce que deux listes de la même chose donneraient deux vérités.
  { section: 'ecosystem', tabs: ['partners', 'access'] },
  // #2115.26 — PLAN D'ACTION : le plan, les prochaines actions, les messages.
  // Les messages sont la DERNIÈRE marche du plan : on décide, puis on écrit.
  { section: 'actionPlan', tabs: ['plan', 'messages'] },
  // #2115.27 — HISTORIQUE & PREUVES : ce qu'on y délivre, ce qu'on en raconte,
  // ce qui s'est passé, et ce que l'équipe SAIT déjà (la mémoire relationnelle,
  // qui était restée une carte de la Synthèse).
  // Refonte Théo (23/10) — l'ordre de la maquette : Activité (le fil) · Missions · Documents & références · Mémoire.
  { section: 'historyProofs', tabs: ['history', 'missions', 'proofs', 'memory'] },
  // #4745 (Louis 28/10) — les comptes publiés du compte ANALYSÉ, lus ensemble : un écran distinct de la collecte (#4744).
  { section: 'finance', tabs: ['finance'] },
]

/**
 * #3624 / #3676 (Louis 05/10) — LES SOUS-ONGLETS FONDUS : jamais une pastille.
 *
 * « Ne plus avoir 3 écrans, ne faire qu'un écran Opportunité » (#3624) et
 * « une seule surface Signaux et besoins » (#3676) : Signaux (`veille`) et
 * Opportunités (`projects`) rendent le MÊME écran (`AccountOpportunityScreen`).
 * Besoins confirmés (`needs`) et Programmes (`programs`, #3625 / #3677) ne
 * sont plus des clés : leurs anciennes URL sont des alias de `veille`.
 *
 * Ce qui NE bouge PAS : un lien `?tab=projects` partagé ouvre toujours la
 * section, et chaque clé garde sa section (GA-261). Seule la PASTILLE
 * disparaît, y compris quand la clé est active : une section réduite à un seul
 * écran n'affiche aucune pastille.
 */
export const MERGED_SUB_TABS: readonly TabId[] = ['brief', 'overview', 'evaluation', 'veille', 'projects']

/** La section qui contient cet onglet. `synthesis` par défaut : la section
 *  active se DÉDUIT toujours de l'onglet, donc elle ne peut pas être indéfinie. */
export function sectionOfTab(tab: TabId): SectionId {
  return ACCOUNT_SECTIONS.find(entry => entry.tabs.includes(tab))?.section ?? 'synthesis'
}

/** Les sous-sections d'une section, dans l'ordre où elles s'empilent. */
export function tabsOfSection(section: SectionId): readonly TabId[] {
  return ACCOUNT_SECTIONS.find(entry => entry.section === section)?.tabs ?? []
}

/**
 * #2115.44 — L'IDENTIFIANT D'ANCRE d'une sous-section.
 *
 * Il vit ICI, et pas dans le contenu : la barre écrit le `href`, le contenu
 * écrit l'`id`, et deux dérivations qui les recalculeraient chacune de leur côté
 * divergeraient au premier renommage — un lien d'ancre qui ne trouve rien ne
 * produit aucune erreur, il ne fait simplement rien.
 */
export function subSectionAnchorId(tab: TabId): string {
  return `dossier-${tab}`
}

/** Refonte Théo (23/10) — l'icône de chaque onglet (`.a4-main-nav > a > .icon`), décorative : le libellé nomme. */
const SECTION_ICONS: Record<SectionId, LucideIcon> = {
  synthesis: BookOpen,
  perimeters: Building2,
  opportunities: Radio,
  people: Users,
  organigramme: Network,
  ecosystem: Share2,
  actionPlan: ListChecks,
  historyProofs: History,
  finance: Landmark,
}

/** La section d'arrivée d'un dossier — celle vers laquelle « retour au résumé »
 *  ramène (#2115.47), et la seule qui n'a pas besoin de ce bouton. */
const SUMMARY_SECTION: SectionId = 'synthesis'

interface AccountDetailTabsBarProps {
  activeTab: TabId
  onTabChange: (tab: TabId) => void
  /** Onglets à retirer de la barre faute de contenu actionnable (recette finale
   *  §33). L'onglet ACTIF n'est jamais retiré, même listé ici : faire disparaître
   *  l'onglet sur lequel on se trouve laisse l'utilisateur sur une page qui n'est
   *  plus nommée nulle part — un lien partagé ou un favori doit continuer d'ouvrir
   *  ce qu'il promet. */
  hiddenTabs?: readonly TabId[]
  /** Refonte Théo (23/10) — `.a4-dossier-workbar` : ce qui se range à droite des vues de l'onglet (la recherche
   *  dans le dossier). Rendu sur tous les onglets. */
  workbarEnd?: ReactNode
}

export function AccountDetailTabsBar({
  activeTab,
  onTabChange,
  hiddenTabs = [],
  workbarEnd,
}: AccountDetailTabsBarProps) {
  const { t } = useTranslation('accounts')
  const visible = (tab: TabId) => tab === activeTab || !hiddenTabs.includes(tab)

  // Une section dont TOUTES les sous-parties sont masquées ne s'affiche pas :
  // une entrée qui n'ouvre rien est pire qu'une entrée absente.
  const sections = ACCOUNT_SECTIONS.filter(entry => entry.tabs.some(visible))
  const activeSection = sectionOfTab(activeTab)
  // #3624 / #3625 — une sous-partie fondue n'est jamais une pastille.
  const subSections = tabsOfSection(activeSection).filter(tab => visible(tab) && !MERGED_SUB_TABS.includes(tab))

  // #2130.54 — UN SEUL point d'émission pour les trois chemins qui changent
  // l'onglet actif (section large, sélecteur mobile, pilule de sous-partie,
  // retour au résumé) : envelopper `onTabChange` ici, plutôt que dupliquer
  // l'appel à chaque geste, garantit qu'aucun des quatre ne peut l'oublier.
  const trackedTabChange = (tab: TabId) => {
    trackTabOpened(ACCOUNT_DETAIL_SCREEN, tab)
    onTabChange(tab)
  }

  // Cliquer une section ouvre sa PREMIÈRE sous-partie visible. Elle ne
  // « sélectionne » pas une section dans un état à part : il n'y a qu'un état,
  // l'onglet actif, et la section s'en déduit. Un second état se
  // désynchroniserait du deep-link.
  const openSection = (section: SectionId) => {
    const first = tabsOfSection(section).filter(visible)[0]
    if (first && first !== activeTab) trackedTabChange(first)
  }

  // i18n keys: tabSections.synthesis | tabSections.perimeters | tabSections.opportunities | tabSections.people | tabSections.ecosystem | tabSections.actionPlan | tabSections.historyProofs | tabSections.finance
  const sectionLabel = (section: SectionId) => t(`tabSections.${section}`)

  // i18n keys: tabs.overview | tabs.sites | tabs.veille | tabs.contacts | tabs.organigramme | tabs.coverage | tabs.plan | tabs.projects | tabs.missions | tabs.proofs | tabs.partners | tabs.access | tabs.history | tabs.evaluation | tabs.messages | tabs.memory | tabs.committee | tabs.brief | tabs.finance
  const subSectionItems: TabNavItem[] = subSections.map(tab => ({
    key: tab,
    label: t(`tabs.${tab}`),
    to: `#${subSectionAnchorId(tab)}`,
  }))
  const tabForAnchor = new Map(subSections.map(tab => [`#${subSectionAnchorId(tab)}`, tab]))

  return (
    <div {...guideAnchorProps('compte.sections')} className="flex flex-col gap-2 min-w-0">
      {/* #2115.40-43 — LA BARRE DE SECTIONS, SUR ÉCRAN LARGE.
          Sept entrées qui PASSENT À LA LIGNE plutôt que de défiler : une barre
          qui défile sans dire qu'elle défile rend ses dernières entrées
          inatteignables à la souris (mesuré sur /missions le 31/08). Sept
          libellés tiennent sur une ligne à 1280 px et sur deux en dessous —
          dans les deux cas, tout est lisible sans geste. */}
      <nav
        aria-label={t('sectionsNav.sections')}
        className="hidden md:flex min-w-0 flex-wrap items-stretch border-b border-[var(--bellum-border)]"
      >
        {sections.map(entry => {
          const isActive = entry.section === activeSection
          const Icon = SECTION_ICONS[entry.section]
          return (
            <button
              key={entry.section}
              type="button"
              // Le lecteur d'écran doit savoir OÙ il est, pas seulement le voir.
              aria-current={isActive ? 'page' : undefined}
              onClick={() => openSection(entry.section)}
              className={cn(
                // #2115.43 — la zone cliquable, pas seulement le texte : 44 px de
                // haut (GA-30) et une gouttière horizontale réelle.
                // Refonte Théo — `.ac20-root .a4-main-nav a` : onglet souligné, icône 16 px, aucun fond.
                'relative inline-flex min-h-12 shrink-0 items-center gap-2 whitespace-nowrap px-3 text-sm transition-colors duration-immediate ease-bellum-out',
                // #2115.42 — la section active en accent et en semibold. L'accent
                // passe par `--bellum-text-accent` : aucune nuance FIXE de la
                // gamme primaire ne passe AA des deux côtés.
                isActive
                  ? 'font-semibold text-[var(--bellum-text-accent)]'
                  : 'text-[var(--bellum-text-muted)] hover:text-[var(--bellum-text-primary)]',
              )}
            >
              <Icon aria-hidden className="size-4 shrink-0" />
              {sectionLabel(entry.section)}
              {isActive && (
                <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-0.5 bg-[var(--bellum-text-accent)]" />
              )}
            </button>
          )
        })}
      </nav>

      {/* #2115.45-47 — LA MÊME BARRE, SOUS 768 px.
          Le mobile est le produit, pas un repli : mêmes sections, même état,
          même rendu — seule la coque change, et elle change en CSS. Un
          sélecteur compact plutôt qu'une barre : il porte le nom de la section
          active en permanence (#2115.46), là où une barre scrollable le pousse
          hors champ dès qu'on lit. */}
      <div className="flex items-center gap-2 md:hidden">
        <SelectField
          value={activeSection}
          onChange={next => openSection(next as SectionId)}
          options={sections.map(entry => ({ value: entry.section, label: sectionLabel(entry.section) }))}
          ariaLabel={t('sectionsNav.mobile')}
          size="sm"
          className="min-w-0 flex-1"
        />
        {activeSection !== SUMMARY_SECTION && (
          <button
            type="button"
            onClick={() => trackedTabChange('overview')}
            className={cn(
              'min-h-11 shrink-0 whitespace-nowrap rounded-md px-3 text-sm transition-colors',
              'text-[var(--bellum-text-secondary)] hover:bg-[var(--bellum-surface-2)] hover:text-[var(--bellum-text-primary)]',
            )}
          >
            {t('sectionsNav.backToSummary')}
          </button>
        )}
      </div>

      {/* R15-8 — LES SOUS-SECTIONS MONTRENT LEUR PANNEAU ET CACHENT LES AUTRES.
          ⚠️ Revirement assumé de #2115.44 : elles étaient des ANCRES vers un
          contenu déjà empilé plus bas. Mesuré en production le 15/09 : une puce
          qui ne cache rien n'est pas une navigation, et deux panneaux empilés
          de la section Personnes écrivaient deux fois « Chemin d'accès
          recommandé » (loi 4 du tome 7). Le raisonnement complet est dans
          `AccountDetailTabContent`, qui porte le rendu.
          Le `href` reste l'ancre du panneau — il se copie, il se tabule, et il
          est vrai dès que la puce est active. La FORME reste la pastille
          (GA-127) — un second niveau ne se rend jamais comme le premier. Une
          section d'une seule sous-partie n'en affiche aucune : elle répéterait
          le nom de la section. */}
      {/* Refonte Théo — `.a4-dossier-workbar` : les vues de l'onglet (`.a4-subnav`, segmentées) à gauche, la
          recherche à droite. */}
      {subSectionItems.length > 1 || workbarEnd ? (
        <div data-testid="account-workbar" className="flex min-w-0 flex-wrap items-center justify-between gap-3 py-4">
          {subSectionItems.length > 1 && (
            <nav
              aria-label={t('sectionsNav.subSections')}
              className="min-w-0 max-w-full overflow-x-auto rounded-lg border border-[var(--bellum-border)] bg-card p-0.5"
            >
              <TabNav
                tabs={subSectionItems}
                activeTab={activeTab}
                size="sm"
                variant="pill"
                className="overflow-x-auto"
                renderLink={({ to, className, children, active }) => (
                  <a
                    href={to}
                    className={className}
                    // #2479 — sans lui, un lecteur d'écran ne sait jamais QUELLE
                    // sous-partie est ouverte : seule la branche `<button>` de
                    // `TabNav` le portait.
                    aria-pressed={active}
                    onClick={event => {
                      // Le `href` reste vrai (il se copie, il s'ouvre au clavier),
                      // mais le saut natif poserait un `#…` dans l'URL À CÔTÉ du
                      // `?tab=` : deux adresses pour un même endroit. L'URL
                      // canonique reste `?tab=`, et le contenu amène l'ancre.
                      event.preventDefault()
                      const tab = tabForAnchor.get(to)
                      if (tab) trackedTabChange(tab)
                    }}
                  >
                    {children}
                  </a>
                )}
              />
            </nav>
          )}
          {workbarEnd ? <div className="ml-auto flex min-w-0 items-center gap-2">{workbarEnd}</div> : null}
        </div>
      ) : null}
    </div>
  )
}
