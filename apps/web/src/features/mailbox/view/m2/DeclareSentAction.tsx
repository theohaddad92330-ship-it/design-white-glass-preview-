import { Box, Button, Text } from '@bellum/ui'
import { useState } from 'react'
import { CheckCheck } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useContactCadence } from '@/features/contacts/hooks/useContactCadence'
import { useDeclareSent } from '@/features/contacts/hooks/useDeclareSent'
import { formatDate } from '@/lib/locale'

/**
 * #4418.1 — « Marquer envoyé » : le commercial a envoyé ce message LUI-MÊME. Le calcul existait déjà
 * (`useDeclareSent` → `POST /contacts/:id/declare-sent` → `CadenceService.scheduleForContact`, utilisé par
 * l'onglet Engagement) ; il manquait l'APPELANT ici, là où le brouillon se relit, et l'écran qui DIT la cadence.
 *
 * Les échéances viennent du calendrier du serveur (`useContactCadence`), jamais recalculées ici. Déclaratif :
 * « Fait » ne porte jamais preuve d'envoi (doctrine 21/09) — la phrase le dit, et rien n'écrit « envoyé ».
 */
export function DeclareSentAction({ contactId, channel }: { contactId: string; channel: 'email' | 'linkedin' }) {
  const { t } = useTranslation('mailbox')
  const declare = useDeclareSent(contactId)
  const cadence = useContactCadence(contactId).data
  const declared = declare.isSuccess
  // #4418 — la cadence part du jour que le commercial DÉCLARE (jamais d'un horodatage prouvé, il n'y en a pas).
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Paris' })
  const [sentOn, setSentOn] = useState(today)
  const followUps = cadence?.scheduled ? cadence.steps.filter(step => step.key !== 'initial') : []

  return (
    <Box className="flex flex-col gap-2">
      {declared ? null : (
        <Box className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-sm text-[var(--bellum-text-secondary)]">
            {t('m2.declare.sentOn')}
            <input
              type="date"
              value={sentOn}
              max={today}
              onChange={event => setSentOn(event.target.value)}
              className="min-h-11 rounded-md border border-[var(--bellum-border)] bg-transparent px-2 py-1 text-sm text-[color:var(--bellum-text-primary)]"
            />
          </label>
          <Button
            className="min-h-11"
            variant="outline"
            icon={CheckCheck}
            disabled={declare.isPending || !sentOn}
            onClick={() => declare.mutate({ channel, sentOn })}
          >
            {t('m2.declare.action')}
          </Button>
        </Box>
      )}
      {declared ? (
        <>
          {followUps.length > 0 ? (
            <Text size="sm" weight="medium" data-testid="declared-cadence">
              {t('m2.declare.cadence', {
                steps: followUps
                  .map(
                    step =>
                      `J+${step.offset_days} · ${formatDate(step.due_date, { timeZone: 'UTC' }) ?? step.due_date}`,
                  )
                  .join(', '),
              })}
            </Text>
          ) : null}
          <Text size="sm" className="text-[var(--bellum-text-secondary)]" data-testid="declared-note">
            {followUps.length > 0
              ? t('m2.declare.note', { date: formatDate(sentOn, { timeZone: 'UTC' }) ?? sentOn })
              : t('m2.declare.noteUnscheduled')}
          </Text>
        </>
      ) : (
        <Text size="sm" className="text-[var(--bellum-text-secondary)]">
          {t('m2.declare.hint')}
        </Text>
      )}
    </Box>
  )
}
