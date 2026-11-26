import { z } from 'zod'
import { auditActiveLoadSchema } from './commercial-audit-active-load.js'
import { auditDeclaredSignalsSchema } from './commercial-audit-signals.js'
import { fieldSourceSchema } from './provenance.js'

/**
 * `CommercialAuditContext` — #2061. Un livrable DATÉ, distinct du `ProfileContext`.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CET OBJET EST DISTINCT DE `ProfileContext`
 * ─────────────────────────────────────────────────────────────────────────
 * `ProfileContext` (`profile-context.ts`) CONFIGURE la personnalisation des
 * agents — un réglage qu'on écrase à la prochaine régénération. Un audit
 * commercial est autre chose : ce que le produit a OBSERVÉ d'une activité, à
 * une DATE, avec une CONFIANCE nommée par élément. Les confondre interdit de
 * versionner l'un sans casser l'autre — c'est déjà arrivé (#2061.1).
 *
 * Aujourd'hui, `apps/web/src/features/commercial-audit/lib/build-audit.ts`
 * DÉRIVE un `CommercialAudit` (type TS interne, non versionné) depuis le
 * `ProfileContext` courant. Ce fichier introduit le CONTRAT cible — le SENS
 * inverse de dérivation (#2061.22, `ProfileContext` devenant une PROJECTION
 * validée de l'audit) suppose de changer l'agent Profiler côté `apps/ia`, ce
 * qui est HORS PÉRIMÈTRE de ce lot (deux fichiers : ce schéma +
 * `build-audit.ts`). `profileContextVersion` pose le lien de version
 * qui rendra cette inversion possible sans rejouer une migration de données.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LES PRIMITIVES RÉUTILISÉES, PAS RÉINVENTÉES
 * ─────────────────────────────────────────────────────────────────────────
 * - `Provenance` (la source ET la date) → {@link commercialAuditProvenanceSchema},
 *   même forme que `accountIntelligenceProvenanceSchema`
 *   (`account-intelligence-context.ts`), construite sur `fieldSourceSchema`
 *   (`provenance.ts`) plutôt que sur un nouvel enum de sources.
 * - `ScoreWithAxes` (un score n'est jamais nu) → {@link auditScoreWithAxesSchema}
 *   reprend la forme de `ScoreAxis` du composant React
 *   (`apps/web/src/components/primitives/ScoreWithAxes.tsx`) : `label`,
 *   `score: number | null` (`null` = axe non évaluable, SORT du
 *   dénominateur), `detail`, `weight`. {@link MINIMUM_SCORE_AXES} (3) est
 *   GARDÉ par un `.superRefine` : un score porté par moins de trois axes
 *   évalués ne PARSE pas — voir `commercial-audit-context.test.ts`.
 * - `UnknownValue` → chaque bloc de contenu est `.nullable()` : `null` = le
 *   bloc source manque (non mesuré), `[]` = le bloc existe et ne nomme rien
 *   (mesuré, vide) — même discipline que `build-audit.ts` (`entries()`).
 * - La CONFIANCE par élément (#2063.13 / #2072.5 / #2090.29 au registre) suit
 *   le même principe que `ACCOUNT_RECOMMENDATION_CONFIDENCES`
 *   (`account-intelligence-context.ts`) : trois PALIERS NOMMÉS, jamais un
 *   nombre — une probabilité déguisée. `null` = confiance NON MESURÉE, un état
 *   distinct de `'deduced'` (la plus faible des trois confiances connues) :
 *   « non mesurée » n'est jamais « faible ».
 *
 * ─────────────────────────────────────────────────────────────────────────
 * AUCUNE PROBABILITÉ — GA-64
 * ─────────────────────────────────────────────────────────────────────────
 * `apps/api/src/architecture/no-persisted-probability.spec.ts` lit les CLÉS
 * de ce fichier. Aucun champ ci-dessous ne croise le vocabulaire de la
 * CHANCE (chance/probabilité/odds/…) avec celui de l'AFFAIRE
 * (closing/deal/signature/…), ni celui de la PONDÉRATION avec celui du
 * MONTANT. `confidence` est explicitement AUTORISÉ par la garde (c'est un
 * palier qualitatif sur un fait établi, pas un pari sur un fait à venir).
 */

// ── Version ──────────────────────────────────────────────────────────────

/** Versionné, jamais un « v1 » écrit à la main dans un écran : un audit relu
 *  dans six mois doit dire sur quelle forme de schéma il a été produit. */
export const COMMERCIAL_AUDIT_CONTEXT_SCHEMA_VERSION = 1

// ── Confiance par élément (#2063.13 / #2072.5 / #2090.29) ─────────────────

