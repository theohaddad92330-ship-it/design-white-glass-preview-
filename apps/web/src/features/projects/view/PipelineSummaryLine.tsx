import type { PipelineSummary } from '@bellum/contracts'
import { useTranslation } from 'react-i18next'
import { KeyFigureRow, type KeyFigure } from '@/components/primitives/KeyFigureRow'
import { UnknownValue } from '@/components/primitives/UnknownValue'
import { pipelineTotal } from '../model/pipeline-total'

/**
 * #4499 (Louis 23/10, maquette V22 `.bo11-summary`) — UNE SYNTHÈSE COURTE à la place des quatre cartes
 * d'indicateurs et de la ligne « Par commercial » : « N affaires dans cette vue · X € pipe ouvert HT · estimation
 * non pondérée · Les signaux restent dans Signaux ». Lire son pipe sans bruit.
 *
 * Ce que les cartes portaient et où c'est allé :
 *  - le total et son « au moins » : ici, avec le compteur « N projets sans montant saisi » qui FILTRE (le slot) ;
 *  - le signé : la colonne « Gagnée » du Kanban dit ses « X € estimés », hors total ;
 *  - « Sans prochaine action » : le menu Filtres et le pied de chaque colonne ;
 *  - « Affaires à qualifier → Ouvrir la file » : l'onglet Besoins (`IntakeQueueLink`).
 *
 * ⚠️ Arbitrage Louis 24/10 : la synthèse est rendue par `KeyFigureRow` (GA-26, garde F2-FIX #4332 — revient sur
 * l'exemption du Pipe posée par le lot AFFAIRES). Son compteur de non chiffrés dit « N affaires sans montant, hors
 * total » : un total nomme ce qu'il exclut.
 *
 * ⚠️ Le total n'est pas recalculé ici : son verdict vient de `pipelineTotal` (`model/pipeline-total.ts`), l'unique
 * foyer. Il garde ses TROIS formes — montant exact, plancher (le slot dit ce qui manque), « non mesuré » quand rien
 * n'est chiffré — et son libellé reste à côté de lui, dans le même groupe (GA-134). Aucune pondération (#4016 L1).
 */
export function PipelineSummaryLine({
  summary,
  count,
  wonCount = 0,
  withoutAmountSlot,
  extra,
}: {
  summary: PipelineSummary
  /** Les affaires ACTIVES à l'écran (filtres compris, Gagnée EXCLUE — #4193.2) : jamais le serveur entier. */
  count: number
  /** #4193.2 — les gagnées à l'écran, nommées À PART du compte (absentes : aucune ligne). */
  wonCount?: number
  /** « N projets sans montant saisi », rendu par le Kanban parce qu'il est aussi un filtre de son état local. */
  withoutAmountSlot?: React.ReactNode
  /** « Les signaux restent dans Signaux », puis la ligne des pistes repérées. */
  extra?: React.ReactNode
}) {
  const { t, i18n } = useTranslation('projects')
  const label = t('pipeline.totalLabel')
  const total = pipelineTotal(summary)
  const money = (cents: number): string =>
    new Intl.NumberFormat(i18n.language === 'en' ? 'en-GB' : 'fr-FR', {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 0,
    }).format(cents / 100)

  const figures: KeyFigure[] = [
    // #4193.2 — « N actives » : le compte du Kanban ; une vue vide se DIT (« Aucune affaire dans cette vue »),
    // jamais « 0 affaire ». Les gagnées se nomment à part (une absence ne fait aucune ligne).
    {
      id: 'in-view',
      testId: 'pipeline-in-view',
      label: t('pipeTheo.summary.inView', { count }),
      value: count === 0 ? null : count,
    },
    ...(wonCount > 0
      ? [
          {
            id: 'won-apart',
            testId: 'pipeline-won',
            label: t('pipeTheo.summary.wonApart', { count: wonCount }),
            value: wonCount,
          } satisfies KeyFigure,
        ]
      : []),
    total.kind === 'unmeasured'
      ? {
          // Rien de chiffré : le libellé d'abord, puis l'absence NOMMÉE et sa raison — jamais « 0 € » (GA-18/19).
          id: 'pipe-total',
          testId: 'pipeline-total',
          label,
          value: (
            <UnknownValue
              reason={total.count === null ? null : t('pipeline.totalUnknownReason', { count: total.count })}
            />
          ),
        }
      : {
          // Vide : 0 € est VRAI (la somme d'un ensemble vide). Mesuré : le montant, exact ou plancher. Un total
          // NOMME ce qu'il exclut : « N affaires sans montant, hors total » (arbitrage Louis 24/10).
          id: 'pipe-total',
          testId: 'pipeline-total',
          label,
          value: money(total.kind === 'measured' ? total.amountCents : 0),
          meta: t('pipeTheo.summary.unweighted'),
          extra: withoutAmountSlot,
        },
  ]

  return (
    <div data-testid="pipeline-summary" role="group" aria-label={t('pipeTheo.summary.label')} className="space-y-2">
      {/* Arbitrage Louis 24/10 (#4499) : la synthèse du Pipe revient dans `KeyFigureRow` (garde F2-FIX #4332). */}
      {count === 0 && wonCount === 0 ? (
        <p data-testid="pipeline-in-view-none" className="text-sm text-[var(--bellum-text-secondary)]">
          {t('pipeline.inViewNone')}
        </p>
      ) : null}
      <KeyFigureRow figures={figures} testId="pipeline-key-figures" />
      {extra ? (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-[var(--bellum-text-secondary)]">
          {extra}
        </div>
      ) : null}
    </div>
  )
}
