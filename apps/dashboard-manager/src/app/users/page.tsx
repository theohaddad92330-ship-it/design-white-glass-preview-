import {
  fetchAdminPlans,
  fetchAdminUsers,
  fetchAdminUsersAuthStates,
  type AdminUser,
  type AdminUsersAuthStates,
} from '@/lib/admin'
import { UsersTable } from './_components/users-table'
import { fonctionsFermees, joindreEtatsDauth } from './users.logic'

/**
 * L'ANNUAIRE DES UTILISATEURS — tableau dense, filtres en pilules (#1664).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CET ÉCRAN RÉPOND, ET QUE L'ANCIEN NE SAVAIT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * « Qui s'est inscrit et n'est jamais revenu ? », « qui est suspendu ? », « qui
 * n'a pas d'espace ? ». Trois questions de support quotidien, aucune n'était
 * lisible : la liste d'avant montrait e-mail, nom, offre, crédits, ESN et date,
 * et l'état d'authentification n'apparaissait que sur la fiche, un compte à la
 * fois.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DEUX LECTURES, DEUX TRAITEMENTS D'ÉCHEC DIFFÉRENTS
 * ─────────────────────────────────────────────────────────────────────────────
 * · L'annuaire est OBLIGATOIRE : sans lui il n'y a pas d'écran, et une panne se
 *   DIT. Un tableau vide se lirait « aucun utilisateur », le pire mensonge
 *   possible ici.
 * · Les états d'authentification sont un ENRICHISSEMENT : leur panne dégrade
 *   sans casser. Chaque ligne ressort alors « non lu » — jamais « actif », et
 *   surtout jamais « jamais connecté ». C'est la distinction que porte le type
 *   union de `users.logic.ts`, et elle vaut jusqu'ici : `complete: false` est
 *   un état, pas une exception à rattraper.
 */
export const dynamic = 'force-dynamic'

/** Le plafond de lignes servies. Il est ÉCRIT sous le tableau plutôt que
 *  silencieux : une liste tronquée qui ne le dit pas se lit comme un total. */
const LIMITE = 200

export default async function UsersPage(props: { searchParams?: Promise<{ search?: string }> }) {
  const searchParams = await props.searchParams
  const search = (searchParams?.search ?? '').trim()

  let annuaire: { users: AdminUser[]; total: number } | null = null
  let panne: string | null = null
  try {
    annuaire = await fetchAdminUsers({ search, limit: LIMITE })
  } catch (err) {
    panne = err instanceof Error ? err.message : String(err)
  }

  if (!annuaire) {
    return (
      <main className="wrap">
        <h1>Utilisateurs</h1>
        <p className="subtitle">
          Un compte par ligne, avec son espace, son état et sa dernière connexion — l’écran qui dit qui s’est inscrit
          sans jamais revenir, et qui est suspendu.
        </p>
        <div className="error" style={{ margin: '16px 0' }}>
          Annuaire indisponible — l’API n’a pas répondu. {panne}
          <br />
          Vérifie <code>API_BASE_URL</code> + <code>INTERNAL_API_SECRET</code>.
        </div>
      </main>
    )
  }

  // Enrichissement : sa panne DÉGRADE, elle ne casse pas. Toutes les lignes
  // ressortent alors « non lu » — jamais « actif » deviné, jamais « jamais
  // connecté » supposé.
  let auth: AdminUsersAuthStates = { complete: false, states: [] }
  try {
    auth = await fetchAdminUsersAuthStates()
  } catch {
    auth = { complete: false, states: [] }
  }

  // PLAN-GATE #4381 — ce que chaque palier N'ouvre PAS, lu dans le catalogue.
  // Enrichissement : sa panne retire l'avertissement, elle ne casse pas l'écran.
  let fermeesParPlan: Record<string, string[]> = {}
  try {
    const catalogue = await fetchAdminPlans()
    fermeesParPlan = Object.fromEntries(catalogue.map(p => [p.key, fonctionsFermees(p.key, catalogue)]))
  } catch {
    fermeesParPlan = {}
  }

  const lignes = joindreEtatsDauth(annuaire.users, auth)
  const tronque = annuaire.total > lignes.length

  return (
    <main className="wrap">
      <h1>Utilisateurs</h1>
      <p className="subtitle">
        Un compte par ligne, avec son espace, son état et sa dernière connexion — l’écran qui dit qui s’est inscrit sans
        jamais revenir, et qui est suspendu. Une dernière connexion illisible s’affiche « non lu » : ce n’est pas «
        jamais ».
      </p>

      <form method="get" action="/users" style={{ display: 'flex', gap: 8, margin: '0 0 16px' }}>
        <input
          name="search"
          defaultValue={search}
          placeholder="Rechercher par email ou nom…"
          style={{ flex: 1, maxWidth: 360 }}
        />
        <button className="btn" type="submit">
          Rechercher
        </button>
        {search ? (
          <a
            className="btn ghost"
            href="/users"
            style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}
          >
            Réinitialiser
          </a>
        ) : null}
      </form>

      <UsersTable lignes={lignes} authComplete={auth.complete} fermeesParPlan={fermeesParPlan} />

      {/* Une liste tronquée qui ne le dit pas se lit comme un total — et les
          comptes des pilules seraient alors lus comme ceux de la population. */}
      {tronque ? (
        <p className="muted" style={{ fontSize: 12, margin: '12px 0 0' }}>
          {lignes.length} lignes affichées sur {annuaire.total} — affine la recherche pour voir les autres. Les comptes
          des pilules portent sur les lignes affichées, pas sur la population entière.
        </p>
      ) : null}
    </main>
  )
}
