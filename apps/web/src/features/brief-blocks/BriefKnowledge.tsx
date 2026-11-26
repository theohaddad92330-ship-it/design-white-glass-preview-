import type { CommercialBrief } from '@bellum/contracts'
import { Card, Text } from '@bellum/ui'
import { ShowMoreButton, useRevealed } from './ShowMore'
import type { BriefT } from './brief-t'

/**
 * « Ce que je sais » : une rubrique, deux colonnes (ce qu'on sait / ce que ça veut dire).
 * `foldAfter` (fiche de zone, recette 06/10/2026 : ~2 700 px avant la grille des prix) : les premières
 * rubriques, puis « Voir N de plus » ; rien n'est retiré. Absent = tout à plat (brief de compte).
 */
export function BriefKnowledge({
  rows,
  t,
  foldAfter,
}: {
  rows: CommercialBrief['what_i_know']
  t: BriefT
  foldAfter?: number
}) {
  const { visible, nextCount, revealMore } = useRevealed(rows.length, foldAfter ?? rows.length, rows.length)
  const shown = foldAfter === undefined ? rows : rows.slice(0, visible)
  return (
    <section data-testid="brief-knowledge" aria-label={t('knowledge.title')} className="flex min-w-0 flex-col gap-3">
      {/* R24 (15/10) — sur le brief d'un COMPTE (`foldAfter` absent), le titre de la page dit déjà « Ce que je sais de … » :
          un second intertitre identique ferait trois fois la même phrase avec l'onglet. Le brief de zone, lui, le porte. */}
      {foldAfter === undefined ? null : (
        <Text element="h3" size="base" weight="semibold">
          {t('knowledge.title')}
        </Text>
      )}
      <Card className="divide-y divide-[var(--bellum-border)]">
        {shown.map(row => (
          <div key={row.rubric} className="px-4 py-4">
            <Text size="xs" weight="semibold" className="uppercase tracking-wide text-[var(--bellum-text-secondary)]">
              {row.rubric}
            </Text>
            <div className="mt-2 grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2 md:gap-6">
              <div className="min-w-0">
                <Text size="xs" weight="medium" className="text-[var(--bellum-text-muted)]">
                  {t('known')}
                </Text>
                <Text size="sm" className="mt-1">
                  {row.known}
                </Text>
              </div>
              <div className="min-w-0">
                <Text size="xs" weight="medium" className="text-[var(--bellum-text-muted)]">
                  {t('meaning')}
                </Text>
                <Text size="sm" className="mt-1">
                  {row.meaning}
                </Text>
              </div>
            </div>
          </div>
        ))}
      </Card>
      {foldAfter === undefined ? null : (
        <ShowMoreButton
          t={t}
          nextCount={nextCount}
          visible={visible}
          total={rows.length}
          onClick={revealMore}
          testId="brief-knowledge-more"
        />
      )}
    </section>
  )
}
