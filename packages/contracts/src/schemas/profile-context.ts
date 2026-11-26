import { z } from 'zod'
import { agentEnvelopeSchema, sourceHealthSchema } from './agent-envelope.js'

/**
 * Profile context — output of the Profiler agent (Phase 0 / onboarding).
 * TypeScript mirror of `apps/ia/app/models/profile_context.py`.
 *
 * Convention: camelCase + English everywhere — both keys AND enum values.
 *
 * Backwards-compat: Supabase rows persisted before the camelCase migration
 * carry snake_case values (and one French outlier, `conseil_strategique`).
 * Every enum schema below preprocesses those legacy strings into the
 * canonical camelCase form so old data still loads. Drop the preprocess
 * helpers once a one-off backfill rewrites storage.
 */

// ── EsnArchetype ────────────────────────────────────────────────────────────

export const esnArchetypeValues = [
  'soloHunter',
  'boutiqueExpert',
  'midMarketChallenger',
  'scaleUp',
  'enterprisePlayer',
] as const
export type EsnArchetype = (typeof esnArchetypeValues)[number]

const ESN_ARCHETYPE_LEGACY: Readonly<Record<string, EsnArchetype>> = {
  solo_hunter: 'soloHunter',
  boutique_expert: 'boutiqueExpert',
  mid_market_challenger: 'midMarketChallenger',
  scale_up: 'scaleUp',
  enterprise_player: 'enterprisePlayer',
}

export const esnArchetypeSchema = z.preprocess(
  raw => (typeof raw === 'string' && raw in ESN_ARCHETYPE_LEGACY ? ESN_ARCHETYPE_LEGACY[raw] : raw),
  z.enum(esnArchetypeValues),
)

// ── SellingPosture ──────────────────────────────────────────────────────────

export const sellingPostureValues = [
  'expertiseRare',
  'volumeFlexible',
  'strategicConsulting',
  'nearshoreCompetitive',
  'nicheVerticals',
] as const
export type SellingPosture = (typeof sellingPostureValues)[number]

const SELLING_POSTURE_LEGACY: Readonly<Record<string, SellingPosture>> = {
  expertise_rare: 'expertiseRare',
  volume_flexible: 'volumeFlexible',
  // French outlier kept alive while older rows ride.
  conseil_strategique: 'strategicConsulting',
  strategic_consulting: 'strategicConsulting',
  nearshore_competitive: 'nearshoreCompetitive',
  niche_verticals: 'nicheVerticals',
}

export const sellingPostureSchema = z.preprocess(
  raw => (typeof raw === 'string' && raw in SELLING_POSTURE_LEGACY ? SELLING_POSTURE_LEGACY[raw] : raw),
  z.enum(sellingPostureValues),
)

export const accountSizeValues = ['pme', 'eti', 'grandCompte', 'all'] as const
export type AccountSize = (typeof accountSizeValues)[number]
export const accountSizeSchema = z.enum(accountSizeValues)

export const decisionLevelValues = ['cLevel', 'director', 'manager', 'operational'] as const
export type DecisionLevel = (typeof decisionLevelValues)[number]
export const decisionLevelSchema = z.enum(decisionLevelValues)

export const entryStrategyValues = ['topDown', 'bottomUp', 'multiThread', 'referral'] as const
export type EntryStrategy = (typeof entryStrategyValues)[number]
export const entryStrategySchema = z.enum(entryStrategyValues)

export const analysisDepthValues = ['light', 'standard', 'deep'] as const
export type AnalysisDepth = (typeof analysisDepthValues)[number]
export const analysisDepthSchema = z.enum(analysisDepthValues)

export const messagingToneValues = ['directExpert', 'consultative', 'relationshipFirst', 'challenger'] as const
export type MessagingTone = (typeof messagingToneValues)[number]
export const messagingToneSchema = z.enum(messagingToneValues)

export const messageLengthValues = ['concise', 'standard', 'detailed'] as const
export type MessageLength = (typeof messageLengthValues)[number]
export const messageLengthSchema = z.enum(messageLengthValues)

