import { z } from 'zod'
import type { RunProfileProvenance } from './run-profile.js'

/**
 * #2318.5 — LAU-FINAL-059, VERSIONING : « chaque analyse conserve neuf
 * identifiants ». Le dépôt en tenait deux avant ce lot (`prompt_versions` sur
 * `analysis_runs`, et `created_at`/`scope_mode` déjà exposés par
 * `analysisRunSchema`) — les cinq autres (`analysis_version`,
 * `account_context_version`, `dataforge_version`, `market_memory_version`,
 * `scoring_version`) n'étaient ESTAMPILLÉS par AUCUN sous-système.
 *
 * #3212.3 (épopée #3235) en timbre le PREMIER : `analysis_version` reprend
 * désormais la révision du déploiement qui a exécuté le run (colonne
 * `analysis_runs.analysis_version`, `AnalysisRunsService.recordStart`) — la
 * seule révision « du pipeline lui-même » qu'un process sait honnêtement
 * nommer sur lui-même.
 *
 * Lot E7 du 28/09 en timbre un SECOND : `account_context_version` reprend
 * `accounts.updated_at` au moment du lancement (colonne
 * `analysis_runs.account_context_version`, même `recordStart`) — la révision
 * de la fiche compte (CRM) qui a nourri le run, jamais recalculée.
 *
 * Lot E7 en timbre un TROISIÈME sans nouvelle colonne : `scoring_version`
 * reprend le hash de contenu du prompt `scorer` (`bellum_scorer.py`), déjà
 * calculé par `prompt_registry_fingerprint` côté IA et déjà transporté dans
 * `prompt_versions.prompts.scorer` (#2311/GA-311) — jamais recalculé ici, la
 * même donnée simplement relue sous le nom que LAU-FINAL-059 lui donne.
 *
 * Les deux autres restent `null`, pour deux raisons DIFFÉRENTES — corrigé lot
 * E7 du 28/09 après un premier grep trop étroit (il ne regardait que
 * `AnalysisService`/`AnalysisWorker`, côté NestJS, et manquait l'appelant IA) :
 *  - `dataforge_version` (#3235, décision Louis 10/10) : `null` ICI, posé À LA
 *    LECTURE par `withDataforgeVersion` avec la version que la façade
 *    `AccountIntelligenceContextService.dataforgeVersionFor` lit — voir cette
 *    fonction. Historique de l'impasse : `DataforgeService.priorsForSiren` n'a réellement
 *    AUCUN appelant dans le pipeline d'analyse per-compte — seul
 *    `discover.py`/`dataforge_candidates` (recherche de CANDIDATS, Découvrir)
 *    et la façade écran `AccountIntelligenceContextService` le lisent, jamais
 *    un run. Reste bloqué par sa PROPRE garde d'architecture
 *    (`account-intelligence-single-facade.spec.ts` — DataForge ne se lit que
 *    par cette façade, jamais un second chemin) : la NOMMER ici plutôt que la
 *    contourner (30/09), c'est le choix qui tient encore.
 *  - `market_memory_version` : `MarketMemoryService.coverageFor` EST
 *    consultée par un vrai run — `phase4_plan.py` (`_market_memory_reinforced_
 *    expertises`) l'appelle via `bellum_api.market_memory_context_for` →
 *    `POST internal/copilot/market/context` quand l'ESN a déclaré des
 *    expertises. #3212.3 (reste, 30/09) a fait voyager LA MOITIÉ du trajet :
 *    `MarketMemoryCoverage.datasetVersion` (`market-memory.ts`) relit
 *    maintenant `market_company_signal.dataset_version` (colonne réelle, même
 *    patron que `dataforge_accounts.data_version`) — le POST ci-dessus et
 *    l'écran `GET :id/market-context` la portent DÉJÀ. #3235 (lot Q03, 30/09)
 *    achève le trajet : `phase4_plan._market_memory_reinforced_expertises`
 *    dépose la version qu'elle a RÉELLEMENT lue (couverture avérée) sur
 *    `_api_metrics.market_memory_version` → `summarize_telemetry` →
 *    `run_completed.summary` → `AnalysisWorker` → `completeLatest` → colonne
 *    `analysis_runs.market_memory_version` (migration `1796413331207`) → ce
 *    fichier. Le timbre n'existe QUE sur ce chemin : `phase4_plan.py` n'appelle
 *    la mémoire marché que si l'ESN a déclaré des expertises, donc un run qui
 *    ne l'a pas lue reste `null` — stamper une version par une lecture
 *    indépendante dirait qu'une source a nourri un dossier qu'elle n'a jamais
 *    consulté, pire qu'un `null` honnête (la règle qui protège aussi
 *    `dataforge_version` ci-dessus).
 *
 * Ce fichier assemble les neuf en UNE vue, sans en fabriquer aucun : un
 * identifiant que personne ne sait produire reste `null` (INCONNU), jamais un
 * zéro ou une valeur inventée — même règle que « non mesuré n'est jamais 0 »
 * (GA-18/19), étendue ici aux chaînes de version plutôt qu'aux nombres.
 *
 * `date` et `scope` ne sont PAS recalculés ici : ce sont les mêmes valeurs que
 * `analysisRunSchema.created_at` / `.scope_mode` portent déjà (GA-26 — une
 * dérivation vit à un seul endroit), simplement rassemblées dans cette vue
 * pour qu'un écran puisse les lire ENSEMBLE, comme LAU-FINAL-059 les liste.
 */
