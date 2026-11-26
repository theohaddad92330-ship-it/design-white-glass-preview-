import { z } from 'zod'
import { createProjectNeedSchema } from './project.js'

/**
 * RFP/RFQ Studio (addendum final p66-68).
 *
 * Un appel d'offres arrive en trois pièces — un cahier des charges, une grille
 * d'exigences, un bordereau — et ressort en une réponse dont chaque ligne doit
 * être défendable. Entre les deux, le travail réel n'est pas de « rédiger » :
 * c'est de savoir QUI répond à QUOI, sur quelle preuve, et s'il faut y aller.
 *
 * Trois convictions structurent ce contrat :
 *
 * 1. **Le bid/no-bid vient avant la rédaction.** Le rapport le place en deuxième
 *    étape (p66) et c'est l'ordre qui compte : rédiger d'abord, décider ensuite,
 *    c'est ce qui fait répondre à des appels d'offres perdus d'avance.
 * 2. **Une réponse sans source approuvée n'est pas une réponse.** Elle est « à
 *    produire », avec un propriétaire nommé. Laisser un modèle combler le vide
 *    produirait un engagement contractuel inventé — la pire des données fictives.
 * 3. **Une exigence ambiguë se dit ambiguë.** Le rapport demande de séparer
 *    obligatoire, souhaitable, informatif et AMBIGU (p67). Trancher une ambiguïté
 *    à la place du client est la façon la plus courante de perdre un lot.
 */

// ── Intake (p66) ─────────────────────────────────────────────────────────────

/** Formats acceptés à l'intake. `pasted` = le commercial colle le texte. */
export const rfpSourceFormatSchema = z.enum(['pdf', 'docx', 'xlsx', 'text', 'pasted'])
export type RfpSourceFormat = z.infer<typeof rfpSourceFormatSchema>

export const rfpStatusSchema = z.enum([
  /** Importé, pas encore analysé. */
  'intake',
  /** Exigences extraites, décision pas encore prise. */
  'analysed',
  /** On y va. */
  'bid',
  /** On n'y va pas — avec sa raison, qui sert la prochaine fois. */
  'no_bid',
  /** Réponse envoyée. */
  'submitted',
  'won',
  'lost',
])
export type RfpStatus = z.infer<typeof rfpStatusSchema>

// ── Exigences (p67) ──────────────────────────────────────────────────────────

/**
 * Le poids d'une exigence.
 *
 * `ambiguous` n'est pas une catégorie de repli : c'est une catégorie de PLEIN
 * DROIT. Une exigence qu'on ne sait pas classer doit remonter comme telle et
 * devenir une question au client, pas une hypothèse silencieuse.
 */
export const rfpRequirementWeightSchema = z.enum(['mandatory', 'desirable', 'informative', 'ambiguous'])
export type RfpRequirementWeight = z.infer<typeof rfpRequirementWeightSchema>

/** La nature d'une exigence — elle décide de QUI répond (p66 « owners »). */
export const rfpRequirementKindSchema = z.enum([
  'technical',
  'security',
  'delivery',
  'financial',
  'contractual',
  'csr',
  'team',
  'other',
])
export type RfpRequirementKind = z.infer<typeof rfpRequirementKindSchema>

/**
 * Qui doit répondre. Un rôle, pas une personne : l'assignation nominative
 * appartient à l'espace de travail, la nature de l'exigence appartient au
 * document.
 */
export const rfpOwnerRoleSchema = z.enum(['sales', 'expert', 'hr', 'legal', 'security', 'finance'])
export type RfpOwnerRole = z.infer<typeof rfpOwnerRoleSchema>

/**
 * L'état d'une réponse.
 *
 * `to_produce` est l'état par DÉFAUT et le plus important : il dit qu'il manque
 * quelque chose et à qui. Le rapport est explicite (p68) : « si aucune réponse
 * fiable n'existe, marque à produire et assigne le bon owner ».
 *
 * #2957 (#2181.19/.20/.22/.23) — le registre `STATUTS` du studio de réponse
 * (#2181) en nomme sept ; `to_complete`/`to_validate`/`blocked`/
 * `not_applicable` complètent les quatre qui existaient déjà. Aucun des
 * quatre ne change `computeRfpCompliance` : comme `to_produce`/`drafted`/
 * `reused`, ce sont des états NON validés — seul `validated` sort une
 * obligatoire du décompte des manques.
 */
export const rfpAnswerStatusSchema = z.enum([
  'to_produce',
  'reused',
  'drafted',
  /** À compléter — une réponse existe déjà, mais partielle. */
  'to_complete',
  /** À valider — rédigée, en attente d'une relecture avant `validated`. */
  'to_validate',
  /** Bloqué — ne peut pas avancer sans une décision ou une information externe. */
  'blocked',
  /** Non applicable — l'exigence ne concerne pas cette offre. */
  'not_applicable',
  'validated',
])
export type RfpAnswerStatus = z.infer<typeof rfpAnswerStatusSchema>

/**
 * #2957 (#2181.15) — un commentaire d'équipe sur UNE exigence. L'auteur et la
 * date sont posés par le SERVEUR, jamais par le client.
 */
export const rfpRequirementCommentSchema = z.object({
  id: z.string().guid(),
  author_id: z.string().guid(),
  body: z.string().min(1).max(2000),
  created_at: z.string().datetime(),
})
export type RfpRequirementComment = z.infer<typeof rfpRequirementCommentSchema>

/** Body of `POST /rfp/:id/requirements/:requirementId/comments`. */
export const addRfpRequirementCommentSchema = z.object({ body: z.string().trim().min(1).max(2000) })
export type AddRfpRequirementComment = z.infer<typeof addRfpRequirementCommentSchema>

/**
 * #2957 (#2181.16) — une version ANTÉRIEURE de la réponse à une exigence :
 * ce qu'elle disait avant d'être réécrite (à la main ou par « Rédiger »).
 * On archive, on ne supprime pas — la réponse remplacée reste lisible.
 */