export const idealAccountProfileSchema = z.object({
  size: accountSizeSchema,
  sectorsPriority: z.array(z.string()),
  decisionLevel: decisionLevelSchema,
  entryStrategy: entryStrategySchema,
})
export type IdealAccountProfile = z.infer<typeof idealAccountProfileSchema>

export const analysisParametersSchema = z.object({
  braveQueriesCount: z.number().int().min(5).max(25),
  firecrawlPagesCount: z.number().int().min(3).max(15),
  contactsTarget: z.number().int().min(10).max(120),
  analysisDepth: analysisDepthSchema,
  maxTokensResearch: z.number().int().min(8000).max(20000),
  focusAreas: z.array(z.string()),
})
export type AnalysisParameters = z.infer<typeof analysisParametersSchema>

export const messagingStyleSchema = z.object({
  tone: messagingToneSchema,
  messageLength: messageLengthSchema,
  valuePropositionAngle: z.string(),
  differentiationPoints: z.array(z.string()),
  avoid: z.array(z.string()),
})
export type MessagingStyle = z.infer<typeof messagingStyleSchema>

export const cadenceRecommendationSchema = z.object({
  analysesPerWeek: z.number().int(),
  messagesPerDay: z.number().int(),
  followUpsPerWeek: z.number().int(),
})
export type CadenceRecommendation = z.infer<typeof cadenceRecommendationSchema>

export const kpiTargetsSchema = z.object({
  accountsPerMonth: z.number().int(),
  rdvPerMonth: z.number().int(),
  conversionRateTarget: z.string(),
  /**
   * #2067.2 — la cible partenaires suit l'archétype. Le nombre de partenaires
   * à TRAVAILLER dans le mois (solliciter, relancer, co-construire une offre),
   * jamais un nombre de partenaires à SIGNER : le moteur ne promet pas la
   * signature d'un tiers.
   *
   * ARBITRAGE (décision Louis du 20/09/2026, QCM) — CALCULÉE, pas déclarée,
   * comme ses deux sœurs ci-dessus : les trois cibles de `kpiTargets` sortent
   * du Profiler (sortie structurée Instructor, plages écrites dans
   * `apps/ia/app/models/profile_context.py` → `KpiTargets.partners_per_month`).
   * Une cible partenaires DÉCLARÉE ferait vivre un même réglage à deux
   * endroits (GA-26) et mélangerait un déclaré et un généré dans le même
   * objet. Le questionnaire fournit la BASE actuelle
   * (`partners_regular_count`, `onboarding/answers-profil.ts`) : c'est
   * l'ANCRAGE du calcul, jamais la cible.
   *
   * OPTIONNELLE alors que ses sœurs sont requises, et c'est tout le point :
   * les comptes et les rendez-vous existent TOUJOURS, les partenaires non. Une
   * ESN sans porte partenaire (`go_to_market_channels`), ou qui n'a pas su
   * dire combien elle en a (« Je ne sais pas »), n'a pas de cible
   * partenaires : elle est ABSENTE. `.min(1)` EST cette règle en contrat —
   * une absence ne se dit jamais « 0 » (doctrine, gardes GA-18 / GA-19).
   * Additif : les profils déjà en base, qui n'ont pas la clé, se lisent
   * toujours.
   *
   * Appelant : `apps/web/src/features/commercial-audit/lib/build-audit.ts`
   * (conséquence `kpiTargets`), rendu par `AuditConsequences.tsx` sur
   * /settings/profile/audit.
   */
  partnersPerMonth: z.number().int().min(1).nullable().optional(),
})
export type KpiTargets = z.infer<typeof kpiTargetsSchema>

export const coachingInsightsSchema = z.object({
  mainWeakness: z.string(),
  keyAdvice: z.string(),
  cadenceRecommendation: cadenceRecommendationSchema.optional(),
  kpiTargets: kpiTargetsSchema.optional(),
})
export type CoachingInsights = z.infer<typeof coachingInsightsSchema>

export const bellumPhrasesSchema = z.object({
  welcome: z.string(),
  firstAnalysisCta: z.string(),
  weeklySummaryIntro: z.string(),
  emptyState: z.string(),
  scoreContext: z.string(),
})
export type BellumPhrases = z.infer<typeof bellumPhrasesSchema>

