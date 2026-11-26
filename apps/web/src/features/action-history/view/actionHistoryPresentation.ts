import {
  Bell,
  Building2,
  CalendarDays,
  CircleDot,
  Clock,
  Download,
  Mail,
  Radio,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  UserRoundPlus,
  UsersRound,
  CalendarClock,
  type LucideIcon,
} from 'lucide-react'
import type { TFunction } from 'i18next'
import {
  actionChannelSchema,
  type ActionHistoryCategory,
  type ActionHistoryItem,
  type ActionType,
} from '@bellum/contracts'
import type { FilterDefinition } from '@bellum/ui'
import { i18n } from '@/i18n'

// `since` = le mode « Depuis votre dernière connexion » (§8) — un onglet à part
// des catégories : il ne filtre pas par type mais par fenêtre temporelle.
export type ActionHistoryTabKey = ActionHistoryCategory | 'all' | 'since'

const actionHistoryCategoryKeys = ['analysis', 'enrichment', 'export', 'message', 'reminder'] as const
const actionHistoryTabKeys = ['since', 'all', ...actionHistoryCategoryKeys] as const

// Deux événements SYSTÈME (§8) dont le libellé/détail est localisé côté web —
// les autres lignes portent un libellé serveur (FR). Sans entrée ici, on retombe
// sur le libellé serveur, donc aucune régression sur l'existant.
const labelKeyByActionType: Partial<Record<ActionType, string>> = {
  account_score_changed: 'events.scoreChanged',
  profile_updated: 'events.profileUpdated',
}

const detailKeyByActionType: Partial<Record<ActionType, string>> = {
  // Le détail d'un score (« 6 → 8 ») est numérique = neutre, il reste serveur.
  // Seul le profil a un détail purement textuel à localiser.
  profile_updated: 'events.profileUpdatedDetail',
}

/** Libellé d'action affiché : localisé pour les événements système §8, sinon le
 *  libellé serveur (inchangé pour toutes les lignes existantes). */
export function actionLabel(t: TFunction<'actions'>, item: ActionHistoryItem): string {
  const key = labelKeyByActionType[item.action_type]
  return key ? t(key) : item.action_label
}

/** Détail d'action affiché : localisé pour `profile_updated`, sinon serveur. */
export function actionDetail(t: TFunction<'actions'>, item: ActionHistoryItem): string {
  const key = detailKeyByActionType[item.action_type]
  return key ? t(key) : item.detail
}

export const actionIconByCategory: Record<ActionHistoryCategory, LucideIcon> = {
  analysis: TrendingUp,
  enrichment: UserRoundPlus,
  export: Download,
  message: Mail,
  reminder: Bell,
  other: CircleDot,
}

/**
 * La vignette d'une ligne de journal — la MÊME pour toutes les catégories.
 *
 * Elle en avait cinq : l'analyse en primaire, l'enrichissement en
 * `--bellum-success`, un message en `--bellum-info`, un export en
 * `--bellum-warning`. Une catégorie d'action n'est pas un état — un export
 * n'est pas « ce qui demande une décision », un enrichissement n'est pas
 * « ce qui est validé » — et « une couleur porte un état, jamais une
 * catégorie » (tome 7 §26.1, garde GA-64). Dans un journal, où la moitié des
 * lignes portaient une couleur d'alerte, c'est le rouge d'un VRAI échec qui
 * se perdait dans le décor.
 *
 * Rien n'est perdu : chaque catégorie garde son ICÔNE propre
 * ({@link actionIconByCategory}) et son libellé écrit juste à côté.
 */
export const ACTION_ICON_CHIP_CLASS = 'bg-[var(--bellum-surface-2)] text-[var(--bellum-text-secondary)]'

/** Un membre de l'espace, réduit à ce dont le filtre a besoin. Non exporté : les
 *  appelants passent le littéral, knip signale un type exporté sans consommateur. */
type ActionHistoryFilterMember = { userId: string; label: string }