export const commercialAuditConfidenceValues = ['corroborated', 'single_source', 'deduced'] as const
export type CommercialAuditConfidence = (typeof commercialAuditConfidenceValues)[number]
export const commercialAuditConfidenceSchema = z.enum(commercialAuditConfidenceValues)

// ── Provenance — la source ET la date (#2061.4) ────────────────────────────

export const commercialAuditProvenanceSchema = z.object({
  source: fieldSourceSchema,
  /** `null` = la source ne porte pas de date fiable pour cette valeur —
   *  jamais une date devinée, elle se citerait en rendez-vous. */
  observedAt: z.string().nullable(),
})
export type CommercialAuditProvenance = z.infer<typeof commercialAuditProvenanceSchema>

// ── Score avec axes — jamais nu (#2061.13, doctrine ScoreWithAxes) ────────

/** Sous ce compte d'axes ÉVALUÉS, il n'y a pas de score — même seuil que la
 *  doctrine générale (« sous 3 axes il n'y a pas de score »). */
export const MINIMUM_SCORE_AXES = 3

export const auditScoreAxisSchema = z.object({
  label: z.string().min(1),
  /** `null` = axe non évaluable. SORT du dénominateur — il ne vaut pas zéro. */
  score: z.number().nullable(),
  detail: z.string().nullable().optional(),
  weight: z.number().nullable().optional(),
  confidence: commercialAuditConfidenceSchema.nullable().optional(),
})
export type AuditScoreAxis = z.infer<typeof auditScoreAxisSchema>

export const auditScoreWithAxesSchema = z
  .object({
    /** `null` = pas de score global — les axes restent lisibles quand même. */
    score: z.number().nullable(),
    max: z.number().positive(),
    axes: z.array(auditScoreAxisSchema),
    /** Pourquoi il n'y a pas de score, quand il n'y en a pas. */
    reason: z.string().nullable(),
  })
  .superRefine((value, ctx) => {
    if (value.score === null) return
    const evaluated = value.axes.filter(axis => axis.score !== null)
    if (evaluated.length < MINIMUM_SCORE_AXES) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `un score porté par moins de ${MINIMUM_SCORE_AXES} axes évalués n'est pas un score (doctrine : « sous 3 axes il n'y a pas de score »)`,
        path: ['score'],
      })
    }
  })
export type AuditScoreWithAxes = z.infer<typeof auditScoreWithAxesSchema>

/** Les axes qui comptent vraiment dans le dénominateur — jamais ceux dont le
 *  score est `null`. Pure, testée à part : c'est elle qui garantit qu'un axe
 *  non évaluable ne s'additionne jamais comme un zéro. */
export function auditEvaluableAxes(axes: readonly Pick<AuditScoreAxis, 'score'>[]): number {
  return axes.filter(axis => axis.score !== null).length
}

// ── Blocs de contenu réutilisés (#2061.7, .8, .12) ─────────────────────────

/** Une note NOMMÉE et datée — sert Assets (#2061.7), Constraints (#2061.8) et
 *  Breakpoints (#2061.12) : trois listes de la même forme, une seule fois. */
export const auditNamedNoteSchema = z.object({
  label: z.string().min(1),
  detail: z.string().nullable(),
  provenance: commercialAuditProvenanceSchema.nullable(),
  confidence: commercialAuditConfidenceSchema.nullable(),
})
export type AuditNamedNote = z.infer<typeof auditNamedNoteSchema>

// ── Facts (#2061.3) ─────────────────────────────────────────────────────

export const auditFactSchema = z.object({
  statement: z.string().min(1),
  provenance: commercialAuditProvenanceSchema.nullable(),
  confidence: commercialAuditConfidenceSchema.nullable(),
})
export type AuditFact = z.infer<typeof auditFactSchema>

// ── Unknowns (#2061.5 — déjà là côté `build-audit.ts` sous `unestablished`) ─

export const auditUnknownSchema = z.object({
  label: z.string().min(1),
  /** Pourquoi ce n'est pas établi, quand on le sait. */
  reason: z.string().nullable(),
})
export type AuditUnknown = z.infer<typeof auditUnknownSchema>

