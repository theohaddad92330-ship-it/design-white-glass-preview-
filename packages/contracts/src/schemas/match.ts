import { z } from 'zod'
import { CONSULTANT_MATCH_VERDICTS, consultantMatchVerdictSchema, type ConsultantMatchVerdict } from './consultant.js'
import { MIN_AXES_FOR_SCORE } from './mission-scores.js'
import { feedbackAxisSchema } from './submission.js'
import { consentStateSchema } from './talent-consent.js'

/**
 * Le MATCHING besoin ↔ consultant (PDF 4, §2 à §4).
 *
 * Ce fichier est le contrat, pas le moteur : les douze fonctions de calcul
 * vivent côté API (`modules/consultants/matching/`), sous la garde GA-06 qui
 * refuse qu'un critère protégé y entre. Elles n'y sont pas par confort de
 * rangement — c'est le seul endroit qu'un test statique peut surveiller.
 *
 * Trois règles portent tout le module, et chacune existe contre une erreur
 * précise :
 *
 *  - **deux scores, jamais fondus.** « 92 / 31 » veut dire « profil parfait,
 *    indisponible jusqu'en novembre » ; un chiffre unique de 61 ne veut rien
 *    dire du tout, et c'est celui qu'on regarderait.
 *  - **`null` n'est pas zéro.** Un axe qu'on ne peut pas évaluer sort du
 *    dénominateur au lieu de coûter des points : sinon le score mesure la
 *    complétude de nos données, pas l'adéquation de la personne.
 *  - **aucun profil écarté sans code de motif.** C'est une exigence de
 *    conformité (AI Act, droit à l'explication), pas une préférence
 *    d'interface : un candidat doit pouvoir apprendre POURQUOI il n'a pas été
 *    proposé.
 */

/* ------------------------------------------------------------------ */
/* Les douze axes                                                      */
/* ------------------------------------------------------------------ */

export const MATCH_AXES = [
  'must_have',
  'nice_to_have',
  'seniority',
  'sector',
  'environment',
  'language',
  'location',
  'availability',
  'contract_status',
  'rate',
  'evidence_quality',
  'client_constraints',
  /**
   * #2176.21 — ajouté en FIN de liste (GA-08, un enum n'insère jamais au
   * milieu). Distinct de `client_constraints` : celui-ci répond « CE client a-t-il
   * déjà dit non ? » (binaire) ; `risks` porte les signaux GRADUÉS du profil
   * lui-même (consentement qui approche de son échéance, disponibilité non
   * revalidée, positionnements concurrents en cours, préférences déclarées) qui
   * n'existaient jusqu'ici que comme drapeaux sans jamais peser dans un score.
   */
  'risks',
  /**
   * #4072.6 — ajouté en FIN de liste (GA-08). « Ce client nous a-t-il déjà dit
   * oui, déjà dit non, déjà demandé la même chose ? » : l'affaire gagnée ou
   * perdue chez CE compte et le besoin récurrent (faits du compte, #4069), pesés
   * par l'âge. Nommé par sa NATURE, jamais par la source du fait.
   */
  'client_history',
  /**
   * #2176.13 — ajouté en FIN de liste (GA-08). « Ce profil a-t-il déjà fait,
   * EN MISSION, ce que ce besoin demande ? » : la part des compétences
   * obligatoires prouvées par une mission passée. Arbitrage Louis (31/10/2026) :
   * VISIBLE mais à POIDS 0 — il se lit dans la carte, la comparaison et
   * l'explication, il ne déplace ni un score ni un rang
   * ({@link MATCH_DISPLAY_ONLY_AXES}). « Non évaluable » reste nommé, jamais 0.
   */
  'comparable_experience',
] as const
export const matchAxisSchema = z.enum(MATCH_AXES)
export type MatchAxis = (typeof MATCH_AXES)[number]

/**
 * #2176.13 — les axes AFFICHÉS SEULEMENT : poids figé à 0, quel que soit le
 * réglage d'un espace ({@link normaliseMatchWeights} le force), et jamais
 * comptés pour décider qu'un score est mesuré ({@link matchScoreIsMeasured}).
 * Leur donner du poids est une décision de doctrine, pas un réglage.
 */
export const MATCH_DISPLAY_ONLY_AXES = ['comparable_experience'] as const satisfies readonly MatchAxis[]
const DISPLAY_ONLY: ReadonlySet<MatchAxis> = new Set(MATCH_DISPLAY_ONLY_AXES)
export function isDisplayOnlyMatchAxis(axis: MatchAxis): boolean {
  return DISPLAY_ONLY.has(axis)
}

/**
 * Les poids par défaut (§3). Σ = 100.
 *
 * Ils sont RÉGLABLES par espace et mémorisés avec leur date : une pondération
 * qui change sans laisser de trace rend inexplicable un classement d'il y a
 * trois mois — or c'est précisément celui qu'on vient demander d'expliquer.
 */
export const MATCH_AXIS_WEIGHTS: Readonly<Record<MatchAxis, number>> = {
  // #4072.6 — 3 points pris sur must_have (-1), nice_to_have (-1) et seniority
  // (-1) pour financer `client_history`, comme `risks` l'avait été (#2176.21).
  must_have: 23,
  nice_to_have: 6,
  seniority: 8,
  sector: 7,
  environment: 7,
  language: 5,
  location: 8,
  availability: 11,
  contract_status: 4,
  rate: 7,
  evidence_quality: 4,
  client_constraints: 2,
  // #2176.21 — -1 point pris sur cinq axes (must_have/nice_to_have/seniority/
  // sector/availability) pour financer ce nouvel axe sans redistribution
  // brutale ni casser le golden set (`consultant-matching.golden.spec.ts`).
  risks: 5,
  client_history: 3,
  // #2176.13 — affiché, jamais pesé : aucun point pris aux quatorze autres.
  comparable_experience: 0,
}

