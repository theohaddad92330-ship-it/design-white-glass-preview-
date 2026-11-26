import type { Contact, ContactActivity } from '@bellum/contracts'
import { Badge, Box, Text } from '@bellum/ui'
import { Clock } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { i18n } from '@/i18n'
import { ContactEmptyTabCta } from './ContactEmptyTabCta'
import { SectionCard } from './SectionCard'

/** When `emptyCta` is provided (dedicated « Activité » tab), an empty history
 *  offers next steps (enrich / note) instead of a dead-end message. */
export function ContactActionHistory({
  activity,
  emptyCta,
}: {
  activity: ContactActivity[] | null | undefined
  emptyCta?: { contact: Contact; onAddNote: () => void }
}) {
  const { t } = useTranslation('contacts')
  return (
    <SectionCard title={t('activity.title')}>
      {activity && activity.length > 0 ? (
        <Box className="space-y-4 max-h-56 overflow-y-auto">
          {activity.map(entry => {
            const date = formatActivityDate(entry.at)
            return (
              <Box key={`${entry.label}-${entry.at ?? ''}`} display="flex" className="items-center gap-3">
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-white/5 text-muted-foreground">
                  <Clock className="size-4" />
                </span>
                <Box className="min-w-0 flex-1">
                  <Text element="p" size="sm" weight="medium" color="text-foreground">
                    {entry.label}
                  </Text>
                  {date && (
                    <Text element="span" size="xs" color="text-muted-foreground">
                      {date}
                    </Text>
                  )}
                </Box>
                {entry.status && (
                  <Badge variant="success">
                    {t(`activity.status.${entry.status}`, { defaultValue: humanizeStatus(entry.status) })}
                  </Badge>
                )}
              </Box>
            )
          })}
        </Box>
      ) : emptyCta ? (
        <ContactEmptyTabCta
          contact={emptyCta.contact}
          message={t('activity.emptyCta')}
          onAddNote={emptyCta.onAddNote}
        />
      ) : (
        <Text element="p" size="sm" color="text-muted-foreground">
          {t('activity.empty')}
        </Text>
      )}
    </SectionCard>
  )
}

function formatActivityDate(value: string | null | undefined): string | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat(i18n.language === 'fr' ? 'fr-FR' : 'en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

/** Un statut inconnu du catalogue reste lisible : jamais un code `snake_case` brut. */
function humanizeStatus(status: string): string {
  const words = status.split(/[_-]+/).filter(Boolean)
  if (words.length === 0) return status
  return words.map((word, index) => (index === 0 ? word.charAt(0).toUpperCase() + word.slice(1) : word)).join(' ')
}
