import { KpiTile } from '@/ui'
import { fetchClientHealth, type ClientHealthReport } from '@/lib/client-health'
import { ClientsTable } from './_components/clients-table'
import { compterLesAlertes, formaterEuros } from './clients.logic'

/**
 * CLIENTS — un espace par ligne, et sa SANTÉ (#1652).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CET ÉCRAN EXISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * « La colonne Santé — nouvelle, et c'est la plus utile. » Le back-office savait
 * lister des clients ; il ne savait pas dire lequel appeler ce matin. Le score
 * répond à cette question-là, et à aucune autre : il ordonne une file de
 * décision, il ne prédit rien.
 *
 * ⚠️ **Ce n'est PAS une probabilité** — ni de churn, ni de renouvellement. Le
 * dépôt refuse les probabilités depuis six arbitrages. C'est un score
 * DÉCOMPOSÉ : cinq axes nommés, chacun avec ce qu'il a lu, et ce qui n'a pas pu
 * être évalué est dit plutôt que compté zéro.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CET ÉCRAN NE REMPLACE PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * `/clients` reste en place. Ses deux vues (`?view=users`, `?view=esn`) servent
 * la section Administration — l'annuaire des personnes et la fiche ESN ne sont
 * pas la même question que « ce client va-t-il partir ». Le lien du rail bascule
 * ; l'écran d'annuaire, lui, ne se supprime pas dans ce lot.
 */
export const dynamic = 'force-dynamic'

function first(v: string | string[] | undefined): string {
  return Array.isArray(v) ? (v[0] ?? '') : (v ?? '')
}

/** Le MRR TOTAL des lignes affichées. `null` n'est pas 0 : il ne s'additionne pas. */
function mrrTotal(report: ClientHealthReport): { cents: number; sans: number } {
  let cents = 0
  let sans = 0
  for (const row of report.rows) {
    if (row.mrrCents === null) sans += 1
    else cents += row.mrrCents
  }
  return { cents, sans }
}

export default async function ClientsRevenusPage(props: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const searchParams = await props.searchParams
  const search = first(searchParams?.search).trim()

  let report: ClientHealthReport | null = null
  let panne: string | null = null
  try {
    report = await fetchClientHealth(search || undefined)
  } catch (err) {
    // ⚠️ Une panne d'API n'affiche PAS un tableau vide : elle se DIT. Un écran
    // vide se lirait « aucun client », ce qui est le pire mensonge possible ici.
    panne = err instanceof Error ? err.message : String(err)
  }

  if (!report) {
    return (
      <main className="wrap">
        <h1>Clients</h1>
        <p className="subtitle">
          Un espace par ligne, avec sa santé — l’écran qui dit quel client rappeler aujourd’hui, et pourquoi.
        </p>
        <div className="error" style={{ margin: '16px 0' }}>
          Santé des clients indisponible — l’API n’a pas répondu. {panne}
        </div>
      </main>
    )
  }

  const alertes = compterLesAlertes(report.rows)
  const { cents, sans } = mrrTotal(report)

  return (
    <main className="wrap">
      <h1>Clients</h1>
      <p className="subtitle">
        Un espace par ligne, avec sa santé sur cinq axes pondérés — l’écran qui dit quel client rappeler aujourd’hui, et
        pourquoi. Un axe sans donnée SORT du calcul : il ne compte jamais zéro.{' '}
        {/* #4467 — la consommation de crédits vit sur son écran : le seul endroit où elle se voit. */}
        <a href="/revenus/clients/consommation">Consommation de crédits par espace et par utilisateur →</a>
      </p>

      <section className="kpi-grid">
        <KpiTile label="Espaces" value={report.total} period={search ? `filtrés sur « ${search} »` : 'tous'} />
        <KpiTile
          label="MRR cumulé"
          value={formaterEuros(cents)}
          period={sans > 0 ? `${sans} espace${sans > 1 ? 's' : ''} sans MRR mesurable` : 'toutes les lignes mesurées'}
        />
        <KpiTile
          label="Alertes de churn"
          value={alertes}
          period={`santé mesurée sous 25 sur ${report.rows.length} ligne${report.rows.length > 1 ? 's' : ''}`}
        />
        <KpiTile
          label="Fonctions observées"
          value={report.featureCatalogue}
          period={`sur ${report.windowDays} jours — le dénominateur de l’adoption`}
        />
      </section>

      <form method="get" action="/revenus/clients" style={{ display: 'flex', gap: 8, margin: '0 0 16px' }}>
        <input
          name="search"
          defaultValue={search}
          placeholder="Rechercher un espace…"
          style={{ flex: 1, maxWidth: 360 }}
        />
        <button className="btn" type="submit">
          Rechercher
        </button>
        {search ? (
          <a
            className="btn ghost"
            href="/revenus/clients"
            style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}
          >
            Réinitialiser
          </a>
        ) : null}
      </form>

      <ClientsTable report={report} />
    </main>
  )
}
