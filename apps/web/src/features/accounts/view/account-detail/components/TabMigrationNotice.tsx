import { Text, TooltipButton, cn } from '@bellum/ui'
import { X } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

const STORAGE_PREFIX = 'bellum.tab-migration-notice.dismissed.'

/** #2115.33 — le stockage est un CONFORT, jamais une dépendance : navigation
 *  privée verrouillée ou quota plein retombent sur « pas encore vu », donc la
 *  notice réapparaît au pire — gênant, jamais bloquant. */
function isDismissed(key: string): boolean {
  try {
    return window.sessionStorage.getItem(STORAGE_PREFIX + key) === '1'
  } catch {
    return false
  }
}

function markDismissed(key: string): void {
  try {
    window.sessionStorage.setItem(STORAGE_PREFIX + key, '1')
  } catch {
    // Stockage refusé — voir `isDismissed`.
  }
}

interface TabMigrationNoticeProps {
  /** Le nom de la section d'arrivée — toujours affiché. */
  sectionLabel: string
  /** La sous-partie précise. Omise quand la section n'en compte qu'une : le nom
   *  se répéterait, exactement la règle que la barre applique déjà à sa pastille
   *  de sous-section (#2115.44 — « une section d'une seule sous-partie n'en
   *  affiche aucune »). */
  subSectionLabel?: string
  /** Clé de mémorisation `sessionStorage` — une par ANCIENNE VALEUR d'URL, pas
   *  par compte : la question posée est « ce libellé vous a-t-il déjà surpris
   *  cette session ? », pas « sur CE dossier ». */
  dismissKey: string
  /** #3720 (lot RAT) — épinglée (sticky) quand l'arrivée DÉFILE plus bas (`?tab=programs` → carte
   *  « Projets et transformations », #3677) : posée en tête, elle sortait de l'écran (top -5106 px). */
  pinned?: boolean
}

/**
 * #2115.33 — INFO DE MIGRATION SEULEMENT SI UTILE.
 *
 * Une ligne discrète — jamais un toast (elle ne s'efface pas seule : rien ne
 * presse), jamais un dialogue (elle ne bloque rien). Le composant appelant
 * décide QUAND elle a le droit d'exister (`resolveLegacyTabNotice` dans
 * `accountDetailSearch.ts` : jamais sur une valeur déjà canonique) ; celui-ci
 * ne décide que de l'affichage et de la mémorisation.
 */
export function TabMigrationNotice({ sectionLabel, subSectionLabel, dismissKey, pinned }: TabMigrationNoticeProps) {
  const { t } = useTranslation('accounts')
  const [dismissed, setDismissed] = useState(() => isDismissed(dismissKey))

  if (dismissed) return null

  const message = subSectionLabel
    ? t('tabMigrationNotice.messageWithSubSection', { section: sectionLabel, subSection: subSectionLabel })
    : t('tabMigrationNotice.messageSectionOnly', { section: sectionLabel })

  return (
    <div
      data-tab-migration-notice=""
      className={cn(
        'flex items-center justify-between gap-3 rounded-md border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] px-3 py-1.5',
        // #3720 (RAT) — même borne que les autres éléments épinglés du dossier (`TabPlan`, `TabSignal` : top-4).
        pinned && 'sticky top-4 z-20 shadow-sm',
      )}
    >
      <Text size="xs" className="text-[var(--bellum-text-secondary)]">
        {message}
      </Text>
      <TooltipButton
        tooltip={t('common:actions.close')}
        aria-label={t('common:actions.close')}
        type="button"
        variant="ghost"
        size="xs"
        className="shrink-0"
        onClick={() => {
          markDismissed(dismissKey)
          setDismissed(true)
        }}
      >
        <X className="size-3.5" />
      </TooltipButton>
    </div>
  )
}