// #2176.13 — un axe affiché seulement n'accepte que 0, et une pondération
// journalisée AVANT lui (clé absente) se relit à 0 au lieu d'être rejetée.
export const matchWeightsSchema = z.object(
  Object.fromEntries(
    MATCH_AXES.map(axis => [
      axis,
      isDisplayOnlyMatchAxis(axis) ? z.number().int().min(0).max(0).default(0) : z.number().int().min(0).max(100),
    ]),
  ) as Record<MatchAxis, z.ZodNumber>,
)
export type MatchWeights = z.infer<typeof matchWeightsSchema>

/**
 * Ramène une pondération à un total de 100 sans jamais rendre `NaN`.
 *
 * Un espace qui met tous les poids à zéro n'obtient pas une division par zéro :
 * il retombe sur les poids par défaut. Un réglage absurde doit dégrader vers le
 * comportement connu, pas casser l'écran.
 */
export function normaliseMatchWeights(weights: Partial<Record<MatchAxis, number>>): MatchWeights {
  // #2176.13 — un axe affiché seulement reste à 0, quoi qu'en dise le réglage.
  const raw = MATCH_AXES.map(axis =>
    isDisplayOnlyMatchAxis(axis) ? 0 : Math.max(0, Math.round(weights[axis] ?? MATCH_AXIS_WEIGHTS[axis])),
  )
  const total = raw.reduce((sum, value) => sum + value, 0)
  if (total <= 0) return { ...MATCH_AXIS_WEIGHTS }
  // Répartition au plus grand reste : la somme fait EXACTEMENT 100, sinon deux
  // espaces aux mêmes réglages n'auraient pas la même échelle de score.
  const scaled = raw.map(value => (value * 100) / total)
  const floors = scaled.map(Math.floor)
  let remainder = 100 - floors.reduce((sum, value) => sum + value, 0)
  const order = scaled
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index)
  const result = [...floors]
  for (const entry of order) {
    if (remainder <= 0) break
    result[entry.index] = (result[entry.index] ?? 0) + 1
    remainder -= 1
  }
  return Object.fromEntries(MATCH_AXES.map((axis, index) => [axis, result[index] ?? 0])) as MatchWeights
}

/* ------------------------------------------------------------------ */
/* Les motifs d'exclusion — liste FERMÉE (§4.1)                        */
/* ------------------------------------------------------------------ */

export const EXCLUSION_REASONS = [
  'missing_required_skill',
  'unavailable_at_start',
  'out_of_zone',
  'previously_rejected_by_client',
  'already_on_mission_at_client',
  'consent_expired',
  'contract_mismatch',
  'rate_out_of_range',
  'no_skills_recorded',
  'language_mismatch',
  'clearance_missing',
] as const
export const exclusionReasonSchema = z.enum(EXCLUSION_REASONS)
export type ExclusionReason = (typeof EXCLUSION_REASONS)[number]

export const EXCLUSION_SEVERITIES = ['blocking', 'warning', 'not_evaluable'] as const
export const exclusionSeveritySchema = z.enum(EXCLUSION_SEVERITIES)
export type ExclusionSeverity = (typeof EXCLUSION_SEVERITIES)[number]

/**
 * Ce que chaque motif FAIT du profil (§4.1).
 *
 * `warning` n'écarte pas : « déjà refusé chez ce client » descend le score et se
 * dit, mais c'est le recruteur qui tranche — un refus sur le prix en janvier
 * n'interdit pas une proposition en septembre.
 */
export const EXCLUSION_SEVERITY: Readonly<Record<ExclusionReason, ExclusionSeverity>> = {
  missing_required_skill: 'blocking',
  unavailable_at_start: 'blocking',
  out_of_zone: 'blocking',
  previously_rejected_by_client: 'warning',
  already_on_mission_at_client: 'warning',
  consent_expired: 'blocking',
  contract_mismatch: 'warning',
  rate_out_of_range: 'warning',
  no_skills_recorded: 'not_evaluable',
  language_mismatch: 'blocking',
  clearance_missing: 'blocking',
}

export const matchExclusionSchema = z.object({
  reason: exclusionReasonSchema,
  severity: exclusionSeveritySchema,
  /** La phrase qu'on montre. Jamais vide : un motif sans explication n'explique rien. */
  detail: z.string().min(1),
})
export type MatchExclusion = z.infer<typeof matchExclusionSchema>

/* ------------------------------------------------------------------ */
/* Les quatre blocs (§4)                                               */
/* ------------------------------------------------------------------ */

/**
 * Quatre blocs, jamais trois.
 *
 * `not_evaluable` est le bloc qui fait la différence : un profil dont on ignore
 * la disponibilité n'est pas un profil qui ne convient pas. Les fondre ferait
 * disparaître, sans un mot, tous les gens dont la fiche est incomplète.
 */
export const MATCH_BUCKETS = ['recommended', 'borderline', 'excluded', 'not_evaluable'] as const
export const matchBucketSchema = z.enum(MATCH_BUCKETS)
export type MatchBucket = (typeof MATCH_BUCKETS)[number]

/** Le seuil de « recommandé » (D22) — paramétrable par espace, défaut 60. */
export const MATCH_DEFAULT_THRESHOLD = 60

/** Le plafond d'une shortlist (§9.1). « Une shortlist de 12 n'est pas une shortlist. » */
export const SHORTLIST_MAX = 5

/* ------------------------------------------------------------------ */
/* Preuves, compétences, axes                                          */
/* ------------------------------------------------------------------ */

/**
 * D'où vient une preuve.
 *
 * `model` n'y figure pas : les douze axes sont déterministes (D26). Une preuve
 * qu'un modèle aurait produite ne serait pas reproductible, et le classement
 * doit l'être.
 */
export const MATCH_EVIDENCE_SOURCES = ['mission', 'interview', 'cv', 'declared', 'derived'] as const
export const matchEvidenceSourceSchema = z.enum(MATCH_EVIDENCE_SOURCES)
export type MatchEvidenceSource = (typeof MATCH_EVIDENCE_SOURCES)[number]

export const matchEvidenceSchema = z.object({
  label: z.string().min(1),
  source: matchEvidenceSourceSchema,
})
export type MatchEvidence = z.infer<typeof matchEvidenceSchema>

