import { SubTabs } from '@/components/sub-tabs'
import { CockpitPanel } from './_components/cockpit-panel'
import { RunsPanel } from './_components/runs-panel'
import { EnrichmentPanel } from './_components/enrichment-panel'
import { LancerPanel } from './_components/lancer-panel'

// Consolidated "Analyses" umbrella — merges the former Monitoring (cockpit,
// landing /), Analyses (this run list) and Lancer une analyse (/run) screens into
// one, with an in-page sub-tab toggle (?view=cockpit|runs|lancer). Cockpit is the
// default (the historical landing). The old / and /run routes redirect in; the
// run DETAIL page /monitoring/[id] is unchanged. Always fresh.
export const dynamic = 'force-dynamic'

function first(v: string | string[] | undefined): string {
  return Array.isArray(v) ? (v[0] ?? '') : (v ?? '')
}

export default async function AnalysesPage(props: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const searchParams = await props.searchParams
  const raw = first(searchParams?.view)
  const view =
    raw === 'runs' ? 'runs' : raw === 'lancer' ? 'lancer' : raw === 'enrichissement' ? 'enrichissement' : 'cockpit'
  // Fenêtre d'observation de la couverture, réglable sans redéploiement.
  const days = Math.min(Math.max(Number.parseInt(first(searchParams?.days), 10) || 30, 1), 365)

  return (
    <main className="wrap">
      {/* #1678 — la phrase d'écran est obligatoire sur les 24 pages : « une route
          sans phrase échoue », la règle du produit client, et elle vaut ici.
          Elle est au niveau de l'OMBRELLE et pas dans les quatre panneaux :
          quatre phrases pour un écran diraient qu'il y a quatre écrans. */}
      <h1>Analyses</h1>
      <p className="subtitle">
        Les analyses lancées, leur coût et leur contrat — le cockpit d’ensemble, la liste des exécutions, le lancement
        manuel et ce que l’enrichissement trouve réellement. / Analyses, their cost and contract: overview, run list,
        manual launch and what enrichment actually finds.
      </p>
      <SubTabs
        tabs={[
          { label: 'Cockpit', href: '/monitoring?view=cockpit', active: view === 'cockpit' },
          { label: 'Analyses', href: '/monitoring?view=runs', active: view === 'runs' },
          { label: 'Lancer une analyse', href: '/monitoring?view=lancer', active: view === 'lancer' },
          {
            label: 'Enrichissement',
            href: '/monitoring?view=enrichissement',
            active: view === 'enrichissement',
          },
        ]}
      />

      {view === 'runs' ? (
        <RunsPanel searchParams={searchParams ?? {}} />
      ) : view === 'lancer' ? (
        <LancerPanel />
      ) : view === 'enrichissement' ? (
        <EnrichmentPanel days={days} />
      ) : (
        <CockpitPanel />
      )}
    </main>
  )
}
