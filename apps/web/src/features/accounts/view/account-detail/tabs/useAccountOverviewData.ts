import type { AccountVerdict, Account, AccountAnalysis, BellumRead, PlanRisk } from '@bellum/contracts'
import {
  readQualificationSnapshot,
  accountDisplayVerdict,
  accountVerdictFromScore,
  mainRisk as deriveMainRisk,
  namedAccountVerdict,
  normalizeStoredVerdict,
  parseAccountAnalysis,
  planRiskSchema,
  redactSupplierNamesDeep,
} from '@bellum/contracts'
import { useMemo } from 'react'
import { readPriorityPerimeters } from '../components/entities/perimeterSignals'
import type { PriorityPerimeterSignal } from '../components/entities/perimeterSignals'
import type { ConfidenceTier } from './evaluation/evaluationViewData'
import { readDossierRead } from './evaluation/dossierReadViewData'
import type { DossierReadView } from './evaluation/dossierReadViewData'

type PriorityBadge = AccountVerdict

// Canonical cutoffs (GO >= 7 / PRUDENT 5-6 / NO-GO < 5) — was >= 7.5, which
// mislabelled a 7/10 PRUDENT-band account as GO.
export function priorityBadge(score: number | null | undefined): PriorityBadge | null {
  return accountVerdictFromScore(score)
}

/**
 * #1607.1 — LES QUATRE BLOCS BELLUM READ, dans leur forme d'ÉCRAN (camelCase,
 * comme le reste de `AccountOverviewData`) — voir `bellumReadSchema`
 * (`@bellum/contracts`) pour la forme de FIL (snake_case).
 *
 * `null` sur `BellumReadData.bellumRead` (pas sur ce type) est le cas d'une
 * analyse d'avant ce lot : voir `buildBellumReadData`.
 */
type BellumReadBlocks = {
  verdictLine: string
  /** 1 à 3 preuves — jamais vide quand ce type existe (voir `buildBellumReadData`). */
  why: string[]
  missing: string | null
  nextAction: string | null
}

export type BellumReadData = {
  title: string | null
  description: string | null
  tags: string[]
  /**
   * Les quatre blocs structurés, ou `null` sur une analyse d'avant #1607.1 —
   * l'écran retombe alors sur `title`/`description` seuls, JAMAIS quatre
   * blocs vides. Nommé `blocks` (pas `bellumRead`) pour ne pas répéter le nom
   * du type qui le porte déjà (`AccountOverviewData.bellumRead.blocks`).
   */
  blocks: BellumReadBlocks | null
}

type AccountOverviewData = AccountAnalysis & {
  executiveSummary: string | null
  immediateActionLabel: string | null
  bellumRead: BellumReadData
  // « Fiabilité du dossier » /100 + tier (Théo P1) — the second axis shown beside
  // the commercial score on the overview, so the two are read separately. It
  // grades THIS ANALYSIS (IA grid: technique/identité/sources/commerciale). The
  // account's CONTACTS have their own, differently-named score — « Confiance
  // donnée », p29, computed by the API's coverage service.
  dossierReliability: number | null
  confidenceTier: ConfidenceTier | null
  // Le verdict que l'IA a écrit dans le dossier (GO/PRUDENT/STOP/EXPLORER).
  // Distinct du badge dérivé du /10 : lui seul peut porter EXPLORER. `null`
  // quand l'IA n'a rien émis — l'affichage retombe alors sur le dérivé.
  storedVerdict: string | null
  /** Note commerciale canonique /25 (Annexe méthodo p25). `null` = dossier
   *  antérieur, l'écran retombe sur la projection /10. */
  score25: number | null
  /**
   * #2118 — la lecture du dossier en sept axes (`evaluation.dossier_read`).
   * `null` sur une analyse d'avant ce lot : l'écran garde alors sa lecture
   * d'avant, et le score reste dit « axes non détaillés » plutôt que nu.
   */
  dossierRead: DossierReadView | null
  /** #2966 (#2119.43-51) — les 2-4 périmètres déjà scorés par
   *  `apps/ia/app/services/perimeter_score.py` (`raw_analysis.priority_perimeters`).
   *  `[]` sur une analyse antérieure à ce champ, jamais une erreur. */
  priorityPerimeters: PriorityPerimeterSignal[]
  /**
   * #2304.8 (épopée #2932) — Q7 « quel est le principal risque du compte »,
   * DÉRIVÉ de `evaluation.risks` déjà écrits (`mainRisk`, `@bellum/contracts`)
   * — jamais un second appel modèle. `null` quand le dossier n'a aucun risque
   * lisible.
   */
  mainRisk: PlanRisk | null
  // #3755 — `qualification` (l'instantané du verdict de la grille de l'espace,
  // `raw_analysis.qualification`) arrive avec `...analysis` : il est au contrat
  // d'analyse. Absent sans grille — l'écran reste alors celui d'avant.
}

