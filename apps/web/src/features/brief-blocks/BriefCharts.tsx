import type { CommercialBrief } from '@bellum/contracts'
import { Card, Progress, Text } from '@bellum/ui'
import { formatCount } from '@/lib/locale'

/** Graphiques en barres : un graphique sans point ne s'affiche pas. */
export function BriefCharts({ charts }: { charts: CommercialBrief['charts'] }) {
  return (
    <>
      {charts
        .filter(chart => chart.items.length > 0)
        .map(chart => {
          const max = Math.max(...chart.items.map(item => item.value), 0)
          return (
            <Card key={chart.title} className="p-4" data-testid="brief-chart">
              <Text size="sm" weight="semibold">
                {chart.title}
              </Text>
              <ul className="mt-3 flex flex-col gap-2">
                {chart.items.map(item => (
                  <li
                    key={item.label}
                    className="grid min-w-0 grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 md:grid-cols-[minmax(10rem,22rem)_1fr_auto]"
                  >
                    {/* Démo clients 04/10 — colonne de libellé FLUIDE (plus 160 px figés + ellipsis) :
                        2 lignes max puis ellipsis, `title` = libellé complet ; sous 768 px le libellé
                        passe au-dessus de la barre. */}
                    <Text
                      size="sm"
                      className="col-span-2 line-clamp-2 min-w-0 break-words md:col-span-1"
                      title={item.label}
                    >
                      {item.label}
                    </Text>
                    <Progress
                      value={max > 0 ? Math.max(0, (item.value / max) * 100) : 0}
                      size="md"
                      aria-label={item.label}
                    />
                    <Text size="sm" weight="medium">
                      {formatCount(item.value)}
                    </Text>
                  </li>
                ))}
              </ul>
            </Card>
          )
        })}
    </>
  )
}
