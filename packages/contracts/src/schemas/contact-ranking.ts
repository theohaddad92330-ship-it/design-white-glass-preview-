import { z } from 'zod'
import { esnTargetLevelSchema } from './esn-target-personas.js'

/**
 * #2120.30-38 — le classement des contacts d'un compte, recalculé CÔTÉ API sur
 * des critères NOMMÉS.
 *
 * Avant : `contact.priority`, un rang entier 1-5 posé UNE fois par le prompt de
 * génération (`bellum_contacts.py`) et trié tel quel à l'écran. Personne ne
 * pouvait dire POURQUOI une personne était en tête, ni voir l'ordre changer quand
 * on change de périmètre, de sujet ou d'offre — le rang ne dépendait de rien de
 * ce que le commercial choisit.
 *
 * La discipline est celle de tous les scores du dépôt :
 *  - un score DÉCOMPOSÉ, chaque axe nommé, jamais une probabilité (c26) ;
 *  - un axe non évaluable (`points: null`) SORT du dénominateur et reste NOMMÉ ;
 *  - sous {@link MIN_RANKING_AXES_FOR_SCORE} axes évalués, il n'y a pas de score ;
 *  - aucun critère protégé (âge, genre, origine, photo, adresse, localisation,
 *    identité) n'entre dans le calcul (c58 — garde `protected-criteria.spec.ts`).
 *
 * Les RAISONS voyagent en CODES, jamais en phrases : un libellé écrit dans un
 * contrat serait français pour toujours. L'écran les traduit.
 */

/** Les neuf axes et leur plafond. Σ(max) = 100. Un seul endroit (GA-26).
 *  ⚠️ #2297.57 — le SCORE ne compte que les axes hors
 *  {@link CONTACT_RANKING_TIE_BREAKER_AXES} : la joignabilité départage, elle ne note pas. */
export const CONTACT_RANKING_AXES = [
  { key: 'perimeter', max: 20 }, // #2120.30
  { key: 'decision_level', max: 15 }, // #2120.31
  { key: 'accessibility', max: 15 }, // #2120.32
  { key: 'subject', max: 15 }, // #2120.33
  { key: 'offer', max: 10 }, // #2120.34
  { key: 'buying_role', max: 5 }, // #2120.35
  { key: 'history', max: 10 }, // #2120.36
  { key: 'relationship', max: 5 }, // #2120.37
  { key: 'relevant_seniority', max: 5 }, // #2120.38
] as const

/**
 * #2297.57 — décision Louis 19/09/2026 : la JOIGNABILITÉ (un e-mail, un
 * téléphone, un profil) est un fait objectif sur une personne, mais elle ne la
 * fait JAMAIS passer devant une autre de rôle plus important. Ces axes restent
 * NOMMÉS sur la ligne (le commercial voit toujours comment joindre la personne)
 * et gardent leur plafond d'affichage ci-dessus, mais ils sortent du score : ils
 * DÉPARTAGENT seulement deux personnes à score égal et au même rôle
 * (`contact-ranking.ts::compare` côté API). Avant, `accessibility` était un axe
 * plafonné à 15 points qui pouvait inverser deux rôles. Un seul endroit (GA-26).
 */
export const CONTACT_RANKING_TIE_BREAKER_AXES = ['accessibility'] as const

/** Sous ce nombre d'axes évalués, pas de score (doctrine « un score n'est jamais nu »). */
export const MIN_RANKING_AXES_FOR_SCORE = 3

/** #2120.13 — le chemin recommandé ne dépasse jamais dix personnes. */
export const RECOMMENDED_PATH_MAX = 10

export const contactRankingAxisKeySchema = z.enum([
  'perimeter',
  'decision_level',
  'accessibility',
  'subject',
  'offer',
  'buying_role',
  'history',
  'relationship',
  'relevant_seniority',
])

