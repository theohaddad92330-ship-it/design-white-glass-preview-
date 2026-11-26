import {
  accountScoreColor,
  accountVerdictFromScore,
  namedAccountVerdict,
  type AccessBarrierClass,
  type CommercialLifecycle,
  type SignalFreshnessSummary,
  type SprintLevel,
} from '@bellum/contracts'
import {
  AlertTriangle,
  Archive,
  Ban,
  Briefcase,
  CircleCheck,
  Clock,
  FileInput,
  type LucideIcon,
  Trash2,
} from 'lucide-react'

export type AccountRow = {
  id: string
  company_name: string
  sector: string | null
  /** #4497.a — le siège inscrit au registre ; la ville s'en tire (`headquartersCity`). Absent ou `null` ⇒ aucun texte. */
  headquarters?: string | null
  /** La TRANCHE d'effectif telle que le registre la publie (« 200 à 249 »), pas
   *  un nombre : une chaîne, donc, et `null` quand personne ne l'a publiée.
   *  Optionnel — une projection legacy ne la porte pas. */
  employees?: string | null
  priority_score: number | null
  /** D10 (Louis 05/10) — palier posé, non arbitré : la liste l'écrit sous le score. */
  score_unarbitrated?: boolean
  /** #4016.91 — le /25 de la fiche ; absent = dossier sans /25 lisible (la liste retombe sur le /10 nommé). */
  score_25?: number
  status: string
  // Tri commercial persistant (Théo p.39). Optionnel : lignes legacy sans colonne.
  commercial_status?: CommercialLifecycle
  created_at: string
  // Vraie date de dernière analyse (MAX completed_at des runs). Null = aucun run
  // terminé connu ; le rendu retombe alors sur `created_at` pour un compte
  // `completed` (legacy), sinon « — ». Optionnel : projections legacy sans le champ.
  last_analyzed_at?: string | null
  // Logo réel Apollo + site web (favicon réel en fallback d'affichage).
  logo_url?: string | null
  website?: string | null
  /**
   * #1577 — les parcours observés par la mémoire marché sur ce compte.
   *
   * TROIS ÉTATS, et l'écran n'en rend qu'un :
   *  · `number` — couvert, toujours au-dessus du seuil du service ;
   *  · `null` — lu, et non couvert ⇒ rien à l'écran ;
   *  · ABSENT — la mémoire n'a pas pu être lue, ou l'API est antérieure au
   *    champ ⇒ rien non plus, mais ce n'est pas la même phrase, et c'est
   *    pourquoi le champ est `| null` ET optionnel plutôt que l'un des deux.
   *
   * ⚠️ Jamais rendu comme « 0 parcours observés » : une valeur absente ne
   * s'affiche JAMAIS « 0 ».
   */
  market_paths_observed?: number | null
  /**
   * #2265.14 — cabinet de recrutement ou plateforme de mise en relation :
   * même jugement que le badge de /discover (`classify_actor_type`, apps/ia),
   * calculé au moment de la recherche Phase 1. `null`/absent = compte jamais
   * rejoué depuis ce lot — silence, jamais un badge deviné.
   */
  is_intermediary?: boolean | null
  primary_signal?: string | null
  signal_preview?: {
    label: string
    source?: string | null
    type?: string | null
    date?: string | null
    /** #3682 — fraîcheur du FAIT (`archive` = contexte historique). */
    freshness?: 'current' | 'archive' | 'undated' | null
  } | null
  /** #3682.3 — vérification ≠ événement (même lecture que le dossier et Laura). */
  signal_freshness?: SignalFreshnessSummary
  /** #3682.5 — la veille automatique réellement configurée ; absent = aucune. */
  watch_cadence?: 'daily' | null
  /** La porte de PRIORITÉ (G1) et le motif de l'écartement. Optionnels : une
   *  projection antérieure ne les porte pas, et un compte sans décision n'a
   *  rien à dire. « Écarté » sans motif est invérifiable six mois plus tard —
   *  et c'est justement à six mois qu'on se demande si la raison tient. */
  priority_gate?: 'pending' | 'prioritised' | 'parked'
  gate_reason?: string | null
  gate_decided_at?: string | null
  /** Qui porte le compte (`accounts.assigned_to`), nommé par l'API. Absent =
   *  API plus ancienne ⇒ aucun badge, jamais un « non attribué » deviné. */
  owner?: { user_id: string; name: string } | null
  /**
   * La classe d'accessibilité (A-D), FUSIONNÉE côté client depuis
   * `GET /accounts/access-summary` (manque B du 30/08) — `GET /accounts` ne la
   * porte pas encore, voir `AccountContent.tsx`. Absent (clé manquante) = pas
   * encore fusionné (résumé en cours de chargement, ou hors de ce flux) ;
   * `null` = fusionné, mais aucune barrière lisible pour ce compte. Les deux
   * s'affichent pareil (« — ») : la nuance ne vaut pas la peine à cette
   * échelle d'un simple coup d'œil de liste, contrairement à l'onglet Accès.
   */
  accessClass?: AccessBarrierClass | null
  /**
   * #3749 — le verdict de la grille de qualification de l'espace, FUSIONNÉ
   * côté client depuis `GET /qualification-grid/accounts-summary` — même
   * mécanisme que `accessClass` juste au-dessus, voir
   * `useQualificationSummary.ts` et `AccountContent.tsx`. Absent (clé
   * manquante) = pas encore fusionné ; `null` = fusionné, mais aucune grille
   * évaluée pour ce compte. Les deux s'affichent pareil (« — »).
   */
  qualificationVerdict?: 'GO' | 'PRUDENT' | 'NO-GO' | null
  /**
   * #2150.14/.18 — l'appelant a-t-il personnellement mis CE compte en
   * favori ? PERSONNEL (jamais l'équipe). Optionnel : une projection
   * antérieure au lot ne le porte pas — absent n'affirme rien.
   */
  is_favorite?: boolean
  /** #2809 (#2293.3) — le SIREN canonique, pour lancer un lot d'analyse
   *  (`POST /analysis-batches`, source `portfolio`) sans ré-résoudre le nom
   *  par recherche. `null`/absent = compte legacy ou non-FR sans SIREN. */
  siren?: string | null
  /**
   * #2265.14 (épopée #2851) — le NAF, tel que le registre le publie. Sert à
   * dériver `isIntermediaryActor` (`@bellum/contracts`) pour le badge
   * « intermédiaire, pas client final », jusqu'ici limité à /discover.
   * Optionnel : une projection antérieure au lot ne le porte pas.
   */
  naf_code?: string | null
  /** #4426.4 — les étiquettes du compte (dont « Tier A/B/C » posé par l'import). Optionnel : projection antérieure. */
  tags?: string[] | null
  /** #2265.5 — partenaire DÉCLARÉ par l'espace (`true`) ou absent ; jamais deviné. */
  is_declared_partner?: boolean
  /**
   * #3407.1 (beta 30/09/2026, #3407) — le niveau d'effort du board
   * (`SprintLevel`, `@bellum/contracts`), jusqu'ici réservé à `?lens=effort`
   * (`SprintBoard`). `null`/absent = aucun niveau posé, jamais un niveau
   * deviné — la ligne ne montre alors aucun badge.
   */
  sprint?: SprintLevel | null
  /** Pourquoi ce compte est à ce niveau (`accounts.sprint_reason`). */
  sprint_reason?: string | null
  /** Prochaine date à laquelle ce classement se rediscute (`YYYY-MM-DD`). */
  sprint_review_at?: string | null
  /** #3407.4 — dernière action tracée (ISO `YYYY-MM-DD`) ; absent = aucune. */
  last_action_at?: string | null
  /** #3407.4 — la première action du plan du compte, et son horizon. */
  next_action_label?: string | null
  next_action_horizon?: string | null
  /** #4584 — « À reprendre » au sens de la bande (prédicat serveur) ; absent = non mesuré. */
  to_resume?: boolean
  /** Refonte Théo — les PERSONNES du compte (nombre, deux visages, présence d'un décideur) ; absent = non lu. */
  people?: { count: number; has_decider: boolean; top: { name: string; is_decider: boolean }[] }
}

