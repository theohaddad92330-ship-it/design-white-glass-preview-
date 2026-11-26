import { EmailEnClair } from '@/app/_components/email-en-clair'
import { dateEtHeure } from '@/lib/dates'
import type { LigneAudit } from '@/lib/journal-audit'
import { libelleCategorie, libelleResultat, origineLisible, sujetLisible } from '../audit.logic'

/**
 * LE JOURNAL, LIGNE À LIGNE — les six colonnes de #1666.
 *
 *   Qui · Quoi · Sur quoi · Quand · Depuis où · Résultat
 *
 * ⚠️ L'ADRESSE DE L'OPÉRATEUR PASSE PAR `<EmailEnClair>`, et pas dans un `<a>`.
 * Un journal d'audit est une base de données PERSONNELLES : il nomme des
 * opérateurs. La règle de #1670.4 vaut ici plus qu'ailleurs — cet écran se
 * partage en capture d'écran plus souvent que les autres, parce qu'il sert à
 * expliquer ce qui s'est passé. L'adresse s'y lit en clair (c87) ; elle porte son propre `mailto:`, donc jamais dans un autre lien.
 *
 * ⚠️ AUCUNE CHARGE UTILE N'EST RENDUE. La colonne « Détail » affiche la note
 * courte écrite par l'appelant, jamais un corps de requête — qui porterait un
 * jour un jeton. La règle vit d'abord dans le contrat (`detail` est borné à 500
 * caractères et documenté comme une note), et cet écran ne la contourne pas.
 *
 * ⚠️ AUCUNE ACTION SUR UNE LIGNE. Pas de bouton « supprimer », pas de menu :
 * l'écran est en lecture seule, et il l'est parce que la route qui
 * supprimerait répond 405 — on retire le MOYEN, pas seulement le bouton.
 *
 * Le tableau défile dans SON conteneur — `.wrap` porte `overflow-x: auto`, donc
 * le corps de la page ne bouge jamais.
 */
export function AuditTable({ lignes }: { lignes: LigneAudit[] }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
      <thead>
        <tr>
          <th style={ENTETE}>Quand</th>
          <th style={ENTETE}>Qui</th>
          <th style={ENTETE}>Quoi</th>
          <th style={ENTETE}>Sur quoi</th>
          <th style={ENTETE}>Depuis où</th>
          <th style={ENTETE}>Résultat</th>
        </tr>
      </thead>
      <tbody>
        {lignes.map(ligne => (
          <tr key={ligne.id} style={{ borderTop: '1px solid var(--border)' }}>
            <td style={CELLULE} className="mono">
              {dateEtHeure(ligne.created_at)}
            </td>
            <td style={CELLULE}>
              {/* Pas de <a> autour : l’adresse porte déjà son propre `mailto:` (un lien dans un lien est invalide). */}
              <EmailEnClair email={ligne.actor_email} />
              {ligne.actor_role ? <span className="muted"> · {ligne.actor_role}</span> : null}
            </td>
            <td style={CELLULE}>
              <span className="mono">{ligne.operation}</span>
              <div className="muted">{libelleCategorie(ligne.category)}</div>
            </td>
            <td style={CELLULE}>
              {sujetLisible(ligne)}
              {ligne.detail ? (
                <div className="muted" style={{ maxWidth: '48ch' }}>
                  {ligne.detail}
                </div>
              ) : null}
            </td>
            <td style={CELLULE} className="muted">
              {origineLisible(ligne)}
            </td>
            <td style={CELLULE}>
              <span style={{ color: COULEUR_RESULTAT[ligne.outcome] }}>{libelleResultat(ligne.outcome)}</span>
              {ligne.status_code === null ? null : <span className="muted"> · {ligne.status_code}</span>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

const ENTETE = { textAlign: 'left', padding: '6px 8px', whiteSpace: 'nowrap' } as const
const CELLULE = { padding: '8px', verticalAlign: 'top' } as const

/**
 * ⚠️ Des TOKENS, jamais un hexadécimal : une couleur écrite en dur ne suivrait
 * pas le thème. Et le refus n'est PAS peint comme une panne — un 403 est le
 * produit qui fonctionne.
 */
const COULEUR_RESULTAT = {
  succes: 'var(--green)',
  refus: 'var(--amber)',
  echec: 'var(--red)',
} as const
