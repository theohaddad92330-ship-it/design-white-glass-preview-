import { Checkbox, EntityAvatar, TableCell, TableRow, Text, cn } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { TalentRow } from '@bellum/contracts'
import { UnknownValue } from '@/components/primitives/UnknownValue'
import { readTalentName, talentNameText } from '../lib/talentName'
import { talentPhotoSrc } from '../lib/talentPhoto'
import { TalentPlacementsChip } from './TalentPlacementsChip'
import { TalentScorePill } from './TalentScorePill'
import { VivierAvailabilityCell } from './VivierAvailabilityCell'
import { VivierRowActions, VivierSkillChips } from './VivierRowParts'
import { vivierColumnsFor, type VivierColumnId, type VivierColumnLayout } from './vivierTableColumns'

/**
 * #2737 — `align-middle` et `overflow-hidden` : rien ne sort d'une cellule
 * (« 20/100 » débordait sur la colonne voisine, Statut et Disponibilité se
 * superposaient), et chaque cellule tient en deux lignes au plus — la ligne
 * garde une hauteur constante (~56-64 px, mesurée par
 * `e2e/tests/web/vivier-table-layout.spec.ts`).
 */
const CELL = 'py-2 align-middle text-sm overflow-hidden'
const MUTED = 'text-[var(--bellum-text-muted)]'

/** Toutes les colonnes, dans l'ordre d'affichage — ce que rend une ligne hors de `VivierTable` (tests). */
const ALL_COLUMNS = vivierColumnsFor(0)

/**
 * #2182.25 à .39 — UNE LIGNE DU VIVIER, EN COLONNES.
 *
 * Le contenu est celui de la carte qu'elle remplace : les mêmes champs, les
 * mêmes badges, les mêmes gestes. Ce qui change est qu'ils sont ALIGNÉS —
 * comparer deux TJM ou repérer qui n'a pas été contacté depuis six mois
 * demandait de lire un pavé par ligne.
 *
 * #2737 — la ligne ne rend QUE les colonnes que `VivierTable` a choisies pour
 * la largeur mesurée de son conteneur (`columns`), dans le même ordre que
 * l'entête : l'une et l'autre lisent la même liste, elles ne peuvent pas
 * diverger d'une colonne (GA-29).
 *
 * ⚠️ AUCUNE CELLULE N'ÉCRIT « 0 » À LA PLACE D'UNE ABSENCE. Un TJM non renseigné
 * n'est pas un TJM nul ; une fiche jamais contactée n'a pas été contactée « il
 * y a 0 jour ». Les absences passent par `UnknownValue` — en forme DISCRÈTE ici
 * (#2737 : un tiret atténué dont l'infobulle et le nom accessible disent « non
 * mesuré »), parce que dix « non mesuré » par ligne noyaient ce qui est su.
 * « Nom non renseigné » reste écrit en toutes lettres : c'est l'objet de la
 * ligne.
 *
 * ⚠️ La photo s'AFFICHE et n'entre dans AUCUN tri ni AUCUN classement — critère
 * protégé (annexe III de l'EU AI Act), gardé par `protected-criteria.spec.ts`
 * (GA-06). `EntityAvatar` DIRECT et non `ContactAvatar` : ce dernier bloque tout
 * `data:` URI, et une photo de talent EST une donnée URI déposée par
 * l'utilisateur, déjà validée côté serveur.
 */
