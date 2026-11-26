import { EmailEnClair } from '@/app/_components/email-en-clair'
import { dateEtHeure } from '@/lib/dates'
import { journaliserAccesDepuisComposant } from '@/lib/journal-audit'
import { Card, CardHeader, EmptyState } from '@/ui'
import { fetchRexEntries, type LigneRex } from './rex-diagnostic.client'
import { AUCUN_AUTEUR, marqueurDoublon, nomAuteur } from './rex-diagnostic.logic'

export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * #3544.4 — LE DIAGNOSTIC DES REX : qui a saisi quoi, quand, et quels retours
 * portent le même texte. Né de REX dupliqués vus en production : la lecture
 * dit si ce sont des saisies de l'application (un auteur) ou des insertions
 * hors application (aucun auteur), sans toucher une ligne.
 *
 * Lecture seule et journalisée (comme le replay d'un tour). Le texte du REX
 * n'est pas rendu : seul son EMPREINTE sert au marqueur « identique ».
 */
export default async function RexDiagnosticPage(props: { searchParams?: Promise<{ workspaceId?: string }> }) {
  const searchParams = await props.searchParams
  const workspaceId =
    searchParams?.workspaceId && UUID.test(searchParams.workspaceId) ? searchParams.workspaceId : undefined

  let lignes: LigneRex[] = []
  let erreur: string | null = null
  try {
    lignes = await fetchRexEntries(workspaceId)
    void journaliserAccesDepuisComposant({
      operation: 'capitalisation.rex_diagnostic_read',
      category: 'ordinaire',
      outcome: 'succes',
      subjectType: 'rex_entries',
      subjectId: workspaceId ?? 'tous',
    })
  } catch (e) {
    erreur = e instanceof Error ? e.message : 'Erreur inconnue'
  }

  return (
    <main className="wrap">
      <h1>REX — diagnostic</h1>
      <p className="subtitle">
        Les retours d’expérience saisis par espace : leur mission, leur date, leur auteur, et ceux dont le texte est
        identique à d’autres — pour distinguer une saisie de l’application d’une insertion hors application.
      </p>

      <form method="get" style={{ margin: '12px 0', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <label htmlFor="workspaceId">Espace (identifiant)</label>
        <input
          id="workspaceId"
          name="workspaceId"
          defaultValue={workspaceId ?? ''}
          placeholder="uuid de l’espace"
          size={40}
        />
        <button type="submit">Filtrer</button>
        {workspaceId ? (
          <a className="link" href="/produit/rex">
            Effacer
          </a>
        ) : null}
      </form>

      {erreur ? (
        <Card>
          <EmptyState icon="!" message={`REX indisponibles. ${erreur}`} />
        </Card>
      ) : (
        <Card>
          <CardHeader title="REX" />
          {lignes.length === 0 ? (
            <EmptyState message="Aucun REX pour ce filtre." />
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>Mission</th>
                    <th>Collecté le</th>
                    <th>Collecté par</th>
                    <th>Texte</th>
                  </tr>
                </thead>
                <tbody>
                  {lignes.map(l => {
                    const marqueur = marqueurDoublon(l.identicalTextCount)
                    const nom = nomAuteur(l.collectedBy)
                    return (
                      <tr key={l.id}>
                        <td>{l.missionLabel ?? l.missionId}</td>
                        <td>{dateEtHeure(l.collectedAt)}</td>
                        <td>
                          {l.collectedBy ? (
                            <>
                              {nom ?? '—'} <EmailEnClair email={l.collectedBy.email} />
                            </>
                          ) : (
                            <span className="muted">{AUCUN_AUTEUR}</span>
                          )}
                        </td>
                        <td>{marqueur ?? <span className="muted">—</span>}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </main>
  )
}
