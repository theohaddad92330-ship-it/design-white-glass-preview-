import { Button } from '@bellum/ui'
import { Search } from 'lucide-react'
import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import { ShortcutKeys } from '@/features/shortcuts/ShortcutKeys'
import { HIDE_ON_TOUCH, shortcutAriaKeys } from '@/features/shortcuts/shortcut-format'
import { shortcutById } from '@/features/shortcuts/shortcuts'

/**
 * Le déclencheur de la recherche globale (#2207.67, épopée #3015).
 *
 * Coque Théo (23/10/2026) — il a quitté l'en-tête de la barre latérale pour la barre
 * du haut, sous la forme de la maquette (`.search-trigger` : loupe, « Recherche
 * globale », capuchons ⌘ K). C'est la MÊME recherche (`useGlobalSearchStore`, ouvert par
 * l'appelant) : la coque n'en crée pas une seconde.
 *
 * GA-95 interdit les capuchons permanents dans la BARRE LATÉRALE ; celui-ci vit dans la
 * barre du haut, où la maquette l'affiche, et disparaît au doigt (`HIDE_ON_TOUCH`).
 *
 * Un vrai `<button type="button">` : ce qui se clique se tabule (GA-35), nommé (GA-32).
 */
export const GlobalSearchTrigger = memo(function GlobalSearchTrigger({ onOpen }: { onOpen: () => void }) {
  const { t } = useTranslation('shortcuts')
  const shortcut = shortcutById('global-search')
  const label = t(shortcut.labelKey)

  return (
    <Button
      type="button"
      variant="ghost"
      aria-label={label}
      aria-keyshortcuts={shortcutAriaKeys(shortcut)}
      onClick={onOpen}
      data-shell="search"
      className="h-9 w-52 shrink-0 cursor-pointer justify-start gap-2 rounded-control border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] px-3 text-xs font-normal text-[var(--bellum-text-muted)] hover:bg-[var(--bellum-surface-2)] hover:text-[var(--bellum-text-primary)]"
    >
      <Search className="size-4 shrink-0" aria-hidden="true" />
      <span className="truncate">{label}</span>
      <ShortcutKeys shortcut={shortcut} className={`ml-auto ${HIDE_ON_TOUCH}`} />
    </Button>
  )
})