/** `evaluationField` rend déjà une valeur validée par `parseAccountAnalysis`
 *  (même schéma) quand `risks` existe — cette garde ne fait que refuser une
 *  forme qui ne serait pas un tableau, jamais un item deviné. */
function readPlanRisks(raw: unknown): PlanRisk[] {
  const parsed = planRiskSchema.array().safeParse(raw)
  return parsed.success ? parsed.data : []
}

export function useAccountOverviewData(account: Account): AccountOverviewData {
  return useMemo<AccountOverviewData>(() => {
    // R25 (15/10) — « Apollo » s'affichait dans la Synthèse d'EDF et de Decathlon : le texte
    // du modèle, stocké avant la règle, nommait NOTRE fournisseur. Le rendu ne le montre plus
    // jamais, quel que soit l'âge du dossier (les clés techniques de provenance restent intactes).
    const rawAnalysis = redactSupplierNamesDeep(account.raw_analysis)
    const analysis = parseAccountAnalysis(rawAnalysis)
    const confidence = readDossierReliability(rawAnalysis, analysis)
    return {
      ...analysis,
      executiveSummary: nullableString(redactSupplierNamesDeep(account.priority_justification)),
      immediateActionLabel: deriveImmediateAction(analysis),
      bellumRead: buildBellumReadData(
        redactSupplierNamesDeep(account.priority_justification),
        analysis.business_description,
        analysis.angles,
        // #1607.1 — cherché LÀ OÙ IL VIT, pas seulement à la racine : la phase 4
        // range son évaluation sous `plan.evaluation`. Voir `evaluationRecords`.
        evaluationField(analysis, 'bellum_read') as BellumRead | null | undefined,
        // KEVIN-FIX (b) — UNE source pour « Prochaine action » : celle de l'en-tête et de la carte (`deriveImmediateAction`).
        deriveImmediateAction(analysis),
      ),
      dossierReliability: confidence.value,
      confidenceTier: confidence.tier,
      storedVerdict: readStoredVerdict(analysis),
      score25: readAccountScore25(analysis),
      // #2118.6 — cherchée LÀ OÙ ELLE VIT, comme `bellum_read` : la phase 4
      // range son évaluation sous `plan.evaluation`, d'anciens dossiers à la
      // racine. Lire une seule place a déjà rendu un bloc muet en production.
      dossierRead: readDossierRead(evaluationField(analysis, 'dossier_read')),
      priorityPerimeters: readPriorityPerimeters(rawAnalysis),
      mainRisk: deriveMainRisk(readPlanRisks(evaluationField(analysis, 'risks'))),
    }
  }, [account])
}

/** Read the « Fiabilité du dossier » axis off the raw analysis — the IA grid
 *  written by `apps/ia/app/services/confidence.py`, NOT the p29 « Confiance
 *  donnée » of the contacts (that one is served by the API coverage endpoint).
 *  ``confidence`` (phase-1) is not in the typed schema, so read it directly;
 *  fall back to the phase-4 ``plan.data_confidence`` mirror. Pure — unit-tested. */
export function readDossierReliability(
  rawAnalysis: unknown,
  analysis: AccountAnalysis,
): { value: number | null; tier: ConfidenceTier | null } {
  const raw = rawAnalysis && typeof rawAnalysis === 'object' ? (rawAnalysis as Record<string, unknown>) : {}
  const confidence = raw['confidence']
  const confidenceRec = confidence && typeof confidence === 'object' ? (confidence as Record<string, unknown>) : null
  const scoreRaw = confidenceRec?.['score'] ?? analysis.plan?.data_confidence ?? analysis.data_confidence
  const value = typeof scoreRaw === 'number' ? Math.round(scoreRaw) : null
  const tierRaw = confidenceRec?.['tier']
  const tier =
    tierRaw === 'non_evaluable' || tierRaw === 'low' || tierRaw === 'medium' || tierRaw === 'high' ? tierRaw : null
  return { value, tier }
}

/**
 * #2123.11 — le « Verdict stratégique » qui ouvre le plan, LU exactement comme
 * la Synthèse le lit : la pastille est `accountDisplayVerdict(priority_score,
 * verdict écrit)` — celle de `BellumReadCard` —, la phrase est le
 * `bellum_read.verdict_line` que la Synthèse met en tête.
 *
 * Aucun calcul de plus : un second verdict calculé autrement dans le plan
 * répondrait deux fois, différemment, à la même question (GA-26). `null` quand
 * le dossier n'en porte pas — jamais un verdict par défaut, et jamais une
 * probabilité : GO / PRUDENT / NO-GO / EXPLORER est une décision nommée.
 */