// ── Contradictions (#2061.6 ; les 5 métadonnées portent #2064.13-17) ──────
//
// #2064.1-.12 — les 12 RÈGLES NOMMÉES qui produisent une contradiction. Une
// identité fermée (pas une chaîne libre, comme `auditProductAreaValues`) :
// elle sert à LOCALISER un libellé de règle (i18n `commercialAudit.tensions.
// rule.<id>.label`) et à compter les déclenchements, ce qu'une phrase seule
// ne permet pas. Le moteur (`apps/web/.../lib/tension-detectors.ts`) est
// L'APPELANT qui produit ces valeurs ; ce fichier ne porte que la FORME.
export const commercialTensionRuleIdValues = [
  // #2064.1
  'objectivesAboveCapacity',
  // #2064.2
  'tooManySimultaneousMarkets',
  // #2064.3
  'offerWithoutProof',
  // #2064.4
  'acquisitionWithoutRoutine',
  // #2064.5
  'poolWithoutAvailability',
  // #2064.6
  'needsWithoutQualification',
  // #2064.7
  'profilesWithoutCommitment',
  // #2064.8
  'keyAccountsWithoutAccessPath',
  // #2064.9 — voisin `apps/api/src/modules/partners`
  'partnersWithoutEconomicsOrFeedback',
  // #2064.10
  'contentWithoutCommercialUse',
  // #2064.11 — voisin `apps/api/src/modules/rfp` + `decision-gates`
  'rfpsWithoutGoNoGo',
  // #2064.12 — voisin `apps/api/src/modules/capitalisation`
  'missionsWithoutCapitalisation',
  // #2066.11 — voisin `apps/api/src/modules/contacts`
  'contactWithoutFollowUpDate',
  // #2066.12 — voisin `apps/api/src/modules/qualification-leads`
  'needReducedToTitle',
  // #2066.13 — voisin `apps/api/src/modules/consultants`
  'profileNotSecured',
  // #2066.14 — voisin `apps/api/src/modules/meeting-notes`
  'interviewWithoutFollowUp',
  // #2066.15 — voisin `apps/api/src/modules/delivery`
  'missionWithoutRenewal',
  // #2066.16 — voisin `apps/api/src/modules/account-feedback`
  'feedbackNotRecorded',
] as const
export type CommercialTensionRuleId = (typeof commercialTensionRuleIdValues)[number]
export const commercialTensionRuleIdSchema = z.enum(commercialTensionRuleIdValues)

export const auditContradictionSchema = z.object({
  /** La RÈGLE qui a détecté cette tension (#2064.1-.12) — jamais une phrase
   *  libre : c'est elle qui porte le libellé i18n et le comptage. */
  ruleId: commercialTensionRuleIdSchema,
  /** Les FAITS concernés (#2064.13) — jamais une impression, une liste de
   *  faits déjà classés en `AuditFact` ou nommés en clair. */
  facts: z.array(z.string()),
  /** Pourquoi cela pose une tension (#2064.14). */
  tension: z.string().min(1),
  /** Ce qui pourrait l'expliquer (#2064.15) — jamais présenté comme LE fait :
   *  une hypothèse reste nommée. C'est ce champ qui empêche le produit
   *  d'être accusateur (#2064.18, ton déjà GARDÉ côté prompt IA). */
  possibleExplanation: z.string().nullable(),
  /** Question à valider (#2064.16) — on DEMANDE, on n'affirme pas. */
  questionToValidate: z.string().nullable(),
  /** Conséquence si rien ne change (#2064.17). */
  consequenceIfUnaddressed: z.string().nullable(),
  /** #2066.18 — le geste concret à faire ensuite. Une rupture SANS
   *  recommandation est un reproche, pas un audit. */
  recommendation: z.string().min(1),
  /** #2066.18 — ce qu'il faudrait mesurer pour vérifier que le geste a été
   *  fait. Jamais un nombre : le NOM de ce qu'on suivrait. */
  indicator: z.string().min(1),
  confidence: commercialAuditConfidenceSchema.nullable(),
})
export type AuditContradiction = z.infer<typeof auditContradictionSchema>

// ── Capacity (#2061.9) — RETIRÉ 24/09/2026, jamais un champ mort ──────────
//
// #2061.9 — `auditCapacitySchema` portait un `state: 'measured' | 'unknown'`
// dont la moitié `measured` n'avait AUCUN producteur : la capacité réelle
// n'est structurellement jamais mesurée (voir le docblock de tête de
// `build-audit.ts`, « seule une cadence RECOMMANDÉE existe »), donc rien ne
// pouvait jamais écrire `state: 'measured'`. Le champ `capacity` lui-même
// (`commercialAuditContextSchema`, ci-dessous) était écrit à CHAQUE appel
// (`build-audit.ts`) mais lu par AUCUN composant — la définition même du
// défaut n°1 de ce dépôt (CLAUDE.md « Ce qui est déjà livré »). Choisi contre
// « brancher le champ » : le brancher aurait ajouté un rendu qui répète, sous
// un autre nom, exactement ce que la carte « Cadence » de `AuditHero.tsx:100`
// dit déjà honnêtement (`renderAuditHeadlineText`, cas `'cadence'`) — GA-26,
// un fait vit à un seul endroit. `déjà là`, registre #2061.9.
//
// ── Current commercial machine (#2061.10) — la CHAÎNE d'étapes, contrat ───

