/**
 * Le calcul d'une alerte de coût, séparé du réseau et de l'horloge.
 *
 * Le registre `provider_costs` sait depuis le 03/08 ce que chaque espace
 * consomme chez les fournisseurs. Personne n'en est PRÉVENU : il faut ouvrir le
 * back-office et regarder. Un dépassement se découvre donc sur la facture, un
 * mois trop tard — exactement le scénario qui a fait croire qu'un run coûtait
 * 0,75 € quand la console facturait sept fois plus.
 *
 * Deux règles d'honnêteté portent ce fichier, les mêmes que l'écran des coûts :
 *
 * 1. **Une ligne non tarifée n'est pas une ligne gratuite.** Un fournisseur sans
 *    `PROVIDER_UNIT_COST_*` renseigné produit des lignes à coût NULL. Elles sont
 *    EXCLUES du total et COMPTÉES à part — les absorber comme des zéros ferait
 *    passer un espace dispendieux pour un espace sage.
 * 2. **On ne convertit pas la monnaie.** Les fournisseurs facturent en dollars,
 *    le registre stocke des dollars : le seuil est donc en dollars. Appliquer un
 *    taux de change inventé rendrait l'alerte fausse d'un jour à l'autre.
 */

/** Une ligne du registre, réduite à ce dont l'alerte a besoin. */
export type CostRow = {
  workspaceId: string | null
  /** Coût en dollars ; `null` = fournisseur non tarifé sur cet environnement. */
  costUsd: number | null
  provider: string
}

type WorkspaceCostSummary = {
  workspaceId: string | null
  /** Somme des lignes TARIFÉES, en dollars. */
  totalUsd: number
  /** Nombre de lignes dont le coût est inconnu — le total les ignore. */
  unpricedLines: number
  /** Fournisseurs qui pèsent, du plus cher au moins cher. */
  providers: Array<{ provider: string; totalUsd: number }>
}

/** Regroupe le registre par espace de travail, du plus cher au moins cher. */
export function summariseCosts(rows: readonly CostRow[]): WorkspaceCostSummary[] {
  const byWorkspace = new Map<string, WorkspaceCostSummary & { perProvider: Map<string, number> }>()

  for (const row of rows) {
    // `null` (une consommation hors espace, par exemple une tâche de fond) est
    // un groupe à part entière : la jeter masquerait une dépense réelle.
    const key = row.workspaceId ?? '∅'
    let entry = byWorkspace.get(key)
    if (!entry) {
      entry = {
        workspaceId: row.workspaceId,
        totalUsd: 0,
        unpricedLines: 0,
        providers: [],
        perProvider: new Map(),
      }
      byWorkspace.set(key, entry)
    }
    if (row.costUsd == null || Number.isNaN(row.costUsd)) {
      entry.unpricedLines += 1
      continue
    }
    entry.totalUsd += row.costUsd
    entry.perProvider.set(row.provider, (entry.perProvider.get(row.provider) ?? 0) + row.costUsd)
  }

  return [...byWorkspace.values()]
    .map(entry => ({
      workspaceId: entry.workspaceId,
      // Les flottants s'additionnent mal : sans arrondi, un total affiche
      // 3.0000000000000004 et l'alerte devient illisible.
      totalUsd: Math.round(entry.totalUsd * 10_000) / 10_000,
      unpricedLines: entry.unpricedLines,
      providers: [...entry.perProvider.entries()]
        .map(([provider, totalUsd]) => ({ provider, totalUsd: Math.round(totalUsd * 10_000) / 10_000 }))
        .sort((a, b) => b.totalUsd - a.totalUsd),
    }))
    .sort((a, b) => b.totalUsd - a.totalUsd)
}

/**
 * Les espaces qui dépassent le seuil.
 *
 * Un seuil absent ou non numérique ne déclenche RIEN : une alerte qui part sur
 * un réglage mal saisi apprend à ignorer les alertes, ce qui coûte plus cher que
 * de ne pas en avoir.
 */
export function overThreshold(
  summaries: readonly WorkspaceCostSummary[],
  thresholdUsd: number | null,
): WorkspaceCostSummary[] {
  if (thresholdUsd == null || !Number.isFinite(thresholdUsd) || thresholdUsd <= 0) return []
  return summaries.filter(entry => entry.totalUsd > thresholdUsd)
}

