import { EmailEnClair } from '@/app/_components/email-en-clair'
import { dateEtHeure } from '@/lib/dates'
import type { Anomalie } from '@/lib/etat-securite'
import { couleurAnomalie, libelleTypeAnomalie } from '../securite.logic'

/**
 * LES ANOMALIES — l'AFFICHAGE de la détection d'accès anormal (#1671.3).
 *
 * ⚠️ #1655 — CE PARAGRAPHE ÉTAIT PÉRIMÉ. Ce composant montre ce que l'API a
 * détecté, et lui-même n'envoie rien : c'est encore vrai. Mais il annonçait un
 * « arrêt volontaire » sur l'envoi, levé le 08/09/2026 — l'alerte part par
 * e-mail aux propriétaires depuis le dispatcheur côté API (au plus une fois
 * par heure pour un même sujet). Un commentaire qui décrit une règle abrogée
 * se relit comme la règle en vigueur, et c'est sur cette lecture que le lot
 * suivant décide. Voir `BackofficeAccessJournalService.etatSecurite()`.
 *
 * ⚠️ « NON MESURÉ » N'EST JAMAIS « 0 ANOMALIE ». Une fenêtre sans aucun
 * événement (`mesure: false`) ne dessine PAS cette liste : `page.tsx` affiche
 * la phrase « non mesuré » à sa place. Ce composant ne reçoit donc que des
 * fenêtres où au moins un événement existe — zéro anomalie DANS ce cas est un
 * vrai zéro, mesuré, pas deviné.
 *
 * ⚠️ L'ADRESSE PASSE PAR `<EmailEnClair>`. Une anomalie nomme un opérateur ;
 * c'est exactement la même donnée personnelle que le journal d'audit, avec la
 * même règle (#1670.4).
 */
export function SecuriteAnomalies({ anomalies }: { anomalies: Anomalie[] }) {
  if (anomalies.length === 0) {
    return (
      <p className="empty" style={{ margin: '16px 0' }}>
        Aucune anomalie détectée sur cette fenêtre : ni rafale d’échecs, ni pays jamais vu, ni connexion à une heure
        inhabituelle.
      </p>
    )
  }

  return (
    <ul style={{ listStyle: 'none', margin: '16px 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {anomalies.map((anomalie, index) => (
        <li
          // ⚠️ La clé ne porte PAS l'adresse de l'acteur : une interpolation
          // dans un littéral de gabarit ressemble, pour une lecture par
          // expression régulière, à une adresse rendue en JSX — c'est le
          // garde-fou d'emails-masques-dans-les-listes.test.ts. L'index suffit
          // à distinguer deux anomalies du même type au même instant, et la
          // clé n'est de toute façon jamais AFFICHÉE.
          key={`${anomalie.type}-${anomalie.at}-${index}`}
          className="card"
          style={{ padding: 12, borderLeft: `3px solid ${couleurAnomalie(anomalie.type)}` }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ color: couleurAnomalie(anomalie.type), fontWeight: 600 }}>
              {libelleTypeAnomalie(anomalie.type)}
            </span>
            <span className="muted mono">{dateEtHeure(anomalie.at)}</span>
          </div>
          <div style={{ marginTop: 4 }}>
            <EmailEnClair email={anomalie.actorEmail} />
          </div>
          <p className="muted" style={{ margin: '4px 0 0' }}>
            {anomalie.detail}
          </p>
        </li>
      ))}
    </ul>
  )
}
