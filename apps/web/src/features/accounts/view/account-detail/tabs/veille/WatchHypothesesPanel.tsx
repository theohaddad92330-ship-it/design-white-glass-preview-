import { Badge, Card, Text } from '@bellum/ui'
import { Lightbulb } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { SignalSourceLink } from '@/components/primitives/SignalSourceLink'
import type { WatchHypothesis } from '@/features/accounts/model/watch'
import { formatSignalDateIfKnown } from '@/lib/signal-date'

/**
 * #3939.a — LES HYPOTHÈSES QUALIFIÉES ET LEURS SIGNAUX FONDATEURS, DANS LA VEILLE.
 *
 * Recette prod 09/10 : introuvables. Elles n'existaient que comme sous-ligne d'une
 * carte signal ; les signaux qui les fondent sont ceux devenus « pistes », retirés
 * de la liste (#3676.6) — l'hypothèse disparaissait avec eux. Ce panneau les lit
 * pour elles-mêmes (`buildAccountWatchData().hypotheses`, sur TOUS les signaux).
 *
 * La confiance est l'échelle de CONVERGENCE de l'analyse, jamais une probabilité ;
 * absente quand les signaux cités ne la fondent pas. Aucune hypothèse → aucun
 * panneau (on n'affiche pas ce qu'on n'a pas).
 */
export function WatchHypothesesPanel({ hypotheses }: { hypotheses: readonly WatchHypothesis[] }) {
  const { t } = useTranslation('accountWatch')
  if (hypotheses.length === 0) return null
  return (
    <Card className="gap-0 p-5">
      <div className="flex items-center gap-2">
        <Lightbulb className="size-4 text-[var(--bellum-text-accent)]" aria-hidden />
        <Text element="h2" size="sm" weight="semibold">
          {t('hypotheses.title')}
        </Text>
      </div>
      <ul className="mt-4 space-y-5">
        {hypotheses.map((hypothesis, index) => (
          <li key={`${hypothesis.hypothesis}-${index}`} className="min-w-0">
            <HypothesisItem hypothesis={hypothesis} />
          </li>
        ))}
      </ul>
    </Card>
  )
}

function HypothesisItem({ hypothesis }: { hypothesis: WatchHypothesis }) {
  const { t } = useTranslation('accountWatch')
  return (
    <div className="min-w-0 space-y-2">
      <div className="flex min-w-0 flex-wrap items-start gap-2">
        <Text size="sm" weight="semibold" className="min-w-0 break-words">
          {hypothesis.hypothesis}
        </Text>
        {hypothesis.confidence ? (
          <Badge variant="default" className="shrink-0">
            {t(`hypotheses.confidence.${hypothesis.confidence}`)}
          </Badge>
        ) : null}
      </div>
      {hypothesis.esnAngle ? (
        <Text size="xs" className="break-words text-[var(--bellum-text-secondary)]">
          {t('timeline.esnAngle')} {hypothesis.esnAngle}
        </Text>
      ) : null}
      {hypothesis.firstAction ? (
        <Text size="xs" className="break-words text-[var(--bellum-text-secondary)]">
          {t('timeline.firstAction')} {hypothesis.firstAction}
        </Text>
      ) : null}
      {hypothesis.foundingSignals.length > 0 ? (
        <div className="space-y-1.5 border-l-2 border-[var(--bellum-border)] pl-3">
          <Text size="xs" weight="medium" className="text-[var(--bellum-text-muted)]">
            {t('hypotheses.founding')}
          </Text>
          <ul className="space-y-1.5">
            {hypothesis.foundingSignals.map(signal => {
              const date = formatSignalDateIfKnown(signal.date)
              return (
                <li key={signal.id} className="min-w-0">
                  <Text size="xs" className="break-words">
                    {signal.signal}
                    {date ? <span className="text-[var(--bellum-text-muted)]"> · {date}</span> : null}
                  </Text>
                  <SignalSourceLink url={signal.sourceUrl} sourceKind={signal.sourceKind} />
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}
      {hypothesis.citedSignals.length > 0 ? (
        <div className="space-y-1 border-l-2 border-[var(--bellum-border)] pl-3">
          <Text size="xs" weight="medium" className="text-[var(--bellum-text-muted)]">
            {t('hypotheses.citedByAnalysis')}
          </Text>
          <ul className="space-y-1">
            {hypothesis.citedSignals.map(text => (
              <li key={text}>
                <Text size="xs" className="break-words text-[var(--bellum-text-secondary)]">
                  {text}
                </Text>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