/**
 * Ce qu'il faut ajouter à un message pour qu'un total DISE qu'il est partiel.
 *
 * Le contexte structuré portait déjà `unpricedLines` depuis le premier jour, et
 * c'était juste — mais le contexte n'est pas ce qu'un humain lit : le MESSAGE
 * l'est. Un total partiel annoncé comme un fait est plus dangereux qu'une
 * absence de chiffre, parce que celui qui le lit décide dessus, et l'erreur va
 * toujours dans le sens rassurant.
 *
 * Rend une chaîne VIDE quand rien ne manque : un « (plancher : 0 ligne) » sur
 * chaque alerte apprendrait à ne plus lire la mention.
 */
export function floorNote(unpricedLines: number): string {
  if (!Number.isFinite(unpricedLines) || unpricedLines <= 0) return ''
  const plural = unpricedLines > 1 ? 's' : ''
  return ` — c’est un plancher : ${unpricedLines} ligne${plural} non tarifée${plural}, exclue${plural} du total`
}

/** Lit le seuil déclaré par l'opérateur. Absent ou aberrant ⇒ pas d'alerte. */
export function readThresholdUsd(raw: string | undefined): number | null {
  const trimmed = raw?.trim()
  if (!trimmed) return null
  const value = Number(trimmed)
  return Number.isFinite(value) && value > 0 ? value : null
}

// ═════════════════════════════════════════════════════════════════════════════
//  PIC DE COÛT QUOTIDIEN — la dérivation, à UN seul endroit
// ═════════════════════════════════════════════════════════════════════════════

/**
 * « Un coût quotidien > 150 % de la médiane 7 jours remonte dans la file de
 * décision » (#1661).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE DÉRIVATION VIT ICI, ET PAS DANS LA FILE DE DÉCISION
 * ─────────────────────────────────────────────────────────────────────────────
 * La file de décision (#1647) porte une nature `cost_spike` avec ce MÊME seuil.
 * Deux dérivations du même seuil divergeraient à la première fois que l'une des
 * deux bouge — c'est la loi 1 du tome 7, et le dépôt l'a déjà payée ailleurs.
 * La file appelle donc {@link detectDailyCostSpike} plutôt que de recalculer :
 * la fonction est PURE (aucune horloge, aucun réseau, aucun repository) et son
 * fichier ne porte pas « service » dans son nom, ce qui la rend importable
 * depuis un autre module SANS faire monter GA-07 (qui est au plafond).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA RÈGLE JUMELLE, QUI COMPTE AUTANT QUE LE SEUIL
 * ─────────────────────────────────────────────────────────────────────────────
 * **Une médiane de coût sur 7 jours qui n'existe pas ne produit AUCUNE alerte.**
 * Pas de données ⇒ pas de pic. Une alarme allumée par un TROU de données n'est
 * plus une alarme : elle apprend à ignorer les alarmes, ce qui coûte plus cher
 * que de ne pas en avoir. Trois refus distincts, chacun nommé plutôt que réduit
 * à un `false` muet — l'écran doit pouvoir DIRE lequel :
 *
 *  · `not_enough_days`  — moins de {@link COST_SPIKE_BASELINE_DAYS} journées
 *    MESURÉES avant celle qu'on évalue. Une médiane sur trois jours n'est pas
 *    une médiane sur sept.
 *  · `baseline_is_zero` — la médiane vaut zéro. Tout centime dépensé serait
 *    alors « infiniment au-dessus » : c'est la signature d'un registre qui
 *    n'écrivait pas, pas celle d'un dérapage.
 *  · `day_not_measured` — la journée évaluée n'a AUCUNE ligne tarifée. « 0 $ »
 *    y serait une affirmation qu'on ne peut pas faire.
 */
export const COST_SPIKE_RATIO = 1.5

/** Combien de journées MESURÉES la médiane exige pour exister. */
export const COST_SPIKE_BASELINE_DAYS = 7

