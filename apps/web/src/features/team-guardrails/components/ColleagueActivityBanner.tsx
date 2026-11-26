import { Button, Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { formatTimeAgo } from '@/lib/relative-time'
import { useContactColleagueActivity } from '../hooks'
import { ContactAlertSlot } from '@/features/contacts/view/contact-detail/alerts/ContactAlertSlot'
import { recheckFrom } from '@/features/contacts/view/contact-detail/alerts/recheckFrom'
import { signatureOf } from '@/features/contacts/view/contact-detail/alerts/contactAlertMemory'

/**
 * #4158.20 — « Déjà travaillé par X » sur la fiche d'un CONTACT.
 *
 * Lecture seule, aucun blocage : qui (nom en clair), quoi (la dernière action),
 * quand. Rien si c'est moi, rien si personne — l'API ne renvoie que les collègues
 * (responsable, ou action dans les 90 derniers jours), et une absence ne fait
 * AUCUNE ligne. Côté COMPTE, la même information vit déjà dans
 * `AccountCollaborationBand` (GA-26 : pas deux bandeaux sous la même forme).
 */
export function ColleagueActivityBanner({
  contactId,
  onReveal,
}: {
  contactId: string
  /** #4596 — amène une zone de la fiche à l'écran (« Voir l'historique des échanges »). */
  onReveal?: (id: string) => void
}) {
  const { t } = useTranslation('teamGuardrails')
  const { data, refetch } = useContactColleagueActivity(contactId)
  const items = data?.items ?? []
  if (items.length === 0) return null

  return (
    <ContactAlertSlot
      id="colleague"
      title={t('contacts:avantDagir.cards.colleague')}
      signature={signatureOf(
        items.map(item => [item.user_id, item.last_action, item.last_action_at, item.is_responsible]),
      )}
      onRecheck={refetch ? () => recheckFrom(refetch) : undefined}
      gestures={
        onReveal ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="min-h-11"
            onClick={() => onReveal('contact-timeline')}
          >
            {t('contacts:avantDagir.gestures.viewHistory')}
          </Button>
        ) : undefined
      }
    >
      <section
        aria-label={t('colleagueActivity.region')}
        className="rounded-xl border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] px-4 py-3"
      >
        <Text element="h3" size="sm" weight="medium">
          {t('colleagueActivity.title')}
        </Text>
        <ul className="mt-1 space-y-1">
          {items.map(item => {
            const what = item.last_action
              ? t(`colleagueActivity.actionType.${item.last_action}`, { defaultValue: '' })
              : ''
            const when = item.last_action_at ? formatTimeAgo(item.last_action_at) : ''
            const sentence = item.is_responsible
              ? what && when
                ? t('colleagueActivity.responsibleWith', { name: item.name, what, when })
                : t('colleagueActivity.responsibleOnly', { name: item.name })
              : what
                ? t('colleagueActivity.active', { name: item.name, what, when })
                : t('colleagueActivity.activeNoWhat', { name: item.name, when })
            return (
              <li key={item.user_id}>
                <Text size="sm" color="text-[var(--bellum-text-secondary)]">
                  {sentence}
                </Text>
              </li>
            )
          })}
        </ul>
        <Text size="xs" color="text-[var(--bellum-text-muted)]" className="mt-1">
          {t('colleagueActivity.readOnly')}
        </Text>
      </section>
    </ContactAlertSlot>
  )
}
