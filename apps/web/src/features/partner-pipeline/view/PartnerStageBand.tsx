import { Box, Text, cn } from '@bellum/ui'
import type { PartnerStage } from '@bellum/contracts'
import { useTranslation } from 'react-i18next'
import { partnerStageSummary } from '../model/partnerStageSummary'

/**
 * #1431 — le bloc de synthèse en tête de « Mes partenaires ».
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IL COMPTE, ET IL FILTRE — SINON CE N'EST PAS UN COCKPIT
 * ─────────────────────────────────────────────────────────────────────────────
 * Un bandeau qui affiche huit chiffres qu'on ne peut pas ouvrir est une
 * décoration : le retour demande de « transformer la page en outil de décision »,
 * pas d'y ajouter des nombres. Chaque pastille filtre donc la liste en dessous,
 * et se re-clique pour tout revoir.
 *
 * `aria-pressed` et non `role="radio"` : c'est la sémantique que toutes les
 * autres rangées de filtres du produit emploient (`FilterChips`), et un lecteur
 * d'écran qui traverse deux écrans ne doit pas entendre deux modèles pour le
 * même geste.
 *
 * ⚠️ Une étape à ZÉRO reste affichée et reste cliquable-morte (désactivée) :
 * « aucun cadre signé » est l'information qu'un dirigeant vient chercher, et la
 * masquer ferait disparaître le trou qu'elle signale. Ce zéro-là est MESURÉ —
 * à ne pas confondre avec les compteurs de flux, que personne n'écrit
 * (`partnerFlow.ts`).
 */
export function PartnerStageBand({
  relations,
  selected,
  onSelect,
}: {
  relations: readonly { stage: string }[]
  /** Multi-sélection : plusieurs étapes à la fois, vide = tout voir. */
  selected: ReadonlySet<PartnerStage>
  onSelect: (stage: PartnerStage) => void
}) {
  const { t } = useTranslation('partnerPipeline')
  const summary = partnerStageSummary(relations)

  // Rien à synthétiser : la liste vide dit déjà ce qu'il faut, et un bandeau de
  // huit zéros au-dessus d'un « aucun partenaire enregistré » serait du bruit.
  if (summary.total === 0) return null

  return (
    <Box className="flex flex-col gap-2 rounded-xl border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-3">
      <Box display="flex" className="flex-wrap items-baseline gap-x-2 gap-y-1">
        <Text size="sm" weight="semibold">
          {t('band.title')}
        </Text>
        {/* Le DÉNOMINATEUR, écrit. `GET /partners` n'est pas paginé : ce total
            est celui de l'espace, pas celui d'une page — et le jour où la route
            se pagine, cette phrase devient fausse et doit changer avec elle. */}
        <Text size="xs" color="text-[var(--bellum-text-muted)]">
          {t('band.total', { count: summary.total })}
        </Text>
      </Box>
      <Box display="flex" className="flex-wrap gap-1.5">
        {summary.counts.map(({ stage, count }) => {
          const isSelected = selected.has(stage)
          return (
            <button
              key={stage}
              type="button"
              disabled={count === 0}
              aria-pressed={isSelected}
              onClick={() => onSelect(stage)}
              className={cn(
                'flex items-center gap-1.5 rounded-badge border px-2.5 py-1 text-xs transition-colors pointer-coarse:min-h-11',
                count === 0
                  ? 'cursor-default border-[var(--bellum-border)] text-[var(--bellum-text-muted)] opacity-60'
                  : isSelected
                    ? 'border-[var(--accent-soft-border)] bg-[var(--accent-soft-bg)] text-[var(--accent-soft-text)]'
                    : 'border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] text-[var(--bellum-text-secondary)] hover:border-[var(--accent-soft-border)]',
              )}
            >
              <span>{t(`stages.${stage}`)}</span>
              <span className="font-semibold tabular-nums">{count}</span>
            </button>
          )
        })}
      </Box>
      {selected.size > 0 ? (
        <Text size="xs" color="text-[var(--bellum-text-muted)]">
          {t('band.filtered', { stage: [...selected].map(stage => t(`stages.${stage}`)).join(' · ') })}
        </Text>
      ) : null}
    </Box>
  )
}
