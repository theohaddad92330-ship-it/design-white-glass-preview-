import { z } from 'zod'
import { CASE_BUYING_MODELS, CASE_ORGANISATIONS, CASE_STRATEGIES } from './case-dimensions.js'

/**
 * La capitalisation : ce qu'on a livré, et ce qu'on peut MONTRER (PDF 2 §12).
 *
 * Le PDF 1 avait nommé `proofStrength` et `isProofUsable` sans les écrire,
 * faute de consommateur. Le §12 est ce consommateur, et il pose la règle qui
 * les justifie en une phrase : « une preuve INTERNE n'apparaît JAMAIS dans un
 * contenu destiné au client ».
 */

/**
 * Ce qui FONDE une preuve, pas ce qu'elle affirme.
 *
 * `measured` : un chiffre, et le client l'a validé. `attested` : le client le
 * dit, sans chiffre. `declared` : nous le disons. Un chiffre qu'on est seul à
 * porter reste une déclaration — c'est une affirmation avec un nombre dedans,
 * et un client le sent.
 */
export const PROOF_STRENGTHS = ['measured', 'attested', 'declared'] as const
export const proofStrengthSchema = z.enum(PROOF_STRENGTHS)
export type ProofStrength = (typeof PROOF_STRENGTHS)[number]

/**
 * Jusqu'où cette preuve peut aller.
 *
 * `internal` est le DÉFAUT, et c'est le pire cas honnête : une preuve dont
 * personne n'a vérifié qu'on peut la citer ne sort pas. L'inverse — tout
 * montrable par défaut — met la responsabilité sur celui qui oublie de cocher.
 */
