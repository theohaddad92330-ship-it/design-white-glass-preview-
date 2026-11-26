import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Switch,
  Text,
} from '@bellum/ui'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CUSTOMIZABLE_NAV } from '@/components/sidebar/items'
import { usePreferences } from '@/features/preferences/preferences-provider'

/**
 * Sidebar customization (Préférences › Apparence) — hide/show the nav entries.
 * Real effect: each toggle writes to the `hiddenNavItems` preference, which
 * `AppSidebar` filters on immediately. Essential entries (Settings) are never
 * listed, so the user can't lock themselves out.
 */
export function SidebarCustomizeDialog() {
  const { t } = useTranslation('settings', { keyPrefix: 'preferences' })
  const { t: tNav } = useTranslation('nav')
  // GA-235 — un `keyPrefix` neutralise le `namespace:` d'un `t('common:…')` :
  // second `t` sur le namespace commun, comme `DeleteAccountDialog.tsx`.
  const { t: tCommon } = useTranslation('common')
  const { preferences, setPreference } = usePreferences()
  const [open, setOpen] = useState(false)

  const isHidden = (to: string) => preferences.hiddenNavItems.includes(to)

  const toggle = (to: string, visible: boolean) => {
    const next = visible
      ? preferences.hiddenNavItems.filter(item => item !== to)
      : [...preferences.hiddenNavItems.filter(item => item !== to), to]
    setPreference('hiddenNavItems', next)
  }

  const hiddenCount = preferences.hiddenNavItems.length

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          {hiddenCount > 0 ? t('sidebarCustomizeWithCount', { n: hiddenCount }) : t('sidebarCustomize')}
        </Button>
      </DialogTrigger>
      <DialogContent closeLabel={tCommon('actions.close')} className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('sidebarDialogTitle')}</DialogTitle>
          <DialogDescription>{t('sidebarDialogDescription')}</DialogDescription>
        </DialogHeader>
        <div className="divide-y divide-[var(--bellum-border)]">
          {CUSTOMIZABLE_NAV.map(item => {
            const visible = !isHidden(item.to)
            return (
              <div key={item.to} className="flex items-center justify-between gap-4 py-3">
                <Text size="sm" weight="medium" className="text-[var(--bellum-text-primary)]">
                  {tNav(item.labelKey)}
                </Text>
                {/* #1849 — le libellé de nav nomme l'interrupteur, déjà traduit. */}
                <Switch
                  aria-label={tNav(item.labelKey)}
                  checked={visible}
                  onCheckedChange={checked => toggle(item.to, checked)}
                />
              </div>
            )
          })}
        </div>
      </DialogContent>
    </Dialog>
  )
}
