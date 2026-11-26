import { z } from 'zod'

/**
 * LE DUAL TRACK — deux rails de décision, jamais un seul statut (#2413.49 à
 * .57, épopée #2965 — LAU-FINAL-127).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI MANQUAIT
 * ─────────────────────────────────────────────────────────────────────────────
 * `RENEWAL_STATUSES` (`mission.ts`) porte UN statut par mission. Or un
 * renouvellement dépend de DEUX volontés indépendantes — celle du client et
 * celle du consultant — et elles n'avancent pas ensemble : le client peut
 * vouloir poursuivre alors que le consultant a déjà une autre option, ou
 * l'inverse. Un statut unique les confond dans une seule case, et c'est
 * exactement le trou que `git grep -in "clientIntent|consultantIntent"`
 * confirmait vide au 17/09/2026 (registre `.claude/notes/
 * registre-2026-09-17-lau-127-2413.md`).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * QUATRE QUESTIONS PAR RAIL, UNE SEULE RÉPONSE FERMÉE CHACUNE
 * ─────────────────────────────────────────────────────────────────────────────
 * Rail client : veut-il poursuivre ? quel périmètre ? quel budget ? quel
 * processus ? Rail consultant : veut-il poursuivre ? à quelles conditions ?
 * est-il disponible ? a-t-il d'autres options ?
 *
 * Les questions FERMÉES (« veut-il poursuivre », « est-il disponible »)
 * prennent `RENEWAL_RAIL_ANSWERS` — trois valeurs, jamais deux : `non_demande`
 * n'est PAS `non`. Confondre « personne n'a posé la question » avec « la
 * réponse est non » est la même erreur que `null` vs `non_engage` sur
 * `renewal_status` (mission.ts) — et ici l'enjeu est plus grave : elle
 * ferait passer un rail jamais évalué pour un rail négatif, c'est-à-dire
 * inventerait un refus que personne n'a formulé.
 *
 * Les questions OUVERTES (« quel périmètre », « quel budget », « quel
 * processus », « à quelles conditions », « quelles autres options ») restent
 * du texte libre SAISI — jamais déduites, comme `renewal_status` lui-même.
 * Aucune donnée fictive : `null` tant que personne n'a répondu.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * #2413.57 / #2413.67 — LE GARDE-FOU QUE LE DUAL TRACK REND POSSIBLE
 * ─────────────────────────────────────────────────────────────────────────────
 * « Aucune prolongation confirmée si un seul rail positif » et le NO-GO
 * « jamais renouvelée sur un simple oral manager » sont LA MÊME règle, vue de
 * deux côtés : `canConfirmRenewal` (plus bas) exige les DEUX rails à `oui`
 * pour que `renewal_status` puisse valoir `renouvele`. Un commercial qui
 * rapporte un accord oral, seul, ne suffit plus — il faut que les deux
 * questions de poursuite aient été posées ET répondues positivement.
 */
export const RENEWAL_RAIL_ANSWERS = ['non_demande', 'oui', 'non'] as const
export const renewalRailAnswerSchema = z.enum(RENEWAL_RAIL_ANSWERS)
export type RenewalRailAnswer = z.infer<typeof renewalRailAnswerSchema>

const railNoteSchema = z.string().trim().min(1).max(2000).nullable()

/**
 * Le rail CLIENT — #2413.49 à .52.
 *
 * `intent` est la réponse fermée à « veut-il poursuivre ? ». Les trois autres
 * champs sont les réponses ouvertes, saisies une par une, jamais imposées
 * ensemble : un commercial qui n'a que le périmètre n'est pas bloqué faute de
 * budget.
 */
export const renewalClientRailSchema = z
  .object({
    intent: renewalRailAnswerSchema,
    scope: railNoteSchema,
    budget: railNoteSchema,
    process: railNoteSchema,
    updatedAt: z.string().nullable(),
    updatedBy: z.string().guid().nullable(),
  })
  .strict()
export type RenewalClientRail = z.infer<typeof renewalClientRailSchema>

/** Le rail vide — celui de toute mission dont personne n'a encore ouvert
 *  aucune des deux questions. `non_demande`, jamais `non` (GA-19). */
export const EMPTY_RENEWAL_CLIENT_RAIL: RenewalClientRail = {
  intent: 'non_demande',
  scope: null,
  budget: null,
  process: null,
  updatedAt: null,
  updatedBy: null,
}

/**
 * Le rail CONSULTANT — #2413.53 à .56.
 *
 * `availability` est distincte de la disponibilité PLANNING du vivier
 * (`availabilityFrom`, `apps/web/src/features/missions/planning.ts`) : celle-
 * là calcule depuis la date de fin de mission et le statut de renouvellement,
 * pour TOUT le vivier ; celle-ci est la réponse SAISIE à la question posée
 * dans LA conversation de renouvellement de CETTE mission — « veux-tu
 * continuer, et le peux-tu ? ». Les confondre ferait remonter un calcul
 * général comme s'il répondait à une question qu'on n'a pas posée.
 */
export const renewalConsultantRailSchema = z
  .object({
    intent: renewalRailAnswerSchema,
    conditions: railNoteSchema,
    availability: renewalRailAnswerSchema,
    otherOptions: railNoteSchema,
    updatedAt: z.string().nullable(),
    updatedBy: z.string().guid().nullable(),
  })
  .strict()