export const analysisVersioningSchema = z.object({
  /** Révision du PIPELINE d'analyse lui-même. Aucun sous-système ne le
   *  timbre sur un run aujourd'hui. */
  analysis_version: z.string().nullable(),
  /** Dérivé de `profile_provenance` (`esnProfileVersion` / `profileContextVersion`,
   *  déjà stockés — #1639/#2029). `null` en générique (aucun profil n'a
   *  conditionné le run) ou sur un run antérieur à la colonne. */
  profile_version: z.string().nullable(),
  /** Révision du CONTEXTE DE COMPTE (fiche/CRM) qui a nourri le run —
   *  `accounts.updated_at` timbré au lancement (#3212.3, lot E7). `null` sur
   *  un run antérieur à la colonne. */
  account_context_version: z.string().nullable(),
  /** Révision de la résolution DataForge consommée par le run. Aucun
   *  sous-système ne le timbre aujourd'hui. */
  dataforge_version: z.string().nullable(),
  /** Révision de la mémoire marché consommée par le run. Aucun sous-système
   *  ne le timbre aujourd'hui. */
  market_memory_version: z.string().nullable(),
  /** Empreinte de prompts (`analysis_runs.prompt_versions`, #2311/GA-311) —
   *  UN objet par phase, jamais un littéral inventé. `null` = non capturé. */
  prompt_version: z.record(z.string(), z.unknown()).nullable(),
  /** Révision du moteur de score consommé par le run — le hash du prompt
   *  `scorer` déjà porté par `prompt_version.prompts.scorer` (lot E7). `null`
   *  quand `prompt_version` ne porte pas ce hash (run antérieur, forme
   *  illisible). */
  scoring_version: z.string().nullable(),
  /** = `analysis_runs.created_at`, la même valeur — pas une seconde horloge. */
  date: z.string(),
  /** = `analysis_runs.scope_mode`, la même valeur — pas un second cadrage. */
  scope: z.string().nullable(),
})
export type AnalysisVersioning = z.infer<typeof analysisVersioningSchema>

/**
 * Assemble la vue depuis ce qu'un `AnalysisRunEntity` porte déjà. Pure —
 * aucun accès base — pour que le test n'ait pas besoin d'un repository.
 *
 * ⚠️ N'INVENTE RIEN : un identifiant sans source connue reste `null`. Ajouter
 * une valeur de repli ici ferait dire à un dossier ancien une version qu'il
 * n'a jamais eue.
 */