/** Le NOM de l'étape reste une chaîne ici à dessein : la liste fermée des 9
 *  étapes (Contact→Capitalisation) est le contenu de #2066, une autre issue.
 *  Ce contrat porte la FORME, #2066 remplira le vocabulaire fermé. */
export const auditMachineStepSchema = z.object({
  step: z.string().min(1),
  state: z.string().nullable(),
  provenance: commercialAuditProvenanceSchema.nullable(),
})
export type AuditMachineStep = z.infer<typeof auditMachineStepSchema>

// ── Funnel (#2061.11) ───────────────────────────────────────────────────

export const auditFunnelStageSchema = z.object({
  stage: z.string().min(1),
  /** `null` = non compté à cette étape — pas un `0` de remplissage. */
  count: z.number().int().nonnegative().nullable(),
  /**
   * #2049.15 — une étape non mesurée se NOMME, elle ne vaut pas 0 %.
   *
   * Ce champ dit si l'ESN COMPTE cette unité, ce qui est une question
   * différente de « combien » : `count` reste `null` partout tant qu'aucun
   * nombre n'est demandé, et c'est `measurement` qui porte le fait connu.
   * Confondre les deux, c'est exactement le défaut que #2049.14 nomme — un
   * taux qui mesurerait la complétude de NOS données.
   *
   * ADDITIF (`.default(null)`) : un audit sérialisé avant ce lot reste
   * lisible, et son silence se lit « non mesuré », jamais « non compté ».
   */
  measurement: z.enum(['tracked', 'notTracked']).nullable().default(null),
})
export type AuditFunnelStage = z.infer<typeof auditFunnelStageSchema>

// ── Maturity — #2065, les 12 axes fermés + ce que porte chacun ───────────
//
// #2065.1-.12 — la LISTE FERMÉE des 12 axes de maturité commerciale. Une
// identité (pas une chaîne libre) pour la même raison que
// `commercialTensionRuleIdValues` ci-dessus : localiser un libellé, compter,
// sans dupliquer le TEXTE dans ce contrat (GA-26 — le libellé vit en i18n,
// `commercialAudit.maturity.axis.<id>.label`).
//
// #2860 (#2045.12-.14, 26/09/2026) — treizième axe `network`, AJOUTÉ à la fin
// de la liste fermée : le réseau personnel DÉCLARÉ à l'onboarding (bandes
// #2045.1/.2/.4/.6/.7, `commercial-audit-signals.ts`) n'était encore relié à
// AUCUN axe. Contrairement aux cinq axes `unknown` du docblock de
// `maturity-axes.ts`, ce signal est déjà DÉCLARÉ (pas déduit par un modèle) —
// aucun prompt IA, aucune calibration : le même patron que
// `AuditSignalsInput` (déclaré, jamais reformulé).
export const auditMaturityAxisIdValues = [
  // #2065.1
  'offerClarity',
  // #2065.2
  'proof',
  // #2065.3
  'targeting',
  // #2065.4
  'access',
  // #2065.5
  'commercialCapacity',
  // #2065.6
  'followUpDiscipline',
  // #2065.7
  'clientQualification',
  // #2065.8
  'candidateSecurisation',
  // #2065.9
  'dataAndTools',
  // #2065.10
  'measurement',
  // #2065.11
  'capitalisation',
  // #2065.12
  'teamAlignment',
  // #2860 (#2045.12-.14)
  'network',
] as const
export type AuditMaturityAxisId = (typeof auditMaturityAxisIdValues)[number]
export const auditMaturityAxisIdSchema = z.enum(auditMaturityAxisIdValues)

/** #2065.14 — le NIVEAU, nommé, jamais le score numérique seul : la doctrine
 *  refuse un nombre nu, et un score décomposé en axes reste un NOMBRE par
 *  axe. Le niveau donne le mot, le score garde la granularité. */
export const auditMaturityLevelValues = ['notStarted', 'emerging', 'structured', 'mature'] as const
export type AuditMaturityLevel = (typeof auditMaturityLevelValues)[number]
export const auditMaturityLevelSchema = z.enum(auditMaturityLevelValues)

/**
 * #2065.13 — l'état de CET axe, distinct de la confiance (#2065.17, qui dit
 * « à quel point je crois cette mesure ») :
 *  - `measured`  : assez de faits pour un score fiable ;
 *  - `partial`   : des faits existent, pas assez pour un score — le score
 *                  reste `null` (non mesuré n'est pas mesuré à zéro) ;
 *  - `unknown`   : aucun fait à lire pour cet axe — le corollaire du lot
 *                  #2064/#2065 : un détecteur/axe sans donnée rend
 *                  « inconnu », jamais « rien à signaler ».
 */
