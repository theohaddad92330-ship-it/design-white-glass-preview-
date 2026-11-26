import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { KpiTile } from '@/ui'
import { dateEtHeure } from '@/lib/dates'
import { operateurDepuisJeton } from '@/lib/guard'
import { fetchEtatSecurite, type EtatSecurite } from '@/lib/etat-securite'
import { fetchImpersonations, type SessionImpersonation } from '@/lib/impersonations'
import { peut } from '@/lib/roles'
import { listeDacces } from '@/lib/roles-env'
import { COOKIE_SESSION } from '@/lib/session'
import { SecuriteAnomalies } from './_components/securite-anomalies'
import { SecuriteConnexions } from './_components/securite-connexions'
import { secretsConfiguresDepuisEnvironnement } from './secrets-configures'
import { FENETRES_PROPOSEES, hrefFenetre, libellePurge, lireFenetre, resumeParType } from './securite.logic'

export const dynamic = 'force-dynamic'

/**
 * SÉCURITÉ — l'état de sécurité du back-office, à partir du journal d'accès
 * qui existe déjà (#1671.4), et la détection d'accès anormal BRANCHÉE dessus
 * (#1671.3).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI EXISTAIT DÉJÀ, ET CE QUE CE LOT BRANCHE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le journal d'accès (#1671.2) était déjà ÉCRIT (`auth-routes.ts` →
 * `BackofficeAccessJournalService.record`) et déjà PURGÉ (365 jours, balayage
 * quotidien de `PrivacyRetentionService`). Deux de ses trois signaux de
 * détection — `countRecentFailures` (rafale d'échecs) et `knownCountries`
 * (pays jamais vu) — étaient déjà CALCULÉS et déjà TESTÉS, et n'avaient ZÉRO
 * appelant dans tout le dépôt : du code juste que personne n'appelle, le
 * défaut n°1 documenté de ce dépôt. Ce lot écrit le troisième signal (heure
 * inhabituelle, 1 h – 6 h heure de Paris), assemble les trois dans
 * `etatSecurite()`, et leur donne cet écran — le premier appelant des deux
 * premiers.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * L'ENVOI EXISTE — ET CE DOCBLOC DISAIT LE CONTRAIRE
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ #1655 — état PÉRIMÉ jusqu'au 09/09/2026. L'arrêt volontaire a été levé le
 * 08/09 : l'alerte part par e-mail aux propriétaires, au plus une fois par
 * heure pour un même sujet, et le sous-titre de l'écran (`:117`) le dit déjà.
 * Ces lignes-ci annonçaient encore « il n'envoie aucune » — un commentaire qui
 * ment est pire qu'un commentaire absent : il se relit comme la règle en
 * vigueur, et c'est sur cette lecture que le lot suivant décide.
 *
 * Cet écran calcule et AFFICHE les anomalies ; c'est le dispatcheur d'alertes
 * côté API qui envoie — voir `BackofficeAccessJournalService.etatSecurite()`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * « NON MESURÉ » N'EST JAMAIS « 0 ANOMALIE »
 * ─────────────────────────────────────────────────────────────────────────────
 * Une fenêtre sans aucun événement (`mesure: false`) ne rend PAS des compteurs
 * à zéro : elle le DIT, en toutes lettres, à la place des cartes KPI et de la
 * liste d'anomalies. Question qui tranche : si cette valeur est absente,
 * « 0 » est-il VRAI ? Ici, non — on n'a rien pu regarder.
 *
 * Rôle exigé : `audit.read` (plancher `operator`) — la même donnée que le
 * journal d'audit (des opérateurs, leurs adresses, leurs gestes), la même
 * porte.
 */