/**
 * #2295.2 — les SIX groupes nommés du chemin de contact. Liste FERMÉE, un seul
 * endroit (GA-26) : rien ne la redéclare ailleurs. Un contact ÉLIGIBLE (voir
 * {@link contactEligibilityReasonSchema}) reçoit exactement un de ces groupes ;
 * un contact écarté à la porte n'en reçoit aucun.
 *
 * #2295.4 — `first_door` (première porte) est verrouillé : un contact dont
 * l'email n'est pas VÉRIFIÉ ne peut jamais recevoir ce groupe, quels que
 * soient ses autres axes (`contact-ranking.ts::classifyGroup`).
 *
 * #2295.4bis — décision Louis 18/09/2026 (question 24) : le verrou se lève
 * AUSSI pour un contact de SEMIS de démonstration (`demo_seed_first_door`,
 * `packages/contracts/src/schemas/contact.ts`) — un fait distinct d'une
 * adresse vérifiée, qui n'affirme rien sur une adresse réelle.
 */
export const CONTACT_GROUPS = ['first_door', 'qualifier', 'champion', 'decision_maker', 'buyer', 'relay'] as const

export const contactGroupKeySchema = z.enum(CONTACT_GROUPS)

/**
 * #2295.3 — les raisons NOMMÉES pour lesquelles un contact ne participe pas au
 * classement. L'éligibilité est une PORTE, pas un axe : ce qui échoue ici ne
 * reçoit pas un mauvais score, il ne participe pas au classement — et la
 * raison voyage avec lui (`excluded` sur {@link contactRankingResponseSchema}).
 */
const CONTACT_ORDER_REASONS = ['access_referenced', 'access_to_build'] as const
export const contactOrderReasonSchema = z.enum(CONTACT_ORDER_REASONS)
export type ContactOrderReason = z.infer<typeof contactOrderReasonSchema>

export const contactEligibilityReasonSchema = z.enum([
  /** Écarté par un humain (`excluded_at`/`exclusion_reason`) ou masqué (`hidden`). */
  'permission_denied',
  /** L'entité du contact résout hors du périmètre du compte (bruit / hors secteur). */
  'entity_mismatch',
  /** Deux contacts du même compte partagent le même nom normalisé — non résolu. */
  'homonym_conflict',
  /** #2160.53 — `lifecycle_state==='historique'` (ex-employé, `employerMismatch`) :
   *  un capteur du réseau, pas l'org actuel — jamais recommandé comme actuel. */
  'former_employee',
  /**
   * #2126.50/.56/.58 (épopée #2787) — un outcome `incorrect_contact` a été
   * enregistré sur cette fiche (`commercial-outcome.ts`) : la fiche désigne la
   * mauvaise personne, elle ne doit ni être classée ni être recommandée à
   * nouveau. AJOUTÉE EN FIN (GA-08). Absente de
   * {@link contactRecommendationAuthorizableReasonSchema} à dessein : lever
   * cette porte à la main romprait #2126.60 (un outcome ne se réécrit jamais) —
   * la seule sortie est un NOUVEAU fait, pas une levée de celui-ci.
   */
  'flagged_incorrect_contact',
])

/**
 * #2160.60 — les DEUX SEULES raisons d'éligibilité qu'une correction humaine
 * (« Autoriser la recommandation », sur la fiche contact) peut lever : un
 * doute d'IDENTITÉ, jamais une permission (`permission_denied` — RGPD,
 * opposition, écarté) ni un fait de cycle de vie (`former_employee`). Sous-
 * ensemble volontairement étroit de {@link contactEligibilityReasonSchema} :
 * élargir cette liste, c'est décider qu'une NOUVELLE raison devient
 * overridable — une décision produit, jamais un ajout mécanique.
 */
export const contactRecommendationAuthorizableReasonSchema = z.enum(['homonym_conflict', 'entity_mismatch'])

/** Corps de `POST /contacts/:id/recommendation-authorization` — la raison LEVÉE. */
export const authorizeContactRecommendationSchema = z
  .object({ reason: contactRecommendationAuthorizableReasonSchema })
  .strict()

