import { useTranslation } from 'react-i18next'
import { Badge, Box, Button, Text } from '@bellum/ui'
import { formatDate } from '@/lib/locale'
import type { ReviewBlock, ReviewEditTarget, ReviewFieldRow } from '@/features/onboarding/lib/onboarding-review-blocks'

/** #2089.10 — 3 à 6 éléments max par section : au-delà, la carte n'en rend
 *  jamais plus de 6. Un bloc qui en porte davantage n'affiche pas le compte
 *  retiré — la doctrine sur le sujet (§ « pas de faux compteur ») porte sur la
 *  génération, pas sur ce plafond d'affichage. */
const MAX_ROWS_PER_BLOCK = 6

/**
 * #2030.1-.14 — une carte de bloc du récapitulatif : titre, état
 * (Confirmé/À vérifier), les lignes de réponse quand le bloc en a, un renvoi
 * « Modifier » quand il existe.
 *
 * #2030.10/.11 — l'état est une étiquette CATÉGORIELLE (Confirmé/À vérifier),
 * jamais un score ou un pourcentage : la doctrine sur les probabilités ne
 * s'applique pas ici, mais la même prudence si — aucune valeur numérique n'est
 * inventée pour un bloc sans donnée.
 *
 * #2030.12/.14 — un prérempli non confirmé et une réponse manquante se lisent
 * distinctement d'une vraie réponse, jamais confondus avec elle.
 *
 * #2089.13 — chaque ÉLÉMENT porte AUSSI son bouton Modifier (pas seulement le
 * bloc) : il renvoie vers la même cible que le bloc, qu'aucun renvoi par
 * champ n'existe encore (les sous-étapes Temps-1 ne sont pas granulaires par
 * question).
 */
export function OnboardingReviewBlockCard({
  block,
  onModify,
}: {
  block: ReviewBlock
  onModify: (target: ReviewEditTarget) => void
}) {
  const { t } = useTranslation('onboarding')
  const visibleRows = block.rows.slice(0, MAX_ROWS_PER_BLOCK)

  return (
    <Box className="rounded-lg border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-4">
      <Box className="flex flex-wrap items-center justify-between gap-3">
        <Text element="h3" size="base" weight="medium">
          {t(block.titleKey)}
        </Text>
        <Box className="flex items-center gap-2">
          <Badge variant={block.state === 'confirmed' ? 'success' : 'warning'}>
            {t(block.state === 'confirmed' ? 'review.state.confirmed' : 'review.state.toVerify')}
          </Badge>
          {block.editTarget && (
            <Button type="button" variant="outline" size="sm" onClick={() => onModify(block.editTarget!)}>
              {t('review.modify')}
            </Button>
          )}
        </Box>
      </Box>

      {visibleRows.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {visibleRows.map(row => (
            <ReviewRow key={row.key} row={row} editTarget={block.editTarget} onModify={onModify} />
          ))}
        </ul>
      ) : (
        <Text element="p" size="sm" className="mt-3 text-[var(--bellum-text-muted)]">
          {t(`review.blocks.${block.code}.empty`)}
        </Text>
      )}
    </Box>
  )
}

function ReviewRow({
  row,
  editTarget,
  onModify,
}: {
  row: ReviewFieldRow
  editTarget: ReviewEditTarget | null
  onModify: (target: ReviewEditTarget) => void
}) {
  const { t } = useTranslation('onboarding')
  const valueClass =
    row.state === 'missing'
      ? 'text-[var(--warning-soft-text)]'
      : row.state === 'unconfirmedPrefill'
        ? 'text-[var(--accent-soft-text)]'
        : 'text-[var(--bellum-text-primary)]'

  return (
    <li className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
      <Text element="span" size="sm" className="text-[var(--bellum-text-muted)]">
        {t(row.labelKey)}
      </Text>
      <Box className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <Text element="span" size="sm" weight="medium" className={valueClass}>
          {row.value ?? t('review.rows.missing')}
          {row.state === 'unconfirmedPrefill' && ` · ${t('review.rows.unconfirmedPrefill')}`}
        </Text>
        {/* #2089.17 / #2089.19 — les DEUX statuts qu'aucun autre élément de la
            ligne ne disait. `confirmed` se lit à la valeur elle-même,
            `unknown` à « Non renseigné », `proposed` à « prérempli, non
            confirmé » : les répéter ici serait la loi 4 du tome 7 (rien deux
            fois sous la même forme avec le même contenu). « À vérifier » (la
            source annonce une confiance faible) et « Contradictoire » (la
            réponse est en tension avec une autre) n'étaient dits NULLE PART.
            #2027.3 — « Non mesurée » (neutre, jamais un avertissement rouge
            ou orange) : une réponse déclarée incertaine n'est pas un problème. */}
        {(row.status === 'toVerify' || row.status === 'contradictory' || row.status === 'unmeasuredByChoice') && (
          <Badge
            variant={row.status === 'contradictory' ? 'danger' : row.status === 'toVerify' ? 'warning' : 'default'}
          >
            {t(`review.rowStatus.${row.status}`)}
          </Badge>
        )}
        {/* #2089.12 — provenance (source + date) reprise de `prefillMeta`,
            jamais recalculée. Une date inconnue se DIT, elle ne se devine
            jamais. */}
        {row.provenance && (
          <Text element="span" size="xs" className="text-[var(--bellum-text-muted)]">
            · {t(`prefill.badge.sources.${row.provenance.source}`)} ·{' '}
            {formatDate(row.provenance.asOfIso, { year: 'numeric' }) ?? t('prefill.badge.unknownDate')}
          </Text>
        )}
        {editTarget && (
          // #2089.13 — aria-label distinct du bouton de bloc (même libellé
          // visible « Modifier », mais deux boutons « Modifier » identiques
          // pour un lecteur d'écran seraient indiscernables l'un de l'autre.
          <Button
            type="button"
            variant="ghost"
            size="xs"
            aria-label={`${t('review.modify')} — ${t(row.labelKey)}`}
            onClick={() => onModify(editTarget)}
          >
            {t('review.modify')}
          </Button>
        )}
      </Box>
    </li>
  )
}