// Each field is rewritten by the Profiler for the user; the front renders
// them verbatim — no enum mapping, no templating. Mirrors the Python
// `WelcomeSummary` in `apps/ia/app/models/profile_context.py`.
export const firstAnalysisSuggestionSchema = z.object({
  companyName: z.string(),
  sector: z.string(),
  reason: z.string(),
})
export type FirstAnalysisSuggestion = z.infer<typeof firstAnalysisSuggestionSchema>

// #2088.34 — la tension que LAURA ELLE-MÊME repère dans les réponses,
// distincte des huit détecteurs déterministes de `onboarding-contradictions.ts`
// (`buildQuestionnaireContradictions`, rendus par `OnboardingContradictionCard`).
// Doctrine tranchée le 18/09/2026 : une hypothèse du modèle peut sortir avec
// son `reasoning`, À CONDITION d'être affichée COMME une hypothèse — jamais
// une relation établie — et que le `reasoning` reste consultable. D'où :
// `statement` ET `reasoning` tous deux requis (pas de tension sans sa raison,
// même principe que `orgInfluenceClaim` — `packages/shared/schemas/classify.schema.json`).
// Mirrors the Python `ProfileContradiction` in `apps/ia/app/models/profile_context.py`.
export const profileContradictionSchema = z.object({
  statement: z.string(),
  reasoning: z.string(),
})
export type ProfileContradiction = z.infer<typeof profileContradictionSchema>

export const welcomeSummarySchema = z.object({
  profileRecap: z.string(),
  searchesPersonalization: z.string(),
  contactsPersonalization: z.string(),
  messagesPersonalization: z.string(),
  scoringPersonalization: z.string(),
  // #2069 — le prompt (apps/ia/app/models/profile_context.py:441) pose
  // `default_factory=list` + `max_length=4`, PAS de `min_length` : sans nom à
  // reprendre dans le contexte, la liste rend VIDE plutôt que d'inventer un
  // nom. Un `.min(3)` ici mentirait sur un plancher que le prompt ne garantit
  // plus. Test de non-régression : profile-context.test.ts (welcomeSummarySchema).
  firstAnalysisSuggestions: z.array(firstAnalysisSuggestionSchema).max(4),
})
export type WelcomeSummary = z.infer<typeof welcomeSummarySchema>

const profileContextObject = z.object({
  esnArchetype: esnArchetypeSchema,
  sellingPosture: sellingPostureSchema,
  idealAccountProfile: idealAccountProfileSchema.optional(),
  analysisParameters: analysisParametersSchema.optional(),
  messagingStyle: messagingStyleSchema.optional(),
  coachingInsights: coachingInsightsSchema.optional(),
  bellumPhrases: bellumPhrasesSchema.optional(),
  welcomeSummary: welcomeSummarySchema.optional(),
  // #2088.34 — `null`/absent quand le profileur n'a repéré AUCUNE tension :
  // ne JAMAIS en deviner une pour remplir le champ (décision Louis 20/09) —
  // une absence ne fait AUCUNE ligne dans une liste.
  contradiction: profileContradictionSchema.nullable().optional(),
})

// ``.passthrough()`` keeps legacy snake_case blocks (``analysis_parameters``,
// ``ideal_account_profile``, …) on profile_context rows written to Supabase
// before the camelCase standardization — stripping them would lose data on a
// read→re-save. Matches every other payload schema in this package.
//
// The exported ``ProfileContext`` type is inferred from the STRICT object (not
// the passthrough schema) on purpose: passthrough adds an ``[k: string]:
// unknown`` index signature that breaks TypeORM ``QueryDeepPartialEntity``
// assignment of ``ProfileEntity.profile_context``. Runtime keeps unknown keys;
// the static type stays the known shape.
export const profileContextSchema = profileContextObject.passthrough()
export type ProfileContext = z.infer<typeof profileContextObject>

export const profilerEnvelopeSchema = agentEnvelopeSchema(profileContextSchema)
export type ProfilerEnvelope = z.infer<typeof profilerEnvelopeSchema>

export const profileContextStatusValues = ['not_generated', 'generating', 'succeeded', 'validated', 'failed'] as const
export type ProfileContextStatus = (typeof profileContextStatusValues)[number]
export const profileContextStatusSchema = z.enum(profileContextStatusValues)

