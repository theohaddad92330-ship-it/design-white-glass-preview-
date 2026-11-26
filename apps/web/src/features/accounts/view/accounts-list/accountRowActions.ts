import type { CommercialLifecycle } from '@bellum/contracts'
import {
  Archive,
  CalendarPlus,
  FolderOpen,
  GitMerge,
  MessageCircle,
  MoonStar,
  MoveRight,
  PlayCircle,
  Share2,
  Trash2,
  UserPlus,
  type LucideIcon,
} from 'lucide-react'

/**
 * LES SEPT GESTES D'UNE LIGNE DU PORTEFEUILLE — LA SEULE ÉCRITURE DE LA LISTE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE FICHIER EXISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * Ces sept actions ne vivaient QUE dans le menu au clic droit. Le dépôt le
 * savait à moitié : le commentaire d'`AccountTableRow` constate pour la seule
 * « Demander à Laura » qu'« un commercial ne fait pas de clic droit, la fonction
 * était donc livrée et introuvable » — et le constat n'a jamais été appliqué aux
 * six autres. Sur un écran tactile, le clic droit n'existe même pas.
 *
 * La correction ajoute une porte (le « … » de fin de ligne), elle n'en ferme
 * aucune : retirer le clic droit casserait l'habitude de qui l'a trouvé.
 *
 * ⚠️ Deux portes veulent dire deux RENDUS — Radix sépare `ContextMenu*` et
 * `DropdownMenu*`, ils ne s'interchangent pas. Ce qui ne se dédouble PAS, c'est
 * la liste : sans ce fichier, une huitième action ajoutée au clic droit
 * manquerait au « … », et l'on serait revenu au défaut qu'on corrige.
 *
 * La liste est PURE — aucune traduction, aucun JSX : elle rend des clés i18n,
 * que chaque rendu résout. C'est ce qui la rend testable sans monter d'écran.
 */

/** Les sept gestes, dans l'ordre du menu. Sert de corpus à la garde : une garde
 *  doit LIRE quelque chose, et un test qui compare la liste rendue à cette
 *  déclaration refuse aussi bien l'oubli que l'ajout silencieux. */
export const ACCOUNT_ROW_ACTION_KEYS = [
  // #2150.21 — la ligne entière ouvre le dossier, mais un clic de ligne ne se
  // VOIT pas (et au doigt il se confond avec le défilement) : le geste est
  // nommé, en tête.
  'open',
  'share',
  'relaunch',
  'askCopilot',
  // #2150.22 / .25 / .26 — « agir sur une ligne sans ouvrir le dossier » : les
  // gestes du PORTEFEUILLE, groupés sous une séparation.
  'nextAction',
  'assign',
  'moveTo',
  'sleep',
  'absorb',
  'archive',
  'delete',
] as const

/** Non exporté : seul ce fichier le consomme (règle knip du dépôt). Les
 *  appelants passent par `AccountRowAction`, qui le porte déjà. */
type AccountRowActionKey = (typeof ACCOUNT_ROW_ACTION_KEYS)[number]

export type AccountRowActionHandlers = {
  onOpen: () => void
  onShare: () => void
  onRelaunch: () => void
  onAskCopilot: () => void
  /** #2150.22 — ouvre la saisie d'une tâche datée sur le compte : la « prochaine
   *  action » EST une tâche à venir (`noUpcomingTask`, le prédicat qui compte
   *  « sans prochaine action »), jamais un champ libre de plus. */
  onSetNextAction: () => void
  /** #2150.26 — range le compte « En veille » (`watching`), le statut qui existe
   *  déjà : aucun statut neuf, et rien n'est supprimé. */
  onSleep: () => void
  onAbsorb: () => void
  onArchive: () => void
  onDelete: () => void
}

type CommonFields = {
  key: AccountRowActionKey
  icon: LucideIcon
  /** Clé i18n du libellé, résolue par le rendu. Jamais le libellé lui-même. */
  labelKey: string
  disabled: boolean
  /** Une séparation précède cette entrée. */
  separatorBefore: boolean
}

export type AccountRowAction =
  /** Un geste qui s'exécute au clic. */
  | (CommonFields & { kind: 'item'; destructive: boolean; run: () => void })
  /** « Déplacer vers » / « Attribuer » — un sous-menu, dont le contenu vit dans
   *  `CommercialStatusSubmenu` / `AccountAssignSubmenu` (ils ont besoin d'une
   *  mutation, donc d'un hook). */
  | (CommonFields & { kind: 'submenu' })

type AccountRowActionState = {
  /** Le statut d'ANALYSE (`completed` / `archived` / …), pas le cycle commercial. */
  status: string
  /** Un archivage est déjà parti pour ce compte. */
  isArchiving: boolean
  /** Le cycle COMMERCIAL courant — `watching` grise « Mettre en veille ». */
  commercialStatus?: CommercialLifecycle
}

