import { Box, Button, Text } from '@bellum/ui'
import type { Contact } from '@bellum/contracts'
import { Link } from '@tanstack/react-router'
import { Phone } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ConsignCallDialog } from '@/features/activities/view/ConsignCallDialog'
import { useContactCallTasks } from '@/features/outreach/hooks/useContactCallTasks'
import { i18n } from '@/i18n'
import { ContactCallTaskDialog } from './ContactCallTaskDialog'
import { SectionCard } from './SectionCard'

/**
 * #3697.7 — « Appels à passer » : les tâches d'appel FUTURES de ce contact restent retrouvables ici
 * (même source que Actions › Séquences › Appels), séparées de l'historique : une tâche à venir
 * n'est pas une interaction réalisée. Aucune ligne quand il n'y en a pas.
 *
 * #3697 — trois gestes distincts sur le MÊME contact, chacun sous son verbe :
 * « Préparer mon appel » (le support oral, avant), « Consigner un appel » (ce
 * qui s'est passé, un appel PASSÉ → activité) et « Planifier un appel » (une
 * tâche FUTURE, via `ContactCallTaskDialog`, aussi proposée par la barre de
 * travail). Rien ne part : ni appel, ni message.
 */
export function ContactCallTaskCard({ contact, onPrepare }: { contact: Contact; onPrepare?: () => void }) {
  const contactId = contact.id
  const { t } = useTranslation('outreach')
  const [logging, setLogging] = useState(false)
  const [planning, setPlanning] = useState(false)
  const { data: upcoming = [] } = useContactCallTasks(contactId)

  return (
    <SectionCard icon={Phone} title={t('callCard.title')}>
      <Text element="p" size="sm" color="text-muted-foreground">
        {t('callCard.explain')}
      </Text>
      <Box className="mt-3 flex flex-wrap gap-2">
        {onPrepare ? (
          <Button size="sm" variant="default" onClick={onPrepare}>
            {t('callCard.prepare')}
          </Button>
        ) : null}
        {/* #4525.3 — le support d'appel est l'onglet « Appel » de la page d'approche (plus de page dédiée). */}
        <Button asChild size="sm" variant="outline">
          <Link to="/contacts/$id/approach/$channel" params={{ id: contactId, channel: 'call' }}>
            {t('callCard.openPage')}
          </Link>
        </Button>
        <Button size="sm" variant="outline" onClick={() => setLogging(true)}>
          {t('callCard.log')}
        </Button>
        <Button size="sm" variant="outline" onClick={() => setPlanning(true)}>
          {t('callCard.propose')}
        </Button>
      </Box>
      {upcoming.length > 0 ? (
        <Box className="mt-4 border-t border-border/60 pt-3">
          <Text element="p" size="xs" color="text-muted-foreground">
            {t('callCard.upcoming')}
          </Text>
          <ul className="mt-1 space-y-1">
            {upcoming.map(task => (
              <li key={task.id} className="flex flex-wrap items-baseline justify-between gap-x-3">
                <Text size="sm" weight="medium">
                  {task.reason}
                </Text>
                <Text size="xs" color="text-muted-foreground">
                  {t(`callStatus.${task.status}`)}
                  {task.scheduled_at ? ` · ${formatCallDate(task.scheduled_at)}` : ''}
                </Text>
              </li>
            ))}
          </ul>
          <Link
            to="/actions/sequences"
            className="mt-1 inline-block text-xs text-[var(--bellum-text-secondary)] hover:underline pointer-coarse:min-h-11"
          >
            {t('callCard.upcomingLink')}
          </Link>
        </Box>
      ) : null}
      <ConsignCallDialog contact={contact} open={logging} onOpenChange={setLogging} />
      <ContactCallTaskDialog contactId={contactId} open={planning} onOpenChange={setPlanning} />
    </SectionCard>
  )
}

function formatCallDate(date: string): string {
  const parsed = new Date(date)
  if (Number.isNaN(parsed.getTime())) return date
  return parsed.toLocaleDateString(i18n.language === 'fr' ? 'fr-FR' : 'en-GB', { day: 'numeric', month: 'short' })
}
