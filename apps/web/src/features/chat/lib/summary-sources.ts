/**
 * #1955.29 — LES SOURCES PRINCIPALES d'un fil : celles que les réponses de
 * Laura citent le plus souvent (`context.sources`, déjà chargées avec le fil).
 *
 * Rien n'est deviné : une source n'apparaît que si une réponse la cite, et une
 * réponse sans panneau de sources (message d'avant la colonne, #1914.14) ne
 * compte pour rien. Triées par nombre de réponses qui la citent, puis dans
 * l'ordre de première apparition ; bornées à `limit`.
 */
import { stripMarkdownEmphasis } from '@/lib/strip-markdown-emphasis'

type SourcedMessage = {
  role: 'user' | 'assistant'
  context?: { sources?: ReadonlyArray<{ kind: string; label: string }> } | null
}

export function mainThreadSources(
  messages: readonly SourcedMessage[],
  limit = 5,
): { kind: string; label: string; replies: number }[] {
  const counts = new Map<string, { kind: string; label: string; replies: number; first: number }>()
  messages.forEach((message, index) => {
    if (message.role !== 'assistant') return
    // Une réponse qui cite deux fois la même source ne compte qu'une fois.
    const seen = new Set<string>()
    for (const source of message.context?.sources ?? []) {
      // #3382 (recette prod 26755bbac3, lot C1, 30/09) — cette ligne de résumé
      // affiche le libellé en texte brut, jamais passé par le moteur
      // markdown : une syntaxe encore présente (`**gras**`) ne doit pas y
      // apparaître telle quelle.
      const label = stripMarkdownEmphasis(source.label.trim())
      if (!label) continue
      const key = `${source.kind}\u0000${label}`
      if (seen.has(key)) continue
      seen.add(key)
      const entry = counts.get(key)
      if (entry) entry.replies += 1
      else counts.set(key, { kind: source.kind, label, replies: 1, first: index })
    }
  })
  return [...counts.values()]
    .sort((a, b) => b.replies - a.replies || a.first - b.first)
    .slice(0, limit)
    .map(({ kind, label, replies }) => ({ kind, label, replies }))
}