export const rfpAnswerVersionSchema = z.object({
  answer_text: z.string().max(20_000),
  answer_status: z.string().max(40),
  answer_source: z.string().max(500).nullable(),
  replaced_at: z.string().datetime(),
  replaced_by: z.string().guid().nullable(),
})
export type RfpAnswerVersion = z.infer<typeof rfpAnswerVersionSchema>

/** Les versions gardées par exigence — les plus RÉCENTES ; au-delà, la plus
 *  ancienne sort de la liste (le document garde une taille bornée). */
export const RFP_ANSWER_VERSIONS_MAX = 20

/**
 * #2181.16 — la réponse `next` remplace `previous` : si le TEXTE de la réponse
 * change et qu'il en existait un, l'ancien texte entre dans `versions` (la plus
 * récente en tête). Rien d'autre ne crée de version — changer un rôle ou un
 * statut ne réécrit pas la réponse.
 */
export function withAnswerVersion<
  T extends {
    answer_text: string | null
    answer_status: string
    answer_source: string | null
    versions?: RfpAnswerVersion[]
  },
>(previous: T, next: T, by: string | null, at: Date): T {
  const before = previous.answer_text?.trim() ? previous.answer_text : null
  if (!before || before === next.answer_text) return next
  const version: RfpAnswerVersion = {
    answer_text: before,
    answer_status: previous.answer_status,
    answer_source: previous.answer_source,
    replaced_at: at.toISOString(),
    replaced_by: by,
  }
  return { ...next, versions: [version, ...(previous.versions ?? [])].slice(0, RFP_ANSWER_VERSIONS_MAX) }
}

export const rfpRequirementSchema = z.object({
  id: z.string().guid(),
  rfp_id: z.string().guid(),
  /** Section d'origine dans le document — la traçabilité de l'extraction. */
  section: z.string().max(300).nullable(),
  text: z.string().min(1).max(4000),
  weight: rfpRequirementWeightSchema,
  kind: rfpRequirementKindSchema,
  owner_role: rfpOwnerRoleSchema,
  answer_status: rfpAnswerStatusSchema,
  /** D'où vient la réponse : référence, expert, politique, contrat, preuve.
   *  `null` tant que rien n'est rattaché — jamais une source inventée. */
  answer_source: z.string().max(500).nullable(),
  answer_text: z.string().max(20_000).nullable(),
  /** Ce qui peut coincer sur cette exigence précise. */
  risk: z.string().max(1000).nullable(),
  /**
   * #2180.27 — le DOCUMENT qui a produit cette exigence, quand l'import en
   * regroupe plusieurs (#2180.2, #2180.4). `null` en mono-document : rien à
   * distinguer, comme avant. Jamais deviné — posé par l'import, jamais
   * reconstitué après coup.
   */
  source_document: z.string().max(300).nullable(),
  /**
   * #2957 (#2181.10) — le TEXTE de la preuve elle-même (l'extrait de
   * politique, la clause du contrat-cadre, le passage du CV), distinct
   * d'`answer_source` (LA RÉFÉRENCE — quel document, quel expert). Une
   * réponse peut nommer sa source sans jamais avoir cité la preuve : c'est
   * précisément ce que #2181 (« INTERDIT : remplir une preuve avec un texte
   * marketing générique ») demande de pouvoir distinguer. `null` tant que
   * rien n'est cité — jamais un texte de remplissage.
   */
  evidence: z.string().max(4000).nullable().optional(),
  /**
   * #2957 (#2181.14) — la confiance de la personne (ou de Laura) qui répond
   * dans SA PROPRE réponse — jamais une probabilité de résultat commercial
   * (doctrine c26_probabilite, `CLAUDE.md`). Mêmes trois paliers que
   * `rfpExtractionConfidenceSchema` (la confiance du MODÈLE dans sa lecture),
   * un concept voisin mais distinct : celui-ci porte sur la RÉPONSE rédigée,
   * pas sur l'extraction d'un fait du document. `null` = non évaluée, jamais
   * un palier par défaut fabriqué.
   */
  confidence: z.enum(['high', 'medium', 'low']).nullable().optional(),
  /** #2957 (#2181.15) — les commentaires d'équipe, du plus ancien au plus récent. */
  comments: z.array(rfpRequirementCommentSchema).optional(),
  /** #2957 (#2181.16) — les réponses remplacées, la plus récente en tête. */
  versions: z.array(rfpAnswerVersionSchema).optional(),
})
export type RfpRequirement = z.infer<typeof rfpRequirementSchema>

// ── Extraction document (#2957, #2180.9-.26) ────────────────────────────────

/**
 * #2957 (#2180.28/.30/.31) — l'état d'un champ extrait.
 *
 * `contradiction` reste dans l'énumération pour la garder LISIBLE par un
 * consommateur futur, mais rien ne le produit aujourd'hui : chaque document
 * est analysé SÉPARÉMENT (`RfpService.analyse`), et une contradiction réelle
 * suppose de comparer deux lectures — un chantier distinct, non commencé
 * (#2180.34/.35, cité comme « reste » dans l'épopée). Fabriquer ce statut sans
 * comparaison réelle serait la donnée fictive que ce dépôt refuse.
 */
export const rfpExtractionStatusSchema = z.enum(['found', 'to_verify', 'not_found', 'contradiction'])
export type RfpExtractionStatus = z.infer<typeof rfpExtractionStatusSchema>

/** La confiance du MODÈLE dans SA propre lecture — jamais une probabilité de
 *  résultat commercial (doctrine, `c26_probabilite`). `null` = non évaluée. */
export const rfpExtractionConfidenceSchema = z.enum(['high', 'medium', 'low'])
export type RfpExtractionConfidence = z.infer<typeof rfpExtractionConfidenceSchema>

