import { fetchAdminUser, type AdminUserDetail } from '@/lib/admin'
import { PlanSelect } from '../_components/plan-select'
import { SuspendUser } from '../_components/suspend-user'
import { ResetLink } from './_components/reset-link'
import { GrantCredits } from './_components/grant-credits'
import { DeleteUser } from './_components/delete-user'
import { Impersonate } from './_components/impersonate'
import { PosteDeTravailSeulement } from '@/ui'
import { dateEtHeure } from '@/lib/dates'
import { libelleActivite, libelleDossiers, type EtatDuCompte } from '../users.logic'

// Backoffice — full per-user management: identity, plan+credits, workspaces,
// auth status and the powerful lifecycle actions (suspend / reset / grant /
// delete). Always fresh (this page mutates the very data it shows).
export const dynamic = 'force-dynamic'

const shortDate = (iso: string | null | undefined): string => dateEtHeure(iso)

export default async function UserDetailPage(props: { params: Promise<{ userId: string }> }) {
  const params = await props.params
  let user: AdminUserDetail
  try {
    user = await fetchAdminUser(params.userId)
  } catch (err) {
    return (
      <main className="wrap">
        <a className="link" href="/users">
          ← retour aux utilisateurs
        </a>
        <div className="error" style={{ marginTop: 16 }}>
          Utilisateur indisponible. {err instanceof Error ? err.message : String(err)}
        </div>
      </main>
    )
  }

  const auth = user.auth
  const activite = libelleActivite(user.lastActivity, auth ? auth.lastSignInAt : undefined, shortDate)
  const label = user.email || user.fullName || user.userId

  // ⚠️ `banned={auth?.banned ?? false}` était un REPLI, et il mentait : quand le
  // magasin d'authentification ne répond pas, `auth` vaut `null` et l'écran
  // affichait « Suspendre le compte » — c'est-à-dire qu'il devinait « actif ».
  // Un compte déjà suspendu se voyait proposer une suspension. Les trois états
  // sont désormais distincts, et le troisième n'offre aucun geste (#1664).
  const compte: EtatDuCompte = !auth
    ? { etat: 'inconnu' }
    : auth.banned
      ? { etat: 'suspendu', jusquau: auth.bannedUntil }
      : { etat: 'actif' }

  return (
    <main className="wrap">
      <a className="link" href="/users">
        ← retour aux utilisateurs
      </a>

      <h1 style={{ marginTop: 12 }}>{user.fullName || user.email || 'Utilisateur'}</h1>
      <p className="subtitle">
        {user.email || '—'} · inscrit le {shortDate(user.createdAt)}
      </p>

      {/* Identity */}
      <section className="card" style={{ display: 'grid', gap: 12 }}>
        <div className="label">Identité</div>
        <div className="kv">
          <span className="k">User ID</span>
          <span className="mono">{user.userId}</span>
          <span className="k">Email</span>
          <span>{user.email || '—'}</span>
          <span className="k">Nom</span>
          <span>{user.fullName || '—'}</span>
        </div>
      </section>

      {/* Plan + credits */}
      <section className="card" style={{ marginTop: 16, display: 'grid', gap: 14 }}>
        <div className="label">Offre &amp; crédits</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>Plan</span>
          <PlanSelect userId={user.userId} plan={user.plan} />
        </div>
        <div className="kv">
          {/* MONNAIE UNIQUE : un crédit vaut une action (analyse, enrichissement,
              besoin). Le second compteur d'avant décrivait une monnaie qui
              n'existe plus — l'afficher laisserait croire à deux réserves. */}
          <span className="k">Crédits utilisés</span>
          <span>
            {user.accountsUsed} <span style={{ color: 'var(--muted)' }}>/ {user.accountsLimit}</span>
          </span>
          {/* Deux grandeurs voisines et différentes : au-dessus les crédits du
              cycle (pondérés), ici le nombre de dossiers. Les confondre fait
              conclure qu'un client a analysé huit fois plus de comptes qu'en vrai. */}
          {/* #4423.2 — chaque chiffre dit ce qu'il compte : lancées / terminées (Laura) / suivies (app). */}
          <span className="k">Analyses lancées</span>
          <span>
            {libelleDossiers(user.accountsBreakdown).map(ligne => (
              <span key={ligne} style={{ display: 'block' }}>
                {ligne}
              </span>
            ))}
          </span>
        </div>
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
          <div className="label" style={{ marginBottom: 8 }}>
            Créditer / ajuster
          </div>
          <GrantCredits userId={user.userId} />
        </div>
      </section>

      {/* Auth status */}
      <section className="card" style={{ marginTop: 16, display: 'grid', gap: 12 }}>
        <div className="label">Statut du compte</div>
        {auth ? (
          <>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <span className={`badge ${auth.confirmed ? 'completed' : 'analyzing'}`}>
                {auth.confirmed ? 'Email confirmé' : 'Email non confirmé'}
              </span>
              <span className={`badge ${auth.banned ? 'error' : 'completed'}`}>
                {auth.banned ? 'Suspendu' : 'Actif'}
              </span>
            </div>
            <div className="kv">
              {/* #4423.1 — la dernière ACTIVITÉ, pas la dernière connexion par mot de passe
                  (qui ne bouge pas tant qu'une session reste ouverte). « jamais » et « non lue »
                  restent deux réponses distinctes sur la ligne du dessous. */}
              <span className="k">Dernière activité</span>
              <span>
                {activite.activite}
                {activite.source ? ` (${activite.source})` : ''}
                <br />
                <span style={{ fontSize: '0.8125rem', opacity: 0.75 }}>
                  dernière connexion par mot de passe : {activite.connexion}
                </span>
              </span>
              {auth.banned ? (
                <>
                  <span className="k">Suspendu jusqu&apos;au</span>
                  <span>{shortDate(auth.bannedUntil)}</span>
                </>
              ) : null}
            </div>
          </>
        ) : (
          <div className="empty" style={{ padding: 12 }}>
            Statut d&apos;authentification indisponible (lookup Supabase en échec).
          </div>
        )}
        {/* La confirmation NOMME la conséquence — ce que la suspension arrête,
            et ce qu'elle laisse debout, l'espace du propriétaire inclus (#1664). */}
        {/* #1674.9 — la suspension n'est pas RENDUE sous 768 px : ni tabulable,
            ni cliquable par script. Sur un écran étroit, on lit une fiche ; on
            ne coupe pas l'accès de quelqu'un depuis un quai de métro. */}
        <PosteDeTravailSeulement>
          <SuspendUser userId={user.userId} label={label} espaces={user.workspaces} compte={compte} />
        </PosteDeTravailSeulement>
      </section>

      {/* Workspaces */}
      <section className="card" style={{ marginTop: 16, display: 'grid', gap: 10 }}>
        <div className="label">ESN &amp; rôles</div>
        {user.workspaces.length === 0 ? (
          <div className="empty" style={{ padding: 12 }}>
            Cet utilisateur n&apos;appartient à aucune ESN.
          </div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {user.workspaces.map(w => (
              <a key={w.id} className="pill" href={`/esn/${w.id}`} style={{ textDecoration: 'none' }}>
                {w.name} · {w.role}
                {/* L'espace que cette personne VOIT en ouvrant l'application
                    (#1671-ter). Deux adhésions valides ne se départagent pas à
                    l'œil : c'est le sélecteur qui tranche, et le mot est écrit
                    plutôt que porté par une couleur seule. */}
                {w.isActive ? ' · espace actif' : ''}
              </a>
            ))}
          </div>
        )}
      </section>

      {/* Security actions */}
      <section className="card" style={{ marginTop: 16, display: 'grid', gap: 14 }}>
        <div className="label">Actions de sécurité</div>
        <ResetLink userId={user.userId} />
        {/* #1674.9 — les deux gestes que l'issue nomme explicitement comme
            interdits sur un écran étroit : l'impersonation et la suppression.
            Absents du DOM, pas masqués — un `display:none` les laisserait
            atteignables au clavier et par script. */}
        <PosteDeTravailSeulement>
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
            <Impersonate userId={user.userId} label={label} />
          </div>
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
            <DeleteUser userId={user.userId} label={label} workspaces={user.workspaces} />
          </div>
        </PosteDeTravailSeulement>
      </section>
    </main>
  )
}
