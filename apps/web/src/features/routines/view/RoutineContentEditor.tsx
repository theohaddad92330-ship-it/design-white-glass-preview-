import { ROUTINE_CONTENT_MAX_LENGTH, ROUTINE_CONTENT_TOKEN } from '@bellum/contracts'
import { Box, Button, Text, Textarea } from '@bellum/ui'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useResetRoutineContent, useRoutineContent, useSaveRoutineContent } from '../api'

/**
 * #2843.30 — LE CONTENU EXACT produit par la routine (le texte de sa notification),
 * réglé POUR L'ESPACE sur sa fiche `/settings/routines/<clé>`. Un gabarit où
 * `{{resultat}}` reçoit ce que la routine a calculé ; « Revenir au défaut » efface le
 * gabarit (le défaut n'est jamais recopié). Une lecture en échec le dit, sans champ.
 */
export function RoutineContentEditor({ routineKey }: { routineKey: string }) {
  const { t } = useTranslation('routines')
  const query = useRoutineContent(routineKey)
  const save = useSaveRoutineContent()
  const reset = useResetRoutineContent()
  const saved = query.data?.template ?? null
  const [draft, setDraft] = useState(saved ?? '')
  useEffect(() => setDraft(saved ?? ''), [saved])

  if (query.isLoading) {
    return (
      <Text size="xs" className="text-[var(--bellum-text-secondary)]">
        {t('content.loading')}
      </Text>
    )
  }
  if (query.isError || !query.data) {
    return (
      <Text size="xs" className="text-[var(--bellum-text-secondary)]">
        {t('content.error')}
      </Text>
    )
  }

  const trimmed = draft.trim()
  return (
    <Box className="flex w-full max-w-prose flex-col gap-2">
      <Text size="xs" className="text-[var(--bellum-text-secondary)]">
        {t(saved === null ? 'content.default' : 'content.custom', {
          token: ROUTINE_CONTENT_TOKEN,
          interpolation: { escapeValue: false },
        })}
      </Text>
      <Textarea
        aria-label={t('content.title')}
        value={draft}
        maxLength={ROUTINE_CONTENT_MAX_LENGTH}
        rows={3}
        onChange={event => setDraft(event.target.value)}
      />
      <Box className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          disabled={save.isPending || trimmed.length === 0 || trimmed === saved}
          onClick={() => save.mutate({ key: routineKey, template: trimmed })}
        >
          {t('content.save')}
        </Button>
        {saved !== null ? (
          <Button size="sm" variant="ghost" disabled={reset.isPending} onClick={() => reset.mutate(routineKey)}>
            {t('content.reset')}
          </Button>
        ) : null}
      </Box>
    </Box>
  )
}
