#!/usr/bin/env node
/**
 * `pnpm ci:local` — la porte locale = l'ÉTAGE 1 de la CI (lot `ci/5-process`).
 *
 * Ce que l'étage rapide de `ci.yml` vérifie sur une PR, lancé ici sur le diff
 * de la branche (merge-base avec `origin/main` → arbre de travail) :
 *
 *   claude-md   CLAUDE.md ≤ 15 000 octets (étape du job `quick`)
 *   format      prettier --check sur les fichiers modifiés (même règle que `quick`)
 *   lint        ESLint des paquets touchés, sur leurs fichiers modifiés ; knip
 *   types       check-types des paquets touchés (+ types des tests de l'API)
 *   doc         `scripts/garde-derive-doc.mjs` — la doc suit le code
 *   tests       web / API : le MÊME sélecteur que la CI (`test-changed.mjs ci`) ;
 *               contracts : vitest related ; IA : pytest des modules touchés
 *               (`planChangedRuns`) + les portes d'éval ; outils Python du dépôt
 *
 * Bornes locales (la suite complète appartient à la CI) : quand le sélecteur
 * rend `mode=complet` (fondation touchée), on lance les tests LIÉS au diff et
 * on le dit ; une suite IA entière (prompt, golden) est laissée à la CI et
 * dite. Une seule porte à la fois sur la machine (verrou), workers plafonnés.
 *
 * Vert ET arbre propre ⇒ témoin `<git-dir>/ci-local-ok` = SHA de HEAD, que lit
 * le hook `PreToolUse` de `.claude/settings.json` et le `pre-push` husky.
 *
 * Usage : pnpm ci:local [--base origin/main] [--no-fetch] [--dry-run]
 * Détail : docs/ci.md « Porte locale ».
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { planChangedRuns } from './test-changed.mjs'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const CLAUDE_MD_MAX = 15000
const LINTABLE = /\.(c|m)?(t|j)sx?$/
/** Les pytest du dépôt hors IA — la liste de l'étape « Pytest (tools/…) » du job `quick`. */
const TOOLS_PYTESTS = [
  'tools/avancement/test_mesure.py',
  'tools/issues/test_digest.py',
  'tools/issues/test_fusion_changelog.py',
  'tools/issues/test_fusion_fragments.py',
  'tools/recette/test_portee.py',
  'tools/registres/test_coherence.py',
]
const REGISTRE = /^\.claude\/notes\/registre-.*\.md$/
const WORKERS = process.env.CI_LOCAL_WORKERS || '4'

/** Les paquets du workspace dont au moins un fichier a changé. */
export function touchedPackages(changed, packages) {
  return packages.filter(p => changed.some(f => f.startsWith(`${p.dir}/`)))
}

const realScript = s => typeof s === 'string' && !/^\s*echo\b/.test(s)

/**
 * Les étapes, dans l'ordre de l'étage rapide. Une étape porte `skip` (raison)
 * quand elle est laissée à la CI : elle est AFFICHÉE, jamais tue.
 *   changed    fichiers modifiés (depuis la racine)
 *   packages   [{ dir, name, scripts }] du workspace
 *   iaTests    fichiers pytest existants de l'IA ; readSource lit l'un d'eux
 */
