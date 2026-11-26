import { z } from 'zod'

/**
 * Sourcing externe de consultants (#2818) — chercher un profil HORS du vivier
 * qualifié, depuis un BESOIN plutôt qu'en parcourant le vivier au hasard.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE FICHIER FERME
 * ─────────────────────────────────────────────────────────────────────────────
 * Sept vérifications indépendantes (24-27/09/2026, voir les commentaires de
 * l'issue #2818) ont conclu « système entier absent » sans jamais coder de
 * première tranche : aucune n'avait de point d'ancrage sans DEVINER la forme
 * d'un « profil externe » — précisément ce que la doctrine interdit
 * (« jamais de structure de donnée décidée sans le produit »). Ce fichier EST
 * la décision produit, prise une fois : un port `ExternalSourcingProvider`
 * (voir `apps/api/src/modules/external-sourcing/external-sourcing-provider.ts`)
 * interroge les sources déjà BRANCHÉES de l'espace — jamais un scraping
 * LinkedIn/Sales Navigator (doctrine c79 : « on collecte LARGEMENT, tant que
 * c'est PROPRE » + « un contrat d'API non vérifiable ne se devine pas »,
 * `agent_docs/doctrine.md`).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TROIS SOURCES, DÉJÀ RÉELLES — AUCUNE INVENTÉE
 * ─────────────────────────────────────────────────────────────────────────────
 *  - `partner_bench` : un consultant du vivier engagé en SOUS-TRAITANCE pour un
 *    partenaire (`consultants.engagement_kind = 'sous_traitance'` ET
 *    `partner_account_id` posé) — le banc d'un partenaire, pas le vôtre.
 *  - `network_referral` : une fiche apportée par le réseau (cooptation,
 *    recommandation…), non encore relue — #2190.3.
 *  - `inbound_candidacy` : une candidature entrante non encore qualifiée
 *    (`consultants.kind = 'candidate'`) — une personne, pas encore le vivier.
 *  - `csv_ats_import` : une fiche née d'un import CSV/ATS/CV, jamais relue
 *    (`consultants.kind = 'consultant'` ET `review_status = 'needs_review'`
 *    ET `source` renseigné) — brute, pas encore le vivier qualifié.
 *
 * Aucune de ces trois ne demande une case DEVINÉE : les trois colonnes citées
 * existent déjà et portent déjà exactement ce sens (voir leurs docblocks sur
 * `ConsultantEntity`). Un vrai fournisseur externe (répertoire public, Sales
 * Navigator…) rejoindrait ce port le jour où son contrat est VÉRIFIABLE ; tant
 * qu'aucun ne l'est, cette catégorie reste `notConnected`, jamais un zéro
 * inventé — voir `EXTERNAL_SOURCING_EXTERNAL_DIRECTORY_KEY`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * AUCUNE PROBABILITÉ, JAMAIS UN SCORE
 * ─────────────────────────────────────────────────────────────────────────────
 * `sharedSkills` nomme les compétences PARTAGÉES avec le besoin — jamais un
 * pourcentage de correspondance ni un rang. Même discipline que
 * `reverse-need-prospects.ts` : une égalité normalisée, jamais une
 * sous-chaîne, jamais un « closing probable ».
 */

/**
 * Combien de pistes une source rend au maximum (#2818, AVANT LANCEMENT —
 * « volume maximal »). Un SEUL endroit (GA-26) : le port
 * (`external-sourcing-provider.ts`) l'importe d'ici plutôt que de le redire,
 * et l'écran l'affiche AVANT le lancement plutôt que de le laisser deviner.
 *
 * Réglage par DÉFAUT — reste la valeur rendue quand aucun volume n'est choisi
 * (#2190.12, lot du 28/09, RESTE devenu réglable : l'écran l'affichait déjà,
 * mais ce n'était pas encore un formulaire éditable). Les bornes ci-dessous
 * cadrent ce qu'un commercial peut choisir, pour la même raison que
 * `EXTERNAL_SOURCING_SOURCE_LIMIT` lui-même : un plafond DIT, jamais deviné.
 */
