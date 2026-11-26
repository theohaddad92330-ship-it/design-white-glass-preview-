/**
 * Structured commercial context fed to the analysis pipeline.
 *
 * The web composer used to send a single free-text string; now each
 * preset has its own typed shape so the IA service can drop hints
 * straight into Claude prompts instead of asking the model to re-parse
 * a blob.
 */

import { z } from 'zod'

export const ANALYSIS_CONTEXT_PRESETS = [
  'push-offer',
  'known-account',
  'incumbent',
  'signal',
  'strategic',
  'retry',
  'free',
] as const

export type AnalysisContextPreset = (typeof ANALYSIS_CONTEXT_PRESETS)[number]

/** Le preset, validable — le pont du copilote en a besoin pour son entrée. */
export const analysisContextPresetSchema = z.enum(ANALYSIS_CONTEXT_PRESETS)

// Un champ de contexte est FACULTATIF : vide ou blanc = absent, jamais « Too small ».
// Le premier clic sur « Lancer l'analyse » sans angle saisi était refusé (recette 01/11).
const optionalString = z.preprocess(
  value => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().trim().min(1).optional(),
)

export const pushOfferContextSchema = z.object({
  preset: z.literal('push-offer'),
  offer: optionalString,
  pricing: optionalString,
  differentiation: optionalString,
  idealMission: optionalString,
})

export const knownAccountContextSchema = z.object({
  preset: z.literal('known-account'),
  commercialStatus: z.enum(['active', 'former', 'engaged-prospect']).optional(),
  lastInteraction: optionalString,
  openOpportunity: optionalString,
  revenueOrPipeline: optionalString,
})

export const incumbentContextSchema = z.object({
  preset: z.literal('incumbent'),
  incumbentName: optionalString,
  incumbentScope: optionalString,
  contractEndDate: optionalString,
  weakness: optionalString,
})

export const signalContextSchema = z.object({
  preset: z.literal('signal'),
  signalType: z.enum(['recruitment', 'tender', 'fundraise', 'appointment', 'merger-acquisition', 'other']).optional(),
  source: optionalString,
  signalDate: optionalString,
  implication: optionalString,
})

export const strategicContextSchema = z.object({
  preset: z.literal('strategic'),
  prioritizationReason: optionalString,
  targetDecisionMaker: optionalString,
  potentialVolume: optionalString,
  closingHorizon: optionalString,
  similarReference: optionalString,
})

export const retryContextSchema = z.object({
  preset: z.literal('retry'),
  missingFromPrevious: optionalString,
  newAngle: optionalString,
  hypothesis: optionalString,
})

export const freeContextSchema = z.object({
  preset: z.literal('free'),
  notes: z.string().trim().optional(),
})

export const analysisContextSchema = z.discriminatedUnion('preset', [
  pushOfferContextSchema,
  knownAccountContextSchema,
  incumbentContextSchema,
  signalContextSchema,
  strategicContextSchema,
  retryContextSchema,
  freeContextSchema,
])

export type AnalysisContext = z.infer<typeof analysisContextSchema>
export type PushOfferContext = z.infer<typeof pushOfferContextSchema>
export type KnownAccountContext = z.infer<typeof knownAccountContextSchema>
export type IncumbentContext = z.infer<typeof incumbentContextSchema>
export type SignalContext = z.infer<typeof signalContextSchema>
export type StrategicContext = z.infer<typeof strategicContextSchema>
export type RetryContext = z.infer<typeof retryContextSchema>
export type FreeContext = z.infer<typeof freeContextSchema>

/**
 * Render an analysis context to a single string — used as a fallback when
 * a consumer (or older code path) only accepts text. The IA service still
 * receives the typed object too, so this is best-effort serialisation for
 * UI display and legacy persistence.
 */
export function renderAnalysisContext(ctx: AnalysisContext | undefined): string {
  if (!ctx) return ''
  if (ctx.preset === 'free') return ctx.notes ?? ''

  const entries = Object.entries(ctx).filter(([k, v]) => k !== 'preset' && v != null && v !== '')
  return entries.map(([k, v]) => `${k}: ${String(v)}`).join('\n')
}

/**
 * LES QUESTIONS QUE LE COPILOTE POSE AVANT DE LANCER UNE ANALYSE (#1489).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI ELLES EXISTENT
 * ─────────────────────────────────────────────────────────────────────────────
 * *« Elle pourrait même questionner : qu'est-ce que tu connais de ce compte. »*
 * Ce que le commercial sait déjà oriente toute la collecte — c'est exactement ce
 * que `user_context` porte jusqu'aux prompts. Lancer sans le demander, c'est
 * jeter la moitié de ce qui rend l'analyse utile, et débiter un crédit pour ça.
 *
 * ⚠️ **Aucune n'est obligatoire, et c'est déjà vrai au contrat** : tous les
 * champs de tous les presets sont `optional()`. « Go » sans avoir répondu à quoi
 * que ce soit produit un contexte vide, qui est un contexte valide — le run part
 * comme il serait parti sans la conversation.
 *
 * ⚠️ Ce ne sont PAS les libellés du formulaire de l'écran Découvrir. Une
 * étiquette de champ (« Offre à pousser ») et une question posée à voix haute
 * (« Quelle offre veux-tu pousser sur ce compte ? ») ne se rédigent pas pareil,
 * et les confondre donnerait un copilote qui parle comme un formulaire. Une
 * garde vérifie en revanche qu'elles couvrent EXACTEMENT les mêmes champs.
 */
