import { formatPhoneForDisplay, type Contact } from '@bellum/contracts'
import { Button, Text } from '@bellum/ui'
import { PhoneIncoming } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ConsignCallDialog } from '@/features/activities/view/ConsignCallDialog'

/**
 * #3697.5 / #3697.6 — la barre du support d'appel : elle vit dans le panneau tant que le canal
 * est « Appel », pour qu'on consigne le résultat sans quitter le support (« pendant l'appel,
 * sans navigation excessive »).
 *
 *  - « Consigner le résultat » ouvre le MÊME formulaire que « Consigner un appel » de la fiche,
 *    contact et compte posés, rien de prérempli — les objections du support sont des
 *    possibilités, jamais des déclarations ;
 *  - sans numéro, le support se prépare quand même et le dit : on n'invente aucun numéro, on ne
 *    bloque pas la préparation.
 *
 * Rien n'est appelé ni envoyé d'ici.
 */
export function EngagementCallBar({ contact }: { contact: Pick<Contact, 'id' | 'account_id' | 'phone'> }) {
  const { t } = useTranslation('engagement')
  const [logging, setLogging] = useState(false)

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--bellum-border)] px-5 py-2">
      {contact.phone ? (
        <Text size="xs" className="min-w-0 text-[var(--bellum-text-secondary)]">
          {/* #3850.4 — international lisible, jamais le compact brut. */}
          {formatPhoneForDisplay(contact.phone)}
        </Text>
      ) : (
        <Text size="xs" className="min-w-0 text-[var(--bellum-text-muted)]">
          {t('callBar.noPhone')}
        </Text>
      )}
      <Button
        type="button"
        size="xs"
        variant="outline"
        icon={PhoneIncoming}
        className="rounded-full text-xs pointer-coarse:min-h-11"
        onClick={() => setLogging(true)}
      >
        {t('callBar.consign')}
      </Button>
      <ConsignCallDialog contact={contact} open={logging} onOpenChange={setLogging} />
    </div>
  )
}
