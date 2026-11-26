import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Text,
  Textarea,
} from '@bellum/ui'
import type {
  AccountOwnership,
  PartnerConfidentiality,
  PartnerGovernanceFields,
  UpdatePartnerGovernance,
} from '@bellum/contracts'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

const NOT_SET = '__unset__'

/** Aucun cadre encore posé (deploy-skew) — jamais une valeur devinée. */
export const EMPTY_PARTNER_GOVERNANCE_FIELDS: PartnerGovernanceFields = {
  entryDoorScope: null,
  accountsAccessible: null,
  accountsForbidden: null,
  profilesSought: null,
  domainsCovered: null,
  marginFloorPercent: null,
  marginSharePercent: null,
  accountOwnership: null,
  actionOwnership: null,
  presentationTerms: null,
  paymentTerms: null,
  delayTerms: null,
  ourContactName: null,
  ourContactEmail: null,
  durationTerms: null,
  exitConditions: null,
  referencingProof: null,
  confidentialityLevel: null,
}

type TextField = Extract<
  keyof PartnerGovernanceFields,
  | 'entryDoorScope'
  | 'presentationTerms'
  | 'paymentTerms'
  | 'delayTerms'
  | 'ourContactName'
  | 'ourContactEmail'
  | 'durationTerms'
  | 'exitConditions'
  | 'referencingProof'
>
type ListField = Extract<
  keyof PartnerGovernanceFields,
  'accountsAccessible' | 'accountsForbidden' | 'profilesSought' | 'domainsCovered'
>
type NumberField = Extract<keyof PartnerGovernanceFields, 'marginFloorPercent' | 'marginSharePercent'>

const TEXT_FIELDS: { key: TextField; dimension: string; multiline: boolean }[] = [
  { key: 'entryDoorScope', dimension: 'entry_door', multiline: true },
  { key: 'presentationTerms', dimension: 'presentation_terms', multiline: true },
  { key: 'paymentTerms', dimension: 'payment_terms', multiline: true },
  { key: 'delayTerms', dimension: 'delays', multiline: true },
  { key: 'durationTerms', dimension: 'duration', multiline: true },
  { key: 'exitConditions', dimension: 'exit_conditions', multiline: true },
  { key: 'referencingProof', dimension: 'referencing_proof', multiline: true },
]

const LIST_FIELDS: { key: ListField; dimension: string }[] = [
  { key: 'accountsAccessible', dimension: 'accounts_accessible' },
  { key: 'accountsForbidden', dimension: 'accounts_forbidden' },
  { key: 'profilesSought', dimension: 'profiles_sought' },
  { key: 'domainsCovered', dimension: 'domains_covered' },
]

const NUMBER_FIELDS: { key: NumberField; dimension: string }[] = [
  { key: 'marginFloorPercent', dimension: 'margin_floor' },
  { key: 'marginSharePercent', dimension: 'margin_share' },
]

const ACCOUNT_OWNERSHIP_CHOICES: AccountOwnership[] = ['ours', 'partner', 'shared']
const CONFIDENTIALITY_CHOICES: PartnerConfidentiality[] = ['public', 'restricted', 'confidential']

function textToState(fields: PartnerGovernanceFields): Record<TextField, string> {
  return Object.fromEntries(TEXT_FIELDS.map(f => [f.key, fields[f.key] ?? ''])) as Record<TextField, string>
}

function listToState(fields: PartnerGovernanceFields): Record<ListField, string> {
  return Object.fromEntries(LIST_FIELDS.map(f => [f.key, (fields[f.key] ?? []).join(', ')])) as Record<
    ListField,
    string
  >
}

function numberToState(fields: PartnerGovernanceFields): Record<NumberField, string> {
  return Object.fromEntries(
    NUMBER_FIELDS.map(f => [f.key, fields[f.key] === null ? '' : String(fields[f.key])]),
  ) as Record<NumberField, string>
}