export const auditMaturityAxisStateValues = ['measured', 'partial', 'unknown'] as const
export type AuditMaturityAxisState = (typeof auditMaturityAxisStateValues)[number]
export const auditMaturityAxisStateSchema = z.enum(auditMaturityAxisStateValues)

export const auditMaturityAxisSchema = auditScoreAxisSchema
  .extend({
    id: auditMaturityAxisIdSchema,
    state: auditMaturityAxisStateSchema,
    level: auditMaturityLevelSchema.nullable(),
    /** #2065.15 — les preuves NOMMÉES qui portent ce niveau. */
    evidence: z.array(z.string()).nullable(),
    /** #2065.16 — ce qui manque pour progresser, NOMMÉ. */
    gaps: z.array(z.string()).nullable(),
    /** #2065.18 — le prochain geste, un seul, jamais une liste qui dilue. */
    nextLever: z.string().nullable(),
  })
  .superRefine((value, ctx) => {
    if (value.state === 'unknown' && value.score !== null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "#2065.13 — un axe à l'état « inconnu » ne porte pas de score : ce serait « non mesuré » rendu zéro sous un autre nom",
        path: ['score'],
      })
    }
  })
export type AuditMaturityAxis = z.infer<typeof auditMaturityAxisSchema>

export const auditMaturitySchema = z
  .object({
    /** `null` = pas de score global — les 12 axes restent lisibles quand même. */
    score: z.number().nullable(),
    max: z.number().positive(),
    axes: z.array(auditMaturityAxisSchema),
    reason: z.string().nullable(),
  })
  .superRefine((value, ctx) => {
    if (value.score === null) return
    const evaluated = value.axes.filter(axis => axis.score !== null)
    if (evaluated.length < MINIMUM_SCORE_AXES) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `un score porté par moins de ${MINIMUM_SCORE_AXES} axes évalués n'est pas un score (doctrine : « sous 3 axes il n'y a pas de score »)`,
        path: ['score'],
      })
    }
  })
export type AuditMaturity = z.infer<typeof auditMaturitySchema>

// ── Strategic options (#2061.14 ; potential/prerequisite/limit/load = #2066.20-23) ─

/** #2066.19/.27 — 2 À 5 VOIES, JAMAIS MOINS, JAMAIS PLUS.
 *  « Un audit qui recommande tout ne recommande rien » : la borne basse
 *  empêche une liste à une seule option de se faire passer pour un choix, la
 *  borne haute empêche de tout garder actif. Bornée ICI parce que c'est le
 *  contrat qui doit la tenir, pas chaque écran qui la relit — voir
 *  `commercial-audit-context.test.ts` pour la garde qui le prouve dans les
 *  deux sens. */
export const auditStrategicOptionSchema = z.object({
  label: z.string().min(1),
  potential: z.string().nullable(),
  prerequisite: z.string().nullable(),
  limit: z.string().nullable(),
  load: z.string().nullable(),
})
export type AuditStrategicOption = z.infer<typeof auditStrategicOptionSchema>

// ── Recommended direction (#2061.15) ───────────────────────────────────

export const auditRecommendedDirectionSchema = z.object({
  label: z.string().min(1),
  rationale: z.string().nullable(),
  confidence: commercialAuditConfidenceSchema.nullable(),
})
export type AuditRecommendedDirection = z.infer<typeof auditRecommendedDirectionSchema>

// ── Stop / Keep / Reinforce (#2061.16 — déjà là, `AuditColumn` + écran) ────

export const auditStopKeepReinforceSchema = z.object({
  /** `null` = bloc source manquant (non mesuré) ; `[]` = mesuré, rien à dire. */
  stop: z.array(z.string()).nullable(),
  keep: z.array(z.string()).nullable(),
  reinforce: z.array(z.string()).nullable(),
})
export type AuditStopKeepReinforce = z.infer<typeof auditStopKeepReinforceSchema>

// ── Aires produit — #2068.23-.31 (déplacé ICI, AVANT le plan à 4 semaines) ──
//
// Défini plus tôt qu'à l'origine : `auditWeeklyPrioritySchema` ci-dessous
// (#2068.24-.31, décision Louis 19/09/2026 sur #2068.1) porte désormais un
// champ `domain` qui RÉUTILISE ce même enum — GA-26, une seule liste des
// aires produit, jamais une deuxième déclarée à côté pour l'ordre du fichier.

/** Les 9 aires produit que l'audit peut configurer (#2068.23-.31) — Routines
 *  · Pilotage · Notifications et Matching · Plan d'action restent groupées
 *  ici comme au registre, une entrée chacune. */
export const auditProductAreaValues = [
  'discover',
  'scoring',
  'contacts',
  'orgGraph',
  'messages',
  'sequences',
  'reverseMarket',
  'routinesPilotageNotifications',
  'matchingActionPlan',
] as const
export type AuditProductArea = (typeof auditProductAreaValues)[number]
export const auditProductAreaSchema = z.enum(auditProductAreaValues)

