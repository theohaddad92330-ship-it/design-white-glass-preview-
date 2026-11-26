import { Button, Card, SelectField, Text } from '@bellum/ui'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useConsultants } from '@/features/consultants/use-consultants'
import { useOpenNeed } from '@/features/projects/open-needs/hooks/useOpenNeed'
import { useCreateSubmission, useSubmissions } from '@/features/submissions/api'

/**
 * #2152.25 — « RATTACHER LES PROFILS » À UN APPEL D'OFFRES.
 *
 * Un AO devenu besoin (`rfp.need_id`) n'avait aucun geste pour y rattacher des
 * profils. Le rattachement EST un positionnement (`POST /submissions`) sur le
 * besoin de l'AO et son affaire — la même écriture que « Relier un profil à un
 * besoin » (`AddPresentationDialog`), jamais une seconde table de « profils
 * d'AO » qui dirait autre chose que le besoin (GA-26).
 *
 * · `shortlisted`, jamais `submitted` : rattacher un profil n'est pas l'envoyer.
 * · Un besoin SANS affaire ne propose pas le geste (un positionnement s'écrit
 *   sur une affaire) : la carte le dit, au lieu d'un bouton qui échouerait.
 * · Aucun profil rattaché = aucune ligne (on n'affiche pas ce qu'on n'a pas).
 * · Pas d'attribution à une PERSONNE côté AO : on rattache un consultant au
 *   besoin, le rôle qui répond reste un rôle (#2152.24, par design).
 */
export function RfpProfilesCard({ needId }: { needId: string }) {
  const { t } = useTranslation('rfp')
  const { need } = useOpenNeed(needId)
  const projectId = need?.project_id ?? null
  const submissions = useSubmissions(projectId ? { projectId } : {})
  const consultants = useConsultants()
  const create = useCreateSubmission()
  const [consultantId, setConsultantId] = useState('')

  const attached = useMemo(
    () => (projectId ? (submissions.data?.items ?? []).filter(submission => submission.needId === needId) : []),
    [submissions.data, projectId, needId],
  )
  const options = useMemo(
    () =>
      (consultants.data ?? []).map(consultant => ({
        value: consultant.id,
        label: consultant.full_name ?? t('profiles.unnamed'),
      })),
    [consultants.data, t],
  )

  if (!need) return null

  return (
    <Card className="p-4" data-testid="rfp-profiles">
      <Text size="sm" weight="semibold">
        {t('profiles.title')}
      </Text>
      {attached.length > 0 ? (
        <ul className="mt-2 space-y-1">
          {attached.map(submission => (
            <li key={submission.id}>
              <Text size="sm">{submission.consultantName ?? t('profiles.unnamed')}</Text>
            </li>
          ))}
        </ul>
      ) : null}
      {projectId ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <SelectField
            ariaLabel={t('profiles.pick')}
            value={consultantId}
            onChange={setConsultantId}
            emptyOption={{ label: t('profiles.choose') }}
            options={options}
            size="sm"
            className="w-auto min-w-48"
          />
          <Button
            size="sm"
            disabled={!consultantId || create.isPending}
            onClick={() =>
              create.mutate(
                { projectId, needId, consultantId, stage: 'shortlisted', proposedRateCents: null },
                { onSuccess: () => setConsultantId('') },
              )
            }
          >
            {t('profiles.attach')}
          </Button>
        </div>
      ) : (
        <Text size="xs" color="text-[var(--bellum-text-muted)]" className="mt-1">
          {t('profiles.noProject')}
        </Text>
      )}
    </Card>
  )
}