export default async function SecuritePage(props: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const searchParams = await props.searchParams
  // ⚠️ LA CAPACITÉ SE VÉRIFIE ICI, PAS SEULEMENT À L’ÉCRAN — même garde que
  // `/audit` (#1669) : sans elle, un `viewer` lirait qui s’est connecté, quand,
  // depuis quelle adresse IP, dans toute l’équipe.
  if (listeDacces().etat === 'active') {
    const operateur = await operateurDepuisJeton((await cookies()).get(COOKIE_SESSION)?.value)
    if (!operateur || !peut(operateur.role, 'audit.read')) redirect('/acces-refuse')
  }

  const fenetre = lireFenetre(searchParams ?? {})

  let etat: EtatSecurite | null = null
  let panne: string | null = null
  try {
    etat = await fetchEtatSecurite(fenetre)
  } catch (err) {
    panne = err instanceof Error ? err.message : String(err)
  }

  if (!etat) {
    return (
      <main className="wrap">
        <h1>Sécurité</h1>
        <p className="subtitle">
          Connexions récentes, échecs, pays observés et anomalies détectées sur le journal d’accès du back-office — en
          lecture seule.
        </p>
        <div className="error" style={{ margin: '16px 0' }}>
          État de sécurité indisponible — l’API n’a pas répondu. {panne} (Une page qui affiche « 0 anomalie » sur une
          panne mentirait par silence : ce n’est pas ce qu’on sait.)
        </div>
      </main>
    )
  }

  const resume = resumeParType(etat.anomalies)

  // #1671.4 — les impersonations EN COURS. Best-effort : une panne de ce bloc
  // secondaire ne doit pas emporter l'écran de sécurité entier, qui a déjà sa
  // donnée principale.
  let impersonationsEnCours: SessionImpersonation[] | null = null
  try {
    impersonationsEnCours = (await fetchImpersonations()).filter(s => s.status === 'ongoing')
  } catch {
    impersonationsEnCours = null
  }

  const rolesActifs = listeDacces()
  const secretsConfigures = secretsConfiguresDepuisEnvironnement()

  return (
    <main className="wrap">
      <h1>Sécurité</h1>
      <p className="subtitle">
        Connexions récentes, échecs, pays observés et anomalies détectées sur le journal d’accès du back-office — en
        lecture seule. Cet écran affiche la détection ; l’alerte, elle, part par e-mail aux propriétaires, une fois par
        heure au plus pour un même sujet.
      </p>

      <nav aria-label="Fenêtre d’observation" style={{ display: 'flex', gap: 6, margin: '0 0 16px' }}>
        {FENETRES_PROPOSEES.map(jours => (
          <a
            key={jours}
            href={hrefFenetre(jours)}
            className="pill"
            aria-current={etat.fenetreJours === jours ? 'page' : undefined}
            style={etat.fenetreJours === jours ? { borderColor: 'var(--accent)', color: 'var(--text)' } : undefined}
          >
            {jours} j
          </a>
        ))}
      </nav>

      {!etat.mesure ? (
        <p className="empty" style={{ margin: '16px 0' }}>
          Non mesuré — le journal ne contient aucun événement sur les {etat.fenetreJours} derniers jours. Ce n’est pas «
          zéro anomalie » : il n’y a rien à comparer.
        </p>
      ) : (
        <>
          <section className="cards" style={{ gridTemplateColumns: 'repeat(5, minmax(0, 1fr))' }}>
            <KpiTile
              label="Connexions réussies"
              value={etat.parEvenement['connexion'] ?? null}
              period={`${etat.fenetreJours} j`}
            />
            <KpiTile
              label="Échecs"
              value={etat.parEvenement['connexion_refusee'] ?? null}
              period={`${etat.fenetreJours} j`}
            />
            <KpiTile label="Anomalies détectées" value={etat.anomalies.length} period={`${etat.fenetreJours} j`} />
            <KpiTile label="Pays observés" value={etat.paysObserves.length} />
            <KpiTile label="Acteurs distincts" value={etat.acteursDistincts} />
          </section>

          <section style={{ margin: '20px 0' }}>
            <h2 style={{ fontSize: 16, margin: '0 0 4px' }}>Anomalies</h2>
            <p className="muted" style={{ margin: '0 0 8px' }}>
              {resume.rafale_echecs} rafale{resume.rafale_echecs > 1 ? 's' : ''} d’échecs · {resume.pays_inhabituel}{' '}
              pays inhabituel{resume.pays_inhabituel > 1 ? 's' : ''} · {resume.heure_inhabituelle} connexion
              {resume.heure_inhabituelle > 1 ? 's' : ''} à une heure inhabituelle.
            </p>
            <SecuriteAnomalies anomalies={etat.anomalies} />
          </section>
        </>
      )}

      <section className="card" style={{ margin: '0 0 20px', padding: 16 }}>
        <h2 style={{ margin: '0 0 4px', fontSize: 16 }}>Rétention</h2>
        <p className="muted" style={{ margin: 0 }}>
          {libellePurge(etat.oldestEntryAt)}
        </p>
      </section>

      <section style={{ margin: '20px 0' }}>
        <h2 style={{ fontSize: 16, margin: '0 0 8px' }}>Connexions récentes</h2>
        <SecuriteConnexions entrees={etat.entries} />
      </section>

      {etat.paysObserves.length > 0 ? (
        <p className="muted" style={{ fontSize: 12 }}>
          Pays observés sur cette fenêtre : {etat.paysObserves.join(', ')}.
        </p>
      ) : null}

      {/* ─────────────────────────────────────────────────────────────────
       * #1671.4 — LES QUATRE BLOCS QUI MANQUAIENT.
       * ───────────────────────────────────────────────────────────────── */}

      <section className="card" style={{ margin: '20px 0', padding: 16 }}>
        <h2 style={{ margin: '0 0 8px', fontSize: 16 }}>Rôles actifs</h2>
        {rolesActifs.etat !== 'active' ? (
          <p className="muted" style={{ margin: 0 }}>
            Couche d’identité éteinte (`DM_ALLOWED_EMAILS` non posée) — pas de rôle à afficher, le Basic Auth garde
            seul.
          </p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                <th style={ENTETE}>Opérateur</th>
                <th style={ENTETE}>Rôle</th>
              </tr>
            </thead>
            <tbody>
              {[...rolesActifs.roles.entries()].map(([email, role]) => (
                <tr key={email} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={CELLULE} className="mono">
                    {email}
                  </td>
                  <td style={CELLULE}>{role}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="card" style={{ margin: '20px 0', padding: 16 }}>
        <h2 style={{ margin: '0 0 8px', fontSize: 16 }}>Impersonations en cours</h2>
        {impersonationsEnCours === null ? (
          <p className="muted" style={{ margin: 0 }}>
            Non mesuré — le service d’impersonation n’a pas répondu.
          </p>
        ) : impersonationsEnCours.length === 0 ? (
          <p className="empty" style={{ margin: 0 }}>
            Aucune impersonation en cours.
          </p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                <th style={ENTETE}>Qui</th>
                <th style={ENTETE}>Depuis</th>
                <th style={ENTETE}>Motif</th>
              </tr>
            </thead>
            <tbody>
              {impersonationsEnCours.map(session => (
                <tr key={session.jti} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={CELLULE} className="mono">
                    {session.actor}
                  </td>
                  <td style={CELLULE} className="mono">
                    {dateEtHeure(session.startedAt)}
                  </td>
                  <td style={CELLULE} className="muted">
                    {session.reason}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="muted" style={{ fontSize: 12, margin: '8px 0 0' }}>
          <a href="/impersonations" className="link">
            Voir toutes les sessions ↗
          </a>
        </p>
      </section>

      <section className="card" style={{ margin: '20px 0', padding: 16 }}>
        <h2 style={{ margin: '0 0 8px', fontSize: 16 }}>Secrets configurés</h2>
        <p className="muted" style={{ margin: '0 0 8px', fontSize: 12 }}>
          Présence uniquement — jamais une valeur.
        </p>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <tbody>
            {secretsConfigures.map(secret => (
              <tr key={secret.capacite} style={{ borderTop: '1px solid var(--border)' }}>
                <td style={CELLULE}>{secret.capacite}</td>
                <td style={CELLULE}>
                  <span className={secret.configure ? 'muted' : 'error'}>
                    {secret.configure ? 'Configuré' : 'Non configuré'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card" style={{ margin: '20px 0', padding: 16 }}>
        <h2 style={{ margin: '0 0 8px', fontSize: 16 }}>Dernier changement de mot de passe</h2>
        <p className="muted" style={{ margin: 0 }}>
          Non mesuré — les comptes opérateurs sont gérés par Supabase Auth, et cette date n’est pas encore exposée en
          interne (elle demanderait une lecture par l’API Admin de Supabase, hors périmètre de ce lot). Aucune valeur
          n’est devinée à sa place.
        </p>
      </section>

      <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
        Mesuré le {dateEtHeure(etat.measuredAt)}.
      </p>
    </main>
  )
}

const ENTETE = { textAlign: 'left', padding: '6px 8px', whiteSpace: 'nowrap' } as const
const CELLULE = { padding: '8px', verticalAlign: 'top' } as const