/**
 * #2295.5 — les HUIT axes stratégiques (vocabulaire produit), dérivés des neuf
 * axes techniques de {@link CONTACT_RANKING_AXES} sans redoubler le calcul
 * (GA-26) : chaque axe stratégique REGROUPE un ou plusieurs axes techniques et
 * en hérite le point/plafond — y compris le « non mesuré sort du dénominateur »
 * quand un composant n'a pas pu être évalué. `components` référence les clés
 * techniques : c'est la preuve, `contact-ranking.ts::deriveStrategicAxes` ne
 * fait qu'agréger, jamais recalculer.
 */
export const CONTACT_STRATEGIC_AXES = [
  { key: 'proximite', components: ['perimeter'] },
  { key: 'accessibilite', components: ['accessibility'] },
  { key: 'role', components: ['buying_role'] },
  { key: 'scope', components: ['subject', 'offer'] },
  { key: 'actualite', components: ['history'] },
  { key: 'relation', components: ['relationship'] },
  { key: 'deblocage', components: ['decision_level'] },
  { key: 'confiance', components: ['relevant_seniority'] },
] as const

export const strategicAxisKeySchema = z.enum([
  'proximite',
  'accessibilite',
  'role',
  'scope',
  'actualite',
  'relation',
  'deblocage',
  'confiance',
])

export const strategicAxisSchema = z.object({
  key: strategicAxisKeySchema,
  /** `null` = tous les axes techniques composants sont non évaluables. */
  points: z.number().nullable(),
  max: z.number(),
  components: z.array(contactRankingAxisKeySchema),
})

export const contactRankingReasonSchema = z.enum([
  // perimeter
  'target_entity',
  'other_entity',
  'entity_unknown',
  'perimeter_p1',
  'perimeter_p2',
  'perimeter_secondary',
  'entity_operating',
  'entity_outside',
  'no_perimeter_context',
  // decision_level — le niveau hiérarchique lu sur l'intitulé
  'level_governance',
  'level_c_level',
  'level_direction',
  'level_management',
  'level_expert',
  'level_operational',
  'level_purchasing',
  'level_unknown',
  // accessibility
  'verified_email',
  'email',
  'phone',
  'professional_profile',
  'searched_nothing_found',
  'never_searched',
  // subject / offer
  'subject_match',
  'subject_no_match',
  'no_subject',
  'offer_match',
  'offer_no_match',
  'no_offer',
  'title_unknown',
  // buying_role
  'purchasing_role',
  'not_purchasing',
  // history
  'exchange_positive',
  'exchange_sent',
  'declined',
  'no_exchange',
  // relationship
  'known_relationship',
  'no_relationship',
  // relevant_seniority
  'senior_relevant',
  'manager_relevant',
  'junior_relevant',
  'seniority_not_relevant',
  'no_topic',
])

export const contactRankingAxisSchema = z.object({
  key: contactRankingAxisKeySchema,
  /** `null` = axe non évaluable : il sort du dénominateur, il ne vaut pas zéro. */
  points: z.number().nullable(),
  max: z.number(),
  reason: contactRankingReasonSchema,
})

/** #2120.22 — un niveau NOMMÉ, jamais un pourcentage nu. */
export const contactRankingConfidenceSchema = z.enum(['high', 'medium', 'low', 'not_measured'])

/**
 * #2120.23 — comment atteindre la personne. `kind: null` n'est jamais deviné :
 * `missing_reason` dit si l'on n'a jamais cherché ou si l'on a cherché sans rien
 * trouver.
 */
export const contactAccessPathSchema = z.object({
  kind: z.enum(['relationship', 'history', 'verified_email', 'email', 'phone', 'professional_profile']).nullable(),
  missing_reason: z.enum(['never_searched', 'searched_nothing_found']).nullable(),
})

