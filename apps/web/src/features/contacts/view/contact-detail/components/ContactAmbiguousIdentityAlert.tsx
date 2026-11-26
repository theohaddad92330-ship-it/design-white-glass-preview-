import type { Contact } from '@bellum/contracts'
import { Box, Button, Text } from '@bellum/ui'
import { UserSearch } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { contactIdentityAmbiguous } from '@/features/contacts/lib/contactIdentityAmbiguous'
import { ContactAlertSlot } from '../alerts/ContactAlertSlot'

/**
 * #3687.13 — alerte « au bon moment » pour une identité ambiguë : Apollo a dû
 * choisir CE nom parmi plusieurs profils possibles. Jusqu'ici ce résultat ne
 * remontait que dans les synthèses d'enrichissement en masse — jamais sur la
 * fiche d'UNE personne, là où le commercial décide s'il peut agir. Même
 * emplacement que `HistoricalContactStillUseful`/`DetectedNewEmployer`, rend
 * `null` sans le signal (GA-18/19).
 */
export function ContactAmbiguousIdentityAlert({
  contact,
  onReveal,
  onRecheck,
}: {
  contact: Contact
  onReveal?: (id: string) => void
  onRecheck?: () => Promise<unknown>
}) {
  const { t } = useTranslation('contacts')
  if (!contactIdentityAmbiguous(contact)) return null

  return (
    <ContactAlertSlot
      id="ambiguousIdentity"
      title={t('avantDagir.cards.ambiguousIdentity')}
      signature="ambiguous"
      onRecheck={onRecheck}
      gestures={
        onReveal ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="min-h-11"
            onClick={() => onReveal('contact-fold-protections')}
          >
            {t('avantDagir.gestures.verifyIdentity')}
          </Button>
        ) : undefined
      }
    >
      <Box
        display="flex"
        className="items-center gap-2 rounded-2xl border border-[var(--bellum-warning)] p-4 text-[var(--warning-soft-text)]"
      >
        <UserSearch className="size-3.5 shrink-0" aria-hidden />
        <Text element="p" size="sm">
          {t('ambiguousIdentity.title')}
        </Text>
      </Box>
    </ContactAlertSlot>
  )
}