/**
 * Le sort d'UNE compétence attendue par le besoin.
 *
 * `unverified` — #2328.24 (second volet) : le terme demandé EST présent, mais
 * seulement par une extraction automatique (`inferred`), jamais validée par le
 * consultant ni le recruteur. Une compétence inférée ne satisfait JAMAIS un
 * must-have : elle est signalée, jamais comptée dans la couverture — même
 * discipline que `adjacent`, pour une raison différente (le terme est exact,
 * la preuve ne l'est pas).
 */
export const MATCH_SKILL_STATUSES = ['matched', 'adjacent', 'missing', 'unverified'] as const
export const matchSkillStatusSchema = z.enum(MATCH_SKILL_STATUSES)
export type MatchSkillStatus = (typeof MATCH_SKILL_STATUSES)[number]

export const matchSkillSchema = z.object({
  /** Le terme canonique, celui qui sert au rapprochement. */
  term: z.string().min(1),
  /** Le libellé ÉCRIT — c'est lui qui s'affiche. Le canonique range « PostgreSQL »
   *  sous « sql » : utile pour trouver, désastreux sur un dossier client. */
  label: z.string().min(1),
  required: z.boolean(),
  status: matchSkillStatusSchema,
  /** 0 à 1 — la couverture du §3.1, avant pondération par le poids de la compétence. */
  coverage: z.number().min(0).max(1),
  level: z.string().nullable(),
  source: matchEvidenceSourceSchema.nullable(),
  /** La preuve lisible. Vide pour `missing` : on ne fabrique pas la justification d'une absence. */
  proof: z.string().nullable(),
  /** `true` quand la compétence est là sans niveau évalué — devient une question, jamais une pénalité. */
  levelUnknown: z.boolean(),
})
export type MatchSkill = z.infer<typeof matchSkillSchema>

/**
 * Ce classement porte-t-il un SCORE, ou n'en porte-t-il aucun ?
 *
 * `weightedScore` rend `0` quand aucun axe n'est évaluable — pour ne pas diviser
 * par zéro, ce qui est juste au calcul. Et le pré-filtrage compose des résultats
 * `axes: []` avec deux zéros, parce que le contrat ne les accepte pas nullables.
 * Ces deux zéros ne sont pas des notes : ils sont l'absence de note.
 *
 * La question se pose donc partout où un score s'affiche — la carte, le tableau
 * de comparaison, le document d'explication remis à la personne — et elle se
 * répond ICI, une seule fois. Trois lecteurs qui la reposeraient chacun à leur
 * façon finiraient par répondre trois choses différentes du même profil.
 *
 * La borne est celle du dépôt, pas une nouvelle : {@link MIN_AXES_FOR_SCORE}.
 * « Un score n'est jamais nu ; sous trois axes, il n'y a pas de score. »
 */
export function matchScoreIsMeasured(axes: readonly { score: number | null; axis?: MatchAxis }[]): boolean {
  // #2176.13 — un axe à poids 0 ne pèse pas : il ne rend pas non plus un score « mesuré ».
  return (
    axes.filter(axis => axis.score !== null && !(axis.axis && isDisplayOnlyMatchAxis(axis.axis))).length >=
    MIN_AXES_FOR_SCORE
  )
}

export const matchAxisResultSchema = z.object({
  axis: matchAxisSchema,
  /** 0 à 100, ou `null` = non évaluable → hors dénominateur, jamais une pénalité. */
  score: z.number().min(0).max(100).nullable(),
  weight: z.number().int().min(0).max(100),
  detail: z.string(),
  evidence: z.array(matchEvidenceSchema),
})
export type MatchAxisResult = z.infer<typeof matchAxisResultSchema>

export const MATCH_FLAGS = [
  'previously_rejected_by_client',
  'already_on_mission_at_client',
  'active_submission_elsewhere',
  'availability_not_revalidated',
  'consent_expiring',
  'consent_missing',
  'preference_warning',
] as const
export const matchFlagKindSchema = z.enum(MATCH_FLAGS)
export type MatchFlagKind = (typeof MATCH_FLAGS)[number]

export const matchFlagSchema = z.object({
  kind: matchFlagKindSchema,
  detail: z.string().min(1),
  /**
   * QUAND — la date du fait qui a levé le drapeau, quand elle existe.
   *
   * `null`/absent = le fait n'a pas de date (un positionnement encore ouvert,
   * une préférence déclarée). On n'en invente jamais une : « déjà refusé chez
   * ce client » sans date se lit comme un refus d'hier, et c'est exactement la
   * lecture qui fait renoncer à reproposer quelqu'un refusé il y a trois ans.
   *
   * Le panneau du VIVIER l'affichait déjà (`ConsultantMatchPanel`), le tiroir
   * du BESOIN — l'écran où l'on rapproche — non : la donnée s'arrêtait à
   * `matching.service.ts`, qui recopiait `flag`, `reason` et `recoverable` et
   * laissait `at` derrière lui.
   */
  at: z.string().nullable().optional(),
})
export type MatchFlag = z.infer<typeof matchFlagSchema>

/**
 * De quelle COULEUR se lit chaque drapeau.
 *
 * ⚠️ Ce n'est PAS une sévérité, et les deux ne doivent pas être confondues.
 * `EXCLUSION_SEVERITY.previously_rejected_by_client` vaut `warning` et c'est
 * juste : un refus antérieur n'écarte personne, c'est le recruteur qui tranche.
 * Mais un refus client ne se lit pas comme un consentement bientôt échu — la
 * source demande le ROUGE « à l'endroit où l'on rapproche », parce que
 * repousser un profil déjà refusé est la façon la plus rapide de perdre un
 * compte.
 *
 * La table vit ici et non dans la carte : deux écrans montrent ces drapeaux, et
 * une couleur choisie dans le JSX de l'un ne suivrait pas l'autre.
 */
