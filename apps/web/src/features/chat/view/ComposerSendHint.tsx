import { useTranslation } from 'react-i18next'
import type { SendCommentOn } from '@/features/preferences/preferences-provider'

/**
 * #3399.6 — l'indice du raccourci d'envoi, VISIBLE sous le champ.
 *
 * Il lit le MÊME réglage que `handleComposerKeyDown` (`sendCommentOn`) : l'indice et la touche ne
 * peuvent pas diverger (GA-26). Il se tait au doigt (le clavier tactile a son bouton Envoyer) et sous
 * 768 px (GA-28) ; 12 px plancher (`text-xs`).
 */
export function ComposerSendHint({ sendOn, id }: { sendOn: SendCommentOn; id: string }) {
  const { t } = useTranslation('chat')
  return (
    <p
      id={id}
      data-testid="composer-send-hint"
      className="px-2 text-xs text-[var(--bellum-text-muted)] max-md:hidden pointer-coarse:hidden"
    >
      {t(sendOn === 'mod-enter' ? 'composer.sendHintMod' : 'composer.sendHint')}
    </p>
  )
}