type StatusConfig = {
  icon: LucideIcon
  bg: string
  text: string
  ring: string
  /** Solid colour for the small square dot used in tables / facts grid. */
  dot: string
}

export const STATUS_CONFIG: Record<string, StatusConfig> = {
  /** Ajouté au portefeuille depuis Découvrir, JAMAIS analysé. Le seul statut
   *  qui ne décrit pas un run : il dit « ce compte est à vous, il n'a pas
   *  encore de dossier » plutôt que de faire passer un compte vide pour une
   *  analyse ratée. */
  prospect: {
    icon: Briefcase,
    bg: 'bg-violet-500/15',
    // recette 10/09 — `text-violet-300` était une nuance FIXE de la gamme
    // primaire : elle ne peut pas passer AA des deux côtés (arithmétique, pas
    // une question de goût). `--bellum-text-accent` EST la paire clair/sombre
    // déjà choisie pour cette teinte.
    text: 'text-[var(--bellum-text-accent)]',
    ring: 'ring-violet-500/20',
    dot: 'bg-violet-500',
  },
  /** MEYER-IMPORT M.4 — versé par un import de fichier (le CRM d'origine) : à compléter, jamais analysé. Sans
   *  cette entrée, `getStatusConfig` le rangeait sous « Erreur ». */
  imported: {
    icon: FileInput,
    bg: 'bg-violet-500/15',
    text: 'text-[var(--bellum-text-accent)]',
    ring: 'ring-violet-500/20',
    dot: 'bg-violet-500',
  },
  completed: {
    icon: CircleCheck,
    bg: 'bg-emerald-500/15',
    // recette 10/09 (P0 mesuré) — `text-emerald-400` = 1,92:1 sur fond clair,
    // contre 4,5:1 requis (capture zoomée à l'appui, thème clair, pastille
    // « Terminé »). `--success-soft-text` passe AA des deux côtés : c'est le
    // même correctif qu'utilise déjà la pastille voisine « Déjà dans ton CRM ».
    text: 'text-[var(--success-soft-text)]',
    ring: 'ring-emerald-500/20',
    dot: 'bg-emerald-500',
  },
  analyzing: {
    icon: Clock,
    bg: 'bg-amber-500/15',
    // recette 10/09 — couleur SÉMANTIQUE : `--bellum-warning` fait 9,47:1 en
    // sombre et 1,84:1 en clair, donc son texte passe par sa variante
    // `*-soft-text`, jamais la nuance brute.
    text: 'text-[var(--warning-soft-text)]',
    ring: 'ring-amber-500/20',
    dot: 'bg-amber-500',
  },
  error: {
    icon: AlertTriangle,
    bg: 'bg-red-500/15',
    // recette 10/09 — même défaut que `completed` ci-dessus.
    text: 'text-[var(--danger-soft-text)]',
    ring: 'ring-red-500/20',
    dot: 'bg-red-500',
  },
  /** #4941.1 — analyse annulée : sa puce porte SON libellé (`status.canceled`), elle ne se range plus sous « Erreur ». */
  canceled: {
    icon: Ban,
    bg: 'bg-[color-mix(in_srgb,var(--bellum-text-muted)_15%,transparent)]',
    text: 'text-[var(--bellum-text-primary)]',
    ring: 'ring-[color-mix(in_srgb,var(--bellum-text-muted)_20%,transparent)]',
    dot: 'bg-[var(--bellum-text-secondary)]',
  },
  archived: {
    icon: Archive,
    bg: 'bg-[color-mix(in_srgb,var(--bellum-text-muted)_15%,transparent)]',
    text: 'text-[var(--bellum-text-primary)]',
    ring: 'ring-[color-mix(in_srgb,var(--bellum-text-muted)_20%,transparent)]',
    dot: 'bg-[var(--bellum-text-secondary)]',
  },
  deleted: {
    icon: Trash2,
    bg: 'bg-[var(--bellum-border)]/15',
    text: 'text-[var(--bellum-text-muted)]',
    ring: 'ring-[color-mix(in_srgb,var(--bellum-border)_45%,transparent)]',
    dot: 'bg-[var(--bellum-text-muted)]',
  },
}

