import type { Account } from '@bellum/contracts'
import { Button, Text } from '@bellum/ui'
import { Bell, X } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  dismissNotificationsProposal,
  isNotificationsProposalDismissed,
} from '@/features/notifications/browser-channel/browser-notification-channel'
import { useBrowserNotificationChannel } from '@/features/notifications/hooks/useBrowserNotificationChannel'
import { useActivation } from '@/features/onboarding/hooks/useActivation'

interface NotificationsProposalBannerProps {
  account: Account
}

/**
 * #2082.1 — proposer les notifications navigateur AU JALON « premier dossier
 * consulté », pas à une étape neuve du parcours.
 *
 * `dossier_viewed` (`ActivationService`, jalon ③) est DÉJÀ dérivé côté
 * serveur depuis `account_viewed` — cette bannière ne recalcule rien, elle le
 * LIT (`useActivation`, même hook que `ActivationChecklist`). Le canal
 * lui-même est celui de #1938.3 (`useBrowserNotificationChannel`) : accepter
 * ici emprunte EXACTEMENT le même `setChannelEnabled(true)` que Réglages ›
 * Notifications, jamais un second chemin qui diverge.
 *
 * Une proposition, refusable, qui NE REVIENT PAS si refusée — persistée par
 * `dismissNotificationsProposal` au même titre que le réglage du canal : PAR
 * NAVIGATEUR (voir le commentaire d'en-tête de `browser-notification-channel.ts`),
 * jamais côté compte.
 *
 * #2510 — Louis, en recette : posée seule sur sa propre ligne pleine largeur,
 * cette proposition prenait toute la place pour un geste secondaire et
 * dismissible. Elle rejoint désormais `account-context-row` (`AccountDetail.tsx`)
 * comme une QUATRIÈME bande, à la même hauteur que `LinkedAccountsCard`
 * (#3161, remplace `AccountContextBand` depuis le 28/09/2026),
 * AccountCollaborationBand et AccountDossierSearch (#2351/#2511) : un pavé
 * compact d'UNE ligne, jamais deux. La description n'est plus un second
 * paragraphe visible — son texte entier reste au survol (`title`), rien n'est
 * retiré, seulement replié comme les autres bandes de cette même ligne.
 */
export function NotificationsProposalBanner({ account }: NotificationsProposalBannerProps) {
  const { t } = useTranslation('accounts', { keyPrefix: 'notificationsProposal' })
  // #2082.10 — même texte que Réglages › Notifications (`BrowserChannelSection`,
  // #1938.3) pour les deux états bloqués : jamais une seconde formulation qui
  // pourrait diverger (loi 4).
  const { t: tBrowser } = useTranslation('settings', { keyPrefix: 'notifications.browser' })
  const { data: activation, isPending: activationPending } = useActivation()
  const { permission, enabled, setChannelEnabled } = useBrowserNotificationChannel()
  const [dismissed, setDismissed] = useState(isNotificationsProposalDismissed)
  const [pending, setPending] = useState(false)

  const alreadyActive = enabled && permission === 'granted'
  // #2082.10 — bloqué ne veut plus dire MUET : une permission refusée ou un
  // navigateur qui ne sait pas faire SE DIT (motif nommé), jamais un bloc qui
  // disparaît sans explication — l'échec silencieux que le point interdit.
  const blocked = permission === 'unsupported' || permission === 'denied'

  if (account.status !== 'completed') return null
  if (alreadyActive || dismissed) return null
  // #3465 — l'activation arrive après le premier rendu : sans cette réserve la
  // bannière apparaissait plus tard et décalait la barre d'onglets (~59 px).
  // On garde sa place (même gabarit, invisible, inerte) tant qu'on ne sait pas.
  const reserved = activationPending && !activation
  if (!reserved && !activation?.dossier_viewed) return null

  function onAccept() {
    setPending(true)
    void setChannelEnabled(true).finally(() => setPending(false))
  }

  function onDismiss() {
    dismissNotificationsProposal()
    setDismissed(true)
  }

  return (
    <div
      // #2351 — `min-w-0` : enfant de la ligne compacte du dossier
      // (`account-context-row`, `flex lg:flex-nowrap`), même raison que les
      // trois autres bandes.
      className={`flex min-w-0 max-w-full flex-nowrap items-center gap-2 rounded-xl border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] px-3 py-2${reserved ? ' invisible' : ''}`}
      aria-hidden={reserved || undefined}
      data-testid="notifications-proposal-banner"
    >
      <Bell className="h-4 w-4 shrink-0 text-[var(--bellum-text-muted)]" />
      {/* #2511 — pavé compact (une ligne, texte complet au survol) ; l'état
          « canal bloqué par le navigateur » garde son titre et son détail. */}
      <Text
        element="p"
        size="sm"
        weight="medium"
        noWrap
        title={
          blocked
            ? `${t('blockedTitle')} — ${tBrowser(`statusDetail.${permission}`)}`
            : `${t('title')} — ${t('description')}`
        }
        className="min-w-0 text-[var(--bellum-text-primary)]"
      >
        {blocked ? t('blockedTitle') : t('title')}
      </Text>
      {/* #2082.10 — bloqué SE DIT à l'écran : la raison reste visible, pas
          seulement au survol (le pavé compact ne la tait pas). */}
      {blocked && (
        <Text size="xs" noWrap className="min-w-0 text-[var(--bellum-text-secondary)]">
          {tBrowser(`statusDetail.${permission}`)}
        </Text>
      )}
      <div className="flex shrink-0 items-center gap-1">
        {!blocked && (
          <Button variant="black" size="sm" icon={Bell} disabled={pending} onClick={onAccept}>
            {t('accept')}
          </Button>
        )}
        {/* #3052 (retour bêta, 26/09/2026) — Louis : « laisser juste activer et
            une croix ». Le geste de refus reste EXACTEMENT le même
            (`onDismiss` / `onClick` de « Compris » sur l'état bloqué) ; seul
            son habillage change, du bouton texte à une croix icône-seule —
            même nom accessible (`t('dismiss')`/`t('acknowledge')`, GA-32). */}
        <Button
          variant="ghost"
          size="icon"
          icon={X}
          aria-label={blocked ? t('acknowledge') : t('dismiss')}
          title={blocked ? t('acknowledge') : t('dismiss')}
          onClick={onDismiss}
        />
      </div>
    </div>
  )
}
