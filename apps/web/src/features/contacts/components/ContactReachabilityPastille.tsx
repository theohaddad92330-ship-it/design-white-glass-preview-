import type { ContactReachability } from '@bellum/contracts'
import { Badge } from '@bellum/ui'
import { useTranslation } from 'react-i18next'

/**
 * Lot 758 (CONTACTS 4/6) — arbitrage Louis 31/10/2026 : la CONTACTABILITÉ sort du score de
 * pertinence et devient une PASTILLE. Appels Simon, Maeva, Janvier : les scores 80-85 ne
 * discriminaient rien, ils mesuraient la joignabilité. La pastille dit le meilleur canal
 * connu (`computeContactReachability`, serveur) ; elle ne note pas.
 *
 * Aucun canal connu (`null`) ou réponse non scorée (`undefined`) : RIEN ne s'affiche — on
 * n'affiche pas ce qu'on n'a pas, jamais une pastille « injoignable ».
 */
export function ContactReachabilityPastille({
  reachability,
}: {
  reachability: ContactReachability | null | undefined
}) {
  const { t } = useTranslation('contacts')
  if (!reachability) return null
  const channel = t(`reachability.kind.${reachability}`)
  return (
    <Badge variant="outline" data-testid="contact-reachability" aria-label={t('reachability.aria', { channel })}>
      {t('reachability.label', { channel })}
    </Badge>
  )
}
