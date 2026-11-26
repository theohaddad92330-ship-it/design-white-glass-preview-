import {
  Box,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  SelectField,
  Text,
} from '@bellum/ui'
import { useNavigate } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useConsultants } from '@/features/consultants/hooks'
import { useOpenNeeds } from '@/features/projects/open-needs/hooks/useOpenNeeds'
import { useCreateSubmission } from '../api'

/**
 * Théo C projects-presentations.R3 — « Relier un profil à un besoin » : deux listes, puis « Vérifier le
 * positionnement ». Le geste crée une PRÉSÉLECTION (jamais un envoi : « Aucun envoi ne se déduit d'un
 * déplacement de carte ») puis ouvre la présentation. Un besoin sans affaire n'est pas proposé : un
 * positionnement s'écrit sur une affaire.
 */
export function AddPresentationDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation('submissions')
  const navigate = useNavigate()
  const needs = useOpenNeeds({ offset: 0, limit: 200 }, { enabled: open })
  const consultants = useConsultants()
  const create = useCreateSubmission()
  const [needId, setNeedId] = useState('')
  const [consultantId, setConsultantId] = useState('')

  const needOptions = useMemo(
    () =>
      (needs.data?.data ?? [])
        .filter(need => need.project_id)
        .map(need => ({
          value: need.id,
          label: need.account_name ? `${need.title} · ${need.account_name}` : need.title,
        })),
    [needs.data?.data],
  )
  const consultantOptions = useMemo(
    () => (consultants.data ?? []).map(c => ({ value: c.id, label: c.full_name ?? t('row.unnamedConsultant') })),
    [consultants.data, t],
  )
  const need = (needs.data?.data ?? []).find(item => item.id === needId)
  const canSubmit = Boolean(need?.project_id && consultantId) && !create.isPending

  const submit = () => {
    if (!need?.project_id || !consultantId) return
    create.mutate(
      { projectId: need.project_id, needId: need.id, consultantId, stage: 'shortlisted', proposedRateCents: null },
      {
        onSuccess: created => {
          onOpenChange(false)
          setNeedId('')
          setConsultantId('')
          void navigate({ to: '/submissions/$id', params: { id: created.id } })
        },
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t('common:actions.close')}>
        <DialogHeader>
          <DialogTitle>{t('presentations.add.title')}</DialogTitle>
          <DialogDescription>{t('presentations.add.description')}</DialogDescription>
        </DialogHeader>
        <Box className="space-y-3">
          <label className="block">
            <Text size="xs" weight="medium" element="span">
              {t('presentations.add.need')}
            </Text>
            <SelectField
              ariaLabel={t('presentations.add.need')}
              value={needId}
              onChange={setNeedId}
              emptyOption={{ label: t('presentations.add.choose') }}
              options={needOptions}
              className="mt-1 w-full"
            />
          </label>
          <label className="block">
            <Text size="xs" weight="medium" element="span">
              {t('presentations.add.profile')}
            </Text>
            <SelectField
              ariaLabel={t('presentations.add.profile')}
              value={consultantId}
              onChange={setConsultantId}
              emptyOption={{ label: t('presentations.add.choose') }}
              options={consultantOptions}
              className="mt-1 w-full"
            />
          </label>
          {!needs.isLoading && needOptions.length === 0 ? (
            <Text size="xs" color="text-muted-foreground">
              {t('presentations.add.noNeed')}
            </Text>
          ) : null}
        </Box>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            className="pointer-coarse:min-h-11"
            onClick={() => onOpenChange(false)}
          >
            {t('presentations.add.cancel')}
          </Button>
          <Button type="button" className="pointer-coarse:min-h-11" disabled={!canSubmit} onClick={submit}>
            {t('presentations.add.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
