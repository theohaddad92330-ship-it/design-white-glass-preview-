import { useTranslation } from 'react-i18next'
import type { OnboardingRestitution } from '@bellum/contracts'
import { Button, FieldText, Text } from '@bellum/ui'

/**
 * #3252 (BEL-SC-223) — LA RESTITUTION DE FIN D'ONBOARDING. Rendue sur
 * `/welcome` (surface « Onboarding final ») ET `/settings/profile/context`
 * (surface « Paramètres › Profil »), UN composant, DEUX emplacements — même
 * convention que `CoachingFooter` (GA-26) : jamais une copie qui pourrait
 * diverger.
 *
 * #3252.11 — chaque ligne « comprise » NOMME sa provenance (déclaré/observé)
 * plutôt que de prétendre à un diagnostic certain ; la confiance reste
 * catégorielle (jamais un pourcentage, doctrine). Le maillon faible n'y figure
 * plus : il ne vit que dans le Cockpit (décision Louis 19/10 — maillon faible :
 * Cockpit seul). #3252.14 (NO-GO) — cet écran ne se réduit jamais à « Ton profil
 * est terminé » : chaque section absente EXCLUT sa carte plutôt que de
 * rendre un vide, mais le bloc entier ne se tait que si les six sections
 * sont TOUTES vides (`buildOnboardingRestitution`, `@bellum/contracts`).
 */
export function OnboardingRestitutionCard({
  restitution,
  onNotMyContext,
  onRefineWithLaura,
  onStartFirstWorksite,
  notMyContextPending = false,
}: {
  restitution: OnboardingRestitution
  onNotMyContext: () => void
  onRefineWithLaura: () => void
  onStartFirstWorksite: () => void
  notMyContextPending?: boolean
}) {
  const { t } = useTranslation('welcome')
  const { understanding, notRecommended, priorities, firstTest, gaps } = restitution

  const isEmpty =
    understanding.length === 0 &&
    notRecommended.length === 0 &&
    priorities.length === 0 &&
    !firstTest &&
    gaps.length === 0
  if (isEmpty) return null

  return (
    <div
      data-testid="onboarding-restitution"
      className="space-y-6 rounded-xl border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-6"
    >
      {understanding.length > 0 && (
        <section aria-labelledby="restitution-understanding-title">
          <Text
            id="restitution-understanding-title"
            element="h2"
            size="sm"
            weight="semibold"
            className="text-[var(--bellum-text-muted)]"
          >
            {t('restitution.understanding.title')}
          </Text>
          <dl className="mt-3 grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
            {understanding.map(row => (
              <div key={row.key} className="min-w-0 space-y-0.5">
                <dt className="text-xs font-medium uppercase tracking-wide text-[var(--bellum-text-muted)]">
                  {t(`restitution.understanding.axis.${row.key}`)}
                </dt>
                <dd className="text-sm font-medium text-[var(--bellum-text-primary)]">
                  <FieldText value={row.value} />
                </dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {notRecommended.length > 0 && (
        <section className="space-y-2 border-t border-[var(--bellum-border)] pt-4">
          <Text element="h2" size="sm" weight="semibold" className="text-[var(--bellum-text-muted)]">
            {t('restitution.notRecommended.title')}
          </Text>
          <ul className="list-none space-y-1 p-0">
            {notRecommended.map(key => (
              <li key={key}>
                <Text element="p" size="sm" className="text-[var(--bellum-text-secondary)]">
                  {t(`restitution.notRecommended.item.${key}`)}
                </Text>
              </li>
            ))}
          </ul>
        </section>
      )}

      {priorities.length > 0 && (
        <section className="space-y-2 border-t border-[var(--bellum-border)] pt-4">
          <Text element="h2" size="sm" weight="semibold" className="text-[var(--bellum-text-muted)]">
            {t('restitution.priorities.title')}
          </Text>
          <ol className="list-none space-y-2 p-0">
            {priorities.map((key, index) => (
              <li key={key} className="flex gap-2">
                <Text element="span" size="sm" weight="semibold" className="text-[var(--bellum-text-accent)]">
                  {index + 1}.
                </Text>
                <div className="min-w-0">
                  <Text element="p" size="sm" weight="medium">
                    {t(`restitution.priorities.item.${key}.label`)}
                  </Text>
                  <Text element="p" size="xs" className="text-[var(--bellum-text-muted)]">
                    {t(`restitution.priorities.item.${key}.reason`)}
                  </Text>
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      {firstTest && (
        <section className="space-y-2 border-t border-[var(--bellum-border)] pt-4">
          <Text element="h2" size="sm" weight="semibold" className="text-[var(--bellum-text-muted)]">
            {t('restitution.firstTest.title')}
          </Text>
          <Text element="p" size="sm">
            {t(`restitution.firstTest.item.${firstTest.priority}`, { minutes: firstTest.estimatedMinutes })}
          </Text>
        </section>
      )}

      {gaps.length > 0 && (
        <section className="space-y-2 border-t border-[var(--bellum-border)] pt-4">
          <Text element="h2" size="sm" weight="semibold" className="text-[var(--bellum-text-muted)]">
            {t('restitution.gaps.title')}
          </Text>
          <ul className="list-none space-y-1 p-0">
            {gaps.map(key => (
              <li key={key}>
                <Text element="p" size="xs" className="text-[var(--bellum-text-muted)]">
                  {t(`restitution.gaps.item.${key}`)}
                </Text>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex flex-wrap gap-3 border-t border-[var(--bellum-border)] pt-4">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onNotMyContext}
          isLoading={notMyContextPending}
          disabled={notMyContextPending}
        >
          {t('restitution.actions.notMyContext')}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={onRefineWithLaura}>
          {t('restitution.actions.refineWithLaura')}
        </Button>
        <Button type="button" variant="default" size="sm" onClick={onStartFirstWorksite}>
          {t('restitution.actions.startFirstWorksite')}
        </Button>
      </div>
    </div>
  )
}
