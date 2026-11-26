import { z } from 'zod'
import { orgHierarchyLevelSchema } from './org-graph.js'

/**
 * Planificateur d'enrichissement de l'organigramme (PDF-22 OrgGraph FINAL,
 * §11 « Planner d'enrichissement — simple pour l'utilisateur, intelligent
 * derrière », l.359-379 ; P1 au tableau de priorisation §13).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * D810 — CONTRADICTION MAQUETTE / FINAL, TRANCHÉE
 * ─────────────────────────────────────────────────────────────────────────
 * Le §11 (texte) décrit QUATRE lignes d'action : « Enrichir les 50 suivants »,
 * « Cette direction », « Rôles manquants », « Plan complet ». La maquette
 * `05_planificateur_enrichissement.png` — même paquet FINAL, PAS une source
 * concurrente (le document le dit lui-même : « Louis garde la main sur
 * l'implémentation », et classe la maquette dans les fichiers du même
 * chantier) — montre CINQ cartes : les mêmes quatre, plus « Niveau
 * hiérarchique » (« L2 + L3 · Directions & management »).
 *
 * Décision : on retient les CINQ modes de la maquette.
 *
 *  1. Le §11 est un tableau ILLUSTRATIF (« Action utilisateur → Ce que Bellum
 *     fait »), pas une énumération qui se prétend exhaustive — rien n'y écrit
 *     « ce sont les seuls modes ».
 *  2. « Niveau hiérarchique » n'invente AUCUN concept : `orgHierarchyLevelSchema`
 *     (L0-L5, ci-dessous) existe déjà dans ce même fichier de contrats, et
 *     `contactScopeSchema.level` (ia.ts) l'accepte déjà comme axe de ciblage
 *     pour un re-run. Le libellé de la maquette, « Directions & management »,
 *     reprend d'ailleurs MOT POUR MOT les commentaires de L2 et L3 dans
 *     `orgHierarchyLevelSchema` : « L2 Direction — VP/Directeur/Head of… » /
 *     « L3 Management — Manager/Lead/Responsable… ». La maquette EXPOSE une
 *     capacité déjà nommée par le contrat ; elle n'en crée pas une nouvelle.
 *
 * La RÈGLE DE COÛT du §11 (« annoncé avant plan complet ET avant toute vague
 * personnalisée ») s'applique aux CINQ modes — le texte ne dit nulle part
 * qu'elle ne vaudrait que pour quatre d'entre eux, et la maquette montre elle
 * -même le bandeau de coût sous les cinq cartes, dans le même écran.
 */
export const ORG_ENRICHMENT_TARGET_MODES = [
  /** « Enrichir les 50 suivants » — le CTA produit, sans paramètre. Le Coverage
   *  Planner choisit les contacts non encore enrichis les plus utiles. */
  'next_batch',
  /** « Cette direction » — borne aux contacts dont `entity` correspond au
   *  libellé demandé (le champ déjà porté par les contacts enrichis). */
  'direction',
  /** « Rôles manquants » — vise les familles derrière les zones blanches de
   *  `CoverageService.computeForAccount` (coverage-gaps), sans les recalculer. */
  'missing_roles',
  /** « Niveau hiérarchique » — un ou plusieurs niveaux `orgHierarchyLevelSchema`
   *  (L0-L5), déterminés depuis le TITRE par le classifieur déterministe déjà
   *  utilisé pour la « liste perso » (`contact-classifier.ts`), jamais par un
   *  appel modèle. */
  'hierarchy_level',
  /** « Plan complet » — tous les contacts non encore enrichis du compte,
   *  découpés en vagues de {@link ORG_ENRICHMENT_WAVE_SIZE}. */
  'full_account',
] as const
export const orgEnrichmentTargetModeSchema = z.enum(ORG_ENRICHMENT_TARGET_MODES)
export type OrgEnrichmentTargetMode = z.infer<typeof orgEnrichmentTargetModeSchema>

/**
 * Paramètres d'un mode. Chaque mode ne lit que le(s) champ(s) qui le
 * concernent — le schéma reste permissif (`.optional()`) plutôt que discriminé
 * union pour rester un objet plat facile à porter en query string GET, comme
 * `ContactScope` (ia.ts) le fait déjà pour le même genre de ciblage.
 */
export const orgEnrichmentTargetParamsSchema = z.object({
  mode: orgEnrichmentTargetModeSchema,
  /** Requis pour `mode === 'direction'` : le libellé d'entité déjà porté par
   *  des contacts du compte (`ContactEntity.entity`). */
  entity: z.string().min(1).max(200).optional(),
  /** Requis pour `mode === 'hierarchy_level'` : un ou plusieurs niveaux. */
  hierarchyLevels: z.array(orgHierarchyLevelSchema).min(1).max(6).optional(),
})
export type OrgEnrichmentTargetParams = z.infer<typeof orgEnrichmentTargetParamsSchema>

