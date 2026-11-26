import { hasPermission, type BusinessUnitView, type WorkspaceTeamMember } from '@bellum/contracts'
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Text,
  Textarea,
} from '@bellum/ui'
import { useEffect, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ScreenState } from '@/components/primitives/ScreenState'
import { SettingsViewHeader } from '@/features/settings/components/SettingsViewHeader'
import { useTeam } from '@/features/team/hooks/useTeam'
import { useBusinessUnitAdmin, type BusinessUnitFicheInput } from '../hooks/useBusinessUnitAdmin'

/**
 * #2005.5 — LA FICHE D'UNE BU, ENFIN SAISISSABLE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT, MESURÉ LE 17/09/2026 AU SOIR
 * ─────────────────────────────────────────────────────────────────────────────
 * `apps/web/src/features/business-units/api.ts` n'exposait que `list` / `join`
 * / `requestAccess` : aucun écran n'appelait `POST`/`PATCH /business-units`, y
 * compris pour les champs PRÉEXISTANTS `consultantCount` / `teamSize` /
 * `portfolioNote`. La migration, l'entité, le service et les contrats
 * existent (`capacityAvailableConsultants`, `quarterObjective`) — il manquait
 * la saisie.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA PERMISSION — REPRISE, PAS INVENTÉE
 * ─────────────────────────────────────────────────────────────────────────────
 * `PATCH /business-units/:id` est déjà sous `team:manage` côté API
 * (`business-unit.controller.ts`) — « ce sont les gestes d'ORGANISATION ». Cet
 * écran reprend exactement la même règle : un membre sans `team:manage` LIT la
 * fiche, jamais un formulaire qui rendrait 403.
 */