export function buildPlan({
  changed,
  packages,
  iaTests,
  readSource,
  base = 'origin/main',
  python = 'python3',
  cloud = false,
  exists = () => true,
}) {
  const steps = []
  steps.push({ id: 'claude-md', label: `CLAUDE.md ≤ ${CLAUDE_MD_MAX}`, builtin: 'claude-md', args: [] })
  steps.push({ id: 'format', label: 'Prettier (fichiers modifiés)', builtin: 'format', args: [] })

  const touched = touchedPackages(changed, packages)
  for (const p of touched) {
    if (!realScript(p.scripts?.lint)) continue
    // Un fichier SUPPRIMÉ par la branche n'est pas lintable : ESLint refuse « No files matching » (L7 31/10).
    const files = changed
      .filter(f => f.startsWith(`${p.dir}/`) && LINTABLE.test(f) && exists(f))
      .map(f => f.slice(p.dir.length + 1))
    if (files.length === 0) continue
    steps.push({
      id: `lint:${p.name}`,
      label: `ESLint ${p.name} (${files.length} fichier(s))`,
      cmd: 'pnpm',
      args: ['--filter', p.name, 'exec', 'eslint', '--no-warn-ignored', ...files],
    })
  }
  const node = touched.some(p => p.dir !== 'apps/ia')
  if (node) steps.push({ id: 'knip', label: 'Knip — exports de types', cmd: 'pnpm', args: ['lint:exports:types'] })

  const heavyNode = { NODE_OPTIONS: '--max-old-space-size=8192' }
  for (const p of touched) {
    if (!realScript(p.scripts?.['check-types'])) continue
    steps.push({
      id: `types:${p.name}`,
      label: `check-types ${p.name}`,
      // Les dépendances du paquet d'abord (`^build`, comme turbo en CI) — en cache après le premier passage.
      pre: {
        cmd: 'pnpm',
        args: ['exec', 'turbo', 'run', 'build', `--filter=${p.name}^...`, '--output-logs=errors-only'],
      },
      cmd: 'pnpm',
      args: ['--filter', p.name, 'run', 'check-types'],
      env: heavyNode,
    })
    if (realScript(p.scripts?.['check-types:tests']))
      steps.push({
        id: `types-tests:${p.name}`,
        label: `check-types:tests ${p.name}`,
        cmd: 'pnpm',
        args: ['--filter', p.name, 'run', 'check-types:tests'],
        env: heavyNode,
      })
  }

  steps.push({
    id: 'doc',
    label: 'La doc suit le code',
    cmd: 'node',
    args: ['scripts/garde-derive-doc.mjs', `${base}...HEAD`],
    okCodes: [0, 2],
  })

  const runs = planChangedRuns(changed, iaTests, readSource)
  // `runs.web` couvre apps/web, packages/ et tools/ (des tests web gardent les outils du dépôt).
  const webSources = runs.web.filter(f => !/\.(py|md)$/.test(f))
  if (webSources.length > 0)
    steps.push({
      id: 'tests:web',
      label: 'Tests web concernés',
      builtin: 'selected',
      args: [],
      suite: 'web',
      related: webSources,
    })
  if (runs.api)
    steps.push({
      id: 'tests:api',
      label: 'Tests API concernés',
      builtin: 'selected',
      args: [],
      suite: 'api',
      related: changed.filter(f => f.startsWith('apps/api/')),
    })
  if (runs.contracts.length > 0)
    steps.push({
      id: 'tests:contracts',
      label: 'Tests contracts liés',
      cmd: 'pnpm',
      args: ['--filter', '@bellum/contracts', 'exec', 'vitest', 'related', '--run', `--maxWorkers=${WORKERS}`].concat(
        runs.contracts.map(f => f.slice('packages/contracts/'.length)),
      ),
    })

  if (changed.some(f => f.startsWith('apps/ia/'))) {
    const pytest = { id: 'pytest:ia', label: 'pytest IA (modules touchés)', cmd: python, cwd: 'apps/ia' }
    if (runs.ia === 'all')
      steps.push({ ...pytest, args: [], skip: 'prompt / golden / config touché : suite IA complète = la CI' })
    else if (runs.ia.length > 0)
      steps.push({ ...pytest, args: ['-m', 'pytest', '-q', ...runs.ia.map(f => f.slice('apps/ia/'.length))] })
    const ia = { cmd: python, cwd: 'apps/ia' }
    steps.push({ ...ia, id: 'eval:ia', label: 'Eval gate (golden set)', args: ['-m', 'app.eval.gate', '--base', base] })
    steps.push({
      ...ia,
      id: 'eval-chat:ia',
      label: 'Eval gate (chat)',
      args: ['-m', 'app.eval.chat_gate', '--base', base],
    })
    steps.push({
      ...ia,
      id: 'eval-harness:ia',
      label: 'Eval harness (hors réseau)',
      args: ['-m', 'evals.run_eval', '--require', 'entities,zones'],
    })
  }

  if (changed.some(f => f.startsWith('tools/') && f.endsWith('.py')))
    steps.push({
      id: 'pytest:tools',
      label: 'pytest tools/',
      cmd: python,
      args: ['-m', 'pytest', '-q', ...TOOLS_PYTESTS],
    })
  if (changed.some(f => REGISTRE.test(f)))
    steps.push({
      id: 'registres',
      label: 'Cohérence des registres',
      cmd: python,
      args: ['tools/registres/coherence.py', ...changed.filter(f => REGISTRE.test(f))],
    })
  // Louis 31/10/2026 — sur une machine cloud (routine Claude Code), les tests et les évals ne finissent pas
  // (lot D Découvrir : 33 min, 33 pytest rouges dont 3 déjà rouges sur main, commits pris en otage dans la VM).
  // La suite appartient à la CI GitHub : on les SAUTE en le disant ; format, lint, types et doc restent joués.
  if (cloud)
    for (const s of steps)
      if (!s.skip && /^(tests:|pytest:|eval)/.test(s.id)) s.skip = 'machine cloud : tests et évals = la CI GitHub'
  return steps
}

