import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button, Text } from '@bellum/ui'
import type { ProfileContradiction } from '@bellum/contracts'

/**
 * #2088.34 — LA CARTE DE LAURA, sourcée du PROFILEUR (`profile_context.contradiction`),
 * distincte des huit détecteurs déterministes de `onboarding-contradictions.ts`
 * (rendus par `OnboardingContradictionCard`, juste au-dessus sur cet écran).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI UNE CARTE À PART, ET PAS LE MÊME COMPOSANT
 * ─────────────────────────────────────────────────────────────────────────
 * `OnboardingContradictionCard` construit sa phrase depuis un TEMPLATE
 * (`t('contradictions.statement', {x, y})`) sur deux valeurs connues à
 * l'avance. Ici, `statement` ET `reasoning` sont du texte LIBRE écrit par
 * Claude — rendu verbatim, comme `ProfileRecapCard` rend `profileRecap`
 * (même discipline : jamais de template sur une phrase déjà complète).
 *
 * 🔴 Doctrine tranchée le 18/09/2026 : une hypothèse du modèle peut sortir
 * avec son `reasoning`, à condition d'être affichée COMME une hypothèse —
 * jamais une relation établie — et que le `reasoning` reste CONSULTABLE. D'où
 * le badge « Une hypothèse de {{copilot}} » AU-DESSUS de la phrase (jamais un
 * ton qui affirme), et un bouton dédié qui révèle le `reasoning` plutôt que
 * de l'afficher d'emblée en confondant les deux registres.
 *
 * Trois choix, non bloquants (Laura ne bloque pas et ne juge pas, #2088) :
 *  - « Comprendre pourquoi » révèle le `reasoning` — jamais caché pour de
 *    bon, seulement replié ;
 *  - « Revoir mes réponses » renvoie vers une sous-étape modifiable — pas de
 *    cible unique ici (contrairement à `OnboardingContradictionCard`, dont
 *    chaque tension vise DEUX champs précis) : l'appelant passe la première
 *    sous-étape modifiable de l'écran de relecture ;
 *  - « Garder mes réponses » est une réponse LÉGITIME, au même titre que
 *    « Maintenir les deux » sur la carte voisine — le geste ne se mémorise
 *    QUE pour cet écran (état local), jamais en base.
 *
 * Si le profileur ne repère aucune tension, `contradiction` est `null` —
 * l'appelant (`OnboardingReviewPage`) ne monte alors PAS ce composant : une
 * absence ne fait AUCUNE ligne (décision Louis 20/09).
 */
export function OnboardingLauraHypothesisCard({
  contradiction,
  onReview,
}: {
  contradiction: ProfileContradiction
  onReview: (() => void) | null
}) {
  const { t } = useTranslation('onboarding')
  const [understood, setUnderstood] = useState(false)
  const [kept, setKept] = useState(false)

  return (
    <li className="rounded-lg border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-4">
      <div className="inline-flex items-center gap-2 text-[var(--bellum-text-accent)]">
        <Sparkles className="h-4 w-4" aria-hidden="true" />
        <Text element="span" size="xs" weight="semibold">
          {t('contradictions.laura.badge')}
        </Text>
      </div>

      <Text element="p" size="sm" weight="medium" className="mt-2">
        {contradiction.statement}
      </Text>

      {understood && (
        <div className="mt-2">
          <Text element="p" size="xs" weight="medium" className="text-[var(--bellum-text-muted)]">
            {t('contradictions.laura.reasoningLabel')}
          </Text>
          <Text element="p" size="xs" className="mt-0.5 text-[var(--bellum-text-muted)]">
            {contradiction.reasoning}
          </Text>
        </div>
      )}

      {kept ? (
        <Text element="p" size="xs" className="mt-3 text-[var(--bellum-text-muted)]">
          {t('contradictions.laura.actions.kept')}
        </Text>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          {!understood && (
            <Button type="button" variant="ghost" size="sm" onClick={() => setUnderstood(true)}>
              {t('contradictions.laura.actions.understand')}
            </Button>
          )}
          {onReview && (
            <Button type="button" variant="outline" size="sm" onClick={onReview}>
              {t('contradictions.laura.actions.review')}
            </Button>
          )}
          <Button type="button" variant="ghost" size="sm" onClick={() => setKept(true)}>
            {t('contradictions.laura.actions.keep')}
          </Button>
        </div>
      )}
    </li>
  )
}
