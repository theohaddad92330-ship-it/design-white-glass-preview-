import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  needHasConsultantAgreement,
  needHasEngagedConsultant,
  needMatcherGate,
  needPresenterGate,
  needQualitySummary,
  type OpenNeedRow,
} from '@bellum/contracts'
import { Text } from '@bellum/ui'
import { NamedAbsence } from '@/components/feedback/NamedAbsence'
import { useSubmissions } from '@/features/submissions/api'
import { useNeedVerdict } from '../hooks/useNeedVerdict'

/**
 * #2323.46 / #2323.19-.23 — LE RÉSUMÉ QUALITÉ du besoin, sur sa fiche :
 * « matchable, mais pas encore présentable — il manque X ».
 *
 * Il COMPOSE `needMatcherGate` + `needPresenterGate` + `needQualitySummary`
 * (`packages/contracts`) : rien n'est recalculé ici (GA-26). Trois axes
 * NOMMÉS, jamais un score nu, aucune probabilité. Un critère absent se
 * nomme ; il ne bloque jamais (UNKNOWN ≠ ZERO) — sauf la phrase de refus
 * client du type de profil, qui est une réponse reçue, pas une absence.
 *
 * Tant que les positionnements ne sont pas lus, la carte se tait : annoncer
 * « accord consultant manquant » sur une donnée pas encore chargée serait
 * une absence inventée.
 */
export function NeedQualitySummaryCard({ need }: { need: OpenNeedRow }) {
  const { t } = useTranslation('projects')
  const { t: tMatching } = useTranslation('matching')
  const { data, isLoading } = useSubmissions({ projectId: need.project_id ?? undefined })
  // #2323.46 — le verdict de la MÊME fiche (bandeau voisin) : le résumé ne le contredit jamais.
  const { verdict } = useNeedVerdict(need.id)
  const verdictNoGo = verdict?.verdict === 'no_go'

  const summary = useMemo(() => {
    if (data === undefined) return undefined
    const own = data.items.filter(item => item.needId === need.id)
    const presenter = needPresenterGate({
      contact_id: need.contact_id ?? null,
      constraints: need.constraints ?? null,
      budget_cents: need.budget_cents ?? null,
      target_tjm_cents: need.target_tjm_cents,
      presentation_process: need.presentation_process ?? null,
      profile_type_agreement: need.profile_type_agreement,
      hasConsultantAgreement: needHasConsultantAgreement(own),
    })
    return needQualitySummary({
      matcher: needMatcherGate(need),
      presenter,
      hasEngagedConsultant: needHasEngagedConsultant(own),
    })
  }, [data, need])

  // En lecture : rien (jamais un faux « manque »). Lecture échouée : l'absence se NOMME (#4805).
  if (summary === undefined) {
    return isLoading ? null : <NamedAbsence what={t('needSheet.quality.title')} testId="need-quality-summary-absent" />
  }

  const readyToEngage = summary.readyToEngage && !verdictNoGo
  const headlineKey = verdictNoGo
    ? 'verdictNoGo'
    : !summary.matchable
      ? 'notMatchable'
      : !summary.presentable
        ? 'matchableNotPresentable'
        : summary.readyToEngage
          ? 'allClear'
          : 'presentableNotEngaged'
  const missing = [
    ...summary.missingMatcher.map(criterion => tMatching(`launch.gate.${criterion}`)),
    ...summary.missingPresenter.map(criterion => t(`needSheet.quality.criteria.${criterion}`)),
  ]
  const axes = [
    ['matchable', summary.matchable],
    ['presentable', summary.presentable],
    ['readyToEngage', readyToEngage],
  ] as const

  return (
    <section
      data-testid="need-quality-summary"
      className="flex flex-col gap-2 rounded-card border border-[var(--bellum-border)] bg-card p-4"
    >
      <Text element="h3" size="sm" weight="semibold">
        {t('needSheet.quality.title')}
      </Text>
      <Text size="sm">
        {t(`needSheet.quality.headline.${headlineKey}`)}
        {missing.length > 0 ? ` ${t('needSheet.quality.missing', { missing: missing.join(', ') })}` : ''}
      </Text>
      {summary.profileTypeDisagreement ? <Text size="sm">{t('needSheet.quality.profileTypeDisagreement')}</Text> : null}
      <ul className="flex flex-wrap gap-2">
        {axes.map(([axis, ok]) => (
          <li
            key={axis}
            data-testid={`quality-axis-${axis}`}
            className="rounded-control bg-[var(--bellum-surface-2)] px-3 py-1 text-xs"
          >
            {t(`needSheet.quality.axis.${axis}`)} : {ok ? t('needSheet.quality.yes') : t('needSheet.quality.no')}
          </li>
        ))}
      </ul>
    </section>
  )
}