export type RenewalConsultantRail = z.infer<typeof renewalConsultantRailSchema>

/** Le rail vide — symétrique de {@link EMPTY_RENEWAL_CLIENT_RAIL}. */
export const EMPTY_RENEWAL_CONSULTANT_RAIL: RenewalConsultantRail = {
  intent: 'non_demande',
  conditions: null,
  availability: 'non_demande',
  otherOptions: null,
  updatedAt: null,
  updatedBy: null,
}

/**
 * POSER le rail CLIENT — route à part de `setRenewalStatusRequestSchema`,
 * même raison qu'elle : une DÉCISION commerciale (les quatre réponses du
 * rail) ne se mélange pas au STATUT qu'elle vient étayer.
 *
 * Les trois champs ouverts sont TOUS optionnels : une seule réponse à la
 * fois est le cas ordinaire (le commercial qui n'a que le périmètre
 * aujourd'hui), et `.strict()` refuse tout champ que ce rail ne connaît pas.
 */
export const setRenewalClientRailRequestSchema = z
  .object({
    intent: renewalRailAnswerSchema,
    scope: railNoteSchema,
    budget: railNoteSchema,
    process: railNoteSchema,
  })
  .strict()
export type SetRenewalClientRailRequest = z.infer<typeof setRenewalClientRailRequestSchema>

/** POSER le rail CONSULTANT — symétrique de {@link setRenewalClientRailRequestSchema}. */
export const setRenewalConsultantRailRequestSchema = z
  .object({
    intent: renewalRailAnswerSchema,
    conditions: railNoteSchema,
    availability: renewalRailAnswerSchema,
    otherOptions: railNoteSchema,
  })
  .strict()
export type SetRenewalConsultantRailRequest = z.infer<typeof setRenewalConsultantRailRequestSchema>

/**
 * #2413.57 — LA SEULE QUESTION QUE LE GARDE-FOU POSE : LES DEUX POURSUITES
 * SONT-ELLES CONFIRMÉES ?
 *
 * Ni le périmètre, ni le budget, ni les conditions, ni la disponibilité
 * n'entrent dans ce calcul : ce sont des PRÉCISIONS sur un renouvellement déjà
 * voulu des deux côtés, pas des conditions supplémentaires à sa confirmation.
 * L'exiger aurait bloqué un renouvellement que les deux parties veulent, sur
 * un champ que personne n'a encore rempli.
 *
 * `null` (rail jamais ouvert) se comporte comme `non_demande` : un rail
 * absent n'a, par construction, rien confirmé.
 */
export function canConfirmRenewal(
  client: RenewalClientRail | null | undefined,
  consultant: RenewalConsultantRail | null | undefined,
): boolean {
  return client?.intent === 'oui' && consultant?.intent === 'oui'
}

/**
 * #2413.67 — LE MESSAGE DU NO-GO, quand le geste manuel tente de contourner
 * le garde-fou.
 *
 * Nommé ici, à côté de la règle qu'il explique, pour que l'API et l'écran
 * lisent le MÊME texte plutôt que d'en inventer chacun une paraphrase.
 */
export const RENEWAL_CONFIRMATION_REQUIRES_BOTH_RAILS =
  'Un renouvellement ne se confirme pas sur un accord oral seul : les deux rails (client et consultant) doivent répondre « oui » à la poursuite avant que le statut ne passe à « Renouvelé ».'

export const RENEWAL_CLIENT_QUESTION_KEYS = ['scope', 'budget', 'process'] as const
export type RenewalClientQuestionKey = (typeof RENEWAL_CLIENT_QUESTION_KEYS)[number]

export const RENEWAL_CONSULTANT_QUESTION_KEYS = ['conditions', 'availability', 'otherOptions'] as const
export type RenewalConsultantQuestionKey = (typeof RENEWAL_CONSULTANT_QUESTION_KEYS)[number]

/**
 * #2413.60 (épopée #2965) — « Action : préparer questions ». Pas un artefact
 * SÉPARÉ (le rail EST déjà les questions, il n'y a rien à dupliquer, GA-26) :
 * la liste de celles qui n'ont PAS encore de réponse, dérivée des mêmes
 * champs que le rail lui-même. `scope`/`budget`/`process` sont des réponses
 * OUVERTES (`null` = pas répondu) ; `availability` est FERMÉE et « pas
 * répondu » y vaut `non_demande` — jamais `non`, même règle que partout
 * ailleurs sur ce rail (GA-19).
 */
export function renewalClientOpenQuestions(rail: RenewalClientRail | null | undefined): RenewalClientQuestionKey[] {
  return RENEWAL_CLIENT_QUESTION_KEYS.filter(key => !rail?.[key])
}

/** Symétrique de {@link renewalClientOpenQuestions} pour le rail consultant. */
export function renewalConsultantOpenQuestions(
  rail: RenewalConsultantRail | null | undefined,
): RenewalConsultantQuestionKey[] {
  return RENEWAL_CONSULTANT_QUESTION_KEYS.filter(key =>
    key === 'availability' ? (rail?.availability ?? 'non_demande') === 'non_demande' : !rail?.[key],
  )
}
