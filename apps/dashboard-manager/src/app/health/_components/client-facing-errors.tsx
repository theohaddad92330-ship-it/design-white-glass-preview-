import { dateEtHeure } from '@/lib/dates'
import type { ClientFacingErrorReport, ClientFacingErrorsUnavailable } from '@/lib/operator-health'

/**
 * #1660 — « ce qui casse, vu du client — pas vu du serveur ».
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA RÈGLE, ET CE QU'ELLE ÉCARTE
 * ─────────────────────────────────────────────────────────────────────────────
 * « Une erreur de CAPACITÉ (connecteur absent) n'est PAS un incident. Elle est
 * attendue et gérée. Les compter ensemble noierait les vrais. » La décision se
 * prend côté API, sur le vocabulaire FERMÉ des cinq codes d'erreur de
 * connecteur (`client-facing-errors.ts`) — pas ici, et surtout pas deux fois.
 *
 * Le nombre d'exclusions est AFFICHÉ : un tableau qui tait son filtre se lit
 * comme un tableau complet, et le premier lecteur qui le compare à l'écran des
 * intégrations conclura qu'il ment.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ CE QUE CE TABLEAU NE VOIT PAS — ET C'EST ÉCRIT À L'ÉCRAN
 * ─────────────────────────────────────────────────────────────────────────────
 * Un écran qui tait ses angles morts ment par omission. Les trois sont donc
 * rendus, en toutes lettres, sous le tableau.
 */

/**
 * Le vocabulaire fermé des causes, traduit ici et jamais réécrit côté API.
 *
 * Exporté depuis #2445.12 : `IncidentTimelinePanel` (chronologie de
 * transitions) partage le MÊME vocabulaire de causes — GA-26, un réglage vit à
 * un seul endroit, jamais recopié.
 */
export const CAUSE: Record<string, string> = {
  provider_unavailable: 'l’outil n’a pas répondu',
  rate_limited: 'trop de demandes d’un coup',
}

/**
 * Le VERBE de capacité, en français. Ce que le client essayait de faire.
 *
 * ⚠️ On nomme la CAPACITÉ, jamais l'éditeur — c'est la règle produit du 02/08,
 * et la source porte pourtant le nom du fournisseur. Il ne traverse pas cet
 * écran : « la lecture casse chez 4 espaces » est actionnable ; « Google casse »
 * ne l'est pas plus et nomme un tiers.
 *
 * Exporté depuis #2445.12 — même raison que `CAUSE` ci-dessus.
 */
export const VERBE: Record<string, string> = {
  read: 'Lire',
  search: 'Chercher',
  summarize: 'Résumer',
  prepare: 'Préparer',
  create: 'Créer',
  update: 'Mettre à jour',
  send: 'Envoyer',
  delete: 'Supprimer',
  schedule: 'Planifier',
  webhook: 'Recevoir un événement',
}

export function ClientFacingErrorsPanel({
  report,
}: {
  report: ClientFacingErrorReport | ClientFacingErrorsUnavailable
}) {
  if ('status' in report) {
    // Supervision 30/09 : lecture impossible ≠ « aucun incident ».
    return (
      <section style={{ marginTop: 28 }}>
        <h2 style={{ fontSize: 16, margin: '4px 0 6px' }}>Ce qui casse, vu du client</h2>
        <p className="muted">
          Lecture impossible — le journal des erreurs client n&apos;a pas pu être lu. Ce n&apos;est pas « aucune erreur
          ».
        </p>
      </section>
    )
  }
  return (
    <section style={{ marginTop: 28 }}>
      <h2 style={{ fontSize: 16, margin: '4px 0 6px' }}>Ce qui casse, vu du client</h2>
      <p className="subtitle" style={{ marginBottom: 12 }}>
        Les échecs que les utilisateurs constatent sur leurs outils branchés, sur {report.windowDays} jours. Une erreur
        de <strong>capacité</strong> — outil non connecté, portée non accordée, API éteinte côté fournisseur — n&apos;y
        figure pas : elle est attendue et gérée, et la compter ici noierait les vraies pannes.
      </p>

      {report.errors.length === 0 ? (
        <p className="muted">
          Aucun incident enregistré sur la fenêtre. ⚠️ Ce n&apos;est pas la preuve que rien n&apos;a cassé : c&apos;est
          qu&apos;aucune vérification de connecteur n&apos;a échoué pour une raison autre qu&apos;une capacité absente.
        </p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Ce que le client essayait de faire</th>
                <th className="num">Espaces touchés</th>
                <th>Dernière occurrence</th>
                <th>Cause</th>
              </tr>
            </thead>
            <tbody>
              {report.errors.map(erreur => (
                <tr key={erreur.capability}>
                  <td>{VERBE[erreur.capability] ?? erreur.capability}</td>
                  <td className="num">{erreur.workspacesAffected}</td>
                  <td>{dateEtHeure(erreur.lastOccurredAt)}</td>
                  <td style={{ color: 'var(--muted)' }}>{erreur.codes.map(code => CAUSE[code] ?? code).join(' · ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="muted" style={{ fontSize: 12, marginTop: 12 }}>
        {report.capacityErrorsExcluded} erreur(s) de capacité écartée(s) sur la fenêtre — attendues, et visibles sur
        l&apos;écran des intégrations de chaque espace.
      </p>

      <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
        <strong>Ce que ce tableau ne voit pas</strong>, et il faut le savoir avant de le lire comme un état des lieux
        complet : (1) les erreurs JavaScript du navigateur — la remontée d&apos;erreurs est branchée en ÉCRITURE dans
        les trois services et n&apos;a aucun lecteur côté back-office, il faudrait un identifiant qu&apos;on n&apos;a
        pas ; (2) le NOMBRE d&apos;occurrences — la source ne conserve que la DERNIÈRE erreur par espace et par outil,
        donc on publie un nombre d&apos;espaces touchés, qui est un fait, plutôt qu&apos;un nombre d&apos;erreurs deviné
        ; (3) les erreurs serveur par écran, qui sont journalisées mais jamais conservées en base.
      </p>
    </section>
  )
}
