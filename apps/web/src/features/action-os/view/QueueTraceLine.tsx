import { Text } from '@bellum/ui'

/**
 * #2200.13 / #2200.14 / #2200.21 — LA ligne de traçabilité d'une carte « À valider » :
 * auteur · source · prochaine action. Une seule forme pour les approbations Action OS
 * et les messages de séquence (GA-26 : rien deux fois sous la même forme).
 *
 * Doctrine : une valeur inconnue ne fait AUCUNE ligne — ni vide, ni « 0 ». Tout inconnu
 * ⇒ le composant ne rend rien.
 */
export function QueueTraceLine({ parts }: { parts: readonly (string | null | undefined)[] }) {
  const known = parts.filter((part): part is string => Boolean(part))
  if (known.length === 0) return null
  return (
    <Text
      size="xs"
      color="text-[var(--bellum-text-muted)]"
      className="mt-1 flex flex-wrap items-center gap-1"
      data-testid="queue-trace-line"
    >
      {known.map((part, index) => (
        <span key={part} className="inline-flex items-center gap-1">
          {index > 0 ? <span aria-hidden="true">·</span> : null}
          {part}
        </span>
      ))}
    </Text>
  )
}
