#!/usr/bin/env node
// Inventaire de la suite de tests (lot G, refonte CI du 31/10/2026) — LECTURE SEULE, ne supprime rien.
//
// Classe chaque fichier de test de apps/web (vitest), apps/api (jest) et apps/ia (pytest).
// Règles appliquées DANS CET ORDRE, la première qui touche décide (colonne `why`) :
//
//   1. integration — le test traverse de vrais composants : supertest, vrai Postgres (pg), `*.db.spec`, `*.integration.*`, AppModule réel,
//      testcontainers, client HTTP réel (python TestClient/httpx), fichier `*.e2e*`, dossier e2e/integration.
//   2. mirror      — le test recopie l'implémentation : (a) SQL attendu en littéral (`toContain('ALTER TABLE …')`),
//      (b) spec de migration qui mocke `QueryRunner.query`, (c) au moins 3 `toHaveBeenCalledWith` exacts
//      qui forment la majorité (>= 50 %) des `expect`.
//   3. guard-text  — le test lit le SOURCE comme du texte (`readFileSync`/`read_text`/`open` sur un chemin
//      de code, sql, workflow ou doc ; ou, côté ia, >= 60 % d'assertions « phrase in prompt ») puis assert avec `toContain`/`toMatch`/`.includes`/`in src`.
//   4. issue-proof — le test prouve un numéro d'issue plus qu'un comportement : le nom de fichier porte un
//      numéro (`#1234`, `4465`, `GA-393`, `issue-123`) ou au moins la moitié des titres `it()`/`def test_` citent `#\d{3,}`.
//   5. behavior    — tout le reste (valeur par défaut, volontairement large).
//
// Colonne `sensitive` : drapeau (chemin + titres) sécurité / multi-tenant / argent / RGPD. Sert UNIQUEMENT à
// exclure un fichier des candidats ; ce n'est pas une classe.
//
// Usage : node tools/tests/inventory.mjs [--date AAAA-MM-JJ] [--out docs/tests-inventory] [--sample 40 --seed 1]
// Sans --out, écrit dans docs/tests-inventory/. Rien d'autre n'est écrit.