export const EXTERNAL_SOURCING_SOURCE_LIMIT = 20
export const EXTERNAL_SOURCING_MIN_VOLUME_PER_SOURCE = 5
export const EXTERNAL_SOURCING_MAX_VOLUME_PER_SOURCE = 50

/** La query de la recherche (#2818, GET .../external-sourcing/search) — le
 *  seul critère réglable à ce jour est le volume maximal par source. */
export const externalSourcingSearchQuerySchema = z.object({
  maxPerSource: z.coerce
    .number()
    .int()
    .min(EXTERNAL_SOURCING_MIN_VOLUME_PER_SOURCE)
    .max(EXTERNAL_SOURCING_MAX_VOLUME_PER_SOURCE)
    .optional(),
})

/**
 * Résout le volume par source EFFECTIVEMENT interrogé : le réglage par défaut
 * quand rien n'est choisi, sinon le choix borné aux limites publiées —
 * défense en profondeur, le schéma de la query borne déjà côté requête.
 */
export function resolveExternalSourcingVolume(maxPerSource: number | undefined): number {
  if (maxPerSource === undefined) return EXTERNAL_SOURCING_SOURCE_LIMIT
  return Math.min(
    EXTERNAL_SOURCING_MAX_VOLUME_PER_SOURCE,
    Math.max(EXTERNAL_SOURCING_MIN_VOLUME_PER_SOURCE, Math.trunc(maxPerSource)),
  )
}

/**
 * L'ORDRE est celui des sources de l'écran (#2190.3 : recommandations et réseau
 * d'abord, puis partenaires, puis le reste). `network_referral` (#2190.3, lot
 * P07 30/09) : une fiche que le RÉSEAU a apportée — `consultants.source` dit
 * « cooptation », « recommandation », « parrainage » ou « referral » —, pas
 * encore relue par l'équipe. Un FAIT déjà saisi à la création de la fiche, jamais
 * une structure de réseau devinée.
 */
export const EXTERNAL_SOURCING_SOURCE_KINDS = [
  'network_referral',
  'partner_bench',
  'inbound_candidacy',
  'csv_ats_import',
  /** #2190.5 / #2190.7 — l'annuaire externe branché par clé d'espace ; sans clé,
   *  la source est « non branchée » et n'est jamais interrogée. Le fournisseur
   *  ne se nomme JAMAIS dans cette valeur ni à l'écran. */
  'external_directory',
] as const
export const externalSourcingSourceKindSchema = z.enum(EXTERNAL_SOURCING_SOURCE_KINDS)
export type ExternalSourcingSourceKind = (typeof EXTERNAL_SOURCING_SOURCE_KINDS)[number]

/**
 * L'ORDRE DE RECHERCHE en sept niveaux (#2190.1-.7), la forme unique que l'écran
 * AVANT LANCEMENT affiche (GA-26 : un seul endroit). `before_search` : le niveau
 * est déjà ouvert AVANT cette recherche (le vivier, ses profils dormants) —
 * il n'interroge aucune source ici. `searched` : interrogé par cette recherche.
 * `legal_public_search` n'a pas de source propre : il est servi par l'annuaire
 * externe du niveau « sources connectées » (#2190.7, même fournisseur, jamais un
 * scraping) — pas de second appel, donc aucune source rangée deux fois.
 */
export const EXTERNAL_SOURCING_TIERS = [
  { key: 'internal_pool', scope: 'before_search', sourceKinds: [] },
  { key: 'dormant_profiles', scope: 'before_search', sourceKinds: [] },
  { key: 'network', scope: 'searched', sourceKinds: ['network_referral'] },
  { key: 'authorized_partners', scope: 'searched', sourceKinds: ['partner_bench'] },
  { key: 'connected_sources', scope: 'searched', sourceKinds: ['external_directory'] },
  { key: 'manual_import', scope: 'searched', sourceKinds: ['inbound_candidacy', 'csv_ats_import'] },
  { key: 'legal_public_search', scope: 'searched', sourceKinds: [] },
] as const satisfies readonly {
  key: string
  scope: 'before_search' | 'searched'
  sourceKinds: readonly ExternalSourcingSourceKind[]
}[]

