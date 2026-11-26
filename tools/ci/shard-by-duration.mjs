#!/usr/bin/env node
/**
 * Répartit les fichiers de test de `apps/web` en N paquets de DURÉE égale.
 *
 * ── Pourquoi ────────────────────────────────────────────────────────────────
 * `vitest --shard=i/N` coupe la liste des fichiers en N paquets de même
 * NOMBRE, pas de même durée. Sur le run CI 36531216182 (29/09/2026), les six
 * shards web ont duré 10, 11, 28, 11, 13 et 24 min : deux shards portaient les
 * fichiers lourds et fixaient à eux seuls la durée de toute la CI. Ce script
 * lit `apps/web/test-durations.json` (durée mesurée de chaque fichier) et
 * remplit les paquets au plus long d'abord, toujours dans le moins chargé
 * (glouton LPT).
 *
 * ── Ce qui ne doit JAMAIS arriver : un fichier perdu ───────────────────────
 * Un fichier qui ne tombe dans aucun paquet est un test qui ne tourne plus
 * jamais, et rien ne rougit — pire qu'un test lent. Trois protections :
 *   1. la liste des fichiers vient du DISQUE (mêmes motifs que
 *      `ALL_SUITES_INCLUDE` dans `apps/web/src/test/projects.ts`), jamais du
 *      fichier de durées : un fichier neuf, absent des durées, est quand même
 *      réparti (par nombre, voir `planShards`) ;
 *   2. vitest lit ses arguments comme des SOUS-CHAÎNES du chemin
 *      (`filterFiles`, vitest 3.2) : `a.test.ts` sélectionne aussi
 *      `a.test.tsx`. Deux fichiers dont l'un contient l'autre vont donc
 *      toujours dans le MÊME paquet, sinon le second tournerait deux fois ;
 *   3. `apps/web/src/test/ci-shards.test.ts` vérifie, sur le disque réel, que
 *      l'union des paquets — vue par la règle de filtre de vitest — est
 *      exactement la suite : aucun fichier perdu, aucun doublon.
 *
 * ── Usage ───────────────────────────────────────────────────────────────────
 *   node tools/ci/shard-by-duration.mjs --shard 2/6 [--durations <fichier.json>] [--suite api]
 *       → les fichiers du paquet 2 sur 6, un par ligne, relatifs à apps/web
 *   node tools/ci/shard-by-duration.mjs --update <rapport-json-vitest>
 *       → réécrit apps/web/test-durations.json depuis un rapport
 *         `vitest run --reporter=json --outputFile=<rapport-json-vitest>`
 *         (commande complète : docs/tests-rapides.md)
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
export const WEB_ROOT = join(REPO_ROOT, 'apps', 'web')
export const DURATIONS_FILE = join(WEB_ROOT, 'test-durations.json')
// Suite API (#ci/shards-api-par-duree) : jest, chemins relatifs à apps/api, durées FRAÎCHES seulement
// (artefacts `api-test-report-*` du dernier run de main) — pas de fichier commité : sans durées, le
// script sort en code 3 et le workflow retombe sur `jest --listTests --shard`.
export const API_ROOT = join(REPO_ROOT, 'apps', 'api')
export const NO_DURATIONS_EXIT = 3

/**
 * Coût fixe d'un fichier, en plus de ses tests : montage de jsdom, du setup,
 * collecte. Mesuré sur le même run CI : ~550 s de `setup` pour ~330 fichiers
 * sur un shard peu chargé, soit ~1,7 s, plus `collect` et `environment`
 * (~1 s) — le temps d'un shard est autant dans son NOMBRE de fichiers que
 * dans leurs tests, d'où ce plancher par fichier.
 */
export const PER_FILE_OVERHEAD_MS = 2500

/** Mêmes racines et mêmes suffixes que `ALL_SUITES_INCLUDE` (projects.ts). */
const SUITE_ROOTS = [
  { dir: 'src', pattern: /\.test\.tsx?$/ },
  { dir: 'vite-plugins', pattern: /\.test\.ts$/ },
]
const SKIPPED_DIRS = new Set(['node_modules', 'dist'])

