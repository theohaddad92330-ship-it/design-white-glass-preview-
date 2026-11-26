// Client for the API's internal beta-feedback endpoints (/internal/feedback,
// guarded by InternalSecretGuard). Server-side only — the internal secret never
// reaches the browser. Mirrors src/lib/telemetry.ts.
//
// Lecture ET écriture : le back-office affiche l'état des issues et peut y
// répondre (fermer, rouvrir, commenter). GitHub reste la source de vérité de
// l'état — rien n'est recopié en base, donc les deux ne peuvent pas diverger.

const REAL_BASE = process.env.API_BASE_URL ?? 'http://localhost:3012'
const REAL_SECRET = process.env.INTERNAL_API_SECRET ?? ''

/** L'état d'un retour côté GitHub. `null` sur un retour sans issue. */
type FeedbackIssue = {
  number: number
  state: 'open' | 'closed'
  title: string
  url: string
  comments: number
  updatedAt: string
  closedAt: string | null
  labels: string[]
}

export type FeedbackComment = {
  id: number
  author: string | null
  body: string
  createdAt: string
}

export type FeedbackItem = {
  id: string
  user_id: string
  account_id: string | null
  category: 'bug' | 'metier' | 'autre'
  message: string
  user_email: string | null
  page_url: string | null
  user_agent: string | null
  console_logs: string | null
  /**
   * ⚠️ LA CAPTURE NE VOYAGE PLUS DANS LA LISTE (07/09/2026).
   * Mesuré en production : 32,6 Mo de base64 inlinés — 94 % du poids de la page
   * — pour des images repliées que personne n'ouvrait. La liste dit qu'il y en a
   * une ; l'image se demande à l'ouverture sur `/api/admin/feedback/:id/screenshot`.
   *
   * Les deux champs restent DÉCLARÉS et optionnels : le back-office et l'API se
   * déploient séparément, et pendant la fenêtre entre les deux la console neuve
   * reçoit encore l'ancienne forme. `aUneCapture()` lit les trois cas.
   */
  screenshot?: string | null
  screenshot_url?: string | null
  has_screenshot?: boolean
  /**
   * #1792 — MÊME MODÈLE que la capture d'écran : le lien réel des pièces
   * jointes ne voyage pas dans la liste (il peut porter une donnée
   * personnelle, la capture d'un écran client) — seul ce booléen dit qu'il y
   * en a. Le lien se demande à l'ouverture, sur
   * `/api/admin/feedback/attachments/:id`. `undefined` = API antérieure au
   * champ, à distinguer de `false` (jamais deviné).
   */
  has_attachments?: boolean
  client_context: {
    appContext?: { buildVersion?: string; environment?: string; route?: string; theme?: string } | null
    networkFailures?: { method: string; url: string; status: number | null; correlationId: string | null }[]
    breadcrumbs?: { type: string; label: string }[]
  } | null
  github_issue_number: number | null
  github_issue_url: string | null
  created_at: string
  issue: FeedbackIssue | null
  /**
   * #1658.2 — la première réponse HUMAINE sur l'issue, `null` sinon.
   *
   * ⚠️ OPTIONNEL, et pour la raison qui a déjà coûté cher ici : le back-office
   * et l'API se déploient séparément. Pendant la fenêtre entre les deux, la
   * console neuve reçoit l'ANCIENNE forme, sans ce champ. Le déclarer requis
   * ferait lire `undefined` comme une valeur.
   *
   * ⚠️ `null` ne veut PAS dire « personne n'a répondu » à lui seul : il faut le
   * lire AVEC `responsesAvailable`. Un robot ne compte pas comme une réponse
   * (l'API filtre le lien-retour automatique) — sans ce filtre, chaque retour
   * serait « répondu en 3 minutes ».
   */
  first_response_at?: string | null
  /**
   * #1658.2 — LES espaces de l'auteur, au pluriel et à dessein.
   *
   * ⚠️ `beta_feedback` NE PORTE PAS de `workspace_id` (mesuré le 07/09/2026,
   * zéro occurrence) : le rattachement passe par l'AUTEUR, et un membre de deux
   * espaces est donc AMBIGU. L'API rend tous ses espaces plutôt que d'en choisir
   * un ; l'écran le DIT au lieu de trancher au hasard — envoyer l'opérateur chez
   * le mauvais client sans le prévenir serait pire que ne pas mettre de lien.
   *
   * `null` = aucun auteur (un signalement du back-office n'a pas d'utilisateur
   * Bellum), ou champ absent d'une API antérieure. Jamais `[]`, qui se lirait
   * « cet auteur n'est dans aucun espace ».
   */
  workspaces?: { id: string; name: string }[] | null
}

/**
 * Les retours + l'état de leur issue. `issuesAvailable: false` veut dire « je
 * n'ai pas pu regarder » (GitHub muet, intégration éteinte) — l'écran le dit,
 * au lieu d'afficher « aucun retour traité » un jour de panne.
 */
