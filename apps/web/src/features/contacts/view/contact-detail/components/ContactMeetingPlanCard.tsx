import type { Contact } from '@bellum/contracts'
import { Button, Text } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { CalendarPlus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { SectionCard } from './SectionCard'

/**
 * #3693.6 — « Planifier un rendez-vous » ouvre l'agenda RÉEL (`/briefing`, vue
 * Jour, créneaux libres) avec le contact en main : sujet et invité préremplis,
 * l'invitation ne part qu'à la validation du commercial. Un rendez-vous déjà
 * tenu, lui, se consigne dans l'historique — ce bouton ne sert qu'au futur.
 */
export function ContactMeetingPlanCard({ contact }: { contact: Contact }) {
  const { t } = useTranslation('contacts')
  return (
    <SectionCard icon={CalendarPlus} title={t('planMeeting.title')}>
      <Text element="p" size="sm" color="text-muted-foreground">
        {t('planMeeting.explain')}
      </Text>
      <Button
        asChild
        size="sm"
        variant="outline"
        className="mt-3 h-auto whitespace-normal py-1.5 text-left pointer-coarse:min-h-11"
      >
        <Link to="/briefing" search={{ plan: contact.id }}>
          {t('planMeeting.action')}
        </Link>
      </Button>
    </SectionCard>
  )
}