export function readStrategicVerdict(
  account: Pick<Account, 'priority_score' | 'raw_analysis'>,
  options: { hasObjective?: boolean } = {},
): {
  verdict: AccountVerdict | null
  /** #2932 / #4088 (recette 15/10) — le verdict NOMMÉ, le MÊME libellé que la Synthèse et l'Évaluation
   *  (« RÉSERVE », pas la famille « PRUDENT ») : un verdict, un nom, partout. `null` sans famille. */
  name: string | null
  line: string | null
} {
  const analysis = parseAccountAnalysis(account.raw_analysis)
  const bellumRead = evaluationField(analysis, 'bellum_read') as BellumRead | null | undefined
  const verdict = accountDisplayVerdict(account.priority_score, readStoredVerdict(analysis))
  const hasNoGoTrigger = readDossierRead(evaluationField(analysis, 'dossier_read'))?.noGo?.trigger != null
  return {
    verdict,
    name: verdict ? namedAccountVerdict(verdict, hasNoGoTrigger, { hasObjective: options.hasObjective ?? true }) : null,
    line: buildBellumReadBlocks(bellumRead, undefined)?.verdictLine ?? null,
  }
}

/** Le verdict émis par l'IA (`evaluation.go_no_go`), lu aux mêmes emplacements
 *  que {@link buildEvaluationViewData} : plan.evaluation, evaluation racine, ou
 *  evaluation_compte. Renvoie la chaîne brute (à normaliser à l'affichage), ou
 *  `null` si absente/placeholder. Pure — testée. */
export function readStoredVerdict(analysis: AccountAnalysis): string | null {
  // #3755.6 — le verdict de la grille de qualification de l'espace prime dès
  // qu'il conclut. Sans grille (ou sans critère évaluable), la suite rend le
  // verdict d'avant, à l'identique.
  const qualification = readQualificationSnapshot(analysis)
  if (qualification?.verdict) return qualification.verdict
  const a = analysis as unknown as Record<string, unknown>
  const plan = a['plan']
  const records = [
    asRecord(a['evaluation']),
    asRecord(plan && typeof plan === 'object' ? (plan as Record<string, unknown>)['evaluation'] : null),
    asRecord(a['evaluation_compte']),
  ]
  // `verdict` = le verdict CANONIQUE de la grille /25 (GO/PRUDENT/STOP/EXPLORER).
  // `goNoGo` est son miroir legacy, qui écrase EXPLORER en « CONDITIONNEL » :
  // le lire en premier ferait afficher PRUDENT là où l'analyse a conclu EXPLORER.
  for (const key of ['verdict', 'go_no_go', 'goNoGo'] as const) {
    for (const rec of records) {
      if (!rec) continue
      const raw = rec[key]
      const value = typeof raw === 'string' ? raw.trim() : ''
      if (value && value !== '—' && normalizeStoredVerdict(value)) return value
    }
  }
  return null
}

/** Le score commercial CANONIQUE /25 porté par le dossier (`evaluation.score`),
 *  borné. `null` quand le dossier n'en a pas : l'écran retombe sur le /10. */
/**
 * OÙ VIT L'ÉVALUATION D'UN DOSSIER — et pourquoi il faut chercher à trois places.
 *
 * `raw_analysis` est une ligne à laquelle quatre phases ajoutent leurs clés. La
 * phase 4 range la sienne sous `plan.evaluation` ; d'anciens dossiers la portent
 * à la racine (`evaluation`), d'autres encore sous `evaluation_compte`. Les
 * trois formes coexistent en base et aucune migration ne les rapproche — la
 * base est additive.
 *
 * ⚠️⚠️ **Cette dérivation vit ICI et nulle part ailleurs.** Elle était recopiée
 * à moitié : `readAccountScore25` cherchait aux trois places, et le bloc de
 * lecture (#1607.1) à une seule — la racine, celle que les dossiers RÉCENTS
 * n'utilisent pas. Le score s'affichait donc, et les quatre blocs jamais, sur
 * le même dossier et depuis le même objet. Mesuré en production le 11/09/2026 :
 * `plan.evaluation.bellum_read` présent en base, écran muet.
 *
 * C'est la troisième cause empilée du même défaut, après les noms qui
 * divergeaient et le modèle pydantic qui avalait le champ. Chacune à elle seule
 * suffisait à rendre la fonctionnalité invisible.
 */
function evaluationRecords(analysis: AccountAnalysis): (Record<string, unknown> | null)[] {
  const a = analysis as unknown as Record<string, unknown>
  const plan = a['plan']
  return [
    asRecord(a['evaluation']),
    asRecord(plan && typeof plan === 'object' ? (plan as Record<string, unknown>)['evaluation'] : null),
    asRecord(a['evaluation_compte']),
  ]
}

