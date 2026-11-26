import type { BackofficeAuditCategory, BackofficeAuditEntry, BackofficeAuditOutcome } from '@bellum/contracts'
import type { NextRequest } from 'next/server'
import { origineDeLaRequete } from '@/lib/auth-routes'
import { operateurDeLaRequete, operateurDepuisJeton } from '@/lib/guard'
import { COOKIE_SESSION } from '@/lib/session'

/**
 * LA PORTE UNIQUE DU JOURNAL D'AUDIT DU BACK-OFFICE (#1666).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UNE PORTE, ET UNE SEULE
 * ─────────────────────────────────────────────────────────────────────────────
 * Vingt-six gestionnaires de route mutent quelque chose dans cette console, et
 * le vingt-septième s'écrira dans six semaines par quelqu'un qui n'aura pas lu
 * cette issue. Écrire la ligne d'audit à la main dans chacun est un défaut de
 * POPULATION : juste sur chaque route qu'on pense à traiter, faux sur celle
 * qu'on oublie. La porte est donc ici, en un appel, et une garde
 * (`src/architecture/journal-audit-a-des-ecrivains.test.ts`) refuse le
 * gestionnaire qui ne l'appellerait pas.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE FAIT, ET CE QU'ELLE NE FAIT JAMAIS
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ AU MIEUX, ET JAMAIS BLOQUANTE — même règle que le journal d'accès
 * (#1671.2), pour une raison de plus : la ligne s'écrit APRÈS que le geste a eu
 * lieu. Faire échouer la réponse parce que le journal est injoignable rendrait
 * une erreur à l'opérateur pour une action bel et bien faite.
 *
 * ⚠️ L'AUTEUR EST RELU CÔTÉ SERVEUR, jamais reçu du navigateur : un champ de
 * corps se forge, une session signée non. Et il vient de la LISTE
 * (`DM_ALLOWED_EMAILS`), pas du cookie — une rétrogradation prend effet tout de
 * suite.
 *
 * ⚠️ AUCUNE CHARGE UTILE. `detail` est une note écrite par l'appelant, jamais un
 * `JSON.stringify(body)` : un corps de requête recopié porterait un jour un
 * jeton ou un lien de réinitialisation, et le journal d'audit deviendrait le
 * meilleur endroit du produit où aller les chercher.
 *
 * ⚠️ La console n'écrit PAS en base directement : elle n'a que la clé anon de
 * Supabase, soumise au RLS. Elle passe par l'API avec le secret interne, qui ne
 * touche jamais le navigateur — le même chemin que tout le reste de la console.
 */

const BASE = (): string | undefined => process.env['API_BASE_URL']
const SECRET = (): string | undefined => process.env['INTERNAL_API_SECRET']

/**
 * Ce qu'un appelant décrit, sans avoir à répéter qui il est ni d'où il vient.
 *
 * ⚠️ NON exporté : il n'est consommé que par la signature de `journaliserAudit`,
 * dans ce fichier. La règle du dépôt est de ne jamais exporter un type
 * uniquement consommé chez lui (`pnpm lint:exports:types`) — un appelant passe
 * un objet littéral, que TypeScript vérifie contre cette forme.
 */
type GesteAudite = {
  /** Le nom STABLE du geste, en `domaine.verbe` — `users.delete`, `plans.write`. */
  operation: string
  category: BackofficeAuditCategory
  /** Omis : DÉDUIT du code HTTP. Voir {@link resultatDeStatut}. */
  outcome?: BackofficeAuditOutcome
  subjectType?: string | null
  subjectId?: string | null
  subjectLabel?: string | null
  /** Le code rendu à l'opérateur. Il DÉDUIT le résultat quand `outcome` est omis. */
  statusCode?: number | null
  detail?: string | null
}

