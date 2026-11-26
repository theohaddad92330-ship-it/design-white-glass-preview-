#!/usr/bin/env node
/**
 * Sonde de disponibilité — à exécuter DEPUIS L'EXTÉRIEUR de notre infrastructure.
 *
 * Pourquoi elle existe. Le 31/07/2026, l'edge Railway a répondu « Application
 * not found » pendant plusieurs heures : la page de démonstration annonçait un
 * lien invalide à des prospects, et personne n'a été prévenu. Sentry n'y pouvait
 * rien — il reçoit les erreurs APPLICATIVES, et un service qui ne démarre pas
 * n'émet aucune erreur. C'est précisément le silence qu'il faut surveiller.
 *
 * Pourquoi à l'extérieur. Une sonde hébergée à côté de ce qu'elle observe meurt
 * avec lui. Celle-ci tourne dans GitHub Actions (voir `.github/workflows/uptime.yml`),
 * qui n'a aucune dépendance envers Railway, Vercel ou Supabase.
 *
 * Ce qu'elle ne fait pas : mesurer une latence, tenir un historique, calculer un
 * taux de disponibilité. Un service de supervision fait cela mieux ; l'objectif
 * ici est de répondre à UNE question — « est-ce debout ? » — et de faire du bruit
 * quand la réponse est non.
 *
 * Cibles lues dans l'environnement, chacune optionnelle (une variable absente =
 * cible ignorée, pas un échec) :
 *   PROBE_API_URL      → attend 200 sur /health/ready
 *   PROBE_IA_URL       → attend 200 sur /health
 *   PROBE_WEB_URL      → attend 200 sur /
 *   PROBE_DEMO_URL     → attend 200 sur la page de démonstration
 *
 * Sortie : 0 si tout répond, 1 dès qu'une cible échoue. Le détail part sur la
 * sortie standard, en clair, pour être lisible dans un journal d'exécution.
 */

const TIMEOUT_MS = 15_000
/** Deux essais espacés : un réseau qui bafouille ne doit pas réveiller quelqu'un
 *  à 3 h du matin. Une VRAIE panne rate les deux. */
const ATTEMPTS = 2
const RETRY_DELAY_MS = 5_000

/** Les cibles, dans l'ordre où on veut lire le rapport. */
const TARGETS = [
  { name: 'API', env: 'PROBE_API_URL', path: '/health/ready' },
  { name: 'IA', env: 'PROBE_IA_URL', path: '/health' },
  { name: 'Application', env: 'PROBE_WEB_URL', path: '/' },
  // La page de démonstration en dernier parce qu'elle dépend des deux premières
  // — mais elle est surveillée à part : c'est le lien qu'un prospect ouvre, et
  // sa panne est celle qui coûte le plus cher.
  { name: 'Démonstration', env: 'PROBE_DEMO_URL', path: '' },
]

function joinUrl(base, path) {
  if (!path) return base
  return `${base.replace(/\/+$/, '')}${path}`
}

async function probeOnce(url) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'user-agent': 'bellum-uptime-probe' },
    })
    return { ok: response.ok, detail: `HTTP ${response.status}` }
  } catch (error) {
    // Un abandon de délai et un DNS mort se lisent différemment : dire lequel
    // évite de chercher une panne applicative devant un problème de réseau.
    const reason =
      error?.name === 'AbortError' ? `pas de réponse en ${TIMEOUT_MS / 1000} s` : String(error?.message ?? error)
    return { ok: false, detail: reason }
  } finally {
    clearTimeout(timer)
  }
}

async function probe(url) {
  let last = { ok: false, detail: 'jamais tenté' }
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    last = await probeOnce(url)
    if (last.ok) return { ...last, attempts: attempt }
    if (attempt < ATTEMPTS) await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS))
  }
  return { ...last, attempts: ATTEMPTS }
}

async function main() {
  const configured = TARGETS.map(target => ({ ...target, base: process.env[target.env] })).filter(t => t.base)

  if (configured.length === 0) {
    // Aucune cible n'est un état LÉGITIME (dépôt cloné, secrets non posés). On
    // le dit et on sort vert : faire échouer ici entraînerait à ignorer l'alerte.
    console.log('Aucune cible configurée (PROBE_API_URL, PROBE_IA_URL, PROBE_WEB_URL, PROBE_DEMO_URL). Rien à sonder.')
    return 0
  }

  const results = []
  for (const target of configured) {
    const url = joinUrl(target.base, target.path)
    const result = await probe(url)
    results.push({ name: target.name, url, ...result })
    console.log(`${result.ok ? 'OK  ' : 'HS  '} ${target.name.padEnd(14)} ${url} — ${result.detail}`)
  }

  const down = results.filter(r => !r.ok)
  if (down.length === 0) {
    console.log(`\n${results.length} cible(s) debout.`)
    return 0
  }

  console.log(`\n${down.length} cible(s) INJOIGNABLE(S) :`)
  for (const target of down) console.log(`  - ${target.name} (${target.url}) : ${target.detail}`)
  return 1
}

main().then(
  code => process.exit(code),
  error => {
    // Une sonde qui plante est elle-même une panne : on sort en échec plutôt que
    // de laisser un vert par accident.
    console.error('La sonde a échoué :', error)
    process.exit(1)
  },
)
