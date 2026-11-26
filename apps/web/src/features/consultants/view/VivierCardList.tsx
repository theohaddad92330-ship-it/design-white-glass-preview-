import { Checkbox, EntityAvatar, Text, cn } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import type { TalentRow } from '@bellum/contracts'
import { readTalentName, talentNameText } from '../lib/talentName'
import { talentPhotoSrc } from '../lib/talentPhoto'
import { TalentScorePill } from './TalentScorePill'
import { VivierAvailabilityCell } from './VivierAvailabilityCell'
import { VivierRowActions, VivierSkillChips } from './VivierRowParts'

const MUTED = 'text-[var(--bellum-text-muted)]'

/**
 * #2737 — LE VIVIER SOUS 768 PX : UNE CARTE PAR PERSONNE.
 *
 * « Le mobile est le produit, pas un repli » (GA-28 à GA-30) : sous la borne
 * mobile, un tableau réduit à trois colonnes étroites ne se lit pas. La carte
 * porte ce que le tableau garde à TOUTE largeur (`VIVIER_REQUIRED_COLUMNS`) :
 * le nom et son titre, la disponibilité et le statut de la fiche, les
 * compétences, les gestes. Le reste se lit sur la fiche, ouverte par le nom —
 * exactement comme une colonne masquée du tableau.
 *
 * Mêmes pièces que la ligne (`VivierRowParts.tsx`) : une action visible et un
 * menu « … » nommés, 44 px au tactile ; les compétences sur une ligne.
 */
export function VivierCardList({
  rows,
  onEdit,
  onDelete,
  onOpenSkills,
  onOpenRecord,
  onCompare,
  onArchive,
  onToggleFavorite,
  grid = false,
  selectedIds,
  onToggleRow,
}: {
  rows: readonly TalentRow[]
  onEdit: (row: TalentRow) => void
  onDelete: (row: TalentRow) => void
  onOpenSkills: (row: TalentRow) => void
  onOpenRecord?: (id: string) => void
  onCompare?: (row: TalentRow) => void
  onArchive?: (row: TalentRow) => void
  onToggleFavorite?: (row: TalentRow) => void
  /** Théo C talents-vivier.R10 — la bascule « Cartes » sur grand écran : une grille, pas une pile. */
  grid?: boolean
  selectedIds: ReadonlySet<string>
  onToggleRow?: (id: string, selected: boolean) => void
}) {
  const { t } = useTranslation('consultants')
  return (
    // Refonte Théo (`.bo11-talent-grid`) — la grille de cartes : une colonne au
    // téléphone, deux puis trois quand la place le permet. Aérée (fiches),
    // contrairement au tableau dense (liste).
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {rows.map(row => {
        const displayed = readTalentName(row.fullName)
        const displayName = talentNameText(row.fullName, t('name.unnamed'))
        const selected = selectedIds.has(row.id)
        // La maquette : « Paris · Salariée » — le type de contrat quand il est connu, sinon candidat / consultant.
        const relation =
          row.engagementKind && row.engagementKind !== 'inconnu'
            ? t(`engagement.${row.engagementKind}`)
            : t(`kind.${row.kind}`)
        const place = [row.zones[0], relation].filter(Boolean).join(' · ')
        return (
          <li
            key={row.id}
            data-state={selected ? 'selected' : undefined}
            className="flex min-w-0 flex-col gap-3 rounded-card border border-[var(--bellum-border)] bg-card p-4"
          >
            <div className="flex min-w-0 items-center gap-2">
              <Checkbox
                checked={selected}
                aria-label={t('table.selectAria', { name: displayName })}
                onCheckedChange={checked => onToggleRow?.(row.id, checked === true)}
              />
              <EntityAvatar
                name={displayed.kind === 'named' ? displayed.name : null}
                src={talentPhotoSrc(row.photoUrl)}
                size="sm"
              />
              <div className="min-w-0 flex-1">
                <Link to="/consultants/$id" params={{ id: row.id }} className="block min-w-0">
                  <Text
                    size="sm"
                    weight="semibold"
                    className={cn(
                      'break-words',
                      displayed.kind === 'unnamed' ? 'italic text-[var(--bellum-text-secondary)]' : '',
                    )}
                    title={displayName}
                  >
                    {displayed.kind === 'named' ? displayed.name : t('name.unnamed')}
                  </Text>
                </Link>
                {row.title ? (
                  <Text size="xs" className={cn('break-words', MUTED)}>
                    {row.title}
                  </Text>
                ) : null}
              </div>
              <VivierRowActions
                row={row}
                displayName={displayName}
                onEdit={onEdit}
                onDelete={onDelete}
                onOpenSkills={onOpenSkills}
                onOpenRecord={onOpenRecord}
                onCompare={onCompare}
                onArchive={onArchive}
                onToggleFavorite={onToggleFavorite}
              />
            </div>
            <VivierSkillChips row={row} />
            <Text size="xs" element="span" className={cn('break-words', MUTED)}>
              {place}
              {row.reviewStatus === 'needs_review' ? (
                <span className="text-[var(--warning-soft-text)]"> · {t('review.needsReview')}</span>
              ) : null}
            </Text>
            <TalentScorePill row={row} displayName={displayName} className="self-start" />
            <footer className="mt-auto flex min-w-0 items-end justify-between gap-2 border-t border-[var(--bellum-border)] pt-3">
              <div className="min-w-0 flex-1">
                <VivierAvailabilityCell row={row} />
              </div>
              <Link
                to="/consultants/$id"
                params={{ id: row.id }}
                className="inline-flex min-h-11 shrink-0 items-center rounded-control px-3 text-sm font-medium text-[var(--bellum-text-accent)] hover:bg-[var(--bellum-surface-2)]"
              >
                {t('card.profile')}
              </Link>
            </footer>
          </li>
        )
      })}
    </ul>
  )
}
