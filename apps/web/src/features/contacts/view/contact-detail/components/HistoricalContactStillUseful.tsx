import type { Contact } from '@bellum/contracts'
import { Box, Button, Text } from '@bellum/ui'
import { History, Lightbulb, Users } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  historicalContactStillUsefulAs,
  type HistoricalContactUse,
} from '@/features/contacts/lib/historicalContactStillUseful'
import { ContactAlertSlot } from '../alerts/ContactAlertSlot'
import { signatureOf } from '../alerts/contactAlertMemory'

const USE_ICONS: Record<HistoricalContactUse, LucideIcon> = {
  dormant_network: Users,
  account_history: History,
  potential_source: Lightbulb,
}

/**
 * #2296.23/.25/.26 (LAU-FINAL-037, épopée #2964) — un contact `historique`
 * (a quitté l'entreprise du compte, #2296.27 déjà exclu du classement actif)
 * n'est pas pour autant sans valeur : cette carte NOMME les trois usages que
 * la relation garde, à l'endroit où le commercial se demande « à quoi bon
 * garder cette fiche ? ». Rend `null` sans le signal (GA-18/19).
 */
export function HistoricalContactStillUseful({
  contact,
  onReveal,
  onRecheck,
}: {
  contact: Contact
  onReveal?: (id: string) => void
  onRecheck?: () => Promise<unknown>
}) {
  const { t } = useTranslation('contacts')
  const uses = historicalContactStillUsefulAs(contact)
  if (!uses) return null

  return (
    <ContactAlertSlot
      id="historical"
      title={t('avantDagir.cards.historical')}
      signature={signatureOf(uses)}
      onRecheck={onRecheck}
      gestures={
        onReveal ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="min-h-11"
            onClick={() => onReveal('contact-timeline')}
          >
            {t('avantDagir.gestures.viewHistory')}
          </Button>
        ) : undefined
      }
    >
      <Box className="space-y-2.5 rounded-2xl border border-[var(--bellum-surface-2)] p-4">
        <Text element="p" size="sm" weight="medium" className="text-foreground">
          {t('historicalStillUseful.title')}
        </Text>
        <Box className="space-y-1.5">
          {uses.map(use => {
            const Icon = USE_ICONS[use]
            return (
              <Box key={use} display="flex" className="items-center gap-2 text-muted-foreground">
                <Icon className="size-3.5 shrink-0" />
                <Text element="span" size="sm">
                  {t(`historicalStillUseful.${use}`)}
                </Text>
              </Box>
            )
          })}
        </Box>
      </Box>
    </ContactAlertSlot>
  )
}