// #2069.1 — passée de 1 à 2 le 15/09/2026. Une version de schéma dit QUEL
// producteur a écrit l'instantané, et c'est la seule provenance disponible à la
// lecture : depuis la 2, les noms de `welcomeSummary.firstAnalysisSuggestions`
// sont FILTRÉS contre la mémoire marché lue (`keep_sourced`,
// `apps/ia/app/services/welcome_account_suggestions.py`). En deçà, aucun nom
// n'a jamais été vérifié — « BNP Paribas · Stellantis · Airbus · LVMH » étaient
// servis et CLIQUABLES en production le 15/09.
export const PROFILE_CONTEXT_SCHEMA_VERSION = 2

/** La version de schéma à partir de laquelle un nom d'entreprise stocké est
 *  PROUVÉ. En deçà, le nom ne se sert pas : un clic lance une analyse, donc
 *  débite un crédit — une hallucination deviendrait une dépense. */
export const PROFILE_CONTEXT_SOURCED_SUGGESTIONS_SCHEMA_VERSION = 2

// D9 — décision Louis 14/09/2026 : valider le contexte commercial. `null` =
// jamais validé, ou une réédition des réponses a retiré la validation — pas
// « non mesuré » au sens `UnknownValue` (l'absence EST le fait ici), mais la
// même discipline : le champ est ADDED, jamais optionnel, pour qu'aucun
// appelant ne puisse lire un `undefined` et le confondre avec une valeur
// qu'il n'a simplement pas encore lue.
// #2062.1 / #2069.1 — CE QUI EST RETENU SE NOMME, AVEC SA DATE.
//
// Le contexte est PERSISTÉ : un interdit posé sur le prompt ne redescend jamais
// sur ce qui a déjà été écrit. Un texte stocké qui viole la doctrine n'est donc
// pas servi — mais « non mesuré » se NOMME, il ne se déguise pas en champ vide.
// L'écran doit pouvoir dire « ce texte date du <storedAt> et sera réécrit à la
// prochaine génération », ce qui est la règle « un fait périmé redevient
// inconnu AVEC SA DATE », pas « il disparaît ».
//
// `fields` porte des chemins (`welcomeSummary.scoringPersonalization`), et
// `storedAt` la date de l'instantané retenu — `null` quand elle est illisible,
// jamais une date devinée.
export const withheldStoredContextSchema = z.object({
  fields: z.array(z.string()),
  storedAt: z.string().nullable(),
})
export type WithheldStoredContext = z.infer<typeof withheldStoredContextSchema>

// #2073.8 — LA STRATÉGIE D'ENTRÉE CHOISIE, distincte du champ CALCULÉ par le
// profileur (`profile_context.idealAccountProfile.entryStrategy`). Colonne
// séparée sur `profiles` (`chosen_entry_strategy`), jamais un partage du
// champ calculé : celui-ci est réécrit en entier à chaque régénération du
// profil, ce qui effacerait un choix logé au même endroit. `null` = aucun
// choix explicite — même discipline que `validatedAt`/`withheld` : ADDED,
// jamais optionnel, pour qu'aucun appelant ne confonde « rien choisi » avec
// « pas encore lu ».
// #2074.16 — LA DÉCISION HUMAINE sur un mouvement d'audit PROPOSÉ
// (`AuditMove`, packages/contracts/src/schemas/commercial-audit-moves.ts,
// VERROUILLÉ ce soir — ce fichier ne l'importe PAS : `ruleId` reste une
// chaîne libre plutôt que de coupler les deux chantiers). `propose` n'est
// jamais écrit ici : c'est le statut DÉRIVÉ par défaut, tant qu'aucune
// décision n'existe pour ce `ruleId` (voir `auditMovesFrom`).
export const AUDIT_MOVE_DECISION_STATUSES = ['valide', 'modifie', 'ecarte'] as const
export type AuditMoveDecisionStatus = (typeof AUDIT_MOVE_DECISION_STATUSES)[number]
export const auditMoveDecisionStatusSchema = z.enum(AUDIT_MOVE_DECISION_STATUSES)

