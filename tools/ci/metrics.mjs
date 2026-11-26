#!/usr/bin/env node
// Météo CI — la ligne de base chiffrée de `ci.yml` (Phase 0, docs/ci.md).
// REST seulement (`gh api`), aucune dépendance. Usage :
//   node tools/ci/metrics.mjs [--days 3] [--logs 40] [--out docs/ci-metrics]
// Sortie : <out>/<date>.json et <out>/<date>.md.
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const REPO = process.env.GH_REPO || 'Bellum-AI/belllum-monorepo'
const WORKFLOW = 'ci.yml'

export function parseArgs(argv) {
  const opts = { days: 3, logs: 40, out: 'docs/ci-metrics' }
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i].replace(/^--/, '')
    if (!(key in opts)) throw new Error(`option inconnue : ${argv[i]}`)
    opts[key] = key === 'out' ? argv[i + 1] : Number(argv[i + 1])
  }
  return opts
}

const execFileAsync = promisify(execFile)

async function api(path, { raw = false } = {}, attempt = 1) {
  const { stdout } = await execFileAsync(
    'gh',
    ['api', '-H', 'Accept: application/vnd.github+json', `repos/${REPO}/${path}`],
    {
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
    },
  ).catch(error => {
    // Erreur serveur GitHub (5xx) : l'infra, pas la donnée — trois essais.
    if (attempt < 3 && /HTTP 5\d\d/.test(error.stderr ?? ''))
      return api(path, { raw }, attempt + 1).then(v => ({ stdout: raw ? v : JSON.stringify(v) }))
    throw error
  })
  return raw ? stdout : JSON.parse(stdout)
}

/** `fn` sur chaque élément, `width` appels REST à la fois. */
async function pool(items, width, fn) {
  const out = new Array(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i])
    }
  }
  await Promise.all(Array.from({ length: width }, worker))
  return out
}

async function paginate(path, key, max = 3000) {
  const items = []
  for (let page = 1; items.length < max; page++) {
    const sep = path.includes('?') ? '&' : '?'
    const body = await api(`${path}${sep}per_page=100&page=${page}`)
    const batch = (key ? body[key] : body) ?? []
    items.push(...batch)
    if (batch.length < 100) break
  }
  return items
}

const minutes = (a, b) => (a && b ? (Date.parse(b) - Date.parse(a)) / 60000 : null)

export function percentile(values, p) {
  const xs = values.filter(v => v != null).sort((a, b) => a - b)
  if (!xs.length) return null
  const idx = Math.min(xs.length - 1, Math.ceil((p / 100) * xs.length) - 1)
  return Math.round(xs[Math.max(0, idx)] * 10) / 10
}

/** Un run annulé : coupé sur un rouge, remplacé par un run plus récent, ou annulé de l'extérieur. */
export function cancelCause(run, jobs, laterRunExists) {
  const redStep = jobs.some(j => j.conclusion === 'failure' || (j.steps ?? []).some(s => s.conclusion === 'failure'))
  if (redStep) return 'red-cut'
  if (laterRunExists) return 'superseded'
  const timedOut = jobs.some(j => j.conclusion === 'cancelled' && minutes(j.started_at, j.completed_at) >= 60)
  return timedOut ? 'timeout-or-external' : 'external'
}

/** Verdict réel d'un run : un run annulé qui porte une étape rouge est un ROUGE. */
export function realVerdict(run, jobs) {
  if (run.conclusion === 'cancelled') return cancelCause(run, jobs, false) === 'red-cut' ? 'failure' : 'cancelled'
  return run.conclusion ?? 'in_progress'
}

/** La ligne de mesure du sélecteur (`tools/ci/test-changed.mjs` › summaryLine). */
export function parseSelection(log) {
  const m = log.match(/tests concernés : (\d+) fichiers sur (\d+) \(mode : (concernés|complet)(?: — ([^)\n]*))?\)/)
  return m
    ? { files: +m[1], total: +m[2], mode: m[3] === 'concernés' ? 'concernes' : 'complet', reason: m[4] ?? '' }
    : null
}

