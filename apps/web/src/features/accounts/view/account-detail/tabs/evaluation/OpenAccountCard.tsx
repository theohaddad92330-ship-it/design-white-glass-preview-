import { Card, Text } from '@bellum/ui'
import { motion } from 'framer-motion'
import { DoorOpen, SquareDashedMousePointer } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAccountIntelligenceContext } from '@/features/accounts/hooks/useAccountIntelligenceContext'
import { accountOpeningStrategyView, type AccountOpeningStrategyEntryPoint } from '../sections/accountOpeningStrategy'
import { cardFade } from '../../motion'
import { SectionHeader } from './SectionHeader'

/**
 * « Par où ouvrir ce compte », côté Score — lue au contexte canonique.
 *
 * #2786/#2285.9 — reparsait `raw_analysis.comment_ouvrir_compte` elle-même,
 * la MÊME normalisation que refaisait, séparément, l'onglet Analyser
 * (`OpeningStrategyCard`). Les deux lisent désormais le même arbitrage
 * (`accountOpeningStrategyView`, sur `useAccountIntelligenceContext`) —
 * #2285.23 (NO-GO) : deux onglets ne nomment plus deux portes différentes.
 */
export function OpenAccountCard({ accountId }: { accountId: string }) {
  const { t } = useTranslation('accountDetail')
  const context = useAccountIntelligenceContext(accountId).data

  // La façade n'a pas encore répondu (chargement, ou module non monté) : on se
  // TAIT, comme son équivalent d'Analyser — une lecture indisponible n'est pas
  // un constat.
  if (!context) return null

  const view = accountOpeningStrategyView(context)
  // Ni une porte nommée ni une narration : une structure vide n'est pas une
  // stratégie.
  if (view.state === 'unknown') return null

  return (
    <motion.div variants={cardFade}>
      <Card className="overflow-hidden p-0 [--card-spacing:0px]">
        <SectionHeader
          icon={<DoorOpen className="size-4 text-[var(--bellum-text-accent)]" />}
          title={t('openAccount.title')}
          description={t('openAccount.description')}
        />
        <div className="divide-y divide-[var(--bellum-border)] border-t border-[var(--bellum-border)]">
          {view.narrative ? <StrategyBlock strategy={view.narrative} /> : null}
          {view.entryPoints.map((entryPoint, index) => (
            <EntryPointRow key={`${entryPoint.label}-${index}`} entryPoint={entryPoint} />
          ))}
        </div>
      </Card>
    </motion.div>
  )
}

function StrategyBlock({ strategy }: { strategy: string }) {
  const { t } = useTranslation('accountDetail')
  return (
    <div className="p-5">
      <Text size="xs" weight="medium" className="text-[var(--bellum-text-secondary)]">
        {t('openAccount.entryStrategy')}
      </Text>
      <Text size="sm" className="mt-2 whitespace-pre-line leading-relaxed text-[var(--bellum-text-primary)]">
        {strategy}
      </Text>
    </div>
  )
}

function EntryPointRow({ entryPoint }: { entryPoint: AccountOpeningStrategyEntryPoint }) {
  const { t } = useTranslation('accountDetail')
  return (
    <div className="grid gap-3 p-5 sm:grid-cols-[32px_minmax(0,1fr)]">
      <div className="flex size-8 items-center justify-center rounded-lg bg-[var(--bellum-surface-2)] text-[var(--bellum-text-primary)]">
        <SquareDashedMousePointer className="size-4" />
      </div>
      <div className="min-w-0">
        <Text size="sm" weight="semibold" className="text-[var(--bellum-text-primary)]">
          {entryPoint.label || t('openAccount.fallbackEntryPoint')}
        </Text>
        {entryPoint.targetProfile ? (
          <Text size="xs" className="mt-1 text-[var(--bellum-text-secondary)]">
            {t('openAccount.targetProfile', { profile: entryPoint.targetProfile })}
          </Text>
        ) : null}
        {entryPoint.justification ? (
          <Text size="sm" className="leading-relaxed text-[var(--bellum-text-secondary)]">
            {entryPoint.justification}
          </Text>
        ) : null}
      </div>
    </div>
  )
}
