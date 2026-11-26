import {
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  SelectField,
  Text,
} from '@bellum/ui'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { UnknownValue } from '@/components/primitives/UnknownValue'
import { useMyBusinessUnits } from '@/features/business-units/hooks/useMyBusinessUnits'
import { useMissionBusinessUnit, useTransferMissionBusinessUnit } from './mission-business-unit.api'

/**
 * #3413 « autre BU » — le contenu de la ligne « BU propriétaire » de la fiche
 * mission : la BU qui porte la mission (la sienne, ou celle de son compte), et le
 * geste « Transférer » — un transfert RÉEL vers une autre BU de NOTRE espace
 * (décision Louis 02/10 : un geste explicite, confirmé, journalisé).
 *
 * Se glisse DANS `Line` de `OverviewTab` (`MissionDetailTabs.tsx`) : une ligne de
 * la fiche, pas un bloc de plus. Le journal se lit dans « Historique ».
 *
 * La liste des cibles vient de `useMyBusinessUnits` (les périmètres de l'espace) ;
 * la BU actuelle en est retirée, une BU archivée n'y figure pas.
 */
export function MissionBusinessUnitLine({ missionId }: { missionId: string }) {
  const { t } = useTranslation('missions')
  const { data: state, isLoading } = useMissionBusinessUnit(missionId)
  const [open, setOpen] = useState(false)

  if (isLoading) return <>{t('businessUnit.loading')}</>

  return (
    <span className="inline-flex flex-wrap items-center justify-end gap-2">
      {state?.businessUnit ? (
        <span>
          {state.businessUnit.name}
          {state.inherited ? (
            <Text element="span" size="xs" color="text-muted-foreground">
              {' '}
              · {t('businessUnit.inherited')}
            </Text>
          ) : null}
        </span>
      ) : (
        <UnknownValue reason={t('businessUnit.none')} />
      )}
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="pointer-coarse:min-h-11"
        onClick={() => setOpen(true)}
      >
        {t('businessUnit.transfer')}
      </Button>
      {open ? (
        <TransferDialog
          missionId={missionId}
          currentId={state?.businessUnit?.id ?? null}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </span>
  )
}

function TransferDialog({
  missionId,
  currentId,
  onClose,
}: {
  missionId: string
  currentId: string | null
  onClose: () => void
}) {
  const { t } = useTranslation('missions')
  const { units } = useBusinessUnitTargets(currentId)
  const [targetId, setTargetId] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const transfer = useTransferMissionBusinessUnit(missionId)

  return (
    <Dialog open onOpenChange={next => !next && onClose()}>
      <DialogContent closeLabel={t('common:actions.close')} className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('businessUnit.dialogTitle')}</DialogTitle>
          <DialogDescription>{t('businessUnit.dialogHint')}</DialogDescription>
        </DialogHeader>
        {units.length === 0 ? (
          <Text size="sm" color="text-muted-foreground">
            {t('businessUnit.noTarget')}
          </Text>
        ) : (
          <Box className="space-y-3">
            <SelectField
              ariaLabel={t('businessUnit.target')}
              placeholder={t('businessUnit.target')}
              value={targetId}
              emptyOption={{ label: t('businessUnit.target') }}
              options={units.map(unit => ({ value: unit.id, label: unit.name }))}
              onChange={setTargetId}
            />
            <Box display="flex" className="items-start gap-2">
              <Checkbox
                id="mission-bu-transfer-confirm"
                checked={confirmed}
                onCheckedChange={value => setConfirmed(value === true)}
                aria-label={t('businessUnit.confirm')}
              />
              <Text element="label" size="sm" htmlFor="mission-bu-transfer-confirm">
                {t('businessUnit.confirm')}
              </Text>
            </Box>
          </Box>
        )}
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            {t('common:actions.cancel')}
          </Button>
          <Button
            type="button"
            disabled={!targetId || !confirmed || transfer.isPending}
            onClick={() => transfer.mutate(targetId, { onSuccess: onClose })}
          >
            {t('businessUnit.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Les BU ACTIVES de l'espace, hors celle qui porte déjà la mission. */
function useBusinessUnitTargets(currentId: string | null) {
  const { data } = useMyBusinessUnits()
  const all = data?.businessUnits ?? []
  return { units: all.filter(unit => unit.status === 'active' && unit.id !== currentId) }
}