export function VivierTableRow({
  row,
  onEdit,
  onDelete,
  onOpenSkills,
  onOpenRecord,
  onCompare,
  onArchive,
  onToggleFavorite,
  columns = ALL_COLUMNS,
  // #2662.1 — sélection multiple, dans la colonne « Nom » (même patron que
  // ContactTableRow.tsx, #2465) : jamais une colonne de plus.
  isSelected = false,
  onSelectionChange = () => {},
}: {
  row: TalentRow
  onEdit: (row: TalentRow) => void
  onDelete: (row: TalentRow) => void
  onOpenSkills: (row: TalentRow) => void
  /** #4194 — un clic sur le reste de la ligne ouvre le panneau latéral unique ; le NOM garde sa navigation vers la fiche. */
  onOpenRecord?: (id: string) => void
  onCompare?: (row: TalentRow) => void
  onArchive?: (row: TalentRow) => void
  onToggleFavorite?: (row: TalentRow) => void
  columns?: readonly VivierColumnLayout[]
  isSelected?: boolean
  onSelectionChange?: (selected: boolean) => void
}) {
  const { t } = useTranslation('consultants')
  // Ce que la fiche porte à la place d'un nom quand elle n'en a pas : la
  // décision vit dans `talentName.ts`, jamais dans le JSX (recette du 30/08 —
  // `cv_anonyme_louis_ai-engineer-node_gw` affiché comme un nom de personne).
  const displayed = readTalentName(row.fullName)
  const displayName = talentNameText(row.fullName, t('name.unnamed'))
  // Absente (colonne non rendue) = `undefined` : jamais une largeur « 0 » inventée.
  // Sous les compétences : le type de contrat quand il est connu, sinon candidat / consultant.
  const engagementText =
    row.engagementKind && row.engagementKind !== 'inconnu'
      ? t(`engagement.${row.engagementKind}`)
      : t(`kind.${row.kind}`)
  const presentationsText =
    row.submissions.total > 0 ? t('row.presentations', { count: row.submissions.total }) : t('row.noPresentation')
  const widthOf = (id: VivierColumnId) => columns.find(column => column.id === id)?.widthPx

  const cells: Record<VivierColumnId, () => ReactNode> = {
    // #2182.25 / #2182.26 — le NOM et, en 2ᵉ ligne, le TITRE (#2737 : une
    // colonne « Titre » à part était la première sacrifiée, alors que c'est ce
    // qui fait décider). Le nom est la porte vers la fiche.
    name: () => (
      <div className="flex min-w-0 items-center gap-2">
        {/* #2662.1 — la case tient DANS la colonne « Nom ». GA-35 —
            `role="none"` : cette enveloppe n'est pas elle-même un contrôle.
            Une seule ligne, tag et `className` collés : GA-350 ancre la case
            sur `<div className="…shrink-0…">` DIRECTEMENT suivi de `<Checkbox`. */}
        <div className="flex shrink-0 items-center" role="none" onClick={event => event.stopPropagation()}>
          <Checkbox
            checked={isSelected}
            aria-label={t('table.selectAria', { name: displayName })}
            onCheckedChange={checked => onSelectionChange(checked === true)}
          />
        </div>
        <EntityAvatar
          name={displayed.kind === 'named' ? displayed.name : null}
          src={talentPhotoSrc(row.photoUrl)}
          size="sm"
        />
        <div className="min-w-0 flex-1">
          <Link to="/consultants/$id" params={{ id: row.id }} className="block min-w-0">
            <Text
              // #3883 — le libellé « Nom non renseigné » (129 px en sm) dans une colonne de 124 px finissait
              // en « … » sur 8 lignes : en xs serré il tient sur une ligne, et s'enroule si la colonne
              // rétrécit encore — sans faire passer la ligne au-delà des 72 px de #2737.
              size={displayed.kind === 'unnamed' ? 'xs' : 'sm'}
              leading={displayed.kind === 'unnamed' ? 'tight' : undefined}
              weight="semibold"
              className={cn(
                'underline-offset-2 hover:underline',
                displayed.kind === 'unnamed' ? 'break-words italic text-[var(--bellum-text-secondary)]' : 'break-words',
              )}
              title={
                displayed.kind === 'unnamed' && displayed.deposited
                  ? `${displayName} — ${t('name.fromFile', { file: displayed.deposited })}`
                  : displayName
              }
            >
              {displayed.kind === 'named' ? displayed.name : t('name.unnamed')}
            </Text>
          </Link>
          {/* La deuxième ligne : le titre (ou, pour une fiche sans nom ni titre,
              le fichier déposé qui la rend retrouvable). Une ligne, tronquée, le
              texte complet au survol (#2500.1). */}
          {displayed.kind === 'unnamed' && displayed.deposited ? (
            <Text
              size="xs"
              element="span"
              className={cn('block min-w-0 truncate', MUTED)}
              title={[t('name.fromFile', { file: displayed.deposited }), row.title].filter(Boolean).join(' · ')}
            >
              {t('name.fromFile', { file: displayed.deposited })}
            </Text>
          ) : row.title ? (
            <Text size="xs" element="span" className={cn('block min-w-0 break-words', MUTED)}>
              {row.title}
            </Text>
          ) : (
            <UnknownValue discreet className="text-xs" />
          )}
          {/* #4500 (maquette V22, Q14) — le score /100 sous le métier, JAMAIS nu : « 86 /100 · 3 axes sur 4 »
              s'ouvre sur ses axes (la complétude de la fiche y garde ses cinq contrôles). */}
          <TalentScorePill row={row} displayName={displayName} className="mt-1" />
        </div>
      </div>
    ),

    // #4500 (maquette V22, talents-vivier.R4/N1/N2) — « Disponibilité & planning » : la déclaration datée
    // en badge (elle gagne), son jour, puis le planning de missions en ligne secondaire.
    availability: () => <VivierAvailabilityCell row={row} />,

    // #2182.27 — les COMPÉTENCES PRINCIPALES, sur une ligne (#2737).
    skills: () => (
      <div className="flex min-w-0 flex-col gap-0.5">
        <VivierSkillChips row={row} widthPx={widthOf('skills')} />
        {/* Sous les compétences, la maquette dit COMMENT on mobilise la personne :
            le type de contrat quand il est connu, sinon candidat / consultant. */}
        <Text size="xs" element="span" className={cn('break-words', MUTED)}>
          {engagementText}
          {row.reviewStatus === 'needs_review' ? (
            <span className="text-[var(--warning-soft-text)]"> · {t('review.needsReview')}</span>
          ) : null}
        </Text>
      </div>
    ),

    // #2182.29 / #2182.30 — LOCALISATION ET MOBILITÉ, un seul champ.
    location: () => (
      <>
        {row.zones.length > 0 ? (
          <Text size="sm" className="break-words" title={row.zones.join(' · ')}>
            {row.zones[0]}
            {row.zones.length > 1 ? ` +${row.zones.length - 1}` : ''}
          </Text>
        ) : (
          <UnknownValue discreet className="truncate" />
        )}
        {/* Le mode de travail, dessous (maquette) — jamais demandé : aucune ligne. */}
        {row.workMode ? (
          <Text size="xs" className={cn('break-words', MUTED)}>
            {t(`workMode.${row.workMode}`)}
          </Text>
        ) : null}
      </>
    ),

    // Théo C talents-vivier.R9 / N4 — « Suivi » : où en est la personne chez les clients, et qui s'en occupe.
    followUp: () => (
      <>
        {/* Refonte Théo — « Suivi » : les présentations d'abord (« 2 présentations »,
            « Aucune présentation » — le compteur réel du serveur), les placements à
            côté (§4.2), puis le référent.
            #4500 — le dernier échange, la dernière mission et le dernier TJM vendu
            quittent la liste (maquette : présentations + responsable) ; ils restent
            sur la fiche. */}
        <div className="flex min-w-0 flex-wrap items-center gap-x-2">
          <Text
            size="sm"
            element="span"
            className="min-w-0 break-words"
            title={
              row.submissions.total > 0
                ? `${presentationsText} · ${t('row.submissions', { open: row.submissions.open, total: row.submissions.total })}`
                : presentationsText
            }
          >
            {presentationsText}
          </Text>
          <span className="shrink-0 whitespace-nowrap">
            <TalentPlacementsChip consultantId={row.id} />
          </span>
        </div>
        {/* Le référent (N4) : absent = aucune ligne. */}
        {row.ownerName ? (
          <Text size="xs" className={cn('break-words', MUTED)}>
            {row.ownerName}
          </Text>
        ) : null}
      </>
    ),

    // #2737 — UNE action visible, les autres dans « … ».
    actions: () => (
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
    ),
  }

  return (
    <TableRow
      data-state={isSelected ? 'selected' : undefined}
      className={onOpenRecord ? 'cursor-pointer' : undefined}
      onClick={event => {
        // Un lien, un bouton ou une case garde son propre geste : seul le « vide » de la ligne ouvre l'aperçu.
        if (!onOpenRecord || (event.target as HTMLElement).closest('a,button,input,label,[role="menuitem"]')) return
        onOpenRecord(row.id)
      }}
    >
      {columns.map(column => (
        <TableCell
          key={column.id}
          data-column={column.id}
          className={cn(CELL, column.id === 'name' && 'pl-3', column.id === 'actions' && 'pr-1')}
        >
          {cells[column.id]()}
        </TableCell>
      ))}
    </TableRow>
  )
}
