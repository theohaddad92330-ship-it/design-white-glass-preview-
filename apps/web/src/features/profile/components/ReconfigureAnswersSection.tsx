import { useTranslation } from 'react-i18next'
import { SettingsBlock } from '@/features/settings/components/SettingsBlock'
import { toast } from 'sonner'
import { Button, Text } from '@bellum/ui'
import { reconfigurationPlan } from '@/features/onboarding/lib/onboarding-gate'
import { useEsnProfile } from '@/features/profile/hooks/useEsnProfile'
import { useReconfigureOnboarding } from '@/features/profile/hooks/useReconfigureOnboarding'

/**
 * #2022 — « je veux revoir mes réponses », depuis Réglages › Profil.
 *
 * L'ENTRÉE qui manquait. `POST /onboarding/refresh` pose `refresh_required`,
 * le seul état que `resolveOnboardingEntry` traduit en page de reconfiguration
 * guidée ; l'endpoint, son service et ses tests existaient depuis #2004.10 et
 * `git grep requestRefresh -- apps/web/src` ne rendait que des tests. Un
 * espace déjà configuré n'avait donc AUCUN chemin vers la reconfiguration.
 *
 * Trois choses que cet écran ne fait pas, et chacune est une décision :
 *
 *  1. **Aucun déclenchement automatique.** Le déclencheur (une durée écoulée ?
 *     un changement d'offre détecté ?) n'est pas tranché — `requestRefresh`
 *     l'écrit noir sur blanc. On ne l'invente pas : le geste est un clic.
 *  2. **Rien ne s'affiche AVANT le démarrage.** `not_started` est le seul
 *     départ qui reste illégal — tout statut postérieur (`in_progress`, les
 *     huit états du parcours fin, `completed`/`activated`, ou déjà
 *     `refresh_required`) est un départ légal (`ONBOARDING_TRANSITIONS`,
 *     élargi le 27/09/2026 — DÉCISION Louis, recette écran, #2021) : proposer
 *     le bouton à un utilisateur qui n'a encore rien commencé offrirait un
 *     geste que le serveur refuse ; le lui cacher une fois commencé ne
 *     protégeait plus rien.
 *  3. **Rien en démonstration.** L'espace de démo est PARTAGÉ : un visiteur
 *     qui cliquerait ici basculerait le compte que le prospect suivant va
 *     ouvrir en `refresh_required`, et le prospect suivant atterrirait sur un
 *     questionnaire. Vide à dessein, donc, et pour cette raison-là.
 *  4. **On ne nomme que ce qu'on sait MESURER.** L'issue demande quatre
 *     familles — champs nouveaux, ambiguïtés, contradictions, informations
 *     devenues obsolètes. Une seule est mesurable : une réponse absente
 *     (`reconfigurationPlan`). Les trois autres supposent une date PAR
 *     RÉPONSE que ni `esn_profiles` ni `OnboardingStateResponse` ne portent.
 *     Elles sont donc NOMMÉES comme non mesurées, jamais comptées à zéro.
 */
export function ReconfigureAnswersSection() {
  const { t } = useTranslation('onboarding')
  const { data: answers } = useEsnProfile()
  const { available, alreadyRequested, pending, trigger } = useReconfigureOnboarding()

  if (!available) return null

  const plan = reconfigurationPlan(answers)
  const minutes = plan.estimatedMinutes

  const onRequest = async (): Promise<void> => {
    // #2572.1 — mesuré en production le 18/09 : sauter l'appel quand
    // `alreadyRequested` (comme ce code le faisait avant ce correctif)
    // laissait un `skipped_at` posé APRÈS la demande précédente (un « Plus
    // tard » depuis le questionnaire, #2579.2) traîner pour toujours — le
    // clic naviguait sans jamais purger le report périmé, et
    // `needsOnboarding` (web) renvoyait aussitôt le compte hors du
    // questionnaire qu'il venait pourtant de redemander.
    // `refresh_required → refresh_required` EST légal : l'API le traite en
    // idempotence (#2004.11) et purge le report périmé dans ce cas aussi
    // (#2572.2) — rappeler `trigger()` ici ne fait donc PAS échouer le
    // geste. Le clic est le geste humain le plus récent, il doit gagner sur
    // un report plus ancien.
    const ok = await trigger()
    // Un état non posé ne s'annonce pas : pas de navigation, un message.
    if (!ok) toast.error(t('reconfigure.error'))
  }

  return (
    <SettingsBlock label={t('reconfigure.title')} description={t('reconfigure.subtitle')}>
      {/* Maquette Théo V22 `settings-espace#profil` — `.v12-setting-row` : l'intitulé et ses faits à gauche, le geste à
          droite (au-dessous sous 768 px). */}
      <div className="flex flex-col items-start gap-3 px-5 py-4 sm:px-6 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 space-y-1">
          <Text element="h3" size="sm" weight="semibold">
            {t('reconfigure.rowTitle')}
          </Text>
          <Text element="p" size="xs" className="text-[var(--bellum-text-secondary)]">
            {plan.keys.length > 0
              ? t('reconfigure.missing.some', { count: plan.keys.length })
              : t('reconfigure.missing.none')}
          </Text>
          {/* La fourchette n'existe QUE s'il reste quelque chose à compléter :
              « 0 minute » n'est pas une durée, et une durée inventée serait
              pire. `reconfigurationPlan` rend `null`, et `null` ne s'affiche
              pas — il ne se replie pas sur zéro. */}
          {minutes && (
            <Text element="p" size="xs" className="text-[var(--bellum-text-secondary)]">
              {t('reconfigure.duration', { min: minutes.min, max: minutes.max })}
            </Text>
          )}
          <Text element="p" size="xs" className="text-[var(--bellum-text-secondary)]">
            {t('reconfigure.unmeasured')}
          </Text>
          {alreadyRequested && (
            <Text element="p" size="xs" className="text-[var(--bellum-text-secondary)]">
              {t('reconfigure.pending')}
            </Text>
          )}
        </div>

        <Button
          type="button"
          variant="outline"
          className="shrink-0 pointer-coarse:min-h-11"
          isLoading={pending}
          disabled={pending}
          onClick={() => void onRequest()}
        >
          {alreadyRequested ? t('reconfigure.resume') : t('reconfigure.cta')}
        </Button>
      </div>
    </SettingsBlock>
  )
}
