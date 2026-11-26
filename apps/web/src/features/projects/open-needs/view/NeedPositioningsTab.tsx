import { useMemo } from 'react'
import { Link } from '@tanstack/react-router'
import { Compass } from 'lucide-react'
import type { MatchInClear, OpenNeedRow, Submission, SubmissionStage } from '@bellum/contracts'
import { Badge, Box, Button, EntityAvatar, Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { useSubmissions } from '@/features/submissions/api'
import { formatDate } from '@/lib/locale'
import { useNeedVerdict } from '../hooks/useNeedVerdict'
import { matchInClearLabel } from '../model/match-in-clear-label'

/** La pastille de suivi, teintée par état (la couleur dit un état). */
const STAGE_TONE: Record<SubmissionStage, 'default' | 'primary' | 'success' | 'warning' | 'danger'> = {
  shortlisted: 'default',
  submitted: 'primary',
  interview: 'primary',
  accepted: 'success',
  rejected: 'danger',
  withdrawn: 'warning',
}

/**
 * L'ONGLET POSITIONNEMENTS d'une fiche de besoin — les profils positionnés
 * sur CE rôle, pas sur l'affaire entière.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE N'EST PAS `<SubmissionsPanel projectId={need.project_id} />`
 * ─────────────────────────────────────────────────────────────────────────────
 * `SubmissionsPanel` (module `submissions`) ne connaît qu'un `projectId` — et
 * un projet porte souvent PLUSIEURS besoins (`ProjectNeedsPanel` existe pour
 * ça, monté sur `ProjectDetailSheet`). Le monter tel quel ici montrerait, sous
 * l'onglet d'UN besoin, les profils positionnés sur les rôles VOISINS du même
 * projet — une donnée réelle, mais au mauvais périmètre : pas une donnée
 * inventée, une donnée MAL ATTRIBUÉE, ce qui est trompeur d'une autre façon.
 *
 * `Submission` porte un `needId` (`packages/contracts/src/schemas/submission.ts`)
 * — la donnée existe pour filtrer correctement, seule la ROUTE serveur ne le
 * fait pas encore (`GET /submissions` n'accepte que `projectId`/`consultantId`).
 * Ce composant réutilise `useSubmissions` SANS LE MODIFIER — la lecture reste
 * celle de `SubmissionsPanel` — et filtre côté client sur le seul champ que le
 * serveur ne filtre pas encore. Ce n'est pas réécrire le module Positionnements :
 * c'est en lire le résultat au bon périmètre.
 *
 * ⚠️ Un positionnement dont `needId` est `null` (créé avant que ce besoin
 * existe, ou sans rôle précisé) n'apparaît pas ici : lui attribuer CE besoin
 * serait une supposition. Il reste visible depuis la fiche du projet.
 *
 * Les gestes d'écriture (faire avancer une étape, noter un retour client)
 * restent sur `SubmissionsPanel`/`ProjectDetailSheet` — les dupliquer ici
 * ferait exister deux endroits qui changent la MÊME étape, et qui divergent
 * à la première retouche (loi 4 du tome 7).
 */
export function NeedPositioningsTab({ need }: { need: OpenNeedRow }) {
  const { t } = useTranslation('projects')
  const { data, isLoading, isError } = useSubmissions({ projectId: need.project_id ?? undefined })
  // Refonte Théo — la correspondance EN CLAIR de chaque positionné, lue sur le dernier rapprochement.
  const { positionedInClear } = useNeedVerdict(need.id)
  const clearByConsultant = useMemo(
    () => new Map(positionedInClear.map(row => [row.consultantId, row.inClear])),
    [positionedInClear],
  )

  const items = useMemo(() => (data?.items ?? []).filter(item => item.needId === need.id), [data, need.id])

  return (
    <section className="flex flex-col gap-3 rounded-card border border-[var(--bellum-border)] bg-card p-4 md:p-5">
      {/* Théo C projects-besoin-fiche — « Les profils de ce besoin » ; une présélection n'est ni un envoi ni une mission. */}
      <div>
        <Text element="h2" size="base" weight="semibold">
          {t('needSheet.profilesTable.title')}
        </Text>
        <Text size="sm" className="mt-0.5 text-[var(--bellum-text-secondary)]">
          {t('needSheet.profilesTable.hint')}
        </Text>
      </div>
      <PositioningsBody
        need={need}
        items={items}
        elsewhere={(data?.items ?? []).length}
        isLoading={isLoading}
        isError={isError}
        clearByConsultant={clearByConsultant}
      />
    </section>
  )
}

function PositioningsBody({
  need,
  items,
  elsewhere,
  isLoading,
  isError,
  clearByConsultant,
}: {
  need: OpenNeedRow
  items: readonly Submission[]
  elsewhere: number
  isLoading: boolean
  isError: boolean
  clearByConsultant: ReadonlyMap<string, MatchInClear>
}) {
  const { t } = useTranslation('projects')
  if (isLoading) {
    return (
      <Text size="sm" className="text-[var(--bellum-text-muted)]">
        {t('needSheet.tabs.positioningLoading')}
      </Text>
    )
  }

  if (isError) {
    // Un échec de lecture ne se rend JAMAIS comme « aucun positionnement » :
    // c'est la faute trouvée en production le 17/08 sur les notes.
    return (
      <Box className="rounded-control border border-dashed border-destructive/40 p-4">
        <Text size="sm" className="text-[var(--bellum-text-muted)]">
          {t('needSheet.tabs.positioningLoadError')}
        </Text>
      </Box>
    )
  }

  if (items.length === 0) {
    return (
      <Box className="rounded-control border border-dashed border-[var(--bellum-border)] p-4">
        <Text size="sm" className="text-[var(--bellum-text-muted)]">
          {elsewhere > 0
            ? t('needSheet.tabs.positioningEmptyElsewhere', { count: elsewhere, project: need.project_label })
            : t('needSheet.tabs.positioningEmpty')}
        </Text>
      </Box>
    )
  }

  return (
    // Le tableau commun des listes Théo (`.ht-table stack`) : en-tête teinté, lignes denses ; défile au téléphone.
    <Box className="overflow-x-auto overscroll-x-contain rounded-control border border-[var(--bellum-border)]">
      <table className="w-full min-w-[42rem] border-collapse text-left text-sm [&_td]:px-3 [&_th]:px-3">
        <thead>
          <tr className="border-b border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] text-xs text-[var(--bellum-text-muted)]">
            <th scope="col" className="py-2 font-medium">
              {t('needSheet.profilesTable.columns.consultant')}
            </th>
            <th scope="col" className="py-2 font-medium">
              {t('needSheet.profilesTable.columns.correspondence')}
            </th>
            <th scope="col" className="py-2 font-medium">
              {t('needSheet.profilesTable.columns.follow')}
            </th>
            <th scope="col" className="py-2 font-medium">
              {t('needSheet.profilesTable.columns.due')}
            </th>
            <th scope="col" className="py-2 font-medium">
              <span className="sr-only">{t('needSheet.profilesTable.columns.open')}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map(item => (
            <PositionedRow key={item.id} item={item} clear={clearByConsultant.get(item.consultantId) ?? null} />
          ))}
        </tbody>
      </table>
    </Box>
  )
}