export const auditMoveDecisionSchema = z.object({
  status: auditMoveDecisionStatusSchema,
  decidedAt: z.string(),
})
export type AuditMoveDecision = z.infer<typeof auditMoveDecisionSchema>

// Clé = `AuditMove.ruleId`. `{}` = aucune décision — jamais optionnel, même
// discipline que `chosenEntryStrategy` : un appelant qui n'a pas encore lu
// ce champ ne doit jamais pouvoir le confondre avec « rien décidé ».
export const auditMoveDecisionsSchema = z.record(z.string(), auditMoveDecisionSchema)
export type AuditMoveDecisions = z.infer<typeof auditMoveDecisionsSchema>

/** #2074.16 — le corps de `POST /profile-context/audit-move-decision` : le
 *  geste « Valider » / « Modifier » / « Écarter » sur UN mouvement proposé. */
export const recordAuditMoveDecisionSchema = z.object({
  ruleId: z.string().min(1),
  status: auditMoveDecisionStatusSchema,
  // #2074.16 — ADDED, optionnels : ce que l'écran a montré (`AuditMove.subject`
  // / `.reason` / `.expectedResult`), qui devient la tâche créée dans Actions
  // sur « Valider »/« Modifier ». Absent = la décision s'enregistre, sans tâche.
  subject: z.string().trim().min(1).max(2000).optional(),
  reason: z.string().trim().min(1).max(2000).optional(),
  expectedResult: z.string().trim().min(1).max(2000).optional(),
})
export type RecordAuditMoveDecisionInput = z.infer<typeof recordAuditMoveDecisionSchema>
/** #2074.16 — la part « contenu du mouvement » de la décision, qui devient la tâche. */
export type AuditMoveDecisionMove = Pick<RecordAuditMoveDecisionInput, 'subject' | 'reason' | 'expectedResult'>

// #2908 (#2010.4) — L'ÉTAT « CORRIGÉ » ÉDITABLE, champ par champ, du contexte
// commercial généré. `profile_context` est réécrit EN ENTIER à chaque
// régénération (#2009) : une correction posée dedans serait effacée par la
// prochaine génération, même précédent que `chosen_entry_strategy`/
// `audit_move_decisions` — colonne SÉPARÉE (`profiles.profile_context_corrections`),
// jamais réécrite par une régénération, « une correction humaine gagne
// toujours quelle que soit sa date ».
//
// Un ensemble FERMÉ de champs corrigibles, pas un chemin JSON arbitraire :
// « un contrat d'API non vérifiable ne se devine pas » (CLAUDE.md). Chaque
// nouveau champ corrigible s'ajoute à cette liste ET à `applyProfileContextCorrections`
// ci-dessous — le même écran générique (aucun formulaire dédié par champ) sert
// tous les champs de la liste.
export const PROFILE_CONTEXT_CORRECTABLE_FIELDS = ['welcomeSummary.profileRecap'] as const
export type ProfileContextCorrectableField = (typeof PROFILE_CONTEXT_CORRECTABLE_FIELDS)[number]
export const profileContextCorrectableFieldSchema = z.enum(PROFILE_CONTEXT_CORRECTABLE_FIELDS)

export const profileContextCorrectionSchema = z.object({
  value: z.string().min(1).max(4000),
  correctedAt: z.string(),
})
export type ProfileContextCorrection = z.infer<typeof profileContextCorrectionSchema>

// Clé = un des `PROFILE_CONTEXT_CORRECTABLE_FIELDS`. `{}` = aucune correction —
// jamais optionnel, même discipline que `auditMoveDecisions`.
export const profileContextCorrectionsSchema = z.record(z.string(), profileContextCorrectionSchema)
export type ProfileContextCorrections = z.infer<typeof profileContextCorrectionsSchema>

/** #2908 (#2010.4) — le corps de `POST /profile-context/corrections` : corriger
 *  UN champ, par son chemin fermé. */
export const correctProfileContextFieldInputSchema = z.object({
  field: profileContextCorrectableFieldSchema,
  value: z.string().min(1).max(4000),
})
export type CorrectProfileContextFieldInput = z.infer<typeof correctProfileContextFieldInputSchema>

