import type { ContactSignal } from '@bellum/contracts'
import { Box, DotIndicator, Text } from '@bellum/ui'
import { Megaphone } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { i18n } from '@/i18n'
import { OriginSourceLink } from '@/components/primitives/OriginSourceLink'
import { SectionCard } from './SectionCard'

function formatDate(date: string): string {
  const parsed = new Date(date)
  if (Number.isNaN(parsed.getTime())) return date
  return parsed.toLocaleDateString(i18n.language === 'fr' ? 'fr-FR' : 'en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export function ContactSignals({ signals }: { signals: ContactSignal[] | null | undefined }) {
  const { t } = useTranslation('contacts')
  return (
    <SectionCard icon={Megaphone} iconClassName="text-[var(--warning-soft-text)]" title={t('signals.title')}>
      {signals && signals.length > 0 ? (
        <Box className="space-y-4">
          {signals.map(signal => {
            return (
              <Box key={signal.label} display="flex" className="items-start gap-3">
                <Box display="flex" className="shrink-0">
                  <DotIndicator size="sm" variant="warning" className="mt-1.5" />
                </Box>
                <Box className="min-w-0 flex-1">
                  <Text element="p" size="sm" leading="snug">
                    {signal.label}
                  </Text>
                  {signal.date && (
                    <Text element="span" size="xs" color="text-muted-foreground">
                      {formatDate(signal.date)}
                    </Text>
                  )}
                  {/* Théo B c5 — la source se lit SUR la ligne : page d'origine, sans ouvrir de détail. */}
                  <OriginSourceLink url={signal.source_url} />
                </Box>
              </Box>
            )
          })}
        </Box>
      ) : (
        // Empty tab → propose an action (Théo p.34) plutôt qu'un cul-de-sac.
        <Text element="p" size="sm" color="text-muted-foreground">
          {t('signals.empty')}
        </Text>
      )}
    </SectionCard>
  )
}