/**
 * #4526.1 — l'origine CRM est une facette distincte du statut d'analyse : un statut dit où en est l'analyse,
 * l'origine dit d'où vient le compte. `imported` (versé par un import, jamais analysé) reste un statut
 * LISIBLE (pastille de ligne, anciens liens `?status=imported`) mais n'est plus proposé comme valeur du filtre :
 * l'origine se filtre par les puces « Mon CRM » (connecteur) et « Importés » (fichier).
 */
export const ANALYSIS_STATUS_FILTER_VALUES: readonly string[] = Object.keys(STATUS_CONFIG).filter(
  value => value !== 'imported',
)

export function getStatusConfig(status: string): StatusConfig {
  return STATUS_CONFIG[status] ?? STATUS_CONFIG['error']!
}

/** i18n key (ns `accounts`) of an analysis status label — resolve with `t()`.
 *  i18n keys: status.prospect | status.completed | status.analyzing | status.error | status.archived | status.deleted */
export function statusLabelKey(status: string): string {
  return `status.${status in STATUS_CONFIG ? status : 'error'}`
}

// #2627.1 — « trier ... par VERDICT, pas score ». `score` rejoint `name`/`date`
// (même clé que `AccountSortKey` côté contrat/API, `score_asc`/`score_desc` —
// GA-26, un seul vocabulaire de tri).
export type SortField = 'name' | 'date' | 'score'
type SortDirection = 'asc' | 'desc'
export type SortKey = `${SortField}_${SortDirection}`

