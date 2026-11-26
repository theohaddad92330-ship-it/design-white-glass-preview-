import { Badge, Box, Button, Card, CardContent, Progress, Text } from '@bellum/ui'
import { motion } from 'framer-motion'
import { ExternalLink, Loader2 } from 'lucide-react'
import { memo } from 'react'
import { useTranslation } from 'react-i18next'

type CurrentPlanCardProps = {
  planName: string
  description: string
  isPaid: boolean
  accountsUsed: number
  accountsLimit: number
  onManage: () => void
  onUpgrade: () => void
  managingPortal: boolean
}

export const CurrentPlanCard = memo<CurrentPlanCardProps>(function CurrentPlanCard({
  planName,
  description,
  isPaid,
  accountsUsed,
  accountsLimit,
  onManage,
  onUpgrade,
  managingPortal,
}) {
  const { t } = useTranslation('billing')
  const isUnlimited = accountsLimit >= 999_999
  const remaining = isUnlimited ? Infinity : Math.max(accountsLimit - accountsUsed, 0)
  const percent = !isUnlimited && accountsLimit > 0 ? Math.min((accountsUsed / accountsLimit) * 100, 100) : 0
  const isHigh = percent > 80
  const progressVariant = percent >= 95 ? 'danger' : isHigh ? 'warning' : 'success'

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1, duration: 0.5, ease: 'easeOut' as const }}
    >
      <Card className="border border-neutral-200 ring-0 dark:border-white/10">
        <CardContent className="grid grid-cols-1 items-start p-4 gap-5 md:grid-cols-[minmax(0,1fr)_minmax(220px,280px)_auto] md:items-center">
          <Box display="flex" className="min-w-0 flex-col gap-1">
            <Text size="sm" color="text-[var(--bellum-text-secondary)]">
              {t('currentPlanCard.yourPlanLabel')}
            </Text>
            <Box display="flex" className="flex-wrap items-center gap-x-2 gap-y-1">
              <Text size="xl" weight="bold" color="text-[var(--bellum-text-primary)]">
                {planName}
              </Text>
              <Badge variant={isPaid ? 'success' : 'default'} className="w-fit text-xs">
                {isPaid ? t('currentPlanCard.statusSubscribed') : t('currentPlanCard.statusTrial')}
              </Badge>
            </Box>
            <Text size="xs" color="text-[var(--bellum-text-secondary)]" leading="snug">
              {description}
            </Text>
          </Box>

          <Box display="flex" className="w-full flex-col gap-2">
            <Text size="sm" color="text-[var(--bellum-text-secondary)]">
              {t('currentPlanCard.remainingAnalyses')}
            </Text>
            <Box display="flex" className="items-baseline gap-1">
              <Text
                element="span"
                size="2xl"
                weight="bold"
                color="text-[var(--bellum-text-primary)]"
                className="font-mono"
              >
                {isUnlimited ? '∞' : remaining}
              </Text>
              <Text element="span" size="sm" color="text-[var(--bellum-text-muted)]">
                / {isUnlimited ? '∞' : accountsLimit}
              </Text>
            </Box>
            <Progress value={percent} variant={progressVariant} size="md" neutralTrack />
          </Box>

          <Box display="flex" className="flex-wrap items-center gap-2 md:flex-col md:items-end">
            {isPaid && (
              <Button variant="outline" size="sm" onClick={onManage} disabled={managingPortal}>
                {managingPortal ? (
                  <Loader2 className="size-3.5 animate-spin mr-1.5" />
                ) : (
                  <ExternalLink className="size-3.5 mr-1.5" />
                )}
                {t('currentPlanCard.manageCta')}
              </Button>
            )}
            <Button variant="default" size="sm" onClick={onUpgrade}>
              {isPaid ? t('cta.changePlan') : t('currentPlanCard.upgradeCta')}
            </Button>
          </Box>
        </CardContent>
      </Card>
    </motion.div>
  )
})
