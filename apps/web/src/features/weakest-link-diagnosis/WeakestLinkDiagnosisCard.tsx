import { UNWIRED_BOTTLENECK_FAMILY_REASON, type WeakestLinkDiagnosis } from '@bellum/contracts'
import { Badge, Box, Card, Spinner, Text } from '@bellum/ui'
import { AlertTriangle } from 'lucide-react'
import { useTranslation } from 'react-i18next'

/**
 * #3414 (lot X42) — « chargement » et « pas de diagnostic » occupent la MÊME hauteur : cette carte
 * est posée au-dessus de « À faire maintenant » / « Tes tâches », et le passage de l'un à l'autre
 * (76 px → 52 px mesurés) faisait remonter tout l'écran à l'arrivée de la réponse.
 */
const PLACEHOLDER_MIN_HEIGHT = 'min-h-[4.75rem]'

/**
 * BEL-SC-224 (#3253, P0) — LA CARTE DU DIAGNOSTIC DU MAILLON FAIBLE.
 *
 * Rend `WeakestLinkDiagnosis` tel qu'il arrive de la façade unique
 * (`useWeakestLinkDiagnosis`). Contrairement à `AccountStrategy5PCard`, cette
 * carte NE reste PAS silencieuse le temps d'un chargement ou d'un échec — sa
 * position (première chose lue au-dessus des priorités) en fait la réponse à
 * « qu'est-ce qui limite le plus, avant d'ouvrir de nouveaux comptes ? » ; un
 * silence s'y lirait comme « rien ne bloque », ce que ni un chargement ni un
 * échec ne permettent d'affirmer.
 *
 * `primary_bottleneck: null` (pas assez de signal) est un état HONNÊTE,
 * distinct d'une erreur — jamais confondu (doctrine « non mesuré ≠ 0 »).
 */
