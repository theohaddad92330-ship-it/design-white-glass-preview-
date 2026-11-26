import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { trialLockEnumeration } from '@bellum/contracts'
import { Lock, Sparkles } from 'lucide-react'
import { useCredits } from '@/features/credits/hooks/useCredits'
import { Banner, bannerActionClassName } from '@/components/layout/Banner'
import { isWindowedPlan } from '../lib/windowedPlan'

/** Whole days remaining until `end` (never negative). */
function daysLeft(end: string): number {
  const ms = new Date(end).getTime() - Date.now()
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)))
}

const DISMISS_KEY = 'bellum:subscribe-promo-dismissed'

/** Persisted dismissal, keyed by STATE so an escalation re-shows the bar: a user
 *  who hid the "active window" nudge still sees the "expired" one. Best-effort —
 *  a blocked localStorage never throws. */
function isDismissed(state: string): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === state
  } catch {
    return false
  }
}
function persistDismiss(state: string): void {
  try {
    localStorage.setItem(DISMISS_KEY, state)
  } catch {
    // ignore — dismissal simply won't persist across reloads
  }
}

/**
 * Bandeau global d'incitation à l'abonnement, monté AU-DESSUS de la barre de
 * bandeaux opérateur (`BannerBar`) dans le shell de l'app. Visible sur tout
 * l'app — pas seulement l'écran de facturation, contrairement à `NoLicenseBanner`.
 *
 * Cible : les seuls paliers NON durables — essai et Découverte (`isWindowedPlan`).
 * Un compte payant ne le voit jamais. Deux états :
 *  - fenêtre active → nudge « abonnez-vous pour un accès durable », dismissible ;
 *  - essai expiré → escalade « accès verrouillé », NON dismissible (on ne masque
 *    pas un blocage) et l'ancien dismiss « actif » est ignoré (clé d'état
 *    différente).
 *
 * Ne rend rien (zéro impact layout) hors de sa cible — comme `BannerBar`.
 */
export function SubscribePromoBanner() {
  const { t, i18n } = useTranslation('billing')
  const navigate = useNavigate()
  const { data: credits } = useCredits()
  // Re-render immédiat après dismiss (localStorage persiste entre rechargements).
  const [dismissedState, setDismissedState] = useState<string | null>(null)

  // Espace de démonstration : rien à vendre ici. Le bandeau « Mode démo » tient
  // ce rôle, et un compte démo n'a pas d'essai à « faire expirer ».
  if (credits?.is_demo === true) return null
  if (!credits || !isWindowedPlan(credits.plan)) return null

  const expired = credits.trial_expired === true
  const left = credits.trial_end ? daysLeft(credits.trial_end) : null
  const state = expired ? 'expired' : 'active'
  // #4629 — un espace NEUF est verrouillé dès la première seconde (pas d'essai
  // gratuit, migration NoFreeTrial) : rien n'a été consommé, rien n'a été payé.
  // « Ton essai est terminé » y affirmait une fin qui n'a jamais eu de début.
  // #4629.3 — qui VOIT le bandeau : tout membre (il est global). Qui s'ABONNE : le propriétaire de facturation seul.
  // Absent (`undefined`) = propriétaire, comme `billing-view-model` : on ne ferme pas sur une donnée qu'on n'a pas.
  const canSubscribe = credits.is_billing_owner !== false
  const neverStarted = expired && credits.credits_used === 0 && !credits.stripe_subscription_id

  // L'état expiré ne se masque pas : c'est un blocage, pas un nudge.
  if (!expired && (dismissedState === state || isDismissed(state))) return null

  const tone = expired ? 'danger' : 'accent'
  const Icon = expired ? Lock : Sparkles
  const title = neverStarted
    ? t('subscribePromo.neverStartedTitle')
    : expired
      ? t('subscribePromo.expiredTitle')
      : t('subscribePromo.activeTitle')
  const lead = neverStarted
    ? t('subscribePromo.neverStartedBody')
    : expired
      ? t('subscribePromo.expiredBody')
      : left !== null
        ? t('subscribePromo.activeBody', { count: left })
        : t('subscribePromo.activeBodyFallback')
  // #4629.2 — le verrou ÉNUMÈRE ce qui est fermé (analyses, enrichissements, chat, Découvrir) et ce qui reste
  // ouvert : la même phrase que le refus de l'API. Aucun chiffre de crédits (crédits implicites).
  const locale = i18n.language?.startsWith('en') ? 'en' : 'fr'
  const parts = [
    lead,
    expired ? trialLockEnumeration(locale) : null,
    canSubscribe ? null : t('subscribePromo.ownerOnly'),
  ]
  const body = parts.filter(Boolean).join(' ')

  const handleDismiss = () => {
    persistDismiss(state)
    setDismissedState(state)
  }

  return (
    <Banner
      layout="app"
      tone={tone}
      icon={Icon}
      title={title}
      data-testid="subscribe-promo-banner"
      data-state={state}
      data-never-started={neverStarted ? 'true' : undefined}
      actions={
        // #4629.3 — REFUS : un membre non propriétaire ne reçoit aucun geste d'abonnement (la facturation lui est
        // en lecture seule, `Billing.test.tsx`) ; le bandeau lui dit à qui s'adresser.
        canSubscribe ? (
          <button
            type="button"
            // `search: { offers: true }` et pas un simple `to` : depuis l'écran de
            // facturation lui-même, naviguer vers la même route sans paramètre ne
            // produisait AUCUN effet — le bouton passait pour cassé. Le paramètre
            // demande l'ouverture du sélecteur d'offres, d'où qu'on clique.
            onClick={() => void navigate({ to: '/billing', search: { offers: true } })}
            className={bannerActionClassName(tone)}
          >
            {t('subscribePromo.cta')}
          </button>
        ) : undefined
      }
      onDismiss={expired ? undefined : handleDismiss}
      dismissLabel={t('subscribePromo.dismiss')}
    >
      {body}
    </Banner>
  )
}
