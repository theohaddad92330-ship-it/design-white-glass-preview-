#!/usr/bin/env node
/**
 * #4035.2 — la sonde de la salle démo, APRÈS déploiement : ouvre UNE session démo comme un prospect et exige une
 * salle prête en ≤ 60 s.
 *
 * Pourquoi. Le 11/10/2026 le semis de la salle était cassé en prod pendant ~8 h : « Préparation de ta démo… » sans
 * fin pour tout prospect, API pourtant « healthy ». `uptime.yml` sonde `/health/ready` et la page de démo (une page
 * statique) : aucune des deux n'ouvre de salle. Cette sonde fait le geste du prospect.
 *
 * Contrat (`demo.controller.ts`, `POST /demo/session`) :
 *   200 → salle prête, session émise                       → VERT
 *   503 `demo_preparing` + `retryAfterSeconds`             → on attend, dans la limite des 60 s
 *   429                                                    → plafond de sessions : NI vert silencieux NI faux rouge —
 *                                                            avertissement, aucune relance (une seule session par passage)
 *   tout autre statut / délai dépassé                      → ROUGE, avec le statut et le corps
 *
 * Variables : `PROBE_API_URL` (ex. https://api.bellum-ai.com), `DEMO_LINK_TOKEN` (le jeton du lien de démo — SECRET
 * du dépôt, jamais loggé). L'une des deux absente = rien à sonder, avertissement clair (sortie 0, comme `uptime.yml`).
 */

const DEADLINE_MS = Number(process.env.DEMO_PROBE_DEADLINE_MS ?? 60_000)
const REQUEST_TIMEOUT_MS = 20_000

/** Pure et exportée : la décision d'une réponse. `retry` = demander encore, `ok`, `rate_limited`, `fail`. */
export function classify(status, body) {
  if (status === 200) return { verdict: 'ok' }
  if (status === 429) return { verdict: 'rate_limited' }
  if (status === 503 && body && typeof body === 'object' && body.code === 'demo_preparing') {
    const seconds = Number(body.retryAfterSeconds)
    return { verdict: 'retry', waitMs: Math.min(Math.max(Number.isFinite(seconds) ? seconds : 15, 1), 15) * 1000 }
  }
  return { verdict: 'fail' }
}

async function postSession(base, token) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch(`${base.replace(/\/+$/, '')}/demo/session`, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'content-type': 'application/json', 'user-agent': 'bellum-demo-probe' },
      body: JSON.stringify({ token }),
    })
    const text = await response.text()
    let body = null
    try {
      body = JSON.parse(text)
    } catch {
      body = null
    }
    return { status: response.status, body, text }
  } finally {
    clearTimeout(timer)
  }
}

async function main() {
  const base = process.env.PROBE_API_URL?.trim()
  const token = process.env.DEMO_LINK_TOKEN?.trim()
  if (!base || !token) {
    console.log(
      '::warning::Sonde démo NON jouée — PROBE_API_URL (variable) ou DEMO_LINK_TOKEN (secret) manque : la salle démo n’est pas surveillée.',
    )
    return 0
  }
  const startedAt = Date.now()
  let last = 'aucune réponse'
  while (Date.now() - startedAt < DEADLINE_MS) {
    let response
    try {
      response = await postSession(base, token)
    } catch (error) {
      last = `erreur réseau : ${error instanceof Error ? error.message : String(error)}`
      console.log(`  ${last}`)
      await new Promise(resolve => setTimeout(resolve, 5_000))
      continue
    }
    const decision = classify(response.status, response.body)
    if (decision.verdict === 'ok') {
      console.log(`✓ salle démo prête en ${Math.round((Date.now() - startedAt) / 1000)} s`)
      return 0
    }
    if (decision.verdict === 'rate_limited') {
      console.log('::warning::Sonde démo : 429 (plafond de sessions) — pas de verdict ce passage, aucune relance.')
      return 0
    }
    last = `HTTP ${response.status} ${response.text.slice(0, 300)}`
    if (decision.verdict === 'fail') break
    console.log(`  salle en préparation — nouvel essai dans ${decision.waitMs / 1000} s`)
    await new Promise(resolve => setTimeout(resolve, decision.waitMs))
  }
  console.log(
    `::error::La salle démo n’est PAS prête (${Math.round((Date.now() - startedAt) / 1000)} s, limite ${DEADLINE_MS / 1000} s) — dernier état : ${last}. ` +
      'Un prospect verrait « Préparation de ta démo… » sans fin. Voir les journaux « Demo pool » de l’API (re-semis en échec / pool épuisé).',
  )
  return 1
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().then(code => process.exit(code))
}
