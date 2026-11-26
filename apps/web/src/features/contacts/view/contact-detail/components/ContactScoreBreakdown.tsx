import type { Contact } from '@bellum/contracts'
import { Badge, Box, Text, cn } from '@bellum/ui'
import { Gauge } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { contactScoreView, hasStaleEmployer, scoreLabel, scoreTone } from '../contactDerive'
import { SectionCard } from './SectionCard'

/** Ancre de la carte — #1129 : l'entête y amène depuis le score. */
export const SCORE_BREAKDOWN_ID = 'contact-score-breakdown'

/**
 * The criteria BEHIND the score shown in the header — not a second score.
 *
 * The card renders the breakdown the API computed alongside `contact_score`, so
 * the total here is by construction the number in the header. It previously
 * recomputed the grid in the browser from the contact row alone (no perimeter
 * tier, no angles) and therefore displayed a *different* /100 under a *different*
 * name — the "79 vs 69" the fiche shipped with.
 *
 * Criteria the account context couldn't evaluate are shown as such and are
 * excluded from the total's denominator: a contact must not look worse because
 * information is MISSING. The coverage line states what the /100 was read over.
 */
/**
 * Théo B c5-fiche-contact — « aucun score en points » (cadre commun, Louis 23/10) : la maquette écrivait
 * « priorité 8 / 9 » et « 3 / 3 » par axe ; la fiche écrit le MOT de priorité et, pour chaque axe, un
 * niveau en mots (fort · moyen · faible), sa preuve, et « non évaluable » nommé — un axe non évaluable sort
 * du calcul, il n'est jamais compté comme zéro (doctrine « un score n'est jamais nu »).
 */
function axisLevel(points: number, max: number): 'strong' | 'medium' | 'weak' {
  const ratio = max > 0 ? points / max : 0
  if (ratio >= 2 / 3) return 'strong'
  if (ratio >= 1 / 3) return 'medium'
  return 'weak'
}

export function ContactScoreBreakdown({ contact }: { contact: Contact }) {
  const { t } = useTranslation('contacts')
  const { total, breakdown } = contactScoreView(contact)

  if (!breakdown) return null

  const evaluated = breakdown.filter(c => c.evaluated)
  const unevaluatedCount = breakdown.length - evaluated.length

  return (
    // #4585 — `tabIndex={-1}` : « Comment est-elle calculée ? » y pose le focus (`revealContactAnchor`), on arrive DANS le
    // détail au clavier ; l'ancre n'entre pas dans l'ordre de tabulation.
    <div id={SCORE_BREAKDOWN_ID} tabIndex={-1} className="rounded-overlay focus:outline-none">
      <SectionCard icon={Gauge} iconClassName="text-[var(--text-primary)]" title={t('score.breakdown.title')}>
        <Box className="space-y-4">
          <Box display="flex" className="items-center justify-between gap-3">
            <Text element="p" size="xs" color="text-muted-foreground">
              {t('score.breakdown.axesCount', { count: breakdown.length })}
            </Text>
            <Badge variant={scoreTone(total, { employerStale: hasStaleEmployer(breakdown) })}>
              {scoreLabel(total, { employerStale: hasStaleEmployer(breakdown) })}
            </Badge>
          </Box>
          <Box className="space-y-3">
            {breakdown.map(crit => {
              const level = crit.evaluated ? axisLevel(crit.points, crit.max) : null
              return (
                <Box
                  key={crit.key}
                  className={crit.evaluated ? 'space-y-1' : 'space-y-1 opacity-60'}
                  data-testid={`score-criterion-${crit.key}`}
                >
                  <Box display="flex" className="items-center justify-between gap-3">
                    <Text element="span" size="sm" weight="medium" className="text-foreground">
                      {t(`score.breakdown.criteria.${crit.key}`)}
                    </Text>
                    <Text element="span" size="xs" color="text-muted-foreground" noWrap>
                      {level ? t(`score.breakdown.level.${level}`) : t('score.breakdown.notEvaluated')}
                    </Text>
                  </Box>
                  <div
                    aria-hidden
                    className={cn(
                      'flex h-1.5 gap-1 [&>span]:flex-1',
                      !crit.evaluated && 'rounded-full border border-dashed border-muted-foreground/40',
                    )}
                  >
                    {level
                      ? (['weak', 'medium', 'strong'] as const).map((step, index) => (
                          <span
                            key={step}
                            className={cn(
                              'rounded-full',
                              index <= ['weak', 'medium', 'strong'].indexOf(level)
                                ? 'bg-[var(--bellum-text-accent)]'
                                : 'bg-muted',
                            )}
                          />
                        ))
                      : null}
                  </div>
                  <Text element="p" size="xs" color="text-muted-foreground">
                    {crit.proof}
                  </Text>
                </Box>
              )
            })}
          </Box>
          <Text element="p" size="xs" color="text-muted-foreground">
            {unevaluatedCount > 0
              ? t('score.breakdown.coverageWords', { count: unevaluatedCount })
              : t('score.breakdown.coverageAll')}
          </Text>
        </Box>
      </SectionCard>
    </div>
  )
}
