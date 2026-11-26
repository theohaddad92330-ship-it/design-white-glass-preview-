import { CHAT_TURNS_PAGE_SIZE, fetchChatTurns, type ChatTurnSummary } from '@/lib/chat-turn'
import { dateEtHeure } from '@/lib/dates'
import { journaliserAccesDepuisComposant } from '@/lib/journal-audit'
import { Card, CardHeader, EmptyState } from '@/ui'

export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function lien(workspaceId: string | undefined, offset: number): string {
  const p = new URLSearchParams()
  if (workspaceId) p.set('workspaceId', workspaceId)
  if (offset > 0) p.set('offset', String(offset))
  const qs = p.toString()
  return qs ? `/produit/laura-tours?${qs}` : '/produit/laura-tours'
}

/**
 * #3391 — LES DERNIERS TOURS DE LAURA : le point d'entrée du replay
 * (`/chat-turn/<id>`), sans avoir à connaître l'identifiant d'un tour.
 *
 * ⚠️ AUCUN CORPS DE MESSAGE ici : l'API ne le rend pas dans la liste. Date,
 * espace, compte des messages du tour et outils appelés ; le texte ne se lit que dans le
 * replay, dont chaque ouverture est journalisée. Le filtre « espace » est un
 * outil de support (retrouver le tour d'un client), pas une mesure de
 * comportement : la page ne chiffre rien.
 */
export default async function LauraToursPage(props: {
  searchParams?: Promise<{ workspaceId?: string; offset?: string }>
}) {
  const searchParams = await props.searchParams
  const workspaceId =
    searchParams?.workspaceId && UUID.test(searchParams.workspaceId) ? searchParams.workspaceId : undefined
  const offset = Math.max(Number.parseInt(searchParams?.offset ?? '0', 10) || 0, 0)

  let tours: ChatTurnSummary[] = []
  let erreur: string | null = null
  try {
    tours = await fetchChatTurns({ workspaceId, offset })
    // #3391 — comme le replay (`chat.turn_replay_read`) : lecture cross-tenant
    // journalisée, au mieux, jamais bloquante.
    void journaliserAccesDepuisComposant({
      operation: 'chat.turns_list_read',
      category: 'ordinaire',
      outcome: 'succes',
      subjectType: 'chat_turn',
      subjectId: workspaceId ?? 'tous',
    })
  } catch (e) {
    erreur = e instanceof Error ? e.message : 'Erreur inconnue'
  }

  return (
    <main className="wrap">
      <h1>Laura — derniers tours</h1>
      <p className="subtitle">
        Les tours de conversation les plus récents, pour retrouver celui d’un client et ouvrir son replay en lecture
        seule : les outils appelés, jamais le texte dans cette liste.
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
          <a className="link" href="/produit/laura-tours">
            Effacer
          </a>
        ) : null}
      </form>

      {erreur ? (
        <Card>
          <EmptyState icon="!" message={`Tours indisponibles. ${erreur}`} />
        </Card>
      ) : (
        <Card>
          <CardHeader title="Tours" />
          {tours.length === 0 ? (
            <EmptyState message="Aucun tour pour ce filtre." />
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Espace</th>
                    <th>Messages</th>
                    <th>Outils appelés</th>
                    <th>Replay</th>
                  </tr>
                </thead>
                <tbody>
                  {tours.map(t => (
                    <tr key={t.turnId}>
                      <td>{dateEtHeure(t.startedAt)}</td>
                      <td>{t.workspaceName ?? t.workspaceId ?? '—'}</td>
                      <td>{t.messageCount}</td>
                      <td className="mono">{t.toolsCalled.length ? t.toolsCalled.join(', ') : '—'}</td>
                      <td>
                        <a className="link" href={`/chat-turn/${t.turnId}`}>
                          Ouvrir le tour
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p style={{ marginTop: 12, display: 'flex', gap: 16 }}>
            {offset > 0 ? (
              <a className="link" href={lien(workspaceId, Math.max(offset - CHAT_TURNS_PAGE_SIZE, 0))}>
                ← Plus récents
              </a>
            ) : null}
            {tours.length === CHAT_TURNS_PAGE_SIZE ? (
              <a className="link" href={lien(workspaceId, offset + CHAT_TURNS_PAGE_SIZE)}>
                Plus anciens →
              </a>
            ) : null}
          </p>
        </Card>
      )}
    </main>
  )
}
