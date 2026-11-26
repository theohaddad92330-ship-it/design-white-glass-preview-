import { Card, Text } from '@bellum/ui'
import { motion } from 'framer-motion'
import { TrendingUp } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cardFade } from '../../motion'
import { SectionHeader } from './SectionHeader'

export function RecommendationCard({ recommendation }: { recommendation: string }) {
  const { t } = useTranslation('accountDetail')
  return (
    <motion.div variants={cardFade}>
      <Card className="overflow-hidden p-0 [--card-spacing:0px]">
        <SectionHeader
          icon={<TrendingUp className="size-4 text-[var(--bellum-text-accent)]" />}
          title={t('recommendationCard.title')}
          description={t('recommendationCard.description')}
        />
        <div className="border-t border-[var(--bellum-border)] p-5">
          <Text size="sm" className="whitespace-pre-line leading-relaxed text-[var(--bellum-text-primary)]">
            {recommendation}
          </Text>
        </div>
      </Card>
    </motion.div>
  )
}
