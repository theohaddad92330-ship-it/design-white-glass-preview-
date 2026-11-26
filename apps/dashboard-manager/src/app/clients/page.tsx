import { redirect } from 'next/navigation'
import { fetchAdminOverview, type AdminOverview } from '@/lib/admin'
import { SubTabs } from '@/components/sub-tabs'
import { countOrUnmeasured } from '@/lib/mesure'
import { CreateClientForm } from './_components/create-client-form'
import { EsnDirectory } from './_components/esn-directory'
import { TeamsPanel } from './_components/teams-panel'

// Consolidated "Clients" backoffice screen — merges the former Utilisateurs and
// ESN tabs into one, with an in-page sub-tab toggle (?view=users|esn). The global
// overview (users / ESN / accounts / plan mix) sits on top of both sub-views.
// The ESN view fuses the ESN annuaire (identity/plan/members) with the manager
// KPIs of the former standalone /teams screen — both aggregate per ESN/workspace,
// so they now live on one screen. The old /users, /esn and /teams list routes all
// redirect here. Always fresh.
export const dynamic = 'force-dynamic'

function first(v: string | string[] | undefined): string {
  return Array.isArray(v) ? (v[0] ?? '') : (v ?? '')
}

function OverviewCards({ overview }: { overview: AdminOverview }) {
  return (
    <section className="kpi-grid">
      <div className="card">
        <div className="label">Users</div>
        <div className="value">{overview.totalUsers}</div>
      </div>
      <div className="card">
        <div className="label">ESN</div>
        <div className="value">{overview.totalWorkspaces}</div>
      </div>
      <div className="card">
        <div className="label">Analyses lancées (tous clients)</div>
        <div className="value">{overview.totalAccounts}</div>
      </div>
      <div className="card">
        <div className="label">Répartition plans</div>
        <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {(['trial', 'starter', 'team', 'growth', 'beta'] as const).map(p => (
            <span key={p} className="pill">
              {p} · {countOrUnmeasured(overview.plans?.[p])}
            </span>
          ))}
        </div>
      </div>
    </section>
  )
}

export default async function ClientsPage(props: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const searchParams = await props.searchParams
  // ⚠️ `?view=users` REDIRIGE vers `/users` depuis le 07/09/2026 (#1664).
  // Deux listes d'utilisateurs coexistaient : celle-ci, éparse, et le tableau
  // dense de `/users`. « Rien n'apparaît deux fois sous la même forme avec le
  // même contenu » (loi 4 du tome 7) — et laisser les deux aurait garanti que
  // l'une des deux cesse d'être maintenue sans que personne le remarque.
  // La redirection plutôt que la suppression : les signets et les liens du
  // rapport de bug pointent encore ici, et aucun ne doit tomber sur un 404.
  if (first(searchParams?.view) !== 'esn') redirect('/users')
  const view = 'esn' as const
  const search = first(searchParams?.search).trim()
  const days = first(searchParams?.days)

  // Best-effort — a blip on the overview must not sink the directory below it.
  let overview: AdminOverview | null = null
  try {
    overview = await fetchAdminOverview()
  } catch {
    overview = null
  }

  return (
    <main className="wrap">
      <h1>Clients</h1>
      <p className="subtitle">
        Backoffice — utilisateurs et ESN (workspaces) réunis en un seul écran. La vue ESN combine l&apos;annuaire et les
        KPIs manager par ESN.
      </p>

      {overview ? <OverviewCards overview={overview} /> : null}

      {/* Provisionnement commercial (vente accompagnée) : ESN + propriétaire +
          équipe + plan + quota, facturé sur facture, sans Stripe. */}
      <CreateClientForm />

      <SubTabs
        tabs={[
          {
            label: `Utilisateurs${overview ? ` (${overview.totalUsers})` : ''}`,
            href: '/users',
            active: false,
          },
          {
            label: `ESN${overview ? ` (${overview.totalWorkspaces})` : ''}`,
            href: '/clients?view=esn',
            active: view === 'esn',
          },
        ]}
      />

      <EsnDirectory search={search} />
      <TeamsPanel days={days} />
    </main>
  )
}
