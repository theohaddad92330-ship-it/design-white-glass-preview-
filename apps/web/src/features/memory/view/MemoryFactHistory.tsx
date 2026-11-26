import { useTranslation } from 'react-i18next'
import type { MemoryItemHistoryEntry } from '@bellum/contracts'
import { Text } from '@bellum/ui'
import { useFactHistory } from '@/features/memory/hooks/useMemoryLedger'
import { formatMemoryDate } from '@/features/memory/lib/memory-dates'

/**
 * #1916.23 — L'HISTOIRE D'UN ÉLÉMENT, de sa création au dernier geste.
 *
 * Chaque entrée dit QUOI, QUI et QUAND : « Texte modifié par Carol le 5 sept. ».
 * Un auteur inconnu (compte effacé, membre parti) n'est jamais remplacé par un
 * prénom deviné — la phrase se dit alors sans lui. Une lecture en échec se DIT :
 * un historique illisible n'est pas « rien n'a changé ».
 */
export function MemoryFactHistory({ id }: { id: string }) {
  const { t } = useTranslation('knowledge')
  const { data, isLoading, isError } = useFactHistory(id)

  if (isLoading) {
    return (
      <Text size="xs" color="text-[var(--bellum-text-muted)]" className="mt-2">
        {t('memoryLedger.history.loading')}
      </Text>
    )
  }
  if (isError || !data) {
    return (
      <Text size="xs" color="text-[var(--bellum-text-muted)]" className="mt-2">
        {t('memoryLedger.history.unavailable')}
      </Text>
    )
  }
  return (
    <ol className="mt-2 flex flex-col gap-1.5 border-l border-[var(--bellum-border)] pl-3">
      {data.entries.map((entry, index) => (
        <HistoryStep key={`${entry.event}-${entry.at}-${index}`} entry={entry} />
      ))}
    </ol>
  )
}

function HistoryStep({ entry }: { entry: MemoryItemHistoryEntry }) {
  const { t, i18n } = useTranslation('knowledge')
  const date = formatMemoryDate(entry.at, i18n.language) ?? entry.at
  const key = `memoryLedger.history.event.${entry.event}${entry.author ? '' : 'Unknown'}`
  const detail = stepDetail(entry, value => t(value), i18n.language)
  return (
    <li className="min-w-0">
      <Text size="xs" color="text-[var(--bellum-text-secondary)]">
        {t(key, { name: entry.author?.firstName ?? '', date })}
      </Text>
      {detail && (
        <Text size="xs" color="text-[var(--bellum-text-muted)]" className="break-words">
          {detail.kind === 'original'
            ? t('memoryLedger.history.original', { value: detail.after })
            : t('memoryLedger.history.change', { before: detail.before, after: detail.after })}
        </Text>
      )}
    </li>
  )
}

/**
 * Les valeurs d'une entrée, lisibles : un texte tel quel, une portée par son
 * libellé, une échéance par sa date (ou « sans échéance »). Une valeur qu'on ne
 * sait pas lire s'affiche brute — jamais un libellé inventé.
 */
function stepDetail(
  entry: MemoryItemHistoryEntry,
  translate: (key: string) => string,
  language: string,
): { kind: 'original' | 'change'; before: string; after: string } | null {
  const readable = (value: string | null): string => {
    if (entry.event === 'scope_changed') {
      return value === 'user' || value === 'workspace' ? translate(`memory.scope.${value}`) : (value ?? '')
    }
    if (entry.event === 'expiry_changed') {
      return value
        ? (formatMemoryDate(value, language, { utc: true }) ?? value)
        : translate('memoryLedger.history.noExpiry')
    }
    return value ?? ''
  }
  if (entry.event === 'created') {
    return entry.newValue ? { kind: 'original', before: '', after: entry.newValue } : null
  }
  return { kind: 'change', before: readable(entry.previousValue), after: readable(entry.newValue) }
}