/**
 * UN champ extrait, avec sa provenance (#2180.27/.28/.30/.31) : le document
 * source, la page, la confiance du modèle, et son statut. `value` porte le
 * texte SOURCE (jamais reformulé) ; `null` seulement quand `status` n'est pas
 * `found` — jamais une valeur devinée pour combler un champ vide.
 */
export const rfpExtractedFieldSchema = z.object({
  value: z.string().max(4000).nullable(),
  /** Le document qui a produit CETTE valeur — `null` en mono-document (rien à
   *  distinguer), comme `RfpRequirement.source_document`. */
  source_document: z.string().max(300).nullable(),
  /** La page ou la section où la valeur a été lue, telle que citée par le
   *  modèle — jamais un numéro de page reconstitué. */
  page: z.string().max(100).nullable(),
  confidence: rfpExtractionConfidenceSchema.nullable(),
  status: rfpExtractionStatusSchema,
})
export type RfpExtractedField = z.infer<typeof rfpExtractedFieldSchema>

/**
 * #2957 — les DOUZE catégories de champs document que l'épopée #2957 nomme
 * (#2180.9/.13/.14/.17-.19/.21-.26). C'est une structure de DOSSIER, distincte
 * de `requirements[]` (une ligne de conformité par exigence) : une entité
 * juridique ou un calendrier n'est pas une exigence, c'est un FAIT sur le
 * dossier. `reference` (#2180.39, numéro de consultation) n'y figure pas :
 * aucun champ ne l'extrait encore, cité comme « reste » sur l'épopée.
 */
export const RFP_EXTRACTION_CATEGORIES = [
  'legal_entity',
  'calendar',
  'qa',
  'scoring_criteria',
  'requested_documents',
  'requested_profiles',
  'volumes',
  'pricing',
  'contractual_terms',
  'security_compliance',
  'contacts',
  'submission_format',
] as const
export type RfpExtractionCategory = (typeof RFP_EXTRACTION_CATEGORIES)[number]

/**
 * L'extraction document complète : une clé par catégorie (#2957). Chaque
 * catégorie est OPTIONNELLE — un dossier importé avant ce chantier n'a aucune
 * de ces clés, une absence lue comme « non extrait », jamais recalculée après
 * coup (un fait périmé redevient inconnu, il ne se réécrit pas tout seul).
 */
export const rfpDocumentExtractionSchema = z.object(
  Object.fromEntries(
    RFP_EXTRACTION_CATEGORIES.map(category => [category, rfpExtractedFieldSchema.optional()]),
  ) as Record<RfpExtractionCategory, z.ZodOptional<typeof rfpExtractedFieldSchema>>,
)
export type RfpDocumentExtraction = z.infer<typeof rfpDocumentExtractionSchema>

// ── Décision bid / no-bid (p67) ──────────────────────────────────────────────

export const bidVerdictSchema = z.enum(['bid', 'no_bid', 'conditional'])
export type BidVerdict = z.infer<typeof bidVerdictSchema>

/**
 * La décision, avec ce qui la fonde.
 *
 * Un `no_bid` sans raison réutilisable est une décision perdue : la prochaine
 * fois, personne ne saura pourquoi on avait renoncé. D'où `rationale` obligatoire
 * et `conditions` séparé — un « oui si » n'est pas un « oui ».
 */
export const bidDecisionSchema = z.object({
  verdict: bidVerdictSchema,
  rationale: z.string().min(1).max(4000),
  /** Adéquation de l'offre au besoin exprimé, 0-100. */
  fit: z.number().int().min(0).max(100).nullable(),
  /** Capacité réelle à livrer (profils disponibles), 0-100. */
  capacity: z.number().int().min(0).max(100).nullable(),
  /** Ce qui doit être vrai pour que le « oui » tienne. */
  conditions: z.array(z.string().max(500)).default([]),
  /** Les questions à poser au client AVANT de répondre. */
  questions: z.array(z.string().max(500)).default([]),
  /** Signaux d'alerte : délai intenable, exigence disqualifiante, titulaire en place. */
  redFlags: z.array(z.string().max(500)).default([]),
})
export type BidDecision = z.infer<typeof bidDecisionSchema>

// ── Le dossier ───────────────────────────────────────────────────────────────