// ── Plan à 4 semaines (#2061.17, refondu par #2068.1-.13) ─────────────────
//
// #2068 — « Plan sur QUATRE semaines », TROIS priorités maximum par semaine,
// chaque priorité avec ses 8 champs (résultat attendu → condition de
// remplacement). Remplace le stub `{action, why}` de #2061.17 : aucun
// consommateur ne lisait encore cette forme (`build-audit.ts` l'écrit
// toujours `null`), donc l'étendre ici ne casse rien — c'est la substance
// même de ce lot.

/** Trois priorités maximum par semaine (#2068.2) — le contrat tient la
 *  borne, pas chaque écran : « ne pas lister 15 projets » (#2068.13). */
export const MAX_WEEKLY_PRIORITIES = 3

export const auditWeeklyPrioritySchema = z.object({
  // #2068.3 — ce que la semaine doit produire, jamais une tâche nue.
  expectedResult: z.string().min(1),
  // #2068.4
  action: z.string().min(1),
  // #2068.5
  owner: z.string().nullable(),
  // #2068.6 — le créneau : `null` tant qu'il n'est pas fixé, jamais un temps
  // SUPPOSÉ disponible (#2068.13, deuxième moitié de la doctrine).
  slot: z.string().nullable(),
  // #2068.7
  dependency: z.string().nullable(),
  // #2068.8
  completionProof: z.string().nullable(),
  // #2068.9 — un lien vers une surface BellumAI EXISTANTE, jamais une URL
  // externe inventée.
  surfaceLink: z.string().nullable(),
  // #2068.10
  replacementCondition: z.string().nullable(),
  /**
   * #2068.1 / #2068.24-.31 — décision Louis 19/09/2026 (2068.11) : la
   * replanification vit dans ACTIONS (GA-26), l'audit y renvoie. Ce champ NOMME
   * le domaine produit (parmi {@link auditProductAreaValues}) que CETTE
   * priorité fait avancer, quand l'élément d'action d'origine porte un objet
   * canonique dont le type se relie à un domaine (le lien type ↔ domaine
   * s'écrit à UN seul endroit, `ACTION_TARGET_DOMAIN` dans `build-audit.ts`
   * côté web — ce contrat ne connaît pas `ActionTargetKind`, il ne connaît que
   * le résultat nommé).
   *
   * ADDITIF (`.default(null)`, comme `measurement` de {@link auditFunnelStageSchema}
   * plus haut) : un plan sérialisé avant ce lot reste lisible, et son silence
   * se lit « domaine non déterminé », jamais une valeur inventée.
   */
  domain: auditProductAreaSchema.nullable().default(null),
})
export type AuditWeeklyPriority = z.infer<typeof auditWeeklyPrioritySchema>

export const auditWeekSchema = z.object({
  weekNumber: z.number().int().min(1).max(4),
  priorities: z.array(auditWeeklyPrioritySchema).max(MAX_WEEKLY_PRIORITIES),
})
export type AuditWeek = z.infer<typeof auditWeekSchema>

/** Exactement 4 semaines quand le plan existe (#2068.1, #2068.12 — la revue
 *  hebdomadaire reste CONSTANTE : un plan qui en saute une ne parse pas). */
export const auditWeeklyPlanSchema = z.array(auditWeekSchema).length(4)

// ── Conditional roadmap (#2061.18) ─────────────────────────────────────

export const auditConditionalRoadmapItemSchema = z.object({
  condition: z.string().min(1),
  then: z.string().min(1),
})
export type AuditConditionalRoadmapItem = z.infer<typeof auditConditionalRoadmapItemSchema>

// ── Product personalization (#2061.19 — déjà là, `AuditConsequence` + écran) ─

export const auditProductPersonalizationSchema = z.object({
  key: z.string().min(1),
  description: z.string().nullable(),
})
export type AuditProductPersonalization = z.infer<typeof auditProductPersonalizationSchema>

// ── Paliers — #2068.14-.21 ──────────────────────────────────────────────
//
// Quatre horizons NOMMÉS (#2068.19), jamais une date d'échéance qui ferait
// avancer un palier toute seule (#2068.21, doctrine : « on ne passe pas au
// palier suivant parce que le temps a passé ») — `passageCondition` est la
// SEULE porte. Aucun champ n'est un chiffre nu (#2068.20, « produire une
// trajectoire, jamais une promesse » — même esprit que `bellum_plan.py:389`) :
// chaque colonne est un TEXTE, gardé par le test qui scanne le shape.

