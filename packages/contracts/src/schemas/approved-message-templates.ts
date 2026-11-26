import { z } from 'zod'
import { OUTREACH_MESSAGE_CHANNELS, outreachMessageChannelSchema } from './outreach-canonical.js'
import { outreachPersonaSchema } from './outreach-scenarios.js'

/**
 * BIBLIOTHÈQUE VERSIONNÉE DES SCRIPTS ET MESSAGES APPROUVÉS — #3417 (retour
 * bêta 30/09, fiche contact).
 *
 * ## Pourquoi un second enum de scénarios, et pas `OUTREACH_SCENARIO_IDS`
 *
 * `outreach-scenarios.ts` répond à « à quel RYTHME relancer, pour quel état
 * de relation ? » (4 valeurs, chacune pilotant `minDelayDays`/`maxSteps`
 * d'une séquence AUTOMATIQUE). #3417 demande dix SITUATIONS d'écriture — dont
 * quatre correspondent à un état de relation (`invitation_acceptee` ↔
 * `accepted_connection`, etc., voir `scenarioForApprovedTemplateScenario` plus
 * bas) et six n'en ont AUCUN : une objection, une clôture ou un appel sans
 * contexte ne sont pas des états de relation, ce sont des moments choisis à
 * la main par le commercial DANS une relation déjà connue. Confondre les deux
 * forcerait soit à faire porter une cadence à « objections_client », soit à
 * amputer le registre de rythme de six entrées qu'il ne gouverne pas — les
 * deux BRISERAIENT le premier registre pour satisfaire le second (GA-26 : un
 * réglage vit à un seul endroit, mais ce n'est PAS le même réglage).
 *
 * ## Ce que ce fichier ne fait PAS
 *
 * Contrairement à `OUTREACH_SCENARIOS` (qui refuse délibérément de recopier
 * un gabarit verbatim, voir son commentaire d'en-tête), #3417 demande
 * explicitement le CONTRAIRE pour cette bibliothèque : le texte source
 * conservé EXACTEMENT, sans réécriture automatique. Les deux ne se
 * contredisent pas : `OUTREACH_SCENARIOS` documente une cadence AUTOMATIQUE
 * où un gabarit recopié partirait tel quel à tout le monde ; ici, le
 * commercial CHOISIT explicitement « modèle approuvé » pour UN message,
 * variables remplacées par des valeurs réelles seulement — jamais un envoi
 * de masse.
 */

export const APPROVED_TEMPLATE_SCENARIO_IDS = [
  'invitation_acceptee',
  'connexion_dormante',
  'contact_recommande',
  'approche_froide',
  'contexte_partenaire',
  'appel_sans_contexte',
  'prospection_inversee_consultant',
  'objections_client',
  'objections_consultant',
  'cloture_elegante',
] as const
export const approvedTemplateScenarioIdSchema = z.enum(APPROVED_TEMPLATE_SCENARIO_IDS)
export type ApprovedTemplateScenarioId = (typeof APPROVED_TEMPLATE_SCENARIO_IDS)[number]

/** Le canal réutilise EXACTEMENT le vocabulaire outreach (GA-26) — c'est
 *  celui du composer de fiche contact (`EngagementChannel` sans `task`, qui
 *  ne s'envoie jamais et n'a donc pas de modèle à proposer). */
export const APPROVED_TEMPLATE_CHANNELS = OUTREACH_MESSAGE_CHANNELS
export const approvedTemplateChannelSchema = outreachMessageChannelSchema
export type ApprovedTemplateChannel = z.infer<typeof approvedTemplateChannelSchema>

/** `null` = le modèle s'adresse à tous les personas (ex. une clôture élégante
 *  ne change pas selon l'interlocuteur). */
export const approvedTemplatePersonaSchema = outreachPersonaSchema.nullable()

export const APPROVED_TEMPLATE_STATUSES = ['active', 'archived'] as const
export const approvedTemplateStatusSchema = z.enum(APPROVED_TEMPLATE_STATUSES)
export type ApprovedTemplateStatus = (typeof APPROVED_TEMPLATE_STATUSES)[number]

/**
 * #3417 — les champs à conserver PAR modèle : texte exact, source, version,
 * canal, scénario, type d'interlocuteur, étape de séquence, délai, variables,
 * preuves obligatoires, affirmations interdites.
 */