export const rfpSchema = z.object({
  id: z.string().guid(),
  workspace_id: z.string().guid(),
  account_id: z.string().guid().nullable(),
  title: z.string().min(1).max(300),
  /** Client émetteur tel qu'écrit dans le document. */
  issuer: z.string().max(300).nullable(),
  source_format: rfpSourceFormatSchema,
  status: rfpStatusSchema,
  /** Date limite de remise, quand le document en porte une. */
  due_at: z.string().datetime().nullable(),
  /** Lots identifiés — un appel d'offres se gagne souvent par lot. */
  lots: z.array(z.string().max(300)).default([]),
  decision: bidDecisionSchema.nullable(),
  requirements: z.array(rfpRequirementSchema).default([]),
  /** #2957 — la structure DOSSIER (douze catégories). `null` sur un dossier
   *  importé avant ce chantier, ou si l'extraction n'a rien produit. */
  document_extraction: rfpDocumentExtractionSchema.nullable(),
  /** #2179.36 / #2179.31 — le besoin lié à ce dossier (créé DEPUIS lui, ou
   *  tiré de lui). Optionnel : une réponse d'avant ce champ ne le porte pas. */
  need_id: z.string().guid().nullable().optional(),
  /** #2957 (#2180.39) — la référence de la consultation, telle qu'écrite. */
  reference: z.string().max(200).nullable().optional(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
})
export type Rfp = z.infer<typeof rfpSchema>

// ── Conformité (p66 « matrice exigences/réponses/preuves/owner/statut ») ─────

/**
 * Le rapport de conformité produit AVANT export.
 *
 * Il ne dit pas « c'est bon » : il compte ce qui manque. Une réponse exportée
 * avec trois exigences obligatoires sans source est une réponse qu'on perd, et
 * le savoir avant l'envoi est tout l'intérêt.
 */
export const rfpComplianceSchema = z.object({
  total: z.number().int().min(0),
  mandatory: z.number().int().min(0),
  /** Obligatoires SANS réponse validée — le chiffre qui décide de l'export. */
  mandatoryUnanswered: z.number().int().min(0),
  ambiguous: z.number().int().min(0),
  /** Par rôle : ce que chacun doit encore produire. */
  pendingByOwner: z.partialRecord(rfpOwnerRoleSchema, z.number().int().min(0)),
  /** Engagements NON PROUVÉS détectés dans les réponses rédigées. */
  unprovenCommitments: z.array(z.string().max(500)).default([]),
  /** `true` seulement quand aucune obligatoire ne manque et aucune ambiguïté ne
   *  subsiste. C'est un feu vert, pas une note. */
  exportReady: z.boolean(),
})
export type RfpCompliance = z.infer<typeof rfpComplianceSchema>

/**
 * Calcule le rapport de conformité. Fonction PURE : c'est ce qui permet de
 * l'exécuter côté API comme côté écran sans que les deux divergent.
 *
 * Une exigence `informative` n'entre pas dans le décompte des manques : elle
 * n'engage à rien. Une exigence `ambiguous`, si — parce qu'elle cache peut-être
 * une obligation.
 */
export function computeRfpCompliance(requirements: readonly RfpRequirement[]): RfpCompliance {
  const mandatory = requirements.filter(r => r.weight === 'mandatory')
  const mandatoryUnanswered = mandatory.filter(r => r.answer_status !== 'validated').length
  const ambiguous = requirements.filter(r => r.weight === 'ambiguous').length

  const pendingByOwner: Partial<Record<RfpOwnerRole, number>> = {}
  for (const requirement of requirements) {
    if (requirement.answer_status === 'validated') continue
    if (requirement.weight === 'informative') continue
    pendingByOwner[requirement.owner_role] = (pendingByOwner[requirement.owner_role] ?? 0) + 1
  }

  const unprovenCommitments = requirements
    .filter(r => r.answer_status === 'drafted' && !r.answer_source)
    .map(r => r.text.slice(0, 500))

  return {
    total: requirements.length,
    mandatory: mandatory.length,
    mandatoryUnanswered,
    ambiguous,
    pendingByOwner: pendingByOwner as Record<RfpOwnerRole, number>,
    unprovenCommitments,
    exportReady: mandatoryUnanswered === 0 && ambiguous === 0 && unprovenCommitments.length === 0,
  }
}

// ── Traitabilité (#2056.14) ──────────────────────────────────────────────────

/**
 * #2056.14 — un appel d'offres REÇU n'est pas une opportunité TRAITABLE.
 *
 * Cinq choses le disent : le brief (une extraction réelle existe), le retour
 * (le client émetteur est joignable), l'économie (le dossier est viable
 * financièrement — 2056.11, hors périmètre), la capacité (documentaire ET de
 * delivery) et le responsable (un porteur nommé côté ESN).
 */
export const RFP_ACTIONABILITY_CHECKS = ['brief', 'retour', 'economie', 'capacite', 'responsable'] as const
export type RfpActionabilityCheck = (typeof RFP_ACTIONABILITY_CHECKS)[number]

/**
 * L'entrée de la fonction pure. Chaque signal est `boolean | null` — `null`
 * dit « non mesuré », jamais confondu avec `false` (« si cette valeur est
 * absente, `false` est-il VRAI ? » — non, donc on ne le fabrique pas). Un
 * signal `null` finit quand même dans `missing` : « je ne sais pas » n'autorise
 * jamais à dire « c'est bon ».
 */
export type RfpActionabilityInput = {
  briefAvailable: boolean | null
  clientResponsive: boolean | null
  economicsKnown: boolean | null
  capacityConfirmed: boolean | null
  ownerAssigned: boolean | null
}

export type RfpActionabilityAssessment = {
  actionable: boolean
  /** NOMMÉ — jamais un simple compte : « voici LEQUEL des cinq manque ». */
  missing: readonly RfpActionabilityCheck[]
}

const ACTIONABILITY_FIELD_BY_CHECK: Record<RfpActionabilityCheck, keyof RfpActionabilityInput> = {
  brief: 'briefAvailable',
  retour: 'clientResponsive',
  economie: 'economicsKnown',
  capacite: 'capacityConfirmed',
  responsable: 'ownerAssigned',
}

/**
 * Fonction PURE, comme {@link computeRfpCompliance} : l'API et l'écran doivent
 * pouvoir l'exécuter sans diverger. Un signal `true` valide son axe ; `false`
 * ET `null` (non mesuré) le mettent tous les deux dans `missing` — on ne peut
 * dire « c'est traitable » qu'en confirmant les cinq, jamais en supposant ce
 * qu'on n'a pas vérifié.
 */
export function assessRfpActionability(input: RfpActionabilityInput): RfpActionabilityAssessment {
  const missing = RFP_ACTIONABILITY_CHECKS.filter(check => input[ACTIONABILITY_FIELD_BY_CHECK[check]] !== true)
  return { actionable: missing.length === 0, missing }
}

// ── Requêtes API ─────────────────────────────────────────────────────────────

/** Borne de l'intake : au-delà, on ne lit pas un appel d'offres, on avale un
 *  répertoire. La limite est dite plutôt que découverte à l'usage. */
export const RFP_MAX_TEXT_CHARS = 400_000

/** 8 Mo de document réel ≈ 11 Mo une fois encodé en base64 — sous la limite de
 *  corps de 12 Mo de la route, avec la marge du titre et du texte collé. */
export const RFP_MAX_FILE_BASE64_CHARS = 11_000_000

/**
 * #2180.2 — UN document détecté à l'intake, dans un import qui en regroupe
 * plusieurs. Même paire `text`/`fileBase64` que l'intake mono-document : au
 * moins l'un des deux, vérifié par `RfpService.create` (un objet zod ne sait
 * pas exprimer un OU exclusif proprement sans `.refine`, et le service refuse
 * déjà l'entrée vide au même endroit que le mono-document).
 */
export const rfpDocumentInputSchema = z.object({
  text: z.string().min(1).max(RFP_MAX_TEXT_CHARS).optional(),
  fileBase64: z.string().min(1).max(RFP_MAX_FILE_BASE64_CHARS, 'Fichier trop lourd (8 Mo maximum).').optional(),
  fileName: z.string().max(300).optional(),
})
export type RfpDocumentInput = z.infer<typeof rfpDocumentInputSchema>

export const createRfpRequestSchema = z.object({
  title: z.string().trim().min(1).max(300),
  accountId: z.string().guid().optional(),
  /** Texte déjà extrait (le web fait l'extraction quand il peut), OU… */
  text: z.string().min(1).max(RFP_MAX_TEXT_CHARS).optional(),
  /**
   * …le fichier brut en base64, extrait server-side. Exactement l'un des deux.
   *
   * Borné, et la borne est DITE : la route accepte 12 Mo de corps, un refus de
   * transport arrive sans message lisible et ressemble à une panne. Le
   * plafond ci-dessous se déclenche AVANT, avec une phrase qui explique quoi
   * faire (alléger le document, ou coller le texte).
   */
  fileBase64: z.string().min(1).max(RFP_MAX_FILE_BASE64_CHARS, 'Fichier trop lourd (8 Mo maximum).').optional(),
  fileName: z.string().max(300).optional(),
  /**
   * #2180.2 / #2180.4 — DÉTECTION et REGROUPEMENT de plusieurs documents dans
   * UN seul dossier. Absent (ou `undefined`) : comportement d'avant, un seul
   * document via `text`/`fileBase64` ci-dessus. Présent : au moins deux
   * documents, chacun analysé séparément puis regroupé par `RfpService.create`
   * — chaque exigence garde la trace du document qui l'a produite
   * (`RfpRequirement.source_document`).
   */
  documents: z.array(rfpDocumentInputSchema).min(2).max(10).optional(),
})
export type CreateRfpRequest = z.infer<typeof createRfpRequestSchema>

export const updateRfpRequirementSchema = z.object({
  weight: rfpRequirementWeightSchema.optional(),
  owner_role: rfpOwnerRoleSchema.optional(),
  answer_status: rfpAnswerStatusSchema.optional(),
  answer_source: z.string().trim().max(500).nullable().optional(),
  answer_text: z.string().trim().max(20_000).nullable().optional(),
  // #2957 (#2181.10/.14, #2181.42 « ajouter une preuve ») — les deux champs
  // ajoutés à `rfpRequirementSchema` : la preuve elle-même, et la confiance
  // de la personne qui répond dans SA réponse.
  evidence: z.string().trim().max(4000).nullable().optional(),
  confidence: z.enum(['high', 'medium', 'low']).nullable().optional(),
})
export type UpdateRfpRequirement = z.infer<typeof updateRfpRequirementSchema>

/**
 * #2957 (#2181.40) — « Attribuer une section » : UN rôle pour toutes les
 * exigences d'une section (`section: null` = celles sans section). Un RÔLE,
 * jamais une personne — même règle que `owner_role` par exigence.
 */
export const assignRfpSectionOwnerSchema = z.object({
  section: z.string().max(300).nullable(),
  owner_role: rfpOwnerRoleSchema,
})
export type AssignRfpSectionOwner = z.infer<typeof assignRfpSectionOwnerSchema>

/**
 * Le corps de `POST /rfp/:id/need` (#1097) — transformer un appel d'offres reçu
 * en besoin ouvert, donc en matière pour le moteur de matching.
 *
 * Le projet est CHOISI par l'utilisateur, jamais deviné : un appel d'offres peut
 * relever d'une affaire en cours comme d'une nouvelle, et se tromper de projet
 * range le besoin dans un pipe où personne ne le cherchera.
 */
export const createNeedFromRfpSchema = z.object({ projectId: z.string().guid() }).strict()
export type CreateNeedFromRfp = z.infer<typeof createNeedFromRfpSchema>

// ── Prévisualisation du besoin (#2571) ──────────────────────────────────────

/**
 * #2571.1 — CE QUE LE DOCUMENT DIT, jamais ce qu'on en devine.
 *
 * Un critère est un fait relu tel quel dans l'appel d'offres — l'émetteur, la
 * date limite, un lot, une exigence non ambiguë. `value` porte le texte SOURCE
 * (jamais traduit ni reformulé côté serveur) ; c'est l'écran qui pose le
 * libellé de la NATURE (`kind`) dans la langue de qui regarde.
 */
export const rfpNeedCriterionKindSchema = z.enum(['issuer', 'deadline', 'lot', 'requirement'])
export type RfpNeedCriterionKind = z.infer<typeof rfpNeedCriterionKindSchema>

export const rfpNeedCriterionSchema = z.object({
  kind: rfpNeedCriterionKindSchema,
  value: z.string().max(4000),
})
export type RfpNeedCriterion = z.infer<typeof rfpNeedCriterionSchema>

/**
 * #2571.1 — CE QUI N'EST PAS DANS LE DOCUMENT reste un inconnu NOMMÉ.
 *
 * Jamais deviné, jamais rempli par défaut : `value` est `null` quand il n'y a
 * rien à citer (l'émetteur, l'échéance ou les compétences sont simplement
 * absents), et porte l'extrait SOURCE quand l'inconnue est une exigence jugée
 * ambiguë par l'extraction (`RfpRequirementWeight` = `ambiguous`).
 */
export const rfpNeedUnknownKindSchema = z.enum(['issuer', 'deadline', 'skills', 'ambiguous_requirement'])
export type RfpNeedUnknownKind = z.infer<typeof rfpNeedUnknownKindSchema>

export const rfpNeedUnknownSchema = z.object({
  kind: rfpNeedUnknownKindSchema,
  value: z.string().max(4000).nullable(),
})
export type RfpNeedUnknown = z.infer<typeof rfpNeedUnknownSchema>

/**
 * Le corps de `GET /rfp/:id/need-preview` (#2571.2).
 *
 * Une LECTURE pure : `need` est ce que `POST /rfp/:id/need` écrirait si on le
 * confirmait maintenant, mais rien n'existe encore — c'est la prévisualisation
 * elle-même qui rend inutile de ressaisir le brief. `account_id` voyage pour
 * que l'écran ne propose que les projets DU compte concerné, comme le fait déjà
 * le panneau des besoins détectés (PDF 4, PE5) — proposer un projet au hasard
 * rattacherait le besoin à la mauvaise affaire.
 */
export const rfpNeedPreviewSchema = z
  .object({
    need: createProjectNeedSchema,
    account_id: z.string().guid().nullable(),
    criteria: z.array(rfpNeedCriterionSchema),
    unknowns: z.array(rfpNeedUnknownSchema),
  })
  .strict()
export type RfpNeedPreview = z.infer<typeof rfpNeedPreviewSchema>

// ── Prévisualisation d'import (#2180.5, #2180.6, #2957) ─────────────────────

/**
 * #2180.5 / #2180.6 — CE QUE L'IMPORT PRODUIRAIT si on le confirmait
 * maintenant. Les documents ont déjà été lus (l'IA a tourné, ou le script de
 * démo), mais RIEN n'est encore écrit : `POST /rfp/confirm` est la SEULE
 * écriture, avec exactement ce que la prévisualisation a montré — jamais une
 * ré-analyse qui pourrait diverger de ce que l'utilisateur a validé.
 */
export const rfpImportDraftSchema = z.object({
  account_id: z.string().guid().nullable(),
  title: z.string().min(1).max(300),
  issuer: z.string().max(300).nullable(),
  /** #2957 (#2180.39) — la référence de la consultation, telle qu'écrite. */
  reference: z.string().max(200).nullable().optional(),
  source_format: rfpSourceFormatSchema,
  due_at: z.string().datetime().nullable(),
  lots: z.array(z.string().max(300)).default([]),
  source_text: z.string().nullable(),
  decision: bidDecisionSchema.nullable(),
  requirements: z.array(rfpRequirementSchema).default([]),
  /**
   * #2180.40 — hash SHA-256 du CONTENU BRUT des documents déposés (le fichier
   * ou le texte collé, dans l'ordre d'envoi), jamais du texte extrait par le
   * modèle : deux dépôts du même PDF produisent le même hash même si
   * l'extraction dérive légèrement d'un appel à l'autre. Toujours calculable
   * (au moins un document valide est garanti avant l'analyse).
   */
  document_hash: z.string().length(64),
  /** #2957 — la structure DOSSIER (douze catégories), reparentée depuis
   *  chaque document analysé. `null` quand rien n'a pu être extrait — jamais
   *  un objet aux douze champs vides fabriqué pour la forme. */
  document_extraction: rfpDocumentExtractionSchema.nullable(),
})
export type RfpImportDraft = z.infer<typeof rfpImportDraftSchema>

/**
 * #2180.41-46 — les SIX indicateurs de l'écran de preview.
 *
 * Un score n'est jamais nu (doctrine) : ses axes, et ce qui n'a pas pu être
 * évalué, sont NOMMÉS. `contradictions` (#2180.35/.44) est désormais
 * RÉELLEMENT mesuré depuis `document_extraction` — `RfpService` compare
 * maintenant les documents d'un import groupé entre eux, catégorie par
 * catégorie (`mergeDocumentExtractions`), au lieu de prendre le premier qui
 * répond. `missingDocuments` et `estimatedCost` restent `null` — non pas
 * « 0 », mais « non mesuré » — tant qu'aucune détection de complétude
 * documentaire ni d'extraction de coût n'existe (cluster tarifs/pièces
 * demandées, #2957, hors périmètre de ce lot).
 */
export const rfpImportPreviewIndicatorsSchema = z.object({
  totalRequirements: z.number().int().min(0),
  mandatoryRequirements: z.number().int().min(0),
  dueAt: z.string().datetime().nullable(),
  missingDocuments: z.number().int().min(0).nullable(),
  contradictions: z.number().int().min(0).nullable(),
  estimatedCost: z.number().nonnegative().nullable(),
})
export type RfpImportPreviewIndicators = z.infer<typeof rfpImportPreviewIndicatorsSchema>

/**
 * Fonction PURE, comme {@link computeRfpCompliance} : l'API et l'écran
 * l'exécutent à l'identique, sans jamais diverger.
 */
export function computeRfpImportPreviewIndicators(
  draft: Pick<RfpImportDraft, 'requirements' | 'due_at' | 'document_extraction'>,
): RfpImportPreviewIndicators {
  return {
    totalRequirements: draft.requirements.length,
    mandatoryRequirements: draft.requirements.filter(requirement => requirement.weight === 'mandatory').length,
    dueAt: draft.due_at,
    missingDocuments: null,
    contradictions: countExtractionContradictions(draft.document_extraction),
    estimatedCost: null,
  }
}

/**
 * #2180.35/.44 — combien de catégories du dossier portent une contradiction
 * RÉELLEMENT établie entre documents (`mergeDocumentExtractions`, côté
 * service). `null` quand aucune extraction n'existe (rien n'a été comparé) ;
 * `0` est un ZÉRO MESURÉ dès qu'une extraction existe, jamais confondu avec
 * « non mesuré ».
 */
function countExtractionContradictions(extraction: RfpDocumentExtraction | null): number | null {
  if (!extraction) return null
  return RFP_EXTRACTION_CATEGORIES.filter(category => extraction[category]?.status === 'contradiction').length
}

/** Le corps de `POST /rfp/preview` (#2180.5) : la même entrée que
 *  `POST /rfp` (documents uniques ou regroupés, #2180.2 / #2180.4), mais RIEN
 *  n'est écrit. */
export const previewRfpImportSchema = createRfpRequestSchema
export type PreviewRfpImport = CreateRfpRequest

/**
 * #2180.36-40 — DÉTECTION DE DOUBLON, cinq critères visés par l'épopée
 * #2957 : client, titre, date, référence, hash documentaire. `hash` (exact,
 * #2180.40) est livré depuis le lot g18. Ce lot ajoute trois critères RÉELS
 * par SIMILARITÉ, jamais inventés : `issuer` (normalisé, égalité stricte),
 * `title` (distance d'édition normalisée, seuil documenté ci-dessous) et
 * `due_at` (même jour calendaire). `reference` (#2180.39) reste hors de ce
 * lot : aucune extraction ne produit de numéro de référence de consultation
 * aujourd'hui (cluster #2180.9-.26, pipeline d'extraction) — l'inventer
 * comparerait un champ qui n'existe nulle part.
 *
 * `matchedOn` NOMME les critères qui ont concordé — jamais un doublon muet.
 * On PROPOSE : la preview affiche le dossier existant, l'humain décide
 * (Confirmer quand même, Exclure un document, Corriger) ; rien ne fusionne
 * automatiquement (doctrine, « on PROPOSE une fusion, on ne fusionne
 * JAMAIS »).
 */
// #2957 (#2180.39) — 'reference' ajouté EN FIN (GA-08, additif).
export const rfpDuplicateMatchKindSchema = z.enum(['hash', 'issuer', 'title', 'due_at', 'reference'])
export type RfpDuplicateMatchKind = z.infer<typeof rfpDuplicateMatchKindSchema>

export const rfpDuplicateMatchSchema = z.object({
  id: z.string().guid(),
  title: z.string(),
  matchedOn: z.array(rfpDuplicateMatchKindSchema).min(1),
})
export type RfpDuplicateMatch = z.infer<typeof rfpDuplicateMatchSchema>

/** Le dossier existant tel que la comparaison de doublon en a besoin — pas
 *  l'entité complète, seulement ce qui entre dans une comparaison. */
export type RfpDuplicateCandidate = {
  id: string
  title: string
  issuer: string | null
  due_at: string | null
}

/** Normalisation partagée titre/émetteur : minuscules, sans accent, sans
 *  ponctuation — la même pauvreté volontaire que le reste du dépôt (voir
 *  `consultants/matching/text.ts`), reproductible plutôt que sémantique. */
/**
 * #2957 (#2180.39) — la clé de comparaison d'une RÉFÉRENCE de consultation :
 * majuscules, lettres et chiffres seulement (« 2026/infra-042 » et
 * « 2026-INFRA-042 » sont la même consultation). Un critère EXACT, sans seuil.
 * `null` sous quatre caractères utiles — trop court pour identifier une
 * consultation sans risque de faux doublon (« Lot 1 », « A-1 »).
 */
export function rfpReferenceKey(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null
  const key = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
  return key.length >= 4 ? key : null
}

function normaliseRfpText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Distance de Levenshtein classique (matrice complète) — les titres d'appel
 *  d'offres sont courts (≤ 300 caractères), le coût quadratique est sans
 *  conséquence ici. */
function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length
  const rows = a.length + 1
  const cols = b.length + 1
  const matrix: number[][] = Array.from({ length: rows }, () => new Array<number>(cols).fill(0))
  for (let i = 0; i < rows; i += 1) matrix[i][0] = i
  for (let j = 0; j < cols; j += 1) matrix[0][j] = j
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      matrix[i][j] = Math.min(matrix[i - 1][j] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j - 1] + cost)
    }
  }
  return matrix[rows - 1][cols - 1]
}

