#!/usr/bin/env node
/**
 * `pnpm test:changed` — ne lance que les tests des fichiers modifiés depuis
 * une base (défaut `origin/main`) : commits de la branche, modifications non
 * commitées et fichiers neufs non suivis.
 *
 *   web        vitest `related` dans apps/web (graphe d'imports)
 *   contracts  vitest `related` dans packages/contracts
 *   api        jest `--changedSince=<base>` dans apps/api
 *   ia         pytest sur les tests des modules touchés — TOUTE la suite IA
 *              si un prompt, un golden ou la config de test change
 *
 * Les suites complètes restent le travail de la CI. Usage :
 *   pnpm test:changed [--base <ref>] [--dry-run]
 *
 * Sous-commande `ci` — ce que `Test (Web)` et `Test (API)` appellent sur une PR :
 *   node tools/ci/test-changed.mjs ci --suite web|api --base origin/<base>
 *        [--shard i/N] [--out <fichier>] [--labels a,b] [--durations <json>]  (api : shards par durée)
 *   stdout : `mode=concernes|complet` ; stderr : la ligne de mesure du journal ;
 *   --out  : les fichiers du shard, un par ligne, relatifs à l'application.
 * Détail : docs/tests-rapides.md.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { footprintTouched, readFootprint } from './read-footprint.mjs'
import { listWebTestFiles, planShards, readDurations } from './shard-by-duration.mjs'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

/** Un changement ici rejoue toute la suite IA : il touche des sorties, pas un module. */
const IA_WHOLE_SUITE = [
  /^apps\/ia\/.*\bprompts\//,
  /^apps\/ia\/.*\bgolden/,
  /^apps\/ia\/(conftest\.py|pytest\.ini|pyproject\.toml|requirements\.txt)$/,
  /^apps\/ia\/tests\/(.*\/)?conftest\.py$/,
  /^apps\/ia\/tests\/fixtures\//,
]

/**
 * Les `forceRerunTriggers` par défaut de vitest : un seul de ces fichiers
 * parmi les fichiers passés à `vitest related`, et vitest relance TOUTE la
 * suite — en local, ce qui appartient à la CI. Ils ne sont donc jamais passés
 * à vitest ; le script les nomme (`notRunLocally`) au lieu de les taire.
 */
const VITEST_RERUN_ALL = [/(^|\/)package\.json$/, /(^|\/)(vite|vitest)\.config\.[cm]?[jt]s$/]

/**
 * Décide quoi lancer. `iaTests` : les fichiers de test pytest EXISTANTS
 * (chemins depuis la racine) ; `readSource` lit l'un d'eux, pour trouver ceux
 * qui importent un module modifié.
 */
export function planChangedRuns(changed, iaTests, readSource) {
  const touches = prefix => changed.some(f => f.startsWith(prefix))
  const isTrigger = f => VITEST_RERUN_ALL.some(re => re.test(f))
  const sources = changed.filter(f => !isTrigger(f))
  const contracts = sources.filter(f => f.startsWith('packages/contracts/'))
  const plan = {
    // `tools/` : des tests web gardent des outils du dépôt (ex. `tools/ci/*.mjs`).
    web: sources.filter(f => ['apps/web/', 'packages/', 'tools/'].some(p => f.startsWith(p))),
    contracts,
    api: touches('apps/api/') || touches('packages/contracts/'),
    ia: [],
    notRunLocally: changed.filter(isTrigger).sort(),
  }
  const iaChanged = changed.filter(f => f.startsWith('apps/ia/'))
  if (iaChanged.some(f => IA_WHOLE_SUITE.some(re => re.test(f)))) {
    plan.ia = 'all'
    return plan
  }
  const selected = new Set()
  for (const file of iaChanged) {
    if (!file.endsWith('.py')) continue
    if (iaTests.includes(file)) {
      selected.add(file)
      continue
    }
    const moduleRel = file.slice('apps/ia/'.length, -'.py'.length)
    if (moduleRel.startsWith('tests/')) continue // un test supprimé
    const name = moduleRel.split('/').pop() ?? ''
    const dotted = moduleRel
      .replace(/\/__init__$/, '')
      .split('/')
      .join('.')
    for (const test of iaTests) {
      const base = test.split('/').pop() ?? ''
      if (base === `test_${name}.py` || base.startsWith(`test_${name}_`)) selected.add(test)
      else if (readSource(test).includes(dotted)) selected.add(test)
    }
  }
  plan.ia = [...selected].sort()
  return plan
}