export function BusinessUnitAdminView() {
  const { t } = useTranslation('businessUnitsAdmin')
  const { t: tCommon } = useTranslation('common')
  const { team, isLoading: teamLoading } = useTeam()
  const canEdit = team ? hasPermission(team.workspace.role, 'team:manage') : false
  const admin = useBusinessUnitAdmin()
  const members = team?.members ?? []
  const [editing, setEditing] = useState<BusinessUnitView | 'new' | null>(null)

  // Les actifs d'abord, les archivés après : on archive, on ne supprime pas — l'historique reste lisible.
  const units = [...(admin.data?.businessUnits ?? [])].sort(
    (a, b) => Number(a.status === 'archived') - Number(b.status === 'archived'),
  )

  return (
    <div className="w-full">
      <SettingsViewHeader
        scope="space"
        title={t('title')}
        subtitle={t('subtitle')}
        actions={
          canEdit ? (
            <Button type="button" size="sm" className="min-h-11" onClick={() => setEditing('new')}>
              {t('add')}
            </Button>
          ) : null
        }
      />

      {teamLoading || admin.isLoading ? (
        <ScreenState state="loading" message={t('loadingMessage')} />
      ) : admin.isError ? (
        <ScreenState state="error" message={t('errorMessage')} />
      ) : units.length === 0 ? (
        <ScreenState state="empty_never" message={t('empty')} />
      ) : (
        <div className="overflow-hidden rounded-xl border border-[var(--bellum-border)] bg-card">
          <Table>
            <TableHeader>
              <TableRow className="border-[var(--border-subtle)]">
                <TableHead className="text-[var(--bellum-text-muted)]">{t('columns.unit')}</TableHead>
                <TableHead className="text-[var(--bellum-text-muted)]">{t('columns.zoneLead')}</TableHead>
                <TableHead className="text-[var(--bellum-text-muted)]">{t('columns.status')}</TableHead>
                {canEdit ? (
                  <TableHead className="text-right text-[var(--bellum-text-muted)]">{t('columns.actions')}</TableHead>
                ) : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {units.map(unit => (
                <UnitRow
                  key={unit.id}
                  unit={unit}
                  members={members}
                  canEdit={canEdit}
                  busy={admin.savingId === unit.id}
                  onEdit={() => setEditing(unit)}
                  onToggleArchive={() =>
                    admin.save(unit.id, unit.name, { status: unit.status === 'archived' ? 'active' : 'archived' })
                  }
                />
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <Text element="p" size="xs" className="mt-3 text-[var(--bellum-text-secondary)]">
        {t('archiveNote')}
      </Text>

      {editing !== null ? (
        <UnitDialog
          key={editing === 'new' ? 'new' : editing.id}
          unit={editing === 'new' ? null : editing}
          members={members}
          saving={editing === 'new' ? admin.creating : admin.savingId === editing.id}
          closeLabel={tCommon('actions.close')}
          cancelLabel={tCommon('actions.cancel')}
          onClose={() => setEditing(null)}
          onCreate={input => admin.create({ ...input, kind: 'business_unit', specialties: [] }, () => setEditing(null))}
          onSave={(unit, patch) => admin.save(unit.id, unit.name, patch, () => setEditing(null))}
        />
      ) : null}
    </div>
  )
}

function leadName(unit: BusinessUnitView, members: readonly WorkspaceTeamMember[]): string | null {
  if (unit.leadUserId === null) return null
  const lead = members.find(member => member.userId === unit.leadUserId)
  return lead?.fullName ?? lead?.email ?? null
}

/** Une ligne du tableau : le périmètre et ses faits, la zone et le responsable, le statut, les gestes. */
function UnitRow({
  unit,
  members,
  canEdit,
  busy,
  onEdit,
  onToggleArchive,
}: {
  unit: BusinessUnitView
  members: readonly WorkspaceTeamMember[]
  canEdit: boolean
  busy: boolean
  onEdit: () => void
  onToggleArchive: () => void
}) {
  const { t } = useTranslation('businessUnitsAdmin')
  const archived = unit.status === 'archived'
  const lead = leadName(unit, members)
  // « On n'affiche pas ce qu'on n'a pas » : une valeur absente ne fait aucune ligne, jamais « 0 ».
  const facts = [
    unit.memberCount > 0 ? t('memberCount', { count: unit.memberCount }) : null,
    unit.capacityAvailableConsultants !== null
      ? t('fields.capacityValue', { count: unit.capacityAvailableConsultants })
      : null,
    unit.consultantCount !== null ? t('fields.consultantCountValue', { count: unit.consultantCount }) : null,
    unit.teamSize !== null ? t('fields.teamSizeValue', { count: unit.teamSize }) : null,
  ].filter((fact): fact is string => fact !== null)
  return (
    <TableRow className="border-[var(--border-subtle)]">
      <TableCell className="whitespace-normal">
        <Text element="p" size="sm" weight="semibold">
          {unit.name}
        </Text>
        {facts.length > 0 ? (
          <Text element="p" size="xs" className="text-[var(--bellum-text-secondary)]">
            {facts.join(' · ')}
          </Text>
        ) : null}
        {unit.quarterObjective ? (
          <Text element="p" size="xs" className="text-[var(--bellum-text-secondary)]">
            {unit.quarterObjective}
          </Text>
        ) : null}
        {unit.portfolioNote ? (
          <Text element="p" size="xs" className="text-[var(--bellum-text-secondary)]">
            {unit.portfolioNote}
          </Text>
        ) : null}
      </TableCell>
      <TableCell className="whitespace-normal">
        {unit.territory ? (
          <Text element="p" size="sm">
            {unit.territory}
          </Text>
        ) : null}
        {lead ? (
          <Text element="p" size="xs" className="text-[var(--bellum-text-secondary)]">
            {lead}
          </Text>
        ) : null}
      </TableCell>
      <TableCell>
        <Badge variant={archived ? 'outline' : 'success'} className="text-xs">
          {archived ? t('status.archived') : t('status.active')}
        </Badge>
      </TableCell>
      {canEdit ? (
        <TableCell className="text-right">
          <span className="inline-flex flex-wrap justify-end gap-2">
            {archived ? null : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="min-h-11"
                aria-label={t('editAria', { name: unit.name })}
                onClick={onEdit}
              >
                {t('edit')}
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="min-h-11"
              disabled={busy}
              aria-label={archived ? t('reactivateAria', { name: unit.name }) : t('archiveAria', { name: unit.name })}
              onClick={onToggleArchive}
            >
              {archived ? t('reactivate') : t('archive')}
            </Button>
          </span>
        </TableCell>
      ) : null}
    </TableRow>
  )
}

/** Radix refuse une valeur vide : « aucun responsable » a sa propre valeur. */
const NO_LEAD = '__none__'
const toDraft = (value: number | null): string => (value === null ? '' : String(value))
const toNumberOrNull = (draft: string): number | null => {
  const trimmed = draft.trim()
  if (trimmed === '') return null
  const parsed = Number(trimmed)
  return Number.isInteger(parsed) ? parsed : Number.NaN
}

/**
 * « Modifier » / « Ajouter un périmètre » (maquette `dlg-unit`) : le nom, la zone, le responsable — puis la fiche
 * d'#2005.5 (capacité, objectif du trimestre, effectif, taille d'équipe, note de portefeuille), déjà là et gardée.
 */
function UnitDialog({
  unit,
  members,
  saving,
  closeLabel,
  cancelLabel,
  onClose,
  onCreate,
  onSave,
}: {
  unit: BusinessUnitView | null
  members: readonly WorkspaceTeamMember[]
  saving: boolean
  closeLabel: string
  cancelLabel: string
  onClose: () => void
  onCreate: (
    input: { name: string; territory: string | null; leadUserId: string | null } & BusinessUnitFicheInput,
  ) => void
  onSave: (
    unit: BusinessUnitView,
    patch: { name: string; territory: string | null; leadUserId: string | null } & BusinessUnitFicheInput,
  ) => void
}) {
  const { t } = useTranslation('businessUnitsAdmin')
  const formId = useId()
  const label = unit?.name ?? t('newUnitName')
  const [name, setName] = useState(unit?.name ?? '')
  const [territory, setTerritory] = useState(unit?.territory ?? '')
  const [leadUserId, setLeadUserId] = useState(unit?.leadUserId ?? '')
  const [capacity, setCapacity] = useState(toDraft(unit?.capacityAvailableConsultants ?? null))
  const [objective, setObjective] = useState(unit?.quarterObjective ?? '')
  const [consultants, setConsultants] = useState(toDraft(unit?.consultantCount ?? null))
  const [teamSize, setTeamSize] = useState(toDraft(unit?.teamSize ?? null))
  const [note, setNote] = useState(unit?.portfolioNote ?? '')

  const [capacityValue, consultantsValue, teamSizeValue] = [capacity, consultants, teamSize].map(toNumberOrNull)
  const invalid =
    name.trim() === '' ||
    [capacityValue, consultantsValue, teamSizeValue].some(v => v !== null && (!Number.isFinite(v) || v < 0))

  // La fiche à l'écran change (rechargement après un enregistrement) : les brouillons suivent la valeur enregistrée.
  useEffect(() => {
    if (unit === null) return
    setCapacity(toDraft(unit.capacityAvailableConsultants))
    setObjective(unit.quarterObjective ?? '')
    setConsultants(toDraft(unit.consultantCount))
    setTeamSize(toDraft(unit.teamSize))
    setNote(unit.portfolioNote ?? '')
  }, [unit])

  const patch = {
    name: name.trim(),
    territory: territory.trim() === '' ? null : territory.trim(),
    leadUserId: leadUserId === '' ? null : leadUserId,
    capacityAvailableConsultants: capacityValue,
    quarterObjective: objective.trim() === '' ? null : objective.trim(),
    consultantCount: consultantsValue,
    teamSize: teamSizeValue,
    portfolioNote: note.trim() === '' ? null : note.trim(),
  }

  return (
    <Dialog open onOpenChange={open => (open ? undefined : onClose())}>
      <DialogContent closeLabel={closeLabel} className="max-h-[90dvh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{unit ? t('dialog.editTitle') : t('dialog.addTitle')}</DialogTitle>
          <DialogDescription>{t('dialog.description')}</DialogDescription>
        </DialogHeader>
        <form
          id={formId}
          className="flex flex-col gap-4"
          onSubmit={event => {
            event.preventDefault()
            if (invalid) return
            if (unit) onSave(unit, patch)
            else onCreate(patch)
          }}
        >
          <Field label={t('fields.name')}>
            <Input
              value={name}
              aria-label={t('fields.nameAria', { name: label })}
              maxLength={120}
              onChange={e => setName(e.target.value)}
              className="pointer-coarse:min-h-11"
            />
          </Field>
          <Field label={t('fields.territory')}>
            <Input
              value={territory}
              aria-label={t('fields.territoryAria', { name: label })}
              maxLength={160}
              onChange={e => setTerritory(e.target.value)}
              className="pointer-coarse:min-h-11"
            />
          </Field>
          <Field label={t('fields.lead')}>
            <Select
              value={leadUserId === '' ? NO_LEAD : leadUserId}
              onValueChange={v => setLeadUserId(v === NO_LEAD ? '' : v)}
            >
              <SelectTrigger
                aria-label={t('fields.leadAria', { name: label })}
                className="h-11 w-full border-[var(--bellum-border)] bg-[var(--bellum-bg-lighter)] text-sm"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_LEAD}>{t('fields.leadNone')}</SelectItem>
                {members.map(member => (
                  <SelectItem key={member.userId} value={member.userId}>
                    {member.fullName ?? member.email ?? member.userId}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label={t('fields.capacity')}>
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              max={100000}
              value={capacity}
              aria-label={t('fields.capacityAria', { name: label })}
              onChange={e => setCapacity(e.target.value)}
              className="w-28 pointer-coarse:min-h-11"
            />
          </Field>
          <Field label={t('fields.quarterObjective')}>
            <Textarea
              value={objective}
              maxLength={500}
              aria-label={t('fields.quarterObjectiveAria', { name: label })}
              onChange={e => setObjective(e.target.value)}
              className="min-h-16"
            />
          </Field>
          <Field label={t('fields.consultantCount')}>
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              max={100000}
              value={consultants}
              aria-label={t('fields.consultantCountAria', { name: label })}
              onChange={e => setConsultants(e.target.value)}
              className="w-28 pointer-coarse:min-h-11"
            />
          </Field>
          <Field label={t('fields.teamSize')}>
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              max={100000}
              value={teamSize}
              aria-label={t('fields.teamSizeAria', { name: label })}
              onChange={e => setTeamSize(e.target.value)}
              className="w-28 pointer-coarse:min-h-11"
            />
          </Field>
          <Field label={t('fields.portfolioNote')}>
            <Textarea
              value={note}
              maxLength={2000}
              aria-label={t('fields.portfolioNoteAria', { name: label })}
              onChange={e => setNote(e.target.value)}
              className="min-h-16"
            />
          </Field>
        </form>
        <DialogFooter>
          <Button type="button" variant="outline" className="min-h-11" onClick={onClose}>
            {cancelLabel}
          </Button>
          <Button
            type="submit"
            form={formId}
            variant="violet"
            className="min-h-11"
            disabled={invalid || saving}
            aria-label={t('saveAria', { name: label })}
          >
            {t('save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Text element="p" size="sm" weight="medium">
        {label}
      </Text>
      {children}
    </div>
  )
}