/** 1 = identiques, 0 = rien en commun. Deux chaînes vides sont considérées
 *  identiques (mais un titre vide n'atteint jamais ce code : le contrat
 *  d'intake refuse déjà un titre vide). */
function textSimilarity(a: string, b: string): number {
  const maxLength = Math.max(a.length, b.length)
  if (maxLength === 0) return 1
  return 1 - levenshteinDistance(a, b) / maxLength
}

/**
 * Seuil de similarité de titre, tranché sans Louis (#2957) : au-delà de deux
 * appels d'offres qui ne diffèrent que par une majuscule, un numéro de lot ou
 * une année (« Refonte SI 2026 » / « Refonte SI - 2026 »), la distance
 * d'édition normalisée dépasse rarement 0.15. 0.85 est un choix
 * d'ALGORITHME (une tolérance de bruit typographique), pas une donnée
 * produit inventée — documenté ici pour être ajusté sur preuve, jamais
 * reconduit sans relecture.
 */
export const RFP_TITLE_SIMILARITY_THRESHOLD = 0.85

/**
 * #2180.36-38 — le doublon PAR SIMILARITÉ. Le TITRE est l'ancre obligatoire :
 * deux dossiers dont les titres divergent franchement ne sont jamais proposés
 * comme doublon, même s'ils partagent le même émetteur et la même échéance —
 * un client peut légitimement lancer plusieurs appels d'offres distincts le
 * même jour (« Refonte SI comptable » ET « Support poste de travail » chez le
 * même émetteur, due le même jour, ne sont pas le même dossier). Le titre
 * SEUL ne suffit pas non plus (trop générique, « Appel d'offres
 * infrastructure ») : il doit être CORROBORÉ par au moins un critère réel de
 * plus (émetteur ou échéance). Le PREMIER candidat qui satisfait la règle
 * gagne — déterministe, dans l'ordre où `candidates` est fourni.
 */