/**
 * Une journée de coût, telle que la dérivation la lit.
 *
 * ⚠️ `costUsd` n'est JAMAIS `null` ici : c'est l'appelant qui décide ce qui
 * entre dans l'historique, et une journée non mesurée n'y entre pas. Lui donner
 * un `0` la ferait peser dans la médiane comme une journée sobre.
 */
export type DailyCostPoint = {
  /** Jour civil `YYYY-MM-DD`, dans le fuseau de la console. */
  day: string
  /** Somme des lignes TARIFÉES de la journée, en dollars. */
  costUsd: number
}

/**
 * Le verdict, en UNION plutôt qu'en objet à champs nullables.
 *
 * L'union rend le repli sur zéro IMPOSSIBLE côté écran : après `if
 * (verdict.spike)`, TypeScript sait que `medianUsd` est un nombre, et aucun
 * `?? 0` n'a de raison d'exister. On retire le MOYEN d'écrire le zéro, pas
 * seulement l'occasion (GA-19).
 */
export type CostSpikeVerdict =
  | { spike: false; reason: 'not_enough_days'; observedDays: number; requiredDays: number }
  | { spike: false; reason: 'baseline_is_zero'; observedDays: number }
  | { spike: false; reason: 'day_not_measured'; day: string }
  | {
      spike: false
      reason: 'under_threshold'
      day: string
      costUsd: number
      medianUsd: number
      ratio: number
      /**
       * Le montant à partir duquel la journée aurait été un pic, en dollars.
       *
       * ⚠️ Il VOYAGE plutôt que d'être recalculé à l'écran. Écrire « au-delà de
       * 150 % » dans le back-office créerait une SECONDE maison pour
       * {@link COST_SPIKE_RATIO} — et le jour où le seuil bougerait, l'écran
       * continuerait d'annoncer l'ancien. Un réglage vit à un seul endroit.
       */
      thresholdUsd: number
    }
  | { spike: true; day: string; costUsd: number; medianUsd: number; ratio: number; thresholdUsd: number }

/** Arrondi monétaire commun au fichier — les flottants s'additionnent mal. */
function round(value: number, decimals: number): number {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

/** La médiane d'un échantillon NON VIDE, déjà trié ou non. */
function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[middle] as number
  return ((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2
}

/**
 * Le pic, ou la raison de son absence.
 *
 * `history` porte les journées MESURÉES, dans n'importe quel ordre ; `day` est
 * la journée à évaluer, passée en PARAMÈTRE — jamais lue sur une horloge, sans
 * quoi la dérivation changerait de réponse selon le fuseau de la machine.
 *
 * La ligne de base est faite des {@link COST_SPIKE_BASELINE_DAYS} journées
 * mesurées les plus RÉCENTES strictement ANTÉRIEURES à `day` : la journée
 * évaluée ne se compare jamais à elle-même.
 */
export function detectDailyCostSpike(history: readonly DailyCostPoint[], day: string): CostSpikeVerdict {
  const usable = history.filter(point => Number.isFinite(point.costUsd))
  const baseline = usable
    .filter(point => point.day < day)
    .sort((a, b) => (a.day < b.day ? 1 : -1))
    .slice(0, COST_SPIKE_BASELINE_DAYS)

  if (baseline.length < COST_SPIKE_BASELINE_DAYS) {
    return {
      spike: false,
      reason: 'not_enough_days',
      observedDays: baseline.length,
      requiredDays: COST_SPIKE_BASELINE_DAYS,
    }
  }

  const medianUsd = round(median(baseline.map(point => point.costUsd)), 4)
  if (medianUsd <= 0) return { spike: false, reason: 'baseline_is_zero', observedDays: baseline.length }

  const evaluated = usable.find(point => point.day === day)
  if (!evaluated) return { spike: false, reason: 'day_not_measured', day }

  const ratio = round(evaluated.costUsd / medianUsd, 2)
  const costUsd = round(evaluated.costUsd, 4)
  const thresholdUsd = round(medianUsd * COST_SPIKE_RATIO, 4)
  if (evaluated.costUsd > medianUsd * COST_SPIKE_RATIO) {
    return { spike: true, day, costUsd, medianUsd, ratio, thresholdUsd }
  }
  return { spike: false, reason: 'under_threshold', day, costUsd, medianUsd, ratio, thresholdUsd }
}