/**
 * Une valeur MESURÉE, ou son absence NOMMÉE — jamais un 0 qui prétendrait
 * avoir compté quelque chose qui ne l'a pas été (GA-18/GA-19, doctrine
 * « non mesuré n'est jamais 0 »). `reason` est toujours un texte destiné à
 * l'écran, jamais un code interne.
 */
export const orgEnrichmentMeasuredSchema = <T extends z.ZodTypeAny>(value: T) =>
  z.discriminatedUnion('status', [
    z.object({ status: z.literal('measured'), value }),
    z.object({ status: z.literal('unknown'), reason: z.string().min(1) }),
  ])

export type OrgEnrichmentMeasured<T> = { status: 'measured'; value: T } | { status: 'unknown'; reason: string }

/** Construit une valeur mesurée — le seul chemin d'écriture, pour qu'un `0`
 *  authentique et une absence ne se confondent jamais par accident d'appel. */
export function measured<T>(value: T): OrgEnrichmentMeasured<T> {
  return { status: 'measured', value }
}

/** Construit une absence NOMMÉE. */
export function unknownMeasure<T>(reason: string): OrgEnrichmentMeasured<T> {
  return { status: 'unknown', reason }
}

/**
 * Le plafond produit d'une vague (§11 : « 50 est le CTA produit »). Distinct
 * de `CONTACTS_ENRICH_MAX` (env IA, Python, défaut 50 également) : ce dernier
 * est le filet de sécurité de l'IA sur la taille RÉELLE d'un batch de
 * classify (« la taille technique réelle peut être abaissée automatiquement
 * si le payload dépasse le budget de tokens ») et vit côté service IA — il ne
 * traverse pas la frontière TS. Cette constante-ci gouverne un DEUXIÈME
 * réglage : combien de contactIds ce planificateur met dans CHAQUE vague avant
 * même d'appeler l'IA. Les deux valent 50 par convention produit ; ni l'un ni
 * l'autre ne recopie l'autre.
 */
export const ORG_ENRICHMENT_WAVE_SIZE = 50

export type OrgEnrichmentPlanEstimate = {
  mode: OrgEnrichmentTargetMode
  /** Ce que ce mode vise, en une phrase prête à l'écran (« Engineering · AIRBUS DS »). */
  scopeLabel: string
  /** Combien de contacts entrent dans le périmètre demandé. */
  contactsTargeted: OrgEnrichmentMeasured<number>
  /** Combien de vagues de {@link ORG_ENRICHMENT_WAVE_SIZE} ce périmètre demande. */
  waveCount: OrgEnrichmentMeasured<number>
  waveSize: number
  /** Le coût EXACT, calculé via `creditCostOf('targeted_refresh', …)` — jamais
   *  un nombre recopié. Absent (`unknown`) uniquement si `contactsTargeted`
   *  l'est aussi : un coût ne se déduit pas d'un périmètre inconnu. */
  estimatedCredits: OrgEnrichmentMeasured<number>
}

export const orgEnrichmentPlanRequestSchema = orgEnrichmentTargetParamsSchema
export type OrgEnrichmentPlanRequest = z.infer<typeof orgEnrichmentPlanRequestSchema>

/**
 * `pending` : créé, aucune vague lancée. `running` : au moins une vague en
 * cours ou faite, au moins une encore `pending`. `completed` : toutes les
 * vagues `done`. `partial` : plus aucune vague `pending`, mais au moins une
 * `failed` — un « reprendre » peut relancer SEULEMENT celles-là. `failed` :
 * la toute première vague a échoué avant d'en terminer aucune.
 */
export const ORG_ENRICHMENT_JOB_STATUSES = ['pending', 'running', 'completed', 'failed', 'partial'] as const
export const orgEnrichmentJobStatusSchema = z.enum(ORG_ENRICHMENT_JOB_STATUSES)
export type OrgEnrichmentJobStatus = z.infer<typeof orgEnrichmentJobStatusSchema>

export const ORG_ENRICHMENT_WAVE_STATUSES = ['pending', 'done', 'failed'] as const
export const orgEnrichmentWaveStatusSchema = z.enum(ORG_ENRICHMENT_WAVE_STATUSES)
export type OrgEnrichmentWaveStatus = z.infer<typeof orgEnrichmentWaveStatusSchema>

