import { Button, Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { useMessageApproach, useSetMessageApproach } from '@/features/memory/hooks/useMessageApproach'

/**
 * AM.63 — « Garder l'approche directe » depuis le composer, sans passer par les réglages.
 * Écrit la préférence EXISTANTE (`message-approach-preference`, la même que « Préférence et méthode ») :
 * aucune seconde préférence (GA-26). Le même geste la retire. Préférence illisible ou pas encore lue :
 * aucun geste — ce n'est pas « par défaut » pour autant, on ne l'écrase pas à l'aveugle.
 */
export function KeepApproachStyle() {
  const { t } = useTranslation('engagement')
  const { data: approach, isError } = useMessageApproach()
  const { mutate, isPending } = useSetMessageApproach()
  if (isError || approach === undefined) return null
  const kept = approach === 'direct'
  return (
    <div className="mt-3 flex flex-col items-center gap-1">
      <Button
        type="button"
        size="xs"
        variant={kept ? 'secondary' : 'ghost'}
        aria-pressed={kept}
        disabled={isPending}
        onClick={() => mutate(kept ? null : 'direct')}
      >
        {kept ? t('keepApproach.kept') : t('keepApproach.keep')}
      </Button>
      <Text size="xs" className="text-[var(--bellum-text-muted)]">
        {t('keepApproach.hint')}
      </Text>
    </div>
  )
}