export const MATCH_FLAG_TONES: Readonly<Record<MatchFlagKind, 'danger' | 'warning'>> = {
  previously_rejected_by_client: 'danger',
  already_on_mission_at_client: 'danger',
  active_submission_elsewhere: 'warning',
  availability_not_revalidated: 'warning',
  consent_expiring: 'warning',
  consent_missing: 'danger',
  preference_warning: 'warning',
}

/**
 * #2176.3 — une version de CV déjà PRÉPARÉE pour CE besoin précis
 * (`cv_versions.need_id`), pas une compétence de plus : une preuve qu'un
 * dossier ciblé existe déjà, distincte de `skills[].source === 'cv'`.
 * `null`/absent = aucune version ciblée sur ce besoin — jamais un axe,
 * jamais un poids : elle ne pèse dans aucun score, elle se lit à côté.
 */
export const matchTargetedCvVersionSchema = z.object({
  versionId: z.string().guid(),
  generatedAt: z.string(),
  highlightedSkills: z.array(z.string()),
})
export type MatchTargetedCvVersion = z.infer<typeof matchTargetedCvVersionSchema>

export const matchResultSchema = z.object({
  consultantId: z.string().guid(),
  axes: z.array(matchAxisResultSchema),
  /** 0-100 sur les seuls axes ÉVALUABLES. */
  correspondenceScore: z.number().int().min(0).max(100),
  /** 0-100. « Ce profil peut-il partir chez ce client ? » — jamais fondu avec le précédent. */
  pushableScore: z.number().int().min(0).max(100),
  bucket: matchBucketSchema,
  exclusions: z.array(matchExclusionSchema),
  skills: z.array(matchSkillSchema),
  /** Ce qui manque, dit en clair. Repris MOT POUR MOT par le dossier de compétences (§12). */
  gaps: z.array(z.string()),
  /** « a fait Flink, pas Spark Streaming » — signalé, jamais compté dans `matched`. */
  adjacency: z.array(z.string()),
  /** La trame de l'appel de qualification, générée à partir des écarts (§4.2). */
  questionsToValidate: z.array(z.string()),
  flags: z.array(matchFlagSchema),
  /** #2176.3 — pass-through de `MatchCandidate.targetedCvVersion`, jamais
   *  recalculé. Optionnel pour la même raison que sur `MatchCandidate`. */
  targetedCvVersion: matchTargetedCvVersionSchema.nullable().optional(),
})
export type MatchResult = z.infer<typeof matchResultSchema>

/**
 * #2330.5 — les mêmes CINQ verdicts nommés que `consultant.ts` (LAU-FINAL-071).
 *
 * Une seule liste pour les deux moteurs de rapprochement (GA-26) : ce fichier
 * ne la redéfinit pas, il la reprend.
 */
export const MATCH_VERDICTS = CONSULTANT_MATCH_VERDICTS
export const matchVerdictSchema = consultantMatchVerdictSchema
export type MatchVerdict = ConsultantMatchVerdict

/**
 * #2330.1/.5 — le verdict NOMMÉ d'un résultat de matching, jamais un
 * pourcentage seul (recette ÉCRAN 23/09 : « Correspondance 59 / Poussable 70 »
 * sans verdict — LAU-FINAL-071 réfuté sur ce point).
 *
 * ⚠️ Cette fonction ne touche PAS `classify()` ni `MATCH_BUCKETS` : « quatre
 * blocs, jamais trois » (§4) reste la RÉPARTITION en compartiments d'un
 * classement, une obligation distincte du verdict qui, lui, est le jugement
 * nommé affiché sur CHAQUE carte à l'intérieur d'un bloc.
 *
 * `bucket === 'borderline'` recouvre deux situations que `classify()`
 * distingue déjà EN INTERNE sans les nommer (engine.ts) :
 *  - une donnée DÉCISIVE bloque (exclusion `blocking`) mais la correspondance
 *    reste bonne → `alternative`, un compromis identifiable ;
 *  - rien ne bloque mais le poussable reste sous le seuil → `a_qualifier`,
 *    rien n'empêche de proposer, une information reste à confirmer.
 *
 * NO-GO (#2330.3/.9) : `classify()` ne range JAMAIS un profil sous exclusion
 * bloquante dans `recommended` — mais cette fonction ne le SUPPOSE pas, elle
 * le VÉRIFIE : le blocage est lu en premier, indépendamment du bucket reçu,
 * si bien qu'un profil bloqué ne peut jamais rendre `fortement_defendable`,
 * quel que soit son score ou le bucket qu'on lui donnerait. Un must-have
 * absent n'est donc jamais compensé par des souhaitables cumulés (#2330.3).
 */
export function deriveMatchVerdict(bucket: MatchBucket, exclusions: readonly MatchExclusion[]): MatchVerdict {
  if (bucket === 'not_evaluable') return 'non_evaluable'
  const blocked = exclusions.some(exclusion => exclusion.severity === 'blocking')
  if (bucket === 'excluded') return 'non_defendable'
  if (bucket === 'recommended') return blocked ? 'alternative' : 'fortement_defendable'
  return blocked ? 'alternative' : 'a_qualifier'
}

/**
 * #2330.6 — la prochaine étape, DÉDUITE du verdict et du premier écart réel.
 *
 * Jamais une phrase générique déconnectée du profil : quand un motif bloquant
 * ou une question à valider existe, il devient l'action. `null` sur
 * `non_defendable` — il n'y a rien à FAIRE avec CE profil sur CE besoin,
 * chercher ailleurs n'est pas une action sur lui. Même vocabulaire que
 * `recommendedStepFor` (`apps/api/.../consultant-matching.ts`) — le même
 * verdict doit suggérer le même type d'action sur les deux écrans.
 */
export function matchNextAction(
  verdict: MatchVerdict,
  result: { exclusions: readonly MatchExclusion[]; questionsToValidate: readonly string[] },
): string | null {
  switch (verdict) {
    case 'non_evaluable':
      return "compléter la fiche (disponibilité ou compétences) avant de pouvoir l'évaluer"
    case 'non_defendable':
      return null
    case 'alternative': {
      const blocking = result.exclusions.find(exclusion => exclusion.severity === 'blocking')
      return blocking
        ? `vérifier avec le client : ${blocking.detail}`
        : 'vérifier le compromis avec le client avant de proposer'
    }
    case 'a_qualifier':
      return result.questionsToValidate[0]
        ? `lever le doute : ${result.questionsToValidate[0]}`
        : 'confirmer les zones d’ombre avant de proposer'
    case 'fortement_defendable':
      return 'proposer ce profil au client'
  }
}

