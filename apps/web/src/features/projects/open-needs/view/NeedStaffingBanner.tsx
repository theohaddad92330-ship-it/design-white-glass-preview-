import { useMemo } from 'react'
import type { OpenNeedRow } from '@bellum/contracts'
import { Card, Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { useSubmissions } from '@/features/submissions/api'
import { UnknownValue } from '@/components/primitives/UnknownValue'
import { deriveNeedStaffingBand, missionsAssignedOf } from '../model/need-staffing'

/**
 * Le bandeau « Staffing » d'une fiche besoin (dossier du 26/08, image 02) :
 * candidats suggérés, entretiens planifiés, propositions envoyées, missions
 * attribuées.
 *
 * Réutilise `useSubmissions({ projectId })` — la MÊME requête que
 * `NeedPositioningsTab` (dédupliquée par TanStack Query, une clé de cache
 * identique) — et deux dérivations pures de `model/need-staffing.ts` :
 * `deriveNeedStaffingBand` pour les trois premiers compteurs, et
 * {@link missionsAssignedOf} pour le quatrième.
 *
 * ⚠️ Le quatrième n'est PLUS « non mesuré » par construction (revirement de
 * Louis, 31/08/2026) : `missions.need_id` existe, et la ligne porte le compte.
 * Il reste « non mesuré » dans UN cas précis — des missions existent sur
 * l'affaire et aucune ne dit de quel rôle elle vient (les missions créées avant
 * le lien). L'écran écrit alors combien, parce qu'une absence qui dit sa taille
 * se corrige, et qu'une absence muette se lit comme une panne.
 */
export function NeedStaffingBanner({ need }: { need: OpenNeedRow }) {
  const { t } = useTranslation('projects')
  const { data, isLoading, isError } = useSubmissions({ projectId: need.project_id ?? undefined })

  const band = useMemo(() => deriveNeedStaffingBand(data?.items ?? [], need.id), [data, need.id])
  const missions = useMemo(() => missionsAssignedOf(need), [need])

  return (
    <Card className="p-4">
      <Text element="h2" size="sm" weight="semibold">
        {t('needSheet.staffing.title')}
      </Text>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StaffingCell
          label={t('needSheet.staffing.suggested', { count: band.retainedProfiles })}
          value={isLoading || isError ? null : band.retainedProfiles}
          unmeasuredReason={isError ? t('needSheet.staffing.readError') : undefined}
        />
        <StaffingCell
          label={t('needSheet.staffing.interviews')}
          value={isLoading || isError ? null : band.interviewsScheduled}
          unmeasuredReason={isError ? t('needSheet.staffing.readError') : undefined}
        />
        <StaffingCell
          label={t('needSheet.staffing.proposalsSent')}
          value={isLoading || isError ? null : band.proposalsSent}
          unmeasuredReason={isError ? t('needSheet.staffing.readError') : undefined}
        />
        {/* LES MISSIONS NÉES DE CE RÔLE — mesurées depuis le 31/08/2026 (voir le
            docblock de `missionsAssignedOf` pour les quatre situations). */}
        <StaffingCell
          label={t('needSheet.staffing.missionsAssigned')}
          value={missions.measured ? missions.count : null}
          unmeasuredReason={
            missions.measured
              ? undefined
              : missions.reason === 'unlinked'
                ? // ⚠️ L'absence DIT SA TAILLE. « Deux missions existent sur
                  // cette affaire, aucune ne dit son rôle » se corrige ; « non
                  // mesuré » tout court se lit comme une panne.
                  t('needSheet.staffing.missionsUnlinked', { count: missions.unlinked })
                : t('needSheet.staffing.missionsUnserved')
          }
          // Le plancher — même honnêteté que le cumul du kanban, qui compte à
          // part les besoins sans TJM : un total qui ne peut pas tout voir le dit.
          hint={
            missions.measured && missions.unlinked > 0
              ? t('needSheet.staffing.missionsFloor', { count: missions.unlinked })
              : undefined
          }
        />
      </div>
    </Card>
  )
}

function StaffingCell({
  label,
  value,
  unmeasuredReason,
  hint,
}: {
  label: string
  value: number | null
  unmeasuredReason?: string
  /** Ce que le chiffre ne voit pas — affiché SOUS le libellé, pas à sa place :
   *  un plancher reste un chiffre, il n'est pas une absence. */
  hint?: string
}) {
  const { t } = useTranslation('projects')
  return (
    <div className="rounded-md border border-[var(--bellum-border)] p-3">
      {value === null ? (
        <UnknownValue reason={unmeasuredReason} />
      ) : (
        // #3544.5 (GA-18/19) : un zéro MESURÉ se dit « Aucun » — « 0 Entretiens »
        // sur un besoin sans positionnement se lit comme une panne ou un échec.
        <Text element="span" size="xl" weight="semibold">
          {value === 0 ? t('needSheet.staffing.none') : value}
        </Text>
      )}
      <Text size="xs" className="mt-1 block text-[var(--bellum-text-muted)]">
        {label}
      </Text>
      {hint ? (
        <Text size="xs" className="mt-0.5 block text-[var(--bellum-text-muted)]">
          {hint}
        </Text>
      ) : null}
    </div>
  )
}