/** Ce qui n'est PAS encore su d'un profil externe — nommé, jamais tu. */
export const EXTERNAL_SOURCING_LIMIT_CODES = [
  /** `network_referral` / `inbound_candidacy` / `csv_ats_import` : personne ne l'a relu. */
  'not_yet_qualified',
  /** `partner_bench` : le partenaire n'a pas confirmé la disponibilité. */
  'partner_availability_unconfirmed',
  /** `external_directory` : la source ne fournit pas de compétences structurées —
   *  seules celles que le poste affiché confirme sont comptées comme partagées. */
  'skills_not_provided',
] as const
export const externalSourcingLimitCodeSchema = z.enum(EXTERNAL_SOURCING_LIMIT_CODES)
export type ExternalSourcingLimitCode = (typeof EXTERNAL_SOURCING_LIMIT_CODES)[number]

/**
 * La clé de capacité d'un répertoire externe dont le contrat n'est pas encore
 * vérifiable (recherche publique, Sales Navigator…). Une seule existe pour
 * l'instant : aucun fournisseur de ce type n'a de contrat vérifié à ce jour,
 * donc `notConnected` la porte TOUJOURS — voir le docblock du fichier.
 */
export const EXTERNAL_SOURCING_EXTERNAL_DIRECTORY_KEY = 'external_directory' as const

export const externalSourcingCandidateSchema = z.object({
  id: z.string(),
  fullName: z.string().nullable(),
  title: z.string().nullable(),
  sourceKind: externalSourcingSourceKindSchema,
  /** Les compétences PARTAGÉES avec le besoin — jamais un score. */
  sharedSkills: z.array(z.string()),
  /** Ce qui n'est pas su de ce profil — jamais un vide muet. */
  limits: z.array(externalSourcingLimitCodeSchema),
})
export type ExternalSourcingCandidate = z.infer<typeof externalSourcingCandidateSchema>

export const EXTERNAL_SOURCING_UNAVAILABLE_REASONS = ['skills_missing'] as const
export const externalSourcingUnavailableReasonSchema = z.enum(EXTERNAL_SOURCING_UNAVAILABLE_REASONS)
export type ExternalSourcingUnavailableReason = (typeof EXTERNAL_SOURCING_UNAVAILABLE_REASONS)[number]

export const externalSourcingSearchResultSchema = z.object({
  needId: z.string(),
  skillTerms: z.array(z.string()),
  /** Le croisement n'a pas pu tourner (compétences absentes du besoin) —
   *  distinct d'une liste vide, qui dit « le croisement a tourné, personne ». */
  unavailableReason: externalSourcingUnavailableReasonSchema.nullable(),
  candidates: z.array(externalSourcingCandidateSchema),
  /** Les catégories dont le contrat n'est pas vérifiable — NOMMÉES, jamais
   *  interrogées. `[]` = toutes les sources connues sont branchées. */
  notConnected: z.array(z.string()),
  /** Les sources BRANCHÉES qui n'ont pas répondu (délai dépassé = « on ne sait
   *  pas », erreur de la source) — NOMMÉES, jamais une liste vide muette. */
  unanswered: z.array(z.string()),
})
export type ExternalSourcingSearchResult = z.infer<typeof externalSourcingSearchResultSchema>

/**
 * L'import d'un profil externe vers le vivier — jamais automatique (doctrine :
 * « un profil externe … n'entre jamais automatiquement dans le Vivier »).
 * `consent` est un LITÉRAL `true` : son absence, ou `false`, refuse la requête
 * plutôt que de l'interpréter — le consentement à recueillir ne se déduit pas.
 */
