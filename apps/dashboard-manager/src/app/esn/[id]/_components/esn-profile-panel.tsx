import type { AdminWorkspaceEsnProfile } from '@/lib/admin'
import { describeEsnProfile } from '@/lib/esn-profile-state'
import { EmailEnClair } from '@/app/_components/email-en-clair'
import { dateEtHeure } from '@/lib/dates'

/**
 * La fiche ESN partagée d'un espace — répondre à « le propriétaire a-t-il
 * rempli ? » sans ouvrir la base de production (#1671-ter).
 *
 * ⚠️ L'ÉCRAN NE MONTRE AUCUNE VALEUR, et c'est délibéré : le positionnement,
 * les secteurs visés et les types de comptes ciblés sont la stratégie
 * commerciale d'un client. La question du support est « est-ce rempli ? »,
 * jamais « avec quoi ? ».
 */

/** Le libellé de chaque question, dans la langue de la console. Une clé
 *  inconnue s'affiche telle quelle plutôt que de disparaître : un écran qui
 *  masque ce qu'il ne connaît pas ment sur son dénominateur. */
const LIBELLES: Record<string, string> = {
  esn_name: "Nom de l'ESN",
  consultant_size: 'Nombre de consultants',
  sales_team_size: 'Taille de l’équipe commerciale',
  expertise_areas: 'Domaines d’expertise',
  positioning: 'Positionnement',
  target_sectors: 'Secteurs visés',
  target_company_types: 'Types de comptes ciblés',
  staffing_model: 'Modèle de staffing',
  geo_zones: 'Zones géographiques',
  main_sales_pain: 'Principal frein commercial',
  offer_domains: 'Domaines d’offre',
  recruits_for_clients: 'Placement en CDI chez le client',
}

export function EsnProfilePanel({ esnProfile }: { esnProfile: AdminWorkspaceEsnProfile | undefined }) {
  // La décision vit dans `describeEsnProfile`, qui est GARDÉE par une suite ;
  // ce composant ne fait que la rendre (l'environnement de test de cette
  // application est `node`, l'écran se recette en direct).
  const state = describeEsnProfile(esnProfile)

  // Console neuve sur API ancienne : le champ est absent. On le DIT, plutôt que
  // de rendre « aucune fiche » — ce serait annoncer une panne au repos.
  if (state.kind === 'unavailable') {
    return (
      <section className="card" style={{ marginTop: 16, display: 'grid', gap: 10 }}>
        <div className="label">Fiche ESN (profil partagé)</div>
        <div className="empty" style={{ padding: 12 }}>
          Indisponible sur cette version de l&apos;API.
        </div>
      </section>
    )
  }

  return (
    <section className="card" style={{ marginTop: 16, display: 'grid', gap: 12 }}>
      <div className="label">Fiche ESN (profil partagé)</div>

      {state.kind === 'none' ? (
        <div className="empty" style={{ padding: 12 }}>
          Aucune fiche partagée pour cet espace. Chaque membre repasse donc l&apos;intégralité du questionnaire —
          c&apos;est le propriétaire qui la crée en répondant à son onboarding.
        </div>
      ) : (
        <>
          <p style={{ margin: 0, color: 'var(--muted)', fontSize: 13 }}>
            Portée par {state.heldByEmail ? <EmailEnClair email={state.heldByEmail} /> : state.heldByUserId || '—'}
            {state.version !== null ? ` · version ${state.version}` : ''}
            {state.updatedAt ? ` · mise à jour le ${dateEtHeure(state.updatedAt)}` : ''}
          </p>

          <div>
            <span className="pill">
              {state.companyFilled} / {state.companyTotal} faits sur l&apos;entreprise renseignés
            </span>
          </div>

          <table>
            <thead>
              <tr>
                <th>Question</th>
                <th>Portée</th>
                <th>État</th>
              </tr>
            </thead>
            <tbody>
              {state.answers.map(answer => (
                <tr key={answer.key}>
                  <td>{LIBELLES[answer.key] ?? answer.key}</td>
                  <td>
                    <span className="pill">{answer.scope === 'company' ? 'entreprise' : 'personnelle'}</span>
                  </td>
                  <td style={{ color: 'var(--muted)' }}>{answer.filled ? 'Renseignée' : 'Vide'}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <p style={{ margin: 0, color: 'var(--muted)', fontSize: 13 }}>
            Un associé qui rejoint cet espace hérite des faits sur l&apos;entreprise et n&apos;a plus à répondre
            qu&apos;aux questions personnelles.
          </p>
        </>
      )}
    </section>
  )
}