/** Tous les fichiers de test de la suite web, chemins relatifs à `webRoot`, triés. */
export function listWebTestFiles(webRoot = WEB_ROOT) {
  const out = []
  const walk = (abs, pattern) => {
    let entries
    try {
      entries = readdirSync(abs, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const child = join(abs, entry.name)
      if (entry.isDirectory()) {
        if (!SKIPPED_DIRS.has(entry.name)) walk(child, pattern)
      } else if (pattern.test(entry.name)) {
        out.push(relative(webRoot, child).split('\\').join('/'))
      }
    }
  }
  for (const { dir, pattern } of SUITE_ROOTS) walk(join(webRoot, dir), pattern)
  return out.sort()
}

/** Tous les specs jest de `apps/api` (`rootDir: src`, `testRegex: .*\\.spec\\.ts$`), relatifs à `apiRoot`, triés. */
export function listApiTestFiles(apiRoot = API_ROOT) {
  let entries
  try {
    entries = readdirSync(join(apiRoot, 'src'), { recursive: true, encoding: 'utf8' })
  } catch {
    return []
  }
  return entries
    .map(f => f.split('\\').join('/'))
    .filter(f => f.endsWith('.spec.ts') && !f.includes('node_modules/'))
    .map(f => `src/${f}`)
    .sort()
}

/**
 * Les fichiers qu'une liste d'arguments sélectionne, selon la règle de vitest
 * 3.2 (`filterFiles`) : un fichier est retenu dès que son chemin relatif,
 * en minuscules, CONTIENT l'un des arguments en minuscules.
 */
export function filesSelectedBy(allFiles, filters) {
  const lowered = filters.map(f => f.toLowerCase())
  return allFiles.filter(file => {
    const candidate = file.toLowerCase()
    return lowered.some(f => candidate.includes(f))
  })
}

/**
 * Regroupe les fichiers dont le chemin de l'un contient celui de l'autre
 * (voir l'en-tête, protection 2). Chaque groupe part entier dans un paquet.
 */
function groupSubstringCollisions(files) {
  const parent = files.map((_, i) => i)
  const find = i => (parent[i] === i ? i : (parent[i] = find(parent[i])))
  const lowered = files.map(f => f.toLowerCase())
  for (let i = 0; i < files.length; i += 1) {
    for (let j = 0; j < files.length; j += 1) {
      if (i !== j && lowered[j].includes(lowered[i])) parent[find(i)] = find(j)
    }
  }
  const groups = new Map()
  files.forEach((file, i) => {
    const root = find(i)
    if (!groups.has(root)) groups.set(root, [])
    groups.get(root).push(file)
  })
  return [...groups.values()]
}

/** Médiane des durées connues (0 si aucune) : le poids d'un fichier jamais mesuré. */
export function medianDuration(files, durations) {
  const known = files.filter(f => typeof durations[f] === 'number').map(f => durations[f])
  if (known.length === 0) return 0
  known.sort((a, b) => a - b)
  const mid = Math.floor(known.length / 2)
  return known.length % 2 ? known[mid] : Math.round((known[mid - 1] + known[mid]) / 2)
}

/**
 * Répartit `files` en `count` paquets.
 *
 * Glouton LPT : les fichiers partent au plus long d'abord, chacun dans le
 * paquet le moins chargé. Un fichier SANS durée (ajouté depuis la dernière
 * mesure, ou fichier de durées périmé) pèse la MÉDIANE des durées connues :
 * ni 0 (il tomberait toujours dans le même paquet), ni un tri à part par
 * nombre (qui ignorait le poids des fichiers connus). Déterministe : même
 * entrée, même sortie, sur chaque job de la matrice.
 */
export function planShards(files, durations, count, overheadMs = PER_FILE_OVERHEAD_MS) {
  if (!Number.isInteger(count) || count < 1) throw new Error(`nombre de paquets invalide : ${count}`)
  const shards = Array.from({ length: count }, () => ({ files: [], load: 0 }))
  const median = medianDuration(files, durations)
  const items = []
  for (const group of groupSubstringCollisions([...files].sort())) {
    const cost = group.reduce((sum, f) => sum + (durations[f] ?? median) + overheadMs, 0)
    items.push({ group, cost })
  }
  const byName = (a, b) => (a.group[0] < b.group[0] ? -1 : a.group[0] > b.group[0] ? 1 : 0)
  items.sort((a, b) => b.cost - a.cost || byName(a, b))
  for (const item of items) {
    const target = shards.reduce((best, s) => (s.load < best.load ? s : best), shards[0])
    target.files.push(...item.group)
    target.load += item.cost
  }
  return shards.map(s => ({ files: s.files.sort(), loadMs: s.load }))
}

export function readDurations(file = DURATIONS_FILE) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return {}
  }
}