const externalSourcingImportBaseSchema = z.object({
  consent: z.literal(true),
})

/** Une fiche DÉJÀ dans l'espace (banc partenaire, candidature, import brut,
 *  recommandation) qui rejoint le pool qualifié. */
const externalSourcingImportExistingSchema = externalSourcingImportBaseSchema.extend({
  consultantId: z.string().guid(),
  sourceKind: externalSourcingSourceKindSchema,
})

/** Un profil de l'annuaire externe : il n'existe PAS encore dans l'espace, la
 *  fiche se crée à ce geste — avec ce que le candidat affichait, rien d'autre. */
const externalSourcingImportDirectorySchema = externalSourcingImportBaseSchema.extend({
  sourceKind: z.literal('external_directory'),
  externalProfile: z.object({
    ref: z.string().min(1).max(200),
    fullName: z.string().min(1).max(200),
    title: z.string().max(300).nullable(),
    skills: z.array(z.string().min(1).max(100)).max(50),
  }),
})

export const externalSourcingImportSchema = z.union([
  externalSourcingImportDirectorySchema,
  externalSourcingImportExistingSchema,
])
export type ExternalSourcingImportInput = z.infer<typeof externalSourcingImportSchema>

export const externalSourcingImportResultSchema = z.object({
  consultantId: z.string(),
  /** `false` quand la fiche portait déjà cette origine — un second clic ne
   *  réécrit rien, et le dit plutôt que de laisser croire à un nouvel import. */
  imported: z.boolean(),
})
export type ExternalSourcingImportResult = z.infer<typeof externalSourcingImportResultSchema>

/** La trace d'origine posée sur `consultants.external_sourcing_origin` — d'où
 *  vient la fiche et sur quel besoin, jamais écrasée par un import suivant. */
export const externalSourcingOriginSchema = z.object({
  sourceKind: externalSourcingSourceKindSchema,
  needId: z.string(),
  importedAt: z.string(),
  /** `external_directory` : l'identifiant du profil à la source — rend l'import
   *  idempotent (un second clic ne crée pas une seconde fiche). */
  externalRef: z.string().optional(),
})
export type ExternalSourcingOrigin = z.infer<typeof externalSourcingOriginSchema>

/**
 * Les compétences que le besoin et le candidat PARTAGENT, dans la casse du
 * besoin — jamais un score. Égalité normalisée (casse et espaces ignorés),
 * jamais une sous-chaîne : « Java » ne doit pas matcher « JavaScript ». Même
 * discipline que `sharedSkillTerms` (`reverse-need-prospects.ts`), réécrite
 * ici plutôt que partagée : la forme d'entrée diffère (compétences plates,
 * jamais `{ term }`) et un couplage entre deux capacités sans rapport
 * romprait plus qu'il n'économiserait.
 */
export function sharedExternalSourcingSkills(
  needSkills: readonly string[],
  candidateSkills: readonly string[],
): string[] {
  const candidateSet = new Set(
    candidateSkills.map(skill => skill.trim().toLowerCase()).filter(skill => skill.length > 0),
  )
  const seen = new Set<string>()
  const shared: string[] = []
  for (const term of needSkills) {
    const normalized = term.trim().toLowerCase()
    if (normalized.length === 0 || seen.has(normalized)) continue
    if (candidateSet.has(normalized)) {
      seen.add(normalized)
      shared.push(term.trim())
    }
  }
  return shared
}

/**
 * Les candidats les plus pertinents d'abord : le nombre de compétences
 * partagées, puis le nom (français) pour un ordre stable sur une même donnée.
 * Ne modifie jamais le tableau reçu.
 */
