import type { Contact } from '@bellum/contracts'
import { detectContactSolicitationCollisions } from '@bellum/contracts'
import { Box, Button, Text } from '@bellum/ui'
import { Users } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useOutreachSequences } from '@/features/outreach/hooks/useOutreachSequences'
import { ContactAlertSlot } from '../alerts/ContactAlertSlot'
import { recheckFrom } from '../alerts/recheckFrom'
import { signatureOf } from '../alerts/contactAlertMemory'

/**
 * #3687.13 — alerte « au bon moment » pour une sollicitation en double : deux
 * séquences d'outreach ACTIVES visent déjà cette personne. Réemploie
 * `detectContactSolicitationCollisions` (#2325.35, déjà câblé côté pipeline
 * projet et copilote) et les séquences déjà chargées par
 * `useOutreachSequences(contact.id)` (même requête que `ContactOutreachCard`,
 * React Query la partage — aucun appel réseau de plus).
 *
 * Ne lit jamais `user_id` : le signal est opérationnel (cette personne
 * reçoit-elle deux cadences à la fois ?), jamais un reproche entre deux
 * commerciaux — doctrine « l'analytique mesure le produit, jamais la
 * personne ». Rend `null` sans collision (GA-18/19).
 */
export function ContactSolicitationCollisionAlert({
  contact,
  onReveal,
}: {
  contact: Contact
  onReveal?: (id: string) => void
}) {
  const { t } = useTranslation('contacts')
  const { data: sequences, refetch } = useOutreachSequences(contact.id)
  const collisions = detectContactSolicitationCollisions(
    (sequences ?? []).map(sequence => ({
      id: sequence.id,
      contactId: contact.id,
      contactName: contact.full_name,
      status: sequence.status,
    })),
  )
  if (collisions.length === 0) return null

  return (
    <ContactAlertSlot
      id="solicitationCollision"
      title={t('avantDagir.cards.solicitationCollision')}
      signature={signatureOf([...collisions[0].sequenceIds].sort())}
      onRecheck={refetch ? () => recheckFrom(refetch) : undefined}
      gestures={
        onReveal ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="min-h-11"
            onClick={() => onReveal('contact-outreach')}
          >
            {t('avantDagir.gestures.viewSequences')}
          </Button>
        ) : undefined
      }
    >
      <Box
        display="flex"
        className="items-center gap-2 rounded-2xl border border-[var(--bellum-warning)] p-4 text-[var(--warning-soft-text)]"
      >
        <Users className="size-3.5 shrink-0" aria-hidden />
        <Text element="p" size="sm">
          {t('solicitationCollision.title', { count: collisions[0].sequenceIds.length })}
        </Text>
      </Box>
    </ContactAlertSlot>
  )
}