export function sortKey(field: SortField, dir: SortDirection): SortKey {
  return `${field}_${dir}` as SortKey
}

export function getSortField(key: SortKey): SortField {
  return key.split('_')[0] as SortField
}

export function getSortDirection(key: SortKey): SortDirection {
  return key.split('_')[1] as SortDirection
}

export function toggleSort(field: SortField, current: SortKey): SortKey {
  const currentField = getSortField(current)
  if (currentField !== field) {
    // Premier clic : le sens qui a du sens en premier. `date` veut le plus
    // RÉCENT devant ; `score` veut le meilleur VERDICT devant (GO, pas NO-GO).
    return sortKey(field, field === 'date' || field === 'score' ? 'desc' : 'asc')
  }
  return sortKey(field, getSortDirection(current) === 'asc' ? 'desc' : 'asc')
}

// KEVIN-FIX — `unavailableReason` : le libellé contractuel d'une évaluation indisponible fait 389 px (« … — ZÉRO MESURÉ »,
// qui plus est contraire à la doctrine : non mesuré n'est jamais « 0 »). La liste écrit le texte court des locales et
// dit la RAISON à part ; le libellé contractuel reste celui de la fiche et des exports.
export type Recommendation = { label: string; color: string; unavailableReason: 'no_objective' | null }

// Bands MUST come from the canonical account-score cutoffs (GO >= 7 / PRUDENT
// 5-6 / NO-GO < 5) so the pill colour never contradicts the /25 verdict shown
// on the detail page.
//
// #2932 (constat recette 27/09/2026, salle démo) — le LIBELLÉ, lui, doit être
// le MÊME nom métier que la fiche compte (`AccountVerdictSummary.tsx`,
// `ScoreSummaryCard.tsx`) : `namedAccountVerdict` (`@bellum/contracts`,
// GA-26) plutôt qu'un second libellé écrit ici. La liste n'a pas accès au
// déclencheur NO-GO par ligne (`dossier_read.no_go.trigger`, réservé au
// dossier ouvert) : `hasNoGoTrigger` vaut donc toujours `false`, comme les
// autres écrans de LISTE (`CompareAiSection.tsx`) qui n'ont pas non plus
// cette donnée — jamais un second calcul qui diverge du premier NO-GO.
//
// #3818 — `options.hasObjective` (`useHasOfferObjective`, le MÊME réglage que les quatre fiches
// compte) : sans objectif renseigné, un STOP ne peut pas dire « ÉCARTER POUR CET OBJECTIF ».
export function getRecommendation(score: number | null, options?: { hasObjective?: boolean }): Recommendation {
  const verdict = accountVerdictFromScore(score)
  if (verdict == null) return { label: '—', color: 'var(--text-ghost)', unavailableReason: null }
  const label = namedAccountVerdict(verdict, false, options)
  return {
    label,
    color: accountScoreColor(score),
    unavailableReason: label.startsWith('ÉVALUATION PERSONNALISÉE INDISPONIBLE') ? 'no_objective' : null,
  }
}