import { readFileSync, readdirSync, statSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, relative, basename, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

export const CLASSES = ['behavior', 'integration', 'guard-text', 'issue-proof', 'mirror']

const SENSITIVE_RE =
  /(auth|rls|tenant|multi-?tenant|workspace|billing|stripe|credit|invoice|factur|encaiss|paiement|payment|gdpr|rgpd|erasure|effacement|security|securit|secret|permission|rbac|impersonat|jwt|cookie|csrf|cors|pii|consent|webhook)/i

const ISSUE_NAME_RE = /(#\d{3,}|(^|[^\d])\d{4,5}([^\d]|$)|GA-?\d{2,}|issue[-_ ]?\d{3,})/i
const ISSUE_TITLE_RE = /#\d{3,}/

/** Titres des tests et nombre de tests. */
export function extractTests(source, app) {
  const titles = []
  if (app === 'ia') {
    for (const m of source.matchAll(/^\s*(?:async\s+)?def\s+(test_\w+)/gm)) titles.push(m[1])
  } else {
    for (const m of source.matchAll(/\b(?:it|test)(?:\.(?:each|only|skip))?\s*\(\s*(['"`])((?:\\.|(?!\1).)*)\1/g)) {
      titles.push(m[2])
    }
  }
  return titles
}

function countMatches(source, re) {
  return (source.match(re) || []).length
}

/**
 * @param {{path: string, app: 'web'|'api'|'ia', source: string}} f
 * @returns {{cls: string, why: string, sensitive: boolean, tests: number}}
 */
export function classify({ path, app, source }) {
  const titles = extractTests(source, app)
  const sensitive = SENSITIVE_RE.test(path) || titles.some(t => SENSITIVE_RE.test(t))
  const out = (cls, why) => ({ cls, why, sensitive, tests: titles.length })

  // 1. integration
  if (/\.e2e[-.]|\.integration\.|\.db\.spec\.|(^|\/)(e2e|integration)\//.test(path))
    return out('integration', 'chemin e2e/integration')
  if (/from ['"]supertest['"]|require\(['"]supertest['"]\)/.test(source)) return out('integration', 'supertest')
  if (/testcontainers/i.test(source)) return out('integration', 'testcontainers')
  if (/\bTest\.createTestingModule\(\s*\{\s*imports:\s*\[\s*AppModule\b/.test(source))
    return out('integration', 'AppModule réel')
  if (app === 'ia' && /\bTestClient\(|\bASGITransport\(/.test(source))
    return out('integration', 'client HTTP FastAPI réel')

  if (/from ['"]pg['"]/.test(source) && /\bnew Client\(/.test(source)) return out('integration', 'vrai Postgres (pg)')

  // 2. mirror
  const sqlLiteral =
    /(toContain|toMatch|toEqual|toBe)\(\s*[`'"][^`'"]*\b(ALTER TABLE|CREATE (OR REPLACE )?(TABLE|INDEX|POLICY|FUNCTION|VIEW)|DROP (TABLE|COLUMN|POLICY|INDEX)|INSERT INTO|UPDATE \w+ SET)\b/i
  if (sqlLiteral.test(source)) return out('mirror', 'assertion sur du SQL littéral')
  if (
    /migration/i.test(path) &&
    /QueryRunner|queryRunner/.test(source) &&
    /query['"]?\)?\s*[:=,]|query:\s*(jest|vi)\.fn|\.query\b/.test(source)
  )
    return out('mirror', 'spec de migration qui mocke QueryRunner.query')
  const calledWith = countMatches(
    source,
    /\.(toHaveBeenCalledWith|toHaveBeenNthCalledWith|toHaveBeenLastCalledWith)\(/g,
  )
  const expects = countMatches(source, /\bexpect\(/g)
  if (calledWith >= 3 && expects > 0 && calledWith / expects >= 0.5)
    return out('mirror', `${calledWith}/${expects} assertions toHaveBeenCalledWith exactes`)

  // 3. guard-text
  const readsFile =
    /\b(readFileSync|readFile|readdirSync)\s*\(/.test(source) ||
    (app === 'ia' && /\.read_text\(|\bopen\(\s*[^)]*\.(py|ts|tsx|sql|ya?ml|md)\b/.test(source))
  const readsCode =
    /\.(ts|tsx|js|mjs|py|sql|ya?ml|md|json)['"`]/.test(source) ||
    /\bsrc\b|\bREPO_ROOT\b|__dirname|__file__/.test(source)
  const textAssert =
    /\.(toContain|toMatch|toMatchInlineSnapshot|indexOf|includes|match|search)\(|\bnot\.toMatch\(|\/[^\/\n]+\/[gimsuy]*\.test\(/.test(
      source,
    ) ||
    (app === 'ia' && /\bassert\s+(not\s+)?['"][^'"]+['"]\s+(not\s+)?in\s+\w+|re\.(search|match|findall)\(/.test(source))
  if (readsFile && readsCode && textAssert) return out('guard-text', 'lit le source comme texte + toContain/toMatch')

  // 3b. python : la majorité des assertions sont `"phrase" in PROMPT` (texte de prompt, pas un comportement)
  if (app === 'ia') {
    const asserts = countMatches(source, /^\s*assert\b/gm)
    const inText = countMatches(
      source,
      /^\s*assert\s+(not\s+)?(['"][^'"\n]+['"]|\w+(\.lower\(\))?)\s+(not\s+)?in\s+\w+/gm,
    )
    if (/from app\.prompts\b|import app\.prompts\b/.test(source) && asserts >= 3 && inText / asserts >= 0.6)
      return out('guard-text', `${inText}/${asserts} assertions « phrase in prompt »`)
  }

  // 4. issue-proof
  if (ISSUE_NAME_RE.test(basename(path))) return out('issue-proof', 'numéro d’issue dans le nom du fichier')
  const cited = titles.filter(t => ISSUE_TITLE_RE.test(t)).length
  if (titles.length > 0 && cited / titles.length >= 0.5)
    return out('issue-proof', `${cited}/${titles.length} titres citent #N`)

  // 5. behavior
  return out('behavior', 'aucune règle ci-dessus ne touche')
}

// ---------------------------------------------------------------- collecte

const TEST_FILE = {
  web: /\.(test|spec)\.(ts|tsx)$/,
  api: /\.(spec|test|e2e-spec)\.ts$/,
  ia: /(^test_.*|.*_test)\.py$/,
}
const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  'build',
  '.turbo',
  '.next',
  'coverage',
  '__pycache__',
  '.venv',
  'venv',
])

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) yield* walk(p)
    else yield p
  }
}

export function collect(root) {
  const files = []
  for (const app of ['web', 'api', 'ia']) {
    const base = join(root, 'apps', app)
    if (!existsSync(base)) continue
    for (const p of walk(base))
      if (TEST_FILE[app].test(basename(p))) files.push({ app, abs: p, path: relative(root, p) })
  }
  return files.sort((a, b) => (a.path < b.path ? -1 : 1))
}

function loadDurations(root) {
  const p = join(root, 'apps/web/test-durations.json')
  if (!existsSync(p)) return null
  try {
    return JSON.parse(readFileSync(p, 'utf8'))
  } catch {
    return null
  }
}

export function buildInventory(root) {
  const durations = loadDurations(root)
  return collect(root).map(f => {
    const source = readFileSync(f.abs, 'utf8')
    const c = classify({ path: f.path, app: f.app, source })
    const dur = durations && f.app === 'web' ? durations[f.path.replace(/^apps\/web\//, '')] : undefined
    return {
      app: f.app,
      path: f.path,
      cls: c.cls,
      why: c.why,
      sensitive: c.sensitive,
      tests: c.tests,
      lines: source.split('\n').length,
      duration_ms: dur ?? '',
    }
  })
}

// ---------------------------------------------------------------- sorties

const csvCell = v => {
  const s = String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
export const toCsv = rows =>
  ['app,path,class,why,sensitive,tests,lines,duration_ms']
    .concat(
      rows.map(r => [r.app, r.path, r.cls, r.why, r.sensitive, r.tests, r.lines, r.duration_ms].map(csvCell).join(',')),
    )
    .join('\n') + '\n'

export function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function sample(rows, n, seed) {
  const rnd = mulberry32(seed)
  const a = rows.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a.slice(0, n)
}

export function summary(rows, date) {
  const apps = ['web', 'api', 'ia']
  const L = [
    `# Inventaire des tests — ${date}`,
    '',
    `Généré par \`tools/tests/inventory.mjs\` (lecture seule, rien n’est supprimé). ${rows.length} fichiers.`,
    '',
  ]
  L.push(
    '## Comptes par classe et par app',
    '',
    `| classe | ${apps.join(' | ')} | total |`,
    `|---|${apps.map(() => '---:').join('|')}|---:|`,
  )
  for (const c of CLASSES) {
    const per = apps.map(a => rows.filter(r => r.cls === c && r.app === a).length)
    L.push(`| ${c} | ${per.join(' | ')} | ${per.reduce((x, y) => x + y, 0)} |`)
  }
  L.push(`| **total** | ${apps.map(a => rows.filter(r => r.app === a).length).join(' | ')} | ${rows.length} |`, '')
  L.push(
    `Fichiers « sensibles » (sécurité, multi-tenant, argent, RGPD — exclus des candidats) : ${rows.filter(r => r.sensitive).length}.`,
    '',
  )
  const timed = rows
    .filter(r => r.duration_ms !== '')
    .sort((a, b) => b.duration_ms - a.duration_ms)
    .slice(0, 30)
  L.push('## 30 plus lents', '')
  if (timed.length === 0) L.push('Pas de durées disponibles (`apps/web/test-durations.json` absent).')
  else {
    L.push(
      'Source : `apps/web/test-durations.json` (web seulement ; api/ia sans JUnit dans le dépôt).',
      '',
      '| ms | classe | fichier |',
      '|---:|---|---|',
    )
    for (const r of timed) L.push(`| ${r.duration_ms} | ${r.cls} | \`${r.path}\` |`)
  }
  L.push('', '## Échantillon de 10 par classe (vérification à l’œil)', '')
  for (const c of CLASSES) {
    L.push(`### ${c}`, '')
    for (const r of sample(
      rows.filter(x => x.cls === c),
      10,
      7,
    ))
      L.push(`- \`${r.path}\` — ${r.why}`)
    L.push('')
  }
  return L.join('\n')
}

// Candidats à fusion/suppression : jamais un fichier sensible, jamais behavior/integration.
// Répartition égale entre mirror / guard-text / issue-proof, les plus gros d'abord (gain maximal si fusionnés).
const JUSTIF = {
  mirror:
    'recopie l’implémentation (SQL ou appels exacts) : casse à chaque refactor sans prouver de comportement ; à fusionner dans un test de comportement du même module',
  'guard-text':
    'lit le source comme texte : redondant avec une garde GA-* ou un linter ; à fusionner dans la garde d’architecture voisine',
  'issue-proof':
    'prouve un numéro d’issue : à fusionner dans le test de comportement du module (la preuve vit dans le nom du cas)',
}
export function candidates(rows, max = 100) {
  const pools = ['mirror', 'guard-text', 'issue-proof'].map(c =>
    rows.filter(r => r.cls === c && !r.sensitive).sort((a, b) => b.lines - a.lines || (a.path < b.path ? -1 : 1)),
  )
  const out = []
  for (let i = 0; out.length < max && pools.some(p => i < p.length); i++)
    for (const p of pools) if (i < p.length && out.length < max) out.push(p[i])
  return out
}

export function candidatesMd(rows, date) {
  const cand = candidates(rows)
  const L = [
    `# Candidats lot 1 — fusion / suppression (${date})`,
    '',
    '**Statut : à valider par Louis. RIEN n’est supprimé ni modifié par cette PR.**',
    '',
    `${cand.length} fichiers (max 100), tirés de \`${date}.csv\` : classes \`mirror\`, \`guard-text\`, \`issue-proof\`, fichiers non sensibles uniquement.`,
    'EXCLUS d’office : tout fichier dont le chemin ou un titre de test évoque sécurité, auth, multi-tenant (workspace_id, RLS), argent / facturation / crédits, RGPD / effacement.',
    'Les `behavior` et `integration` ne sont jamais candidats. Un candidat est une hypothèse de l’heuristique, pas un verdict : lire le fichier avant de trancher.',
    '',
    '| # | app | classe | tests | lignes | fichier | justification |',
    '|--:|---|---|--:|--:|---|---|',
  ]
  cand.forEach((r, i) =>
    L.push(
      `| ${i + 1} | ${r.app} | ${r.cls} | ${r.tests} | ${r.lines} | \`${r.path}\` | ${JUSTIF[r.cls]} (${r.why}) |`,
    ),
  )
  L.push('')
  return L.join('\n')
}

function main() {
  const argv = process.argv.slice(2)
  const arg = (k, d) => {
    const i = argv.indexOf(k)
    return i >= 0 ? argv[i + 1] : d
  }
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
  const date = arg('--date', new Date().toISOString().slice(0, 10))
  const outDir = resolve(root, arg('--out', 'docs/tests-inventory'))
  const rows = buildInventory(root)
  mkdirSync(outDir, { recursive: true })
  writeFileSync(join(outDir, `${date}.csv`), toCsv(rows))
  writeFileSync(join(outDir, `${date}.md`), summary(rows, date))
  writeFileSync(join(outDir, 'candidats-lot-1.md'), candidatesMd(rows, date))
  if (argv.includes('--sample')) {
    const s = sample(rows, Number(arg('--sample', 40)), Number(arg('--seed', 1)))
    process.stdout.write(s.map(r => `${r.cls}\t${r.why}\t${r.path}`).join('\n') + '\n')
  }
  process.stderr.write(`inventory: ${rows.length} fichiers → ${relative(root, outDir)}/${date}.{csv,md}\n`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
