import {
  Briefcase,
  Building,
  Crosshair,
  Gauge,
  History,
  House,
  Lightbulb,
  Mail,
  MessageCircle,
  Plug,
  Settings,
  ShieldCheck,
  Sunrise,
  UserRound,
  Users,
} from 'lucide-react'
import { familyEntries, NAV_SECTIONS, type NavEntry } from '@/components/navigation/sections'
import { disabledProductRoutes } from '@/features/product-gating/disabledRoutes'
import type { PlanFeatureKey } from '@bellum/contracts'
import type { NavigateOptions } from '@tanstack/react-router'
import type { LucideIcon } from 'lucide-react'

type SidebarItem = {
  /** i18n key in the `nav` namespace (e.g. `items.accounts`). */
  labelKey: string
  to: NavigateOptions['to']
  icon: LucideIcon
  /** When true, the entry stays visible but cannot be opened yet. */
  disabled?: boolean
  /** i18n key in the `nav` namespace; defaults to `comingSoon` when omitted. */
  disabledReasonKey?: string
  /**
   * Cet écran n'est PAS une entrée de la barre : il est un onglet de la page `aliasOf` (Réglages refondus d'après les
   * maquettes Théo V22). Il reste déclaré pour la recherche des Réglages et pour le catalogue de Laura, qui en dérivent.
   */
  aliasOf?: NavigateOptions['to']
  /**
   * #4535.4 — libellés (clés `nav`) sous lesquels la RECHERCHE des Réglages trouve aussi cette entrée : « raccourcis »
   * mène à Préférences, qui n'a plus d'entrée de menu dédiée.
   */
  searchKeys?: readonly string[]
  /** Only shown to workspace owners/admins (manager dashboard). */
  managerOnly?: boolean
  /** #4158.9 — absente d'un espace solo (moins de deux membres actifs). */
  requiresTeam?: boolean
  /** Feature de palier requise. L'entrée reste VISIBLE sans elle — avec un
   *  cadenas et, au clic, l'écran qui dit quelle offre l'ouvre. Une nav qui
   *  change de forme selon l'offre rend le produit illisible d'un poste à
   *  l'autre, et personne ne veut ce qu'il ne voit pas. */
  feature?: PlanFeatureKey
  children?: SidebarItem[]
  separated?: boolean
  /**
   * L'entrée DISPARAÎT en pointeur grossier.
   *
   * Réservé à ce qui n'a littéralement pas de sujet au doigt — la page des
   * raccourcis CLAVIER en est le seul cas. Ce n'est pas « moins utile sur
   * mobile » (auquel cas on la garderait : cacher ce qui existe donne
   * l'impression de ne rien avoir) : c'est un écran dont chaque ligne demande
   * une touche qu'un téléphone n'a pas.
   *
   * ⚠️ Masquée en CSS, dans le MÊME rendu — pas par une branche `isMobile ?`.
   * Deux arbres selon la largeur est ce que les règles mobiles du dépôt
   * refusent, et le média `pointer` répond à la bonne question : « y a-t-il un
   * dispositif de pointage fin ? », qui suit un iPad avec clavier là où une
   * borne de largeur se trompe.
   */
  pointerFineOnly?: boolean
  /**
   * #4492.1 (PR 12C, maquette V22 `.a14-navsub`) — les SOUS-ENTRÉES de la section, dépliées sous l'entrée
   * quand elle est ACTIVE (trait vertical à gauche, sous-entrée active surlignée), masquées barre repliée.
   * LUES dans `sections.ts` (`familyEntries`), jamais recopiées ici (GA-26, #4492.4).
   */
  subEntries?: NavEntry[]
}

export type SidebarSection = {
  /** i18n key in the `nav` namespace (e.g. `sections.workspace`). */
  labelKey?: string
  items: SidebarItem[]
}

/**
 * Une icône par section. Elles vivent ici et non dans `sections.ts` : ce dernier
 * est un modèle PUR, lu par des tests, et lui faire importer une bibliothèque
 * d'icônes pour vérifier une liste de routes serait absurde.
 */
const SECTION_ICONS: Record<string, LucideIcon> = {
  today: Sunrise,
  accounts: Building,
  projects: Lightbulb,
  talents: UserRound,
  missions: Briefcase,
  actions: History,
  contacts: Users,
  signals: Crosshair,
  mailbox: Mail,
  copilot: MessageCircle,
  pilotage: Gauge,
  settings: Settings,
  team: Users,
}

/**
 * L'état « bientôt disponible », décidé ailleurs (`disabledProductRoutes`) et
 * appliqué ici. Une section grisée reste VISIBLE : un produit qui cache ce qui
 * n'est pas prêt donne l'impression de ne rien avoir, et personne ne demande ce
 * qu'il n'a jamais vu.
 */
const SECTION_DISABLED: Record<string, boolean> = {
  copilot: disabledProductRoutes.chat,
}

/**
 * La barre latérale, DÉRIVÉE des sections.
 *
 * Une seule source pour la barre et pour les onglets qui mènent aux surfaces
 * absorbées : la garde « aucune surface perdue » de `sections.test.ts` ne vaut
 * que si la barre lit la même liste. Deux listes tenues à la main auraient
 * divergé au premier ajout.
 */
/**
 * Les sections qui n'apparaissent PAS comme entrée de barre latérale, et
 * pourquoi.
 *
 * `copilot` a sa propre porte, juste au-dessus : le bouton « Demander à
 * Laura ». L'y lister AUSSI donnait deux entrées empilées pour le même
 * interlocuteur, chacune avec sa liste de conversations — la loi 4 du tome 7
 * (« rien n'apparaît deux fois sous la même forme »), et c'est la redondance
 * qui se voyait le plus dans la barre.
 *
 * ⚠️ La section reste dans `NAV_SECTIONS` et n'en sort PAS. Le modèle répond à
 * « quelles surfaces existent et où elles se rangent » — il porte les onglets
 * de l'écran (Conversation / Commandes) et la garde « aucune route orpheline ».
 * La barre répond à une autre question : « qu'est-ce qui est listé ». Retirer
 * la section du modèle emporterait les onglets avec elle.
 */