export function findRfpSimilarityDuplicate(
  draft: { title: string; issuer: string | null; due_at: string | null },
  candidates: readonly RfpDuplicateCandidate[],
): RfpDuplicateMatch | null {
  const draftTitle = normaliseRfpText(draft.title)
  const draftIssuer = draft.issuer ? normaliseRfpText(draft.issuer) : null
  const draftDay = draft.due_at ? draft.due_at.slice(0, 10) : null

  for (const candidate of candidates) {
    const titleMatches = textSimilarity(draftTitle, normaliseRfpText(candidate.title)) >= RFP_TITLE_SIMILARITY_THRESHOLD
    if (!titleMatches) continue

    const matchedOn: RfpDuplicateMatchKind[] = ['title']
    if (draftIssuer && candidate.issuer && draftIssuer === normaliseRfpText(candidate.issuer)) {
      matchedOn.push('issuer')
    }
    if (draftDay && candidate.due_at && draftDay === candidate.due_at.slice(0, 10)) {
      matchedOn.push('due_at')
    }
    if (matchedOn.length >= 2) return { id: candidate.id, title: candidate.title, matchedOn }
  }
  return null
}

/**
 * #2180.53 — import INTERROMPABLE ET REPRENABLE.
 *
 * Avant ce lot, `analyse()` lisait tous les documents avec `Promise.all` :
 * l'échec d'UN SEUL (timeout réseau, document illisible) faisait échouer
 * l'import ENTIER, y compris les documents déjà correctement analysés — rien
 * n'était montré, rien n'était réutilisable, la seule reprise possible était
 * de tout renvoyer depuis zéro.
 *
 * `failedDocuments` nomme, document par document, ce qui n'a pas pu être lu
 * et pourquoi — jamais un import qui disparaît en silence. La preview reste
 * VIABLE avec ce qui A RÉUSSI (`draft` porte les exigences des documents
 * exploités) : l'humain reprend sans perdre le travail déjà fait, avec les
 * actions déjà livrées (#2180.49 « Exclure un document » sur le document en
 * échec, ou relancer « Analyser » pour un retrait transitoire). Vide = aucun
 * document en échec, un fait vérifié, pas une absence de vérification.
 */
