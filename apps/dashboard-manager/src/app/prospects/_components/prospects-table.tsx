import { EmailEnClair } from '@/app/_components/email-en-clair'
import { dateEtHeure } from '@/lib/dates'
import type { DemoLead } from '@/lib/demo-leads'
import { partsSourceUtm, STATUT_PROSPECT_DEMO } from '../prospects.logic'

/**
 * #2706.2 — identité · statut · dates · source/UTM, une ligne par prospect.
 *
 * ⚠️ `<EmailEnClair>`, jamais l'adresse en clair : #1670.4 masque par défaut
 * toute adresse rendue dans une LISTE, révélée au clic, le clic journalisé.
 *
 * ⚠️ Téléphone et UTM : « on n'affiche pas ce qu'on n'a pas » (doctrine, Louis
 * 20/09/2026) — un champ absent ne rend aucune ligne, jamais un « — ».
 */
export function ProspectsTable({ leads }: { leads: DemoLead[] }) {
  if (leads.length === 0) {
    return (
      <p className="empty" style={{ margin: '16px 0' }}>
        Aucun prospect n’a encore lancé la démo.
      </p>
    )
  }

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
      <thead>
        <tr>
          <th style={ENTETE}>Identité</th>
          <th style={ENTETE}>Statut</th>
          <th style={ENTETE}>Premier accès</th>
          <th style={ENTETE}>Dernier accès</th>
          <th style={ENTETE}>Accès</th>
          <th style={ENTETE}>Source · UTM</th>
        </tr>
      </thead>
      <tbody>
        {leads.map(lead => (
          <tr key={lead.id} style={{ borderTop: '1px solid var(--border)' }}>
            <td style={CELLULE}>
              <div>
                {lead.firstName} {lead.lastName}
              </div>
              <div className="muted">
                {lead.jobTitle} · {lead.company}
              </div>
              <div className="mono">
                <EmailEnClair email={lead.email} />
              </div>
              {/* Téléphone absent ⇒ AUCUNE ligne (doctrine, jamais un « — »). */}
              {lead.phone ? <div className="mono">{lead.phone}</div> : null}
            </td>
            <td style={CELLULE}>{STATUT_PROSPECT_DEMO}</td>
            <td style={CELLULE} className="mono">
              {dateEtHeure(lead.firstAccessAt)}
            </td>
            <td style={CELLULE} className="mono">
              {dateEtHeure(lead.lastAccessAt)}
            </td>
            <td style={CELLULE} className="mono">
              {lead.accessCount}
            </td>
            <td style={CELLULE} className="muted">
              {partsSourceUtm(lead)
                .map(part => `${part.label} : ${part.value}`)
                .join(' · ')}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

const ENTETE = { textAlign: 'left', padding: '6px 8px', whiteSpace: 'nowrap' } as const
const CELLULE = { padding: '8px', verticalAlign: 'top' } as const