/* ------------------------------------------------------------------ */
/* Le besoin, tel que le moteur le voit                                */
/* ------------------------------------------------------------------ */

export const REMOTE_MODES = ['on_site', 'hybrid', 'remote'] as const
export const remoteModeSchema = z.enum(REMOTE_MODES)

export const matchNeedSkillSchema = z.object({
  term: z.string().min(1),
  label: z.string().min(1),
  required: z.boolean(),
  /** Le niveau attendu, quand il est écrit. `null` = pas demandé, donc pas comparé. */
  level: z.string().nullable(),
})

/**
 * Les critères d'un matching — FIGÉS dans le journal.
 *
 * Le journal conserve cet objet tel quel, avec la pondération employée. C'est ce
 * qui rend l'explication reproductible six mois plus tard, même si le besoin a
 * été modifié entre-temps.
 */
export const MATCH_CLIENT_FACT_KINDS = ['deal_won', 'deal_lost', 'mission', 'need'] as const
export const matchClientFactSchema = z
  .object({
    kind: z.enum(MATCH_CLIENT_FACT_KINDS),
    date: z.string(),
    label: z.string().min(1).max(280),
  })
  .strict()
export type MatchClientFact = z.infer<typeof matchClientFactSchema>

export const matchNeedSchema = z.object({
  needId: z.string().guid().nullable(),
  role: z.string(),
  accountName: z.string().nullable(),
  /**
   * #2551.1 — l'ID vérifiable du compte, quand le besoin en a un.
   *
   * `accountName` seul ne suffit pas pour aller chercher les INTERLOCUTEURS du
   * compte (« comptes compatibles » de la prospection inversée, #2551) : deux
   * comptes homonymes existent, et un rapprochement par nom serait le
   * « rapprochement approximatif » que la doctrine interdit. Optionnel pour ne
   * pas casser les littéraux `MatchNeed` déjà écrits par les tests du moteur,
   * qui n'ont jamais eu à connaître ce champ pour vérifier un score.
   */
  accountId: z.string().guid().nullable().optional(),
  /**
   * #4346 — l'ID VÉRIFIABLE du projet du besoin, quand il en a un. « Ajouter à un
   * besoin » (fiche consultant) liste des projets : sans cet id, relier un besoin
   * rapproché à un projet se ferait par le nom, le rapprochement approximatif que
   * la doctrine interdit. Optionnel : un besoin existe sans projet (#2558.1).
   */
  projectId: z.string().guid().nullable().optional(),
  /**
   * #4072.6 — ce que l'espace sait de CE client, tiré des faits du compte
   * (#4069) : affaires gagnées/perdues, missions, besoins déjà exprimés. Daté
   * (le moteur décote par l'âge, aucune coupure), sans provenance. Absent ⇒
   * l'axe `client_history` sort du dénominateur (non mesuré ≠ 0).
   */
  clientHistory: z.array(matchClientFactSchema).optional(),
  /** Le secteur du COMPTE — un contexte relationnel, pas la demande. */
  accountSector: z.string().nullable(),
  /**
   * Les secteurs d'application du PROJET (addendum Stelya §4.1, §14.1).
   *
   * C'est eux qui font foi quand ils existent : « le secteur doit être porté par
   * la mission, pas par le compte ». Un même compte industriel porte un projet
   * d'automatisation automobile et un projet de maintenance nucléaire ; leur
   * appliquer le secteur du groupe rend interchangeables deux profils qui ne le
   * sont pas.
   *
   * Vide ⇒ repli sur `accountSector`, et l'explication le DIT — un repli tu se
   * lit comme une donnée.
   */
  projectSectors: z.array(z.string()).default([]),
  skills: z.array(matchNeedSkillSchema),
  /** Années d'expérience attendues, quand le besoin les écrit (« 5 ans min »).
   *  `null` = non exigé, l'axe sort du dénominateur. */
  minYears: z.number().int().min(0).nullable(),
  /** La séniorité attendue, en bande (junior / confirmé / senior / expert).
   *  Repli quand personne n'a écrit d'années : deux bandes DÉCLARÉES se
   *  comparent honnêtement, là où déduire des années d'un CV a été refusé. */
  seniorityBand: z.string().nullable(),
  environment: z.array(z.string()),
  languages: z.array(z.object({ code: z.string().min(2).max(8), level: z.string().nullable() })),
  clearances: z.array(z.string()),
  location: z.string().nullable(),
  remote: remoteModeSchema.nullable(),
  startOn: z.string().nullable(),
  targetRateCents: z.number().int().nonnegative().nullable(),
  contractKind: z.string().nullable(),
})
export type MatchNeed = z.infer<typeof matchNeedSchema>

/* ------------------------------------------------------------------ */
/* Le candidat, tel que le moteur le voit — SANS IDENTITÉ              */
/* ------------------------------------------------------------------ */

/**
 * Ce que le moteur reçoit d'une personne.
 *
 * Il n'y a **ni nom, ni photo, ni date de naissance, ni adresse** : ce n'est pas
 * une omission, c'est la garde. L'identité est rattachée APRÈS le classement,
 * par l'appelant. Un moteur qui ne reçoit pas le nom ne peut pas s'en servir —
 * une garde de type est plus solide qu'une garde par expression régulière, et
 * les deux sont posées.
 */
export const matchCandidateSkillSchema = z.object({
  term: z.string().min(1),
  label: z.string().min(1),
  level: z.string().nullable(),
  source: matchEvidenceSourceSchema,
  proof: z.string().nullable(),
  /** #2328.24 — extraite automatiquement, jamais validée. `undefined` ⇔ `false`. */
  inferred: z.boolean().optional(),
})