export const rfpFailedDocumentSchema = z.object({
  fileName: z.string().max(300).nullable(),
  reason: z.string().max(500),
})
export type RfpFailedDocument = z.infer<typeof rfpFailedDocumentSchema>

export const rfpImportPreviewSchema = z.object({
  draft: rfpImportDraftSchema,
  indicators: rfpImportPreviewIndicatorsSchema,
  duplicateOf: rfpDuplicateMatchSchema.nullable(),
  failedDocuments: z.array(rfpFailedDocumentSchema).default([]),
})
export type RfpImportPreview = z.infer<typeof rfpImportPreviewSchema>

/**
 * Le corps de `POST /rfp/confirm` (#2180.6).
 *
 * #2180.47 « Confirmer » et #2180.51 « Créer comme brouillon » écrivent tous
 * les deux ici : aucune distinction fondée n'existe encore entre les deux
 * dans le modèle de données (`analysed` est déjà l'état « importé, pas
 * décidé »). Tranché sans Louis (#2957) : deux boutons, une seule écriture,
 * plutôt qu'un champ `is_draft` qui ne porterait aucune décision réelle.
 */
export const confirmRfpImportSchema = z.object({
  draft: rfpImportDraftSchema,
  /**
   * #2957 (#2179.31) — « Créer depuis un besoin » : le besoin dont le dossier
   * est tiré. Posé en `need_id` à la création, il ferme « Transformer en
   * besoin » (garde #2179.36) — un AO tiré d'un besoin n'en recrée jamais un.
   */
  sourceNeedId: z.string().guid().optional(),
  /**
   * #2957 (#2180.54) — les documents BRUTS déposés, RESSAISIS ici : les mêmes
   * octets exacts que ceux déjà envoyés à `/rfp/preview` (qui n'écrit rien,
   * #2180.5), pour que `confirm` reste la SEULE écriture, fichiers compris.
   * Un document texte collé (sans `fileBase64`) n'a rien à conserver — la
   * doctrine ne fabrique pas un fichier depuis un texte. Absent ou vide :
   * dossier créé sans copie du fichier source (comportement d'avant ce lot).
   */
  sourceDocuments: z.array(rfpDocumentInputSchema).max(10).optional(),
})
export type ConfirmRfpImport = z.infer<typeof confirmRfpImportSchema>