/**
 * #3270 (reste, épopée de fin de lot) — LE FORMULAIRE D'ÉDITION DES 17 CHAMPS
 * DU CADRE PARTENAIRE. `PATCH /partners/:id/governance` les acceptait déjà ;
 * l'écran ne posait encore aucun champ, seulement la lecture (badge, ce qui
 * manque, prochaine validation — `PartnerReadinessPanel`).
 *
 * UN formulaire générique (doctrine c75, #1950.15 : « un formulaire
 * générique, pas treize dédiés ») — pas dix-sept mini-dialogues dédiés, un
 * pour chaque dimension. Chaque libellé RÉUTILISE `governance.dimension.*`
 * (GA-26 : un réglage vit à un seul endroit) plutôt que de dupliquer le texte
 * déjà écrit pour `PartnerReadinessPanel`.
 *
 * `non_circumvention` (18ᵉ dimension) N'EST PAS ici : elle réutilise déjà
 * `nonSolicitation`, posée par son propre geste sur la carte (`clause.*`) —
 * un réglage, un seul endroit, jamais un second champ pour le même fait.
 */
export function PartnerGovernanceEditDialog({
  open,
  onOpenChange,
  partnerName,
  fields,
  busy,
  onSave,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  partnerName: string
  fields: PartnerGovernanceFields
  busy: boolean
  onSave: (patch: UpdatePartnerGovernance) => void
}) {
  const { t } = useTranslation('partnerPipeline')
  const [text, setText] = useState<Record<TextField, string>>(() => textToState(fields))
  const [lists, setLists] = useState<Record<ListField, string>>(() => listToState(fields))
  const [numbers, setNumbers] = useState<Record<NumberField, string>>(() => numberToState(fields))
  const [accountOwnership, setAccountOwnership] = useState(fields.accountOwnership ?? NOT_SET)
  const [actionOwnership, setActionOwnership] = useState(fields.actionOwnership ?? NOT_SET)
  const [confidentialityLevel, setConfidentialityLevel] = useState(fields.confidentialityLevel ?? NOT_SET)

  const reset = () => {
    setText(textToState(fields))
    setLists(listToState(fields))
    setNumbers(numberToState(fields))
    setAccountOwnership(fields.accountOwnership ?? NOT_SET)
    setActionOwnership(fields.actionOwnership ?? NOT_SET)
    setConfidentialityLevel(fields.confidentialityLevel ?? NOT_SET)
  }

  const submit = () => {
    const patch: UpdatePartnerGovernance = {
      accountOwnership: accountOwnership === NOT_SET ? null : (accountOwnership as AccountOwnership),
      actionOwnership: actionOwnership === NOT_SET ? null : (actionOwnership as AccountOwnership),
      confidentialityLevel: confidentialityLevel === NOT_SET ? null : (confidentialityLevel as PartnerConfidentiality),
    }
    for (const { key } of TEXT_FIELDS) {
      const value = text[key].trim()
      patch[key] = value.length > 0 ? value : null
    }
    for (const { key } of LIST_FIELDS) {
      const values = lists[key]
        .split(',')
        .map(item => item.trim())
        .filter(item => item.length > 0)
      patch[key] = values.length > 0 ? values : null
    }
    for (const { key } of NUMBER_FIELDS) {
      const raw = numbers[key].trim()
      patch[key] = raw.length > 0 && !Number.isNaN(Number(raw)) ? Number(raw) : null
    }
    onSave(patch)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={next => {
        if (!next) reset()
        onOpenChange(next)
      }}
    >
      <DialogContent closeLabel={t('common:actions.close')} className="max-h-[85dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('governance.edit.title', { name: partnerName })}</DialogTitle>
          <DialogDescription>{t('governance.edit.description')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {TEXT_FIELDS.map(({ key, dimension }) => (
            <div key={key}>
              <Text size="xs" className="mb-1 block text-[var(--bellum-text-muted)]">
                {t(`governance.dimension.${dimension}`)}
              </Text>
              <Textarea
                value={text[key]}
                maxLength={1000}
                rows={2}
                aria-label={t(`governance.dimension.${dimension}`)}
                onChange={event => setText(previous => ({ ...previous, [key]: event.target.value }))}
              />
            </div>
          ))}

          <div>
            <Text size="xs" className="mb-1 block text-[var(--bellum-text-muted)]">
              {t('governance.dimension.counterpart_contacts')}
            </Text>
            <div className="flex flex-col gap-1.5 sm:flex-row">
              <input
                type="text"
                value={text.ourContactName}
                placeholder={t('governance.edit.ourContactNamePlaceholder')}
                aria-label={t('governance.edit.ourContactName')}
                onChange={event => setText(previous => ({ ...previous, ourContactName: event.target.value }))}
                className="h-9 w-full rounded-md border border-[var(--bellum-border)] bg-transparent px-2 text-sm"
              />
              <input
                type="email"
                value={text.ourContactEmail}
                placeholder={t('governance.edit.ourContactEmailPlaceholder')}
                aria-label={t('governance.edit.ourContactEmail')}
                onChange={event => setText(previous => ({ ...previous, ourContactEmail: event.target.value }))}
                className="h-9 w-full rounded-md border border-[var(--bellum-border)] bg-transparent px-2 text-sm"
              />
            </div>
          </div>

          {LIST_FIELDS.map(({ key, dimension }) => (
            <div key={key}>
              <Text size="xs" className="mb-1 block text-[var(--bellum-text-muted)]">
                {t(`governance.dimension.${dimension}`)}
              </Text>
              <input
                type="text"
                value={lists[key]}
                placeholder={t('governance.edit.listPlaceholder')}
                aria-label={t(`governance.dimension.${dimension}`)}
                onChange={event => setLists(previous => ({ ...previous, [key]: event.target.value }))}
                className="h-9 w-full rounded-md border border-[var(--bellum-border)] bg-transparent px-2 text-sm"
              />
            </div>
          ))}

          {NUMBER_FIELDS.map(({ key, dimension }) => (
            <div key={key}>
              <Text size="xs" className="mb-1 block text-[var(--bellum-text-muted)]">
                {t(`governance.dimension.${dimension}`)}
              </Text>
              <input
                type="number"
                min={0}
                max={100}
                value={numbers[key]}
                aria-label={t(`governance.dimension.${dimension}`)}
                onChange={event => setNumbers(previous => ({ ...previous, [key]: event.target.value }))}
                className="h-9 w-full rounded-md border border-[var(--bellum-border)] bg-transparent px-2 text-sm"
              />
            </div>
          ))}

          <div>
            <Text size="xs" className="mb-1 block text-[var(--bellum-text-muted)]">
              {t('governance.dimension.account_ownership')}
            </Text>
            <Select value={accountOwnership} onValueChange={setAccountOwnership}>
              <SelectTrigger aria-label={t('governance.dimension.account_ownership')} className="h-9 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NOT_SET}>{t('governance.edit.notSet')}</SelectItem>
                {ACCOUNT_OWNERSHIP_CHOICES.map(choice => (
                  <SelectItem key={choice} value={choice}>
                    {t(`governance.edit.ownership.${choice}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Text size="xs" className="mb-1 block text-[var(--bellum-text-muted)]">
              {t('governance.dimension.action_ownership')}
            </Text>
            <Select value={actionOwnership} onValueChange={setActionOwnership}>
              <SelectTrigger aria-label={t('governance.dimension.action_ownership')} className="h-9 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NOT_SET}>{t('governance.edit.notSet')}</SelectItem>
                {ACCOUNT_OWNERSHIP_CHOICES.map(choice => (
                  <SelectItem key={choice} value={choice}>
                    {t(`governance.edit.ownership.${choice}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Text size="xs" className="mb-1 block text-[var(--bellum-text-muted)]">
              {t('governance.dimension.confidentiality')}
            </Text>
            <Select value={confidentialityLevel} onValueChange={setConfidentialityLevel}>
              <SelectTrigger aria-label={t('governance.dimension.confidentiality')} className="h-9 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NOT_SET}>{t('governance.edit.notSet')}</SelectItem>
                {CONFIDENTIALITY_CHOICES.map(choice => (
                  <SelectItem key={choice} value={choice}>
                    {t(`governance.edit.confidentiality.${choice}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {t('governance.edit.cancel')}
          </Button>
          <Button type="button" disabled={busy} onClick={submit}>
            {t('governance.edit.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
