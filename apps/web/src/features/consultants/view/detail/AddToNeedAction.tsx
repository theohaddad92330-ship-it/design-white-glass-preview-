import { useState } from 'react'
import { Box, Button, SelectField, Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { useOpenNeeds } from '@/features/projects/open-needs/hooks/useOpenNeeds'
import { useCreateSubmission } from '@/features/submissions/api'

/** Combien de besoins ouverts le sélecteur propose — au-delà, la recherche
 *  transverse du module Opportunités reste le bon endroit. */
const ADD_TO_NEED_LIMIT = 50

/**
 * #2185.50 — « Ajouter à un besoin » : positionner CE talent sur un besoin
 * ouvert depuis sa propre fiche. `useCreateSubmission` existait déjà,
 * réutilisé tel quel — jamais un second chemin d'écriture d'un positionnement.
 *
 * ⚠️ Un besoin sans AFFAIRE (`project_id` nul) est écarté : `createSubmissionSchema`
 * exige `projectId`, et un besoin qui n'en porte pas ne peut recevoir aucun
 * positionnement, ici comme depuis le rail de matching (`NeedsMatchRail`,
 * même exclusion).
 */
export function AddToNeedAction({ talentId }: { talentId: string }) {
  const { t } = useTranslation('consultants')
  const { data: needs, isLoading } = useOpenNeeds({ offset: 0, limit: ADD_TO_NEED_LIMIT })
  const create = useCreateSubmission()
  const [selected, setSelected] = useState('')

  const options = (needs?.data ?? []).filter(
    (need): need is typeof need & { project_id: string } => need.project_id !== null,
  )

  if (isLoading) return null
  if (options.length === 0) return null

  const submit = () => {
    const need = options.find(item => item.id === selected)
    if (!need) return
    create.mutate(
      {
        projectId: need.project_id,
        consultantId: talentId,
        needId: need.id,
        // Un profil n'est pas « envoyé » parce qu'on l'a retenu — même défaut
        // que `createSubmissionSchema.stage`.
        stage: 'shortlisted',
        proposedRateCents: null,
      },
      { onSuccess: () => setSelected('') },
    )
  }

  return (
    <Box display="flex" className="flex-wrap items-center gap-2 border-t border-border pt-3">
      <SelectField
        ariaLabel={t('detail.addToNeed.label')}
        value={selected}
        onChange={setSelected}
        emptyOption={{ label: t('detail.addToNeed.placeholder') }}
        options={options.map(need => ({
          value: need.id,
          label: need.account_name ? `${need.title} — ${need.account_name}` : need.title,
        }))}
        size="sm"
        className="min-w-[220px] max-w-full"
      />
      <Button size="sm" variant="outline" disabled={!selected || create.isPending} onClick={submit}>
        {create.isPending ? t('detail.addToNeed.working') : t('detail.addToNeed.submit')}
      </Button>
      {create.isError ? (
        <Text size="xs" role="alert" className="text-[var(--danger-soft-text)]">
          {create.error.message || t('detail.addToNeed.failed')}
        </Text>
      ) : null}
    </Box>
  )
}
