import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Box, Input, Label, Text } from '@bellum/ui'
import { useProtectedTime, useSetProtectedTime } from '@/features/memory/hooks/useProtectedTime'

/** `540` → `'09:00'`, la forme qu'un `<input type="time">` sait lire. */
function toTimeInput(minute: number): string {
  const hours = String(Math.floor(minute / 60)).padStart(2, '0')
  const minutes = String(minute % 60).padStart(2, '0')
  return `${hours}:${minutes}`
}

/** `'09:00'` → `540`, ou `null` si le navigateur rend une forme illisible. */
function fromTimeInput(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value)
  if (!match) return null
  return Number(match[1]) * 60 + Number(match[2])
}

/**
 * #2101.13 — LE TEMPS PROTÉGÉ, réglé par la personne.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI ICI, ET POURQUOI CE CHOIX
 * ─────────────────────────────────────────────────────────────────────────────
 * Même sac `user_preferences`, même écran que `ReplyPreferencesSettings`
 * (Réglages › Mémoire de Laura, section « Ta façon de travailler ») — un
 * réglage vit à un seul endroit (GA-26). Sans cette fenêtre, `agenda-compact.ts`
 * ne pouvait compter QUE les trous entre deux rendez-vous confirmés : ni le
 * temps avant le premier rendez-vous du jour, ni après le dernier, faute de
 * savoir où la journée de travail s'arrête. Ce réglage EST cette fin de
 * journée, choisie plutôt que devinée.
 *
 * ⚠️ Effacer (bouton « Ne plus protéger ») retire la clé du sac — jamais une
 * valeur à `null` qui resterait une ligne du registre sans rien dire (même
 * discipline que `useSetReplyPreference`).
 */
export function ProtectedTimeSettings() {
  const { t } = useTranslation('knowledge')
  const { data, isLoading, isError } = useProtectedTime()
  const setProtectedTime = useSetProtectedTime()
  const [error, setError] = useState<string | null>(null)

  const commit = (field: 'startMinute' | 'endMinute', value: string) => {
    const minute = fromTimeInput(value)
    if (minute === null) return
    const current = data ?? { startMinute: 9 * 60, endMinute: 18 * 60 }
    const next = { ...current, [field]: minute }
    if (next.endMinute <= next.startMinute) {
      setError(t('memoryLedger.protectedTime.invalidRange'))
      return
    }
    setError(null)
    setProtectedTime.mutate(next)
  }

  if (isLoading) {
    return (
      <Text element="p" size="sm" color="text-[var(--bellum-text-muted)]">
        {t('memoryLedger.loading')}
      </Text>
    )
  }
  if (isError) {
    return (
      <Text element="p" size="sm" color="text-[var(--bellum-text-muted)]">
        {t('memoryLedger.reply.unreadable')}
      </Text>
    )
  }

  return (
    <Box className="flex flex-col gap-3 rounded-lg border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-3">
      <Box className="flex flex-col gap-1">
        <Text element="h3" size="sm" weight="semibold">
          {t('memoryLedger.protectedTime.title')}
        </Text>
        <Text element="p" size="sm" color="text-[var(--bellum-text-secondary)]">
          {t('memoryLedger.protectedTime.intro')}
        </Text>
      </Box>
      <Box className="flex flex-wrap items-end gap-3">
        <Box className="flex flex-col gap-1">
          <Label htmlFor="protected-time-start">{t('memoryLedger.protectedTime.start')}</Label>
          <Input
            id="protected-time-start"
            type="time"
            defaultValue={data ? toTimeInput(data.startMinute) : ''}
            onBlur={event => commit('startMinute', event.target.value)}
          />
        </Box>
        <Box className="flex flex-col gap-1">
          <Label htmlFor="protected-time-end">{t('memoryLedger.protectedTime.end')}</Label>
          <Input
            id="protected-time-end"
            type="time"
            defaultValue={data ? toTimeInput(data.endMinute) : ''}
            onBlur={event => commit('endMinute', event.target.value)}
          />
        </Box>
        {data ? (
          <button
            type="button"
            onClick={() => setProtectedTime.mutate(null)}
            className="min-h-11 rounded-md px-2 text-sm text-[var(--bellum-text-accent)] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bellum-primary-500)]"
          >
            {t('memoryLedger.protectedTime.clear')}
          </button>
        ) : null}
      </Box>
      {error ? (
        <Text element="p" size="sm" role="alert" className="text-[var(--danger-soft-text)]">
          {error}
        </Text>
      ) : null}
    </Box>
  )
}