// #4312 / #3610 — Découvrir a lui aussi SA porte : le bouton lavande des commandes, juste au-dessus.
const NOT_IN_SIDEBAR: readonly string[] = ['copilot', 'discover']

/**
 * Coque Théo (23/10/2026) — les sections qui quittent la rubrique « Espace de
 * travail » pour le PIED de la barre, comme dans les maquettes appliquées
 * (`.nav-foot` : Intégrations, Paramètres, puis le bloc d'identité). Elles
 * restent des entrées de la barre : seul l'endroit change.
 */
const IN_SIDEBAR_FOOT: readonly string[] = ['settings']

export const PLATFORM_SECTIONS: SidebarSection[] = [
  {
    labelKey: 'sections.workspace',
    /*
     * #4492 (PR 12C, contrat validé par Louis le 24/10/2026) — une entrée par section de PREMIER niveau,
     * dans l'ordre de la maquette V22, chacune avec ses sous-entrées. Les sections FILLES (Équipe, Pilotage :
     * `parent: 'today'`) ne sont plus des entrées : elles vivent sous « Ma journée ».
     *
     * Revient sur #3132 (27/09/2026, tiroir « Prospection » retiré, décision Louis 24/10, #4492) : la sous-
     * navigation revient, sous la forme V22 — sous l'entrée ACTIVE, pas un tiroir à ouvrir.
     */
    items: NAV_SECTIONS.filter(
      section => !section.parent && !NOT_IN_SIDEBAR.includes(section.key) && !IN_SIDEBAR_FOOT.includes(section.key),
    ).flatMap(sectionEntry),
  },
]

/** L'entrée de barre d'une section : son libellé, sa route, son icône et ses portes. */
function sectionEntry(section: (typeof NAV_SECTIONS)[number]): SidebarItem[] {
  return [
    {
      labelKey: section.labelKey,
      to: section.to as NavigateOptions['to'],
      icon: SECTION_ICONS[section.key] ?? House,
      ...(section.feature ? { feature: section.feature } : {}),
      ...(section.managerOnly ? { managerOnly: true } : {}),
      ...(section.requiresTeam ? { requiresTeam: true } : {}),
      ...(SECTION_DISABLED[section.key] ? { disabled: true, disabledReasonKey: 'comingSoon' } : {}),
      ...subEntriesOf(section),
    },
  ]
}

/** Une sous-navigation d'UNE seule entrée n'apprend rien : elle répète l'entrée. */
function subEntriesOf(section: (typeof NAV_SECTIONS)[number]): Pick<SidebarItem, 'subEntries'> {
  const entries = familyEntries(section)
  return entries.length > 1 ? { subEntries: entries } : {}
}

/**
 * Coque Théo (23/10/2026) — le PIED de la barre : Intégrations puis Paramètres
 * (maquettes appliquées, `.nav-foot`). Intégrations mène à `/integrations`, le
 * centre d'intégrations qui existe déjà ; Paramètres est la section `settings`,
 * retirée de la rubrique du haut (`IN_SIDEBAR_FOOT`).
 */
export const PLATFORM_FOOT_SECTION: SidebarSection = {
  items: [
    { labelKey: 'items.integrations', to: '/integrations', icon: Plug },
    ...NAV_SECTIONS.filter(section => IN_SIDEBAR_FOOT.includes(section.key)).flatMap(sectionEntry),
  ],
}

/**
 * L'entrée back-office — une ADDITION, pas une navigation de remplacement.
 *
 * D34 (Louis, 28/08/2026). Cette liste s'appelait `BACKOFFICE_SECTIONS` et
 * REMPLAÇAIT la barre entière pour un porteur du rôle : sa navigation se
 * réduisait à cette unique entrée, sur tous les écrans du produit. Un opérateur
 * reste un utilisateur — il garde la barre client, à laquelle cette section
 * s'ajoute (`CustomerNavbarBody`, en bas, sous un séparateur).
 *
 * Le singulier du nom est là pour ça : une seule section, greffée sous les
 * autres, et non un jeu de sections qui se substitue.
 */
export const BACKOFFICE_SECTION: SidebarSection = {
  items: [{ labelKey: 'items.backoffice', to: '/bak/home', icon: ShieldCheck }],
}

/** Nav entries that can NEVER be hidden by the sidebar-customization preference —
 *  hiding Settings would lock the user out of the very screen that customizes it,
 *  and hiding Aujourd'hui (#2144.29, épopée #2928) would cut a user off from their
 *  own home screen. Laura (`/chat`) never faces this question: it is not a
 *  sidebar entry to begin with (see `NOT_IN_SIDEBAR` above). */
export const ALWAYS_VISIBLE_NAV: string[] = ['/settings', '/briefing']

/** The workspace nav entries a user may hide/show from Préférences › Apparence.
 *  Derived from the platform sections, minus the always-visible ones. `managerOnly`
 *  entries (e.g. Pilotage) are still listed — hiding them is harmless, showing them
 *  stays gated by role at render time. */
export const CUSTOMIZABLE_NAV: { to: string; labelKey: string }[] = PLATFORM_SECTIONS.flatMap(section =>
  section.items
    .filter(item => item.to != null && !ALWAYS_VISIBLE_NAV.includes(String(item.to)))
    .map(item => ({ to: String(item.to), labelKey: item.labelKey })),
)
