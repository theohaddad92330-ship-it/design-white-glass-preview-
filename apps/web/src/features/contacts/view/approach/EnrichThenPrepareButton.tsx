import type { Contact } from '@bellum/contracts'
import { Box, Button, Text } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { Zap } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ContactEnrichConfirm, useContactEnrich } from '../contact-detail/components/ContactEnrichButton'

/**
 * #4981 — « Enrichir puis préparer » : UN geste pour un contact sans e-mail. Le clic arme la MÊME confirmation de coût
 * qu'« Enrichir » (#4981.2, conservée telle quelle : `EnrichConfirmDialog`, garde crédit) ; l'enrichissement réussi avec
 * un e-mail lance la préparation (#4981.1) ; sans e-mail trouvé, l'écran le dit et propose LinkedIn (#4981.3). Le
 * copilote prépare, le commercial envoie : rien n'est envoyé ici. Aucun chiffre de crédits affiché.
 */
export function EnrichThenPrepareButton({ contact, onPrepare }: { contact: Contact; onPrepare: () => void }) {
  const { t } = useTranslation('engagement')
  const [noEmail, setNoEmail] = useState(false)
  const state = useContactEnrich(contact, {
    onEnriched: result => {
      if (result.email?.trim()) {
        setNoEmail(false)
        onPrepare()
      } else {
        setNoEmail(true)
      }
    },
  })
  return (
    <Box className="space-y-1.5">
      <Button
        variant="outline"
        size="sm"
        icon={Zap}
        isLoading={state.enriching}
        loadingText={t('approachPage.enrichPrepare.loading')}
        disabled={state.disabled}
        title={state.hint}
        className="min-h-11"
        onClick={state.enrich}
      >
        {state.buttonLabel(t('approachPage.enrichPrepare.button'))}
      </Button>
      <ContactEnrichConfirm contact={contact} state={state} />
      {noEmail ? (
        <Text data-testid="enrich-no-email" size="sm" className="text-[var(--bellum-text-secondary)]">
          {t('approachPage.enrichPrepare.noEmail')}{' '}
          <Link
            to="/contacts/$id/approach/$channel"
            params={{ id: contact.id, channel: 'linkedin' }}
            className="inline-flex min-h-11 items-center underline"
          >
            {t('approachPage.enrichPrepare.toLinkedin')}
          </Link>
        </Text>
      ) : null}
    </Box>
  )
}
