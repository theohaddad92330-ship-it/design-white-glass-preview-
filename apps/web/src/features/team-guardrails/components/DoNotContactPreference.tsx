import { Box, Button, Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { useSession } from '@/lib/hooks/use-session'
import { useWorkspaceMembers } from '@/features/chat/hooks/useWorkspaceMembers'
import { formatDate } from '@/lib/locale'
import { useContactGuardrails, useLiftDoNotContact } from '../hooks'
import { ContactDoNotContactAction } from './ContactDoNotContactAction'

/**
 * Retirer une entrée de la liste « ne pas contacter » demande `team:manage` (le serveur le re-vérifie) : l'écran ne
 * propose le geste qu'à qui le peut. UNE règle, lue par Réglages › Ne pas contacter et par la fiche (GA-26).
 */
export function useCanLiftDoNotContact(): boolean {
  const { user } = useSession()
  const members = useWorkspaceMembers().data ?? []
  const role = members.find(member => member.userId === user?.id)?.role
  return role === 'owner' || role === 'admin' || role === 'sales_ops'
}

/**
 * #4504.3 (contrat Louis 24/10) — « Ne pas contacter » quitte l'en-tête de la fiche pour la ligne « Préférence de
 * sollicitation » des Informations clés (Théo c5). Les droits d'équipe ne changent pas : tout membre PROPOSE une
 * entrée (motif obligatoire, `ContactDoNotContactAction`) ; RETIRER reste réservé à `team:manage`.
 * Rien de consigné ⇒ « Aucune opposition consignée » — un état lu, pas une valeur absente.
 */
export function DoNotContactPreference({ contactId }: { contactId: string }) {
  const { t } = useTranslation('teamGuardrails')
  const { data } = useContactGuardrails([contactId])
  const lift = useLiftDoNotContact()
  const canLift = useCanLiftDoNotContact()
  const entry = data?.items.find(item => item.contact_id === contactId)?.do_not_contact ?? null
  return (
    <Box className="space-y-1" data-testid="do-not-contact-preference">
      {entry ? (
        <>
          <Text element="p" size="sm" weight="medium" className="text-[var(--warning-soft-text)]">
            {t('badge.doNotContact')}
          </Text>
          <Text element="p" size="xs" className="text-[var(--bellum-text-secondary)]">
            {entry.reason}
          </Text>
          <Text element="p" size="xs" className="text-[var(--bellum-text-muted)]">
            {t('dnc.meta', { name: entry.added_by_name, date: formatDate(entry.created_at) ?? '' })}
          </Text>
          {canLift ? (
            <Button
              type="button"
              variant="plain"
              size="sm"
              className="min-h-11 px-0"
              disabled={lift.isPending}
              title={t('dnc.liftTitle', { label: entry.contact_name ?? entry.domain ?? '' })}
              onClick={() => lift.mutate(entry.id)}
            >
              {t('dnc.lift')}
            </Button>
          ) : null}
        </>
      ) : data ? (
        <>
          <Text element="p" size="sm" className="text-[var(--bellum-text-secondary)]">
            {t('dnc.noneRecorded')}
          </Text>
          <ContactDoNotContactAction contactId={contactId} />
        </>
      ) : null}
    </Box>
  )
}