/**
 * La liste des gestes offerts sur UNE ligne, dans l'ordre où le menu les rend.
 *
 * `archived` grise deux entrées et deux seulement : ré-archiver n'a pas de sens,
 * et rattacher un dossier déjà archivé à un autre non plus. Tout le reste — le
 * partage, la relance, Laura, la suppression — reste offert : on archive, on ne
 * supprime pas, et un dossier archivé se relit.
 */
export function buildAccountRowActions(
  { status, isArchiving, commercialStatus }: AccountRowActionState,
  handlers: AccountRowActionHandlers,
): AccountRowAction[] {
  // #4053.9 — « archivé » = l'état d'analyse ET le tri commercial. Un compte dont seul `status` dit
  // `archived` (annulation d'import d'avant le correctif) reste dans la liste : le geste doit rester offert.
  const isArchived = status === 'archived' && (commercialStatus === undefined || commercialStatus === 'archived')
  return [
    {
      kind: 'item',
      key: 'open',
      icon: FolderOpen,
      labelKey: 'list.openDossier',
      disabled: false,
      destructive: false,
      separatorBefore: false,
      run: handlers.onOpen,
    },
    {
      kind: 'item',
      key: 'share',
      icon: Share2,
      labelKey: 'common:actions.share',
      disabled: false,
      destructive: false,
      separatorBefore: false,
      run: handlers.onShare,
    },
    {
      kind: 'item',
      key: 'relaunch',
      icon: PlayCircle,
      labelKey: 'list.relaunch',
      disabled: false,
      destructive: false,
      separatorBefore: false,
      run: handlers.onRelaunch,
    },
    {
      kind: 'item',
      key: 'askCopilot',
      icon: MessageCircle,
      labelKey: 'list.askCopilot',
      disabled: false,
      destructive: false,
      separatorBefore: false,
      run: handlers.onAskCopilot,
    },
    {
      kind: 'item',
      key: 'nextAction',
      icon: CalendarPlus,
      labelKey: 'list.setNextAction',
      disabled: false,
      destructive: false,
      separatorBefore: true,
      run: handlers.onSetNextAction,
    },
    {
      // #2150.25 — la même route que le bandeau de collaboration du dossier
      // (`PATCH /accounts/:id/assign`) : le serveur tient le refus, jamais un
      // `if` écrit dans la liste.
      kind: 'submenu',
      key: 'assign',
      icon: UserPlus,
      labelKey: 'list.assign',
      disabled: false,
      separatorBefore: false,
    },
    {
      kind: 'submenu',
      key: 'moveTo',
      icon: MoveRight,
      labelKey: 'list.moveTo',
      disabled: false,
      separatorBefore: false,
    },
    {
      kind: 'item',
      key: 'sleep',
      icon: MoonStar,
      labelKey: 'list.sleep',
      disabled: commercialStatus === 'watching',
      destructive: false,
      separatorBefore: false,
      run: handlers.onSleep,
    },
    {
      // #1111 — « KLESIA et KLESIA ADP, c'est la même chose, simplement des
      // entités. » Au-dessus d'Archiver, parce que c'est un archivage QUI DIT
      // OÙ : le dossier ne disparaît pas, il devient une entité de l'autre.
      kind: 'item',
      key: 'absorb',
      icon: GitMerge,
      labelKey: 'absorb.menuItem',
      disabled: isArchived,
      destructive: false,
      separatorBefore: true,
      run: handlers.onAbsorb,
    },
    {
      kind: 'item',
      key: 'archive',
      icon: Archive,
      // L'entrée DIT qu'elle travaille plutôt que de rester muette sous le
      // curseur : sans ce libellé, un archivage lent se lit « le clic n'a rien
      // fait », et le geste se refait.
      labelKey: isArchiving ? 'list.archiving' : 'list.archiveAccount',
      disabled: isArchived || isArchiving,
      destructive: false,
      separatorBefore: false,
      run: handlers.onArchive,
    },
    {
      kind: 'item',
      key: 'delete',
      icon: Trash2,
      labelKey: 'list.deleteAccount',
      disabled: false,
      destructive: true,
      separatorBefore: false,
      run: handlers.onDelete,
    },
  ]
}

/**
 * #2150.14/.18 — L'ÉTOILE DE LIGNE, TOUJOURS VISIBLE (jamais cachée dans ce
 * menu, contrairement aux onze gestes au-dessus) : le nom accessible du
 * bouton qui ne montre qu'une icône (GA-32). Pure, comme le reste de ce
 * fichier — aucune traduction ici, seulement la clé i18n que le rendu résout.
 */
export function accountFavoriteLabelKey(isFavorite: boolean): string {
  return isFavorite ? 'list.favorite.remove' : 'list.favorite.add'
}