/**
 * #2295.8 — les SIX dimensions d'explication PAR CONTACT (LAU-FINAL-036),
 * distinctes de `why_contact` (le texte global du dossier, `Contact.why_contact`) :
 * pourquoi cette personne, pourquoi maintenant, quelle étape elle sert, ce
 * qu'elle débloque, ce qui vient ensuite, et sa LIMITE — ce qu'elle ne peut
 * PAS faire. Codes, jamais une phrase (voir en-tête du fichier) : l'écran
 * traduit.
 *
 * Chaque dimension porte `measured` — même discipline que les axes
 * ({@link contactRankingAxisSchema}) : `false` ne s'invente jamais un
 * contenu, `code` nomme la raison de l'absence (GA-18 / GA-19). La liste des
 * six clés est FERMÉE ({@link CONTACT_EXPLANATION_DIMENSIONS}) : aucune ne
 * disparaît jamais, y compris quand elle n'est pas mesurée.
 *
 * `limit` est la SIXIÈME et la plus importante : sans elle, un relais se lit
 * comme un décideur. Elle est TOUJOURS mesurée (dérivée du groupe déjà
 * attribué, #2295.2 — jamais un critère protégé, c58).
 */
export const CONTACT_EXPLANATION_DIMENSIONS = ['who', 'when', 'stage', 'unlocks', 'next', 'limit'] as const
export const contactExplanationDimensionKeySchema = z.enum(CONTACT_EXPLANATION_DIMENSIONS)

export const contactExplanationReasonSchema = z.enum([
  // who — dérivé du groupe déjà attribué (#2295.2), jamais un critère protégé.
  'who_champion',
  'who_decision_maker',
  'who_buyer',
  'who_first_door',
  'who_relay',
  'who_qualifier',
  // when — le SEUL fait tracé dans l'espace (axe `history`), jamais deviné.
  'when_recent_positive_exchange',
  'when_pending_outreach',
  'when_declined_previously',
  'when_no_recent_signal',
  // stage — l'étape commerciale que sert ce groupe.
  'stage_discovery',
  'stage_qualification',
  'stage_validation',
  'stage_decision',
  'stage_procurement',
  'stage_information',
  // unlocks — non identifié pour qualifier / relay : on ne sait pas ce qu'ils ouvrent.
  'unlocks_internal_access',
  'unlocks_final_decision',
  'unlocks_budget_validation',
  'unlocks_entry_confirmed',
  'unlocks_not_identified',
  // next — le contact SUIVANT du chemin recommandé rendu, jamais un rôle inventé.
  'next_first_door',
  'next_qualifier',
  'next_champion',
  'next_decision_maker',
  'next_buyer',
  'next_relay',
  'next_path_end',
  // limit — TOUJOURS mesurée : ce que ce groupe ne peut pas faire seul.
  'limit_no_decision_power',
  'limit_no_budget_authority',
  'limit_no_authority',
  'limit_not_the_signer',
  'limit_needs_procurement',
  'limit_not_technical_decision',
])

export const contactExplanationDimensionSchema = z.object({
  key: contactExplanationDimensionKeySchema,
  /** `false` = non mesurée : `code` nomme la raison, jamais un contenu inventé. */
  measured: z.boolean(),
  code: contactExplanationReasonSchema,
})

/** Les six dimensions, toujours toutes les six — aucune ne « disparaît » (#2295.8). */
export const contactExplanationSchema = z.object({
  who: contactExplanationDimensionSchema,
  when: contactExplanationDimensionSchema,
  stage: contactExplanationDimensionSchema,
  unlocks: contactExplanationDimensionSchema,
  next: contactExplanationDimensionSchema,
  limit: contactExplanationDimensionSchema,
})

/**
 * #2295.9 — l'anti-recommandation PAR CONTACT : « ne commence pas par… »,
 * visible sur sa ligne du classement — distincte du `anti_advice` au niveau
 * du DOSSIER (`dossierAntiAdviceSchema`, `analysis/dossier-read.ts`).
 * `why` porte EXACTEMENT le code de `explanation.limit.code` : un seul calcul
 * (GA-26), jamais recalculé sous un autre vocabulaire.
 */
export const contactAntiAdviceWhatSchema = z.enum([
  'dont_ask_for_decision',
  'dont_ask_for_budget',
  'dont_treat_as_authority',
  'dont_treat_as_signer',
  'dont_skip_procurement',
  'dont_pitch_technical_choice',
])

export const contactAntiAdviceSchema = z.object({
  what: contactAntiAdviceWhatSchema,
  why: contactExplanationReasonSchema,
})

