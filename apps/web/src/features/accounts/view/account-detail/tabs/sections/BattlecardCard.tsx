import type { Account } from '@bellum/contracts'
import { Button, Card, Text } from '@bellum/ui'
import { AnimatePresence } from 'framer-motion'
import { Swords } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BattleCardModal } from '../../components/BattleCardModal'

/**
 * Launcher for the competitive battle card, co-located with the account's
 * concurrence / ESN présentes reading. One click generates a meeting-ready card
 * (nous vs the ESN identified on the account) via the IA. Present-only, sourced.
 */
export function BattlecardCard({ account }: { account: Account }) {
  const { t } = useTranslation('accounts')
  const [open, setOpen] = useState(false)

  return (
    <>
      <Card className="gap-0 overflow-hidden p-0 [--card-spacing:0px]">
        <div className="flex items-center gap-3 px-4 py-4">
          <Swords className="size-4 shrink-0 text-[var(--bellum-text-accent)]" />
          <div className="min-w-0">
            <Text element="h3" size="sm" weight="semibold">
              {t('battleCard.launcherTitle')}
            </Text>
            <Text size="xs" className="text-[var(--bellum-text-muted)]">
              {t('battleCard.launcherSubtitle')}
            </Text>
          </div>
        </div>
        <div className="border-t border-[var(--bellum-border)] p-3">
          <Button type="button" variant="violet" size="sm" icon={Swords} fullWidth onClick={() => setOpen(true)}>
            {t('battleCard.generate')}
          </Button>
        </div>
      </Card>
      <AnimatePresence>
        {open ? <BattleCardModal account={account} onClose={() => setOpen(false)} /> : null}
      </AnimatePresence>
    </>
  )
}
