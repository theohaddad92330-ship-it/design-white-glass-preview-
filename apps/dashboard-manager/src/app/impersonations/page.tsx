import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { KpiTile } from '@/ui'
import { dateEtHeure } from '@/lib/dates'
import { fetchImpersonations, type SessionImpersonation } from '@/lib/impersonations'
import { operateurDepuisJeton } from '@/lib/guard'
import { peut } from '@/lib/roles'
import { listeDacces } from '@/lib/roles-env'
import { COOKIE_SESSION } from '@/lib/session'
import { ImpersonationsTable } from './_components/impersonations-table'
import { resumeParStatut } from './impersonations.logic'

export const dynamic = 'force-dynamic'

/**
 * IMPERSONATIONS — #1665.2 : « aucun GET n'expose les sessions
 * d'impersonation ». `impersonation-admin.controller.ts` n'avait qu'un POST
 * (démarrer) ; le journal d'audit existait déjà (`ImpersonationAuditEntity`,
 * append-only depuis #1670) mais personne ne le lisait sous cette forme.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CET ÉCRAN NE REFAIT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * La jointure `start`/`stop` PAR `jti` (Qui · Espace · Début · Durée · Motif)
 * est faite côté API (`joinImpersonationSessions`, pure, testée sans base) —
 * ce fichier lit et affiche, il ne recalcule rien (GA-26).
 *
 * Rôle exigé : `audit.read` (plancher `operator`) — la même donnée que le
 * journal d'audit et l'écran sécurité (des opérateurs, leurs gestes sur les
 * comptes clients), la même porte.
 */
export default async function ImpersonationsPage() {
  if (listeDacces().etat === 'active') {
    const operateur = await operateurDepuisJeton((await cookies()).get(COOKIE_SESSION)?.value)
    if (!operateur || !peut(operateur.role, 'audit.read')) redirect('/acces-refuse')
  }

  let sessions: SessionImpersonation[] | null = null
  let panne: string | null = null
  try {
    sessions = await fetchImpersonations()
  } catch (err) {
    panne = err instanceof Error ? err.message : String(err)
  }

  if (!sessions) {
    return (
      <main className="wrap">
        <h1>Impersonations</h1>
        <p className="subtitle">Qui a incarné quel client, depuis quand, combien de temps, et pourquoi.</p>
        <div className="error" style={{ margin: '16px 0' }}>
          Sessions d’impersonation indisponibles — l’API n’a pas répondu. {panne}
        </div>
      </main>
    )
  }

  const resume = resumeParStatut(sessions)

  return (
    <main className="wrap">
      <h1>Impersonations</h1>
      <p className="subtitle">
        Qui a incarné quel client, depuis quand, combien de temps, et pourquoi — lecture seule, jointe depuis le journal
        d’audit d’impersonation.
      </p>

      <section className="kpi-grid">
        <KpiTile label="Sessions listées" value={sessions.length} />
        <KpiTile label="En cours" value={resume.ongoing} />
        <KpiTile label="Terminées" value={resume.ended} />
        <KpiTile label="Expirées sans arrêt" value={resume.expired_sans_arret} />
      </section>

      <section style={{ margin: '20px 0' }}>
        <ImpersonationsTable sessions={sessions} />
      </section>

      <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
        Mesuré le {dateEtHeure(new Date().toISOString())}.
      </p>
    </main>
  )
}
