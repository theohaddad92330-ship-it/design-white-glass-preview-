import { EmailEnClair } from '@/app/_components/email-en-clair'
import { dateEtHeure } from '@/lib/dates'
import type { EntreeJournalAcces } from '@/lib/etat-securite'
import { libelleEvenement } from '../securite.logic'

/**
 * LES CONNEXIONS RÉCENTES — la même table que #1666 aurait pu montrer, mais sur
 * le journal d'ACCÈS (#1671.2), pas celui d'audit : « qui est entré », pas
 * « qu'a-t-il fait ».
 *
 * ⚠️ L'ADRESSE PASSE PAR `<EmailEnClair>`, en clair, jamais dans un `<a>` (elle porte
 * son propre `mailto:`).
 *
 * ⚠️ AUCUNE CHARGE UTILE. `detail` porte un diagnostic TECHNIQUE (code
 * Supabase) sur un refus — il est utile à un opérateur qui débogue une
 * connexion cassée, jamais rendu à l'écran de connexion lui-même (voir le
 * docblock de l'entité `BackofficeAccessEventEntity`).
 */
export function SecuriteConnexions({ entrees }: { entrees: EntreeJournalAcces[] }) {
  if (entrees.length === 0) {
    return (
      <p className="empty" style={{ margin: '16px 0' }}>
        Aucune connexion enregistrée sur cette fenêtre.
      </p>
    )
  }

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
      <thead>
        <tr>
          <th style={ENTETE}>Quand</th>
          <th style={ENTETE}>Qui</th>
          <th style={ENTETE}>Quoi</th>
          <th style={ENTETE}>Depuis où</th>
        </tr>
      </thead>
      <tbody>
        {entrees.map(entree => (
          <tr key={entree.id} style={{ borderTop: '1px solid var(--border)' }}>
            <td style={CELLULE} className="mono">
              {dateEtHeure(entree.created_at)}
            </td>
            <td style={CELLULE}>
              {/* Pas de <a> autour : l’adresse porte son propre `mailto:`. */}
              <EmailEnClair email={entree.actor_email} />
              {entree.actor_role ? <span className="muted"> · {entree.actor_role}</span> : null}
            </td>
            <td style={CELLULE}>
              {libelleEvenement(entree.event)}
              {entree.reason ? <div className="muted">{entree.reason}</div> : null}
            </td>
            <td style={CELLULE} className="muted">
              {[entree.ip, entree.country].filter(Boolean).join(' · ') || '—'}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

const ENTETE = { textAlign: 'left', padding: '6px 8px', whiteSpace: 'nowrap' } as const
const CELLULE = { padding: '8px', verticalAlign: 'top' } as const