export async function fetchFeedback(
  limit = 100,
): Promise<{ items: FeedbackItem[]; issuesAvailable: boolean; responsesAvailable: boolean }> {
  const res = await fetch(`${REAL_BASE}/internal/feedback?limit=${limit}`, {
    headers: { 'x-internal-secret': REAL_SECRET },
    cache: 'no-store',
  })
  if (!res.ok) {
    throw new Error(`Feedback endpoint returned ${res.status} ${res.statusText}`)
  }
  const data = (await res.json()) as {
    items?: FeedbackItem[]
    issuesAvailable?: boolean
    responsesAvailable?: boolean
  }
  return {
    items: data.items ?? [],
    issuesAvailable: data.issuesAvailable ?? false,
    // ⚠️ `false` par défaut, comme `issuesAvailable` : une API antérieure au
    // champ n'a rien mesuré, et l'écran doit dire « je n'ai pas pu regarder »
    // plutôt qu'annoncer une dette de réponse sur tout le monde.
    responsesAvailable: data.responsesAvailable ?? false,
  }
}

export async function fetchIssueComments(
  issueNumber: number,
): Promise<{ comments: FeedbackComment[]; available: boolean }> {
  const { status, data } = await feedbackMutate('GET', `/${issueNumber}/comments`)
  if (status >= 400) return { comments: [], available: false }
  const payload = data as { comments?: FeedbackComment[]; available?: boolean }
  return { comments: payload.comments ?? [], available: payload.available ?? false }
}

export function commentIssue(issueNumber: number, body: string, author?: string | null) {
  return feedbackMutate('POST', `/${issueNumber}/comments`, { body, author })
}

export function setIssueState(issueNumber: number, state: 'open' | 'closed') {
  return feedbackMutate('POST', `/${issueNumber}/state`, { state })
}

/**
 * Ce qu'un signalement d'opérateur emporte.
 *
 * ⚠️ Volontairement OUVERT (`[key: string]: unknown`) sur ce que le navigateur
 * capture — capture d'écran, zone pointée, appels en échec, fil des gestes,
 * état de la console. Le schéma qui TRANCHE vit côté API
 * (`backofficeFeedbackSchema`, qui étend celui du client) : recopier ici la
 * forme de chaque objet ferait deux vérités qui divergeraient au premier champ
 * ajouté, et c'est le client qui perdrait — en silence.
 */
export type BackofficeReport = {
  category: 'bug' | 'metier' | 'autre'
  message: string
  operator?: string | null
  pageUrl?: string | null
  userAgent?: string | null
  consoleLogs?: string | null
  errorLogs?: string | null
  [key: string]: unknown
}

/**
 * SIGNALER UN DÉFAUT DEPUIS LE BACK-OFFICE.
 *
 * L'opérateur qui en voit un ici devait jusqu'alors rouvrir l'application
 * cliente et refaire le geste ailleurs — le contexte se perdait en route.
 *
 * ⚠️ Le nom de l'opérateur n'est PAS un champ du formulaire : il est relu de
 * l'en-tête Basic Auth, côté serveur (`actorFromRequest`). Ce qu'une page
 * envoie peut être n'importe quoi, et une signature qu'on peut choisir ne
 * signe rien.
 */
export function reportIssue(report: BackofficeReport) {
  return feedbackMutate('POST', '', report)
}

/** Proxy vers /internal/feedback — même forme que `adminMutate`. */
async function feedbackMutate(
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
): Promise<{ status: number; ok: boolean; data: unknown }> {
  if (!REAL_SECRET) {
    return {
      status: 500,
      ok: false,
      data: { error: 'INTERNAL_API_SECRET non configuré côté dashboard — impossible d’appeler l’API.' },
    }
  }
  const hasBody = body !== undefined
  const res = await fetch(`${REAL_BASE}/internal/feedback${path}`, {
    method,
    headers: {
      'x-internal-secret': REAL_SECRET,
      ...(hasBody ? { 'content-type': 'application/json' } : {}),
    },
    ...(hasBody ? { body: JSON.stringify(body) } : {}),
    cache: 'no-store',
  })
  const text = await res.text()
  let data: unknown = text
  try {
    data = text ? JSON.parse(text) : {}
  } catch {
    /* keep raw text for the error message */
  }
  return { status: res.status, ok: res.ok, data }
}

/**
 * Ce retour a-t-il une capture ? — lu de façon TOLÉRANTE.
 *
 * L'API et le back-office se déploient séparément. Pendant la fenêtre entre les
 * deux, la console neuve reçoit encore l'ancienne forme (`screenshot_url`
 * rempli, `has_screenshot` absent) : lire le seul champ neuf ferait disparaître
 * toutes les captures le temps d'un déploiement. Un champ serveur neuf se lit
 * avec sa garde — c'est un défaut que ce dépôt a déjà payé.
 */
export function aUneCapture(item: FeedbackItem): boolean {
  return item.has_screenshot ?? Boolean(item.screenshot_url ?? item.screenshot)
}

/**
 * Ce retour a-t-il des pièces jointes ? — #1792, même modèle que
 * {@link aUneCapture}.
 *
 * ⚠️ `undefined` (API antérieure au champ) rend `false` plutôt que de deviner :
 * le lien lui-même a été retiré de la liste en même temps que ce champ est
 * apparu, donc il n'y a de toute façon rien à afficher tant que les deux
 * n'ont pas déployé ensemble.
 */
export function aDesPiecesJointes(item: FeedbackItem): boolean {
  return item.has_attachments ?? false
}
