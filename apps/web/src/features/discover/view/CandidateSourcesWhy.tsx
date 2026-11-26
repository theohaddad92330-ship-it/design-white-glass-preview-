import { useTranslation } from 'react-i18next'
import { decisiveSourceAxes, type DiscoverSourceAxes, type DiscoverSourceAxis } from '@bellum/contracts'
import { sourceAgeLabel, sourceEvidenceCount, sourceEvidenceKey } from '@/features/discover/lib/discover-source-axes'

/**
 * #4067 (Louis 12/10) — CE QUE L'ESPACE SAIT DÉJÀ de ce candidat, en points :
 * c'est un SCORE (points sur plafond), donc ses axes non évaluables restent
 * NOMMÉS (GA-18) — jamais un 0. Un fait ancien dit son âge (« il y a 8 mois »).
 *
 * #4068 (Louis 13/10) — la ligne « Pourquoi » de la carte n'existe plus : les
 * faits DATÉS de l'espace concourent aux places des signaux forts
 * (`candidateCardFacts`). Ne reste, dans le repliable, que ce détail des points.
 * Rien de décisif ⇒ aucun bloc.
 */
export function CandidateSourcesWhy({
  sourceAxes,
  now = new Date(),
}: {
  sourceAxes: DiscoverSourceAxes | undefined
  now?: Date
}) {
  const { t } = useTranslation('discover')
  const decisive = decisiveSourceAxes(sourceAxes)
  if (!sourceAxes || decisive.length === 0) return null

  const evidence = (axis: DiscoverSourceAxis) => {
    const age = sourceAgeLabel(axis.latestAt, now)
    return (
      <>
        <span className="font-medium" style={{ color: 'var(--text-muted)' }}>
          {t(`sourceAxes.axis.${axis.key}`)}
        </span>{' '}
        {t(`sourceAxes.evidence.${sourceEvidenceKey(axis, now)}`, {
          ...axis.label_params,
          count: sourceEvidenceCount(axis),
        })}
        {age && <span style={{ color: 'var(--text-ghost)' }}> ({t(age.key, { count: age.count })})</span>}
      </>
    )
  }

  const detail = (
    <div
      data-testid="sources-why-detail"
      className="mt-2 rounded-md p-2.5"
      style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}
    >
      <p className="mb-1.5 text-xs uppercase tracking-wider" style={{ color: 'var(--text-ghost)' }}>
        {t('sourceAxes.detailTitle')}
      </p>
      <ul className="space-y-1">
        {sourceAxes.axes
          .filter(axis => axis.measured)
          .map(axis => (
            <li key={axis.key} className="flex flex-wrap justify-between gap-x-3">
              <span className="min-w-0">{evidence(axis)}</span>
              {/* #4306.3 — un repère NOMMÉ par source (trouvé / rien trouvé), plus de « points sur 60 » à interpréter. */}
              <span className="font-semibold" style={{ color: 'var(--text-secondary)' }}>
                {t(axis.points > 0 ? 'sourceAxes.mark.found' : 'sourceAxes.mark.nothing')}
              </span>
            </li>
          ))}
      </ul>
      {/* #4306 — une PHRASE qui dit ce qui est compté (des points sur les seules sources lues), pas « 25 / 60 » nu. */}
      <p className="mt-1.5" style={{ color: 'var(--text-muted)' }}>
        {t('sourceAxes.total')}
      </p>
      {sourceAxes.unmeasured.length > 0 && (
        <p className="mt-1" style={{ color: 'var(--text-ghost)' }}>
          {t('sourceAxes.unmeasured')} {sourceAxes.unmeasured.map(key => t(`sourceAxes.axis.${key}`)).join(', ')}
        </p>
      )}
    </div>
  )

  return (
    <div className="mb-2 text-xs leading-snug" style={{ color: 'var(--text-secondary)' }}>
      {detail}
    </div>
  )
}
