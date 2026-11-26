/**
 * #2440.45 / #2440.48 — LA LIMITE PAR OUTIL, épopée #2975.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUI MANQUAIT
 * ─────────────────────────────────────────────────────────────────────────
 * #2440 distingue six limites (quota du plan, plafond quotidien anti-abus,
 * budget de l'espace, limite OUTIL, limite fournisseur, limite technique) et
 * exige que le refus nomme LA BONNE. La porte `checkBudgetGate`
 * (`workspace-budget.ts`) couvre le budget de l'espace, le plafond par membre
 * et le plafond par action sur le MOIS ; le quota du chat couvre le plafond
 * quotidien anti-abus. Rien ne bornait un OUTIL sur la JOURNÉE : un espace
 * pouvait dépenser en un après-midi tout le mois d'enrichissement.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * TROIS RÈGLES
 * ─────────────────────────────────────────────────────────────────────────
 * 1. **Sans clé = no-op strict** (lot COUT-IA 12/10, TRANCHÉ) : la limite est
 *    réglée par l'exploitant dans `AI_TOOL_DAILY_CAP_USD`
 *    (`analysis=20,enrichment=2.5` — dollars par espace et par jour UTC).
 *    Absente, vide ou illisible → table vide → rien n'est lu, rien n'est
 *    bloqué. Une entrée à 0 ou négative est IGNORÉE, jamais « bloque tout ».
 * 2. **Le refus nomme la limite** (`tool_daily_cap`) et l'outil par son
 *    MÉTIER, jamais par sa clé interne ni par un fournisseur (#4068) — et ne
 *    dit jamais « plus de crédits » (#2440.49) : ce n'en est pas une.
 * 3. **Jamais agrégée entre espaces (GA-43)** : la dépense du jour est celle
 *    d'UN espace ; c'est à l'appelant de ne passer que ses lignes.
 *
 * Cette limite ne change NI les crédits débités NI la grille : elle refuse
 * AVANT le débit, au même chokepoint que la porte de budget.
 */

export const TOOL_DAILY_CAP_LIMIT_NAME = 'tool_daily_cap' as const

/** Quota par outil, en dollars par espace et par jour UTC — clé = `feature` de `provider_costs`. */
export type ToolDailyCaps = Readonly<Record<string, number>>

/** Une clé de fonctionnalité du registre : minuscules et soulignés, rien d'autre. */
const TOOL_KEY = /^[a-z][a-z_]*$/

/** Le métier de l'outil, dit à qui lit le refus. Un outil absent d'ici se dit
 *  « cet outil » — jamais sa clé interne. */
const TOOL_LABELS: Readonly<Record<string, string>> = {
  analysis: "l'analyse de compte",
  enrichment: "l'enrichissement de contacts",
}

/** Lit `AI_TOOL_DAILY_CAP_USD`. Toute entrée illisible est ignorée, seule. */
export function parseToolDailyCaps(raw: string | undefined): ToolDailyCaps {
  const caps: Record<string, number> = {}
  if (!raw?.trim()) return caps
  for (const entry of raw.split(',')) {
    const [key, value, ...rest] = entry.split('=').map(part => part.trim())
    if (!key || value === undefined || rest.length > 0 || !TOOL_KEY.test(key)) continue
    const usd = Number(value)
    if (value === '' || !Number.isFinite(usd) || usd <= 0) continue
    caps[key] = usd
  }
  return caps
}

export type ToolDailyCapVerdict =
  | { allowed: true }
  | { allowed: false; overCap: typeof TOOL_DAILY_CAP_LIMIT_NAME; message: string }

/** La porte : la dépense MESURÉE du jour + le coût ESTIMÉ de l'action dépasse-t-elle le quota de l'outil ? */
export function checkToolDailyCap(
  caps: ToolDailyCaps,
  toolKey: string,
  spentTodayUsd: number,
  estimatedCostUsd: number,
): ToolDailyCapVerdict {
  const capUsd = caps[toolKey]
  if (capUsd === undefined || spentTodayUsd + estimatedCostUsd <= capUsd) return { allowed: true }
  const label = TOOL_LABELS[toolKey] ?? 'cet outil'
  return {
    allowed: false,
    overCap: TOOL_DAILY_CAP_LIMIT_NAME,
    message: `Le quota quotidien de ${label} est atteint pour cet espace. Il se rouvre à minuit (UTC).`,
  }
}

/** Une ligne de `provider_costs` du jour, d'UN espace. */
type ToolSpendRow = { feature: string; costUsd: number | null }

export type ToolDailyCapStatus = {
  tool: string
  capUsd: number
  /** Somme des lignes TARIFÉES du jour — un plancher quand `unpricedLines > 0`. */
  spentTodayUsd: number
  /** Lignes non tarifées : exclues de la somme, comptées à part (jamais 0 $, GA-64). */
  unpricedLines: number
  reached: boolean
}

/** La MESURE back-office : une ligne par outil RÉGLÉ, aucune pour un outil sans quota. */
export function toolDailyCapStatus(caps: ToolDailyCaps, rows: readonly ToolSpendRow[]): ToolDailyCapStatus[] {
  return Object.entries(caps).map(([tool, capUsd]) => {
    let spentTodayUsd = 0
    let unpricedLines = 0
    for (const row of rows) {
      if (row.feature !== tool) continue
      if (row.costUsd == null) unpricedLines += 1
      else spentTodayUsd += row.costUsd
    }
    return { tool, capUsd, spentTodayUsd, unpricedLines, reached: spentTodayUsd >= capUsd }
  })
}