/**
 * Durées à utiliser : le fichier du dernier run complet de main s'il est là et
 * lisible (`--durations <fichier>` ou `CI_WEB_DURATIONS_FILE`, posé par
 * `tools/ci/fetch-durations.mjs`), sinon le fichier commité.
 */
export function resolveDurations(override, committed = DURATIONS_FILE) {
  if (override) {
    const fresh = readDurations(override)
    if (Object.keys(fresh).length > 0) return { durations: fresh, source: override }
  }
  return { durations: readDurations(committed), source: committed }
}

/**
 * Convertit un rapport JSON de vitest en `{ fichier: durée ms }`, arrondi à
 * 100 ms pour qu'une remesure ne réécrive pas chaque ligne pour du bruit.
 */
export function durationsFromVitestReport(report, webRoot = WEB_ROOT) {
  // (aussi valable pour un rapport jest `--json` : mêmes champs name/startTime/endTime)
  const out = {}
  for (const result of report.testResults ?? []) {
    const rel = relative(webRoot, result.name).split('\\').join('/')
    const ms = Math.max(0, (result.endTime ?? 0) - (result.startTime ?? 0))
    out[rel] = Math.round(ms / 100) * 100
  }
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => (a < b ? -1 : 1)))
}

function main(argv) {
  const shardArg = argv[argv.indexOf('--shard') + 1]
  if (argv.includes('--update')) {
    const reportPath = argv[argv.indexOf('--update') + 1]
    const report = JSON.parse(readFileSync(reportPath, 'utf8'))
    const durations = durationsFromVitestReport(report)
    writeFileSync(DURATIONS_FILE, `${JSON.stringify(durations, null, 2)}\n`)
    process.stderr.write(`${Object.keys(durations).length} durées écrites dans ${DURATIONS_FILE}\n`)
    return
  }
  const match = argv.includes('--shard') ? /^(\d+)\/(\d+)$/.exec(shardArg ?? '') : null
  if (!match) {
    process.stderr.write('usage : shard-by-duration.mjs --shard <i>/<N> | --update <rapport.json>\n')
    process.exit(2)
  }
  const index = Number(match[1])
  const count = Number(match[2])
  if (index < 1 || index > count) throw new Error(`paquet ${index} hors de 1..${count}`)
  const isApi = argv.includes('--suite') && argv[argv.indexOf('--suite') + 1] === 'api'
  const files = isApi ? listApiTestFiles() : listWebTestFiles()
  const override = argv.includes('--durations')
    ? argv[argv.indexOf('--durations') + 1]
    : isApi
      ? process.env.CI_API_DURATIONS_FILE
      : process.env.CI_WEB_DURATIONS_FILE
  if (isApi) {
    // Pas de durées exploitables : rien sur stdout, code 3 — l'appelant garde le découpage par nombre.
    const fresh = override ? readDurations(override) : {}
    if (Object.keys(fresh).length === 0) {
      process.stderr.write('durées API absentes : repli sur le découpage par nombre (jest --shard).\n')
      process.exit(NO_DURATIONS_EXIT)
    }
    const apiShards = planShards(files, fresh, count, 0)
    const apiMine = apiShards[index - 1]
    process.stderr.write(
      `paquet API ${index}/${count} : ${apiMine.files.length}/${files.length} fichiers, ~${Math.round(apiMine.loadMs / 1000)} s estimées (durées : ${override})\n`,
    )
    process.stdout.write(`${apiMine.files.join('\n')}\n`)
    return
  }
  const { durations, source } = resolveDurations(override)
  const shards = planShards(files, durations, count)
  const mine = shards[index - 1]
  process.stderr.write(
    `paquet ${index}/${count} : ${mine.files.length}/${files.length} fichiers, ~${Math.round(mine.loadMs / 1000)} s estimées (durées : ${source})\n`,
  )
  process.stdout.write(`${mine.files.join('\n')}\n`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2))