/**
 * #2957 (#2180.53) — l'import INTERROMPABLE ET REPRENABLE : ce qu'un commercial
 * a déjà fait (titre, texte collé, noms des documents, aperçu rendu) survit à un
 * rechargement de page ou à une coupure réseau, côté serveur.
 *
 * Ce que la session NE garde PAS : les octets des fichiers. `confirm` reste la
 * seule écriture qui range les fichiers sources (#2180.54) ; une reprise dit
 * donc NOMMÉMENT quels documents sont à redéposer pour être archivés (les
 * noms sont connus, jamais deviné un contenu). Tranché sans Louis (#2957) :
 * stocker jusqu'à 10 × 8 Mo par brouillon abandonné aurait fait du stockage
 * un dépotoir de dossiers jamais confirmés.
 */
export const RFP_IMPORT_SESSION_STATUSES = ['in_progress', 'confirmed', 'cancelled'] as const
export type RfpImportSessionStatus = (typeof RFP_IMPORT_SESSION_STATUSES)[number]

export const saveRfpImportSessionSchema = z.object({
  title: z.string().max(300),
  /** Le texte collé, tel quel ; `null` = aucun texte collé (jamais une chaîne vide déguisée). */
  pastedText: z.string().max(400_000).nullable(),
  documentNames: z.array(z.string().min(1).max(300)).max(10),
  /** `null` = l'analyse n'avait pas encore rendu quand l'import a été interrompu (#2957) : la session garde les ENTRÉES, jamais un aperçu inventé. */
  preview: rfpImportPreviewSchema.nullable(),
})
export type SaveRfpImportSession = z.infer<typeof saveRfpImportSessionSchema>

export const rfpImportSessionSchema = saveRfpImportSessionSchema.extend({
  id: z.string().guid(),
  status: z.enum(RFP_IMPORT_SESSION_STATUSES),
  updatedAt: z.string(),
})
export type RfpImportSession = z.infer<typeof rfpImportSessionSchema>