export const PROOF_SCOPES = ['internal', 'client_safe'] as const
export const proofScopeSchema = z.enum(PROOF_SCOPES)
export type ProofScope = (typeof PROOF_SCOPES)[number]

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * LES CHAMPS DE PREUVE — #2124.49 à .55, décision de Louis du 14/09/2026
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * « Laura les propose, l'humain valide. » Ni saisie manuelle sèche (personne ne
 * remplit cinq champs de plus après une mission), ni import ATS (l'ATS ne sait
 * pas ce qu'on a prouvé).
 *
 * ⚠️ Ce que ce fichier NE FAIT PAS, et ne doit jamais faire : écrire. Le
 * producteur `proposeProofFields` est une fonction PURE — elle prend ce qui est
 * déjà écrit (la mission, le besoin d'origine, le retour de mission) et rend
 * une PROPOSITION. Aucun chemin d'écriture ne part d'un outil du copilote : ce
 * n'est pas une convention, c'est l'absence de code (doctrine « le copilote
 * n'envoie jamais d'e-mail », `WRITE_TOOL_NAMES` côté IA, GA-238 côté web).
 * C'est le clic de validation qui écrit, et lui seul.
 */

/**
 * D'OÙ vient ce que la preuve affirme (#2124.53).
 *
 * Un enregistrement de NOTRE espace, jamais un fournisseur : on ne nomme pas
 * nos fournisseurs, et une preuve ne se fonde de toute façon pas sur eux.
 * `manual` = quelqu'un l'a tapé, ce qui est une source honnête et vérifiable.
 */
export const PROOF_SOURCES = ['mission', 'need', 'rex', 'testimonial', 'manual'] as const
export const proofSourceSchema = z.enum(PROOF_SOURCES)
export type ProofSource = (typeof PROOF_SOURCES)[number]

/**
 * #2424.6 — CE QUE la preuve montre, pas d'où elle vient (`source`, juste
 * au-dessus, garde ce rôle). Un livrable et un chiffre ne se filtrent pas
 * pareil : un client qui demande « une certification » ne veut pas revoir un
 * livrable technique.
 *
 * `null` = pas encore classée (tout l'historique écrit avant ce champ, et
 * toute preuve dont personne n'a pris le temps de trancher) — jamais un
 * type deviné depuis le texte libre de `claim`.
 *
 * Choix tranché sans Louis (#2424.6, doctrine §3c) faute de la liste exacte du
 * document source : les huit valeurs les plus citées dans les usages ESN
 * (livrable produit, résultat chiffré, certification obtenue, méthode/process
 * propriétaire, étude de cas, référence technique, reconnaissance/distinction,
 * logo client) — à corriger si Louis en tient une liste différente.
 */
export const PROOF_CONTENT_TYPES = [
  'livrable',
  'resultat_chiffre',
  'certification',
  'methode',
  'etude_de_cas',
  'reference_technique',
  'reconnaissance',
  'logo_client',
] as const
export const proofContentTypeSchema = z.enum(PROOF_CONTENT_TYPES)
export type ProofContentType = (typeof PROOF_CONTENT_TYPES)[number]

/**
 * #2424.4 — LA RÉFÉRENCE EXTERNE, huit éléments.
 * ─────────────────────────────────────────────────────────────────────────────
 * Cinq tenaient déjà sur `ProofEntity` : autorisation (`citation_allowed`),
 * périmètre (`scope`), formulation (`claim`/`detail`), anonymisation
 * (`anonymised`), chiffres (`result`/`strength`). Trois manquaient : la durée
 * de validité, les canaux autorisés et l'expiration.
 *
 * `allowed_channels` — tranché sans Louis (doctrine §3c) faute de la liste
 * exacte du document source : les canaux les plus cités dans les usages ESN
 * (email, appel/oral, support commercial, site web, étude de cas publiée,
 * réseaux sociaux) — à corriger si Louis en tient une liste différente.
 *
 * `valid_until` et `validity_duration_months` restent DEUX champs distincts,
 * pas une redondance : la durée est ce que le client a ACCORDÉ (« un an »),
 * l'échéance est la DATE qui en découle — une correction humaine peut changer
 * l'une sans l'autre (accord renouvelé sur la même durée, ou raccourci sans
 * changer la durée nominale).
 */
export const PROOF_CHANNELS = [
  'email',
  'oral',
  'support_commercial',
  'site_web',
  'etude_de_cas',
  'reseaux_sociaux',
] as const
export const proofChannelSchema = z.enum(PROOF_CHANNELS)
export type ProofChannel = (typeof PROOF_CHANNELS)[number]

/**
 * Qui a posé la valeur d'un champ.
 *
 * `proposed` : le producteur l'a proposée et un humain l'a validée TELLE
 * QUELLE. `human` : un humain l'a écrite ou corrigée. Les deux sont validés par
 * un humain — rien n'entre en base autrement — et les distinguer garde la
 * primauté humaine lisible : une valeur `human` ne se re-propose jamais.
 */
export const PROOF_FIELD_ORIGINS = ['proposed', 'human'] as const

/** Les champs qu'une validation humaine peut poser (#2124.49 à .53). */
export const PROOF_EVIDENCE_FIELDS = ['claim', 'problem', 'result', 'expertise', 'citation_allowed', 'source'] as const
export type ProofEvidenceField = (typeof PROOF_EVIDENCE_FIELDS)[number]

export const proofFieldProvenanceSchema = z.object({
  origin: z.enum(PROOF_FIELD_ORIGINS),
  /** QUAND la valeur a été validée. La source sans la date vieillit en silence. */
  at: z.string(),
  /** L'enregistrement dont la valeur est tirée, `null` quand elle est tapée. */
  from: proofSourceSchema.nullable(),
})
export type ProofFieldProvenance = z.infer<typeof proofFieldProvenanceSchema>

export const proofFieldProvenanceMapSchema = z.record(z.string(), proofFieldProvenanceSchema)

/**
 * Ce qu'un humain a le droit d'écrire — à la création comme à la validation.
 *
 * Un seul endroit (GA-26) : deux copies de cette forme divergeraient le jour où
 * l'une apprend un champ.
 */
const proofEvidenceFieldsShape = {
  problem: z.string().trim().max(1000).nullish(),
  result: z.string().trim().max(1000).nullish(),
  expertise: z.array(z.string().trim().min(1).max(120)).max(20).optional(),
  citation_allowed: z.boolean().nullish(),
  source: proofSourceSchema.nullish(),
}

/**
 * La validation humaine, champ par champ (#2124.49 à .55).
 *
 * Un champ ABSENT n'est pas touché ; un champ à `null` est effacé
 * volontairement. Les deux se distinguent, sinon valider « je ne sais pas »
 * deviendrait impossible.
 *
 * `kept_from_proposal` nomme les champs que l'humain a validés SANS les
 * modifier : leur provenance garde alors l'enregistrement d'origine plutôt que
 * de prétendre qu'ils ont été tapés.
 */
export const validateProofFieldsSchema = z.object({
  claim: z.string().trim().min(1).max(300).optional(),
  ...proofEvidenceFieldsShape,
  kept_from_proposal: z.array(z.enum(PROOF_EVIDENCE_FIELDS)).max(PROOF_EVIDENCE_FIELDS.length).optional(),
})
export type ValidateProofFields = z.infer<typeof validateProofFieldsSchema>

/**
 * #2124.48-.55 — CE QU'UNE PREUVE MONTRE, ET CE QU'ELLE NE MONTRE PAS ENCORE.
 *
 * Le retour du 14/09/2026 énumère huit champs pour « une preuve réelle » :
 * mission ou contexte · problème · résultat · expertise · autorisation de
 * citation · source · date · version.
 *
 * TROIS étaient déjà là, persistés, et n'étaient lus par aucun écran — c'est le
 * défaut n°1 du dépôt, et ils sont désormais rendus (`TabProofs`) :
 * `mission_id` (le contexte), `scope` (l'autorisation de citation, enfin nommée
 * comme telle) et `created_at` (la date).
 *
 * CINQ n'existent NULLE PART — ni colonne, ni écrivain, ni formulaire — et ils
 * restent RETENUS, faute de pouvoir être livrés honnêtement :
 *
 *  - `problème`, `résultat`, `expertise`, `source` : les ajouter suppose une
 *    migration additive ET un chemin d'écriture. Le formulaire de capitalisation
 *    tient aujourd'hui en une affirmation et des technologies ; y ajouter quatre
 *    saisies libres est une décision d'ergonomie, pas une ligne de schéma. Sans
 *    ce chemin, les quatre colonnes afficheraient « non renseigné » sur 100 %
 *    des preuves : un champ que personne ne peut remplir est pire qu'un champ
 *    absent, parce qu'il fait croire à une donnée manquante plutôt qu'à une
 *    capacité manquante.
 *  - `version` : afficher un numéro de version suppose de VERSIONNER une preuve
 *    — donc d'archiver l'ancienne plutôt que de l'écraser, de faire gagner une
 *    correction humaine sur la version d'avant, et de dire de quand date la
 *    ligne qu'on cite. Un entier figé à 1 que rien n'incrémenterait serait
 *    décoratif, et un décor qui ressemble à une garantie est le pire des deux.
 *
 * Ces cinq-là demandent une décision produit (qui saisit quoi, et quand) avant
 * une ligne de code.
 *
 * ⚠️ Décision prise le même jour (Louis, 14/09/2026) : Laura propose, l'humain
 * valide. Les cinq champs existent désormais — voir « LES CHAMPS DE PREUVE »
 * plus haut (#2124.49 à .55) ; `version` monte d'un cran à chaque validation.
 */
export const proofSchema = z.object({
  id: z.string().guid(),
  account_id: z.string().guid().nullable(),
  mission_id: z.string().guid().nullable(),
  claim: z.string(),
  detail: z.string().nullable(),
  strength: proofStrengthSchema,
  scope: proofScopeSchema,
  sector: z.string().nullable(),
  anonymised: z.boolean(),
  created_at: z.string(),
  /**
   * #1612.1 / #1638.1 — sur quelle(s) techno(s) cette preuve porte.
   *
   * ÉCRITE PAR QUI ? Par la personne qui capitalise la preuve, au moment où
   * elle la déclare — exactement comme `sector` juste au-dessus, que personne
   * n'extrait non plus d'un texte libre. Rien dans le pipeline ne peut deviner
   * qu'une preuve « Migration de 400 To en 6 mois » porte sur Java et AWS :
   * l'inventer serait une extraction non faite, pas un champ.
   *
   * `undefined` sur une API antérieure au champ, jamais un tableau vide
   * confondu avec une déclaration réelle — même discipline que
   * `AccountMarketContext.observed_stack` (`market-memory.ts`) : un champ
   * AJOUTÉ, jamais un champ dont la forme change pendant un déploiement.
   */
  technologies: z.array(z.string().min(1)).optional(),
  /**
   * #2124.49 à .55 — les champs de preuve, PROPOSÉS par Laura puis validés par
   * un humain (décision de Louis du 14/09/2026).
   *
   * Tous `optional()` : des champs AJOUTÉS, jamais des champs dont la forme
   * change pendant un déploiement — un onglet ouvert avant le déploiement lit
   * la même preuve sans eux. Une fois la colonne en base, l'API les rend
   * TOUJOURS, `null` quand la valeur n'a pas été posée. `null` n'est pas `''`
   * et n'est surtout pas « 0 » : l'écran écrit « non mesuré ».
   *
   * `citation_allowed` est une TROISIÈME valeur possible : `null` = personne
   * n'a tranché. Ni « autorisé » ni « refusé » — et c'est le seul champ que le
   * producteur ne propose JAMAIS (voir `proposeProofFields`).
   */
  problem: z.string().nullable().optional(),
  result: z.string().nullable().optional(),
  expertise: z.array(z.string().min(1)).optional(),
  citation_allowed: z.boolean().nullable().optional(),
  source: proofSourceSchema.nullable().optional(),
  /** #2424.6 — CE QUE la preuve montre (livrable, résultat chiffré,
   *  certification…), pas d'où elle vient. `null` = pas encore classée,
   *  `undefined` sur une API antérieure au champ — même discipline que
   *  `source` juste au-dessus. */
  content_type: proofContentTypeSchema.nullable().optional(),
  /** #2424.4 — LA RÉFÉRENCE EXTERNE, les trois éléments qui manquaient (voir le
   *  commentaire de `PROOF_CHANNELS`). Tous `nullable().optional()` : des
   *  champs AJOUTÉS, `null` = pas encore posé. */
  allowed_channels: z.array(proofChannelSchema).optional(),
  validity_duration_months: z.number().int().positive().nullable().optional(),
  valid_until: z.string().nullable().optional(),
  /** Repart à 1, +1 à chaque validation humaine. Une preuve citée en clientèle
   *  doit pouvoir dire QUELLE version a été citée. */
  version: z.number().int().min(1).optional(),
  /** La provenance, CHAMP PAR CHAMP : qui a posé la valeur, quand, et depuis
   *  quel enregistrement. Une preuve entière n'a pas une provenance unique —
   *  son résultat peut venir d'un retour de mission et son problème d'un
   *  besoin. */
  field_provenance: proofFieldProvenanceMapSchema.optional(),
})
export type Proof = z.infer<typeof proofSchema>

export const createProofSchema = z.object({
  claim: z.string().trim().min(1).max(300),
  detail: z.string().trim().max(1000).nullish(),
  account_id: z.string().guid().nullish(),
  mission_id: z.string().guid().nullish(),
  strength: proofStrengthSchema.optional(),
  scope: proofScopeSchema.optional(),
  sector: z.string().trim().max(120).nullish(),
  anonymised: z.boolean().optional(),
  // #1612.1 / #1638.1 — voir le commentaire de `proofSchema.technologies`.
  technologies: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
  // #2424.6 — voir le commentaire de `proofSchema.content_type`.
  content_type: proofContentTypeSchema.nullish(),
  // #2424.4 — voir le commentaire de `PROOF_CHANNELS` et de `proofSchema`.
  allowed_channels: z.array(proofChannelSchema).max(PROOF_CHANNELS.length).optional(),
  validity_duration_months: z.number().int().positive().nullish(),
  valid_until: z.string().nullish(),
  // #2124.49 à .55 — les champs de preuve. Écrits ICI par un humain, jamais
  // par le producteur : c'est la validation qui écrit. `kept_from_proposal`
  // nomme ceux qu'il a validés SANS les modifier — la première validation crée
  // souvent la preuve, et sa provenance doit être aussi vraie que la suivante.
  ...proofEvidenceFieldsShape,
  kept_from_proposal: z.array(z.enum(PROOF_EVIDENCE_FIELDS)).max(PROOF_EVIDENCE_FIELDS.length).optional(),
})
export type CreateProof = z.infer<typeof createProofSchema>

export const rexEntrySchema = z.object({
  id: z.string().guid(),
  mission_id: z.string().guid(),
  account_id: z.string().guid().nullable(),
  summary: z.string(),
  what_worked: z.string().nullable(),
  what_failed: z.string().nullable(),
  // #2424.3 — trois des quinze champs nommés (équipe, compétences,
  // contraintes) : tranche livrée. **Tranché sans Louis (doctrine §3c)** faute
  // de la liste exacte du document source, comme `PROOF_CHANNELS` /
  // `PROOF_CONTENT_TYPES` avant : les douze autres champs nommés (dont le
  // feedback client/consultant SÉPARÉ et les autorisations) restent à
  // trancher avec la liste réelle.
  team: z.string().nullable(),
  skills: z.string().nullable(),
  constraints: z.string().nullable(),
  /**
   * #3210.2 (épopée #3246) — sept des douze champs restants d'un cas validé
   * pour le raisonnement par cas : offre, expertise, voie d'accès, première
   * porte, preuve mobilisée, durée du cycle, partenaire. Les cinq autres
   * (résultat, raisons de succès/échec, limites de transférabilité, type
   * d'entreprise) restent à trancher avec la liste réelle.
   */
  offer: z.string().nullable(),
  expertise: z.string().nullable(),
  access_path: z.string().nullable(),
  first_door: z.string().nullable(),
  proof_used: z.string().nullable(),
  cycle_duration: z.string().nullable(),
  partner: z.string().nullable(),
  /** #3246 (lot W9 + lot cloud 14/10) — vocabulaires FERMÉS, `case-dimensions.ts`. */
  strategy: z.enum(CASE_STRATEGIES).nullable(),
  buying_model: z.enum(CASE_BUYING_MODELS).nullable(),
  organisation: z.enum(CASE_ORGANISATIONS).nullable(),
  collected_at: z.string(),
})
export type RexEntry = z.infer<typeof rexEntrySchema>

export const createRexSchema = z.object({
  mission_id: z.string().guid(),
  account_id: z.string().guid().nullish(),
  summary: z.string().trim().min(1).max(2000),
  what_worked: z.string().trim().max(2000).nullish(),
  what_failed: z.string().trim().max(2000).nullish(),
  team: z.string().trim().max(2000).nullish(),
  skills: z.string().trim().max(2000).nullish(),
  constraints: z.string().trim().max(2000).nullish(),
  offer: z.string().trim().max(2000).nullish(),
  expertise: z.string().trim().max(2000).nullish(),
  access_path: z.string().trim().max(2000).nullish(),
  first_door: z.string().trim().max(2000).nullish(),
  proof_used: z.string().trim().max(2000).nullish(),
  cycle_duration: z.string().trim().max(2000).nullish(),
  partner: z.string().trim().max(2000).nullish(),
  strategy: z.enum(CASE_STRATEGIES).nullish(),
  buying_model: z.enum(CASE_BUYING_MODELS).nullish(),
  organisation: z.enum(CASE_ORGANISATIONS).nullish(),
})
export type CreateRex = z.infer<typeof createRexSchema>

export const testimonialSchema = z.object({
  id: z.string().guid(),
  account_id: z.string().guid().nullable(),
  author_name: z.string().nullable(),
  author_title: z.string().nullable(),
  quote: z.string(),
  consent_reference: z.string().nullable(),
  publishable: z.boolean(),
  created_at: z.string(),
})
export type Testimonial = z.infer<typeof testimonialSchema>

export const createTestimonialSchema = z.object({
  account_id: z.string().guid().nullish(),
  author_name: z.string().trim().max(160).nullish(),
  author_title: z.string().trim().max(160).nullish(),
  quote: z.string().trim().min(1).max(1000),
  consent_reference: z.string().trim().max(300).nullish(),
  publishable: z.boolean().optional(),
})
export type CreateTestimonial = z.infer<typeof createTestimonialSchema>

/** Ce qui fonde une preuve, déduit de ce qu'on en sait. */
export function proofStrength(input: { hasFigure: boolean; hasClientSignoff: boolean }): ProofStrength {
  if (input.hasFigure && input.hasClientSignoff) return 'measured'
  if (input.hasClientSignoff) return 'attested'
  return 'declared'
}

/**
 * Cette preuve peut-elle servir DANS CE CONTEXTE ?
 *
 * Deux refus, et les deux se paient cher :
 *
 *  - une preuve INTERNE dans un contenu client. C'est l'accident central du
 *    §12, et il se règle entre avocats : citer chez un prospect un résultat que
 *    le client d'origine n'a jamais accepté qu'on cite.
 *  - une preuve NOMINATIVE renvoyée au client dont elle parle. Elle ne lui
 *    apprend rien — il était là — et elle lui révèle qu'on cite ses voisins de
 *    la même façon. L'anonymisation lève ce refus, pas le premier.
 */
export function isProofUsable(
  proof: { scope: ProofScope; anonymised: boolean; accountId: string | null },
  context: { audience: 'internal' | 'client'; targetAccountId?: string | null },
): { usable: boolean; reason?: string } {
  if (context.audience === 'internal') return { usable: true }
  if (proof.scope !== 'client_safe') {
    return { usable: false, reason: 'Cette preuve est interne : personne n’a validé qu’on pouvait la citer.' }
  }
  if (!proof.anonymised && proof.accountId && proof.accountId === context.targetAccountId) {
    return {
      usable: false,
      reason: 'Cette preuve parle de ce client lui-même : la lui renvoyer nommément ne lui apprend rien.',
    }
  }
  return { usable: true }
}

/**
 * Ce qui empêche d'enregistrer un témoignage.
 *
 * La seule règle non négociable : PUBLIABLE exige la référence d'un accord
 * écrit. Un témoignage sans trace d'accord est un risque juridique qu'aucune
 * ESN ne veut porter pour gagner une ligne de plaquette.
 */
export function testimonialProblems(input: {
  publishable: boolean
  consentReference: string | null | undefined
  quote: string
}): string[] {
  const problems: string[] = []
  if (input.quote.trim().length === 0) problems.push('Un témoignage sans citation n’est pas un témoignage.')
  if (input.publishable && !(input.consentReference ?? '').trim()) {
    problems.push('Un témoignage publiable exige la référence de l’accord écrit qui l’autorise.')
  }
  return problems
}

/**
 * #1612.1 / #1638.1 — la compatibilité TECHNIQUE OBSERVÉE entre une preuve et
 * l'environnement technique observé d'un compte.
 *
 * Deux issues du 06/09 demandaient la MÊME chose, l'une en « technologies »,
 * l'autre en « compétences » : une seule capacité les ferme toutes les deux,
 * ce champ ne prétendant rien de plus qu'un rapprochement de libellés.
 *
 * ⚠️ Ce que cette fonction NE rend JAMAIS : un pourcentage, un score, un
 * booléen. La doctrine (`c26_probabilite`, GA-259) refuse un taux de
 * compatibilité — « 2 technologies communes » ne veut pas dire « ils font
 * ça », et le complément ne veut pas dire l'inverse. Ce qui sort d'ici est un
 * COMPTE de technologies communes, NOMMÉES, jamais un ratio sur l'une ou
 * l'autre liste.
 *
 * Le statut distingue ce que la doctrine interdit de confondre :
 *  - `unknown`  : l'environnement technique du compte n'est pas connu (compte
 *    non couvert par la mémoire marché, ou API antérieure au champ). On ne
 *    sait pas — on ne dit JAMAIS « incompatible ».
 *  - `not_enough` : l'environnement EST connu (même vide — un corpus qui a
 *    regardé et n'a rien vu est une mesure), mais moins de deux technologies
 *    sont communes. Rien ne s'affiche : sous le seuil, il n'y a rien à dire.
 *  - `observed` : au moins deux technologies communes, nommées.
 *
 * Le rapprochement ignore la casse et les doublons ; la casse rendue est
 * celle de la PREUVE (ce que la personne qui l'a déclarée a tapé).
 */
export const TECHNICAL_COMPATIBILITY_MIN_SHARED = 2

export type TechnicalCompatibility =
  | { kind: 'unknown' }
  | { kind: 'not_enough'; shared: string[] }
  | { kind: 'observed'; shared: string[] }

export function technicalCompatibilityObserved(
  proofTechnologies: readonly string[] | null | undefined,
  observedStack: readonly string[] | null | undefined,
): TechnicalCompatibility {
  // L'environnement n'est pas connu : on le NOMME, on ne le traite jamais
  // comme une liste vide — une liste vide est une mesure, `undefined`/`null`
  // n'en est pas une.
  if (observedStack === null || observedStack === undefined) return { kind: 'unknown' }

  const observedByKey = new Map<string, true>()
  for (const techno of observedStack) {
    const key = techno.trim().toLowerCase()
    if (key) observedByKey.set(key, true)
  }

  const shared: string[] = []
  const seen = new Set<string>()
  for (const techno of proofTechnologies ?? []) {
    const key = techno.trim().toLowerCase()
    if (!key || seen.has(key) || !observedByKey.has(key)) continue
    seen.add(key)
    shared.push(techno.trim())
  }

  if (shared.length >= TECHNICAL_COMPATIBILITY_MIN_SHARED) return { kind: 'observed', shared }
  return { kind: 'not_enough', shared }
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * LE PRODUCTEUR — #2124.49 à .55
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Ce que Laura propose pour une mission, à partir de ce qui est DÉJÀ écrit.
 *
 * ⚠️ Fonction PURE, et c'est le point : elle ne lit pas une base, elle n'écrit
 * nulle part, et elle ne rend RIEN qui ne soit déjà dans son entrée. Un champ
 * qu'aucun enregistrement ne fonde reste `null` — « je ne sais pas » est une
 * réponse, une phrase plausible n'en est pas une (doctrine : jamais de donnée
 * fictive).
 *
 * `citation_allowed` (#2124.52) n'est JAMAIS proposé, et son absence est
 * délibérée : l'autorisation de citer est un fait EXTERNE — un accord du
 * client — que rien dans nos tables ne porte. La deviner, même en « probable »,
 * ferait sortir en clientèle une référence que personne n'a autorisée.
 */
export type ProofFieldsProposal = {
  claim: { value: string; from: ProofSource } | null
  problem: { value: string; from: ProofSource } | null
  result: { value: string; from: ProofSource } | null
  expertise: { value: string[]; from: ProofSource } | null
  /** La source de la preuve ELLE-MÊME (#2124.53) : l'enregistrement le plus
   *  proche de ce qu'elle affirme. */
  source: ProofSource | null
}

export function proposeProofFields(input: {
  mission: { label: string | null; role_title: string | null } | null
  need?: { title: string | null; skills?: readonly string[] } | null
  rex?: { summary: string | null; what_worked: string | null } | null
}): ProofFieldsProposal {
  const label = text(input.mission?.label)
  const role = text(input.mission?.role_title)
  const needTitle = text(input.need?.title)
  const needSkills = (input.need?.skills ?? [])
    .map(skill => text(skill))
    .filter((skill): skill is string => skill !== null)
  // Le RÉSULTAT vient de « ce qui a marché », jamais du résumé du retour : un
  // résumé raconte ce qui s'est passé, et le ranger sous « résultat obtenu »
  // serait une étiquette fausse, pas un remplissage utile.
  const worked = text(input.rex?.what_worked)

  const expertise = dedupe([...(role ? [role] : []), ...needSkills])

  return {
    claim: label ? { value: label, from: 'mission' } : null,
    problem: needTitle ? { value: needTitle, from: 'need' } : null,
    result: worked ? { value: worked, from: 'rex' } : null,
    expertise: expertise.length > 0 ? { value: expertise, from: role ? 'mission' : 'need' } : null,
    source: worked ? 'rex' : label ? 'mission' : null,
  }
}

/**
 * Ce qui RESTE à proposer sur une preuve qui existe déjà.
 *
 * La primauté humaine, tenue par construction : une valeur DÉJÀ posée n'est
 * jamais recouverte par une proposition, quelle que soit la date de l'une ou de
 * l'autre. Une chaîne d'espaces ou une liste vide ne sont pas des valeurs —
 * elles restent proposables, sinon un champ effleuré puis vidé deviendrait
 * définitivement muet.
 */
export function proofFieldsToPropose(
  proposal: ProofFieldsProposal,
  existing: {
    claim?: string | null
    problem?: string | null
    result?: string | null
    expertise?: readonly string[] | null
  },
): ProofFieldsProposal {
  return {
    claim: text(existing.claim) ? null : proposal.claim,
    problem: text(existing.problem) ? null : proposal.problem,
    result: text(existing.result) ? null : proposal.result,
    expertise: (existing.expertise ?? []).some(entry => text(entry)) ? null : proposal.expertise,
    source: proposal.source,
  }
}

function text(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim()
  return trimmed.length > 0 ? trimmed : null
}

function dedupe(values: readonly string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const value of values) {
    const key = value.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(value)
  }
  return out
}