/** La première évaluation trouvée qui porte `clef`, où qu'elle vive. */
export function evaluationField(analysis: AccountAnalysis, key: string): unknown {
  for (const rec of evaluationRecords(analysis)) {
    const value = rec?.[key]
    if (value !== undefined && value !== null) return value
  }
  return undefined
}

export function readAccountScore25(analysis: AccountAnalysis): number | null {
  for (const rec of evaluationRecords(analysis)) {
    const raw = rec?.['score']
    if (typeof raw === 'number' && !Number.isNaN(raw)) return Math.max(0, Math.min(25, Math.round(raw)))
  }
  return null
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

function nullableString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function firstQuickWinLabel(quickWins: unknown): string | null {
  if (!Array.isArray(quickWins) || quickWins.length === 0) return null
  const first = quickWins[0]
  if (typeof first === 'string') return nullableString(first)
  if (first && typeof first === 'object') return nullableString((first as { action?: unknown }).action)
  return null
}

function firstPlanActionLabel(actionPlan: AccountAnalysis['action_plan'] | undefined): string | null {
  const action = actionPlan?.phases?.flatMap(phase => phase.actions ?? []).find(a => nullableString(a?.action))
  return nullableString(action?.action)
}

/**
 * "Prochaine action" (Théo p.5/17) — NE JAMAIS afficher « Aucune action » quand
 * des quick wins ou un plan existent. Les quick wins vivent le plus souvent sous
 * `plan.quick_wins` / `plan.evaluation.quick_wins`, pas au top level — l'ancienne
 * version ne lisait que le top level d'où la contradiction avec l'onglet Score.
 * On parcourt les MÊMES sources que l'onglet évaluation, puis la 1re action du plan.
 */
export function deriveImmediateAction(analysis: AccountAnalysis): string | null {
  return (
    nullableString(analysis.immediate_action) ??
    firstQuickWinLabel(analysis.quick_wins) ??
    firstQuickWinLabel(analysis.plan?.quick_wins) ??
    firstQuickWinLabel(analysis.plan?.evaluation?.quick_wins) ??
    firstPlanActionLabel(analysis.plan?.action_plan) ??
    firstPlanActionLabel(analysis.action_plan)
  )
}

/**
 * #1607.1 — construit les quatre blocs BELLUM READ quand le dossier les porte,
 * et dégrade PROPREMENT sinon (analyse d'avant ce lot, ou modèle qui n'a écrit
 * aucun verdictLine).
 *
 * `verdict_line` est l'ANCRE : sans lui, il n'y a pas de phrase à mettre en
 * tête, et exposer why/missing/nextAction seuls écrirait un panneau à moitié
 * rempli. On rend alors `null` — l'écran retombe sur `title`/`description`,
 * exactement le comportement d'avant ce lot.
 */
export function buildBellumReadData(
  executiveSummary: Account['priority_justification'],
  businessDescription: AccountAnalysis['business_description'],
  angles: AccountAnalysis['angles'],
  bellumRead: BellumRead | null | undefined,
  /**
   * KEVIN-FIX (b) — recette prod 20/10 : l'en-tête disait « message LinkedIn », la Synthèse « e-mail ». La
   * prochaine action vit à UN endroit (`deriveImmediateAction`, déjà celle de l'en-tête et de la carte
   * « Prochaine action ») ; `undefined` = appelant d'avant, qui garde la phrase du modèle.
   */
  immediateAction?: string | null,
): BellumReadData {
  return {
    title: nullableString(executiveSummary),
    description: nullableString(businessDescription),
    tags: (angles ?? [])
      .filter(
        (angle): angle is NonNullable<typeof angle> & { title: string } =>
          typeof angle?.title === 'string' && angle.title.length > 0,
      )
      .slice(0, 3)
      .map(angle => angle.title),
    blocks: buildBellumReadBlocks(bellumRead, immediateAction),
  }
}

function buildBellumReadBlocks(
  bellumRead: BellumRead | null | undefined,
  immediateAction: string | null | undefined,
): BellumReadBlocks | null {
  const verdictLine = nullableString(bellumRead?.verdict_line)
  if (!verdictLine) return null
  return {
    verdictLine,
    why: (bellumRead?.why ?? [])
      .map(item => (typeof item === 'string' ? item.trim() : ''))
      .filter((item): item is string => item.length > 0)
      .slice(0, 3),
    missing: nullableString(bellumRead?.missing),
    nextAction: immediateAction === undefined ? nullableString(bellumRead?.next_action) : immediateAction,
  }
}
