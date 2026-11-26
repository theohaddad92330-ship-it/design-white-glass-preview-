// #1676.2 — les dépendances DU MANAGER : distinctes de `/health` (les onze
// dépendances DU PRODUIT) et de `/integrations` (les connecteurs DU PRODUIT
// CLIENT). Trois lignes (Stripe, Resend, Slack) ont leur secret côté API et
// sont proxyées vers `internal/admin/manager-dependencies` ; les trois autres
// (Supabase, Vercel, GitHub) se testent ICI, avec les identifiants QUE LA
// CONSOLE DÉTIENT DÉJÀ (SUPABASE_ANON_KEY de son propre projet, variables
// Vercel posées par la plateforme elle-même).
//
// « SAIN N'EST JAMAIS DÉCLARÉ, IL EST DÉRIVÉ D'UN TEST RÉEL » : `configured`
// est une PRÉSENCE (jamais une valeur — la garde `aucun-secret-affiche.
// test.ts` le vérifie côté écran) ; `null` veut dire NON MESURÉ (l'API n'a pas
// répondu), jamais confondu avec `false` (mesuré, absent).

const API_BASE = (): string | undefined => process.env['API_BASE_URL']
const API_SECRET = (): string | undefined => process.env['INTERNAL_API_SECRET']

export type ManagerDependencyId = 'stripe' | 'supabase' | 'slack' | 'resend' | 'vercel' | 'github'

export type ManagerDependencyStatus = {
  id: ManagerDependencyId
  label: string
  /** Ce que fait cette dépendance, dans le langage produit. */
  role: string
  /** `null` = NON MESURÉ (l'API n'a pas répondu) — jamais confondu avec `false`. */
  configured: boolean | null
}

type ManagerDependencyTestResult = { ok: boolean; detail: string; checkedAt: string }

const LOCAL_LABELS: Record<'supabase' | 'vercel' | 'github', { label: string; role: string }> = {
  supabase: { label: 'Supabase', role: 'identité (connexion des opérateurs)' },
  vercel: { label: 'Vercel', role: 'hébergement du manager' },
  github: { label: 'GitHub', role: 'lien vers le commit déployé' },
}

const API_LABELS: Record<'stripe' | 'resend' | 'slack', { label: string; role: string }> = {
  stripe: { label: 'Stripe', role: 'facturation récurrente' },
  resend: { label: 'Resend', role: 'e-mails sortants' },
  slack: { label: 'Slack', role: 'alertes sortantes' },
}

/** Présence locale — jamais une valeur, jamais un appel réseau ici. */
function localPresence(): ManagerDependencyStatus[] {
  return [
    {
      id: 'supabase',
      ...LOCAL_LABELS.supabase,
      configured: Boolean(process.env['SUPABASE_URL']) && Boolean(process.env['SUPABASE_ANON_KEY']),
    },
    // ⚠️ TROUVÉ EN RECETTE LE 09/09/2026, et c'est le défaut le plus discret de
    // cet écran : `configured` répondait « est-ce que je connais le commit
    // déployé ? » pendant que le bouton « Tester » répond « puis-je appeler
    // l'API ? ». Deux questions sous une seule étiquette — d'où deux lignes
    // qui se CONTREDISAIENT elles-mêmes à l'écran : présence « Configuré », et
    // juste à côté « non configuré pour un test réel — VERCEL_API_TOKEN
    // absente ». Le sous-titre de la page promet « chaque ligne se teste
    // réellement » : la présence doit donc répondre à CETTE question-là.
    {
      id: 'vercel',
      ...LOCAL_LABELS.vercel,
      configured: Boolean(process.env['VERCEL_API_TOKEN']) && Boolean(process.env['VERCEL_PROJECT_ID']),
    },
    {
      id: 'github',
      ...LOCAL_LABELS.github,
      configured: Boolean(process.env['FEEDBACK_GITHUB_TOKEN']) && Boolean(process.env['FEEDBACK_GITHUB_REPO']),
    },
  ]
}

/**
 * L'état des six dépendances. Les trois côté API valent `null` (non mesuré,
 * jamais `false`) quand l'API n'a pas répondu — une panne réseau n'apprend
 * rien sur la configuration de Stripe.
 */
export async function fetchManagerDependenciesStatus(): Promise<ManagerDependencyStatus[]> {
  const local = localPresence()
  const base = API_BASE()
  const secret = API_SECRET()

  if (!base || !secret) {
    return [
      ...local,
      ...(Object.keys(API_LABELS) as Array<keyof typeof API_LABELS>).map(id => ({
        id,
        ...API_LABELS[id],
        configured: null,
      })),
    ]
  }

  try {
    const res = await fetch(`${base}/internal/admin/manager-dependencies`, {
      headers: { 'x-internal-secret': secret },
      cache: 'no-store',
    })
    if (!res.ok) throw new Error(`L’API a répondu ${res.status}`)
    const data = (await res.json()) as { dependencies: Array<{ id: keyof typeof API_LABELS; configured: boolean }> }
    const byId = new Map(data.dependencies.map(d => [d.id, d.configured]))
    return [
      ...local,
      ...(Object.keys(API_LABELS) as Array<keyof typeof API_LABELS>).map(id => ({
        id,
        ...API_LABELS[id],
        configured: byId.get(id) ?? null,
      })),
    ]
  } catch {
    return [
      ...local,
      ...(Object.keys(API_LABELS) as Array<keyof typeof API_LABELS>).map(id => ({
        id,
        ...API_LABELS[id],
        configured: null,
      })),
    ]
  }
}

