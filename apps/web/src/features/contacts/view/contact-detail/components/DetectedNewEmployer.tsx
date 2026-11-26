import type { Contact } from '@bellum/contracts'
import { Box, Button, Text } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { ArrowUpRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { detectedNewEmployer } from '@/features/contacts/lib/detectedNewEmployer'
import { ContactAlertSlot } from '../alerts/ContactAlertSlot'
import { signatureOf } from '../alerts/contactAlertMemory'

/**
 * #2296.30/.33 (épopée #2964) — « créer/rattacher le nouvel emploi » et
 * « proposer une action ». On ne crée ni ne rattache rien seul (fusion
 * automatique interdite, `agent_docs/doctrine.md:40`) : la carte NOMME
 * l'employeur qu'Apollo a déjà collecté et PROPOSE le geste — le même
 * lanceur pré-rempli que `ReverseMarketPage`/`TerritoryCompanyPanel`
 * (`Link to="/search" search={{ company }}`), jamais un second chemin
 * d'analyse. Rend `null` sans signal (GA-18/19).
 */
export function DetectedNewEmployer({
  contact,
  onReveal,
  onRecheck,
}: {
  contact: Contact
  onReveal?: (id: string) => void
  onRecheck?: () => Promise<unknown>
}) {
  const { t } = useTranslation('contacts')
  const employer = detectedNewEmployer(contact)
  if (!employer) return null

  return (
    <ContactAlertSlot
      id="newEmployer"
      title={t('avantDagir.cards.newEmployer')}
      signature={signatureOf(employer)}
      onRecheck={onRecheck}
      // #4596 — « garder la version humaine » : la fiche reste telle quelle, la carte est rangée (réversible).
      ignoreLabel={t('avantDagir.gestures.keepRecord')}
      gestures={
        onReveal ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="min-h-11"
            onClick={() => onReveal('contact-correct')}
          >
            {t('avantDagir.gestures.updateEmployer')}
          </Button>
        ) : undefined
      }
    >
      <Box
        display="flex"
        className="items-center justify-between gap-3 rounded-2xl border border-[var(--bellum-surface-2)] p-4"
      >
        <Text element="p" size="sm" className="text-foreground">
          {t('detectedNewEmployer.title', { employer })}
        </Text>
        <Link to="/search" search={{ company: employer }}>
          <Button size="sm" variant="outline">
            {t('detectedNewEmployer.action', { employer })}
            <ArrowUpRight className="size-3.5" aria-hidden />
          </Button>
        </Link>
      </Box>
    </ContactAlertSlot>
  )
}