export const approvedMessageTemplateSchema = z.object({
  id: z.string().guid(),
  scenario: approvedTemplateScenarioIdSchema,
  channel: approvedTemplateChannelSchema,
  persona: approvedTemplatePersonaSchema,
  /** Rang dans la séquence du scénario (1 = premier message). */
  sequenceStep: z.number().int().min(1),
  /** Délai minimal en jours depuis le pas précédent (0 = part le jour même). */
  delayDays: z.number().int().min(0),
  version: z.number().int().min(1),
  /** D'où vient ce texte (méthode, document, retour terrain…) — jamais un fournisseur nommé (GA doctrine). */
  source: z.string().min(1).max(200),
  /** Le texte exact — #3417 : conservé sans réécriture automatique. */
  exactText: z.string().min(1).max(4000),
  /** Noms des variables attendues dans `exactText` (ex. "prenom", "entreprise"). */
  variables: z.array(z.string().min(1)),
  /** Preuves obligatoires pour que ce modèle soit proposé PRÊT À ENVOYER. */
  requiredEvidence: z.array(z.string().min(1)),
  /** Affirmations que ce modèle ne doit jamais porter (contrôlées par lecture humaine, pas mécaniquement ici). */
  forbiddenClaims: z.array(z.string().min(1)),
  status: approvedTemplateStatusSchema,
})
export type ApprovedMessageTemplate = z.infer<typeof approvedMessageTemplateSchema>

/**
 * #3417 — « ne jamais substituer une variable par une invention ». Rend le
 * texte SEULEMENT si toutes les variables déclarées ont une valeur connue et
 * non vide ; sinon nomme celles qui manquent plutôt que de les remplacer par
 * un blanc ou un texte deviné.
 */
export function renderApprovedTemplate(
  template: Pick<ApprovedMessageTemplate, 'exactText' | 'variables'>,
  values: Readonly<Record<string, string | null | undefined>>,
): { ok: true; text: string } | { ok: false; missingVariables: string[] } {
  const missingVariables = template.variables.filter(name => !(values[name] ?? '').trim())
  if (missingVariables.length > 0) return { ok: false, missingVariables }
  const text = template.variables.reduce(
    (acc, name) => acc.split(`{{${name}}}`).join((values[name] ?? '').trim()),
    template.exactText,
  )
  return { ok: true, text }
}

/**
 * #3417 — « si une preuve requise manque, le modèle ne doit pas être proposé
 * comme prêt à envoyer ». `presentEvidence` : les clés de preuve RÉELLEMENT
 * disponibles pour ce contact/compte (jamais devinées par l'appelant).
 */
export function templateReadiness(
  template: Pick<ApprovedMessageTemplate, 'requiredEvidence'>,
  presentEvidence: ReadonlySet<string>,
): { ready: true } | { ready: false; missingEvidence: string[] } {
  const missingEvidence = template.requiredEvidence.filter(key => !presentEvidence.has(key))
  if (missingEvidence.length > 0) return { ready: false, missingEvidence }
  return { ready: true }
}

/**
 * #3417 — la réponse de `GET /outreach-templates/:contactId` : les modèles
 * PRÊTS (rendus, variables remplacées par des valeurs réelles) et les
 * BLOQUÉS, chacun avec la raison NOMMÉE (jamais un modèle silencieusement
 * absent — #3417 : « le modèle ne doit pas être proposé comme prêt à
 * envoyer », pas « le modèle disparaît »).
 */
export const approvedTemplateCandidateSchema = approvedMessageTemplateSchema.extend({
  /** Le texte exact, variables substituées par des valeurs réelles du dossier. */
  renderedText: z.string(),
})
export type ApprovedTemplateCandidate = z.infer<typeof approvedTemplateCandidateSchema>

export const APPROVED_TEMPLATE_BLOCKED_REASONS = ['variables_missing', 'evidence_missing'] as const
export const approvedTemplateBlockedReasonSchema = z.enum(APPROVED_TEMPLATE_BLOCKED_REASONS)
export type ApprovedTemplateBlockedReason = (typeof APPROVED_TEMPLATE_BLOCKED_REASONS)[number]

export const approvedTemplateBlockedSchema = approvedMessageTemplateSchema.extend({
  reason: approvedTemplateBlockedReasonSchema,
  missing: z.array(z.string()),
})
export type ApprovedTemplateBlocked = z.infer<typeof approvedTemplateBlockedSchema>

export const approvedTemplateCandidatesResponseSchema = z.object({
  ready: z.array(approvedTemplateCandidateSchema),
  blocked: z.array(approvedTemplateBlockedSchema),
})
export type ApprovedTemplateCandidatesResponse = z.infer<typeof approvedTemplateCandidatesResponseSchema>

/**
 * Le scénario de bibliothèque qui correspond à un état de relation de
 * compte — seulement pour les quatre qui EN dérivent un. Les six autres
 * (objections, clôture, appel sans contexte, contexte partenaire,
 * prospection inversée consultant) n'ont pas de correspondance : `null`, le
 * commercial les choisit explicitement.
 */
export function scenarioForApprovedTemplateRelationship(
  state: string | null | undefined,
): ApprovedTemplateScenarioId | null {
  switch ((state ?? '').trim()) {
    case 'linkedin':
      return 'invitation_acceptee'
    case 'dormant':
    case 'ancien_client':
      return 'connexion_dormante'
    case 'refere':
      return 'contact_recommande'
    case 'froid':
      return 'approche_froide'
    default:
      return null
  }
}