export function rankExternalSourcingCandidates(
  candidates: readonly ExternalSourcingCandidate[],
): ExternalSourcingCandidate[] {
  return [...candidates].sort((a, b) => {
    const bySharedCount = b.sharedSkills.length - a.sharedSkills.length
    if (bySharedCount !== 0) return bySharedCount
    return (a.fullName ?? '').localeCompare(b.fullName ?? '', 'fr')
  })
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * CIRCUIT PARTENAIRE (#2818, PARTENAIRES) — LE BRIEF SE PRÉPARE, IL NE S'ENVOIE PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Doctrine : « le copilote n'envoie jamais d'e-mail : il prépare, le commercial
 * envoie » et « "fait" ne porte jamais de preuve d'envoi ». Il n'existe donc
 * AUCUN statut « envoyé » ici — seulement `preparedAt` (le texte structuré est
 * prêt à être copié/partagé par le commercial) et, plus tard, `feedback`
 * (ce que le partenaire a répondu, saisi par un humain).
 *
 * `partnerName` est un texte LIBRE, comme `consultants.source` : aucun
 * répertoire fermé de partenaires n'existe dans le produit (vérifié sur trois
 * angles différents, 26-27/09/2026, commentaires #2818) — en inventer un ici
 * serait deviner une structure que le produit n'a pas tranchée. `AccountPartner`
 * n'est PAS ce répertoire : il modélise le paysage concurrentiel observé sur un
 * compte CLIENT, un domaine sans recouvrement (même vérification).
 *
 * La clause de non-sollicitation n'est jamais une case à cocher qu'on pourrait
 * oublier : elle est un fait TOUJOURS vrai du brief émis par l'espace, nommé
 * dans le texte composé et sur `nonSolicitation` (littéral `true`).
 */
export const externalSourcingPartnerBriefPrepareSchema = z.object({
  partnerName: z.string().trim().min(1).max(200),
  conditions: z.string().trim().max(2000).optional(),
  delay: z.string().trim().max(200).optional(),
})
export type ExternalSourcingPartnerBriefPrepareInput = z.infer<typeof externalSourcingPartnerBriefPrepareSchema>

export const externalSourcingPartnerBriefFeedbackSchema = z.object({
  feedback: z.string().trim().min(1).max(2000),
})
export type ExternalSourcingPartnerBriefFeedbackInput = z.infer<typeof externalSourcingPartnerBriefFeedbackSchema>

export const externalSourcingPartnerBriefSchema = z.object({
  id: z.string().guid(),
  needId: z.string(),
  partnerName: z.string(),
  /** Le texte structuré composé depuis le besoin RÉEL — voir
   *  {@link buildExternalSourcingPartnerBriefMessage}. */
  message: z.string(),
  conditions: z.string().nullable(),
  delay: z.string().nullable(),
  /** `null` = pas encore de retour — jamais une chaîne vide qui se lirait
   *  comme un feedback recueilli. */
  feedback: z.string().nullable(),
  nonSolicitation: z.literal(true),
  preparedAt: z.string(),
  feedbackRecordedAt: z.string().nullable(),
})
export type ExternalSourcingPartnerBrief = z.infer<typeof externalSourcingPartnerBriefSchema>

/**
 * Le texte du brief — composé UNIQUEMENT depuis ce que le besoin porte déjà
 * (titre, compétences, volume). Aucun champ deviné, aucune coordonnée de
 * partenaire (le commercial partage lui-même, hors produit — même doctrine que
 * l'e-mail que Laura prépare sans jamais l'envoyer).
 */
export function buildExternalSourcingPartnerBriefMessage(input: {
  needTitle: string
  skillTerms: readonly string[]
  headcount: number
}): string {
  const skills = input.skillTerms.length > 0 ? input.skillTerms.join(', ') : 'aucune compétence typée sur ce besoin'
  return [
    `Besoin : ${input.needTitle}`,
    `Compétences recherchées : ${skills}`,
    `Volume : ${input.headcount}`,
    `Clause de non-sollicitation : les profils partagés dans ce brief ne peuvent pas être approchés hors de ce besoin.`,
  ].join('\n')
}
