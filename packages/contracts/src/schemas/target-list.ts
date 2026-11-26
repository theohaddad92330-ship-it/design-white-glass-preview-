import { z } from 'zod'
import { accountFactBriefSchema } from './account-facts.js'

/**
 * #2155.13 à .21 puis #2156.1 à .48 — « Mes cibles » : les listes qu'un
 * commercial veut réellement TRAVAILLER dans une session, une campagne ou une
 * période.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * UNE CIBLE N'EST PAS UNE COPIE (#2155.14 / .15 / .28 — #2156.4)
 * ─────────────────────────────────────────────────────────────────────────────
 * Un élément de cible RÉFÉRENCE un compte ou un contact canonique (`account_id`
 * OU `contact_id`, jamais les deux, jamais aucun) : il ne recopie ni le nom, ni
 * le titre, ni l'entreprise. Le libellé affiché est lu à la volée sur la fiche
 * canonique. Retirer un élément ne touche pas la fiche ; supprimer la fiche
 * retire l'élément.
 *
 * Ce que la cible AJOUTE à la fiche est exactement ce qui n'y a pas sa place :
 * l'objectif de la liste, et pour chaque élément la raison de sa sélection, une
 * priorité, un responsable, un statut de travail, la provenance, la fraîcheur,
 * l'action suivante et des notes propres à CETTE liste.
 *
 * ⚠️ Les énumérations ci-dessous sont gelées (GA-08) : une valeur ne disparaît
 * jamais, un ajout va en fin, et la contrainte SQL s'élargit AVANT le code qui
 * l'écrit (GA-11 / GA-12 — `1794100237841-TargetListsModel`).
 */

/**
 * Le statut de travail d'un élément (#2156.41 à .48). `to_review` est ce qui
 * attend une DÉCISION, et reste le défaut écrit en base.
 *
 * ⚠️ Les cinq premières valeurs sont celles écrites depuis le 14/09/2026 : elles
 * gardent leur place et leur rang. `contacted` ne fait pas partie des huit
 * statuts demandés par #2156, mais des lignes la portent (le jeu de démo
 * compris) — on ne retire pas une valeur écrite, on cesse de la proposer.
 */
export const TARGET_WORK_STATUSES = [
  'to_review',
  'in_progress',
  'contacted',
  'done',
  'dropped',
  'to_enrich',
  'ready_to_contact',
  'replied',
  'to_follow_up',
] as const
export type TargetWorkStatus = (typeof TARGET_WORK_STATUSES)[number]

/**
 * Le parcours tel qu'il se LIT (#2156.41 à .48), qui n'est pas l'ordre
 * d'insertion gelé ci-dessus. Les deux vivent ici et nulle part ailleurs
 * (GA-26) ; `target-list.test.ts` vérifie que ce parcours est une permutation
 * exacte de la taxonomie — aucun statut oublié, aucun inventé.
 */
export const TARGET_WORK_STATUS_FLOW = [
  'to_review',
  'to_enrich',
  'ready_to_contact',
  'contacted',
  'in_progress',
  'replied',
  'to_follow_up',
  'dropped',
  'done',
] as const

/**
 * « Prêt à traiter » (#2156.18) se dérive ICI, une fois. Deux chemins qui
 * referaient ce partage divergeraient — et le compteur de l'écran ne dirait
 * plus la même chose que le filtre de la liste.
 *
 * Un élément prêt à traiter est celui dont la vérification ET l'enrichissement
 * sont derrière lui : `ready_to_contact`, et rien d'autre. « À relancer » est
 * du travail entamé, pas du travail prêt.
 */
export function isTargetItemReadyToWork(status: TargetWorkStatus): boolean {
  return status === 'ready_to_contact'
}

/**
 * D'où vient la sélection de l'élément (#2156.28).
 *
 * `'laura'` (épopée #2853, #2157.1) et `'crm'` (épopée #2853, #2157.7) vont EN
 * FIN (GA-08) — une cible proposée pendant une conversation avec Laura, ou
 * depuis le connecteur CRM branché, jamais confondues avec `'analysis'`
 * (dossier de compte déjà ouvert, #2157.3) : la contrainte SQL
 * `target_list_items_provenance_check` porte déjà ces deux valeurs
 * (migrations `1796321349137-TargetListsLauraSource` et
 * `1796321349281-TargetListsCrmSource`, GA-11/GA-12).
 */
