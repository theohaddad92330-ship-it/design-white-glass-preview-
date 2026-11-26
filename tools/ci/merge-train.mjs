#!/usr/bin/env node
/**
 * La file de fusion maison (plan GitHub Team, dépôt privé : pas de merge queue native).
 * Détail, cycle de vie et interrupteurs : docs/ci.md § « La file de fusion ».
 *
 *   node tools/ci/merge-train.mjs [--all] [--dry-run] [--can-update] [--dispatch a.yml,b.yml]
 *
 *   --all          toutes les PR prêtes (sinon : celles qui portent le label `ci:train`)
 *   --dry-run      lit tout, n'écrit RIEN : affiche la décision
 *   --can-update   le jeton peut déclencher des workflows (MERGE_TRAIN_TOKEN) : mise à jour de la
 *                  branche et réouverture autorisées. Un GITHUB_TOKEN ne déclenche pas la CI.
 *   --dispatch     workflows à lancer sur main après une fusion (la fusion par GITHUB_TOKEN ne
 *                  déclenche pas les workflows `push`)
 *
 * Sans état : chaque passage fait UN pas sur la PR de tête (mettre à jour, attendre, fusionner,
 * éjecter). Rejouable à volonté ; le workflow garantit un seul train à la fois.
 * Env : GITHUB_TOKEN | MERGE_TRAIN_TOKEN, GITHUB_REPOSITORY.
 */
import { pathToFileURL } from 'node:url'

export const TRAIN_LABEL = 'ci:train'
export const STATUS_CHECK = 'CI Status'
const FAILED = new Set(['failure', 'timed_out', 'action_required', 'startup_failure'])

/**
 * Les PR candidates, dans l'ordre de pose du label. Pures : `labeledAt` est fourni par l'appelant.
 * Brouillon, fermée, sans label (hors `all`) : jamais candidate.
 */
export function orderQueue(prs, { all = false } = {}) {
  return prs
    .filter(pr => pr.state === 'open' && !pr.draft)
    .filter(pr => all || pr.labels.includes(TRAIN_LABEL))
    .sort((a, b) => (a.labeledAt ?? '').localeCompare(b.labeledAt ?? '') || a.number - b.number)
}

/** Le dernier `CI Status` du SHA (un rejeu en crée un nouveau) ; `null` s'il n'existe pas encore. */
export function latestStatus(checkRuns) {
  const runs = checkRuns.filter(r => r.name === STATUS_CHECK).sort((a, b) => b.id - a.id)
  return runs[0] ?? null
}

/** Les jobs rouges d'un SHA, pour le commentaire d'éjection. */
export function failedJobs(checkRuns) {
  return checkRuns
    .filter(r => r.name !== STATUS_CHECK && FAILED.has(r.conclusion))
    .map(r => r.name)
    .sort()
}

/**
 * Le pas à faire sur la PR de tête.
 *
 *   pr         { behind, mergeable, labeledAt, headSha }  (`mergeable` : true | false | null)
 *   status     le check-run `CI Status` du SHA courant, ou null
 *   canUpdate  le jeton déclenche les workflows
 *
 * Retour : { action: 'eject'|'update'|'reopen'|'wait'|'merge'|'skip', reason }
 *   eject   conflit ou CI rouge : label retiré, commentaire, PR suivante
 *   update  en retard sur main : update-branch (la CI repart sur le nouveau SHA)
 *   reopen  la CI de ce SHA date d'AVANT le label (suite partielle) : fermer/rouvrir la relance
 *   wait    CI en cours ou pas encore créée
 *   merge   à jour, suite complète verte
 *   skip    il faudrait écrire mais le jeton ne déclenche pas la CI : on laisse la main à un humain
 */
export function decideStep({ pr, status, canUpdate }) {
  if (pr.mergeable === false) return { action: 'eject', reason: 'conflit avec main' }
  if (pr.behind) {
    return canUpdate
      ? { action: 'update', reason: 'en retard sur main' }
      : { action: 'skip', reason: 'en retard sur main et MERGE_TRAIN_TOKEN absent (la CI ne repartirait pas)' }
  }
  if (!status) return { action: 'wait', reason: 'CI Status pas encore créé' }
  const startedAt = status.started_at ?? status.created_at ?? ''
  if (pr.labeledAt && startedAt && startedAt < pr.labeledAt) {
    // Un check encore en cours né avant le label tourne en suite PARTIELLE : on le relance.
    return canUpdate
      ? { action: 'reopen', reason: 'CI lancée avant le label : suite partielle' }
      : { action: 'skip', reason: 'CI lancée avant le label et MERGE_TRAIN_TOKEN absent' }
  }
  if (status.status !== 'completed') return { action: 'wait', reason: 'CI en cours' }
  if (status.conclusion === 'success') return { action: 'merge', reason: 'CI Status vert, suite complète' }
  if (status.conclusion === 'cancelled') return { action: 'wait', reason: 'CI annulée : en attente d’un run neuf' }
  return { action: 'eject', reason: `CI Status ${status.conclusion}` }
}