/**
 * `esn:<version>/context:<version>` — la MÊME chaîne partout où un run doit
 * nommer le profil qui l'a conditionné (GA-26). `null` sans provenance
 * connue, jamais un profil deviné.
 */
export function formatProfileVersion(provenance: RunProfileProvenance | null): string | null {
  return provenance
    ? `esn:${provenance.esnProfileVersion ?? '?'}/context:${provenance.profileContextVersion ?? '?'}`
    : null
}

/**
 * Lot E7 — le hash de contenu du prompt `scorer` déjà calculé côté IA
 * (`prompt_registry_fingerprint`, `prompt_versions.prompts.scorer`), relu ici
 * sous le nom `scoring_version`. `null` sur une forme illisible ou un run
 * antérieur à l'empreinte — jamais une révision devinée.
 */
function scorerPromptHashOf(promptVersions: Record<string, unknown> | null): string | null {
  const prompts =
    promptVersions && typeof promptVersions['prompts'] === 'object' && promptVersions['prompts'] !== null
      ? (promptVersions['prompts'] as Record<string, unknown>)
      : null
  const scorer = prompts?.['scorer']
  return typeof scorer === 'string' && scorer.trim().length > 0 ? scorer : null
}

/**
 * #3235 (décision Louis 10/10) — `dataforge_version` se DÉRIVE de la façade
 * `AccountIntelligenceContextService.dataforgeVersionFor`, à la LECTURE, jamais
 * d'un second chemin vers `DataforgeService` (GA-281 / GA-37). C'est la version
 * du référentiel DataForge qui décrit le compte AUJOURD'HUI, pas une
 * consultation faite par le run : `buildAnalysisVersioning` garde donc `null`
 * (la vue d'un run isolé ne sait pas) et les contrôleurs qui servent
 * l'historique / Laura posent la version via cette fonction. Une version
 * absente (compte sans SIREN, DataForge muet) reste `null` — INCONNU.
 */
export function withDataforgeVersion(
  versioning: AnalysisVersioning | null,
  version: string | null,
): AnalysisVersioning | null {
  if (!versioning) return null
  const trimmed = version?.trim()
  return trimmed ? { ...versioning, dataforge_version: trimmed } : versioning
}

export function buildAnalysisVersioning(run: {
  created_at: Date | string
  scope_mode: string | null
  prompt_versions: Record<string, unknown> | null
  profile_provenance: RunProfileProvenance | null
  /** #3212.3 — révision du déploiement qui a exécuté le run, timbrée au
   *  lancement (`AnalysisRunsService.recordStart`). `undefined` accepté pour
   *  qu'un appelant antérieur à la colonne reste byte-identique (traité
   *  comme `null` — non timbré). */
  analysis_version?: string | null
  /** #3212.3 (lot E7) — `accounts.updated_at` au lancement, timbré par
   *  `recordStart`. `undefined` accepté pour la même raison que
   *  `analysis_version` ci-dessus. */
  account_context_version?: string | null
  /** #3235 / #3212.3 — version du jeu de données mémoire marché que la phase
   *  `plan` du run a RÉELLEMENT lu (`analysis_runs.market_memory_version`,
   *  timbrée à la complétion). `undefined`/`null` = run antérieur à la colonne
   *  ou qui n'a pas consulté la mémoire marché — INCONNU, jamais deviné. */
  market_memory_version?: string | null
}): AnalysisVersioning {
  const provenance = run.profile_provenance
  return {
    analysis_version: run.analysis_version ?? null,
    profile_version: formatProfileVersion(provenance),
    account_context_version: run.account_context_version ?? null,
    dataforge_version: null,
    market_memory_version: run.market_memory_version?.trim() || null,
    prompt_version: run.prompt_versions ?? null,
    scoring_version: scorerPromptHashOf(run.prompt_versions),
    date: run.created_at instanceof Date ? run.created_at.toISOString() : run.created_at,
    scope: run.scope_mode,
  }
}
