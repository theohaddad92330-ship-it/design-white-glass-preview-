import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { dateEtHeure } from '@/lib/dates'
import { fetchDemoLeads, type DemoLead } from '@/lib/demo-leads'
import { operateurDepuisJeton } from '@/lib/guard'
import { peut } from '@/lib/roles'
import { listeDacces } from '@/lib/roles-env'
import { COOKIE_SESSION } from '@/lib/session'
import { ProspectsTable } from './_components/prospects-table'

export const dynamic = 'force-dynamic'

/**
 * PROSPECTS — #2706 : Théo (CEO, 22/09/2026) « pouvoir lire, trier et
 * recontacter les prospects qui ont ouvert la démo — sans ouvrir la base à
 * la main. »
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CET ÉCRAN NE REFAIT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Le tri (plus récent d'abord) et le dédoublonnage par e-mail sont faits côté
 * API (`DemoLeadService.listMostRecentFirst`, #2705) — ce fichier lit et
 * affiche, il ne recalcule rien (GA-26).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI ICI, ET PAS DANS L'APPLICATION CLIENTE
 * ─────────────────────────────────────────────────────────────────────────────
 * Un prospect ne porte AUCUN `workspace_id` : l'exposer dans l'application
 * obligerait à le rattacher à un espace, ce que le cloisonnement interdit. Le
 * back-office est l'espace d'exploitation interne — déjà protégé par
 * `DM_ALLOWED_EMAILS` — à côté de `clients`, `usage`, `feedback` (décision
 * Louis, 22/09/2026).
 *
 * Rôle exigé : `leads.read` (plancher `viewer`) — même plancher que
 * `feedback.read`, une lecture qui expose des PII de contact sans aucune
 * action sur un client.
 */
export default async function ProspectsPage() {
  if (listeDacces().etat === 'active') {
    const operateur = await operateurDepuisJeton((await cookies()).get(COOKIE_SESSION)?.value)
    if (!operateur || !peut(operateur.role, 'leads.read')) redirect('/acces-refuse')
  }

  let leads: DemoLead[] | null = null
  let panne: string | null = null
  try {
    leads = await fetchDemoLeads()
  } catch (err) {
    panne = err instanceof Error ? err.message : String(err)
  }

  if (!leads) {
    return (
      <main className="wrap">
        <h1>Prospects</h1>
        <p className="subtitle">Qui a lancé la démo, depuis quand, et par quel canal — lecture seule.</p>
        <div className="error" style={{ margin: '16px 0' }}>
          Prospects indisponibles — l’API n’a pas répondu. {panne}
        </div>
      </main>
    )
  }

  return (
    <main className="wrap">
      <h1>Prospects</h1>
      <p className="subtitle">
        Les personnes qui ont lancé la démo depuis le formulaire d’accès, plus récente d’abord — pour les lire, les
        trier et les recontacter sans ouvrir la base à la main.
      </p>

      {/* #4387 — export CSV (Louis 20/10/2026), toutes les lignes ; le fichier vient de la route, pas d'un blob. */}
      {leads.length > 0 ? (
        <p style={{ margin: '12px 0' }}>
          <a className="btn" href="/api/admin/prospects/export">
            Exporter (CSV) — {leads.length} ligne{leads.length > 1 ? 's' : ''}
          </a>
        </p>
      ) : null}

      <section style={{ margin: '20px 0' }}>
        <ProspectsTable leads={leads} />
      </section>

      <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
        Mesuré le {dateEtHeure(new Date().toISOString())}.
      </p>
    </main>
  )
}