export const matchCandidateSchema = z.object({
  consultantId: z.string().guid(),
  skills: z.array(matchCandidateSkillSchema),
  /** #2176.3 — optionnel : les nombreuses fabriques de test antérieures à ce
   *  champ n'ont pas à le fournir, `undefined` se lit comme `null`. */
  targetedCvVersion: matchTargetedCvVersionSchema.nullable().optional(),
  yearsExperience: z.number().int().min(0).nullable(),
  /** La bande de séniorité SAISIE sur la fiche. Jamais déduite d'un CV. */
  seniorityBand: z.string(),
  sectors: z.array(z.string()),
  /** Les technologies vues en mission ou citées en référence — l'environnement, pas la liste déclarée. */
  environment: z.array(z.string()),
  languages: z.array(z.object({ code: z.string().min(2).max(8), level: z.string().nullable() })),
  clearances: z.array(z.string()),
  zones: z.array(z.string()),
  remote: remoteModeSchema.nullable(),
  contractKind: z.string(),
  dailyRateCents: z.number().int().nonnegative().nullable(),
  /** La disponibilité DÉRIVÉE des affectations. `null` = aucune affectation connue. */
  freeFrom: z.string().nullable(),
  derivedAvailability: z.string(),
  /** Le champ SAISI, repli quand rien n'est dérivable. */
  declaredAvailability: z.string(),
  /** Quand la disponibilité a été revalidée pour la dernière fois. Au-delà de 60 j, pénalité. */
  availabilityCheckedAt: z.string().nullable(),
  consentState: z.string(),
  clientHistoryFlag: z.string().nullable(),
  clientHistoryReason: z.string().nullable(),
  /** QUAND le passage chez ce client s'est clos. `null` s'il est encore ouvert. */
  clientHistoryAt: z.string().nullable(),
  clientHistoryRecoverable: z.boolean(),
  onMissionAtClient: z.boolean(),
  activeSubmissionsElsewhere: z.number().int().min(0),
  preferenceWarnings: z.array(z.string()),
})
export type MatchCandidate = z.infer<typeof matchCandidateSchema>

/* ------------------------------------------------------------------ */
/* La réponse d'un matching                                            */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* #2331.5 / #2178.11-.18/.20 — les DIX arbitrages d'un zéro résultat  */
/* (LAU-FINAL-072, étendue #2178)                                     */
/* ------------------------------------------------------------------ */

/**
 * Dix arbitrages, liste FERMÉE — comme {@link EXCLUSION_REASONS}, un code non
 * membre de cette liste ne se devine pas. Calculée par
 * `apps/api/.../matching/next-best-move.ts` à partir du SEUL résultat d'un
 * classement (jamais en modifiant le besoin — #2331.4).
 *
 * #2178.11-.18/.20 — TROIS arbitrages AJOUTÉS EN FIN DE LISTE aux sept
 * d'origine (#2331.5), un pour chacune des trois actions de l'issue #2178 qui
 * n'avaient encore ni cause mappée ni geste dédié :
 *  - `elargir_contrat` : « Élargir CDI/freelance » (#2178.14) — distinct
 *    d'`elargir`, qui ne porte que la zone (#2178.13). Le motif d'exclusion
 *    `contract_mismatch` migre de `negocier` vers ce nouvel arbitrage : un
 *    désaccord de statut contractuel ne se « négocie » pas comme un TJM, il
 *    s'élargit.
 *  - `recommandation` : « Demander une recommandation » (#2178.16).
 *  - `partenaire` : « Identifier un partenaire » (#2178.18).
 * Les deux derniers n'ont pas de motif d'exclusion dédié (comme `sourcer`,
 * `refuser`, `reverse_market` déjà) — des arbitrages de dernier recours,
 * toujours proposés sur un vrai zéro résultat.
 */
export const NEXT_BEST_MOVE_OPTIONS = [
  'clarifier',
  'negocier',
  'reactiver',
  'elargir',
  'sourcer',
  'refuser',
  'reverse_market',
  'elargir_contrat',
  'recommandation',
  'partenaire',
] as const
export const nextBestMoveOptionSchema = z.enum(NEXT_BEST_MOVE_OPTIONS)
export type NextBestMoveOption = (typeof NEXT_BEST_MOVE_OPTIONS)[number]

