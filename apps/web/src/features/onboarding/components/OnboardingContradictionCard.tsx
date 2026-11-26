import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Text } from '@bellum/ui'
import type { ContradictionView } from '@/features/onboarding/lib/onboarding-contradictions'
import type { ReviewEditTarget } from '@/features/onboarding/lib/onboarding-review-blocks'
import { ONBOARDING_REVIEW_SCREEN } from '@/features/onboarding/lib/tracking'
import { trackContradictionResolved } from '@/lib/product-tracker'

/**
 * #2030.13 — LA CONTRADICTION EST MISE EN ÉVIDENCE, sur l'écran de relecture.
 *
 * Les huit détecteurs (#2029.1→.8) et leurs textes étaient ÉCRITS, testés et
 * bilingues depuis le 15/09 — et `buildQuestionnaireContradictions` n'avait
 * AUCUN appelant : du code juste que personne ne rendait, le défaut n°1 de ce
 * dépôt. C'est ce composant, et son montage dans `OnboardingReviewPage`, qui le
 * rend enfin visible. Rien n'a été recalculé : la détection, la phrase et la
 * cible de correction viennent toutes de la fonction qui existait déjà.
 *
 * Trois issues, jamais deux (#2029.10) :
 *  - « Expliquer » révèle l'HYPOTHÈSE d'audit (#2029.11) — une question à se
 *    poser, jamais une faute constatée ;
 *  - « Corriger » renvoie à la question en tension, et n'est rendu QUE si une
 *    cible existe (`editTarget`) : un renvoi deviné vaudrait pire qu'aucun
 *    bouton (#2030.9) ;
 *  - « Maintenir les deux » est une réponse LÉGITIME. Une contradiction n'est
 *    pas une erreur de saisie : deux réponses peuvent tirer en sens opposé et
 *    être vraies toutes les deux.
 *
 * ⚠️ « Maintenir les deux » vit dans l'ÉTAT DE CET ÉCRAN, pas en base, et c'est
 * délibéré : l'écran de relecture est le dernier geste avant la génération, la
 * décision ne porte que jusque-là. Rien à l'écran ne promet qu'elle est
 * mémorisée — la phrase de confirmation parle du geste (« Tu as confirmé »),
 * pas d'un réglage enregistré.
 *
 * #2085.6 — « contradiction corrigée » (analytique produit) : les deux gestes
 * qui RÉSOLVENT réellement la tension (« Corriger », « Maintenir les deux »)
 * émettent `trackContradictionResolved`. « Expliquer » n'émet rien : ça révèle
 * l'hypothèse, ça ne résout rien (la personne peut encore choisir ensuite).
 */
export function OnboardingContradictionCard({
  contradiction,
  onModify,
}: {
  contradiction: ContradictionView
  onModify: (target: ReviewEditTarget) => void
}) {
  const { t } = useTranslation('onboarding')
  const [explained, setExplained] = useState(false)
  const [kept, setKept] = useState(false)

  return (
    <li className="rounded-lg border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-4">
      {/* #2029.9 — la phrase reprend X et Y tels que la personne les a donnés.
          Aucune troisième valeur devinée, aucun jugement. */}
      <Text element="p" size="sm" weight="medium">
        {t('contradictions.statement', { x: contradiction.x, y: contradiction.y })}
      </Text>

      {explained && (
        <Text element="p" size="xs" className="mt-2 text-[var(--bellum-text-muted)]">
          {t(contradiction.hypothesisKey)}
        </Text>
      )}

      {kept ? (
        <Text element="p" size="xs" className="mt-3 text-[var(--bellum-text-muted)]">
          {t('contradictions.actions.kept')}
        </Text>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          {!explained && (
            <Button type="button" variant="ghost" size="sm" onClick={() => setExplained(true)}>
              {t('contradictions.actions.explain')}
            </Button>
          )}
          {contradiction.editTarget && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                trackContradictionResolved(ONBOARDING_REVIEW_SCREEN, 'corrected')
                onModify(contradiction.editTarget!)
              }}
            >
              {t('contradictions.actions.correct')}
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              trackContradictionResolved(ONBOARDING_REVIEW_SCREEN, 'keptBoth')
              setKept(true)
            }}
          >
            {t('contradictions.actions.keepBoth')}
          </Button>
        </div>
      )}
    </li>
  )
}