export function WeakestLinkDiagnosisCard({
  diagnosis,
  isLoading,
  isError,
}: {
  diagnosis: WeakestLinkDiagnosis | null | undefined
  isLoading: boolean
  isError: boolean
}) {
  const { t } = useTranslation('briefing')

  if (isLoading) {
    return (
      <Card className={`flex items-center gap-2 p-4 ${PLACEHOLDER_MIN_HEIGHT}`}>
        <Spinner className="size-4" />
        <Text size="sm" className="text-[var(--bellum-text-secondary)]">
          {t('weakestLink.loading')}
        </Text>
      </Card>
    )
  }

  if (isError || !diagnosis) {
    return (
      <Card className={`flex items-center p-4 ${PLACEHOLDER_MIN_HEIGHT}`}>
        <Text size="sm" className="text-[var(--bellum-text-secondary)]">
          {t('weakestLink.error')}
        </Text>
      </Card>
    )
  }

  const { primary_bottleneck: primary } = diagnosis
  // Une API d'avant ces champs (ou une réponse partielle) ne les porte pas : absent = aucun bloc.
  const secondary = diagnosis.secondary_bottlenecks ?? []
  const notEvaluableAll = diagnosis.not_evaluable_families ?? []
  // #3294 — les familles que le moteur mesure mais n'a pas pu évaluer ici (leur raison
  // est propre : « 11 mission(s) active(s), aucune avec tarif et coût ») sont NOMMÉES ;
  // celles qu'il ne sait pas encore mesurer sont comptées, jamais listées une à une.
  const notEvaluable = notEvaluableAll.filter(f => f.reason !== UNWIRED_BOTTLENECK_FAMILY_REASON)
  const unwiredCount = notEvaluableAll.length - notEvaluable.length

  if (!primary) {
    return (
      <Card className="p-4">
        <Text element="h3" size="sm" weight="semibold">
          {t('weakestLink.title')}
        </Text>
        <Text size="sm" className="mt-1 block text-[var(--bellum-text-secondary)]">
          {t('weakestLink.notEnoughSignal')}
        </Text>
      </Card>
    )
  }

  return (
    <Card className="gap-0 overflow-hidden p-0 [--card-spacing:0px]">
      <Box className="flex items-start gap-2 px-4 py-4">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[var(--bellum-text-accent)]" aria-hidden />
        <Box className="flex flex-col gap-1">
          <Box className="flex flex-wrap items-center gap-2">
            <Text element="h3" size="sm" weight="semibold">
              {t('weakestLink.title')}
            </Text>
            <Badge variant="outline" className="text-xs">
              {t(`weakestLink.families.${primary.family}`)}
            </Badge>
          </Box>
          <Text size="sm" className="block text-[var(--bellum-text-secondary)]">
            {primary.business_impact}
          </Text>
          {diagnosis.change_explanation ? (
            <Text size="xs" className="block text-[var(--bellum-text-muted)]">
              {diagnosis.change_explanation}
            </Text>
          ) : null}
        </Box>
      </Box>

      {primary.supporting_evidence.length > 0 ? (
        <Box className="border-t border-[var(--bellum-border)] px-4 py-3">
          <Text size="xs" weight="semibold" className="block text-[var(--bellum-text-muted)]">
            {t('weakestLink.evidence')}
          </Text>
          <ul className="mt-1 list-disc pl-4">
            {primary.supporting_evidence.map(item => (
              <li key={item}>
                <Text size="sm" className="text-[var(--bellum-text-secondary)]">
                  {item}
                </Text>
              </li>
            ))}
          </ul>
        </Box>
      ) : null}

      {primary.contradictory_evidence.length > 0 ? (
        <Box className="border-t border-[var(--bellum-border)] px-4 py-3">
          <Text size="xs" weight="semibold" className="block text-[var(--bellum-text-muted)]">
            {t('weakestLink.contradictoryEvidence')}
          </Text>
          <ul className="mt-1 list-disc pl-4">
            {primary.contradictory_evidence.map(item => (
              <li key={item}>
                <Text size="sm" className="text-[var(--bellum-text-secondary)]">
                  {item}
                </Text>
              </li>
            ))}
          </ul>
        </Box>
      ) : null}

      <Box className="border-t border-[var(--bellum-border)] px-4 py-3">
        <Text size="xs" weight="semibold" className="block text-[var(--bellum-text-muted)]">
          {t('weakestLink.recommendedExperiment')}
        </Text>
        <Text size="sm" className="mt-1 block text-[var(--bellum-text-secondary)]">
          {primary.recommended_experiment}
        </Text>
      </Box>

      {primary.actions_to_stop.length > 0 ? (
        <Box className="border-t border-[var(--bellum-border)] px-4 py-3">
          <Text size="xs" weight="semibold" className="block text-[var(--bellum-text-muted)]">
            {t('weakestLink.actionsToStop')}
          </Text>
          <ul className="mt-1 list-disc pl-4">
            {primary.actions_to_stop.map(item => (
              <li key={item}>
                <Text size="sm" className="text-[var(--bellum-text-secondary)]">
                  {item}
                </Text>
              </li>
            ))}
          </ul>
        </Box>
      ) : null}

      {secondary.length > 0 ? (
        <Box className="border-t border-[var(--bellum-border)] px-4 py-3">
          <Text size="xs" weight="semibold" className="block text-[var(--bellum-text-muted)]">
            {t('weakestLink.secondary')}
          </Text>
          <ul className="mt-1 list-disc pl-4">
            {secondary.map(item => (
              <li key={item.family}>
                <Text size="sm" className="text-[var(--bellum-text-secondary)]">
                  <span className="font-medium">{t(`weakestLink.families.${item.family}`)}</span>
                  {' — '}
                  {item.business_impact}
                </Text>
              </li>
            ))}
          </ul>
        </Box>
      ) : null}

      {notEvaluable.length > 0 || unwiredCount > 0 ? (
        <Box className="border-t border-[var(--bellum-border)] px-4 py-3">
          <Text size="xs" weight="semibold" className="block text-[var(--bellum-text-muted)]">
            {t('weakestLink.notEvaluated')}
          </Text>
          {notEvaluable.length > 0 ? (
            <ul className="mt-1 list-disc pl-4">
              {notEvaluable.map(item => (
                <li key={item.family}>
                  <Text size="sm" className="text-[var(--bellum-text-secondary)]">
                    {/* #3737 — nom NEUTRE : un maillon non évalué ne porte jamais un titre de verdict. */}
                    {t(`weakestLink.areas.${item.family}`)} — {item.reason}
                  </Text>
                </li>
              ))}
            </ul>
          ) : null}
          {unwiredCount > 0 ? (
            <Text size="xs" className="mt-1 block text-[var(--bellum-text-muted)]">
              {t('weakestLink.unwired', { count: unwiredCount })}
            </Text>
          ) : null}
        </Box>
      ) : null}

      <Box className="border-t border-[var(--bellum-border)] px-4 py-3">
        <Text size="xs" className="block text-[var(--bellum-text-muted)]">
          {t('weakestLink.reviewDate', { date: primary.review_date })}
        </Text>
      </Box>
    </Card>
  )
}