/**
 * Le RÉSULTAT d'un geste, déduit de son code HTTP.
 *
 * ⚠️ `refus` et `echec` ne sont pas la même chose, et les confondre coûterait
 * cher : un 403 est le produit qui FONCTIONNE (le rôle ne permettait pas le
 * geste), un 502 est le produit qui ne fonctionne pas. Un tableau qui les
 * mélange fait chercher un incident là où il y a eu une décision.
 *
 * ⚠️ Un code ABSENT vaut `echec`, pas `succes`. C'est le cas d'une exception
 * avant toute réponse : on ne sait pas si le geste a abouti, et un journal
 * d'audit qui suppose la réussite est pire qu'un journal vide.
 */
export function resultatDeStatut(status: number | null | undefined): BackofficeAuditOutcome {
  if (status == null || !Number.isFinite(status)) return 'echec'
  if (status >= 200 && status < 300) return 'succes'
  if (status >= 400 && status < 500) return 'refus'
  return 'echec'
}

/**
 * Écrit la ligne. Ne jette JAMAIS, n'attend rien de l'appelant.
 *
 * Rend une promesse pour que les tests puissent l'attendre — les appelants de
 * production peuvent l'ignorer (`void journaliserAudit(...)`) sans changer le
 * comportement : rien de ce qu'elle fait ne peut faire échouer une réponse.
 */
async function poserLaLigne(
  operateur: { email: string; role: string } | null,
  origine: { ip: string | null; userAgent: string | null; country: string | null } | null,
  geste: GesteAudite,
): Promise<void> {
  const base = BASE()
  const secret = SECRET()
  // Sans configuration, RIEN n'est tenté — et surtout rien n'échoue. C'est le
  // « sans clé = no-op strict » du dépôt : zéro appel réseau, chemin identique.
  if (!base || !secret) return

  const entry: BackofficeAuditEntry = {
    operation: geste.operation,
    category: geste.category,
    outcome: geste.outcome ?? resultatDeStatut(geste.statusCode),
    actorEmail: operateur?.email ?? null,
    actorRole: operateur?.role ?? null,
    subjectType: geste.subjectType ?? null,
    subjectId: geste.subjectId ?? null,
    subjectLabel: geste.subjectLabel ?? null,
    statusCode: geste.statusCode ?? null,
    detail: geste.detail ?? null,
    ip: origine?.ip ?? null,
    userAgent: origine?.userAgent ?? null,
    country: origine?.country ?? null,
  }

  try {
    await fetch(`${base}/internal/admin/audit-journal`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-internal-secret': secret },
      body: JSON.stringify(entry),
      cache: 'no-store',
    })
  } catch (err) {
    // Une trace perdue doit se VOIR — c'est la seule chose qu'on puisse faire
    // sans transformer la trace en porte.
    console.warn(
      JSON.stringify({
        event: 'backoffice.journal_audit_perdu',
        operation: geste.operation,
        raison: err instanceof Error ? err.message : String(err),
        at: new Date().toISOString(),
      }),
    )
  }
}

/**
 * Écrit la ligne. Ne jette JAMAIS, n'attend rien de l'appelant.
 *
 * Rend une promesse pour que les tests puissent l'attendre — les appelants de
 * production peuvent l'ignorer (`void journaliserAudit(...)`) sans changer le
 * comportement : rien de ce qu'elle fait ne peut faire échouer une réponse.
 */
export async function journaliserAudit(req: NextRequest, geste: GesteAudite): Promise<void> {
  const operateur = await operateurDeLaRequete(req).catch(() => null)
  const origine = origineDeLaRequete(req)
  return poserLaLigne(operateur, origine, geste)
}

/**
 * #2905 (#2442.19) — LA MÊME PORTE, depuis un composant serveur.
 *
 * `journaliserAudit` exige un `NextRequest` — que n'a AUCUN composant serveur
 * (`page.tsx`), là où vit la lecture des données BRUTES d'un client
 * (`AnalysisDetailPage`, `raw_analysis` cross-tenant, sans aucune trace
 * aujourd'hui). Même auteur relu CÔTÉ SERVEUR depuis le cookie signé (jamais
 * reçu du navigateur), même « au mieux, jamais bloquante » — une lecture déjà
 * faite ne doit pas devenir une erreur d'écran parce que le journal est
 * injoignable. Sans IP/user-agent/pays : un composant serveur n'a pas accès à
 * la requête HTTP entrante comme un gestionnaire de route ; ces trois champs
 * sont NULLABLE (voir le docblock de tête de `backoffice-audit.ts`) — une
 * absence, pas une valeur devinée.
 */
