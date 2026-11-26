import { EmailEnClair } from '@/app/_components/email-en-clair'
import { dateEtHeure, dureeEcoulee } from '@/lib/dates'
import type { SessionImpersonation } from '@/lib/impersonations'
import { couleurStatutSession, finDeSession, libelleStatutSession, peutTerminer } from '../impersonations.logic'
import { TerminerSession } from './terminer-session'

/**
 * #1665.2 — Qui · Espace · Début · Durée · Motif, une ligne par session.
 *
 * ⚠️ `<EmailEnClair>`, jamais un `<a>` autour — le lien avalerait le clic de
 * révélation (même piège que `SecuriteConnexions`, mesuré en production le
 * 06/09/2026).
 */
export function ImpersonationsTable({ sessions }: { sessions: SessionImpersonation[] }) {
  if (sessions.length === 0) {
    return (
      <p className="empty" style={{ margin: '16px 0' }}>
        Aucune session d’impersonation enregistrée.
      </p>
    )
  }

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
      <thead>
        <tr>
          <th style={ENTETE}>Qui</th>
          <th style={ENTETE}>Compte incarné</th>
          <th style={ENTETE}>Début</th>
          <th style={ENTETE}>Durée</th>
          <th style={ENTETE}>Statut</th>
          <th style={ENTETE}>Motif</th>
        </tr>
      </thead>
      <tbody>
        {sessions.map(session => (
          <tr key={session.jti} style={{ borderTop: '1px solid var(--border)' }}>
            <td style={CELLULE} className="mono">
              {session.actor}
            </td>
            <td style={CELLULE}>
              {/* PAS de lien autour de l’adresse : voir le docblock du composant. */}
              <EmailEnClair email={session.targetEmail} />
            </td>
            <td style={CELLULE} className="mono">
              {dateEtHeure(session.startedAt)}
            </td>
            <td style={CELLULE} className="mono">
              {session.durationSeconds !== null ? dureeEcoulee(session.durationSeconds * 1000) : '—'}
            </td>
            <td style={CELLULE}>
              <span style={{ color: couleurStatutSession(session.status) }}>
                {libelleStatutSession(session.status)}
              </span>
              {/* LUDOVIC-D LC.10 — l'audit se lit : date de fin + qui a terminé. */}
              {session.endedAt ? (
                <div className="muted mono" style={{ fontSize: 12 }}>
                  {dateEtHeure(session.endedAt)}
                  {finDeSession(session) ? ` · ${finDeSession(session)}` : ''}
                </div>
              ) : null}
              {peutTerminer(session.status) ? <TerminerSession jti={session.jti} /> : null}
            </td>
            <td style={CELLULE} className="muted">
              {session.reason}
              {session.reasonDetail ? <div style={{ fontSize: 12 }}>{session.reasonDetail}</div> : null}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

const ENTETE = { textAlign: 'left', padding: '6px 8px', whiteSpace: 'nowrap' } as const
const CELLULE = { padding: '8px', verticalAlign: 'top' } as const
