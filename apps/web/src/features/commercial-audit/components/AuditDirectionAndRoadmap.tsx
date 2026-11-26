import { useTranslation } from 'react-i18next'
import type { CommercialAuditContext } from '@bellum/contracts'
import { Text } from '@bellum/ui'
import { AuditCard } from './AuditCard'
import { ConfidenceBadge } from './ConfidenceBadge'

type Props = {
  recommendedDirection: CommercialAuditContext['recommendedDirection']
  conditionalRoadmap: CommercialAuditContext['conditionalRoadmap']
  questionsToRevisit: CommercialAuditContext['questionsToRevisit']
}

/**
 * #2061.15 / #2061.18 / #2061.20 — LA DIRECTION RECOMMANDÉE, LA ROADMAP
 * CONDITIONNELLE ET LES QUESTIONS À REVISITER.
 *
 * Réouverture du 24/09/2026 (#2061) : les trois champs étaient écrits `null`
 * EN DUR et rendus par aucun composant. Les trois dérivent des MÊMES
 * tensions détectées (`tension-detectors.ts`, via
 * `buildRecommendedDirection`/`buildConditionalRoadmap`/
 * `buildQuestionsToRevisit` dans `lib/build-audit.ts`) — trois LECTURES
 * différentes du même matériau (le geste recommandé, le couple
 * condition/geste, la question à valider), jamais une quatrième source
 * inventée à côté (GA-26). À défaut de tension détectée, la direction
 * retombe sur le conseil clé du profileur — jamais une phrase de
 * remplissage.
 *
 * ⚠️ CHAQUE LIGNE EST ÉTIQUETÉE (« Direction : … », « Pourquoi : … »,
 * « Si … alors … », « À valider : … »), jamais une phrase NUE : quand la
 * rupture retenue ici est aussi la première de son genre, `AuditFirstMoves`
 * rend le MÊME `recommendation`/`tension` (nu, lui) et `AuditHypotheses`/
 * `AuditWeeklyPriority` la MÊME `questionToValidate` (nue) — sans étiquette,
 * les deux occurrences seraient un texte strictement identique, ce que
 * `CommercialAuditScreen.test.tsx` (#2090) a mesuré en rouge le 24/09/2026.
 * L'étiquette n'est pas un habillage : c'est ce qui distingue « la même
 * information reprise ailleurs, sous un jour différent » de « la même
 * phrase redite ».
 */
export function AuditDirectionAndRoadmap({ recommendedDirection, conditionalRoadmap, questionsToRevisit }: Props) {
  const { t } = useTranslation('commercialAudit')

  return (
    <section className="space-y-3">
      <Text element="h2" size="lg" weight="semibold">
        {t('direction.title')}
      </Text>

      <AuditCard className="space-y-2">
        <Text element="h3" size="sm" weight="semibold">
          {t('direction.recommendedTitle')}
        </Text>
        {recommendedDirection === null ? (
          <Text element="p" size="sm" className="text-[var(--bellum-text-muted)]">
            {t('direction.recommendedUnmeasured')}
          </Text>
        ) : (
          <div className="space-y-1" data-testid="audit-recommended-direction">
            <div className="flex items-start justify-between gap-2">
              <Text element="p" size="sm" weight="medium">
                {t('direction.recommendedLabel')} : {recommendedDirection.label}
              </Text>
              <ConfidenceBadge confidence={recommendedDirection.confidence} />
            </div>
            {recommendedDirection.rationale === null ? null : (
              <Text element="p" size="xs" className="text-[var(--bellum-text-secondary)]">
                {t('moves.reason')} : {recommendedDirection.rationale}
              </Text>
            )}
          </div>
        )}
      </AuditCard>

      <AuditCard className="space-y-2">
        <Text element="h3" size="sm" weight="semibold">
          {t('direction.roadmapTitle')}
        </Text>
        {conditionalRoadmap === null || conditionalRoadmap.length === 0 ? (
          <Text element="p" size="sm" className="text-[var(--bellum-text-muted)]">
            {conditionalRoadmap === null ? t('direction.roadmapUnmeasured') : t('direction.roadmapEmpty')}
          </Text>
        ) : (
          <ul className="space-y-2" data-testid="audit-conditional-roadmap">
            {conditionalRoadmap.map(item => (
              <li key={item.condition} className="rounded-lg border border-[var(--bellum-border)] p-3">
                <Text element="p" size="xs" className="text-[var(--bellum-text-muted)]">
                  {t('direction.roadmapCondition')} : {item.condition}
                </Text>
                <Text element="p" size="sm">
                  {t('direction.roadmapThen')} : {item.then}
                </Text>
              </li>
            ))}
          </ul>
        )}
      </AuditCard>

      <AuditCard className="space-y-2">
        <Text element="h3" size="sm" weight="semibold">
          {t('direction.questionsTitle')}
        </Text>
        {questionsToRevisit === null || questionsToRevisit.length === 0 ? (
          <Text element="p" size="sm" className="text-[var(--bellum-text-muted)]">
            {questionsToRevisit === null ? t('direction.questionsUnmeasured') : t('direction.questionsEmpty')}
          </Text>
        ) : (
          <ul className="space-y-1.5" data-testid="audit-questions-to-revisit">
            {questionsToRevisit.map(question => (
              <li key={question}>
                <Text element="p" size="sm">
                  {t('direction.questionPrefix')} : {question}
                </Text>
              </li>
            ))}
          </ul>
        )}
      </AuditCard>
    </section>
  )
}