export const jobKind = name =>
  name.startsWith('Test (Web)')
    ? 'web'
    : name.startsWith('Test (API)')
      ? 'api'
      : name.startsWith('Test (IA')
        ? 'ia'
        : name.split(' (')[0]

/** Classe d'hôte de chaque runner, lue dans la table de `infra/ci-runner-vps/runbook.md`. */
export function readHostClasses(runbook) {
  const classes = {}
  for (const m of runbook.matchAll(/^\| `[^`]+` *\| (\w+) .*\| \d+ : (.*)\|$/gm))
    for (const name of m[2].match(/vps-[0-9a-f]+/g) ?? []) classes[name] = m[1]
  return classes
}

export function hostClass(runnerName, classes = {}) {
  if (!runnerName) return 'inconnu'
  if (/^GitHub Actions/i.test(runnerName)) return 'github'
  const known = Object.keys(classes).find(k => k.startsWith(runnerName) || runnerName.startsWith(k))
  return known ? classes[known] : 'non documenté'
}

async function summarize(opts) {
  const runbook = 'infra/ci-runner-vps/runbook.md'
  const classes = existsSync(runbook) ? readHostClasses(readFileSync(runbook, 'utf8')) : {}
  const since = new Date(Date.now() - opts.days * 86400000).toISOString().slice(0, 10)
  // L'API de recherche plafonne à 1 000 résultats par requête : une requête par jour.
  const days = Array.from({ length: opts.days + 1 }, (_, i) =>
    new Date(Date.now() - (opts.days - i) * 86400000).toISOString().slice(0, 10),
  )
  const perDay = await pool(days, 4, day =>
    paginate(`actions/workflows/${WORKFLOW}/runs?created=${day}`, 'workflow_runs'),
  )
  const runs = perDay.flat().filter(r => r.status === 'completed')
  const byRun = new Map()
  const jobLists = await pool(runs, 8, run =>
    paginate(`actions/runs/${run.id}/attempts/${run.run_attempt}/jobs`, 'jobs'),
  )
  runs.forEach((run, i) => byRun.set(run.id, jobLists[i]))

  const rows = runs.map(run => {
    const jobs = byRun.get(run.id)
    const later = runs.some(
      o =>
        o.id !== run.id && o.head_branch === run.head_branch && o.event === run.event && o.created_at > run.created_at,
    )
    const runnerMin = jobs.reduce((s, j) => s + (minutes(j.started_at, j.completed_at) ?? 0), 0)
    return {
      id: run.id,
      event: run.event,
      branch: run.head_branch,
      sha: run.head_sha,
      pr: run.pull_requests?.[0]?.number ?? null,
      created_at: run.created_at,
      conclusion: run.conclusion,
      verdict: realVerdict(run, jobs),
      cancel_cause: run.conclusion === 'cancelled' ? cancelCause(run, jobs, later) : null,
      duration_min: minutes(run.run_started_at ?? run.created_at, run.updated_at),
      runner_min: Math.round(runnerMin * 10) / 10,
      jobs: jobs.map(j => ({
        id: j.id,
        name: j.name,
        kind: jobKind(j.name),
        conclusion: j.conclusion,
        host: hostClass(j.runner_name, classes),
        queue_min: minutes(j.created_at, j.started_at),
        run_min: minutes(j.started_at, j.completed_at),
      })),
    }
  })

  // Mode du sélecteur, sur un échantillon de journaux de shards (un appel par journal).
  const selection = []
  const sampled = rows
    .filter(r => r.event === 'pull_request')
    .flatMap(r =>
      ['web', 'api'].map(kind => ({ r, j: r.jobs.find(j => j.kind === kind && j.run_min > 0) })).filter(x => x.j),
    )
  const perKind = { web: 0, api: 0 }
  const picked = sampled.filter(({ j }) => perKind[j.kind]++ < opts.logs / 2)
  await pool(picked, 8, async ({ r, j }) => {
    try {
      const sel = parseSelection(await api(`actions/jobs/${j.id}/logs`, { raw: true }))
      if (sel) selection.push({ run: r.id, kind: j.kind, ...sel })
    } catch {
      // journal expiré ou illisible : on ne compte pas, on ne devine pas
    }
  })

  // Runner-min par PR fusionnée : tous les runs de sa branche, rouges et annulés compris.
  const merged = await paginate(`pulls?state=closed&sort=updated&direction=desc`, null, 300)
  return { since, rows, selection, merged }
}

export function report({ since, rows, selection, merged }, days) {
  const pr = rows.filter(r => r.event === 'pull_request')
  const main = rows.filter(r => r.event === 'push')
  const pct = (n, d) => (d ? Math.round((100 * n) / d) : null)
  const allJobs = rows.flatMap(r => r.jobs)

  const firstRuns = new Map()
  for (const r of [...pr].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    const key = r.pr ?? r.branch
    if (!firstRuns.has(key)) firstRuns.set(key, r)
  }
  const first = [...firstRuns.values()].filter(r => r.verdict !== 'cancelled')

  const mergedPrs = merged.filter(p => p.merged_at && p.merged_at >= since)
  const perPr = mergedPrs
    .map(p => rows.filter(r => r.branch === p.head.ref).reduce((s, r) => s + r.runner_min, 0))
    .filter(v => v > 0)

  const cancelled = rows.filter(r => r.conclusion === 'cancelled')
  const causes = {}
  for (const r of cancelled) causes[r.cancel_cause] = (causes[r.cancel_cause] ?? 0) + 1

  const byKindHost = {}
  for (const j of allJobs.filter(j => j.run_min > 0 && j.conclusion === 'success')) {
    const k = `${j.kind} @ ${j.host}`
    ;(byKindHost[k] ??= []).push(j.run_min)
  }

  const prGreen = pr.filter(r => r.verdict === 'success')
  const metrics = {
    window_days: days,
    since,
    runs_total: rows.length,
    runs_per_day: Math.round(rows.length / days),
    pr_duration_green_p50: percentile(
      prGreen.map(r => r.duration_min),
      50,
    ),
    pr_duration_green_p90: percentile(
      prGreen.map(r => r.duration_min),
      90,
    ),
    pr_runner_min_p50: percentile(
      pr.map(r => r.runner_min),
      50,
    ),
    pr_runner_min_p90: percentile(
      pr.map(r => r.runner_min),
      90,
    ),
    runner_min_per_merged_pr_p50: percentile(perPr, 50),
    runner_min_per_merged_pr_mean: perPr.length ? Math.round(perPr.reduce((a, b) => a + b, 0) / perPr.length) : null,
    merged_prs: mergedPrs.length,
    cancelled_pct: pct(cancelled.length, rows.length),
    cancel_causes: causes,
    red_rate_real_pct: pct(
      rows.filter(r => r.verdict === 'failure').length,
      rows.filter(r => r.verdict !== 'cancelled').length,
    ),
    first_run_red_pct: pct(first.filter(r => r.verdict === 'failure').length, first.length),
    main_green_pct: pct(main.filter(r => r.verdict === 'success').length, main.length),
    main_runs: main.length,
    main_cancelled: main.filter(r => r.verdict === 'cancelled').length,
    queue_p50: percentile(
      allJobs.map(j => j.queue_min),
      50,
    ),
    queue_p90: percentile(
      allJobs.map(j => j.queue_min),
      90,
    ),
    queue_max: percentile(
      allJobs.map(j => j.queue_min),
      100,
    ),
    selection_web_concernes_pct: pct(
      selection.filter(s => s.kind === 'web' && s.mode === 'concernes').length,
      selection.filter(s => s.kind === 'web').length,
    ),
    selection_api_concernes_pct: pct(
      selection.filter(s => s.kind === 'api' && s.mode === 'concernes').length,
      selection.filter(s => s.kind === 'api').length,
    ),
    selection_sampled: selection.length,
    duration_by_kind_host: Object.fromEntries(
      Object.entries(byKindHost)
        .filter(([, v]) => v.length >= 3)
        .sort()
        .map(([k, v]) => [k, { n: v.length, p50: percentile(v, 50), p90: percentile(v, 90) }]),
    ),
  }
  const reasons = {}
  for (const s of selection.filter(s => s.mode === 'complet')) {
    const key = `${s.kind}: ${s.reason.replace(/\d+/g, 'N').slice(0, 90)}`
    reasons[key] = (reasons[key] ?? 0) + 1
  }
  metrics.full_suite_reasons = reasons
  return metrics
}

export function toMarkdown(m) {
  const line = (label, value, target) => `| ${label} | ${value ?? '—'} | ${target} |`
  return [
    `# Météo CI — fenêtre de ${m.window_days} j depuis le ${m.since}`,
    '',
    `Généré par \`node tools/ci/metrics.mjs --days ${m.window_days}\`. ${m.runs_total} runs \`ci.yml\` (${m.runs_per_day}/j), ${m.merged_prs} PR fusionnées.`,
    '',
    '| Indicateur | Mesuré | Cible (SLO, docs/ci.md) |',
    '|---|---|---|',
    line('CI de PR verte, p50 / p90 (min)', `${m.pr_duration_green_p50} / ${m.pr_duration_green_p90}`, '≤ 10 / ≤ 20'),
    line('Runner-min par run de PR, p50 / p90', `${m.pr_runner_min_p50} / ${m.pr_runner_min_p90}`, '—'),
    line(
      'Runner-min par PR fusionnée, p50 / moyenne',
      `${m.runner_min_per_merged_pr_p50} / ${m.runner_min_per_merged_pr_mean}`,
      '≤ 60',
    ),
    line('Runs annulés (%)', m.cancelled_pct, '—'),
    line('Taux de rouge réel, annulés-sur-rouge compris (%)', m.red_rate_real_pct, '—'),
    line("Rouge au 1er run d'une PR (%)", m.first_run_red_pct, '≤ 15'),
    line(`\`main\` vert (% de ${m.main_runs} pushes, ${m.main_cancelled} annulés)`, m.main_green_pct, '≥ 97'),
    line(
      "File d'attente par job, p50 / p90 / max (min)",
      `${m.queue_p50} / ${m.queue_p90} / ${m.queue_max}`,
      'p90 ≤ 3',
    ),
    line(`Web en mode \`concernés\` (% de l'échantillon)`, m.selection_web_concernes_pct, '≥ 70'),
    line(`API en mode \`concernés\` (% de l'échantillon)`, m.selection_api_concernes_pct, '—'),
    '',
    "## Causes d'annulation",
    '',
    ...Object.entries(m.cancel_causes).map(([k, v]) => `- \`${k}\` : ${v}`),
    '',
    `## Bascules en suite complète (échantillon de ${m.selection_sampled} journaux)`,
    '',
    ...Object.entries(m.full_suite_reasons)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `- ${v} × ${k}`),
    '',
    "## Durée des jobs verts par type × classe d'hôte (min)",
    '',
    '| Job @ hôte | n | p50 | p90 |',
    '|---|---|---|---|',
    ...Object.entries(m.duration_by_kind_host).map(([k, v]) => `| ${k} | ${v.n} | ${v.p50} | ${v.p90} |`),
    '',
  ].join('\n')
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const opts = parseArgs(process.argv.slice(2))
  const data = await summarize(opts)
  const metrics = report(data, opts.days)
  const date = new Date().toISOString().slice(0, 10)
  mkdirSync(opts.out, { recursive: true })
  writeFileSync(join(opts.out, `${date}.json`), JSON.stringify(metrics, null, 2) + '\n')
  writeFileSync(join(opts.out, `${date}.md`), toMarkdown(metrics))
  process.stdout.write(toMarkdown(metrics))
}