export const auditMilestoneHorizonValues = ['60d', '90d', '6m', '12m'] as const
export type AuditMilestoneHorizon = (typeof auditMilestoneHorizonValues)[number]
export const auditMilestoneHorizonSchema = z.enum(auditMilestoneHorizonValues)

export const auditMilestoneSchema = z.object({
  horizon: auditMilestoneHorizonSchema,
  // #2068.14 — un objectif de SYSTÈME (un mécanisme qui tourne), pas un
  // chiffre à atteindre.
  systemObjective: z.string().nullable(),
  // #2068.15
  expectedProof: z.string().nullable(),
  // #2068.16
  passageCondition: z.string().nullable(),
  // #2068.17
  decisionToMake: z.string().nullable(),
  // #2068.18
  correctionIfNotReached: z.string().nullable(),
})
export type AuditMilestone = z.infer<typeof auditMilestoneSchema>

// ── Configuration produit — #2068.22-.33 ────────────────────────────────
//
// DISTINCT de `auditProductPersonalizationSchema` ci-dessus (#2061.19, déjà
// câblé à `AuditConsequences.tsx`) : celui-ci porte une PHRASE descriptive
// par règle déjà mesurée sur le profil. #2068.22 documente qu'aucune
// configuration EFFECTIVE n'existe encore — ce bloc-ci porte des
// PARAMÈTRES, un par aire produit, tracés à la réponse ou conclusion qui
// les justifie (#2068.33). Les deux blocs COEXISTENT, ils ne se
// remplacent pas — un second chemin qui répondrait à la même question
// autrement est exactement ce que ce lot doit éviter.
//
// `auditProductAreaValues` / `AuditProductArea` / `auditProductAreaSchema`
// vivent maintenant plus haut dans ce fichier (avant « Plan à 4 semaines ») :
// `auditWeeklyPrioritySchema.domain` (#2068.24-.31) les réutilise, et un
// `const` référencé avant sa déclaration ne s'exécute pas (TDZ) — GA-26 reste
// tenu, la LISTE elle-même ne bouge pas, un seul endroit la déclare.

/** #2068.33 — la réponse ou conclusion VALIDÉE dont un paramètre remonte.
 *  Jamais une provenance générique seule : la doctrine demande la PREUVE
 *  (l'énoncé validé), `provenance` (source + date) vient en complément. */
export const auditParameterTraceSchema = z.object({
  statement: z.string().min(1),
  provenance: commercialAuditProvenanceSchema.nullable(),
})
export type AuditParameterTrace = z.infer<typeof auditParameterTraceSchema>

/** #2068.32 — un exemple de clé possible : niveau de contacts, stratégie
 *  d'entrée, ton, longueur, territoires, preuves, canaux, fréquence, no-go,
 *  seuils, capacité. `key` reste une chaîne ouverte ici à dessein : la
 *  liste FERMÉE par aire est un chantier séparé (même principe que
 *  `auditMachineStepSchema.step`, #2066 hors lot). */
export const auditProductParameterSchema = z
  .object({
    key: z.string().min(1),
    /** `null` = paramètre pas encore établi — jamais une valeur inventée. */
    value: z.string().nullable(),
    /** `null` UNIQUEMENT si `value` est aussi `null` — voir `.superRefine`
     *  ci-dessous : un paramètre VALEUR sans trace n'est pas un paramètre,
     *  c'est une supposition (#2068.33). */
    trace: auditParameterTraceSchema.nullable(),
  })
  .superRefine((value, ctx) => {
    if (value.value !== null && value.trace === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "#2068.33 — un paramètre avec une valeur remonte à une réponse ou conclusion VALIDÉE ; sans trace, ce n'est pas un paramètre, c'est une supposition",
        path: ['trace'],
      })
    }
  })
export type AuditProductParameter = z.infer<typeof auditProductParameterSchema>

export const auditProductAreaConfigurationSchema = z.object({
  area: auditProductAreaSchema,
  parameters: z.array(auditProductParameterSchema),
})
export type AuditProductAreaConfiguration = z.infer<typeof auditProductAreaConfigurationSchema>

// ── L'objet racine ───────────────────────────────────────────────────────