function git(args) {
  const out = spawnSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8' })
  if (out.status !== 0) throw new Error(`git ${args.join(' ')} : ${out.stderr.trim()}`)
  return out.stdout.split('\n').filter(Boolean)
}

function listIaTests() {
  const root = join(REPO_ROOT, 'apps', 'ia', 'tests')
  if (!existsSync(root)) return []
  return readdirSync(root, { recursive: true, encoding: 'utf8' })
    .filter(f => /(^|\/)test_[^/]*\.py$/.test(f.split('\\').join('/')))
    .map(f => relative(REPO_ROOT, join(root, f)).split('\\').join('/'))
    .sort()
}

function run(label, cmd, args, cwd, dryRun) {
  process.stdout.write(`\n▶ ${label} : ${cmd} ${args.join(' ')}  (${relative(REPO_ROOT, cwd) || '.'})\n`)
  if (dryRun) return 0
  return spawnSync(cmd, args, { cwd, stdio: 'inherit' }).status ?? 1
}

// ───────────────────────── sous-commande `ci` ─────────────────────────

/**
 * Une fondation touchée = suite COMPLÈTE : elle traverse le dépôt, ou elle
 * change la façon dont les tests tournent. Reprend la regex du job `changes`
 * de ci.yml, plus les configs de test, les socles de test, `tools/ci`, les
 * tsconfig et tout `.github/`.
 */
const FOUNDATIONS = [
  // 31/10/2026 (refonte CI, lot A) — `packages/contracts/src/**` n'est PLUS une fondation : web et API le lisent
  // désormais depuis `src/` (alias vitest / moduleNameMapper jest), le graphe d'imports le suit. `.github/**` et
  // `tools/ci/**` non plus : ils sélectionnent leurs gardes (`ciGuardTests`) et les lecteurs par empreinte de lecture.
  // Restent : ce qui traverse le dépôt ou change la façon dont les tests tournent.
  /^(packages\/shared\/|pnpm-lock\.yaml$|package\.json$|turbo\.json$|pnpm-workspace\.yaml$)/,
  /(^|\/)(vite|vitest|jest)[^/]*\.config\.[^/]+$/,
  /^apps\/web\/src\/test\//,
  /^apps\/api\/test\//,
  /(^|\/)tsconfig[^/]*\.json$/,
]

/** Un fichier de test n'est JAMAIS une fondation (il est sélectionné par le graphe, ou lui-même). */
const TEST_FILE = /\.(test|spec|e2e-spec)\.[cm]?[jt]sx?$/

/**
 * Listes générées du dossier de test (périmètre des projets vitest) : pas un setup. Un diff de ce fichier
 * sélectionne les specs ajoutées / retirées de la liste (`generatedListSpecs`), rien pour l'API.
 */
const GENERATED_SPEC_LIST = 'apps/web/src/test/tests-node.generated.ts'

/** Les gardes de la CI elle-même : sélectionnées quand `.github/**` ou `tools/ci/**` bouge. */
const CI_GUARD_TESTS = [
  /^apps\/web\/src\/test\/ci-[^/]*\.test\.tsx?$/,
  /^apps\/web\/src\/test\/jobs-sans-succes\.test\.tsx?$/,
  /^apps\/web\/src\/test\/test-changed\.test\.tsx?$/,
]

export function ciGuardTests(changed, allTests) {
  if (!changed.some(f => f.startsWith('.github/') || f.startsWith('tools/ci/'))) return []
  return allTests.filter(f => CI_GUARD_TESTS.some(re => re.test(f)))
}

