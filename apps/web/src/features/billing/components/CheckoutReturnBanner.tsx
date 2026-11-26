import { resolveCheckoutReturn, type CheckoutReturnOutcome } from '@bellum/contracts'
import { useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Info, RotateCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useCredits } from '@/features/credits/hooks/useCredits'
import { Banner, bannerActionClassName } from '@/components/layout/Banner'
import { announceCheckoutReturn } from '../model/checkout-return-announcement'

/**
 * Ce que le client lit en revenant de la page de paiement (#2003.23, #2004.16).
 *
 * **Pourquoi ce bandeau vit à la racine de l'application et pas sur `/billing`.**
 * La page de paiement renvoie sur `/billing?success=true`, mais `/billing` vit
 * dans `SettingsPage`, qui réexpédie vers `/onboarding` tant que le
 * questionnaire n'est pas fini — c'est-à-dire exactement l'état de quelqu'un qui
 * vient de s'inscrire et de payer. Un bandeau monté sur l'écran de facturation
 * ne serait donc jamais lu par le seul public concerné. Monté ici, il est déjà
 * là quand le renvoi se produit, et le retour est lu AVANT que l'URL change.
 *
 * **Pourquoi `window.location.search` et pas le routeur.** C'est le chargement
 * de page provoqué par le fournisseur de paiement qui porte l'information ; la
 * lire une fois, au montage, la met à l'abri de toute navigation ultérieure.
 * Aucun stockage n'est nécessaire : l'application ne se remonte pas entre le
 * retour et le renvoi.
 *
 * Rien à annoncer ⇒ aucun rendu, donc zéro impact de mise en page — la même
 * règle que `CreditsAlertBanner` et `BannerBar`, avec lesquels il partage la
 * barre.
 */
export function CheckoutReturnBanner() {
  const { t } = useTranslation('billing')
  const queryClient = useQueryClient()
  const { data: credits } = useCredits()
  // Lu UNE fois, au montage : l'initialiseur paresseux de `useState` ne rejoue
  // pas au rendu suivant, donc une navigation qui nettoie l'URL n'efface pas
  // l'annonce en cours de lecture.
  const [outcome, setOutcome] = useState<CheckoutReturnOutcome>(() =>
    typeof window === 'undefined' ? 'none' : resolveCheckoutReturn(window.location.search),
  )

  const announcement = announceCheckoutReturn({ outcome, credits })
  const refetch = announcement?.refetch ?? false

  // Relire le solde : c'est LA chose qui a changé pour lui. Le webhook qui
  // crédite l'espace est asynchrone, donc cette relecture peut arriver trop
  // tôt — c'est pourquoi l'annonce dit « activation en cours » plutôt qu'un
  // chiffre, et propose de relire.
  useEffect(() => {
    if (!refetch) return
    void queryClient.invalidateQueries({ queryKey: ['credits'] })
  }, [refetch, queryClient])

  if (!announcement) return null

  const pending = announcement.activation === 'pending'
  const tone = announcement.tone === 'success' ? 'success' : 'info'
  const Icon = announcement.tone === 'success' ? CheckCircle2 : Info

  // Le corps NOMME l'offre quand elle est lue sur le compte, et dit l'activation
  // en cours sinon. #4466 — jamais un solde : les crédits ne s'annoncent plus.
  const body = pending
    ? t('checkoutReturn.activationPending')
    : t(announcement.bodyKey, { plan: announcement.plan ?? '' })

  return (
    <Banner
      layout="app"
      tone={tone}
      icon={Icon}
      title={t(announcement.titleKey)}
      data-testid="checkout-return-banner"
      data-outcome={announcement.outcome}
      data-activation={announcement.activation ?? 'none'}
      actions={
        pending ? (
          <button
            type="button"
            onClick={() => void queryClient.invalidateQueries({ queryKey: ['credits'] })}
            className={bannerActionClassName(tone)}
          >
            <RotateCw aria-hidden className="size-4" />
            {t('checkoutReturn.recheck')}
          </button>
        ) : null
      }
      onDismiss={() => setOutcome('none')}
      dismissLabel={t('checkoutReturn.dismiss')}
    >
      {body}
    </Banner>
  )
}