/**
 * Une vague = un lot fixé de contactIds. Fixé à la CRÉATION du job (D813) :
 * un « reprendre » relance les vagues encore `pending`, sur EXACTEMENT le même
 * périmètre qu'annoncé — jamais un nouveau tirage qui ferait dériver le coût
 * déjà annoncé.
 */
export const orgEnrichmentWaveSchema = z.object({
  index: z.number().int().min(0),
  contactIds: z.array(z.string()),
  status: orgEnrichmentWaveStatusSchema,
  actualCredits: z.number().int().nullable(),
  matched: z.number().int().nullable(),
  error: z.string().nullable(),
})
export type OrgEnrichmentWave = z.infer<typeof orgEnrichmentWaveSchema>

export const orgEnrichmentJobSchema = z.object({
  id: z.string().guid(),
  accountId: z.string().guid(),
  mode: orgEnrichmentTargetModeSchema,
  targetParams: orgEnrichmentTargetParamsSchema,
  status: orgEnrichmentJobStatusSchema,
  promptVersion: z.string(),
  /** Combien de contacts par vague, FIGÉ à la création (D813). Un job relancé
   *  garde sa découpe : sinon le coût annoncé ne décrirait plus ce qui tourne. */
  waveSize: z.number().int().min(1).max(ORG_ENRICHMENT_WAVE_SIZE),
  /** Ce qu'on a ANNONCÉ avant le premier clic. Ne bouge plus jamais. */
  estimatedCredits: z.number().int().min(0),
  /**
   * Ce qui a RÉELLEMENT été débité, en unités de crédit.
   *
   * ⚠️ **Deux colonnes distinctes, et jamais une seule.** Confondre l'estimé et
   * le réel ferait disparaître l'ÉCART — or l'écart est précisément ce qu'on
   * veut voir : un plan annoncé à 12 crédits qui en consomme 20 est un
   * planificateur qui ment, et personne ne le saurait si les deux nombres
   * vivaient au même endroit.
   *
   * `null` = **rien n'a encore abouti**, et surtout pas « 0 crédit consommé ».
   * Un `0` dirait « mesuré, et ça n'a rien coûté », ce qui est faux d'un job
   * `pending`. Voir {@link sumOrgEnrichmentActualCredits} : les vagues non
   * mesurées sortent du total et sont COMPTÉES À PART, comme les lignes non
   * tarifées du registre de coûts.
   */
  actualCredits: z.number().int().min(0).nullable(),
  waves: z.array(orgEnrichmentWaveSchema),
  error: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type OrgEnrichmentJob = z.infer<typeof orgEnrichmentJobSchema>

/**
 * L'état d'un job, DÉRIVÉ de ses vagues — jamais écrit à la main.
 *
 * Un statut stocké en parallèle des vagues aurait deux propriétaires et
 * divergerait à la première vague qui tombe : c'est le défaut « une dérivation
 * vit à un seul endroit » (GA-26). La colonne SQL `status` existe pour que la
 * base puisse INDEXER et FILTRER (« les jobs à reprendre »), et elle est
 * toujours écrite depuis cette fonction, jamais depuis un service.
 */
export function deriveOrgEnrichmentJobStatus(waves: readonly OrgEnrichmentWave[]): OrgEnrichmentJobStatus {
  if (waves.length === 0) return 'pending'
  const pending = waves.filter(wave => wave.status === 'pending').length
  const failed = waves.filter(wave => wave.status === 'failed').length
  const done = waves.filter(wave => wave.status === 'done').length

  if (pending === waves.length) return 'pending'
  // Plus rien à lancer : le job est terminé, reste à dire COMMENT.
  if (pending === 0) {
    if (failed === 0) return 'completed'
    // Toutes échouées, aucune acquise — l'échec est total, pas partiel.
    return done === 0 ? 'failed' : 'partial'
  }
  return 'running'
}

/**
 * Le coût RÉEL d'un job — et ce qu'on n'a pas pu compter.
 *
 * Même règle d'honnêteté que le registre de coûts fournisseurs
 * (`analytics/cost-alert.ts`) : **une vague non mesurée n'est pas une vague
 * gratuite.** Une vague `failed` n'a rien débité qu'on sache — elle sort du
 * total et se compte à part. Un total qui les absorberait comme des zéros
 * ferait passer un job coûteux pour un job sage.
 *
 * `credits: null` quand AUCUNE vague n'a abouti : il n'y a alors rien à
 * additionner, et « 0 » serait une mesure inventée.
 */
export function sumOrgEnrichmentActualCredits(waves: readonly OrgEnrichmentWave[]): {
  credits: number | null
  unmeasuredWaves: number
} {
  let credits: number | null = null
  let unmeasuredWaves = 0

  for (const wave of waves) {
    if (wave.status === 'pending') continue
    if (wave.actualCredits === null || !Number.isFinite(wave.actualCredits)) {
      unmeasuredWaves += 1
      continue
    }
    credits = (credits ?? 0) + wave.actualCredits
  }

  return { credits, unmeasuredWaves }
}

/**
 * La prochaine vague à lancer — la REPRISE APRÈS ERREUR en une ligne.
 *
 * Les `pending` d'abord, dans l'ordre : une vague qui tombe au milieu laisse
 * ses suivantes intactes, et « reprendre » les fait dans l'ordre annoncé.
 * Les `failed` ENSUITE, et seulement quand il n'y a plus rien de neuf à faire :
 * rejouer tout de suite ce qui vient d'échouer, c'est en général réessayer la
 * même panne — alors qu'avancer sur les vagues suivantes rend du travail utile.
 *
 * `null` = plus rien à faire (`completed`), ou plus rien à faire ICI.
 */
export function nextOrgEnrichmentWave(waves: readonly OrgEnrichmentWave[]): OrgEnrichmentWave | null {
  return waves.find(wave => wave.status === 'pending') ?? waves.find(wave => wave.status === 'failed') ?? null
}

/**
 * La taille de lot d'une vague, telle qu'un appelant peut la demander.
 *
 * Bornée par {@link ORG_ENRICHMENT_WAVE_SIZE} : au-delà, ce n'est plus une
 * vague, c'est le plan complet sous un autre nom — et le coût annoncé à
 * l'écran ne décrirait plus ce qui part.
 */
export const orgEnrichmentBatchSizeSchema = z.number().int().min(1).max(ORG_ENRICHMENT_WAVE_SIZE)

/** Corps de `POST :accountId/enrich-next` — « enrichir les N suivants ». */
export const orgEnrichNextRequestSchema = z.object({
  /** Absent = {@link ORG_ENRICHMENT_WAVE_SIZE}, le CTA produit. */
  batchSize: orgEnrichmentBatchSizeSchema.optional(),
})
export type OrgEnrichNextRequest = z.infer<typeof orgEnrichNextRequestSchema>

/** Corps de `POST :accountId/enrich-entity` — « cette direction ». */
export const orgEnrichEntityRequestSchema = z.object({
  entity: z.string().min(1).max(200),
  batchSize: orgEnrichmentBatchSizeSchema.optional(),
})
export type OrgEnrichEntityRequest = z.infer<typeof orgEnrichEntityRequestSchema>

/** Corps de `POST :accountId/enrich-gaps` — « rôles manquants ». */
export const orgEnrichGapsRequestSchema = z.object({
  batchSize: orgEnrichmentBatchSizeSchema.optional(),
})
export type OrgEnrichGapsRequest = z.infer<typeof orgEnrichGapsRequestSchema>

/**
 * Identifie la logique de vague qui a produit ce job, indépendamment du
 * modèle Claude (`MODEL_<PROMPT_NAME>`, voir env-reference.md) — À BUMPER
 * manuellement le jour où `org-enrichment-targeting.ts` change ce qu'il
 * envoie au classify (un nouveau mode, un nouveau filtre). Un seul endroit :
 * ce fichier.
 */
export const ORG_ENRICHMENT_PROMPT_VERSION = 'org-enrichment-planner-v1'

/**
 * Le résultat d'UNE vague lancée (`POST :accountId/enrichment-confirm`) —
 * ce que `OrgEnrichmentPlannerService.confirmWave` rend, partagé tel quel
 * entre l'API et le web (le web ne recompose rien).
 */
export type OrgEnrichmentWaveResult = {
  /** Contacts effectivement reclassés par cette vague (peut être < demandé —
   *  un contact peut avoir été enrichi entre-temps par un autre geste). */
  matched: number
  /** Taille RÉELLE de la vague lancée (≤ ORG_ENRICHMENT_WAVE_SIZE). */
  waveSize: number
  /** Crédits RÉELLEMENT débités pour cette vague (pas l'estimation). */
  creditsDebited: number
  /** Combien de contacts du périmètre demandé restent, APRÈS cette vague —
   *  0 = le périmètre est épuisé, relancer le même mode ne trouverait plus
   *  rien. > 0 = reste des vagues ; un second clic sur « Lancer » avec le
   *  MÊME mode reprend exactement là où celle-ci s'arrête, parce que la
   *  sélection ne revoit jamais un contact déjà classé (`family !== null`).
   */
  remaining: number
}
