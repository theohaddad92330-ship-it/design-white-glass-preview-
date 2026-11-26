import { redirect } from 'next/navigation'
import { SubTabs } from '@/components/sub-tabs'
import { UsagePanel } from './_components/usage-panel'
import { OffersPanel } from './_components/offers-panel'
import { ManualClientsPanel } from './_components/manual-clients-panel'
import { BillingCalendarPanel } from './_components/billing-calendar-panel'

// Consolidated "Facturation" backoffice screen — merges the former Coûts & usage
// and Offres tabs into one, with an in-page sub-tab toggle
// (?view=usage|offres|manuel). The old /usage and /offres routes now redirect
// here. Always fresh.
//
// « Sur facture » is the sales-led side: clients provisioned by hand and billed
// offline, with no Stripe subscription. It records the commercial terms only —
// no document is generated and no relance is sent from here.
export const dynamic = 'force-dynamic'

function first(v: string | string[] | undefined): string {
  return Array.isArray(v) ? (v[0] ?? '') : (v ?? '')
}

export default async function FacturationPage(props: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const searchParams = await props.searchParams
  const raw = first(searchParams?.view)
  // ⚠️ `?view=fournisseurs` REDIRIGE vers `/couts` depuis le 07/09/2026 (#1661).
  // Les coûts fournisseurs sont sortis de Facturation — « c'est de la technique,
  // pas du revenu » — et les laisser aux deux endroits aurait garanti que l'un
  // des deux cesse d'être maintenu sans que personne le remarque (loi 4 du
  // tome 7). La redirection plutôt que la suppression : le signet ne doit pas
  // atterrir en silence sur l'onglet par défaut, ce qui se lit comme un bug.
  if (raw === 'fournisseurs') redirect('/couts')
  const view = raw === 'offres' ? 'offres' : raw === 'manuel' ? 'manuel' : raw === 'calendrier' ? 'calendrier' : 'usage'

  return (
    <main className="wrap">
      <h1>Facturation</h1>
      <p className="subtitle">
        Backoffice — coûts &amp; usage (cross-tenant), catalogue des offres, clients facturés sur facture et leur
        calendrier de facturation sur douze mois.
      </p>

      <SubTabs
        tabs={[
          { label: 'Coûts & usage', href: '/facturation?view=usage', active: view === 'usage' },
          { label: 'Offres', href: '/facturation?view=offres', active: view === 'offres' },
          { label: 'Sur facture', href: '/facturation?view=manuel', active: view === 'manuel' },
          { label: 'Calendrier', href: '/facturation?view=calendrier', active: view === 'calendrier' },
        ]}
      />

      {view === 'offres' ? (
        <OffersPanel />
      ) : view === 'manuel' ? (
        <ManualClientsPanel />
      ) : view === 'calendrier' ? (
        // Le mois affiché et la période ouverte voyagent par l'URL : l'écran
        // reste rendu côté serveur, et un lien vers une période se partage.
        <BillingCalendarPanel
          mois={first(searchParams?.mois) || undefined}
          periode={first(searchParams?.periode) || undefined}
        />
      ) : (
        <UsagePanel />
      )}
    </main>
  )
}