export const rankedContactSchema = z.object({
  contact_id: z.string(),
  position: z.number().int().min(1),
  /** Points obtenus sur les axes ÉVALUÉS — `null` sous le seuil d'axes. */
  score: z.number().nullable(),
  /** Somme des plafonds des axes évalués — le dénominateur réel. */
  max: z.number().nullable(),
  axes: z.array(contactRankingAxisSchema),
  /** #2295.5 — les huit axes stratégiques, dérivés des neuf ci-dessus. */
  strategic_axes: z.array(strategicAxisSchema),
  /** #2295.2 — le groupe nommé attribué à ce contact ÉLIGIBLE. */
  group: contactGroupKeySchema,
  /** #2295.8 — les six dimensions d'explication distinctes de ce contact. */
  explanation: contactExplanationSchema,
  /** #2295.9 — l'anti-recommandation par CONTACT (jamais seulement le dossier). */
  anti_advice: contactAntiAdviceSchema,
  confidence: contactRankingConfidenceSchema,
  access_path: contactAccessPathSchema,
  /** #2120.25 — le dernier échange tracé DANS L'ESPACE ; `null` = aucun tracé. */
  last_interaction_at: z.string().nullable(),
  /**
   * #3282.19 — la PROCHAINE action planifiée et non faite sur ce contact
   * (`action_plan_items.due_date`, la plus proche). `null` = aucune planifiée ;
   * absent = non lue (instantané d'avant ce déploiement) — jamais une date inventée.
   */
  next_action_due_date: z.string().nullable().optional(),
  /**
   * #4432.4 — la ZONE du profil, nommée sur le contact : en zone, hors zone (lieu connu), ou « lieu absent »
   * (jamais deviné). `null`/absent = le profil ne déclare aucune zone, ou instantané d'avant : rien n'est nommé.
   */
  zone_status: z.enum(['in_zone', 'out_of_zone', 'place_absent']).nullable().optional(),
  /** #4556.4 — le libellé de la zone du profil, pour NOMMER « hors zone (<zone>) ». `null`/absent = aucune zone nommable. */
  zone_label: z.string().nullable().optional(),
  /**
   * #3282 / #3263.18 — la DERNIÈRE action tracée sur ce contact : la plus récente
   * entre le dernier e-mail envoyé (`last_interaction_at`) et le dernier geste du
   * journal (fiche ouverte, message préparé, appel renseigné…). `null` = aucune
   * tracée ; absent = non lue. Un geste n'est jamais un échange vérifié : le
   * libellé dit « dernière action », pas « dernier échange ».
   */
  last_action_at: z.string().nullable().optional(),
  /**
   * #3754.4 — le niveau décideur que L'ESN a donné à ce poste (1 signataire … 4
   * influenceur), quand l'intitulé du contact rapproche l'un de ses postes cibles
   * importés. C'est la RAISON de l'ordre, jamais un score. `null`/absent = aucun
   * rapprochement : aucune ligne à l'écran (on n'affiche pas ce qu'on n'a pas).
   */
  esn_target_level: esnTargetLevelSchema.nullable().optional(),
  /**
   * LOIC-FIX O.3 — pourquoi cette personne a été AVANCÉE devant d'autres par le statut d'accès
   * du compte (#4271) : `access_referenced` (une ESN est déjà référencée : opérationnels et
   * acheteurs d'abord) ou `access_to_build` (accès à bâtir : décideurs et sponsors d'abord).
   * Absent = l'ordre est celui des critères. C'est la RAISON de l'ordre, jamais un score.
   */
  order_reason: contactOrderReasonSchema.optional(),
})

