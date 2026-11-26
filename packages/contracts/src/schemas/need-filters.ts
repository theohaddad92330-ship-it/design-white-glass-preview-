import type { NeedTheoStatus } from './need-theo-status.js'
import type { OpenNeedsQuery } from './open-needs.js'
import type { ContractKind, NeedSource, NeedUrgency, ProjectNeedStatus } from './project.js'

/**
 * Les filtres de l'écran des besoins — l'état de l'interface, et sa traduction
 * en requête serveur.
 *
 * PUR : mêmes filtres, même requête, testable sans navigateur. C'est ce qui
 * permet de garantir la propriété qui compte — **l'écran ne peut pas composer
 * une requête que le serveur refuserait** — par un test, et non par relecture.
 *
 * Le défaut qu'il ferme (I-34) : le contrat serveur expose DOUZE critères et
 * l'écran n'en câblait que trois. Neuf filtres livrés, testés, et qu'aucune
 * interface n'atteignait — la famille de défauts que ce dépôt paie le plus
 * souvent. La dernière assertion du test compare cette liste au schéma serveur
 * lui-même : un treizième critère ajouté là-bas fera tomber la CI plutôt que de
 * rester inatteignable pendant des mois.
 */
export const NEED_FILTER_KEYS = [
  'q',
  'account_id',
  'skill',
  'seniority',
  'location',
  'urgency',
  'status',
  // Théo C projects-besoins.R3 — l'un des trois statuts affichés.
  'theo_status',
  'contract_kind',
  'starting_within_days',
  'without_shortlist',
  'stale',
  'deadline_passed',
  'include_closed',
  // L'ORIGINE du besoin (§7.2). Ajoutée en FIN : la liste est comparée au
  // schéma serveur par tri, mais l'ordre reste celui d'arrivée pour que le
  // diff d'un ajout se lise en une ligne.
  'source',
  // #2173.15 / #2173.9 / #2173.17 — les vues rapides « Entretiens » et
  // « Perdus / clôturés », et le geste du compteur « À clôturer ».
  'with_interview',
  'ready_to_close',
  'closed_lost_or_cancelled',
  // #2173.49 — la vue « Archivés ». Un rangement, pas un statut : composable
  // avec les autres critères comme `closed_lost_or_cancelled`.
  'archived',
] as const
export type NeedFilterKey = (typeof NEED_FILTER_KEYS)[number]

export type NeedFilters = {
  q: string
  account_id: string
  skill: string
  seniority: string
  location: string
  urgency: NeedUrgency | ''
  status: ProjectNeedStatus | ''
  /** Le statut AFFICHÉ (À qualifier · Ouvert · Couvert) ; `''` = tous. */
  theo_status: NeedTheoStatus | ''
  contract_kind: ContractKind | ''
  /** L'origine du besoin. `''` = « toutes », et non « celles qu'on ne connaît
   *  pas » : un besoin sans origine n'est retenu par aucune des douze valeurs. */
  source: NeedSource | ''
  /** `null` = « je ne filtre pas sur le démarrage ». Jamais `0`, qui voudrait
   *  dire « ceux qui démarrent aujourd'hui » — une tout autre question. */
  starting_within_days: number | null
  without_shortlist: boolean
  /** Théo C projects-besoins.A8 — « Périmé — à revérifier ». */
  stale: boolean
  deadline_passed: boolean
  include_closed: boolean
  with_interview: boolean
  ready_to_close: boolean
  closed_lost_or_cancelled: boolean
  /** La vue « Archivés » (#2173.49). Un rangement, jamais un statut. */
  archived: boolean
}

export function emptyNeedFilters(): NeedFilters {
  return {
    q: '',
    account_id: '',
    skill: '',
    seniority: '',
    location: '',
    urgency: '',
    status: '',
    theo_status: '',
    contract_kind: '',
    source: '',
    starting_within_days: null,
    without_shortlist: false,
    stale: false,
    deadline_passed: false,
    include_closed: false,
    with_interview: false,
    ready_to_close: false,
    closed_lost_or_cancelled: false,
    archived: false,
  }
}

/** Les bornes du serveur, recopiées ici pour REFUSER avant l'appel plutôt que
 *  de récolter un 400 — qui, sur un écran de liste, s'affiche comme un tableau
 *  vide sans la moindre explication. */
const STARTING_WITHIN_MIN = 1
const STARTING_WITHIN_MAX = 365

const trimmed = (value: string): string | undefined => {
  const clean = value.trim()
  return clean.length > 0 ? clean : undefined
}

/**
 * L'état de l'écran → la requête.
 *
 * Un critère vide n'est JAMAIS transmis. `?skill=` remonterait au serveur comme
 * un critère et viderait la liste sans qu'aucun élément de l'écran ne dise
 * pourquoi — un tableau vide se lit « il n'y a rien », pas « tu as filtré ».
 * Même raison pour un booléen à faux : « sans shortlist : non » n'est pas une
 * question, c'est l'absence de question.
 */
