import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Text,
} from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { Archive, Compass, Eye, GitCompare, ListChecks, MoreHorizontal, Pencil, Star, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { TalentRow } from '@bellum/contracts'
import { UnknownValue } from '@/components/primitives/UnknownValue'

/** #2737 — trois pastilles au plus sur la ligne ; le reste se COMPTE. */
const VISIBLE_SKILLS = 3

/**
 * Largeur ESTIMÉE d'une pastille `text-xs` (12 px) : ~6,5 px par caractère,
 * plus `px-2.5` et la bordure ; la place de « +13 autres » et l'écart entre
 * pastilles. Une estimation, pas une mesure — elle choisit COMBIEN de
 * pastilles montrer ; `truncate` reste le filet si elle se trompe.
 */
const CHIP_CHAR_PX = 6.5
const CHIP_CHROME_PX = 24
const CHIP_GAP_PX = 4
const MORE_PX = 72
const CELL_PADDING_PX = 16

/**
 * #2737 — combien de pastilles tiennent ENTIÈRES dans `widthPx` (la largeur
 * de la colonne, `vivierColumnsFor`), en gardant la place de « +N » s'il
 * reste des compétences à compter. Toujours au moins une : une compétence
 * tronquée dit plus que « +5 autres » seul. Sans mesure (0), trois au plus.
 * Mesuré le 25/09 : réduire toutes les pastilles à la fois les ramenait à
 * une ou deux lettres (« D… », « A »), illisibles.
 */
export function chipsThatFit(row: Pick<TalentRow, 'topSkills' | 'skillCount'>, widthPx: number): number {
  const candidates = row.topSkills.slice(0, VISIBLE_SKILLS)
  if (!(widthPx > 0)) return candidates.length
  let room = widthPx - CELL_PADDING_PX
  let count = 0
  for (const skill of candidates) {
    const chip = skill.label.length * CHIP_CHAR_PX + CHIP_CHROME_PX
    const reserve = row.skillCount > count + 1 ? MORE_PX + CHIP_GAP_PX : 0
    if (chip + reserve > room) break
    room -= chip + CHIP_GAP_PX
    count += 1
  }
  return Math.max(1, count)
}

/**
 * #2737 — LES GESTES D'UNE LIGNE DU VIVIER : UN visible, les autres dans « … ».
 *
 * Quatre boutons d'icône côte à côte ne tenaient pas dans la colonne : ils
 * s'empilaient, et chaque ligne montait à ~220 px (capture de Louis, 25/09).
 * Le geste visible est celui pour lequel on ouvre un vivier — « où placer
 * cette personne ? » (la prospection inversée, §6.2). Compétences, modifier et
 * retirer passent dans un menu dont le bouton est NOMMÉ (GA-32) et fait 44 px
 * au tactile (`pointer-coarse`, `button.tsx`).
 *
 * Chaque nom désigne la personne : vingt lignes ne s'annoncent pas « Modifier »
 * vingt fois à un lecteur d'écran.
 */
export function VivierRowActions({
  row,
  displayName,
  onEdit,
  onDelete,
  onOpenSkills,
  onOpenRecord,
  onCompare,
  onArchive,
  onToggleFavorite,
}: {
  row: TalentRow
  displayName: string
  onEdit: (row: TalentRow) => void
  onDelete: (row: TalentRow) => void
  onOpenSkills: (row: TalentRow) => void
  /** Théo C talents-vivier.R8 / A8 — « Aperçu de la fiche » : le panneau latéral unique. */
  onOpenRecord?: (id: string) => void
  /** Théo C talents-vivier.A7 — « Comparer à d'autres profils » : le panneau de rapprochement. */
  onCompare?: (row: TalentRow) => void
  /** Théo C talents-vivier.A3 — « Archiver la fiche » : jamais une suppression. */
  onArchive?: (row: TalentRow) => void
  /** Théo C talents-vivier.A12 — MES favoris : l'étoile de la ligne, dans le menu. */
  onToggleFavorite?: (row: TalentRow) => void
}) {
  const { t } = useTranslation('consultants')
  // ⚠️ PAS un conteneur `flex` : la réinitialisation globale
  // `:where(.flex, …) > * { min-width: 0 }` (index.css) l'emporte sur
  // `pointer-coarse:min-w-11` — MESURÉ le 25/09/2026 au tactile
  // (`e2e/tests/web/vivier-table-layout.spec.ts`) : 36×44, `min-width` calculé
  // à 0. Des boutons `inline-flex` dans un bloc ne sont les enfants d'aucun
  // flex : ils gardent leurs 44 px.
  return (
    <div className="shrink-0 space-x-1 whitespace-nowrap text-right">
      {/* Refonte Théo — « Rapprocher », en toutes lettres : il ouvre « Où placer
          cette personne » (maquette `c/talents-comptes`). Le nom complet reste
          pour le lecteur d'écran. */}
      <Button variant="outline" size="sm" aria-label={t('row.reverseMarket', { name: displayName })} asChild>
        <Link to="/consultants/$id/reverse-market" params={{ id: row.id }}>
          <Compass className="size-4" />
          {t('row.match')}
        </Link>
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={t('row.moreActions', { name: displayName })}>
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {onOpenRecord ? (
            <DropdownMenuItem onSelect={() => onOpenRecord(row.id)}>
              <Eye className="size-4" />
              {t('vivier.row.preview')}
            </DropdownMenuItem>
          ) : null}
          {onToggleFavorite ? (
            <DropdownMenuItem onSelect={() => onToggleFavorite(row)}>
              <Star className="size-4" />
              {row.isFavorite
                ? t('favorite.removeNamed', { name: displayName })
                : t('favorite.addNamed', { name: displayName })}
            </DropdownMenuItem>
          ) : null}
          {onCompare ? (
            <DropdownMenuItem onSelect={() => onCompare(row)}>
              <GitCompare className="size-4" />
              {t('vivier.row.compare')}
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem onSelect={() => onOpenSkills(row)}>
            <ListChecks className="size-4" />
            {t('table.openSkillsFor', { name: displayName })}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onEdit(row)}>
            <Pencil className="size-4" />
            {t('row.edit')}
          </DropdownMenuItem>
          {onArchive ? (
            <DropdownMenuItem onSelect={() => onArchive(row)}>
              <Archive className="size-4" />
              {t('vivier.row.archive')}
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem onSelect={() => onDelete(row)}>
            <Trash2 className="size-4" />
            {t('row.delete')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

/**
 * #2737 — LES COMPÉTENCES SUR UNE LIGNE : trois pastilles au plus, puis « +N ».
 *
 * La capture du 25/09 montrait six pastilles sur cinq lignes (« évaluation et
 * audit de cohérence des sorties ») : le nombre de pastilles reste borné par
 * `chipsThatFit`. #4500 — celles qui sont retenues se lisent EN ENTIER (elles
 * passent à la ligne au lieu de se tronquer), et « +N » ne se tronque jamais — c'est lui
 * qui dit qu'il y a plus à voir. N compte TOUTES les compétences de la fiche
 * (`skillCount`), pas seulement celles que le serveur a remontées.
 */
export function VivierSkillChips({ row, widthPx = 0 }: { row: TalentRow; widthPx?: number }) {
  const { t } = useTranslation('consultants')
  if (row.topSkills.length === 0) return <UnknownValue discreet className="truncate" />
  const shown = row.topSkills.slice(0, chipsThatFit(row, widthPx))
  const hidden = row.skillCount - shown.length
  const all = row.topSkills.map(skill => skill.label).join(' · ')
  return (
    // #4500 — « rien de tronqué au point de ne plus se lire » : les pastilles retenues passent à la ligne plutôt que
    // de couper la première en « Sécurité app… ».
    <div className="flex min-w-0 flex-wrap items-center gap-1" title={all}>
      {shown.map(skill => (
        <Badge
          key={skill.skill}
          variant="outline"
          className="max-w-full"
          title={`${skill.label} — ${t('skills.chipTitle', {
            level: t(`skills.levels.${skill.level}`),
            source: t(`skills.sources.${skill.source}`),
          })}`}
        >
          <span className="break-words">{skill.label}</span>
        </Badge>
      ))}
      {hidden > 0 ? (
        // `whitespace-nowrap` : « +22 autres » s'écrivait sur deux étages en
        // prod (1 512 px, 8 lignes sur 20 à 76-96 px).
        <Text size="xs" element="span" className="shrink-0 whitespace-nowrap text-[var(--bellum-text-muted)]">
          {t('skills.more', { count: hidden })}
        </Text>
      ) : null}
    </div>
  )
}