export const TARGET_PROVENANCES = ['manual', 'discover', 'import', 'analysis', 'laura', 'crm'] as const
export type TargetProvenance = (typeof TARGET_PROVENANCES)[number]

/** La priorité posée par le commercial. `null` = pas encore posée, jamais « basse ». */
export const TARGET_PRIORITIES = ['high', 'medium', 'low'] as const
export type TargetPriority = (typeof TARGET_PRIORITIES)[number]

/**
 * #3753 — le TIER de l'ESN : « Tier A / B / C », la lettre de SON ciblage, gardée
 * telle quelle. Ce n'est ni un pourcentage ni une chance (doctrine : aucune
 * probabilité, c26) ; il se projette sur `priority` pour le tri, la lettre reste
 * sur la ligne pour l'affichage. Absence de tier = `null` = aucune ligne affichée.
 */
export const TARGET_TIER_LABELS = ['A', 'B', 'C'] as const
export type TargetTierLabel = (typeof TARGET_TIER_LABELS)[number]

/** #3753.1 — « A », « tier b », « Tier C » → la lettre ; tout le reste → `null` (jamais deviné). */
export function parseTierLabel(raw: unknown): TargetTierLabel | null {
  if (typeof raw !== 'string') return null
  const match = /^\s*(?:tier|niveau)?\s*([abc])\s*$/i.exec(raw)
  return match ? (match[1]!.toUpperCase() as TargetTierLabel) : null
}

/** #3753.1 — A/B/C → high/medium/low. Une seule dérivation (GA-26). */
export function tierToPriority(tier: TargetTierLabel): TargetPriority {
  return tier === 'A' ? 'high' : tier === 'B' ? 'medium' : 'low'
}

/**
 * #3753.3 — les hypothèses du vendeur sur un compte : problématiques qu'il croit
 * adressables, projets IT qu'il attend. FOURNIES par l'ESN, NON VÉRIFIÉES :
 * jamais présentées comme des faits collectés (affichage « selon votre
 * ciblage », injection dans l'analyse sous la même étiquette).
 */
export const sellerHypothesesSchema = z.object({
  addressable_issues: z.string().trim().max(2000).nullable().optional(),
  upcoming_it_projects: z.string().trim().max(2000).nullable().optional(),
})
export type SellerHypotheses = z.infer<typeof sellerHypothesesSchema>

export const TARGET_ITEM_KINDS = ['account', 'contact'] as const
export type TargetItemKind = (typeof TARGET_ITEM_KINDS)[number]

/**
 * Le statut d'une liste (#2156.34 à .40), dans l'ordre du parcours.
 *
 * `archived` est la doctrine « on archive, on ne supprime pas » : une liste
 * terminée puis archivée garde ses éléments, ses motifs de retrait et son
 * histoire. Elle sort des écrans de travail, pas de la base.
 */
export const TARGET_LIST_STATUSES = [
  'draft',
  'to_qualify',
  'ready',
  'in_progress',
  'paused',
  'done',
  'archived',
] as const
export type TargetListStatus = (typeof TARGET_LIST_STATUSES)[number]

/**
 * La visibilité d'une liste (#2156.11). C'est une AUTORISATION, pas un
 * affichage : une liste `private` n'est lisible que par qui l'a créée, y
 * compris pour un autre membre du même espace.
 *
 * Il n'y a délibérément PAS de valeur `team` : le dépôt n'a aucun modèle
 * d'équipe sur lequel fonder une autorisation, et {@link targetListSchema.team}
 * est une étiquette d'organisation (« BU Finance »), pas un groupe de droits.
 * Promettre `team` ici reviendrait à laisser une liste lisible par tout
 * l'espace sous un nom qui dit le contraire.
 */
export const TARGET_LIST_VISIBILITIES = ['workspace', 'private'] as const
export type TargetListVisibility = (typeof TARGET_LIST_VISIBILITIES)[number]

/**
 * D'où vient la LISTE elle-même (#2156.12) — à distinguer de la provenance
 * d'un élément.
 *
 * `'laura'` (épopée #2853, #2157.1) et `'crm'` (épopée #2853, #2157.7) vont EN
 * FIN (GA-08) : la contrainte SQL `target_lists_source_check` porte déjà ces
 * deux valeurs (migrations `1796321349137-TargetListsLauraSource` et
 * `1796321349281-TargetListsCrmSource`, GA-11/GA-12).
 */