// ───────────────────────── exécution ─────────────────────────

function sh(cmd, args, opts = {}) {
  return spawnSync(cmd, args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 512 * 1024 * 1024,
    ...opts,
    env: { ...process.env, ...(opts.env ?? {}) },
  })
}

function git(args) {
  const out = sh('git', args)
  if (out.status !== 0) throw new Error(`git ${args.join(' ')} : ${(out.stderr || '').trim()}`)
  return out.stdout.split('\n').filter(Boolean)
}

/**
 * Les fichiers que la porte juge : ceux que GIT SUIT (suivis ou `git add`és),
 * modifiés depuis le merge-base. Un fichier non suivi n'entrera dans aucun
 * commit, donc dans aucun push : le brouillon `.git-pr-body.md` d'un écrivain
 * a fait rougir Prettier et refuser un push bon (03/11). Une seule liste pour
 * toutes les étapes (prettier, eslint, knip, tests) et pour le compte affiché.
 */
export function listChangedFiles(mergeBase, cwd = REPO_ROOT) {
  const lines = args => {
    const out = sh('git', args, { cwd })
    if (out.status !== 0) throw new Error(`git ${args.join(' ')} : ${(out.stderr || '').trim()}`)
    return out.stdout.split('\n').filter(Boolean)
  }
  return {
    changed: [...new Set(lines(['diff', '--name-only', mergeBase]))].sort(),
    changedAcmr: [...new Set(lines(['diff', '--name-only', '--diff-filter=ACMR', mergeBase]))].sort(),
  }
}

function listPackages() {
  const out = []
  for (const top of ['apps', 'packages']) {
    const dir = join(REPO_ROOT, top)
    if (!existsSync(dir)) continue
    for (const name of readdirSync(dir)) {
      const pkg = join(dir, name, 'package.json')
      if (!existsSync(pkg)) continue
      const json = JSON.parse(readFileSync(pkg, 'utf8'))
      out.push({ dir: `${top}/${name}`, name: json.name, scripts: json.scripts ?? {} })
    }
  }
  return out
}

function listIaTests() {
  const root = join(REPO_ROOT, 'apps', 'ia', 'tests')
  if (!existsSync(root)) return []
  return readdirSync(root, { recursive: true, encoding: 'utf8' })
    .map(f => f.split('\\').join('/'))
    .filter(f => /(^|\/)test_[^/]*\.py$/.test(f))
    .map(f => `apps/ia/tests/${f}`)
    .sort()
}

/** Une porte à la fois sur la machine : les worktrees d'agents la partagent. */
function takeLock() {
  const lock = join(tmpdir(), 'bellum-ci-local.lock')
  const pause = new Int32Array(new SharedArrayBuffer(4))
  let announced = false
  for (;;) {
    try {
      mkdirSync(lock)
      writeFileSync(join(lock, 'pid'), String(process.pid))
      const release = () => rmSync(lock, { recursive: true, force: true })
      process.on('exit', release)
      for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => process.exit(130))
      return
    } catch {
      let holder = 0
      try {
        holder = Number(readFileSync(join(lock, 'pid'), 'utf8'))
        process.kill(holder, 0)
      } catch {
        // Porteur mort (ou verrou sans pid depuis plus d'une minute) : on le reprend.
        const age = existsSync(lock) ? Date.now() - statSync(lock).mtimeMs : 0
        if (holder || age > 60_000) rmSync(lock, { recursive: true, force: true })
      }
      if (!announced) process.stdout.write(`… en file : une autre porte tourne (pid ${holder || '?'})\n`)
      announced = true
      Atomics.wait(pause, 0, 0, 5000)
    }
  }
}