function PositionedRow({ item, clear }: { item: Submission; clear: MatchInClear | null }) {
  const { t } = useTranslation('projects')
  const { t: tSubmissions } = useTranslation('submissions')
  const { t: tMatching } = useTranslation('matching')
  const name = item.consultantName ?? tSubmissions('unknownTalent')
  const inClear = clear
    ? matchInClearLabel(
        clear,
        axis => tMatching(`axes.${axis}`),
        (key, list) => t(`needSheet.inClear.${key}`, { list }),
      )
    : null
  const due = formatDate(item.nextActionDueAt, { day: 'numeric', month: 'short' })
  return (
    <tr className="border-b border-[var(--bellum-border)] align-top last:border-b-0">
      <td className="py-3">
        <span className="inline-flex min-w-0 items-center gap-2.5">
          <EntityAvatar name={name} size="sm" shape="circle" aria-hidden />
          <span className="min-w-0">
            <Link to="/consultants/$id" params={{ id: item.consultantId }} className="font-medium hover:underline">
              {name}
            </Link>
            {/* Un TJM absent n'est PAS 0 € : il n'a pas été chiffré. */}
            <Text element="span" size="xs" className="block text-[var(--bellum-text-muted)]">
              {item.proposedRateCents === null
                ? tSubmissions('noRate')
                : tSubmissions('rate', { value: Math.round(item.proposedRateCents / 100) })}
            </Text>
          </span>
        </span>
      </td>
      <td className="max-w-[18rem] py-3" data-testid="positioned-in-clear">
        {/* Décision Louis : en MOTS, jamais en points. Sans rapprochement lu pour ce profil, on le dit. */}
        <Text element="span" size="sm" className={inClear ? '' : 'text-[var(--bellum-text-muted)]'}>
          {inClear ?? t('needSheet.inClear.none')}
        </Text>
      </td>
      <td className="py-3">
        <Badge variant={STAGE_TONE[item.stage]}>{tSubmissions(`stages.${item.stage}`)}</Badge>
        {/* La disponibilité DÉCLARÉE au positionnement gagne : figée, jamais recalculée ici. */}
        <Text element="span" size="xs" className="mt-1 block text-[var(--bellum-text-muted)]">
          {item.availability?.trim()
            ? t('needSheet.profilesTable.availabilityDeclared', { value: item.availability.trim() })
            : t('needSheet.profilesTable.availabilityToConfirm')}
        </Text>
      </td>
      <td className="py-3" data-testid="positioned-due">
        {due ? (
          <>
            <Text element="span" size="sm" className="block">
              {item.nextActionLabel ?? t('needSheet.profilesTable.dueAction')}
            </Text>
            <Text element="span" size="xs" className="block text-[var(--bellum-text-muted)]">
              {due}
            </Text>
          </>
        ) : (
          <Text element="span" size="sm" className="text-[var(--bellum-text-muted)]">
            {t('needSheet.profilesTable.dueUnknown')}
          </Text>
        )}
      </td>
      <td className="py-3">
        <span className="inline-flex items-center gap-1">
          <Link
            to="/submissions/$id"
            params={{ id: item.id }}
            aria-label={t('needSheet.profilesTable.openNamed', { name })}
            className="inline-flex min-h-11 items-center rounded-control px-2 text-sm hover:underline"
          >
            {t('needSheet.profilesTable.open')}
          </Link>
          {/* #2152.49 — la prospection inversée depuis une fiche besoin, posée sur CE candidat. */}
          <Button
            variant="ghost"
            size="icon"
            className="pointer-coarse:min-h-11 pointer-coarse:min-w-11"
            aria-label={t('needSheet.tabs.positioningReverseMarket', { name })}
            asChild
          >
            <Link to="/consultants/$id/reverse-market" params={{ id: item.consultantId }}>
              <Compass className="size-4" aria-hidden />
            </Link>
          </Button>
        </span>
      </td>
    </tr>
  )
}