/** Les specs citées par les lignes ajoutées / retirées du diff de la liste générée (chemins relatifs à apps/web). */
export function generatedListSpecs(diffText, allTests) {
  const cited = new Set([...diffText.matchAll(/^[+-]\s*'([^']+\.test\.tsx?)',?\s*$/gm)].map(m => `apps/web/${m[1]}`))
  return allTests.filter(f => cited.has(f))
}

/** Le catalogue du changelog : hors fondations, ses lecteurs sont sélectionnés explicitement. */
export const CHANGELOG_DIR = /^packages\/contracts\/src\/changelog\//

/** Les symboles du catalogue : un test qui en cite un lit le changelog (web/API l'importent via `dist/`, invisible au graphe). */
const READS_CHANGELOG =
  /CHANGELOG_IDS|LATEST_CHANGELOG_ID|changelogLocales|changelogEn\b|changelogFr\b|resolveChangelog|changelogEntriesSince|@bellum\/contracts\/changelog/

/**
 * Si le diff touche le changelog : les tests qui le lisent (dossiers `changelog*`, ou citant ses symboles).
 * Sinon rien — le reste de la sélection vient du graphe d'imports.
 */
export function changelogReaders(changed, allTests, readSource) {
  if (!changed.some(f => CHANGELOG_DIR.test(f))) return []
  return allTests.filter(f => /\/changelog[^/]*\//.test(f) || READS_CHANGELOG.test(readSource(f)))
}

/** Au-delà de cette part de la suite sélectionnée, autant lancer la suite entière. */
const FULL_SUITE_THRESHOLD = 0.5

/** Label de PR qui force la suite complète. */
export const FULL_SUITE_LABEL = 'ci:suite-complete'

/** Label de la file de fusion : une PR en file passe la suite COMPLÈTE avant de fusionner. */
export const TRAIN_LABEL = 'ci:train'

/** Vrai si un label impose la suite complète (`ci:suite-complete` ou file de fusion). */
export function forcesFullSuite(labels) {
  return labels.includes(FULL_SUITE_LABEL) || labels.includes(TRAIN_LABEL)
}

/** Un fichier lu par une spec = un fichier du dépôt qu'elle garde sans l'importer. */
const READS_REPO = /readFileSync|readdirSync|globSync|fs\/promises|node:fs/

/** `null` si aucune fondation n'est touchée, sinon la raison (qui nomme le fichier). */
export function foundationReason(changed, legacy = false) {
  if (legacy) {
    const old = changed.find(f => LEGACY_FOUNDATIONS.some(re => re.test(f)))
    return old === undefined ? null : `fondation touchée : ${old}`
  }
  const hit = changed.find(f => f !== GENERATED_SPEC_LIST && !TEST_FILE.test(f) && FOUNDATIONS.some(re => re.test(f)))
  return hit === undefined ? null : `fondation touchée : ${hit}`
}

/**
 * Interrupteur `vars.CI_SELECTOR_LEGACY == 'true'` (variable d'environnement `CI_SELECTOR_LEGACY`) : l'ANCIEN
 * comportement du sélecteur (fondations larges, gardes de lecture toujours lancées). Défaut : le nouveau.
 */
export function selectorLegacy(env = process.env) {
  return env.CI_SELECTOR_LEGACY === 'true'
}

/** Les fondations d'avant le lot A (31/10/2026), gardées pour l'interrupteur. */
const LEGACY_FOUNDATIONS = [
  /^(packages\/(contracts\/(?!src\/changelog\/)|shared\/)|pnpm-lock\.yaml$|package\.json$|turbo\.json$|pnpm-workspace\.yaml$|\.github\/)/,
  /(^|\/)(vite|vitest|jest)[^/]*\.config\.[^/]+$/,
  /^apps\/web\/src\/test\//,
  /^apps\/api\/test\//,
  /^tools\/ci\//,
  /(^|\/)tsconfig[^/]*\.json$/,
]

/**
 * Les gardes qui lisent le code sans l'importer : le graphe d'imports ne les
 * voit pas, elles tournent donc quel que soit le diff.
 */
export function isAlwaysRunTest(file, readSource, changed) {
  const guard = /^apps\/(web|api)\/src\/architecture\//.test(file) || file.endsWith('/demo-coverage.spec.ts')
  if (!guard && !READS_REPO.test(readSource(file))) return false
  // Sans diff connu : toujours (comportement historique). Avec diff : seulement si le diff touche un chemin
  // que la garde lit ; un chemin qui échappe à l'analyse → elle tourne (en faire PLUS).
  if (changed === undefined) return true
  const { resolved, paths } = readFootprint(file, readSource(file), readSource)
  return !resolved || footprintTouched(paths, changed)
}

/**
 * Décide, pour une suite (web | api), des tests à lancer sur une PR.
 *
 *   allTests     tous les fichiers de test de la suite (depuis la racine)
 *   relatedTests ceux que vitest / jest relient au diff
 *   alwaysRun    ceux qui tournent toujours (`isAlwaysRunTest`)
 *   planError    message si le calcul a échoué (repli : suite complète)
 *
 * Le repli est d'en faire PLUS, jamais moins.
 */
export function decideCiSelection({ changed, allTests, relatedTests, alwaysRun, labels, planError, legacy = false }) {
  const full = reason => ({ mode: 'complet', reason, files: [...allTests], total: allTests.length })
  if (planError) return full(`calcul du plan échoué : ${planError}`)
  const foundation = foundationReason(changed, legacy)
  if (foundation) return full(foundation)
  if (forcesFullSuite(labels))
    return full(`label ${labels.includes(FULL_SUITE_LABEL) ? FULL_SUITE_LABEL : TRAIN_LABEL}`)
  const known = new Set(allTests)
  const files = [...new Set([...relatedTests.filter(f => known.has(f)), ...alwaysRun.filter(f => known.has(f))])].sort()
  if (files.length > allTests.length * FULL_SUITE_THRESHOLD)
    return full(`${files.length} tests sélectionnés sur ${allTests.length} (> 50 %)`)
  return { mode: 'concernes', reason: '', files, total: allTests.length }
}

/** La ligne de mesure écrite par chaque shard. */
export function summaryLine(plan) {
  const mode = plan.mode === 'complet' ? `complet — ${plan.reason}` : 'concernés'
  return `tests concernés : ${plan.files.length} fichiers sur ${plan.total} (mode : ${mode})`
}

/** Le shard `index` (1-based) sur `count` : répartition par rang sur la liste triée. */
export function shardFiles(files, index, count) {
  return [...files].sort().filter((_, i) => i % count === index - 1)
}

/**
 * Shard `index`/`count` par DURÉE quand `durationsFile` porte des durées (suite API, #ci/shards-api-par-duree) :
 * le rang (`shardFiles`) mettait les specs lourdes (demo-*, 40-70 s) dans les mêmes shards, d'où des
 * shards de 28 à 44 min sur la PR #5182. Sans fichier ou fichier vide : le rang, comme avant (repli déterministe).
 * Chemins relatifs à l'application (`src/...`), comme le fichier de durées.
 */
export function shardFilesByDuration(files, index, count, durationsFile, appPrefix) {
  const durations = durationsFile ? readDurations(durationsFile) : {}
  if (Object.keys(durations).length === 0) return shardFiles(files, index, count)
  const rel = files.map(f => f.slice(appPrefix.length))
  const plan = planShards(rel, durations, count, 0)
  return plan[index - 1].files.map(f => `${appPrefix}${f}`)
}

function listApiTestFiles() {
  const root = join(REPO_ROOT, 'apps', 'api', 'src')
  return readdirSync(root, { recursive: true, encoding: 'utf8' })
    .map(f => f.split('\\').join('/'))
    .filter(f => f.endsWith('.spec.ts') && !f.includes('node_modules/'))
    .map(f => `apps/api/src/${f}`)
    .sort()
}

/** Les tests que vitest / jest relient au diff, depuis la racine ; lève si l'outil échoue. */
function listRelatedTests(suite, mergeBase) {
  const app = join(REPO_ROOT, 'apps', suite)
  const cmd =
    suite === 'web'
      ? ['vitest', 'list', '--filesOnly', `--changed=${mergeBase}`]
      : ['jest', '--listTests', `--changedSince=${mergeBase}`]
  const out = spawnSync('npx', cmd, { cwd: app, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 })
  if (out.status !== 0)
    throw new Error(`${cmd.join(' ')} : ${(out.stderr || '').trim().split('\n').slice(-3).join(' ')}`)
  return (
    out.stdout
      .split('\n')
      // vitest préfixe chaque ligne de son projet : `[node] src/architecture/x.test.ts`.
      .map(l => l.trim().replace(/^\[[^\]]*\]\s*/, ''))
      .filter(l => /\.(test|spec)\.tsx?$/.test(l))
      .map(l => (l.startsWith('/') ? relative(REPO_ROOT, l) : relative(REPO_ROOT, join(app, l))).split('\\').join('/'))
  )
}

function argOf(argv, name, fallback) {
  const i = argv.indexOf(name)
  return i === -1 ? fallback : argv[i + 1]
}

function mainCi(argv) {
  const suite = argOf(argv, '--suite', '')
  if (suite !== 'web' && suite !== 'api') throw new Error('--suite web|api requis')
  const base = argOf(argv, '--base', 'origin/main')
  const [index, count] = argOf(argv, '--shard', '1/1').split('/').map(Number)
  const labels = argOf(argv, '--labels', process.env.PR_LABELS ?? '')
    .split(',')
    .map(l => l.trim())
    .filter(Boolean)
  const legacy = selectorLegacy()
  const appPrefix = `apps/${suite}/`
  const allTests = suite === 'web' ? listWebTestFiles().map(f => `${appPrefix}${f}`) : listApiTestFiles()
  const readSource = file => readFileSync(join(REPO_ROOT, file), 'utf8')

  let changed = []
  let generatedDiff = ''
  let relatedTests = []
  let planError = null
  try {
    const mergeBase = git(['merge-base', 'HEAD', base])[0]
    changed = git(['diff', '--name-only', mergeBase, 'HEAD'])
    if (suite === 'web' && changed.includes(GENERATED_SPEC_LIST))
      generatedDiff = git(['diff', '-U0', mergeBase, 'HEAD', '--', GENERATED_SPEC_LIST]).join('\n')
    // Inutile de lancer vitest / jest quand une fondation ou un label tranche déjà.
    if (!foundationReason(changed, legacy) && !forcesFullSuite(labels))
      relatedTests = listRelatedTests(suite, mergeBase)
  } catch (error) {
    planError = error instanceof Error ? error.message : String(error)
  }
  const alwaysRun = planError
    ? []
    : [
        // Interrupteur legacy : pas de diff passé → toute garde de lecture tourne (plancher d'avant).
        ...allTests.filter(f => isAlwaysRunTest(f, readSource, legacy ? undefined : changed)),
        ...changelogReaders(changed, allTests, readSource),
        ...ciGuardTests(changed, allTests),
        ...generatedListSpecs(generatedDiff, allTests),
      ]
  const plan = decideCiSelection({ changed, allTests, relatedTests, alwaysRun, labels, planError, legacy })
  const mine =
    suite === 'api'
      ? shardFilesByDuration(
          plan.files,
          index,
          count,
          argOf(argv, '--durations', process.env.CI_API_DURATIONS_FILE ?? ''),
          appPrefix,
        )
      : shardFiles(plan.files, index, count)
  process.stderr.write(`${summaryLine(plan)} — shard ${index}/${count} : ${mine.length} fichier(s)\n`)
  const out = argOf(argv, '--out', '')
  if (out) writeFileSync(out, mine.map(f => f.slice(appPrefix.length)).join('\n') + (mine.length ? '\n' : ''))
  process.stdout.write(`mode=${plan.mode}\n`)
}

function main(argv) {
  const base = argv.includes('--base') ? argv[argv.indexOf('--base') + 1] : 'origin/main'
  const dryRun = argv.includes('--dry-run')
  const changed = [
    ...new Set([
      ...git(['diff', '--name-only', `${base}...HEAD`]),
      ...git(['diff', '--name-only', 'HEAD']),
      ...git(['ls-files', '--others', '--exclude-standard']),
    ]),
  ].sort()
  const plan = planChangedRuns(changed, listIaTests(), file => readFileSync(join(REPO_ROOT, file), 'utf8'))
  process.stdout.write(`${changed.length} fichier(s) modifié(s) depuis ${base}\n`)
  const failures = []
  const step = (label, ...rest) => {
    if (run(label, ...rest, dryRun) !== 0) failures.push(label)
  }
  // `vitest related --run` et non `--changed` : `--changed` relit git lui-même
  // et verrait les fichiers de `notRunLocally`, donc relancerait tout.
  const existing = files => files.map(f => join(REPO_ROOT, f)).filter(f => existsSync(f))
  const webFiles = existing(plan.web)
  const contractFiles = existing(plan.contracts)
  if (webFiles.length > 0)
    step('web', 'npx', ['vitest', 'related', '--run', ...webFiles], join(REPO_ROOT, 'apps', 'web'))
  if (contractFiles.length > 0)
    step('contracts', 'npx', ['vitest', 'related', '--run', ...contractFiles], join(REPO_ROOT, 'packages', 'contracts'))
  if (plan.api)
    step('api', 'npx', ['jest', `--changedSince=${base}`, '--passWithNoTests'], join(REPO_ROOT, 'apps', 'api'))
  if (plan.ia === 'all' || plan.ia.length > 0) {
    const iaRoot = join(REPO_ROOT, 'apps', 'ia')
    const venvPython = join(iaRoot, '.venv', 'bin', 'python')
    const python = existsSync(venvPython) ? venvPython : 'python3'
    const targets = plan.ia === 'all' ? ['tests'] : plan.ia.map(f => relative(iaRoot, join(REPO_ROOT, f)))
    step('ia', python, ['-m', 'pytest', '-q', ...targets], iaRoot)
  }
  if (webFiles.length + contractFiles.length === 0 && !plan.api && plan.ia.length === 0)
    process.stdout.write('Aucun test concerné.\n')
  if (plan.notRunLocally.length > 0)
    process.stdout.write(
      `\n⚠ Modifiés, qui feraient relancer TOUTE la suite web par vitest — laissés à la CI :\n  ${plan.notRunLocally.join('\n  ')}\n`,
    )
  if (failures.length > 0) {
    process.stderr.write(`\n✗ rouge : ${failures.join(', ')}\n`)
    process.exit(1)
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  (process.argv[2] === 'ci' ? mainCi : main)(process.argv.slice(2))
