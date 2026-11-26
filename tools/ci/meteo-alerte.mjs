#!/usr/bin/env node
// Alerte « SLO raté deux semaines de suite » (lot ci/6-quarantaine). S'ajoute à `metrics.mjs` (Phase 0),
// ne le réécrit pas : prend l'objet `metrics` qu'il produit (rapport JSON) et le rapport PRÉCÉDENT, publié
// dans l'issue `ci-meteo` sous la forme d'un marqueur `<!-- ci-meteo:{...} -->`.
//   node tools/ci/meteo-alerte.mjs --metrics <json> [--previous <json>]   (écrit l'alerte sur stdout, rc 0)
// Les cibles reprennent le tableau de `toMarkdown` (docs/ci.md §1).
import { readFileSync } from 'node:fs'

export const SLO = [
  { key: 'pr_duration_green_p50', label: 'CI de PR verte p50 (min)', max: 10 },
  { key: 'pr_duration_green_p90', label: 'CI de PR verte p90 (min)', max: 20 },
  { key: 'runner_min_per_merged_pr_p50', label: 'Runner-min par PR fusionnée p50', max: 60 },
  { key: 'first_run_red_pct', label: "Rouge au 1er run d'une PR (%)", max: 15 },
  { key: 'main_green_pct', label: '`main` vert (%)', min: 97 },
  { key: 'queue_p90', label: "File d'attente p90 (min)", max: 3 },
  { key: 'selection_web_concernes_pct', label: 'Web en mode `concernés` (%)', min: 70 },
]

/** SLO ratés. Une valeur absente (null) n'est PAS un raté : on n'alerte pas sur ce qu'on n'a pas mesuré. */
export function sloMisses(metrics) {
  return SLO.filter(s => {
    const v = metrics?.[s.key]
    if (v == null) return false
    return s.max != null ? v > s.max : v < s.min
  })
}

/** Ratés de cette semaine ET de la précédente. */
export function repeatedMisses(current, previous) {
  const before = new Set(sloMisses(previous).map(s => s.key))
  return sloMisses(current).filter(s => before.has(s.key))
}

export const MARKER = /<!-- ci-meteo:(\{.*?\}) -->/s
export const marker = metrics => `<!-- ci-meteo:${JSON.stringify(metrics)} -->`
export function previousFromBody(body) {
  const m = MARKER.exec(body ?? '')
  if (!m) return null
  try {
    return JSON.parse(m[1])
  } catch {
    return null
  }
}

export function alertBody(misses, current, previous) {
  const rows = misses.map(
    s =>
      `- **${s.label}** : ${previous[s.key]} puis ${current[s.key]} (cible ${s.max != null ? `≤ ${s.max}` : `≥ ${s.min}`})`,
  )
  return `SLO raté deux semaines de suite :\n\n${rows.join('\n')}\n`
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2)
  const opt = name => (argv.includes(`--${name}`) ? argv[argv.indexOf(`--${name}`) + 1] : null)
  // Aides du workflow : `--extract <commentaire>` imprime le rapport précédent (JSON), `--marker <json>` le marqueur.
  if (opt('extract')) {
    const previous = previousFromBody(readFileSync(opt('extract'), 'utf8'))
    if (previous) process.stdout.write(JSON.stringify(previous))
    process.exit(0)
  }
  if (opt('marker')) {
    process.stdout.write(marker(JSON.parse(readFileSync(opt('marker'), 'utf8'))))
    process.exit(0)
  }
  const current = JSON.parse(readFileSync(opt('metrics'), 'utf8'))
  const previous = opt('previous') ? JSON.parse(readFileSync(opt('previous'), 'utf8')) : null
  const misses = previous ? repeatedMisses(current, previous) : []
  if (misses.length > 0) process.stdout.write(alertBody(misses, current, previous))
}
