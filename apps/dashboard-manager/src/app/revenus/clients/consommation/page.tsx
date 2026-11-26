import { KpiTile } from '@/ui'
import { fetchCreditConsumption, type CreditConsumptionReport } from '@/lib/credit-consumption'
import { ConsommationTables } from './_components/consommation-tables'

/**
 * CONSOMMATION — les crédits par espace ET par utilisateur (#4467).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CET ÉCRAN EXISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * Décision de Louis du 22/10/2026 (épopée #4468) : les crédits sont implicites.
 * Ils se débitent, ils ne s'affichent plus au client — ni compteur, ni coût
 * annoncé, ni solde sur la facturation. « Je veux juste avoir la donnée moi, en
 * backend, voir combien de gens ont les crédits. » Ni l'utilisateur ni le manager
 * de l'ESN cliente ne la voient : CET écran est le seul endroit.
 *
 * Ce qu'il ne fait PAS : il n'agrège aucun coût fournisseur (GA-43 inchangée) et
 * il n'écrit rien — l'ajustement d'un solde passe par la fiche du propriétaire.
 */
export const dynamic = 'force-dynamic'

function first(v: string | string[] | undefined): string {
  return Array.isArray(v) ? (v[0] ?? '') : (v ?? '')
}

export default async function ConsommationPage(props: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const searchParams = await props.searchParams
  const search = first(searchParams?.search).trim()

  let report: CreditConsumptionReport | null = null
  let panne: string | null = null
  try {
    report = await fetchCreditConsumption(search || undefined)
  } catch (err) {
    // ⚠️ Une panne d'API n'affiche PAS un tableau vide : elle se DIT. Un écran
    // vide se lirait « personne n'a rien consommé ».
    panne = err instanceof Error ? err.message : String(err)
  }

  if (!report) {
    return (
      <main className="wrap">
        <h1>Consommation</h1>
        <div className="error" style={{ margin: '16px 0' }}>
          Consommation indisponible — l’API n’a pas répondu. {panne}
        </div>
      </main>
    )
  }

  const epuises = new Set(report.exhausted.map(row => row.workspaceId)).size

  return (
    <main className="wrap">
      <h1>Consommation</h1>
      <p className="subtitle">
        Les crédits ne s’affichent plus chez le client : cet écran est le seul endroit où ils se voient. Solde restant
        du pool de l’espace, consommé sur {report.windowDays} jours (net des remboursements), date de renouvellement. Un
        pool illimité n’a pas de solde ; une consommation non mesurée s’écrit « — », jamais « 0 ».
      </p>

      <section className="kpi-grid">
        <KpiTile
          label="Espaces"
          value={report.workspaces.length}
          period={search ? `filtrés sur « ${search} »` : 'tous'}
        />
        <KpiTile label="Espaces à solde épuisé" value={epuises} period="le frein doux est actif" />
        <KpiTile label="Comptes concernés" value={report.exhausted.length} period="membres de ces espaces" />
      </section>

      <form method="get" action="/revenus/clients/consommation" style={{ display: 'flex', gap: 8, margin: '0 0 16px' }}>
        <input
          name="search"
          defaultValue={search}
          placeholder="Rechercher un espace…"
          style={{ flex: 1, maxWidth: 360 }}
        />
        <button className="btn" type="submit">
          Rechercher
        </button>
      </form>

      <ConsommationTables report={report} />
    </main>
  )
}