function tail(text, n = 30) {
  return text.trimEnd().split('\n').slice(-n).join('\n')
}

function runSelected(step, ctx) {
  const listFile = join(ctx.logDir, `${step.suite}-files.txt`)
  const sel = sh('node', [
    'tools/ci/test-changed.mjs',
    'ci',
    '--suite',
    step.suite,
    '--base',
    ctx.base,
    '--out',
    listFile,
  ])
  const mode = /mode=(\w+)/.exec(sel.stdout)?.[1]
  const summary = (sel.stderr || '').trim().split('\n').pop() ?? ''
  if (sel.status !== 0 || !mode)
    return { status: 1, output: `${sel.stdout}\n${sel.stderr}`, note: 'sélecteur en échec' }
  const app = join(REPO_ROOT, 'apps', step.suite)
  if (mode === 'complet') {
    // Suite complète = la CI. En local : les tests liés au diff (graphe d'imports).
    const related = (step.related ?? []).filter(f => existsSync(join(REPO_ROOT, f))).map(f => join(REPO_ROOT, f))
    const note = `${summary} → en local : tests liés au diff seulement, suite complète = la CI`
    if (related.length === 0) return { status: 0, output: '', note }
    const args =
      step.suite === 'web'
        ? ['exec', 'vitest', 'related', '--run', `--maxWorkers=${WORKERS}`, ...related]
        : ['exec', 'jest', `--maxWorkers=${WORKERS}`, '--passWithNoTests', '--findRelatedTests', ...related]
    const out = sh('pnpm', args, { cwd: app })
    return { status: out.status ?? 1, output: `${out.stdout}\n${out.stderr}`, note }
  }
  const files = readFileSync(listFile, 'utf8').split('\n').filter(Boolean)
  const note = summary
  if (files.length === 0) return { status: 0, output: '', note }
  const args =
    step.suite === 'web'
      ? ['exec', 'vitest', 'run', `--maxWorkers=${WORKERS}`, ...files]
      : ['exec', 'jest', `--maxWorkers=${WORKERS}`, '--runTestsByPath', ...files]
  const out = sh('pnpm', args, { cwd: app })
  return { status: out.status ?? 1, output: `${out.stdout}\n${out.stderr}`, note }
}

function runFormat(ctx) {
  const files = ctx.changedAcmr.filter(f => existsSync(join(REPO_ROOT, f)))
  const config = ctx.changed.find(f =>
    /(^|\/)\.prettier|(^|\/)prettier\.config\.|^packages\/tooling\/prettier\//.test(f),
  )
  const note = config ? `config prettier modifiée (${config}) : le dépôt entier est vérifié par la CI` : ''
  if (files.length === 0) return { status: 0, output: '', note: note || 'aucun fichier' }
  const out = sh('pnpm', [
    'exec',
    'prettier',
    '--check',
    '--ignore-unknown',
    '--no-error-on-unmatched-pattern',
    ...files,
  ])
  return { status: out.status ?? 1, output: `${out.stdout}\n${out.stderr}`, note: note || `${files.length} fichier(s)` }
}

function runClaudeMd() {
  const file = join(REPO_ROOT, 'CLAUDE.md')
  const n = existsSync(file) ? statSync(file).size : 0
  return { status: n > CLAUDE_MD_MAX ? 1 : 0, output: `CLAUDE.md : ${n} octets`, note: `${n} / ${CLAUDE_MD_MAX}` }
}

function runStep(step, ctx) {
  if (step.builtin === 'claude-md') return runClaudeMd()
  if (step.builtin === 'format') return runFormat(ctx)
  if (step.builtin === 'selected') return runSelected(step, ctx)
  const cwd = join(REPO_ROOT, step.cwd ?? '.')
  let output = ''
  if (step.pre) {
    const pre = sh(step.pre.cmd, step.pre.args, { cwd })
    output += `${pre.stdout}\n${pre.stderr}`
    if (pre.status !== 0) return { status: pre.status ?? 1, output, note: 'build des dépendances en échec' }
  }
  const out = sh(step.cmd, step.args ?? [], { cwd, env: step.env })
  output += `${out.stdout}\n${out.stderr}`
  const ok = (step.okCodes ?? [0]).includes(out.status ?? 1)
  const note = step.id === 'doc' && out.status === 2 ? 'non applicable (aucune fiche couverte)' : ''
  return { status: ok ? 0 : (out.status ?? 1), output, note }
}