export const TARGET_LIST_SOURCES = ['manual', 'discover', 'import', 'analysis', 'saved_search', 'laura', 'crm'] as const
export type TargetListSource = (typeof TARGET_LIST_SOURCES)[number]

/**
 * Ce que la liste contient (#2156.1 à .3 / .8). DÉRIVÉ des éléments, jamais
 * stocké : une liste dont on retire le dernier contact redevient une liste de
 * comptes, et une colonne l'aurait figée.
 */
export const TARGET_LIST_TYPES = ['accounts', 'contacts', 'mixed'] as const
export type TargetListType = (typeof TARGET_LIST_TYPES)[number]

/**
 * Pourquoi un compteur n'a PAS été mesuré (#2156.17 à .19).
 *
 * `portfolio_restricted` n'est pas une hypothèse : quand le cloisonnement de
 * portefeuille masque une partie des comptes d'une liste partagée, ce qu'on
 * compte n'est plus la liste. Annoncer « 3 éléments » à qui n'en voit que 3 sur
 * 11 est un chiffre FAUX, et « 0 prêt à traiter » le serait tout autant.
 */
export const TARGET_COUNT_GAPS = ['items_not_loaded', 'portfolio_restricted'] as const
export type TargetCountGap = (typeof TARGET_COUNT_GAPS)[number]

/**
 * Les trois compteurs d'une liste — mesurés ensemble ou pas du tout.
 *
 * GA-18 / GA-19 : quand rien n'a été mesuré, il n'existe AUCUN champ où écrire
 * un zéro. C'est la seule forme qui empêche un écran d'afficher « 0 prêt à
 * traiter » là où la vraie phrase est « on ne sait pas ».
 */
export const targetListCountsSchema = z.discriminatedUnion('measured', [
  z.object({
    measured: z.literal(true),
    total: z.number().int().min(0),
    ready_to_work: z.number().int().min(0),
    to_review: z.number().int().min(0),
  }),
  z.object({ measured: z.literal(false), gap: z.enum(TARGET_COUNT_GAPS) }),
])
export type TargetListCounts = z.infer<typeof targetListCountsSchema>

export const targetListItemSchema = z.object({
  id: z.string(),
  target_list_id: z.string(),
  /** #2156.23 — la référence canonique : le type de fiche, puis son identifiant. */
  kind: z.enum(TARGET_ITEM_KINDS),
  /** L'identifiant de la fiche CANONIQUE — la route de la fiche se déduit de `kind`. */
  ref_id: z.string(),
  /** Lu sur la fiche canonique. `null` = la fiche n'a pas de nom lisible. */
  label: z.string().nullable(),
  /** L'entreprise d'un contact, lue sur son compte. `null` pour un compte. */
  sublabel: z.string().nullable(),
  /** #2156.24 — pourquoi CETTE fiche est dans CETTE liste. `null` = personne ne l'a écrit. */
  selection_reason: z.string().nullable(),
  priority: z.enum(TARGET_PRIORITIES).nullable(),
  /** #3753.2 — « Tier A/B/C » de l'ESN. `null`/absent = aucun tier, aucune ligne. */
  tier_label: z.enum(TARGET_TIER_LABELS).nullable().optional(),
  /** #3753.3 — hypothèses du vendeur (non vérifiées). `null`/absent = rien fourni. */
  seller_hypotheses: sellerHypothesesSchema.nullable().optional(),
  owner_user_id: z.string().nullable(),
  work_status: z.enum(TARGET_WORK_STATUSES),
  provenance: z.enum(TARGET_PROVENANCES),
  /**
   * #2156.29 — la fraîcheur : quand les données de la fiche ont été revérifiées
   * POUR cette liste. `null` = jamais revérifiée depuis l'ajout, ce qui n'est
   * pas « à jour » : c'est inconnu, et l'écran doit le dire.
   */
  refreshed_at: z.string().nullable(),
  /** #2156.31 — quand l'élément a été retiré. `null` = il est encore dans la liste. */
  removed_at: z.string().nullable(),
  /** #2156.31 — POURQUOI il a été retiré. On archive, on ne supprime pas. */
  removal_reason: z.string().nullable(),
  next_action: z.string().nullable(),
  /** #2156.33 — des notes propres à cette liste, qui ne remontent pas sur la fiche. */
  notes: z.string().nullable(),
  /**
   * #4072.5 — les 3 faits les plus récents du compte (date · TYPE · fait), lus
   * par le lecteur unique des faits du compte. Absent = aucun fait connu :
   * une absence ne fait aucune ligne. Jamais de provenance ni de poids.
   */
  recent_facts: z.array(accountFactBriefSchema).max(3).optional(),
  /** #2156.30 — la date d'ajout à la liste. */
  created_at: z.string(),
  updated_at: z.string(),
})
export type TargetListItem = z.infer<typeof targetListItemSchema>

