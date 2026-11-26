import type { Contact } from '@bellum/contracts'
import { Button } from '@bellum/ui'
import { ArrowRight } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useContactStop } from '@/features/contacts/hooks/useContactStop'
import { getAvailableChannels } from '@/features/accounts/view/account-detail/components/contact-engagement/channel'
import type { EngagementChannel } from '@/features/accounts/view/account-detail/components/contact-engagement/types'
import { revealContactAnchor } from '../contactDetailTabs'
import { contactRelationalCta } from '@/features/contacts/lib/contactRelationalCta'

/** Les deux CTA qui « préparent » (premier contact, reprise) ouvrent le
 *  composeur — le même que celui du bouton « Contacter » de l'entête, jamais
 *  un second moteur. Traiter/vérifier restent un scroll vers la carte de
 *  lecture (fil, profil) : rien à y composer. */
const COMPOSE_CTA_KEYS = new Set(['first_approach', 'reactivation'])

/**
 * #2160.15/.16/.17/.19 — le CTA contextuel qui suit l'état relationnel DÉJÀ
 * calculé (`contactRelationalCta`, pure).
 *
 * #3406 (recette 30/09, « NON PROUVABLE » sur #3417/#3418) — « Préparer la
 * première approche »/« Préparer une reprise » ne faisaient QUE défiler
 * jusqu'à la carte d'amorces, qui n'ouvre pas le composeur (une fonctionnalité
 * distincte, `/ia/icebreaker`) : le libellé promettait de préparer un
 * message, le clic n'y menait jamais. Ces deux CTA ouvrent maintenant le
 * MÊME composeur que le bouton « Contacter » de l'entête
 * (`ContactHeader` → `openEngagement`), sur le premier canal disponible.
 * Traiter la réponse / vérifier la situation restent un scroll vers la carte
 * de lecture (fil, profil) : rien à y composer.
 *
 * Rend `null` sans signal — l'absence de CTA n'affirme rien (GA-18/19).
 */
export function ContactRelationalCtaBanner({
  contact,
  onGenerateMessage,
  onOpenExchange,
  onReveal,
}: {
  contact: Contact
  onGenerateMessage?: (channel: EngagementChannel) => void
  /** #3718 — « Traiter la réponse » ouvre l'échange réel (messagerie filtrée
   *  sur l'adresse du contact) au lieu de défiler vers un bloc qui peut être
   *  absent. Reçoit l'adresse. */
  onOpenExchange?: (email: string) => void
  /** #3720.3 — ouvre le pli qui porte la carte, attend son montage et se replie si l'id manque. */
  onReveal?: (id: string) => void
}) {
  const { t, i18n } = useTranslation('contacts')
  // #3718.5 — l'opposition se lit AU MÊME ENDROIT que partout (`contact_stops`) : le
  // nouveau point d'entrée « Traiter la réponse » ne la contourne pas, il la nomme.
  const { data: stop } = useContactStop(contact.id)
  const [noAddress, setNoAddress] = useState(false)
  const cta = contactRelationalCta(contact)
  if (!cta) return null

  const channels = getAvailableChannels(contact)
  const canCompose = COMPOSE_CTA_KEYS.has(cta.key) && onGenerateMessage && channels.length > 0

  const scrollTargetId = cta.scrollTargetId
  const email = contact.email?.trim() ?? ''
  const isHandleReply = cta.key === 'handle_reply'
  const opensExchange = isHandleReply && Boolean(onOpenExchange)
  // #3689 — jamais un bouton qui ne mène nulle part : un CTA de composition sans
  // canal joignable n'a plus de carte d'accroches où retomber, il ne s'affiche pas.
  if (!canCompose && !opensExchange && scrollTargetId === null) return null

  const onClick = canCompose
    ? () => onGenerateMessage(channels[0]!)
    : opensExchange
      ? () => (email ? onOpenExchange?.(email) : setNoAddress(true))
      : () => {
          const target = document.getElementById(scrollTargetId!)
          // #3716 — « Vérifier la situation » doit ouvrir le BON détail : le
          // parcours qui explique le changement de poste vit dans un détail
          // fermé par défaut ; on l'ouvre avant de s'y rendre.
          target?.querySelectorAll('details').forEach(detail => {
            detail.open = true
          })
          // #3720.3 — la fiche ouvre le pli qui porte la carte et se replie si
          // l'id manque ; seul, on défile (et on dit `false` sans rien inventer).
          if (onReveal) onReveal(scrollTargetId!)
          else revealContactAnchor(scrollTargetId!)
        }

  return (
    <>
      <Button variant="violet" size="sm" icon={ArrowRight} onClick={onClick}>
        {t(`relationalCta.${cta.key}`)}
      </Button>
      {/* #3718.7 — « Répondu » est une DÉCLARATION de l'utilisateur ; l'échange réel, la messagerie le dit. */}
      {isHandleReply ? (
        <p className="mt-2 text-sm text-[var(--bellum-text-secondary)]">{t('relationalCta.handle_reply_declared')}</p>
      ) : null}
      {/* #3718.5 — une opposition reste un arrêt : la réponse n'est pas un point d'entrée qui la contourne. */}
      {isHandleReply && stop ? (
        <p role="status" className="mt-2 text-sm text-[var(--bellum-text-secondary)]">
          {t('relationalCta.handle_reply_stopped', {
            date: new Date(stop.since).toLocaleDateString(i18n.language, { day: 'numeric', month: 'long' }),
          })}
        </p>
      ) : null}
      {/* #3718 — une réponse sans adresse ne s'ouvre pas : on le DIT. */}
      {noAddress ? (
        <p role="status" className="mt-2 text-sm text-[var(--bellum-text-secondary)]">
          {t('relationalCta.handle_reply_no_address')}
        </p>
      ) : null}
    </>
  )
}
