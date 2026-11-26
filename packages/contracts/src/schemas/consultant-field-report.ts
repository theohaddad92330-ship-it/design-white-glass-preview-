import { z } from 'zod'

/**
 * #3406 (retour bêta #3406) — CAPITALISER LES INFORMATIONS TERRAIN remontées
 * par un consultant (en mission ou passé par un compte), avec consentement et
 * sans le mettre en difficulté.
 *
 * La trame à TROIS QUESTIONS du retour (#3406.2) n'ouvre pas trois champs
 * texte de plus : elle groupe les champs structurés ci-dessous, à l'écran —
 * Q1 « où travailles-tu / as-tu travaillé » → `entity`/`team`/`manager` ; Q2
 * « qui décide/sponsorise » → `possibleSponsor`/`decisionMakers` ; Q3 « qui
 * contacter » → `peopleToContact`/`introductionPossible`. Dupliquer la donnée
 * dans un texte libre en plus des champs structurés violerait GA-26 (un
 * réglage vit à un seul endroit).
 *
 * ⚠️ « la personne qui l'a déclarée » (retour #3406) est LE CONSULTANT dont
 * c'est la fiche — jamais un second champ ici, cette fiche n'a qu'un
 * consultant. `recordedBy*` porte qui l'a SAISIE (le commercial), un fait
 * différent et déjà distingué ailleurs (`interview_traits.recordedByName`).
 *
 * Chaque entrée est ARCHIVÉE, jamais réécrite ni supprimée (doctrine « on
 * archive, on ne supprime pas ») : une information qui se périme le reste
 * dans l'historique, avec sa date — c'est au lecteur de la jauger fraîche ou
 * non, jamais au produit de la faire disparaître.
 */

/**
 * Trois crans NOMMÉS, jamais un chiffre (doctrine « aucune probabilité »,
 * refusée six fois) : à quel point l'information est fiable, telle que le
 * commercial qui l'a recueillie la juge — pas une mesure produit.
 */
export const FIELD_REPORT_CONFIDENCE_LEVELS = ['faible', 'moyenne', 'forte'] as const
export const fieldReportConfidenceLevelSchema = z.enum(FIELD_REPORT_CONFIDENCE_LEVELS)
export type FieldReportConfidenceLevel = (typeof FIELD_REPORT_CONFIDENCE_LEVELS)[number]

/**
 * Le niveau de confidentialité DÉCLARÉ par le consultant sur cette
 * information précise — distinct de `notForCommercialUse` ci-dessous : on
 * peut confier une information CONFIDENTIELLE en interne tout en autorisant
 * son usage commercial (« sers-toi en, mais ne dis pas que ça vient de moi »).
 */
export const FIELD_REPORT_CONFIDENTIALITY_LEVELS = ['interne', 'partage_limite', 'confidentiel'] as const
export const fieldReportConfidentialityLevelSchema = z.enum(FIELD_REPORT_CONFIDENTIALITY_LEVELS)
export type FieldReportConfidentialityLevel = (typeof FIELD_REPORT_CONFIDENTIALITY_LEVELS)[number]

/** Une information terrain, telle qu'elle est LUE (déjà enregistrée). */
export const consultantFieldReportSchema = z
  .object({
    id: z.string(),
    /** Le compte du CRM concerné, quand il existe déjà. `null` = pas encore
     *  un compte suivi — voir `accountName` pour le libellé saisi. */
    accountId: z.string().guid().nullable(),
    /** Le nom de l'entreprise TEL QUE le consultant le nomme, toujours gardé
     *  même quand `accountId` résout un compte — un consultant nomme souvent
     *  une filiale ou une DSI, pas la raison sociale du compte CRM. */
    accountName: z.string().nullable(),
    entity: z.string().nullable(),
    team: z.string().nullable(),
    manager: z.string().nullable(),
    project: z.string().nullable(),
    technologies: z.array(z.string()),
    teamSize: z.string().nullable(),
    partnersObserved: z.array(z.string()),
    painPoints: z.string().nullable(),
    possibleSponsor: z.string().nullable(),
    decisionMakers: z.array(z.string()),
    uncoveredNeed: z.string().nullable(),
    peopleToContact: z.array(z.string()),
    introductionPossible: z.string().nullable(),
    /** Le consultant a demandé que CETTE information ne soit pas exploitée
     *  commercialement — un veto PAR INFORMATION, jamais un consentement
     *  global qui écraserait les nuances d'un même échange. */
    notForCommercialUse: z.boolean(),
    confidentialityLevel: fieldReportConfidentialityLevelSchema,
    /** L'autorisation d'usage telle qu'elle a été donnée, en clair — jamais
     *  déduite du niveau de confidentialité, qui répond à une autre question. */
    usageAuthorization: z.string().nullable(),
    /** Le périmètre de l'autorisation (« cet échange seulement », « tant que
     *  je ne suis pas nommé »…), en clair. */
    scope: z.string().nullable(),
    confidence: fieldReportConfidenceLevelSchema,
    recordedByUserId: z.string(),
    recordedByName: z.string().nullable(),
    declaredAt: z.string(),
  })
  .strict()
export type ConsultantFieldReport = z.infer<typeof consultantFieldReportSchema>

/** Ce qu'un commercial ENVOIE pour capitaliser une information terrain. */
export const recordConsultantFieldReportSchema = z
  .object({
    accountId: z.string().guid().nullable().optional(),
    accountName: z.string().trim().max(200).nullable().optional(),
    entity: z.string().trim().max(200).nullable().optional(),
    team: z.string().trim().max(200).nullable().optional(),
    manager: z.string().trim().max(200).nullable().optional(),
    project: z.string().trim().max(200).nullable().optional(),
    technologies: z.array(z.string().min(1).max(80)).max(30).optional(),
    teamSize: z.string().trim().max(80).nullable().optional(),
    partnersObserved: z.array(z.string().min(1).max(120)).max(20).optional(),
    painPoints: z.string().trim().max(1000).nullable().optional(),
    possibleSponsor: z.string().trim().max(200).nullable().optional(),
    decisionMakers: z.array(z.string().min(1).max(200)).max(20).optional(),
    uncoveredNeed: z.string().trim().max(1000).nullable().optional(),
    peopleToContact: z.array(z.string().min(1).max(200)).max(20).optional(),
    introductionPossible: z.string().trim().max(500).nullable().optional(),
    notForCommercialUse: z.boolean().optional(),
    confidentialityLevel: fieldReportConfidentialityLevelSchema,
    usageAuthorization: z.string().trim().max(500).nullable().optional(),
    scope: z.string().trim().max(500).nullable().optional(),
    confidence: fieldReportConfidenceLevelSchema,
  })
  .strict()
export type RecordConsultantFieldReportInput = z.infer<typeof recordConsultantFieldReportSchema>