/**
 * Applique les corrections humaines PAR-DESSUS un `profile_context` — qu'il
 * vienne d'être lu (`getMe`) ou tout juste régénéré (`persistSuccess`) : « une
 * correction humaine gagne toujours, quelle que soit sa date » ne distingue
 * pas les deux cas, elle s'applique aux deux de la MÊME façon (GA-26 — une
 * seule dérivation, réutilisée). Pure, jamais d'E/S : `context` non modifié en
 * place, un nouvel objet est renvoyé quand au moins une correction s'applique.
 */
export function applyProfileContextCorrections(
  context: ProfileContext | null,
  corrections: ProfileContextCorrections,
): ProfileContext | null {
  if (!context) return context
  let next = context
  const recap = corrections['welcomeSummary.profileRecap']
  if (recap && next.welcomeSummary) {
    next = { ...next, welcomeSummary: { ...next.welcomeSummary, profileRecap: recap.value } }
  }
  return next
}

// #2908 (#2010.16 / #2011.10) — RÉGÉNÉRATION CIBLÉE PAR SECTION : le Profileur
// ne sait produire `profile_context` qu'en UN appel (`apps/ia/app/agents/
// profiler.py::_generate`) — aucun prompt par section n'existe. La tranche
// minimale qui lève le geste empêché, sans construire ce découpage côté
// modèle : on relance l'appel COMPLET, et on ne RETIENT que la section
// demandée dans le contenu déjà persisté — les autres sections ne bougent pas
// d'un caractère. Un ensemble FERMÉ, comme `PROFILE_CONTEXT_CORRECTABLE_FIELDS`
// juste au-dessus : « un contrat d'API non vérifiable ne se devine pas ».
// Bornée aux DEUX sections que l'écran (`ProfileContextSubPage.tsx`) rend
// séparément — `welcomeSummary` (blocs « profile-recap » + « personalization »)
// et `coachingInsights` (bloc « coaching ») — jamais un chemin JSON arbitraire.
export const PROFILE_CONTEXT_REGENERABLE_SECTIONS = ['welcomeSummary', 'coachingInsights'] as const
export type ProfileContextRegenerableSection = (typeof PROFILE_CONTEXT_REGENERABLE_SECTIONS)[number]
export const profileContextRegenerableSectionSchema = z.enum(PROFILE_CONTEXT_REGENERABLE_SECTIONS)

/** #2908 (#2010.16 / #2011.10) — le corps de `POST
 *  /profile-context/sections/regenerate` : régénérer UNE section, par son nom
 *  fermé. */
export const regenerateProfileContextSectionInputSchema = z.object({
  section: profileContextRegenerableSectionSchema,
})
export type RegenerateProfileContextSectionInput = z.infer<typeof regenerateProfileContextSectionInputSchema>

/**
 * Ne retient, d'un `profile_context` FRAÎCHEMENT régénéré, que la section
 * demandée — appliquée par-dessus le contenu ACTUELLEMENT persisté. Pure,
 * jamais d'E/S : ni `current` ni `regenerated` ne sont modifiés en place.
 *
 * `current` nul (rien encore généré) : une section seule n'a rien à
 * préserver, le résultat complet régénéré fait alors foi en entier — même
 * repli qu'une première génération.
 */
export function mergeRegeneratedProfileContextSection(
  current: ProfileContext | null,
  section: ProfileContextRegenerableSection,
  regenerated: ProfileContext,
): ProfileContext {
  if (!current) return regenerated
  return { ...current, [section]: regenerated[section] }
}

/** #4969 — POURQUOI une génération a échoué : un code court, jamais le message d'erreur ni un corps. */
export const profileContextFailureReasonSchema = z.enum(['model_error', 'model_unreachable', 'persist_failed'])
export type ProfileContextFailureReason = z.infer<typeof profileContextFailureReasonSchema>