/** Un appel RÉEL et NON DESTRUCTIF pour Supabase — les réglages publics d’auth. */
async function testSupabase(): Promise<ManagerDependencyTestResult> {
  const checkedAt = new Date().toISOString()
  const url = process.env['SUPABASE_URL']
  const anonKey = process.env['SUPABASE_ANON_KEY']
  if (!url || !anonKey)
    return { ok: false, detail: 'non configuré — SUPABASE_URL ou SUPABASE_ANON_KEY absente', checkedAt }
  try {
    const res = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: anonKey } })
    if (!res.ok) throw new Error(`Supabase a répondu ${res.status}`)
    return { ok: true, detail: 'Supabase Auth a répondu', checkedAt }
  } catch (error) {
    return {
      ok: false,
      detail: `Supabase a refusé l’appel : ${error instanceof Error ? error.message : String(error)}`,
      checkedAt,
    }
  }
}

/**
 * Vercel — appel réel à l’API des déploiements, si `VERCEL_API_TOKEN` est
 * fourni. Sans lui : non configuré, jamais une réponse devinée depuis les
 * variables posées au build (qui datent du build, pas de l’instant du test).
 */
async function testVercel(): Promise<ManagerDependencyTestResult> {
  const checkedAt = new Date().toISOString()
  const token = process.env['VERCEL_API_TOKEN']
  const projectId = process.env['VERCEL_PROJECT_ID']
  if (!token || !projectId) {
    const sha = process.env['VERCEL_GIT_COMMIT_SHA']
    return {
      ok: false,
      detail: sha
        ? `non configuré pour un test réel — VERCEL_API_TOKEN absente (déploiement courant : ${sha.slice(0, 7)})`
        : 'non configuré — VERCEL_API_TOKEN absente',
      checkedAt,
    }
  }
  try {
    const res = await fetch(`https://api.vercel.com/v6/deployments?projectId=${projectId}&limit=1`, {
      headers: { authorization: `Bearer ${token}` },
    })
    if (!res.ok) throw new Error(`Vercel a répondu ${res.status}`)
    const data = (await res.json()) as { deployments?: Array<{ uid: string; created: number; state: string }> }
    const last = data.deployments?.[0]
    return {
      ok: true,
      detail: last
        ? `Dernier déploiement : ${last.state} (${new Date(last.created).toISOString()})`
        : 'Vercel a répondu',
      checkedAt,
    }
  } catch (error) {
    return {
      ok: false,
      detail: `Vercel a refusé l’appel : ${error instanceof Error ? error.message : String(error)}`,
      checkedAt,
    }
  }
}

/**
 * GitHub — appel réel au commit déployé. Réutilise la PAIRE déjà posée pour le
 * signalement in-app (`FEEDBACK_GITHUB_TOKEN` + `FEEDBACK_GITHUB_REPO`,
 * `owner/repo`) plutôt que d'introduire une troisième variable pour le même
 * dépôt — un réglage vit à un seul endroit.
 */
async function testGithub(): Promise<ManagerDependencyTestResult> {
  const checkedAt = new Date().toISOString()
  const sha = process.env['VERCEL_GIT_COMMIT_SHA']
  const repo = process.env['FEEDBACK_GITHUB_REPO']
  const token = process.env['FEEDBACK_GITHUB_TOKEN']
  if (!sha) return { ok: false, detail: 'non configuré — aucun commit déployé connu (hors Vercel)', checkedAt }
  if (!token || !repo) {
    return {
      ok: false,
      detail: `non configuré pour un test réel — FEEDBACK_GITHUB_TOKEN ou FEEDBACK_GITHUB_REPO absente (commit ${sha.slice(0, 7)})`,
      checkedAt,
    }
  }
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/commits/${sha}`, {
      headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json' },
    })
    if (!res.ok) throw new Error(`GitHub a répondu ${res.status}`)
    return { ok: true, detail: `GitHub confirme le commit ${sha.slice(0, 7)}`, checkedAt }
  } catch (error) {
    return {
      ok: false,
      detail: `GitHub a refusé l’appel : ${error instanceof Error ? error.message : String(error)}`,
      checkedAt,
    }
  }
}

async function testViaApi(id: 'stripe' | 'resend' | 'slack'): Promise<ManagerDependencyTestResult> {
  const checkedAt = new Date().toISOString()
  const base = API_BASE()
  const secret = API_SECRET()
  if (!base || !secret)
    return { ok: false, detail: 'API_BASE_URL ou INTERNAL_API_SECRET non configuré côté console', checkedAt }
  try {
    const res = await fetch(`${base}/internal/admin/manager-dependencies/${id}/test`, {
      method: 'POST',
      headers: { 'x-internal-secret': secret },
      cache: 'no-store',
    })
    return (await res.json()) as ManagerDependencyTestResult
  } catch (error) {
    return {
      ok: false,
      detail: `API injoignable : ${error instanceof Error ? error.message : String(error)}`,
      checkedAt,
    }
  }
}

/** Le test RÉEL et NON DESTRUCTIF d'une dépendance, quel que soit son bord. */
export async function testManagerDependency(id: ManagerDependencyId): Promise<ManagerDependencyTestResult> {
  switch (id) {
    case 'supabase':
      return testSupabase()
    case 'vercel':
      return testVercel()
    case 'github':
      return testGithub()
    case 'stripe':
    case 'resend':
    case 'slack':
      return testViaApi(id)
  }
}
