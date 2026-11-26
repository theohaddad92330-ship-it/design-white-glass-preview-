import { ChevronDown } from 'lucide-react'
import type { ReactNode } from 'react'
import { Box, Text } from '@bellum/ui'
import { SettingsBlock } from '@/features/settings/components/SettingsBlock'
import { useTranslation } from 'react-i18next'
import { ShortcutKeys } from '@/features/shortcuts/ShortcutKeys'
import { ShortcutsSettingsView } from '@/features/shortcuts/view/ShortcutsSettingsView'
import { SHORTCUTS, shortcutById } from '@/features/shortcuts/shortcuts'

/**
 * Théo D settings-prefs.R5 / A7 — le sous-onglet « Raccourcis » des Préférences.
 *
 * En tête, les quatre raccourcis de tous les jours (ceux de Théo) ; dessous, la
 * table complète du produit dans un repli — rien ne se perd. Les deux premiers
 * lisent le REGISTRE (`shortcuts.ts`), jamais une touche recopiée : Tab et
 * Entrée sont des gestes du navigateur, pas des raccourcis de l'app.
 */
export function ShortcutsTab() {
  const { t } = useTranslation('settings', { keyPrefix: 'preferences' })
  const search = shortcutById('global-search')
  const escape = shortcutById('escape')

  return (
    <Box className="flex flex-col gap-4">
      <SettingsBlock label={t('shortcutsUsefulTitle')} description={t('shortcutsUsefulHint')}>
        <ul className="divide-y divide-[var(--bellum-border)]">
          <UsefulRow keys={<ShortcutKeys shortcut={search} announce />} label={t('shortcutsUseful.search')} />
          <UsefulRow keys={<ShortcutKeys shortcut={escape} announce />} label={t('shortcutsUseful.escape')} />
          <UsefulRow keys={<Kbd>Tab / ⇧ Tab</Kbd>} label={t('shortcutsUseful.tab')} />
          <UsefulRow keys={<Kbd>{t('shortcutsUseful.enterKeys')}</Kbd>} label={t('shortcutsUseful.enter')} />
        </ul>
        <Text size="xs" className="px-4 pb-3 text-[var(--bellum-text-secondary)]">
          {t('shortcutsUsefulNote')}
        </Text>
      </SettingsBlock>

      {/* Maquette Théo V22 `settings-prefs#raccourcis` — `.t-acc` : une carte repliée, l'intitulé à 48 px. */}
      <details className="group rounded-card border border-[var(--bellum-border)] bg-card" data-shortcuts-all="">
        <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 px-5 text-sm font-semibold sm:px-6">
          <span className="flex-1">{t('shortcutsAll', { count: SHORTCUTS.length })}</span>
          <ChevronDown
            aria-hidden
            className="size-4 text-[var(--bellum-text-muted)] transition-transform duration-immediate ease-bellum-out group-open:rotate-180"
          />
        </summary>
        <div className="px-5 pb-5 sm:px-6">
          <ShortcutsSettingsView embedded />
        </div>
      </details>
    </Box>
  )
}

// Pas de `<kbd>` : GA-44 réserve cette balise à `ShortcutKeys` (un seul endroit rend les touches).
function Kbd({ children }: { children: string }) {
  return (
    <span className="rounded border border-[var(--bellum-border)] bg-[var(--bellum-bg-lighter)] px-2 py-1 font-mono text-xs">
      {children}
    </span>
  )
}

function UsefulRow({ keys, label }: { keys: ReactNode; label: string }) {
  return (
    <li className="flex min-h-11 flex-wrap items-center justify-between gap-3 px-4 py-2">
      <Text size="sm">{label}</Text>
      {keys}
    </li>
  )
}
