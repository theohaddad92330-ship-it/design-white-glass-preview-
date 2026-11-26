import { fetchAdminPlans, type AdminPlan } from '@/lib/admin'
import { fetchOfferEconomics, type OfferEconomics } from '@/lib/offer-economics'
import { OffersEconomics } from './offers-economics'
import { PlansEditor } from './plans-editor'

// Offers sub-view of the consolidated "Facturation" screen — the DB-backed plan
// catalogue (`plan_definitions`), now EDITABLE live from the backoffice (was
// read-only PLAN_CONFIG). Editing a plan changes the TEMPLATE used on the NEXT
// checkout / plan assignment; it does NOT rewrite existing subscribers' current
// caps (they keep theirs until re-assigned). Assigning a plan to a user still
// happens from the Clients screen (inline control on the users table).
//
// Depuis l'issue 1656, l'écran commence par CE QUE CHAQUE OFFRE RAPPORTE —
// clients, MRR généré, marge, consommation médiane, taux de dépassement — et
// l'éditeur vient ensuite. Le catalogue seul disait ce qu'on vend ; il ne
// disait pas ce que ça rapporte, et c'est sur ce chiffre-là qu'on arbitre.
//
// ⚠️ Les deux lectures sont SÉPARÉES à dessein : si la mesure échoue, le
// catalogue reste éditable, et la confirmation d'édition dit « nombre de
// clients indisponible » plutôt que « 0 client concerné ». Un zéro de panne qui
// se lit comme un zéro mesuré est exactement ce qui ferait baisser un prix sans
// savoir qui il touche.

export async function OffersPanel() {
  let plans: AdminPlan[] = []
  let error: string | null = null
  try {
    plans = await fetchAdminPlans()
  } catch (err) {
    error = err instanceof Error ? err.message : String(err)
  }

  let economics: OfferEconomics[] | null = null
  let economicsError: string | null = null
  try {
    economics = await fetchOfferEconomics()
  } catch (err) {
    economicsError = err instanceof Error ? err.message : String(err)
  }

  if (error) {
    return (
      <div className="error">
        Impossible de joindre l&apos;endpoint admin de l&apos;API. / Could not reach the API admin endpoint.
        <br />
        {error}
        <br />
        Vérifie <code>API_BASE_URL</code> + <code>INTERNAL_API_SECRET</code> et que l&apos;API tourne.
      </div>
    )
  }

  return (
    <>
      <h2 style={{ margin: '0 0 4px' }}>Ce que chaque offre rapporte</h2>
      <p className="subtitle" style={{ margin: '0 0 16px' }}>
        Le <strong>MRR généré</strong> est la somme des abonnements récurrents en cours sur l&apos;offre, sièges
        supplémentaires compris, au tarif du catalogue — les clients sur facture n&apos;en font pas partie. Le{' '}
        <strong>taux de dépassement</strong> est la part des clients de l&apos;offre qui ont atteint leur plafond de
        crédits. Cet écran l&apos;affiche ; il n&apos;en conclut rien — un taux élevé dit soit une offre mal calibrée,
        soit le point de bascule vers l&apos;offre supérieure, et le chiffre seul ne départage pas les deux.
      </p>

      {economicsError ? (
        <div className="error" style={{ margin: '0 0 20px' }}>
          Mesure indisponible — l&apos;API n&apos;a pas répondu. Aucune colonne dérivée n&apos;est affichée : un
          «&nbsp;0&nbsp;» de panne se lirait comme un zéro mesuré.
          <br />
          {economicsError}
        </div>
      ) : (
        <OffersEconomics offers={economics ?? []} />
      )}

      <h2 style={{ margin: '32px 0 4px' }}>Modifier le catalogue</h2>
      <p style={{ margin: '0 0 20px', fontSize: 13, color: 'var(--muted)' }}>
        Catalogue modifiable en direct (table <code>plan_definitions</code>). Modifier une offre change le{' '}
        <strong>modèle</strong> appliqué au <strong>prochain</strong> paiement / à la prochaine assignation — les
        abonnés actuels gardent leurs plafonds jusqu&apos;à réassignation. / Live-editable; edits apply to the NEXT
        checkout/assignment, existing subscribers keep their caps. Pour assigner une offre à un utilisateur, va sur{' '}
        <a className="link" href="/clients?view=users">
          Clients
        </a>
        .
      </p>

      {plans.length === 0 ? (
        <div className="empty">Aucune offre configurée. / No plan configured.</div>
      ) : (
        <PlansEditor initialPlans={plans} economics={economics} />
      )}
    </>
  )
}
