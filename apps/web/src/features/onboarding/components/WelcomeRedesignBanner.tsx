import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Sparkles } from 'lucide-react'
import { Banner } from '@/components/layout/Banner'
import { onboardingApi } from '../api'
import { useDeferredEnabled } from '@/lib/hooks/use-deferred-enabled'

/**
 * #2897 (#2091.36, #2091.37) — « BellumAI a été entièrement repensé », pour
 * un compte dont l'onboarding s'est terminé AVANT la refonte de l'écran
 * Welcome (`WELCOME_REDESIGN_DATE`, `packages/contracts/src/schemas/
 * welcome-redesign.ts`) et qui ne l'a pas déjà fermée.
 *
 * Le titre reprend le texte de l'épopée mot pour mot (#2897 : « BellumAI a
 * été entièrement repensé ») — un narratif de relance produit ne s'invente
 * pas, seule la SOURCE écrite en donne le droit. « Réponses reprises »
 * (#2091.37) : le mécanisme existe déjà (`GET /onboarding/state` renvoie les
 * réponses enregistrées, jamais une page blanche) — ce bandeau se contente
 * de le DIRE, il n'ajoute aucune plomberie de reprise.
 *
 * Fermeture DÉFINITIVE (pas de « plus tard ») — même choix produit que
 * `ProfileComplementCard` (« ne plus me le proposer »), mémorisée côté
 * serveur (`user_onboarding_state.redesign_banner_dismissed_at`).
 */
export function WelcomeRedesignBanner() {
  const { t } = useTranslation('onboarding')
  const [visible, setVisible] = useState(false)
  const [dismissing, setDismissing] = useState(false)
  // perf P3 — un bandeau de reprise de contexte n'est pas sur le chemin critique.
  const calm = useDeferredEnabled()

  useEffect(() => {
    if (!calm) return
    let alive = true
    onboardingApi
      .getRedesignBanner()
      .then(state => {
        if (alive) setVisible(state.visible)
      })
      .catch(() => {
        // Un problème de lecture n'affiche rien plutôt qu'un bandeau bancal —
        // le geste n'est jamais bloquant (même doctrine que ProfileComplementCard).
      })
    return () => {
      alive = false
    }
  }, [calm])

  if (!visible) return null

  const dismiss = () => {
    if (dismissing) return
    setDismissing(true)
    setVisible(false)
    void onboardingApi.dismissRedesignBanner().catch(() => {
      // Best-effort : la bannière reste fermée côté écran même si la
      // mémorisation serveur échoue — elle revient au pire à la prochaine
      // visite, jamais un blocage sur un geste de fermeture.
    })
  }

  return (
    <Banner layout="app" tone="accent" icon={Sparkles} onDismiss={dismiss} dismissLabel={t('redesignBanner.dismiss')}>
      {t('redesignBanner.message')}
    </Banner>
  )
}