export const ANALYSIS_CONTEXT_QUESTIONS: Record<AnalysisContextPreset, Record<string, { fr: string; en: string }>> = {
  'push-offer': {
    offer: { fr: 'Quelle offre veux-tu pousser sur ce compte ?', en: 'Which offer do you want to push here?' },
    pricing: { fr: 'À quel prix — TJM ou forfait ?', en: 'At what price — day rate or fixed fee?' },
    differentiation: {
      fr: 'Qu’est-ce qui vous distingue des concurrents sur ce sujet ?',
      en: 'What sets you apart from competitors on this?',
    },
    idealMission: { fr: 'À quoi ressemblerait la mission idéale ?', en: 'What would the ideal engagement look like?' },
  },
  'known-account': {
    commercialStatus: {
      fr: 'Où en êtes-vous : client actif, ex-client, ou prospect engagé ?',
      en: 'Where do you stand: active client, former client, or engaged prospect?',
    },
    lastInteraction: {
      fr: 'Quelle a été la dernière interaction — quand, avec qui, sur quoi ?',
      en: 'What was the last interaction — when, with whom, about what?',
    },
    openOpportunity: {
      fr: 'Y a-t-il une opportunité ouverte, ou un blocage ?',
      en: 'Is there an open opportunity, or a blocker?',
    },
    revenueOrPipeline: {
      fr: 'Quel chiffre d’affaires ou pipeline en jeu ?',
      en: 'What revenue or pipeline is at stake?',
    },
  },
  incumbent: {
    incumbentName: { fr: 'Quelle ESN est en place ?', en: 'Which firm is the incumbent?' },
    incumbentScope: { fr: 'Sur quel périmètre ?', en: 'On what scope?' },
    contractEndDate: {
      fr: 'Quand le contrat se termine ou se renouvelle-t-il ?',
      en: 'When does the contract end or renew?',
    },
    weakness: {
      fr: 'Quelle faille exploiter — insatisfaction, sous-performance, prix ?',
      en: 'What weakness can you use — dissatisfaction, underperformance, price?',
    },
  },
  signal: {
    signalType: {
      fr: 'Quel signal as-tu vu — recrutement, appel d’offres, levée, nomination, fusion ?',
      en: 'What signal did you see — hiring, tender, fundraise, appointment, merger?',
    },
    source: { fr: 'Où l’as-tu vu ?', en: 'Where did you see it?' },
    signalDate: { fr: 'De quand date-t-il ?', en: 'How recent is it?' },
    implication: { fr: 'Qu’est-ce que ça implique, selon toi ?', en: 'What do you think it implies?' },
  },
  strategic: {
    prioritizationReason: {
      fr: 'Pourquoi ce compte plutôt qu’un autre, maintenant ?',
      en: 'Why this account rather than another, right now?',
    },
    targetDecisionMaker: { fr: 'Qui vises-tu chez eux ?', en: 'Who are you targeting there?' },
    potentialVolume: { fr: 'Quel volume potentiel ?', en: 'What is the potential volume?' },
    closingHorizon: { fr: 'À quel horizon espères-tu conclure ?', en: 'By when do you hope to close?' },
    similarReference: {
      fr: 'As-tu une référence comparable à leur montrer ?',
      en: 'Do you have a comparable reference to show them?',
    },
  },
  retry: {
    missingFromPrevious: {
      fr: 'Qu’est-ce qui manquait à la dernière analyse ?',
      en: 'What was missing from the last analysis?',
    },
    newAngle: { fr: 'Quel angle veux-tu essayer cette fois ?', en: 'What angle do you want to try this time?' },
    hypothesis: { fr: 'Quelle hypothèse veux-tu vérifier ?', en: 'What hypothesis do you want to test?' },
  },
  free: {
    notes: {
      fr: 'Qu’est-ce que tu sais déjà de ce compte ?',
      en: 'What do you already know about this account?',
    },
  },
}

/** Les champs de contexte d'un preset — lus sur le SCHÉMA, jamais recopiés. */
export function analysisContextFields(preset: AnalysisContextPreset): string[] {
  const schema = {
    'push-offer': pushOfferContextSchema,
    'known-account': knownAccountContextSchema,
    incumbent: incumbentContextSchema,
    signal: signalContextSchema,
    strategic: strategicContextSchema,
    retry: retryContextSchema,
    free: freeContextSchema,
  }[preset]
  return Object.keys(schema.shape).filter(key => key !== 'preset')
}

/**
 * Les questions d'un preset, dans la langue demandée.
 *
 * ⚠️ L'ORDRE vient du schéma, pas de la table ci-dessus : c'est lui qui décrit
 * la forme du contexte, et deux ordres différents feraient poser les questions
 * dans un sens et remplir le contexte dans un autre.
 */
export function analysisQuestionsFor(
  preset: AnalysisContextPreset,
  locale: 'fr' | 'en' = 'fr',
): { field: string; question: string }[] {
  const questions = ANALYSIS_CONTEXT_QUESTIONS[preset]
  return analysisContextFields(preset)
    .filter(field => questions[field])
    .map(field => ({ field, question: questions[field]![locale] }))
}