export const targetListSchema = z.object({
  id: z.string(),
  name: z.string(),
  objective: z.string().nullable(),
  /** #2156.8 — dérivé des éléments encore présents. `null` = liste vide, pas « mixte ». */
  type: z.enum(TARGET_LIST_TYPES).nullable(),
  /** #2156.9 — le responsable de la LISTE. `null` = personne ne l'a prise. */
  owner_user_id: z.string().nullable(),
  /** #2156.10 — l'équipe ou la BU. Une étiquette d'organisation, jamais un droit. */
  team: z.string().nullable(),
  visibility: z.enum(TARGET_LIST_VISIBILITIES),
  source: z.enum(TARGET_LIST_SOURCES),
  /**
   * #2156.13 — la requête ou les filtres qui ont produit la liste, tels quels.
   * `null` = la liste n'est née d'aucune recherche. Le contenu est OPAQUE au
   * contrat : c'est la trace de ce qui a été tapé, pas un filtre rejouable —
   * le jour où on le rejouera, il aura son propre schéma.
   */
  source_query: z.record(z.string(), z.unknown()).nullable(),
  status: z.enum(TARGET_LIST_STATUSES),
  /** #2156.17 à .19 — mesurés ensemble, ou pas du tout. */
  counts: targetListCountsSchema,
  /** #2156.20 — la prochaine action sur la LISTE, distincte de celle d'un élément. */
  next_action: z.string().nullable(),
  /** #2156.21 — la séquence branchée sur la liste, s'il y en a une. */
  sequence_id: z.string().nullable(),
  /** #2156.22 — la session de prospection, s'il y en a une. */
  prospecting_session_id: z.string().nullable(),
  created_by: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  items: z.array(targetListItemSchema),
})
export type TargetList = z.infer<typeof targetListSchema>

export const targetListsResponseSchema = z.object({ lists: z.array(targetListSchema) })
export type TargetListsResponse = z.infer<typeof targetListsResponseSchema>

type CountableItem = Pick<TargetListItem, 'kind' | 'work_status' | 'removed_at'>

/** Un élément RETIRÉ reste en base ; il ne compte plus dans la liste vivante. */
function isLive(item: Pick<TargetListItem, 'removed_at'>): boolean {
  return item.removed_at == null
}

/**
 * #2156.1 à .3 / .8 — ce que contient la liste, dérivé une seule fois (GA-26).
 *
 * `null` pour une liste sans élément vivant : « mixte » affirmerait qu'elle
 * contient les deux, ce qui est faux, et « comptes » choisirait au hasard.
 */
export function deriveTargetListType(
  items: readonly Pick<TargetListItem, 'kind' | 'removed_at'>[],
): TargetListType | null {
  const live = items.filter(isLive)
  if (live.length === 0) return null
  const hasAccount = live.some(item => item.kind === 'account')
  const hasContact = live.some(item => item.kind === 'contact')
  if (hasAccount && hasContact) return 'mixed'
  return hasAccount ? 'accounts' : 'contacts'
}

/**
 * #2156.17 à .19 — les trois compteurs, dérivés une seule fois (GA-26).
 *
 * L'appelant n'appelle cette fonction QUE s'il a vraiment tous les éléments de
 * la liste. Sinon il rend `{ measured: false, gap }` — voir {@link TARGET_COUNT_GAPS}.
 */