// Les `value` des options de statut sont matchées côté serveur (query `status`) — ne pas les traduire.
export function getActionHistoryFilters(
  t: TFunction<'actions'>,
  members: ActionHistoryFilterMember[] = [],
): FilterDefinition[] {
  return [
    {
      // Texte libre et non une liste de comptes : un espace mûr en compte des
      // centaines, et le commercial cherche « decathlon », pas un identifiant.
      id: 'account',
      label: t('filters.account'),
      icon: Building2,
      type: 'text',
      placeholder: t('filters.accountPlaceholder'),
    },
    // Liste fermée : l'auteur d'une action est forcément un membre de l'espace.
    // Aucun membre chargé = pas de filtre affiché plutôt qu'un menu vide.
    ...(members.length > 0
      ? [
          {
            id: 'member',
            label: t('filters.member'),
            icon: UsersRound,
            options: members.map(member => ({ value: member.userId, label: member.label })),
          } satisfies FilterDefinition,
        ]
      : []),
    {
      id: 'type',
      label: t('filters.type'),
      icon: Clock,
      options: actionHistoryCategoryKeys.map(key => ({
        value: key,
        // i18n keys: tabs.analysis | tabs.enrichment | tabs.export | tabs.message | tabs.reminder
        label: t(`tabs.${key}`),
        icon: actionIconByCategory[key],
      })),
    },
    // #2200.38 — le canal était sur chaque ligne (`channel`), invisible en
    // filtre : « que s'est-il passé sur LinkedIn » obligeait à tout relire.
    {
      id: 'channel',
      label: t('filters.channel'),
      icon: Radio,
      options: actionChannelSchema.options.map(value => ({
        value,
        // i18n keys: channels.linkedin | channels.email | channels.phone | channels.meeting | channels.other
        label: t(`channels.${value}`),
      })),
    },
    {
      id: 'status',
      label: t('filters.status'),
      icon: ShieldCheck,
      options: [
        {
          value: 'Terminée',
          label: t('status.completed'),
          icon: CircleDot,
          iconClassName: 'text-[var(--bellum-success)]',
        },
        { value: 'Envoyé', label: t('status.sent'), icon: CircleDot, iconClassName: 'text-[var(--bellum-info)]' },
        { value: 'Copié', label: t('status.copied'), icon: CircleDot, iconClassName: 'text-[var(--bellum-info)]' },
        {
          value: 'Programmé',
          label: t('status.scheduled'),
          icon: CircleDot,
          iconClassName: 'text-[var(--bellum-primary-400)]',
        },
      ],
    },
    {
      id: 'period',
      label: t('filters.period'),
      icon: CalendarDays,
      options: [
        { value: '7d', label: t('filters.last7Days') },
        { value: '30d', label: t('filters.last30Days') },
        { value: '90d', label: t('filters.last90Days') },
      ],
    },
  ]
}

export function getEvidenceItems(t: TFunction<'actions'>): Array<{
  title: string
  description: string
  icon: LucideIcon
}> {
  return [
    {
      title: t('evidence.traceabilityTitle'),
      description: t('evidence.traceabilityDescription'),
      icon: UsersRound,
    },
    {
      title: t('evidence.collaborationTitle'),
      description: t('evidence.collaborationDescription'),
      icon: Sparkles,
    },
    {
      title: t('evidence.complianceTitle'),
      description: t('evidence.complianceDescription'),
      icon: ShieldCheck,
    },
  ]
}

export const traceabilityIcon = CalendarClock

export function isActionHistoryTabKey(key: string): key is ActionHistoryTabKey {
  return (actionHistoryTabKeys as readonly string[]).includes(key)
}

export function formatActionDate(value: string): string {
  return new Intl.DateTimeFormat(i18n.language === 'en' ? 'en-GB' : 'fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

// Statuts renvoyés par l'API (valeurs FR persistées côté serveur) → clé de libellé localisé.
const statusKeyByServerValue: Record<string, string> = {
  Terminée: 'status.completed',
  'En cours': 'status.inProgress',
  Envoyé: 'status.sent',
  Copié: 'status.copied',
  Demandé: 'status.requested',
  Programmé: 'status.scheduled',
  Exporté: 'status.exported',
  Enregistrée: 'status.recorded',
  // Issues RÉELLES d'un run d'analyse, résolues côté serveur depuis
  // `analysis_runs` (et non plus déduites du type d'action).
  Échouée: 'status.failed',
  Annulée: 'status.canceled',
  // Un run resté « analyzing » au-delà du plafond du job : aucun événement
  // terminal ne viendra plus. On ne sait pas ce qu'il a produit et on ne le
  // saura jamais — donc ni « En cours », ni « Échouée ».
  'Sans suite': 'status.abandoned',
  // Événements système §8 : le SENS du mouvement de score et la mise à jour de
  // profil (valeurs FR posées par le serveur, cf. `presentAction`).
  'En hausse': 'status.scoreUp',
  'En baisse': 'status.scoreDown',
  'Mis à jour': 'status.updated',
}

/** Libellé affiché pour un statut serveur — statut inconnu = affiché tel quel. */
export function actionStatusLabel(t: TFunction<'actions'>, status: string): string {
  const key = statusKeyByServerValue[status]
  return key ? t(key) : status
}

export function statusVariant(status: string) {
  if (status === 'Terminée' || status === 'En hausse') return 'success'
  if (status === 'Échouée') return 'destructive'
  // Un score en baisse est un signal négatif à VOIR, sans être une erreur.
  if (status === 'En baisse') return 'warning'
  if (status === 'Envoyé' || status === 'Copié' || status === 'Mis à jour') return 'info'
  if (status === 'Programmé') return 'primary'
  return 'outline'
}