function main(argv) {
  const base = argv.includes('--base') ? argv[argv.indexOf('--base') + 1] : 'origin/main'
  const dryRun = argv.includes('--dry-run')
  if (!argv.includes('--no-fetch') && base.startsWith('origin/'))
    sh('git', ['fetch', '-q', '--no-tags', 'origin', base.slice('origin/'.length)])
  const gitDir = resolve(REPO_ROOT, git(['rev-parse', '--git-dir'])[0])
  const witness = join(gitDir, 'ci-local-ok')
  const head = git(['rev-parse', 'HEAD'])[0]
  const mergeBase = git(['merge-base', 'HEAD', base])[0]
  const { changed, changedAcmr } = listChangedFiles(mergeBase)
  const dirty = git(['status', '--porcelain', '--untracked-files=no']).length > 0
  // Le venv de l'IA : celui du worktree, sinon celui de l'arbre principal (un worktree n'en a pas).
  const mainRoot = resolve(REPO_ROOT, git(['rev-parse', '--git-common-dir'])[0], '..')
  const venv = [REPO_ROOT, mainRoot]
    .map(root => join(root, 'apps', 'ia', '.venv', 'bin', 'python'))
    .find(p => existsSync(p))
  const plan = buildPlan({
    changed,
    packages: listPackages(),
    iaTests: listIaTests(),
    readSource: f => readFileSync(join(REPO_ROOT, f), 'utf8'),
    base,
    python: venv ?? 'python3',
    // Variable posée par Claude Code dans ses sessions cloud.
    cloud: process.env.CLAUDE_CODE_REMOTE === 'true',
    exists: f => existsSync(join(REPO_ROOT, f)),
  })
  process.stdout.write(`ci:local — ${changed.length} fichier(s) depuis ${base} · HEAD ${head.slice(0, 10)}\n`)
  if (dryRun) {
    for (const s of plan)
      process.stdout.write(
        `  ${s.skip ? '·' : '▶'} ${s.label}${s.skip ? ` — ${s.skip}` : ''}${s.cmd ? ` : ${s.cmd} ${(s.args ?? []).join(' ')}` : ''}\n`,
      )
    return 0
  }
  if (existsSync(witness)) unlinkSync(witness)
  takeLock()
  const logDir = join(gitDir, 'ci-local')
  mkdirSync(logDir, { recursive: true })
  const ctx = { base, changed, changedAcmr, logDir }
  const red = []
  const t0 = Date.now()
  for (const step of plan) {
    if (step.skip) {
      process.stdout.write(`  · ${step.label} — ${step.skip}\n`)
      continue
    }
    const t = Date.now()
    const res = runStep(step, ctx)
    const secs = ((Date.now() - t) / 1000).toFixed(1)
    const log = join(logDir, `${step.id.replace(/[^\w.-]+/g, '_')}.log`)
    writeFileSync(log, res.output ?? '')
    const note = res.note ? ` — ${res.note}` : ''
    if (res.status === 0) process.stdout.write(`  ✓ ${step.label} (${secs} s)${note}\n`)
    else {
      red.push(step.label)
      process.stdout.write(
        `  ✗ ${step.label} (rc ${res.status}, ${secs} s)${note}\n${tail(res.output ?? '')}\n  journal : ${relative(REPO_ROOT, log) || log}\n`,
      )
    }
  }
  const total = ((Date.now() - t0) / 1000).toFixed(0)
  if (red.length > 0) {
    process.stdout.write(`\n✗ ci:local ROUGE en ${total} s : ${red.join(' · ')}\n`)
    return 1
  }
  if (dirty) {
    process.stdout.write(
      `\n✓ ci:local vert en ${total} s — arbre modifié non commité : AUCUN témoin écrit (commite, relance)\n`,
    )
    return 0
  }
  writeFileSync(witness, `${head}\n`)
  process.stdout.write(`\n✓ ci:local vert en ${total} s — témoin ${head.slice(0, 10)} écrit\n`)
  return 0
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  process.exit(main(process.argv.slice(2)))
