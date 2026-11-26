import { BET_ACCESSES, BET_HORIZONS, BET_RESOURCE_MAX, BET_SIZES, type SetBetProfileRequest } from '@bellum/contracts'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Text,
} from '@bellum/ui'
import { useEffect, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useBetProfile, useSetBetProfile } from '@/features/accounts/hooks/useBetProfile'

const NOT_SET = '__not_set__'

/**
 * #3245 (#3209.6) — déclarer le PROFIL DE PARI d'un compte : horizon, taille,
 * accès, ressource. Quatre champs optionnels, « non déclaré » est un choix à
 * part entière (jamais « court » ou « ouvert » par défaut). Même patron que
 * `PartnerGovernanceEditDialog` (quatre listes + « non renseigné »). Le
 * dialogue vit HORS du menu : Radix démonte le menu en se fermant.
 */
export function BetProfileDialog({
  accountId,
  companyName,
  open,
  onClose,
}: {
  accountId: string
  companyName?: string | null
  open: boolean
  onClose: () => void
}) {
  const { t } = useTranslation('accounts')
  const current = useBetProfile(accountId, open)
  const save = useSetBetProfile()
  const resourceId = useId()
  const [horizon, setHorizon] = useState(NOT_SET)
  const [size, setSize] = useState(NOT_SET)
  const [access, setAccess] = useState(NOT_SET)
  const [resource, setResource] = useState('')

  useEffect(() => {
    if (!current.data) return
    setHorizon(current.data.horizon ?? NOT_SET)
    setSize(current.data.size ?? NOT_SET)
    setAccess(current.data.access ?? NOT_SET)
    setResource(current.data.resource ?? '')
  }, [current.data])

  const submit = () => {
    const profile: SetBetProfileRequest = {
      horizon: horizon === NOT_SET ? null : (horizon as (typeof BET_HORIZONS)[number]),
      size: size === NOT_SET ? null : (size as (typeof BET_SIZES)[number]),
      access: access === NOT_SET ? null : (access as (typeof BET_ACCESSES)[number]),
      resource: resource.trim() || null,
    }
    save.mutate({ id: accountId, profile, companyName }, { onSuccess: onClose })
  }

  const field = (
    label: string,
    value: string,
    onChange: (next: string) => void,
    choices: readonly string[],
    group: 'horizon' | 'size' | 'access',
  ) => (
    <div>
      <Text size="xs" className="mb-1 block text-[var(--bellum-text-muted)]">
        {label}
      </Text>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger aria-label={label} className="h-11 w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NOT_SET}>{t('betProfile.notSet')}</SelectItem>
          {choices.map(choice => (
            <SelectItem key={choice} value={choice}>
              {/* i18n keys: betProfile.horizon.short | betProfile.horizon.long | betProfile.size.standard | betProfile.size.very_large | betProfile.access.open | betProfile.access.closed */}
              {t(`betProfile.${group}.${choice}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )

  return (
    <Dialog
      open={open}
      onOpenChange={next => {
        if (!next) onClose()
      }}
    >
      <DialogContent closeLabel={t('common:actions.close')} className="max-w-lg space-y-4">
        <DialogHeader>
          <DialogTitle>{t('betProfile.title')}</DialogTitle>
          <DialogDescription>{t('betProfile.description')}</DialogDescription>
        </DialogHeader>

        {field(t('betProfile.horizon.label'), horizon, setHorizon, BET_HORIZONS, 'horizon')}
        {field(t('betProfile.size.label'), size, setSize, BET_SIZES, 'size')}
        {field(t('betProfile.access.label'), access, setAccess, BET_ACCESSES, 'access')}

        <div>
          <Text size="xs" element="label" htmlFor={resourceId} className="mb-1 block text-[var(--bellum-text-muted)]">
            {t('betProfile.resource.label')}
          </Text>
          <Input
            id={resourceId}
            value={resource}
            maxLength={BET_RESOURCE_MAX}
            onChange={event => setResource(event.target.value)}
            placeholder={t('betProfile.resource.placeholder')}
            className="h-11"
          />
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>
            {t('betProfile.cancel')}
          </Button>
          <Button size="sm" disabled={save.isPending || current.isLoading} isLoading={save.isPending} onClick={submit}>
            {t('betProfile.save')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