export const contactRankingResponseSchema = z.object({
  ranked: z.array(rankedContactSchema),
  /**
   * #3282 / #3263.19 — la prochaine action planifiée des contacts éligibles HORS du chemin
   * recommandé (`ranked` ne rend que les dix premiers : un siège du comité hors de ce chemin
   * perdait sa date). Seuls les contacts DATÉS y figurent ; absent = non lu.
   */
  scheduled_actions: z.array(z.object({ contact_id: z.string(), next_action_due_date: z.string() })).optional(),
  /** Contacts classables du compte (hors écartés et masqués). */
  total: z.number().int(),
  /** Ceux qui ont atteint le seuil d'axes évalués. */
  scored: z.number().int(),
  /** #2295.3 — les contacts écartés à la PORTE d'éligibilité, avant le rang,
   *  chacun avec sa raison nommée. Un contact d'ici n'apparaît jamais dans `ranked`. */
  excluded: z.array(z.object({ contact_id: z.string(), reason: contactEligibilityReasonSchema })),
  /**
   * Lot 758 (Loïc) — l'acheteur NOMMÉ : la première personne du groupe `buyer` dans l'ordre calculé
   * (tous les éligibles, pas seulement les dix rendus). `null` : aucun acheteur identifié au dossier.
   * Absent : aucun contact classable, ou réponse antérieure.
   */
  procurement_contact_id: z.string().nullable().optional(),
  /**
   * #4984.2 — la taille du compte et le PALIER qui a décidé du niveau hiérarchique cherché (le palier se définit
   * côté API, une seule fois). Absent = effectif inconnu ou réponse d'avant : l'écran ne dit rien, jamais « 0 ».
   */
  account_size: z
    .object({ employees: z.number().int().positive(), tier: z.enum(['small', 'mid', 'large']) })
    .optional(),
  /** #4292.10 — aucun décideur ni sponsor identifié sur le compte : le bloc le DIT. Absent = il y en a un (ou aucun contact). */
  no_decision_maker: z.literal(true).optional(),
  context: z.object({
    perimeter: z.string().nullable(),
    perimeter_source: z.enum(['chosen', 'account', 'none']),
    subject: z.string().nullable(),
    subject_source: z.enum(['chosen', 'account', 'none']),
    offer: z.string().nullable(),
    /** Lot 758 — l'offre qui a jugé l'axe `offer` : choisie, DÉCLARÉE au profil de l'ESN, ou aucune.
     *  Optionnelle : une réponse antérieure ne la porte pas. */
    offer_source: z.enum(['chosen', 'profile', 'none']).optional(),
  }),
})

/**
 * Les trois choix du commercial qui font bouger l'ordre (#2120.30 / .33 / .34).
 * Absents : la cartographie et les angles du compte servent de repère, et une
 * offre non choisie laisse son axe hors du dénominateur.
 */
export const contactRankingQuerySchema = z.object({
  perimeter: z.string().trim().max(200).optional(),
  subject: z.string().trim().max(200).optional(),
  offer: z.string().trim().max(200).optional(),
})

export type ContactRankingQuery = z.infer<typeof contactRankingQuerySchema>
export type ContactRankingAxisKey = z.infer<typeof contactRankingAxisKeySchema>
export type ContactRankingReason = z.infer<typeof contactRankingReasonSchema>
export type ContactRankingAxis = z.infer<typeof contactRankingAxisSchema>
export type ContactRankingConfidence = z.infer<typeof contactRankingConfidenceSchema>
export type ContactAccessPath = z.infer<typeof contactAccessPathSchema>
export type ContactGroupKey = z.infer<typeof contactGroupKeySchema>
export type ContactEligibilityReason = z.infer<typeof contactEligibilityReasonSchema>
export type ContactRecommendationAuthorizableReason = z.infer<typeof contactRecommendationAuthorizableReasonSchema>
export type StrategicAxisKey = z.infer<typeof strategicAxisKeySchema>
export type StrategicAxis = z.infer<typeof strategicAxisSchema>
export type ContactExplanationReason = z.infer<typeof contactExplanationReasonSchema>
export type ContactExplanationDimension = z.infer<typeof contactExplanationDimensionSchema>
export type ContactExplanation = z.infer<typeof contactExplanationSchema>
export type ContactAntiAdviceWhat = z.infer<typeof contactAntiAdviceWhatSchema>
export type ContactAntiAdvice = z.infer<typeof contactAntiAdviceSchema>
export type RankedContact = z.infer<typeof rankedContactSchema>
export type ContactRankingResponse = z.infer<typeof contactRankingResponseSchema>
