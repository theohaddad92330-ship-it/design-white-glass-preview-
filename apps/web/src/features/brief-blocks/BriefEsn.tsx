import type { CommercialBrief } from '@bellum/contracts'
import { Badge, Text } from '@bellum/ui'
import { BriefFold } from './BriefFold'
import { ShowMoreButton, useRevealed } from './ShowMore'
import type { BriefT } from './brief-t'

/** ESN en place : une rubrique absente ne fait aucune ligne. */
export function BriefEsn({
  esn,
  t,
  foldAfter,
}: {
  esn: CommercialBrief['esn']
  t: BriefT
  /** Fiche de zone (89 ESN) : les `foldAfter` premières, puis « Voir N de plus ». Absent = tout à plat (brief de compte). */
  foldAfter?: number
}) {
  const { visible, nextCount, revealMore } = useRevealed(esn.length, foldAfter ?? esn.length)
  if (esn.length === 0) return null
  return (
    <BriefFold testId="brief-esn" title={t('esn.title')} count={esn.length}>
      <ul className="flex flex-col gap-3">
        {esn.slice(0, foldAfter === undefined ? esn.length : visible).map(item => (
          <li key={item.name} className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Text size="sm" weight="semibold">
                {item.name}
              </Text>
              <Badge variant="outline">{t(`esn.evidence.${item.evidence_level}`)}</Badge>
              {item.perimeter ? (
                <Text size="xs" className="text-[var(--bellum-text-muted)]">
                  {item.perimeter}
                </Text>
              ) : null}
            </div>
            <Text size="sm" className="mt-1 text-[var(--bellum-text-secondary)]">
              {item.proof}
            </Text>
          </li>
        ))}
      </ul>
      {foldAfter === undefined ? null : (
        <ShowMoreButton
          t={t}
          nextCount={nextCount}
          visible={visible}
          total={esn.length}
          onClick={revealMore}
          testId="brief-esn-more"
        />
      )}
    </BriefFold>
  )
}
