import { useTranslation } from 'react-i18next'
import { ShieldAlert } from 'lucide-react'
import { Text } from '@bellum/ui'

/**
 * #5042 (arbitrage Louis 31/10, épopée #5033.2) — la petite ligne sous le composeur. Elle REMPLACE la barre
 * « Laura garde en tête » (`MemoryBar`), retirée du fil comme de l'accueil : « un copilote qui agit doit dire
 * qu'il peut se tromper, UNE fois ». La mémoire ne se lit plus ici : elle vit dans Réglages › Mémoire
 * (`/settings/memory`) — plus d'entrée mémoire dans le « + » mobile.
 */
export function ComposerDisclaimer() {
  const { t } = useTranslation('chat')
  return (
    <div className="flex shrink-0 items-center gap-1.5 px-3 py-1 sm:px-5">
      <ShieldAlert className="size-3.5 shrink-0 text-[var(--bellum-text-muted)]" aria-hidden />
      <Text size="xs" color="text-[var(--bellum-text-muted)]">
        {t('composer.disclaimer')}
      </Text>
    </div>
  )
}
