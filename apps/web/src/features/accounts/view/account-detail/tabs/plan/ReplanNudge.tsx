import { Button, Card, Text } from '@bellum/ui'
import { RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { AttackAngle } from './planViewData'
import { ReplanDialog } from './ReplanDialog'

/**
 * Nudge « le plan mérite une actualisation » (annexe méthodo p27 : « le plan se
 * replanifie après chaque réponse »).
 *
 * Un événement contact (réponse, RDV, bounce, refus) a posé `replan_suggested_at`
 * sur le compte. Plutôt que de re-lancer la phase 4 automatiquement — elle a un
 * coût, et Bellum ne dépense jamais un crédit sans clic — on affiche cette
 * bannière ; le bouton ouvre le flux de re-planification existant. Rien à
 * afficher quand aucun événement n'est en attente.
 */
export function ReplanNudge({
  suggestedAt,
  accountId,
  angles,
}: {
  suggestedAt: string | null | undefined
  accountId: string
  angles: AttackAngle[]
}) {
  const { t } = useTranslation('accountDetail')
  const [open, setOpen] = useState(false)
  if (!suggestedAt) return null

  return (
    <>
      <Card className="mb-4 flex flex-wrap items-center justify-between gap-3 border-violet-500/30 bg-violet-500/5 px-4 py-3">
        <div className="flex items-start gap-2">
          <RefreshCw className="mt-0.5 size-4 shrink-0 text-[var(--bellum-text-accent)]" />
          <div>
            <Text size="sm" weight="medium">
              {t('replanNudge.title')}
            </Text>
            <Text size="xs" className="mt-0.5 text-[var(--bellum-text-secondary)]">
              {t('replanNudge.subtitle')}
            </Text>
          </div>
        </div>
        <Button size="sm" onClick={() => setOpen(true)} className="gap-1.5">
          <RefreshCw className="size-3.5" />
          {t('replanNudge.action')}
        </Button>
      </Card>
      <ReplanDialog open={open} onOpenChange={setOpen} accountId={accountId} angles={angles} />
    </>
  )
}
