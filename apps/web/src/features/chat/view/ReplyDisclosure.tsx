import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { ReplyExpandable } from './reply-kit'

/**
 * #3763 — le second niveau d'une carte de Laura. Le bouton NOMME ce qu'il
 * ouvre (« Voir pourquoi »), jamais un « plus »
 * générique. Intégration 06/10 : le geste est celui de `ReplyExpandable`
 * (#3761, variante `inline`) — un seul composant dépliable.
 * #5044 — le corps d'une réponse ne plie plus rien (Sources, Limites… sont dans le panneau Sources) ; seule la
 * carte Verdict garde ce repli.
 */
export function ReplyDisclosure({ kind, children }: { kind: 'why'; children: ReactNode }) {
  const { t } = useTranslation('chat')
  return (
    <ReplyExpandable inline title={t(`replyDisclosure.show.${kind}`)} closeTitle={t('replyDisclosure.hide')}>
      {children}
    </ReplyExpandable>
  )
}