export function needFiltersToQuery(filters: NeedFilters, page: { offset: number; limit: number }): OpenNeedsQuery {
  const withinBounds =
    filters.starting_within_days != null &&
    Number.isInteger(filters.starting_within_days) &&
    filters.starting_within_days >= STARTING_WITHIN_MIN &&
    filters.starting_within_days <= STARTING_WITHIN_MAX

  return {
    ...(trimmed(filters.q) ? { q: trimmed(filters.q) } : {}),
    ...(trimmed(filters.account_id) ? { account_id: trimmed(filters.account_id) } : {}),
    ...(trimmed(filters.skill) ? { skill: trimmed(filters.skill) } : {}),
    ...(trimmed(filters.seniority) ? { seniority: trimmed(filters.seniority) } : {}),
    ...(trimmed(filters.location) ? { location: trimmed(filters.location) } : {}),
    ...(filters.urgency ? { urgency: filters.urgency } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.theo_status ? { theo_status: filters.theo_status } : {}),
    ...(filters.contract_kind ? { contract_kind: filters.contract_kind } : {}),
    ...(filters.source ? { source: filters.source } : {}),
    ...(withinBounds ? { starting_within_days: filters.starting_within_days as number } : {}),
    ...(filters.without_shortlist ? { without_shortlist: true } : {}),
    ...(filters.stale ? { stale: true } : {}),
    ...(filters.deadline_passed ? { deadline_passed: true } : {}),
    ...(filters.include_closed ? { include_closed: true } : {}),
    ...(filters.with_interview ? { with_interview: true } : {}),
    ...(filters.ready_to_close ? { ready_to_close: true } : {}),
    ...(filters.closed_lost_or_cancelled ? { closed_lost_or_cancelled: true } : {}),
    ...(filters.archived ? { archived: true } : {}),
    offset: page.offset,
    limit: page.limit,
  } as OpenNeedsQuery
}

/** Combien de critères sont RÉELLEMENT posés — le chiffre du badge du tiroir.
 *  Compté sur la requête produite, jamais sur l'état : une chaîne d'espaces est
 *  un champ rempli à l'écran et n'est pas un critère. */
export function activeNeedFilterCount(filters: NeedFilters): number {
  const query = needFiltersToQuery(filters, { offset: 0, limit: 1 })
  return Object.keys(query).filter(key => key !== 'offset' && key !== 'limit').length
}

/**
 * Ce que la source demande et que le serveur ne sait PAS filtrer.
 *
 * PDF-03 §1.3 décrit un tiroir qui filtrerait aussi sur le tarif, la durée, les
 * langues, les habilitations, l'origine, le canal et le propriétaire. Aucun de
 * ces critères n'existe dans `openNeedsQuerySchema`.
 *
 * On les NOMME plutôt que de livrer les contrôles : une case qui ne filtre rien
 * est la version « tiroir » du bouton qui ne fait rien, et cet écran s'est
 * déjà interdit ce défaut au lot 5 (« un bouton qui ne fait rien est pire
 * qu'un chiffre »). Les taire serait pire encore — six mois plus tard, personne
 * ne saurait dire si c'est un oubli ou un choix.
 */
export const NEED_FILTERS_UNAVAILABLE: readonly { key: string; reason: string }[] = [
  {
    // ⚠️ « sous droit financier » a été retiré le 29/08/2026 : la doctrine dit
    // l'inverse (`c54_tarif_cible`, « le tarif CIBLE est PUBLIC, il se saisit et
    // se lit sans `finance:read` »), et `sales` ne porte pas ce droit. Poser une
    // condition financière sur le TJM cible d'un besoin retirerait la colonne au
    // recruteur qui négocie avec.
    key: 'tjm_min_max',
    reason: 'le serveur ne filtre pas sur le tarif cible ; il le REND, colonne par colonne',
  },
  { key: 'duration_months', reason: 'la durée est rendue sur la ligne, aucun critère ne la borne côté serveur' },
  // ⚠️ Les deux raisons ci-dessous étaient FAUSSES, et l'erreur coûtait cher :
  // elles disaient que les langues et les habilitations appartenaient au
  // CONSULTANT. Le besoin en porte depuis le chantier de rapprochement
  // (`projectNeedSchema.languages` / `.clearances`, colonnes `project_needs`), et
  // ce sont EUX que les axes 6 et 12 comparent — l'axe 12 étant BLOQUANT. Écrite
  // ainsi, la raison expliquait l'absence du filtre par un fait inexistant, ce
  // qui interdisait de voir que rien ne les saisissait. Elles se saisissent
  // depuis le 29/08 sur la fiche du besoin ; seul le FILTRE serveur manque.
  {
    key: 'languages',
    reason:
      'le besoin porte ses langues exigées et la fiche les saisit ; aucun critère serveur ne les filtre encore — le rapprochement, lui, les compare (axe 6)',
  },
  {
    key: 'clearances',
    reason:
      'même chose pour les habilitations : elles se saisissent sur la fiche et BLOQUENT un rapprochement (axe 12), mais aucun critère serveur ne trie la liste dessus',
  },
  {
    key: 'origin',
    reason:
      "l'origine COMMERCIALE (entrant / sortant / appel d'offres / apport) n'est pas un champ du besoin — à ne pas confondre avec `source`, qui dit par quel CHEMIN la ligne est entrée (offre d'emploi, e-mail client, import…) et qui, lui, se filtre depuis le 27/08/2026",
  },
  { key: 'channel', reason: 'le canal est saisi sur la MISSION, après la signature — un besoin n’en porte pas' },
  { key: 'owner_id', reason: 'le besoin porte un propriétaire, mais aucun critère serveur ne le filtre' },
  {
    key: 'location_radius',
    reason: 'la localisation se filtre par libellé ; aucun rayon, donc aucune distance calculée',
  },
] as const