/** Le corps du commentaire posé quand une PR sort de la file. */
export function ejectionComment({ reason, failed }) {
  const jobs = failed.length ? `\nJobs rouges : ${failed.map(j => `\`${j}\``).join(', ')}.` : ''
  return `File de fusion : PR retirée (${reason}).${jobs}\nCorrige, puis repose le label \`${TRAIN_LABEL}\` pour reprendre ta place.`
}

// ───────────────────────────── REST ─────────────────────────────

function makeApi({ token, repo }) {
  return async function api(method, path, body) {
    const res = await fetch(`https://api.github.com/repos/${repo}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    })
    const text = await res.text()
    const data = text ? JSON.parse(text) : null
    return { ok: res.ok, status: res.status, data }
  }
}

async function loadCandidates(api, all) {
  const list = await api('GET', '/pulls?state=open&per_page=100')
  if (!list.ok) throw new Error(`liste des PR : HTTP ${list.status}`)
  const prs = []
  for (const p of list.data) {
    const labels = p.labels.map(l => l.name)
    let labeledAt = null
    if (labels.includes(TRAIN_LABEL)) {
      const ev = await api('GET', `/issues/${p.number}/events?per_page=100`)
      const hits = ev.ok ? ev.data.filter(e => e.event === 'labeled' && e.label?.name === TRAIN_LABEL) : []
      labeledAt = hits.length ? hits[hits.length - 1].created_at : null
    }
    prs.push({
      number: p.number,
      state: p.state,
      draft: p.draft,
      labels,
      labeledAt,
      headSha: p.head.sha,
      base: p.base.ref,
    })
  }
  return orderQueue(
    prs.filter(p => p.base === 'main'),
    { all },
  )
}

async function inspect(api, cand) {
  const full = await api('GET', `/pulls/${cand.number}`)
  if (!full.ok) throw new Error(`PR #${cand.number} : HTTP ${full.status}`)
  const headSha = full.data.head.sha
  const cmp = await api('GET', `/compare/main...${headSha}`)
  const behind = cmp.ok ? cmp.data.behind_by > 0 : false
  const checks = await api('GET', `/commits/${headSha}/check-runs?per_page=100`)
  const runs = checks.ok ? checks.data.check_runs : []
  return {
    pr: { ...cand, headSha, behind, mergeable: full.data.mergeable },
    runs,
    status: latestStatus(runs),
  }
}

export async function runTrain({ api, all, dryRun, canUpdate, dispatch, log = console.log }) {
  const queue = await loadCandidates(api, all)
  if (!queue.length) return log('File vide : rien à faire.')
  log(`File : ${queue.map(p => `#${p.number}`).join(' → ')}`)
  for (const cand of queue) {
    const { pr, runs, status } = await inspect(api, cand)
    const step = decideStep({ pr, status, canUpdate })
    log(`#${pr.number} ${pr.headSha.slice(0, 8)} : ${step.action} — ${step.reason}`)
    if (dryRun) return
    const n = pr.number
    if (step.action === 'eject') {
      await api('DELETE', `/issues/${n}/labels/${encodeURIComponent(TRAIN_LABEL)}`)
      await api('POST', `/issues/${n}/comments`, {
        body: ejectionComment({ reason: step.reason, failed: failedJobs(runs) }),
      })
      continue // la suivante prend la tête
    }
    if (step.action === 'update') await api('PUT', `/pulls/${n}/update-branch`, { expected_head_sha: pr.headSha })
    if (step.action === 'reopen') {
      await api('PATCH', `/pulls/${n}`, { state: 'closed' })
      await api('PATCH', `/pulls/${n}`, { state: 'open' })
    }
    if (step.action === 'merge') {
      const res = await api('PUT', `/pulls/${n}/merge`, { merge_method: 'merge', sha: pr.headSha })
      log(`#${n} fusion : HTTP ${res.status}`)
      if (res.ok) {
        for (const wf of dispatch) await api('POST', `/actions/workflows/${wf}/dispatches`, { ref: 'main' })
        continue // la suivante doit maintenant être mise à jour sur le nouveau main
      }
    }
    return // un seul pas par passage, sauf après éjection ou fusion
  }
}

async function main(argv) {
  const flag = f => argv.includes(f)
  const arg = (f, d) => (argv.includes(f) ? argv[argv.indexOf(f) + 1] : d)
  const token = process.env.MERGE_TRAIN_TOKEN || process.env.GITHUB_TOKEN
  const repo = process.env.GITHUB_REPOSITORY
  if (!token || !repo) throw new Error('GITHUB_TOKEN (ou MERGE_TRAIN_TOKEN) et GITHUB_REPOSITORY requis')
  await runTrain({
    api: makeApi({ token, repo }),
    all: flag('--all'),
    dryRun: flag('--dry-run'),
    canUpdate: flag('--can-update'),
    dispatch: arg('--dispatch', '').split(',').filter(Boolean),
  })
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch(error => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  })
}