export const matchRunSchema = z.object({
  runId: z.string().guid(),
  need: matchNeedSchema,
  weights: matchWeightsSchema,
  threshold: z.number().int().min(0).max(100),
  evaluatedCount: z.number().int().min(0),
  /** Écartés AVANT les axes par le pré-filtrage — comptés, jamais tus. */
  prefilteredCount: z.number().int().min(0),
  truncated: z.boolean(),
  recommended: z.array(matchResultSchema),
  borderline: z.array(matchResultSchema),
  excluded: z.array(matchResultSchema),
  notEvaluable: z.array(matchResultSchema),
  /** Un compteur par motif — c'est ce qui rend le bloc « écartés » lisible. */
  exclusionCounts: z.array(z.object({ reason: exclusionReasonSchema, count: z.number().int().min(1) })),
  /**
   * Les noms, rattachés APRÈS le classement.
   *
   * Ils voyagent avec la réponse parce qu'un écran doit désigner des personnes ;
   * ils n'entrent jamais dans le moteur, qui ne reçoit pas d'identité du tout.
   * C'est la séparation qui rend la garde GA-06 tenable plutôt que déclarative.
   */
  identities: z.array(
    z.object({
      consultantId: z.string().guid(),
      fullName: z.string(),
      title: z.string().nullable(),
      /** #2176.53 — le TJM, prix de VENTE lisible sans condition (D48). `null` = non renseigné. */
      dailyRateCents: z.number().int().nullable(),
      /** #2176.53 — la date de disponibilité déclarée. `null` = non renseignée. */
      availableFrom: z.string().nullable(),
      /** #2176.53 — le lieu déclaré (ville/pays), plus grossier qu'une adresse — pas un critère protégé (c58). */
      location: z.string().nullable(),
      /**
       * #2176.55 — coût et marge, PRÉSENTS SEULEMENT sous `finance:read`. Sans
       * le droit la clé vaut `null` (`redactFinance`, jamais 0). Le coût suit la NATURE
       * du profil : coût chargé d'un salarié, TJM d'achat sinon — jamais les
       * deux. `marginCents` = TJM − coût, `null` dès qu'un des deux manque :
       * une marge ne s'invente pas.
       */
      finance: z
        .object({ costCents: z.number().int().nullable(), marginCents: z.number().int().nullable() })
        .nullable()
        .optional(),
    }),
  ),
  /**
   * #2331.5 / #2331.7 — non `null` UNIQUEMENT quand ce classement n'a produit
   * AUCUN profil défendable (`recommended` et `borderline` vides). NO-GO
   * (#2331.7) : `next-best-move.ts` ne rend JAMAIS un tableau vide dans ce
   * cas — il y a toujours au moins un arbitrage nommé, jamais un écran qui
   * dit juste « aucun résultat » sans dire quoi faire.
   */
  nextBestMove: z.array(nextBestMoveOptionSchema).nullable(),
  /**
   * #2178.33/.34 — ce que les refus client DÉJÀ enregistrés sur CE besoin
   * disent, par axe (`submission_feedback`, onze axes, #2178.29 livré) —
   * jamais lu pour RÉORDONNER `nextBestMove` (voir `need-feedback-learnings.ts`
   * côté API) : un signal humain nommé, pas un poids caché dans un classement
   * déterministe. `[]` = aucun refus enregistré pour l'instant, jamais un
   * décompte à zéro affiché comme un fait (GA-18/19).
   */
  feedbackLearnings: z.array(z.object({ axis: feedbackAxisSchema, belowCount: z.number().int().min(1) })),
  createdAt: z.string(),
})
export type MatchRun = z.infer<typeof matchRunSchema>

/**
 * Le document d'EXPLICATION d'un classement (§13, art. 86 de l'AI Act).
 *
 * Il est destiné à une personne — un candidat, un auditeur — et ne contient
 * donc JAMAIS la donnée d'un autre profil. Il porte sa date et la pondération
 * employée : une explication qui ne dit pas avec quels poids elle a été
 * produite n'explique rien, puisque les poids sont réglables.
 */
export const matchExplanationSchema = z.object({
  runId: z.string().guid(),
  runAt: z.string(),
  role: z.string(),
  accountName: z.string().nullable(),
  weights: matchWeightsSchema,
  threshold: z.number().int(),
  consultantId: z.string().guid(),
  correspondenceScore: z.number().int(),
  pushableScore: z.number().int(),
  bucket: matchBucketSchema,
  axes: z.array(matchAxisResultSchema),
  exclusions: z.array(matchExclusionSchema),
  gaps: z.array(z.string()),
  questionsToValidate: z.array(z.string()),
})
export type MatchExplanation = z.infer<typeof matchExplanationSchema>

/** Le matching INVERSE : un talent contre tous les besoins ouverts (§5.2). */
export const inverseMatchSchema = z.object({
  runId: z.string().guid(),
  consultantId: z.string().guid(),
  weights: matchWeightsSchema,
  threshold: z.number().int(),
  evaluatedCount: z.number().int().min(0),
  needs: z.array(z.object({ need: matchNeedSchema, result: matchResultSchema })),
})
export type InverseMatch = z.infer<typeof inverseMatchSchema>

/** La pondération d'un espace et son historique (§14.2). */
export const matchWeightSettingsSchema = z.object({
  weights: matchWeightsSchema,
  threshold: z.number().int().min(0).max(100),
  versions: z.array(
    z.object({
      id: z.string().guid(),
      weights: matchWeightsSchema,
      threshold: z.number().int(),
      createdAt: z.string(),
    }),
  ),
})
export type MatchWeightSettings = z.infer<typeof matchWeightSettingsSchema>

export const updateMatchWeightsSchema = z
  .object({
    weights: z.partialRecord(matchAxisSchema, z.number().int().min(0).max(100)),
    threshold: z.number().int().min(0).max(100).default(MATCH_DEFAULT_THRESHOLD),
  })
  .strict()
export type UpdateMatchWeights = z.infer<typeof updateMatchWeightsSchema>

/* ------------------------------------------------------------------ */
/*  La PROSPECTION INVERSÉE vers le marché (§6.2, BEL-ATS-010)         */
/* ------------------------------------------------------------------ */

/**
 * Le renversement : au lieu de chercher un profil pour un besoin, on cherche un
 * besoin pour un profil. Le §6.2 en nomme TROIS sources, et une seule existait :
 *
 * | Source de besoins                           | État                 |
 * | ------------------------------------------- | -------------------- |
 * | Les besoins ouverts de l'espace             | existe               |
 * | Les offres publiées sur le marché           | à faire              |
 * | Les ESN qui recrutent ce profil sur ma zone | à faire — 2ᵉ marché  |
 *
 * ⚠️ **Un filtre, pas une source nouvelle** (PDF 1 §Section 4). « Cette
 * entreprise recrute » dit *ce client a un besoin* si c'est un client final, et
 * *cette ESN manque de bras* si c'est une ESN. Les deux blocs qui manquaient se
 * lisent donc dans la veille territoriale DÉJÀ collectée (`territory_snapshots`,
 * quatre sources publiques, relevé hebdomadaire) — aucune collecte nouvelle,
 * aucun scraping, et rien qui suppose de se faire passer pour quelqu'un d'autre.
 */

/** Ce qu'on n'a pas pu regarder, et pourquoi. Liste FERMÉE : un motif inconnu
 *  se corrige, il ne s'invente pas. */