export function countTargetListItems(items: readonly CountableItem[]): TargetListCounts {
  const live = items.filter(isLive)
  return {
    measured: true,
    total: live.length,
    ready_to_work: live.filter(item => isTargetItemReadyToWork(item.work_status)).length,
    to_review: live.filter(item => item.work_status === 'to_review').length,
  }
}

const nameField = z.string().trim().min(1).max(120)
const objectiveField = z.string().trim().max(500).nullable()
const nextActionField = z.string().trim().max(300).nullable()
const teamField = z.string().trim().max(120).nullable()
const reasonField = z.string().trim().max(300).nullable()
const notesField = z.string().trim().max(2000).nullable()

export const createTargetListSchema = z.object({
  name: nameField,
  objective: objectiveField.optional(),
  owner_user_id: z.string().guid().nullable().optional(),
  team: teamField.optional(),
  visibility: z.enum(TARGET_LIST_VISIBILITIES).optional(),
  source: z.enum(TARGET_LIST_SOURCES).optional(),
  source_query: z.record(z.string(), z.unknown()).nullable().optional(),
  status: z.enum(TARGET_LIST_STATUSES).optional(),
  next_action: nextActionField.optional(),
  sequence_id: z.string().guid().nullable().optional(),
  prospecting_session_id: z.string().guid().nullable().optional(),
})
export type CreateTargetList = z.infer<typeof createTargetListSchema>

export const updateTargetListSchema = z.object({
  name: nameField.optional(),
  objective: objectiveField.optional(),
  owner_user_id: z.string().guid().nullable().optional(),
  team: teamField.optional(),
  visibility: z.enum(TARGET_LIST_VISIBILITIES).optional(),
  status: z.enum(TARGET_LIST_STATUSES).optional(),
  next_action: nextActionField.optional(),
  sequence_id: z.string().guid().nullable().optional(),
  prospecting_session_id: z.string().guid().nullable().optional(),
})
export type UpdateTargetList = z.infer<typeof updateTargetListSchema>

export const addTargetListItemSchema = z.object({
  kind: z.enum(TARGET_ITEM_KINDS),
  ref_id: z.string().guid(),
  selection_reason: reasonField.optional(),
  priority: z.enum(TARGET_PRIORITIES).nullable().optional(),
  tier_label: z.enum(TARGET_TIER_LABELS).nullable().optional(),
  seller_hypotheses: sellerHypothesesSchema.nullable().optional(),
  owner_user_id: z.string().guid().nullable().optional(),
  work_status: z.enum(TARGET_WORK_STATUSES).optional(),
  provenance: z.enum(TARGET_PROVENANCES).optional(),
  next_action: nextActionField.optional(),
  notes: notesField.optional(),
})
export type AddTargetListItem = z.infer<typeof addTargetListItemSchema>

export const updateTargetListItemSchema = z.object({
  selection_reason: reasonField.optional(),
  priority: z.enum(TARGET_PRIORITIES).nullable().optional(),
  owner_user_id: z.string().guid().nullable().optional(),
  work_status: z.enum(TARGET_WORK_STATUSES).optional(),
  next_action: nextActionField.optional(),
  notes: notesField.optional(),
})
export type UpdateTargetListItem = z.infer<typeof updateTargetListItemSchema>

/**
 * #2156.31 — retirer un élément, c'est poser un motif, pas effacer une ligne.
 *
 * Le seul champ possible est la raison : il n'y a AUCUN chemin d'écriture vers
 * la fiche canonique ici, et c'est ce qui garantit qu'un retrait de liste ne
 * touche jamais le compte ou le contact.
 */
export const removeTargetListItemSchema = z.object({
  reason: reasonField.optional(),
})
export type RemoveTargetListItem = z.infer<typeof removeTargetListItemSchema>

/** Un compte ou un contact DÉJÀ dans l'espace, proposé à l'ajout. Jamais le marché. */
export const targetCandidateSchema = z.object({
  kind: z.enum(TARGET_ITEM_KINDS),
  id: z.string(),
  label: z.string().nullable(),
  sublabel: z.string().nullable(),
})
export type TargetCandidate = z.infer<typeof targetCandidateSchema>

export const targetCandidatesResponseSchema = z.object({ candidates: z.array(targetCandidateSchema) })
export type TargetCandidatesResponse = z.infer<typeof targetCandidatesResponseSchema>