export const profileContextResponseSchema = z.object({
  profile_context: profileContextSchema.nullable(),
  status: profileContextStatusSchema,
  // #4969 — ADDED, jamais optionnel : `null` hors du statut `failed` ; sous `failed`, `null` dit « raison
  // inconnue » (échec antérieur à ce champ), jamais une raison devinée.
  failureReason: profileContextFailureReasonSchema.nullable(),
  validatedAt: z.string().nullable(),
  // ADDED, jamais optionnel, même discipline que `validatedAt` : `null` dit
  // « rien n'a été retenu », et aucun appelant ne peut confondre ce fait avec
  // un champ qu'il n'a pas encore lu.
  withheld: withheldStoredContextSchema.nullable(),
  chosenEntryStrategy: entryStrategySchema.nullable(),
  // #2074.16 — ADDED, jamais optionnel, même discipline que ci-dessus.
  auditMoveDecisions: auditMoveDecisionsSchema,
  // #2012.12 (épopée #2776) — couverture réduite par source facultative du
  // Profileur (`AgentMeta.source_health`, jusque-là jetée à la frontière
  // API). `null` = aucun signal encore posé, jamais un objet vide deviné.
  sourceHealth: z.record(z.string(), sourceHealthSchema).nullable(),
  // #2908 (#2010.4) — ADDED, jamais optionnel, même discipline que ci-dessus :
  // `{}` dit « rien n'a été corrigé ». `profile_context` ci-dessus porte déjà
  // les corrections APPLIQUÉES (`applyProfileContextCorrections`) ; ce champ
  // est ce qui permet à l'écran de savoir QUOI marquer « corrigé ».
  corrections: profileContextCorrectionsSchema,
})
export type ProfileContextResponse = z.infer<typeof profileContextResponseSchema>

/**
 * #2118.16 — LA stratégie d'entrée qui fait foi : la CHOISIE
 * (`profiles.chosen_entry_strategy`) si elle existe, sinon la CALCULÉE par le
 * profileur (`idealAccountProfile.entryStrategy`). Une correction humaine gagne
 * toujours. La règle vit ICI, une seule fois (GA-26) : l'audit
 * (`build-audit.ts`) et le moteur (`EsnProfileWorkspaceResolver`) la lisent.
 *
 * Les deux entrées sont `unknown` parce qu'elles viennent d'une colonne et d'un
 * JSONB : une valeur hors catalogue est ignorée, jamais traduite en une
 * stratégie plausible. `null` = aucune stratégie connue.
 */
export function effectiveEntryStrategy(chosen: unknown, computed: unknown): EntryStrategy | null {
  const pick = (value: unknown): EntryStrategy | null => {
    const parsed = entryStrategySchema.safeParse(value)
    return parsed.success ? parsed.data : null
  }
  return pick(chosen) ?? pick(computed)
}

/** #2073.8 — le corps de `POST /profile-context/entry-strategy` : le geste
 *  « Choisir cette stratégie », une seule valeur du même catalogue que
 *  `AuditStrategyOptions.tsx` affiche. */
export const chooseEntryStrategySchema = z.object({
  entryStrategy: entryStrategySchema,
})
export type ChooseEntryStrategyInput = z.infer<typeof chooseEntryStrategySchema>

// ── Revision history ────────────────────────────────────────────────────────
// Every regeneration snapshots the context as a new revision so past versions
// can be retrieved and restored. `version` is the per-user content revision
// number; `schema_version` is the JSONB shape at snapshot time.

export const profileContextRevisionSummarySchema = z.object({
  version: z.number().int().positive(),
  schema_version: z.number().int().nonnegative(),
  created_at: z.string(),
  /**
   * #2010.17 — cette révision est-elle la DERNIÈRE que le commercial a
   * validée, avant qu'une régénération plus récente ne la remplace en tant
   * que ligne « live » de `profiles` ? Distinct d'« actuelle » (la position
   * la plus haute de cette liste) : une révision peut être remplacée sans
   * jamais avoir été validée, et une revue en cours (`to_review`) laisse
   * justement coexister une actuelle NON validée et une ancienne validée.
   * Calculé côté serveur contre `profiles.last_validated_context_version`
   * (stampé au clic « Valider », jamais deviné) — jamais plus d'une révision
   * à `true` par utilisateur.
   */
  was_last_validated: z.boolean(),
})
export type ProfileContextRevisionSummary = z.infer<typeof profileContextRevisionSummarySchema>

export const profileContextRevisionSchema = profileContextRevisionSummarySchema.extend({
  profile_context: profileContextSchema,
})
export type ProfileContextRevision = z.infer<typeof profileContextRevisionSchema>