export const REVERSE_MARKET_UNAVAILABLE_REASONS = [
  /** La fiche ne porte aucune zone : on ne sait pas quel territoire lire. */
  'zones_missing',
  /** La fiche ne porte aucune compétence : rien à croiser avec la demande. */
  'skills_missing',
  /** La veille n'a rien relevé sur ces zones. « Rien relevé » n'est pas « zéro offre ». */
  'no_snapshot',
  /**
   * La fiche porte des zones, mais aucune ne désigne un département suivi par
   * la veille (« IDF », « remote », le nom d'une ville…). Ce n'est ni une
   * absence de zone ni un marché vide : c'est une zone qu'on ne sait pas relier,
   * et l'écran doit NOMMER laquelle plutôt que rendre une liste vide.
   *
   * ⚠️ Ajouté en FIN de liste (GA-08) : un enum n'insère jamais au milieu.
   */
  'zones_unresolved',
] as const
export const reverseMarketUnavailableReasonSchema = z.enum(REVERSE_MARKET_UNAVAILABLE_REASONS)
export type ReverseMarketUnavailableReason = (typeof REVERSE_MARKET_UNAVAILABLE_REASONS)[number]

/**
 * Ce que le marché PUBLIC demande sur une zone — jamais présenté comme une
 * piste privée. La source, la date et le caractère public voyagent avec.
 */
export const marketDemandSchema = z.object({
  department: z.string().min(1),
  /** Le relevé le plus récent de ce département. */
  observedOn: z.string(),
  /**
   * Le nombre d'offres IT du relevé. `null` quand la source publique n'a rien
   * rendu cette semaine-là — jamais `0`, qui se lirait « ce département est mort ».
   */
  offers: z.number().int().min(0).nullable(),
  /** Les technologies demandées sur le territoire QUI SONT sur la fiche. C'est
   *  le seul couplage honnête entre le profil et le marché que la veille permet. */
  matchedTechnologies: z.array(z.object({ term: z.string(), count: z.number().int().min(0) })),
  /** Combien de technologies le territoire classe en tout — pour situer le compte ci-dessus. */
  technologiesRanked: z.number().int().min(0),
})
export type MarketDemand = z.infer<typeof marketDemandSchema>

/**
 * Une ESN qui recrute sur la zone du consultant — le SECOND MARCHÉ.
 *
 * ⚠️ Le libellé dit « recrute sur sa zone », jamais « recrute ce profil » : la
 * veille compte les offres PAR ESN et les technologies PAR DÉPARTEMENT, sans
 * jamais croiser les deux. Écrire « recrute son profil » serait une affirmation
 * que la donnée ne porte pas.
 */
export const marketRecruiterSchema = z.object({
  name: z.string().min(1),
  department: z.string().min(1),
  observedOn: z.string(),
  offers: z.number().int().min(0),
  /** La médiane trimestrielle de cette ESN sur ce département. `null` sous le
   *  nombre de relevés nécessaires : on ne compare pas à une habitude qu'on n'a
   *  pas encore observée. */
  baseline: z.number().nullable(),
  /** `true` sur une déclaration COMMUNAUTAIRE ; `null` = jamais déclaré, ce qui
   *  n'est pas « non ». */
  openToSubcontracting: z.boolean().nullable(),
})
export type MarketRecruiter = z.infer<typeof marketRecruiterSchema>

/**
 * LUD.4 — « Où placer ce profil ? » pour un métier HORS informatique : les ENTREPRISES CIBLES qui recrutent
 * ce métier dans la zone, chacune avec ses offres DATÉES et les interlocuteurs déjà connus de l'espace
 * (jamais inventés). Présent SEULEMENT pour un espace dont le domaine d'offre n'est pas l'informatique.
 *
 * `searched` est rendu MÊME sans résultat : « rien trouvé » se dit en nommant le métier et la zone cherchés.
 */
export const placementTargetSchema = z.object({
  name: z.string().min(1),
  siren: z.string().nullable(),
  department: z.string().nullable(),
  /** Les offres qui recrutent ce métier — jamais une entreprise sans offre datée. */
  offers: z.array(z.object({ label: z.string(), date: z.string(), url: z.string().nullable() })).min(1),
  /** Les interlocuteurs que l'espace connaît déjà chez elle ; vide = aucun connu, jamais deviné. */
  knownContacts: z.array(z.object({ name: z.string(), title: z.string().nullable() })),
})

export const placementTargetsSchema = z.object({
  searched: z.object({
    /** Le métier cherché, tel que lu sur la fiche (jamais une technologie). */
    roles: z.array(z.string()),
    /** La zone cherchée, telle que lue (fiche, sinon espace). */
    zones: z.array(z.string()),
    offerDomain: z.string().nullable(),
  }),
  companies: z.array(placementTargetSchema),
})
export type PlacementTargets = z.infer<typeof placementTargetsSchema>

export const reverseMarketSchema = z.object({
  consultantId: z.string().guid(),
  /** Les zones LUES sur la fiche, telles quelles. */
  zones: z.array(z.string()),
  /** Celles qui désignent un département que la veille relève. */
  departments: z.array(z.string()),
  /** Celles qu'on n'a pas su relier — nommées, pour que l'utilisateur sache
   *  quoi corriger. Une liste vide sans explication ferait chercher une panne. */
  unresolvedZones: z.array(z.string()),
  /** Les compétences lues sur la fiche, normalisées pour la comparaison. */
  skillTerms: z.array(z.string()),
  /** `null` quand la lecture a pu se faire — la liste peut alors être vide, et
   *  c'est une réponse, pas une panne. */
  unavailableReason: reverseMarketUnavailableReasonSchema.nullable(),
  demand: z.array(marketDemandSchema),
  recruiters: z.array(marketRecruiterSchema),
  /** L'état du consentement AU MOMENT de la lecture : `expired` refuse tout
   *  positionnement (le seul refus dur), `none` avertit et laisse passer. */
  consentState: consentStateSchema,
  /** LUD.4 — les entreprises cibles d'un métier non-IT ; absent pour un espace IT (lecture d'avant). */
  placementTargets: placementTargetsSchema.optional(),
})
export type ReverseMarket = z.infer<typeof reverseMarketSchema>

/** Combien d'ESN la liste montre — au-delà, ce n'est plus une liste qu'on lit. */
export const REVERSE_MARKET_RECRUITERS_MAX = 10