export async function journaliserAccesDepuisComposant(geste: GesteAudite): Promise<void> {
  // ⚠️ `cookies()` lui-même peut jeter — hors d'un rendu réellement porté par
  // le routeur (par ex. un test qui appelle la page directement, sans le
  // contexte de requête de Next). « Jamais bloquante » couvre CETTE lecture
  // aussi : une trace ratée ne doit jamais faire tomber l'écran qui la déclenche.
  let operateur: { email: string; role: string } | null = null
  try {
    const { cookies } = await import('next/headers')
    const jeton = (await cookies()).get(COOKIE_SESSION)?.value
    operateur = await operateurDepuisJeton(jeton)
  } catch {
    operateur = null
  }
  return poserLaLigne(operateur, null, geste)
}

/* ─────────────────────────── LECTURE ─────────────────────────── */

/** Une ligne, telle que l'API la rend. */
export type LigneAudit = {
  id: string
  operation: string
  category: BackofficeAuditCategory
  outcome: BackofficeAuditOutcome
  actor_email: string | null
  actor_role: string | null
  subject_type: string | null
  subject_id: string | null
  subject_label: string | null
  status_code: number | null
  detail: string | null
  ip: string | null
  user_agent: string | null
  country: string | null
  created_at: string
}

/** Une fenêtre de rétention, telle que la purge l'applique. `months: null` = permanent. */
export type FenetreRetention = {
  category: BackofficeAuditCategory
  months: number | null
  cutoff: string | null
}

export type VueAudit = {
  entries: LigneAudit[]
  /** Combien de lignes le filtre décrit. */
  matching: number
  /** Combien le journal en contient, TOUS filtres ignorés — jamais masqué. */
  total: number
  /** Les cinq catégories, toujours les cinq, SANS le filtre de catégorie. */
  categoryCounts: Record<BackofficeAuditCategory, number>
  limit: number
  offset: number
  retention: FenetreRetention[]
  measuredAt: string
}

/** Ce que l'écran demande. Rien ici ne peut CACHER une catégorie. */
export type FiltreAudit = {
  category?: string
  outcome?: string
  actorEmail?: string
  operation?: string
  page?: number
}

/** Combien de lignes par page. Assez pour une session de travail, pas un annuaire. */
export const LIGNES_PAR_PAGE = 50

/**
 * Lit une page du journal.
 *
 * ⚠️ JETTE quand l'API ne répond pas, et c'est délibéré : l'écran doit DIRE
 * « journal indisponible » plutôt que d'afficher un tableau vide, qui se
 * lirait exactement comme « il ne s'est rien passé ».
 */
export async function fetchJournalAudit(filtre: FiltreAudit): Promise<VueAudit> {
  const base = BASE()
  const secret = SECRET()
  if (!base || !secret) {
    throw new Error('API_BASE_URL ou INTERNAL_API_SECRET non configuré côté console.')
  }

  const params = new URLSearchParams()
  if (filtre.category) params.set('category', filtre.category)
  if (filtre.outcome) params.set('outcome', filtre.outcome)
  if (filtre.actorEmail) params.set('actorEmail', filtre.actorEmail)
  if (filtre.operation) params.set('operation', filtre.operation)
  params.set('limit', String(LIGNES_PAR_PAGE))
  params.set('offset', String(Math.max((filtre.page ?? 1) - 1, 0) * LIGNES_PAR_PAGE))

  const res = await fetch(`${base}/internal/admin/audit-journal?${params.toString()}`, {
    headers: { 'x-internal-secret': secret },
    cache: 'no-store',
  })
  if (!res.ok) {
    throw new Error(`Le journal d’audit a répondu ${res.status} ${res.statusText}`)
  }
  return (await res.json()) as VueAudit
}