export const commercialAuditContextSchema = z.object({
  schemaVersion: z.number().int().positive(),
  /**
   * Date ISO de production — celle de l'INSTANTANÉ de profil dont l'audit est
   * dérivé (`ProfileContextRevisionSummary.created_at`), jamais un `new
   * Date()` pris au moment du calcul : cet objet est recalculé À LA VOLÉE à
   * chaque rendu, donc un horodatage de calcul serait INDISCERNABLE de
   * l'instant présent — exactement le piège que `computed-at.ts` refuse
   * structurellement (`deriveComputedAt` → `{ kind: 'live' }`). `null` tant
   * qu'aucun instantané de profil n'existe encore : rien à dater sincèrement.
   */
  generatedAt: z.string().nullable(),
  /**
   * #2061.24 — le pont de version avec `ProfileContext` : le même numéro que
   * `ProfileContextRevisionSummary.version` dont cet audit a été produit, et
   * dont `generatedAt` ci-dessus reprend la date. `null` tant qu'aucun
   * instantané de profil n'existe encore (même état que `CommercialAudit.
   * version` dans `build-audit.ts`) — les DEUX champs sont null ENSEMBLE, ou
   * remplis ENSEMBLE, jamais l'un sans l'autre : ce sont deux faces de la
   * MÊME référence.
   */
  profileContextVersion: z.number().int().positive().nullable(),

  // #2061.2
  scope: z.string().nullable(),
  // #2061.3
  facts: z.array(auditFactSchema).nullable(),
  // #2061.5 (déjà là sous `unestablished` — la forme NOMMÉE ici)
  unknowns: z.array(auditUnknownSchema).nullable(),
  // #2061.6
  contradictions: z.array(auditContradictionSchema).nullable(),
  // #2061.7
  assets: z.array(auditNamedNoteSchema).nullable(),
  // #2061.8
  constraints: z.array(auditNamedNoteSchema).nullable(),
  // #2061.9 — RETIRÉ 24/09/2026 : voir le docblock au-dessus d'`auditContradictionSchema`.
  // #2061.10
  currentCommercialMachine: z.array(auditMachineStepSchema).nullable(),
  // #2061.11 — #2049.15 : les onze unités comparables, chacune comptée ou NON
  // COMPTÉE. `null` = la question n'a pas été posée (« on n'a pas demandé »),
  // ce qui n'est pas « rien n'est suivi ».
  funnel: z.array(auditFunnelStageSchema).nullable(),
  // #2061.12
  breakpoints: z.array(auditNamedNoteSchema).nullable(),
  // #2061.13
  maturity: auditMaturitySchema.nullable(),
  // #2061.14 — #2066.19/.27 : 2 à 5 voies, jamais moins, jamais plus.
  strategicOptions: z.array(auditStrategicOptionSchema).min(2).max(5).nullable(),
  // #2061.15
  recommendedDirection: auditRecommendedDirectionSchema.nullable(),
  // #2061.16 (déjà là)
  stopKeepReinforce: auditStopKeepReinforceSchema.nullable(),
  // #2061.17 — refondu par #2068.1-.13 : 4 semaines, 3 priorités max/semaine.
  thirtyDayPlan: auditWeeklyPlanSchema.nullable(),
  // #2061.18
  conditionalRoadmap: z.array(auditConditionalRoadmapItemSchema).nullable(),
  // #2061.19 (déjà là)
  productPersonalization: z.array(auditProductPersonalizationSchema).nullable(),
  // #2061.20
  questionsToRevisit: z.array(z.string()).nullable(),
  // #2068.14-.21
  milestones: z.array(auditMilestoneSchema).nullable(),
  // #2068.22-.33
  productConfiguration: z.array(auditProductAreaConfigurationSchema).nullable(),
  /**
   * #2042.15 / #2043.10 / #2049.15 / #2050.14 / #2051.16 — CE QUE LA PERSONNE A
   * RÉPONDU, lu par l'audit.
   *
   * Le trou que ce champ referme : les réponses du Temps 1 étaient collectées,
   * stockées et envoyées au modèle, mais l'audit ne lit que `ProfileContext` —
   * la SORTIE du Profileur, pas les réponses. Cinq demandes y tombaient, chacune
   * parquée dans un commentaire source (« N'EST PAS ici »).
   *
   * ⚠️ Ces cinq signaux ne traversent DÉLIBÉRÉMENT pas le modèle : ce sont des
   * faits cochés par la personne, et un fait reformulé par un modèle ne se
   * distingue plus d'un fait inventé une fois stocké. La dérivation est pure
   * (`commercial-audit-signals.ts`), et `null` dit qu'aucune réponse n'a pu
   * être lue — jamais qu'il n'y en a pas.
   */
  declaredSignals: auditDeclaredSignalsSchema.nullable(),
  /**
   * #2067.2 / #2067.4 / #2067.5 / #2067.6 — L'ARBITRAGE DE LA CHARGE ACTIVE :
   * partenaires, créneaux, réserve, éléments à reporter, DÉRIVÉS des réponses
   * déclarées et du budget de fronts ci-dessus (`commercial-audit-active-load.ts`
   * dit d'où chacun vient et ce qui le rend « non établi »). `null` = pas dérivé.
   */
  activeLoad: auditActiveLoadSchema.nullable(),
})
export type CommercialAuditContext = z.infer<typeof commercialAuditContextSchema>
