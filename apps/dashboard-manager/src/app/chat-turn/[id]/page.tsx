import { executionIdDuMessage, fetchChatTurnReplay, outilsDuMessage, type ToolCallView } from '@/lib/chat-turn'
import { journaliserAccesDepuisComposant } from '@/lib/journal-audit'

export const dynamic = 'force-dynamic'

/**
 * #3391 — les étapes de Laura sur ce message : l'outil, son mode (lecture /
 * écriture) et les CLÉS d'entrée posées (jamais les valeurs). Le nom est le nom
 * technique : la table des libellés vit côté moteur IA (`chat_step_labels.py`),
 * la recopier ici ferait deux sources. Un message d'avant `tools_detail` montre
 * ses noms d'outils et dit que le détail n'a pas été conservé.
 */
function OutilsAppeles({ outils }: { outils: ToolCallView[] }) {
  if (outils.length === 0) return null
  return (
    <ul className="muted" style={{ marginTop: 8, paddingLeft: 18, fontSize: '0.875rem' }}>
      {outils.map((o, i) => (
        <li key={`${o.tool}-${i}`}>
          <span className="mono">{o.tool}</span>
          {o.mode ? ` — ${o.mode === 'write' ? 'écriture' : 'lecture'}` : ' — détail non conservé'}
          {o.inputKeys ? ` — entrées : ${o.inputKeys.length ? o.inputKeys.join(', ') : 'aucune'}` : ''}
        </li>
      ))}
    </ul>
  )
}

/**
 * #2905 (#2442.16) — REPLAY EN LECTURE SEULE d'un tour de Laura.
 *
 * ⚠️ Ce n'est PAS un rejeu du pipeline (relancer le modèle et ses outils) :
 * voir le docblock de `InternalChatTurnController` côté API pour ce qui
 * manque pour ça, et pourquoi. Cet écran couvre le NO-GO nommé par #2442
 * pour le support (« l'équipe doit accéder manuellement... sans audit ») :
 * un accès JOURNALISÉ plutôt qu'un accès manuel non tracé — même précédent
 * que `analysis/[id]/page.tsx` pour #2442.19.
 */
export default async function ChatTurnReplayPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  let messages
  try {
    messages = await fetchChatTurnReplay(params.id)
  } catch (err) {
    return (
      <main className="wrap">
        <a className="link" href="/">
          ← retour
        </a>
        <div className="error" style={{ marginTop: 16 }}>
          Tour indisponible. {err instanceof Error ? err.message : String(err)}
        </div>
      </main>
    )
  }

  // #2905 (#2442.19, même porte) — cet écran rend le contenu d'un tour de
  // Laura, cross-tenant : la même règle que `analyses.raw_data_read`
  // s'applique — au mieux, jamais bloquante.
  void journaliserAccesDepuisComposant({
    operation: 'chat.turn_replay_read',
    category: 'ordinaire',
    outcome: 'succes',
    subjectType: 'chat_turn',
    subjectId: params.id,
  })

  return (
    <main className="wrap">
      <a className="link" href="/">
        ← retour
      </a>
      <h1 style={{ marginTop: 12 }}>Tour {params.id}</h1>
      <p className="subtitle">Lecture seule — aucun outil relancé, aucun crédit débité, aucun message renvoyé.</p>
      <ul style={{ marginTop: 16, listStyle: 'none', padding: 0 }}>
        {messages.map(message => (
          <li
            key={message.id}
            style={{ marginBottom: 12, padding: 12, border: '1px solid var(--border)', borderRadius: 8 }}
          >
            <div style={{ fontWeight: 600 }}>
              {message.role} — {message.createdAt}
            </div>
            <div style={{ marginTop: 4, whiteSpace: 'pre-wrap' }}>{message.content}</div>
            {message.role === 'assistant' ? <OutilsAppeles outils={outilsDuMessage(message.context)} /> : null}
            {message.role === 'assistant' && executionIdDuMessage(message.context) ? (
              <div className="muted mono" style={{ marginTop: 8, fontSize: '0.875rem' }}>
                Identifiant d’exécution : {executionIdDuMessage(message.context)}
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </main>
  )
}
