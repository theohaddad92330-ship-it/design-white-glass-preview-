import {
  Badge,
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FormField,
  Text,
} from '@bellum/ui'
import { Plus, X } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { AccountTeamScope } from '@bellum/contracts'
import { useAccountEntities } from '@/features/adv/api'
import { useAccountTeamScopeMutations, useCreateBusinessUnit, useWorkspaceBusinessUnits } from '../hooks'

/**
 * #4996 L6 — poser / retirer les zones d'UN membre. Trois sources : les entités du compte (cases à cocher, le
 * serveur recopie le nom), les BU de l'espace (#4996.4, idem ; la section est toujours là, avec « Ajouter la BU » quand l'espace n'en a aucune) et un
 * libellé libre (validé par le même schéma que l'API, dont l'erreur s'affiche SOUS
 * le champ). Une zone est un filtre et une suggestion, jamais un droit : rien ici ne bloque un geste.
 */
export function AccountTeamScopeDialog({
  accountId,
  member,
  open,
  onOpenChange,
}: {
  accountId: string
  member: { user_id: string; name: string; scopes: AccountTeamScope[] }
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation('teamGuardrails')
  const entities = useAccountEntities(accountId).data?.items ?? []
  const { add, remove } = useAccountTeamScopeMutations(accountId)
  const [label, setLabel] = useState('')
  const [error, setError] = useState<string | null>(null)

  const createUnit = useCreateBusinessUnit()
  const [addingUnit, setAddingUnit] = useState(false)
  const [unitName, setUnitName] = useState('')
  const [unitError, setUnitError] = useState<string | null>(null)

  const loadedUnits = useWorkspaceBusinessUnits()
  const businessUnits = loadedUnits ?? []

  const entityScope = (entityId: string) => member.scopes.find(s => s.entity_id === entityId)
  const unitScope = (unitId: string) => member.scopes.find(s => s.business_unit_id === unitId)
  const freeScopes = member.scopes.filter(s => s.entity_id === null && !s.business_unit_id)
  // Une BU archivée ensuite reste affichée par son libellé, retirable — une fois la liste lue, pas avant.
  const knownUnitIds = new Set(businessUnits.map(b => b.id))
  const orphanedUnits =
    loadedUnits === null ? [] : member.scopes.filter(s => !!s.business_unit_id && !knownUnitIds.has(s.business_unit_id))
  // Une entité retirée ensuite reste affichée par son libellé, avec sa pastille.
  const knownIds = new Set(entities.map(e => e.id))
  const orphaned = member.scopes.filter(s => s.entity_id !== null && !knownIds.has(s.entity_id))

  const submit = async (body: { entity_id?: string; business_unit_id?: string; label?: string }): Promise<boolean> => {
    setError(null)
    try {
      await add.mutateAsync({ user_id: member.user_id, ...body })
      return true
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t('team.scope.failed'))
      return false
    }
  }
  const toggleEntity = (entityId: string) => {
    const existing = entityScope(entityId)
    if (existing) remove.mutate({ userId: member.user_id, scopeId: existing.id })
    else void submit({ entity_id: entityId })
  }
  const toggleUnit = (unitId: string) => {
    const existing = unitScope(unitId)
    if (existing) remove.mutate({ userId: member.user_id, scopeId: existing.id })
    else void submit({ business_unit_id: unitId })
  }
  const sortedUnits = [...businessUnits].sort((a, b) => a.name.localeCompare(b.name, 'fr'))
  const addLabel = async () => {
    if (await submit({ label })) setLabel('')
  }
  const addUnit = async () => {
    setUnitError(null)
    try {
      await createUnit.mutateAsync({ name: unitName.trim(), kind: 'business_unit', specialties: [] })
      setUnitName('')
      setAddingUnit(false)
    } catch (err) {
      setUnitError(err instanceof Error && err.message ? err.message : t('team.scope.unitFailed'))
    }
  }
  const sorted = [...entities].sort((a, b) => a.name.localeCompare(b.name, 'fr'))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t('common:actions.close')} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('team.scope.title', { name: member.name })}</DialogTitle>
          <DialogDescription>{t('team.scope.description')}</DialogDescription>
        </DialogHeader>
        {sorted.length > 0 || orphaned.length > 0 ? (
          <fieldset className="flex flex-col gap-1">
            <legend className="mb-1 text-sm font-medium">{t('team.scope.entities')}</legend>
            {sorted.map(entity => (
              <label key={entity.id} className="flex min-h-11 items-center gap-3">
                <Checkbox
                  checked={!!entityScope(entity.id)}
                  disabled={add.isPending || remove.isPending}
                  onCheckedChange={() => toggleEntity(entity.id)}
                  aria-label={entity.name}
                />
                <Text size="sm">{entity.name}</Text>
                {entity.kind !== 'unknown' ? (
                  <Badge variant="outline">{t(`team.scope.kind.${entity.kind}`)}</Badge>
                ) : null}
              </label>
            ))}
            {orphaned.map(scope => (
              <div key={scope.id} className="flex min-h-11 items-center gap-3">
                <Text size="sm">{scope.label}</Text>
                <Badge variant="warning">{t('team.scope.removedEntity')}</Badge>
                <Button
                  size="icon"
                  variant="ghost"
                  icon={X}
                  className="ml-auto min-h-11 min-w-11"
                  aria-label={t('team.scope.removeFree', { label: scope.label, name: member.name })}
                  onClick={() => remove.mutate({ userId: member.user_id, scopeId: scope.id })}
                />
              </div>
            ))}
          </fieldset>
        ) : null}
        <fieldset className="flex flex-col gap-1">
          <legend className="mb-1 text-sm font-medium">{t('team.scope.businessUnits')}</legend>
          {sortedUnits.map(unit => (
            <label key={unit.id} className="flex min-h-11 items-center gap-3">
              <Checkbox
                checked={!!unitScope(unit.id)}
                disabled={add.isPending || remove.isPending}
                onCheckedChange={() => toggleUnit(unit.id)}
                aria-label={unit.name}
              />
              <Text size="sm">{unit.name}</Text>
            </label>
          ))}
          {orphanedUnits.map(scope => (
            <div key={scope.id} className="flex min-h-11 items-center gap-3">
              <Text size="sm">{scope.label}</Text>
              <Badge variant="warning">{t('team.scope.archivedUnit')}</Badge>
              <Button
                size="icon"
                variant="ghost"
                icon={X}
                className="ml-auto min-h-11 min-w-11"
                aria-label={t('team.scope.removeFree', { label: scope.label, name: member.name })}
                onClick={() => remove.mutate({ userId: member.user_id, scopeId: scope.id })}
              />
            </div>
          ))}
          {loadedUnits !== null && sortedUnits.length === 0 && orphanedUnits.length === 0 ? (
            <Text size="sm" color="text-[var(--bellum-text-muted)]">
              {t('team.scope.noUnits')}
            </Text>
          ) : null}
          {addingUnit ? (
            <form
              className="flex flex-col gap-2"
              onSubmit={event => {
                event.preventDefault()
                if (!createUnit.isPending && unitName.trim() !== '') void addUnit()
              }}
            >
              <FormField
                label={t('team.scope.unitName')}
                error={unitError ?? undefined}
                inputProps={{ value: unitName, onChange: event => setUnitName(event.target.value) }}
              />
              <Button
                type="submit"
                variant="outline"
                className="min-h-11"
                disabled={createUnit.isPending || unitName.trim() === ''}
              >
                {t('team.scope.unitSubmit')}
              </Button>
            </form>
          ) : (
            <Button
              type="button"
              variant="outline"
              icon={Plus}
              className="min-h-11 self-start"
              onClick={() => setAddingUnit(true)}
            >
              {t('team.scope.unitAdd')}
            </Button>
          )}
        </fieldset>
        {freeScopes.length > 0 ? (
          <ul aria-label={t('team.scope.free')} className="flex flex-col gap-1">
            {freeScopes.map(scope => (
              <li key={scope.id} className="flex min-h-11 items-center justify-between gap-3">
                <Text size="sm">{scope.label}</Text>
                <Button
                  size="icon"
                  variant="ghost"
                  icon={X}
                  className="min-h-11 min-w-11"
                  aria-label={t('team.scope.removeFree', { label: scope.label, name: member.name })}
                  disabled={remove.isPending}
                  onClick={() => remove.mutate({ userId: member.user_id, scopeId: scope.id })}
                />
              </li>
            ))}
          </ul>
        ) : null}
        <form
          className="flex flex-col gap-2"
          onSubmit={event => {
            event.preventDefault()
            if (!add.isPending) void addLabel()
          }}
        >
          <FormField
            label={t('team.scope.freeLabel')}
            description={t('team.scope.freeNote')}
            error={error ?? undefined}
            inputProps={{ value: label, onChange: event => setLabel(event.target.value) }}
          />
          <Button type="submit" variant="outline" className="min-h-11" disabled={add.isPending || label.trim() === ''}>
            {t('team.scope.freeAdd')}
          </Button>
        </form>
        <DialogFooter>
          <Button variant="ghost" className="min-h-11" onClick={() => onOpenChange(false)}>
            {t('team.scope.done')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
