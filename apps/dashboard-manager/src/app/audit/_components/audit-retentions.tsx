import type { FenetreRetention } from '@/lib/journal-audit'
import { jour } from '@/lib/dates'
import { libelleCategorie, libelleRetention } from '../audit.logic'

/**
 * LES RÉTENTIONS — telles qu'elles sont APPLIQUÉES, pas telles qu'on les
 * raconte (#1666).
 *
 * ⚠️ CES CINQ LIGNES VIENNENT DU SERVEUR, calculées par le MÊME code que la
 * purge (`audit-retention.ts`). Les recopier ici aurait produit le défaut
 * classique : un écran qui annonce « 36 mois » pendant qu'un passage nocturne
 * en applique 24, et personne pour s'en apercevoir avant que les lignes
 * manquent.
 *
 * ⚠️ « permanent » se DIT, et la colonne « purgé avant le » reste vide pour
 * cette ligne-là — pas « — » en petit, mais la phrase entière : rien n'est
 * jamais effacé. Une case vide se lirait comme une donnée manquante.
 */
export function AuditRetentions({ fenetres }: { fenetres: FenetreRetention[] }) {
  return (
    <section className="card" style={{ margin: '0 0 20px', padding: 16 }}>
      <h2 style={{ margin: '0 0 4px', fontSize: 16 }}>Rétentions appliquées</h2>
      <p className="muted" style={{ margin: '0 0 12px' }}>
        Un passage quotidien efface ce qui a dépassé la fenêtre de sa catégorie, et inscrit au journal ce qu’il a effacé
        — un journal qui rétrécit sans le dire serait indiscernable d’un journal qu’on a nettoyé.
      </p>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', padding: '6px 8px' }}>Catégorie</th>
            <th style={{ textAlign: 'left', padding: '6px 8px' }}>Conservation</th>
            <th style={{ textAlign: 'left', padding: '6px 8px' }}>Effacé avant le</th>
          </tr>
        </thead>
        <tbody>
          {fenetres.map(fenetre => (
            <tr key={fenetre.category}>
              <td style={{ padding: '6px 8px' }}>{libelleCategorie(fenetre.category)}</td>
              <td style={{ padding: '6px 8px' }}>{libelleRetention(fenetre.months)}</td>
              <td className="muted" style={{ padding: '6px 8px' }}>
                {fenetre.cutoff === null ? 'rien n’est jamais effacé' : jour(fenetre.cutoff)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
